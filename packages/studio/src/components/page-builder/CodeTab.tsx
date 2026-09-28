/**
 * 左栏「代码」页签 — E2-5 对齐飞书 aPaaS 代码资产入口。
 *
 * - 全局样式 / 全局 JS：直接编辑 schema.globalCss / schema.globalJs
 *   （与顶栏「全局代码」弹窗同源，patchSchema 写入，500ms 防抖合并撤销记录）
 * - 页面 Schema：只读 JSON 预览 + 复制 + 下载 .json
 * - 页面 JS 方法：引导至事件动作「执行页面脚本」
 */

import { useEffect, useRef, useState } from 'react';
import { Button, Input, Typography, message } from 'antd';
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';

const { Text } = Typography;

/** 防抖间隔（ms）：合并连续键入，避免撤销栈被逐字符记录污染。 */
const CODE_EDIT_DEBOUNCE_MS = 500;

export default function CodeTab() {
  const schema = usePageBuilderStore((s) => s.schema);
  const patchSchema = usePageBuilderStore((s) => s.patchSchema);
  const pageName = usePageBuilderStore((s) => s.currentPage?.name) || 'page';

  const [cssDraft, setCssDraft] = useState(schema?.globalCss ?? '');
  const [jsDraft, setJsDraft] = useState(schema?.globalJs ?? '');
  const timers = useRef<{
    css?: ReturnType<typeof setTimeout>;
    js?: ReturnType<typeof setTimeout>;
  }>({});
  // 卸载/重挂载时丢弃未落盘的定时器（防抖属允许的单次延迟例外）
  useEffect(() => {
    const t = timers.current;
    return () => {
      if (t.css) clearTimeout(t.css);
      if (t.js) clearTimeout(t.js);
    };
  }, []);

  const patchGlobal = (field: 'globalCss' | 'globalJs', value: string) => {
    if (timers.current[field === 'globalCss' ? 'css' : 'js']) {
      clearTimeout(timers.current[field === 'globalCss' ? 'css' : 'js']);
    }
    timers.current[field === 'globalCss' ? 'css' : 'js'] = setTimeout(() => {
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

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 12px', minHeight: 0 }}>
      <Section title="全局样式（CSS）">
        <Input.TextArea
          value={cssDraft}
          onChange={(e) => {
            setCssDraft(e.target.value);
            patchGlobal('globalCss', e.target.value);
          }}
          placeholder="/* 预览与运行时页面注入，如：.page-title { color: #1456f0; } */"
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

      <Section
        title="页面 Schema"
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
