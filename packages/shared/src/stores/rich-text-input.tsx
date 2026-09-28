/**
 * 富文本输入组件 — 页面模块对齐剩余事项①：contentEditable + 工具条。
 *
 * 零新依赖：格式化走 document.execCommand（deprecated 但全浏览器可用），
 * 输出经 DOMPurify 白名单净化后写回 vm。工具条：加粗/斜体/下划线/删除线/
 * 有序/无序列表/链接/清除格式。
 *
 * 非受控 contentEditable 模式：外部 value 仅在非本组件回声时写入 DOM
 * （echo ref 防光标跳动）；选中态高亮经 document selectionchange 事件驱动。
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';
import DOMPurify from 'dompurify';
import {
  BoldOutlined,
  ClearOutlined,
  ItalicOutlined,
  LinkOutlined,
  OrderedListOutlined,
  StrikethroughOutlined,
  UnderlineOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';

// ---------------------------------------------------------------------------
// 净化配置（纯数据，供守卫单测断言白名单不外泄）
// ---------------------------------------------------------------------------

/** 富文本允许的标签白名单：仅格式化语义标签，禁止样式/脚本/嵌入。 */
export const RICH_TEXT_ALLOWED_TAGS = [
  'p',
  'br',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'strike',
  'del',
  'ol',
  'ul',
  'li',
  'a',
  'div',
  'span',
] as const;

/** 富文本允许的属性白名单：仅链接所需。 */
export const RICH_TEXT_ALLOWED_ATTRS = ['href', 'target'] as const;

/** 用白名单净化富文本 HTML（输出可直接写回 vm / 注入 DOM）。 */
export function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...RICH_TEXT_ALLOWED_TAGS],
    ALLOWED_ATTR: [...RICH_TEXT_ALLOWED_ATTRS],
  });
}

// ---------------------------------------------------------------------------
// 工具条命令表
// ---------------------------------------------------------------------------

interface ToolbarItem {
  /** execCommand 命令名；'createLink' / 'removeFormat' 走特殊处理。 */
  command: string;
  title: string;
  icon: ReactElement;
}

export const RICH_TEXT_TOOLBAR: ToolbarItem[] = [
  { command: 'bold', title: '加粗', icon: <BoldOutlined /> },
  { command: 'italic', title: '斜体', icon: <ItalicOutlined /> },
  { command: 'underline', title: '下划线', icon: <UnderlineOutlined /> },
  { command: 'strikeThrough', title: '删除线', icon: <StrikethroughOutlined /> },
  { command: 'insertUnorderedList', title: '无序列表', icon: <UnorderedListOutlined /> },
  { command: 'insertOrderedList', title: '有序列表', icon: <OrderedListOutlined /> },
  { command: 'createLink', title: '插入链接', icon: <LinkOutlined /> },
  { command: 'removeFormat', title: '清除格式', icon: <ClearOutlined /> },
];

/** 选中态高亮跟踪的命令集合。 */
const ACTIVE_STATE_COMMANDS = [
  'bold',
  'italic',
  'underline',
  'strikeThrough',
  'insertUnorderedList',
  'insertOrderedList',
] as const;

// ---------------------------------------------------------------------------

interface RichTextInputProps {
  /** HTML 字符串（受控值；外部变更写入 DOM，本组件输入触发的回声不回写）。 */
  value?: string;
  /** 内容变化回调（参数为净化后的 HTML）。 */
  onChange?: (html: string) => void;
  placeholder?: string;
  /** 最小高度（px），由 rows prop 换算。 */
  minHeight?: number;
  /** false 时只读（编辑画布/禁用态），工具条置灰。 */
  editable?: boolean;
}

export function RichTextInput({
  value,
  onChange,
  placeholder,
  minHeight = 132,
  editable = true,
}: RichTextInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  // 最近一次本组件 emit 的 HTML；外部 value 与之相等视为回声，不回写 DOM
  const echoRef = useRef<string | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});

  // 外部 value 变更 → 写入 DOM（跳过自身回声，避免打字时光标重置）
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (echoRef.current !== null) {
      const isEcho = value === echoRef.current;
      echoRef.current = null;
      if (isEcho) return;
    }
    const next = sanitizeRichText(value ?? '');
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [value]);

  // 选中态高亮：selectionchange 事件驱动（无轮询），仅当选区位于编辑器内时刷新
  useEffect(() => {
    if (!editable) return;
    const handler = () => {
      const el = editorRef.current;
      const sel = document.getSelection();
      if (!el || !sel || !el.contains(sel.anchorNode)) return;
      const next: Record<string, boolean> = {};
      for (const command of ACTIVE_STATE_COMMANDS) {
        next[command] = document.queryCommandState(command);
      }
      setActive(next);
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [editable]);

  const emitChange = () => {
    const el = editorRef.current;
    if (!el) return;
    const html = sanitizeRichText(el.innerHTML);
    echoRef.current = html;
    onChange?.(html);
  };

  const exec = (command: string) => {
    if (!editable) return;
    document.execCommand('styleWithCSS', false, 'false');
    if (command === 'createLink') {
      const url = window.prompt('输入链接地址', 'https://');
      if (!url) return;
      const collapsed = document.getSelection()?.isCollapsed ?? false;
      if (collapsed) {
        document.execCommand(
          'insertHTML',
          false,
          `<a href="${url.replace(/"/g, '&quot;')}" target="_blank">${url}</a>`,
        );
      } else {
        document.execCommand('createLink', false, url);
      }
    } else if (command === 'removeFormat') {
      document.execCommand('removeFormat', false);
      document.execCommand('unlink', false);
    } else {
      document.execCommand(command, false);
    }
    emitChange();
  };

  return (
    <div
      className="apaas-richtext"
      style={{
        border: '1px solid #d9d9d9',
        borderRadius: 4,
        background: editable ? '#fff' : '#f5f5f5',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
          padding: '2px 6px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fafafa',
          borderRadius: '4px 4px 0 0',
          opacity: editable ? 1 : 0.5,
          pointerEvents: editable ? 'auto' : 'none',
        }}
      >
        {RICH_TEXT_TOOLBAR.map((item, i) => (
          <span key={item.command} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {(i === 4 || i === 7) && (
              <span style={{ width: 1, height: 14, background: '#e8e8e8', margin: '0 4px' }} />
            )}
            <button
              type="button"
              title={item.title}
              aria-label={item.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec(item.command)}
              style={{
                border: 'none',
                background: active[item.command] ? '#e6f4ff' : 'transparent',
                color: active[item.command] ? '#1677ff' : 'rgba(0,0,0,0.65)',
                cursor: 'pointer',
                fontSize: 13,
                lineHeight: 1,
                padding: '4px 5px',
                borderRadius: 3,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {item.icon}
            </button>
          </span>
        ))}
      </div>
      <div
        ref={editorRef}
        contentEditable={editable}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emitChange}
        onBlur={emitChange}
        style={{
          minHeight,
          padding: '6px 8px',
          fontSize: 13,
          lineHeight: '22px',
          outline: 'none',
          wordBreak: 'break-word',
          cursor: editable ? 'text' : 'default',
        }}
      />
      <style>{`.apaas-richtext [contenteditable]:empty::before{content:attr(data-placeholder);color:rgba(0,0,0,0.25);pointer-events:none;}`}</style>
    </div>
  );
}
