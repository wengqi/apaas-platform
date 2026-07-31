/**
 * 对象操作节点配置表单 —— 对齐 DESIGN-process.md §6.2。
 */

import { Divider, Form, Input, Select } from 'antd';
import FieldMapper from '../FieldMapper.js';

export interface ObjectOperationConfigData {
  operation?: string;
  objectId?: string;
  fieldMapping?: Record<string, string>;
  filter?: string;
  resultVariable?: string;
  title?: string;
}

export interface ObjectOperationConfigFormProps {
  data: ObjectOperationConfigData;
  onChange: (data: ObjectOperationConfigData) => void;
  disabled?: boolean;
  objectOptions?: { label: string; value: string }[];
}

const OPERATION_OPTIONS = [
  { label: '创建记录', value: 'create' },
  { label: '更新记录', value: 'update' },
  { label: '查询记录', value: 'query' },
  { label: '删除记录', value: 'delete' },
];

export default function ObjectOperationConfigForm({
  data,
  onChange,
  disabled = false,
  objectOptions = [],
}: ObjectOperationConfigFormProps) {
  const update = (patch: Partial<ObjectOperationConfigData>) =>
    onChange({ ...data, ...patch });

  const op = data.operation || 'create';
  const showFieldMapping = op === 'create' || op === 'update';
  const showFilter = op === 'query' || op === 'update' || op === 'delete';
  const showResultVariable = op === 'query';

  return (
    <Form layout="vertical" size="small" disabled={disabled} component="div">
      <Divider orientation="left" plain style={{ marginTop: 0 }}>
        对象操作
      </Divider>
      <Form.Item label="操作类型" required>
        <Select
          value={data.operation}
          onChange={(v) => update({ operation: v })}
          options={OPERATION_OPTIONS}
        />
      </Form.Item>
      <Form.Item label="目标对象" required>
        <Select
          showSearch
          value={data.objectId || undefined}
          onChange={(v) => update({ objectId: v })}
          options={objectOptions}
          placeholder="选择操作的对象"
        />
      </Form.Item>
      {showFieldMapping && (
        <Form.Item label="字段映射">
          <FieldMapper
            value={data.fieldMapping}
            onChange={(v) => update({ fieldMapping: v })}
            keyPlaceholder="对象字段"
            valuePlaceholder="${record.field}"
            disabled={disabled}
          />
        </Form.Item>
      )}
      {showFilter && (
        <Form.Item label="查询条件">
          <Input.TextArea
            value={data.filter}
            onChange={(e) => update({ filter: e.target.value })}
            placeholder="筛选条件,例如: status == 'active'"
            rows={2}
          />
        </Form.Item>
      )}
      {showResultVariable && (
        <Form.Item label="结果变量">
          <Input
            value={data.resultVariable}
            onChange={(e) => update({ resultVariable: e.target.value })}
            placeholder="查询结果写入此变量名"
          />
        </Form.Item>
      )}
    </Form>
  );
}
