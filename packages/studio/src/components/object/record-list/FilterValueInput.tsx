/**
 * 记录列表 — 筛选值输入控件（从 RecordList.tsx 抽出）。
 * 按字段类型渲染：选择/多选走下拉（按存储值比较），数值走数字输入，其余文本输入。
 */

import { Input, InputNumber, Select } from 'antd';
import type { Field } from '../../../api/objects.js';

// 筛选值输入
// ---------------------------------------------------------------------------

export default function FilterValueInput({
  field,
  value,
  onChange,
}: {
  field: Field | undefined;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (!field) {
    return <Input size="small" style={{ flex: 1 }} placeholder="值" />;
  }
  const type = field.type;

  if (type === 'single_select' || type === 'multi_select') {
    const options = (field.config.options ?? []).filter((o) => !!o.label);
    return (
      <Select
        size="small"
        mode={type === 'multi_select' ? 'multiple' : undefined}
        allowClear
        value={value as string | string[] | undefined}
        onChange={(v) => onChange(v)}
        style={{ flex: 1, minWidth: 140 }}
        placeholder="选择值"
        // 评审整改：筛选条件按存储值（value）比较，与记录存储一致
        options={options.map((o) => ({ value: o.value ?? o.label, label: o.label }))}
      />
    );
  }
  if (type === 'checkbox') {
    return (
      <Select
        size="small"
        value={value as string | undefined}
        onChange={(v) => onChange(v)}
        style={{ flex: 1 }}
        options={[
          { value: 'true', label: '是' },
          { value: 'false', label: '否' },
        ]}
      />
    );
  }
  if (['number', 'currency', 'percent'].includes(type)) {
    return (
      <InputNumber
        size="small"
        value={value as number | undefined}
        onChange={(v) => onChange(v ?? '')}
        style={{ flex: 1 }}
        placeholder="数值"
      />
    );
  }
  return (
    <Input
      size="small"
      value={value as string | undefined}
      onChange={(e) => onChange(e.target.value)}
      style={{ flex: 1 }}
      placeholder="值"
    />
  );
}

// ---------------------------------------------------------------------------
