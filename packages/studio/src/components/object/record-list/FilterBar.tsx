/**
 * 记录列表 — 筛选栏（从 RecordList.tsx 抽出）。
 *
 * 职责：渲染筛选行（字段 / 操作符 / 值）、添加/删除行、应用与重置。
 * 逻辑（JsonLogic 生成、操作符推导）在同目录 filter-logic.ts。
 */

import { Button, Select, Space, Typography } from 'antd';
import { DeleteOutlined, FilterOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { Field, FilterOperator, ObjectWithFields } from '../../../api/objects.js';
import FilterValueInput from './FilterValueInput.js';
import {
  NO_VALUE_OPERATORS,
  OPERATOR_LABEL,
  getDefaultOperator,
  getOperatorsForType,
  type FilterRow,
} from './filter-logic.js';

const { Text } = Typography;

interface FilterBarProps {
  object: ObjectWithFields;
  rows: FilterRow[];
  onAddRow: () => void;
  onUpdateRow: (index: number, patch: Partial<FilterRow>) => void;
  onRemoveRow: (index: number) => void;
  onApply: () => void;
  onReset: () => void;
}

export default function FilterBar({
  object,
  rows,
  onAddRow,
  onUpdateRow,
  onRemoveRow,
  onApply,
  onReset,
}: FilterBarProps) {
  return (
    <div style={{ background: '#fafbfc', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row, index) => {
          const field: Field | undefined = object.fields.find((f) => f.apiName === row.field);
          const operators: FilterOperator[] = field
            ? getOperatorsForType(field.type)
            : ['eq', 'ne'];
          const needValue = !NO_VALUE_OPERATORS.includes(row.operator);
          return (
            <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Select
                size="small"
                value={row.field || undefined}
                onChange={(v: string) => {
                  const newField = object.fields.find((f) => f.apiName === v);
                  onUpdateRow(index, {
                    field: v,
                    operator: newField ? getDefaultOperator(newField.type) : 'eq',
                    value: '',
                  });
                }}
                style={{ width: 140 }}
                showSearch
                optionFilterProp="label"
                placeholder="选择字段"
                options={object.fields.map((f) => ({ value: f.apiName, label: f.label }))}
              />
              <Select
                size="small"
                value={row.operator}
                onChange={(v: FilterOperator) => onUpdateRow(index, { operator: v, value: '' })}
                style={{ width: 110 }}
                options={operators.map((op) => ({ value: op, label: OPERATOR_LABEL[op] }))}
              />
              {needValue ? (
                <FilterValueInput
                  field={field}
                  value={row.value}
                  onChange={(v) => onUpdateRow(index, { value: v })}
                />
              ) : (
                <Text type="secondary" style={{ fontSize: 12, flex: 1 }}>
                  —
                </Text>
              )}
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => onRemoveRow(index)}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={onAddRow}>
          添加筛选
        </Button>
        <Space>
          <Button size="small" icon={<ReloadOutlined />} onClick={onReset}>
            重置
          </Button>
          <Button type="primary" size="small" icon={<FilterOutlined />} onClick={onApply}>
            筛选
          </Button>
        </Space>
      </div>
    </div>
  );
}
