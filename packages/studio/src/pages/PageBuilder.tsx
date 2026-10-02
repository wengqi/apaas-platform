import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Drawer, Input, Space, Tooltip, Typography, message } from 'antd';
import { CodeOutlined, ReloadOutlined, SaveOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { isAmisPage } from '@apaas/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { pagesApi } from '../api/pages.js';
import AmisEditorCanvas from '../components/page-builder/AmisEditorCanvas.js';

const { Text } = Typography;

/** 代码抽屉 JSON 轻预检（完整 G3 合同在服务端 update 硬闸）。 */
function validateAmisJson(
  text: string,
): { ok: true; parsed: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!isAmisPage(parsed)) return { ok: false, error: '根节点必须是 {"type":"page", ...}' };
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
  const { pageId } = useParams<{ appId: string; pageId: string }>();
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

  const {
    data: page,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: qk.page(pageId!),
    queryFn: () => pagesApi.get(pageId as string),
    enabled: !!pageId,
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

  // 评审 P1-2 沿革：加载失败显式暴露，绝不静默回退空 Schema（防覆盖线上内容）
  const saveMutation = useMutation({
    mutationFn: (next: Record<string, unknown>) =>
      pagesApi.update(page!.id, {
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
  if (page && schema && !isAmisPage(schema)) {
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
  const runtimePreviewUrl = page && schema ? `/app/${page.appId}/p/${page.slug}?env=dev` : null;

  return (
    <div
      style={{
        height: 'calc(100vh - 56px)',
        display: 'flex',
        flexDirection: 'column',
        background: '#eff1f3',
      }}
    >
      {/* 顶栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 16px',
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
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
          <Tooltip title="从服务端重新加载（放弃本地修改）">
            <Button
              size="small"
              icon={<ReloadOutlined />}
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
          <Button size="small" icon={<CodeOutlined />} onClick={openCode}>
            代码
          </Button>
          {runtimePreviewUrl && (
            <Button size="small" type="link" href={runtimePreviewUrl} target="_blank">
              runtime 预览 ↗
            </Button>
          )}
          <Button
            size="small"
            type="primary"
            icon={<SaveOutlined />}
            disabled={!dirty || saveMutation.isPending}
            loading={saveMutation.isPending}
            onClick={() => schema && saveMutation.mutate(schema)}
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
                return;
              }
              setDirty(JSON.stringify(next) !== savedJsonRef.current);
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
