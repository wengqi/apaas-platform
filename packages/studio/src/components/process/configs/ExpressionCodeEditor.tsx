/**
 * CodeMirror 表达式编辑器 —— 带语法高亮、自动补全和实时校验。
 *
 * 使用 @uiw/react-codemirror（CodeMirror 6 React 封装）。
 * 补全内容：变量名（来自 variable-resolver）、运算符、函数。
 */

import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { Tag, Typography } from 'antd';
import type { VariableOption } from './variable-resolver.js';
import { validateExpression } from './jsonlogic-utils.js';

const { Text } = Typography;

export interface ExpressionCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  variables: VariableOption[];
  disabled?: boolean;
}

/** 运算符补全列表 */
const OPERATOR_COMPLETIONS = [
  { label: 'and', detail: '逻辑与' },
  { label: 'or', detail: '逻辑或' },
  { label: '>', detail: '大于' },
  { label: '<', detail: '小于' },
  { label: '>=', detail: '大于等于' },
  { label: '<=', detail: '小于等于' },
  { label: '==', detail: '等于' },
  { label: '!=', detail: '不等于' },
];

/** 函数补全列表 */
const FUNCTION_COMPLETIONS = [
  { label: 'contains(field, "value")', detail: '包含 — 字符串子串匹配', insert: 'contains(' },
  { label: 'notContains(field, "value")', detail: '不包含 — 字符串子串不匹配', insert: 'notContains(' },
];

export default function ExpressionCodeEditor({
  value,
  onChange,
  variables,
  disabled = false,
}: ExpressionCodeEditorProps) {
  /** 构建自动补全 source */
  const completionSource = useMemo(() => {
    return (context: CompletionContext): CompletionResult | null => {
      const word = context.matchBefore(/\w*/);
      if (!word) return null;
      if (word.from === word.to && !context.explicit) return null;

      const variableCompletions = variables.map(v => ({
        label: v.value,
        type: 'variable' as const,
        detail: v.sourceNode ? `${v.label} — ${v.sourceNode}` : v.label,
      }));

      const opCompletions = OPERATOR_COMPLETIONS.map(o => ({
        label: o.label,
        type: 'keyword' as const,
        detail: o.detail,
      }));

      const funcCompletions = FUNCTION_COMPLETIONS.map(f => ({
        label: f.label,
        type: 'function' as const,
        detail: f.detail,
        apply: f.insert,
      }));

      return {
        from: word.from,
        options: [...variableCompletions, ...opCompletions, ...funcCompletions],
      };
    };
  }, [variables]);

  /** 实时语法校验 */
  const validation = validateExpression(value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden' }}>
        <CodeMirror
          value={value}
          onChange={onChange}
          extensions={[autocompletion({ override: [completionSource] })]}
          editable={!disabled}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            autocompletion: true,
          }}
          style={{ fontSize: '13px' }}
          placeholder='条件表达式，例如: amount > 1000 and status == "urgent"'
        />
      </div>
      {value.trim() ? (
        validation.valid ? (
          <Tag color="green" style={{ alignSelf: 'flex-start' }}>
            语法正确
          </Tag>
        ) : (
          <Text type="danger" style={{ fontSize: 12, padding: '0 4px' }}>
            {validation.error}
          </Text>
        )
      ) : null}
    </div>
  );
}
