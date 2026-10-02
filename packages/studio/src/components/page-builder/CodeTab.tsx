/**
 * 左栏「代码」页签 — E2-5 对齐飞书 aPaaS 代码资产入口。
 *
 * - 全局样式 / 全局 JS：直接编辑 schema.globalCss / schema.globalJs
 *   （与顶栏「全局代码」弹窗同源，patchSchema 写入，500ms 防抖合并撤销记录）
 * - 页面 Schema：只读 JSON 预览 + 复制 + 下载 .json
 * - amis 方言（R1.7 兜底）：粘贴/编辑 amis JSON → 结构预检 → 保存写回
 *   （服务端 update 路径过 G3 硬闸）→ runtime 预览链接
 * - 页面 JS 方法：引导至事件动作「执行页面脚本」
 */

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Input, Typography, message } from 'antd';
import { CopyOutlined, DownloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { isAmisPage } from '@apaas/shared';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';

const { Text } = Typography;

export default function CodeTab() {
  const schema = usePageBuilderStore((s) => s.schema);
  const patchSchema = usePageBuilderStore((s) => s.patchSchema);
  const pageName = usePageBuilderStore((s) => s.currentPage?.name) || 'page';
  const pageMeta = usePageBuilderStore((s) => s.currentPage);
  const currentDialect = isAmisPage(schema) ? 'amis' : 'v1';

  const [cssDraft, setCssDraft] = useState(schema?.globalCss ?? '');
  const [jsDraft, setJsDraft] = useState(schema?.globalJs ?? '');
  const [amisDraft, setAmisDraft] = useState('');
  const [amisError, setAmisError] = useState<string | null>(null);
  const timers = useRef<{
    css?: ReturnType<typeof setTimeout>;
    js?: ReturnType<typeof setTimeout>;
  }>({});
  useEffect(() => {
    const t = timers.current;
    return () => {
      if (t.css) clearTimeout(t.css);
      if (t.js) clearTimeout(t.js);
    };
  }, []);

  /** 防抖间隔（ms）：合并连续键入，避免撤销栈被逐字符记录污染。 */
  const CODE_EDIT_DEBOUNCE_MS = 500;
  const patchGlobal = (field: 'globalCss' | 'globalJs', value: string) => {
    const key = field === 'globalCss' ? 'css' : 'js';
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => {
      patchSchema({ [field]: value });
    }, CODE_EDIT_DEBOUNCE_MS);
  };

  const schemaJson = schema ? JSON.stringify(schema, null, 2) : '';

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(schemaJson);
      void message.success('已复制页面 Schema');
    } catch {
      message.error('复制失败');
    }
  };

  const downloadJson = () => {
    const blob = new Blob([schemaJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pageName}.schema.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** amis 结构轻预检（完整 G3 合同在服务端 update 硬闸）。 */
  const validateAmisDraft = ():
    { ok: true; parsed: Record<string, unknown> } | { ok: false; error: string } => {
    try {
      const parsed = JSON.parse(amisDraft) as Record<string, unknown>;
      if (!isAmisPage(parsed)) return { ok: false, error: '根节点必须是 {"type":"page", ...}' };
      if (!Array.isArray(parsed['body'])) return { ok: false, error: '缺少 body 数组' };
      const text = JSON.stringify(parsed);
      if (/^https?:\/\//i.test(text)) {
        // 快速外联提示（完整外联校验由服务端 G3 承担）
        const m = text.match(/https?:\/\/[^"']+/);
        return {
          ok: false,
          error: `api.url 必须为平台相对路径，发现外联: ${m?.[0]?.slice(0, 60)}`,
        };
      }
      return { ok: true, parsed };
    } catch (err) {
      return { ok: false, error: `JSON 解析失败: ${(err as Error).message}` };
    }
  };

  const saveAmis = () => {
    const result = validateAmisDraft();
    if (!result.ok) {
      setAmisError(result.error);
      return;
    }
    setAmisError(null);
    // 整体替换 schema 为 amis 方言（v1 字段不保留——v2 能力口径 = amis 原生）
    patchSchema(result.parsed as never);
    void message.success('已切换为 amis 方言（保存页面后生效，服务端过 G3 校验）');
  };

  const runtimePreviewUrl =
    pageMeta && currentDialect === 'amis'
      ? `/app/${pageMeta.appId}/p/${pageMeta.apiName}?env=dev`
      : null;

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 12px', minHeight: 0 }}>
      {currentDialect === 'v1' && (
        <>
          <Section title="全局样式（CSS）">
            <Input.TextArea
              value={cssDraft}
              onChange={(e) => {
                setCssDraft(e.target.value);
              }}
              placeholder="/* 预览与运行时页面注入 */"
              autoSize={{ minRows: 4, maxRows: 12 }}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Section>

          <Section title="全局 JS（页面挂载后执行一次）">
            <Input.TextArea
              value={jsDraft}
              onChange={(e) => {
                setJsDraft(e.target.value);
                patchGlobal('globalJs', e.target.value);
              }}
              placeholder="// 如：vm.title = 'hello'"
              autoSize={{ minRows: 4, maxRows: 12 }}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Section>

          <Section title="页面 JS 方法">
            <Text type="secondary" style={{ fontSize: 12 }}>
              在组件事件动作中选择「执行页面脚本」编写页面级 JS。
            </Text>
          </Section>
        </>
      )}

      <Section
        title={`页面 Schema（${currentDialect === 'amis' ? 'amis 方言 v2' : 'v1 方言，只读'}）`}
        extra={
          <Button.Group size="small">
            <Button
              size="small"
              type="text"
              icon={<CopyOutlined />}
              onClick={() => void copyJson()}
            />
            <Button size="small" type="text" icon={<DownloadOutlined />} onClick={downloadJson} />
          </Button.Group>
        }
      >
        <pre
          style={{
            margin: 0,
            padding: 8,
            background: '#f7f8fa',
            borderRadius: 6,
            fontSize: 11,
            lineHeight: '18px',
            fontFamily: 'monospace',
            maxHeight: 280,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {schemaJson || '/* 页面加载后展示 */'}
        </pre>
      </Section>

      <Section title="amis 方言编辑（R1.7 兜底）">
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
          粘贴 amis JSON 整体替换页面（服务端过 G3 校验硬闸）。能力口径 = amis 原生。
        </Text>
        <Input.TextArea
          value={amisDraft}
          onChange={(e) => {
            setAmisDraft(e.target.value);
            setAmisError(null);
          }}
          placeholder={'{\n  "type": "page",\n  "title": "我的页面",\n  "body": [ ... ]\n}'}
          autoSize={{ minRows: 8, maxRows: 18 }}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
        {amisError && <Alert type="error" message={amisError} style={{ marginTop: 6 }} showIcon />}
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <Button size="small" icon={<ThunderboltOutlined />} onClick={saveAmis}>
            校验并替换 Schema
          </Button>
          {runtimePreviewUrl && (
            <Button size="small" type="link" href={runtimePreviewUrl} target="_blank">
              runtime 预览 ↗
            </Button>
          )}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
          padding: '4px 4px',
        }}
      >
        <Text strong style={{ fontSize: 12 }}>
          {open ? '▾' : '▸'} {title}
        </Text>
        {extra}
      </div>
      {open && <div style={{ padding: '2px 4px 4px' }}>{children}</div>}
    </div>
  );
}
