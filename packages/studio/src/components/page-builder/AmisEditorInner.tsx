/**
 * amis-editor 内层包装 — 命名导入 Editor 并转默认导出（供 React.lazy 消费）。
 *
 * 注意：amis-editor 通过 `export * from 'amis-editor-core'` 转发命名导出，
 * 不转发 default，因此必须 `import { Editor }` 而非默认导入。
 */

import type { ComponentProps } from 'react';
import { Editor, FormPlugin } from 'amis-editor';
import ApaasFormPlugin from './ApaasFormPlugin.js';

type EditorProps = ComponentProps<typeof Editor>;

interface AmisEditorInnerProps {
  value: Record<string, unknown>;
  onChange: (schema: Record<string, unknown>) => void;
}

export default function AmisEditorInner({ value, onChange }: AmisEditorInnerProps) {
  const editorProps = {
    value: value as EditorProps['value'],
    onChange: ((schema: unknown) =>
      onChange(schema as Record<string, unknown>)) as EditorProps['onChange'],
    theme: 'antd' as const,
    // 字段绑定专项（2026-10-07）：禁用内置 FormPlugin，由平台子类接管 form 节点，
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
