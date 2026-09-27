/**
 * 自定义规则渲染组件 — 值输入子组件（从 CustomRule.tsx 拆分，
 * AGENTS.md 单文件 400 行规范）。
 */

import { createElement, useState } from 'react';
import { Select, Input, Tag } from 'antd';

// ---------------------------------------------------------------------------
// 按字段类型渲染值输入
// ---------------------------------------------------------------------------

interface ValueInputByTypeProps {
  fieldType: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ValueInputByType({
  fieldType,
  value,
  onChange,
  disabled,
}: ValueInputByTypeProps): React.ReactElement {
  if (fieldType === 'boolean') {
    return createElement(Select, {
      size: 'small',
      value,
      onChange: (v: unknown) => onChange(v as string),
      disabled,
      options: [
        { label: 'true', value: 'true' },
        { label: 'false', value: 'false' },
      ],
      style: { width: '100%' },
    });
  }
  // 文本/数字/日期：统一用 Input
  return createElement(Input, {
    size: 'small',
    placeholder: '输入值',
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    disabled,
    type: fieldType === 'number' ? 'number' : 'text',
    style: { width: '100%' },
  });
}

// ---------------------------------------------------------------------------
// 多值输入（属于/不属于操作符）
// ---------------------------------------------------------------------------

interface MultiValueInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  fieldType: string;
}

export function MultiValueInput({
  value,
  onChange,
  disabled,
}: MultiValueInputProps): React.ReactElement {
  const [inputValue, setInputValue] = useState('');

  // 值以逗号分隔存储
  const tags = value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const handleAdd = (): void => {
    const v = inputValue.trim();
    if (v && !tags.includes(v)) {
      onChange([...tags, v].join(', '));
    }
    setInputValue('');
  };

  const handleRemove = (tag: string): void => {
    onChange(tags.filter((t) => t !== tag).join(', '));
  };

  return createElement(
    'div',
    { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' } },
    ...tags.map((tag) =>
      createElement(
        Tag,
        {
          key: tag,
          closable: !disabled,
          onClose: () => handleRemove(tag),
          style: { margin: 0 },
        },
        tag,
      ),
    ),
    createElement(Input, {
      size: 'small',
      placeholder: '输入值后回车',
      value: inputValue,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value),
      onPressEnter: handleAdd,
      disabled,
      style: { width: '80px', fontSize: '12px' },
    }),
  );
}
