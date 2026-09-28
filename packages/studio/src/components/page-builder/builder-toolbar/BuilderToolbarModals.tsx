/**
 * 设计器工具栏弹窗 — 全局代码（CSS/JS）与多语文案。
 * 数据存入 PageSchema 顶层可选字段 globalCss/globalJs/i18n（可选，向后兼容）。
 */

import { useEffect, useState } from 'react';
import { Button, Input, Modal, Space, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { usePageBuilderStore } from '../../../stores/pageBuilder.js';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// 全局代码弹窗（对齐飞书「全局代码」）
// ---------------------------------------------------------------------------

export function GlobalCodeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const schema = usePageBuilderStore((s) => s.schema);
  const patchSchema = usePageBuilderStore((s) => s.patchSchema);
  const [css, setCss] = useState('');
  const [js, setJs] = useState('');

  useEffect(() => {
    if (open && schema) {
      setCss(typeof schema.globalCss === 'string' ? schema.globalCss : '');
      setJs(typeof schema.globalJs === 'string' ? schema.globalJs : '');
    }
  }, [open, schema]);

  const handleSave = () => {
    patchSchema({ globalCss: css || undefined, globalJs: js || undefined });
    onClose();
  };

  return (
    <Modal
      title="全局代码"
      open={open}
      onCancel={onClose}
      width={680}
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleSave}>
            保存
          </Button>
        </Space>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
        <div>
          <Text style={{ fontSize: 13 }}>全局 CSS</Text>
          <Input.TextArea
            rows={6}
            value={css}
            onChange={(e) => setCss(e.target.value)}
            placeholder="/* 预览与运行时页面注入，如：.page-title { color: #1456f0; } */"
            style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 4 }}
          />
        </div>
        <div>
          <Text style={{ fontSize: 13 }}>全局 JS（页面挂载后执行一次）</Text>
          <Input.TextArea
            rows={6}
            value={js}
            onChange={(e) => setJs(e.target.value)}
            placeholder="// 如：console.log('page loaded')"
            style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 4 }}
          />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// 多语弹窗（对齐飞书「多语」）：locale 列表 + key→文案 编辑
// ---------------------------------------------------------------------------

export function I18nModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const schema = usePageBuilderStore((s) => s.schema);
  const patchSchema = usePageBuilderStore((s) => s.patchSchema);
  const [locales, setLocales] = useState<string[]>(['zh-CN']);
  const [defaultLocale, setDefaultLocale] = useState('zh-CN');
  const [tables, setTables] = useState<Record<string, Record<string, string>>>({});
  const [newLocale, setNewLocale] = useState('');

  useEffect(() => {
    if (open && schema?.i18n) {
      setDefaultLocale(schema.i18n.defaultLocale ?? 'zh-CN');
      const names = Object.keys(schema.i18n.locales);
      setLocales(names.length ? names : ['zh-CN']);
      setTables(schema.i18n.locales);
    }
  }, [open, schema]);

  const addLocale = () => {
    const name = newLocale.trim();
    if (!name || locales.includes(name)) return;
    setLocales((l) => [...l, name]);
    setTables((t) => ({ ...t, [name]: {} }));
    setNewLocale('');
  };

  const setEntry = (locale: string, key: string, value: string) => {
    setTables((t) => ({
      ...t,
      [locale]: { ...(t[locale] ?? {}), [key]: value },
    }));
  };

  const handleSave = () => {
    patchSchema({
      i18n: {
        defaultLocale,
        locales: JSON.parse(JSON.stringify(tables)) as Record<string, Record<string, string>>,
      },
    });
    onClose();
  };

  const activeLocale = locales.includes(defaultLocale) ? defaultLocale : (locales[0] ?? 'zh-CN');
  const entries = Object.entries(tables[activeLocale ?? ''] ?? {});

  return (
    <Modal
      title="多语"
      open={open}
      onCancel={onClose}
      width={680}
      footer={
        <Button type="primary" onClick={handleSave}>
          保存
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
        <Space size={8} wrap>
          <Text style={{ fontSize: 13 }}>语言</Text>
          {locales.map((l) => (
            <Button
              key={l}
              size="small"
              type={l === activeLocale ? 'primary' : 'default'}
              onClick={() => setDefaultLocale(l)}
            >
              {l}
              {l === defaultLocale ? ' · 默认' : ''}
            </Button>
          ))}
          <Input
            size="small"
            placeholder="新增语言，如 en-US"
            value={newLocale}
            onChange={(e) => setNewLocale(e.target.value)}
            style={{ width: 160 }}
            onPressEnter={addLocale}
          />
          <Button size="small" icon={<PlusOutlined />} onClick={addLocale} />
        </Space>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Text style={{ fontSize: 13 }}>{`文案（${activeLocale}）`}</Text>
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setEntry(activeLocale, `key${entries.length + 1}`, '')}
            >
              添加文案
            </Button>
          </div>
          {entries.length === 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              暂无文案。文案可在页面脚本/表达式中按语言取值。
            </Text>
          )}
          {entries.map(([key, value]) => (
            <div
              key={key}
              style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}
            >
              <Input
                size="small"
                value={key}
                style={{ width: 160, fontFamily: 'monospace' }}
                onChange={(e) => {
                  const oldKey = key;
                  const next = { ...(tables[activeLocale] ?? {}) };
                  delete next[oldKey];
                  next[e.target.value] = value;
                  setTables((t) => ({ ...t, [activeLocale]: next }));
                }}
              />
              <Input
                size="small"
                value={value}
                onChange={(e) => setEntry(activeLocale, key, e.target.value)}
              />
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => {
                  const next = { ...(tables[activeLocale] ?? {}) };
                  delete next[key];
                  setTables((t) => ({ ...t, [activeLocale]: next }));
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
