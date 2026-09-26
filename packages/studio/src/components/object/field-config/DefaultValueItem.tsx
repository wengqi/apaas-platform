/**
 * 字段配置 — 默认值控件（按字段类型适配，从 FieldConfigDrawer.tsx 抽出）。
 */

import { Form, Input, InputNumber, Select, Switch } from 'antd';
import type { SelectOption } from '../../../api/objects.js';
import type { FieldType } from '../../../constants/fieldTypes.js';

export default function DefaultValueItem({
  type,
  options,
  isSystem,
}: {
  type: FieldType;
  options: SelectOption[];
  isSystem: boolean;
}) {
  // 仅对简单类型渲染默认值输入
  const textLike: FieldType[] = ['text', 'long_text', 'rich_text', 'auto_number'];
  const numberLike: FieldType[] = ['number', 'currency', 'percent'];

  if (type === 'checkbox') {
    return (
      <Form.Item name="defaultValue" valuePropName="checked" label="默认值">
        <Switch disabled={isSystem} />
      </Form.Item>
    );
  }
  if (type === 'single_select') {
    return (
      <Form.Item name="defaultValue" label="默认值">
        <Select
          allowClear
          placeholder="选择默认选项"
          disabled={isSystem}
          options={options
            .filter((o) => !!o.label)
            .map((o) => ({ value: o.value ?? o.label, label: o.label }))}
        />
      </Form.Item>
    );
  }
  if (textLike.includes(type)) {
    return (
      <Form.Item name="defaultValue" label="默认值">
        <Input placeholder="默认值(可选)" disabled={isSystem} />
      </Form.Item>
    );
  }
  if (numberLike.includes(type)) {
    return (
      <Form.Item name="defaultValue" label="默认值">
        <InputNumber style={{ width: '100%' }} placeholder="默认值(可选)" disabled={isSystem} />
      </Form.Item>
    );
  }
  return null;
}
