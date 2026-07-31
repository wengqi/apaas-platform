/**
 * 字段映射器 —— 键值对编辑器(对象操作字段映射 / HTTP 响应映射)。
 * 对齐 DESIGN-process.md §6.2 / §6.6。
 *
 * 每行:左 = 目标字段(JSONPath / 对象字段),右 = 值(FlowValueEditor)。
 * 产出 Record<string, string>(key=字段, value=模板字符串)。
 */

import { Button, Input, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';

export interface FieldMapperProps {
  /** 当前映射(key=字段路径, value=值字符串) */
  value?: Record<string, string>;
  /** 变化回调 */
  onChange?: (value: Record<string, string>) => void;
  /** 左侧标签(如「对象字段」/「响应字段(JSONPath)」) */
  keyLabel?: string;
  /** 右侧标签(如「流程变量」/「变量名」) */
  valueLabel?: string;
  /** 左侧占位 */
  keyPlaceholder?: string;
  /** 右侧占位 */
  valuePlaceholder?: string;
  /** 禁用 */
  disabled?: boolean;
}

interface MappingRow {
  key: string;
  value: string;
}

export function FieldMapper({
  value = {},
  onChange,
  keyLabel = '字段',
  valueLabel = '值',
  keyPlaceholder = '字段名',
  valuePlaceholder = '${record.field}',
  disabled = false,
}: FieldMapperProps) {
  const rows: MappingRow[] = Object.entries(value).map(([key, val]) => ({
    key,
    value: val,
  }));

  const emit = (next: MappingRow[]) => {
    const obj: Record<string, string> = {};
    for (const row of next) {
      if (row.key.trim()) {
        obj[row.key.trim()] = row.value;
      }
    }
    onChange?.(obj);
  };

  const updateRow = (index: number, patch: Partial<MappingRow>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    emit(next);
  };

  const addRow = () => {
    emit([...rows, { key: '', value: '' }]);
  };

  const removeRow = (index: number) => {
    emit(rows.filter((_, i) => i !== index));
  };

  return (
    <div>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {rows.length === 0 && (
          <Button
            size="small"
            type="dashed"
            icon={<PlusOutlined />}
            onClick={addRow}
            disabled={disabled}
            block
          >
            添加映射
          </Button>
        )}
        {rows.map((row, index) => (
          <div key={index} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Input
              size="small"
              placeholder={keyPlaceholder}
              value={row.key}
              onChange={(e) => updateRow(index, { key: e.target.value })}
              disabled={disabled}
              style={{ flex: 1 }}
            />
            <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>←</span>
            <Input
              size="small"
              placeholder={valuePlaceholder}
              value={row.value}
              onChange={(e) => updateRow(index, { value: e.target.value })}
              disabled={disabled}
              style={{ flex: 1 }}
            />
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeRow(index)}
              disabled={disabled}
            />
          </div>
        ))}
        {rows.length > 0 && (
          <Button
            size="small"
            type="dashed"
            icon={<PlusOutlined />}
            onClick={addRow}
            disabled={disabled}
            block
          >
            添加映射
          </Button>
        )}
        {(rows.length > 0 || keyLabel) && (
          <div style={{ display: 'flex', gap: 6, color: 'rgba(0,0,0,0.45)', fontSize: 11 }}>
            <span style={{ flex: 1 }}>{keyLabel}</span>
            <span style={{ width: 12 }} />
            <span style={{ flex: 1 }}>{valueLabel}</span>
            <span style={{ width: 28 }} />
          </div>
        )}
      </Space>
    </div>
  );
}

export default FieldMapper;
