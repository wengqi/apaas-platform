import { TOKENS as T } from '@apaas/shared/design';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Drawer, Input, Modal, Space, Tooltip, Typography, message } from 'antd';
import {
  CodeOutlined,
  ReloadOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  UndoOutlined,
  RedoOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { pagesApi } from '../api/pages.js';
import { objectsApi } from '../api/objects.js';
import AmisEditorCanvas from '../components/page-builder/AmisEditorCanvas.js';
import type { EditorHandle } from '../components/page-builder/AmisEditorInner.js';
import {
  setBoundObjectObjects,
  clearBoundObjectObjects,
  getBoundObjectSnapshot,
  type BoundObjectField,
} from '../components/page-builder/field-binding-store.js';
import { collectFieldBindingIssues, collectBoundObjectIds } from '../utils/page-binding.js';

const { Text } = Typography;

/** amis 页面轻判别（本地预检；权威判定在服务端 G3 amis_page 合同）。 */
function looksLikeAmisPage(schema: unknown): boolean {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    (schema as Record<string, unknown>)['type'] === 'page'
  );
}

/** 代码抽屉 JSON 轻预检（完整 G3 合同在服务端 update 硬闸）。 */
function validateAmisJson(
  text: string,
): { ok: true; parsed: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!looksLikeAmisPage(parsed))
      return { ok: false, error: '根节点必须是 {"type":"page", ...}' };
    if (!Array.isArray(parsed['body'])) return { ok: false, error: '缺少 body 数组' };
    const external = JSON.stringify(parsed).match(/https?:\/\/[^"']+/);
    if (external) {
      return {
        ok: false,
        error: `api.url 必须为平台相对路径，发现外联: ${external[0]?.slice(0, 60)}`,
      };
    }
    return { ok: true, parsed };
  } catch (err) {
    return { ok: false, error: `JSON 解析失败: ${(err as Error).message}` };
  }
}

/**
 * 页面搭建器 — amis-editor 单方言（R1.7 第二轮，删旧优先）。
 *
 * 路由: /app/:appId/pages/:pageId
 * 结构: 顶栏（页面名/脏态/保存/刷新/代码抽屉/运行时预览）+ amis-editor 画布。
 * v1 方言页面显式拦截（v1 渲染轨已物理下线，runtime 不再可渲染，见
 * docs/knowledge-base/DROP-LEGACY-RUNTIME-2026-10-02.md）。
 */
export default function PageBuilder() {
  const { appId, pageId } = useParams<{ appId: string; pageId: string }>();
  const queryClient = useQueryClient();

  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeDraft, setCodeDraft] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const loadedPageIdRef = useRef<string | null>(null);
  // 已加载 schema 的序列化基线——amis-editor 挂载时会规范化 schema 并触发 onChange，
  // 该初始化 diff 不构成脏态：首次 onChange 起 1s 窗口内的变更都视为编辑器规范化，
  // 基线随之刷新；窗口外的变更按内容比对计脏（事件驱动，无定时器）
  const savedJsonRef = useRef<string>('');
  const editorReadyAtRef = useRef(0);
  // 撤销/重做：编辑器实例句柄 + 可用态（事件驱动刷新——onChange/undo/redo 后同步读
  // 编辑器 store 的 canUndo/canRedo，无轮询）
  const editorRef = useRef<EditorHandle | null>(null);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  // 预览模式：画布切预览渲染（当前设计的所见即所得，数据走真实平台 API）
  const [previewMode, setPreviewMode] = useState(false);
  const syncHistoryState = useCallback(() => {
    const store = editorRef.current?.store;
    if (store) setHistoryState({ canUndo: store.canUndo, canRedo: store.canRedo });
  }, []);
  const onEditorReady = useCallback(
    (editor: EditorHandle) => {
      editorRef.current = editor;
      syncHistoryState();
    },
    [syncHistoryState],
  );
  const handleUndo = useCallback(() => {
    editorRef.current?.undo();
    syncHistoryState();
  }, [syncHistoryState]);
  const handleRedo = useCallback(() => {
    editorRef.current?.redo();
    syncHistoryState();
  }, [syncHistoryState]);

  const {
    data: page,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: qk.page(pageId!),
    queryFn: () => pagesApi.get(appId as string, pageId as string),
    enabled: !!appId && !!pageId,
    retry: 1,
  });

  // 页面加载成功 → 写入本地编辑态（仅 pageId 变化时覆盖，避免保存回写打架）
  useEffect(() => {
    if (page && page.id !== loadedPageIdRef.current) {
      loadedPageIdRef.current = page.id;
      const loaded = (page.schema ?? {}) as unknown as Record<string, unknown>;
      savedJsonRef.current = JSON.stringify(loaded);
      editorReadyAtRef.current = 0;
      setSchema(loaded);
      setDirty(false);
    }
  }, [page]);

  // 字段绑定专项（2026-10-07 v2 多表）：收集页面内全部绑定对象（每个 form 优先解析
  // 自身 api.url，页面级 data.objectId 兜底），经 React Query 治理键 qk.object 拉取
  // （queryClient.fetchQuery 复用缓存），写入 field-binding-store 供编辑器插件
  // （原生字段名选择器）与保存校验同步消费
  // 按内容键稳定化：schema 每次编辑都换引用，直接 useMemo 返回新数组会让下游
  // effect 每次编辑都重跑；join 成 key 后内容不变则引用不变
  const boundObjectIdsKey = useMemo(() => collectBoundObjectIds(schema).join('|'), [schema]);
  const boundObjectIds = useMemo(
    () => (boundObjectIdsKey ? boundObjectIdsKey.split('|') : []),
    [boundObjectIdsKey],
  );

  useEffect(() => {
    if (boundObjectIds.length === 0) {
      clearBoundObjectObjects();
      return;
    }
    let cancelled = false;
    void (async () => {
      const objects: Record<string, BoundObjectField[]> = {};
      for (const objectId of boundObjectIds) {
        try {
          // fetchQuery 与 ObjectDesigner 等共用 qk.object 缓存键（staleTime 内不重复请求）
          const obj = await queryClient.fetchQuery({
            queryKey: qk.object(objectId),
            queryFn: () => objectsApi.get(objectId),
            staleTime: 5 * 60 * 1000,
          });
          objects[objectId] = (obj.fields ?? []).map((f) => ({
            apiName: f.apiName,
            label: f.label ?? f.apiName,
            type: f.type,
          }));
        } catch {
          // 拉取失败（权限/网络）：保留空列表显式化，选择器提示"字段加载失败"
          objects[objectId] = [];
        }
      }
      if (!cancelled) setBoundObjectObjects(objects);
    })();
    return () => {
      cancelled = true;
    };
  }, [boundObjectIds, queryClient]);

  // 评审 P1-2 沿革：加载失败显式暴露，绝不静默回退空 Schema（防覆盖线上内容）
  const saveMutation = useMutation({
    mutationFn: (next: Record<string, unknown>) =>
      pagesApi.update(page!.appId, page!.id, {
        name: page!.name,
        schema: next as never,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.page(page!.id), updated);
      savedJsonRef.current = JSON.stringify(updated.schema ?? {});
      setDirty(false);
      void message.success('页面已保存（服务端过 G3 校验）');
    },
    onError: (err) => {
      const axErr = err as { response?: { data?: { error?: { message?: string } } } };
      message.error(axErr.response?.data?.error?.message ?? '保存失败，请重试');
    },
  });

  if (!pageId) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Text type="secondary">缺少页面 ID</Text>
      </div>
    );
  }

  if (isLoading && !schema) {
    return <div style={{ padding: 24 }}>页面加载中…</div>;
  }

  if (isError) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Text type="danger" style={{ display: 'block', marginBottom: 12 }}>
          页面加载失败，为避免覆盖线上内容，编辑器已停止加载。
        </Text>
        <Button onClick={() => void refetch()}>重新加载</Button>
      </div>
    );
  }

  // v1 方言拦截：v1 渲染轨已下线，允许编辑只会产出不可渲染的页面
  if (page && schema && !looksLikeAmisPage(schema)) {
    return (
      <div style={{ padding: 48, maxWidth: 560, margin: '0 auto' }}>
        <Alert
          type="warning"
          showIcon
          message="该页面为 v1 方言，不再支持编辑"
          description={
            <>
              页面层已统一为 amis 单方言（ADR-0003），v1 渲染器已物理下线，v1 页面在运行时
              不可渲染。请新建 amis 页面替代；存量 v1 页面如需保留内容，可联系管理员在数据库
              层面归档。
            </>
          }
        />
      </div>
    );
  }

  // 保存前绑定校验（字段绑定专项 v2 多表）：各 form 控件 name 未命中所属对象字段 → 告警可强制保存
  const handleSave = () => {
    if (!schema) return;
    const snapshot = getBoundObjectSnapshot();
    const fieldsByObject = new Map(
      Object.entries(snapshot.objects).map(([objectId, fields]) => [
        objectId,
        new Map(fields.map((f) => [f.apiName, f.type])),
      ]),
    );
    const issues = fieldsByObject.size > 0 ? collectFieldBindingIssues(schema, fieldsByObject) : [];
    if (issues.length === 0) {
      saveMutation.mutate(schema);
      return;
    }
    const unknownCount = issues.filter((it) => it.kind === 'unknown_field').length;
    const mismatchCount = issues.length - unknownCount;
    Modal.confirm({
      title: `${issues.length} 个控件与对象字段不匹配`,
      width: 560,
      content: (
        <div style={{ maxHeight: 320, overflow: 'auto' }}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            未匹配字段（{unknownCount}）的值提交时将以未知键原样存入记录、不落入任何字段
            （服务端不拒绝未知键）；类型不兼容（{mismatchCount}）的值形状或格式与字段定义
            错配。建议在「字段名」选择器中改选兼容字段。
          </Text>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {issues.slice(0, 20).map((it) => (
              <li key={`${it.path}-${it.name}-${it.kind}`} style={{ marginBottom: 4 }}>
                <Text type={it.kind === 'type_mismatch' ? 'warning' : undefined} code>
                  {it.kind === 'type_mismatch' ? '类型不兼容' : '未匹配字段'}
                </Text>{' '}
                <Text code>{it.name}</Text>
                {it.label ? `（${it.label}）` : ''}
                {it.type ? ` · 控件 ${it.type}` : ''}
                {it.kind === 'type_mismatch' && it.fieldType ? ` ↔ 字段 ${it.fieldType}` : ''}
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {it.path}
                </Text>
              </li>
            ))}
          </ul>
          {issues.length > 20 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              …其余 {issues.length - 20} 项略
            </Text>
          )}
        </div>
      ),
      okText: '仍要保存',
      okButtonProps: { danger: true },
      cancelText: '返回修改',
      onOk: () => {
        saveMutation.mutate(schema);
      },
    });
  };

  const openCode = () => {
    setCodeDraft(schema ? JSON.stringify(schema, null, 2) : '');
    setCodeError(null);
    setCodeOpen(true);
  };

  const applyCode = () => {
    const result = validateAmisJson(codeDraft);
    if (!result.ok) {
      setCodeError(result.error);
      return;
    }
    setSchema(result.parsed);
    setDirty(JSON.stringify(result.parsed) !== savedJsonRef.current);
    setCodeOpen(false);
    void message.success('Schema 已替换，点击保存生效');
  };

  // wire 字段为 slug（apiName 为 v1 遗留类型字段，值 undefined）
  // 交互评审（2026-10-04）修复：此前为相对路径，target=_blank 会在 studio 域上打开
  // /app/:appId/p/:slug（studio 无此路由）→ 路由兜底静默跳回应用列表。运行时前端
  // 是独立部署（dev 为 :5174），必须用运行时源前缀；生产单域部署回退同源。
  const runtimeBase = (import.meta.env.VITE_RUNTIME_BASE_URL as string | undefined) ?? '';
  const runtimePreviewUrl =
    page && schema ? `${runtimeBase}/app/${page.appId}/p/${page.slug}?env=dev` : null;

  return (
    <div
      style={{
        height: 'calc(100vh - 56px)',
        display: 'flex',
        flexDirection: 'column',
        background: T.colorFillTertiary,
      }}
    >
      {/* 顶栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 16px',
          background: T.colorWhite,
          borderBottom: `1px solid ${T.colorBorderSecondary}`,
        }}
      >
        <Space size={8}>
          <Text strong>{page?.name ?? '页面搭建'}</Text>
          {dirty && (
            <Text type="warning" style={{ fontSize: 12 }}>
              未保存
            </Text>
          )}
        </Space>
        <Space size={8}>
          <Tooltip
            title={
              previewMode
                ? '退出预览，返回编辑'
                : '预览当前设计的页面效果（含未保存修改，数据走真实接口）'
            }
          >
            <Button
              size="small"
              type={previewMode ? 'primary' : 'default'}
              icon={previewMode ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              onClick={() => setPreviewMode((v) => !v)}
            >
              {previewMode ? '退出预览' : '预览'}
            </Button>
          </Tooltip>
          <Tooltip title="从服务端重新加载（放弃本地修改）">
            <Button
              size="small"
              icon={<ReloadOutlined />}
              disabled={previewMode}
              onClick={() => {
                // 同步从缓存重置（refetch 结构共享返回同引用时 useEffect 不会触发）；
                // 再后台刷新拉取服务端最新（引用变化时经 useEffect 覆盖）
                const cached = queryClient.getQueryData<{ schema?: unknown; id: string }>(
                  qk.page(pageId!),
                );
                if (cached) {
                  const loaded = (cached.schema ?? {}) as unknown as Record<string, unknown>;
                  loadedPageIdRef.current = cached.id;
                  savedJsonRef.current = JSON.stringify(loaded);
                  editorReadyAtRef.current = 0;
                  setSchema(loaded);
                  setDirty(false);
                }
                void refetch();
              }}
            >
              重置
            </Button>
          </Tooltip>
          <Tooltip title="撤销（Ctrl+Z）">
            <Button
              size="small"
              icon={<UndoOutlined />}
              disabled={previewMode || !historyState.canUndo}
              onClick={handleUndo}
            />
          </Tooltip>
          <Tooltip title="重做（Ctrl+Y）">
            <Button
              size="small"
              icon={<RedoOutlined />}
              disabled={previewMode || !historyState.canRedo}
              onClick={handleRedo}
            />
          </Tooltip>
          <Button size="small" icon={<CodeOutlined />} onClick={openCode} disabled={previewMode}>
            代码
          </Button>
          {runtimePreviewUrl && (
            <Button
              size="small"
              type="link"
              href={runtimePreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              runtime 预览 ↗
            </Button>
          )}
          <Button
            size="small"
            type="primary"
            icon={<SaveOutlined />}
            disabled={previewMode || !dirty || saveMutation.isPending}
            loading={saveMutation.isPending}
            onClick={handleSave}
          >
            保存
          </Button>
        </Space>
      </div>

      {/* amis-editor 画布 */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {schema && (
          <AmisEditorCanvas
            value={schema}
            preview={previewMode}
            onPreview={setPreviewMode}
            onEditorReady={onEditorReady}
            onChange={(next) => {
              setSchema(next);
              const now = Date.now();
              if (editorReadyAtRef.current === 0) {
                editorReadyAtRef.current = now;
              }
              if (now - editorReadyAtRef.current <= 1000) {
                // 编辑器初始化规范化窗口：基线跟随，不计脏
                savedJsonRef.current = JSON.stringify(next);
                setDirty(false);
              } else {
                setDirty(JSON.stringify(next) !== savedJsonRef.current);
              }
              // 编辑/撤销/重做都会经 onChange：同步刷新顶栏按钮可用态
              syncHistoryState();
            }}
          />
        )}
      </div>

      {/* 代码抽屉（原 CodeTab 能力收编：JSON 查看/编辑 + 轻预检） */}
      <Drawer
        title="页面 Schema（amis JSON）"
        width={560}
        open={codeOpen}
        onClose={() => setCodeOpen(false)}
        extra={
          <Button size="small" icon={<ThunderboltOutlined />} onClick={applyCode}>
            校验并应用
          </Button>
        }
      >
        <Input.TextArea
          value={codeDraft}
          onChange={(e) => {
            setCodeDraft(e.target.value);
            setCodeError(null);
          }}
          autoSize={{ minRows: 24, maxRows: 32 }}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
        {codeError && <Alert type="error" message={codeError} style={{ marginTop: 8 }} showIcon />}
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          应用后需点击「保存」写回服务端（G3 校验硬闸）。能力口径 = amis 原生。
        </Text>
      </Drawer>
    </div>
  );
}
