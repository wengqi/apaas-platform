/**
 * amis-editor 内层包装 — 命名导入 Editor 并转默认导出（供 React.lazy 消费）。
 *
 * 注意：amis-editor 通过 `export * from 'amis-editor-core'` 转发命名导出，
 * 不转发 default，因此必须 `import { Editor }` 而非默认导入。
 */

import { useEffect, useRef } from 'react';
import type { ComponentProps } from 'react';
import { Editor, FormPlugin } from 'amis-editor';
import ApaasFormPlugin from './ApaasFormPlugin.js';

type EditorProps = ComponentProps<typeof Editor>;

/** 顶栏撤销/重做按钮所需的最小实例句柄（Editor class 组件）。 */
export interface EditorHandle {
  undo(): void;
  redo(): void;
  store: { canUndo: boolean; canRedo: boolean };
}

interface AmisEditorInnerProps {
  value: Record<string, unknown>;
  onChange: (schema: Record<string, unknown>) => void;
  /** Editor 实例就绪后回调一次（撤销/重做按钮桥接用）。 */
  onEditorReady?: (editor: EditorHandle) => void;
}

export default function AmisEditorInner({ value, onChange, onEditorReady }: AmisEditorInnerProps) {
  const editorRef = useRef<EditorHandle | null>(null);
  useEffect(() => {
    if (editorRef.current && onEditorReady) onEditorReady(editorRef.current);
    // 仅挂载时回调一次；onEditorReady 由父层用 useCallback 稳定
  }, [onEditorReady]);
  const editorProps = {
    value: value as EditorProps['value'],
    onChange: ((schema: unknown) =>
      onChange(schema as Record<string, unknown>)) as EditorProps['onChange'],
    theme: 'antd' as const,
    ref: editorRef as never,
    // 平台自定义插件：禁用内置 FormPlugin，由平台子类接管 form 节点，
    // 为原生「字段名」选择器（感叹号弹窗）提供对象字段数据源（分组+搜索）。
    // 精确按构造器匹配，避免误伤子类自身。
    disablePluginList: ((_id: string, plugin: unknown) => {
      return plugin === FormPlugin || (plugin as object)?.constructor === FormPlugin;
    }) as EditorProps['disablePluginList'],
    plugins: [ApaasFormPlugin] as EditorProps['plugins'],
    // 编辑器文案本地化不在本 prop（i18n-runtime 读 localStorage，
    // 见 AmisEditorCanvas 顶部的 suda-i18n-locale 钉死逻辑）
  };
  return <Editor {...editorProps} />;
}
