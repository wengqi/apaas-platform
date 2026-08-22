/**
 * Monaco 代码编辑器 — 云函数代码编辑。
 *
 * 支持 JavaScript 语法高亮 + 智能提示，Ctrl+S 保存。
 */

import { useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';

export const DEFAULT_CODE = `async function handler(input, context) {
  context.log('Hello from cloud function!');
  return { message: 'success', input };
}`;

interface Props {
  value?: string;
  onChange?: (value: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
}

export default function CloudFunctionEditor({ value, onChange, onSave, readOnly }: Props) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Ctrl+S 保存
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.();
    });
  };

  return (
    <Editor
      height="400px"
      defaultLanguage="javascript"
      value={value ?? DEFAULT_CODE}
      onChange={(val) => onChange?.(val ?? '')}
      onMount={handleMount}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        tabSize: 2,
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        readOnly,
      }}
    />
  );
}
