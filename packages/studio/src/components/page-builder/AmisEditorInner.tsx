/**
 * amis-editor 内层包装 — 命名导入 Editor 并转默认导出（供 React.lazy 消费）。
 *
 * 注意：amis-editor 通过 `export * from 'amis-editor-core'` 转发命名导出，
 * 不转发 default，因此必须 `import { Editor }` 而非默认导入。
 */

import type { ComponentProps } from 'react';
import { Editor } from 'amis-editor';

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
    locale: 'zh-CN',
  };
  return <Editor {...editorProps} />;
}
