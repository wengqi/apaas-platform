/**
 * 字段映射器 —— 键值对编辑器(对象操作字段映射 / HTTP 响应映射)。
 * 对齐 DESIGN-process.md §6.2 / §6.6。
 *
 * 每行:左 = 目标字段(JSONPath / 对象字段),右 = 值(FlowValueEditor)。
 * 产出 Record<string, string>(key=字段, value=模板字符串)。
 */

import { useRef, useState } from 'react';
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
  // 行状态本地持有：emit 只上送非空 key 的行，若直接从 value 反推行，
  // 新增的空行（key 尚未填写）会在 emit 过滤后被丢弃——"添加映射"永远不生效。
  // 外部变更时才重置本地行；比较必须按值而非引用——父层每次渲染经 schema
  // 往返都会传入新对象，按引用比较会把刚添加的空行立即重置掉。
  const [rows, setRows] = useState<MappingRow[]>(() =>
    Object.entries(value).map(([key, val]) => ({ key, value: val })),
  );
  const lastEmittedSigRef = useRef(JSON.stringify(value));
  const incomingSig = JSON.stringify(value);
  if (lastEmittedSigRef.current !== incomingSig) {
    lastEmittedSigRef.current = incomingSig;
    setRows(Object.entries(value).map(([key, val]) => ({ key, value: val })));
  }

  const emit = (next: MappingRow[]) => {
    const obj: Record<string, string> = {};
    for (const row of next) {
      if (row.key.trim()) {
        obj[row.key.trim()] = row.value;
      }
    }
    lastEmittedSigRef.current = JSON.stringify(obj);
    onChange?.(obj);
  };

  const updateRow = (index: number, patch: Partial<MappingRow>) => {
    setRows((prev) => {
      const next = prev.map((row, i) => (i === index ? { ...row, ...patch } : row));
      emit(next);
      return next;
    });
  };

  const addRow = () => {
    setRows((prev) => {
      const next = [...prev, { key: '', value: '' }];
      emit(next);
      return next;
    });
  };

  const removeRow = (index: number) => {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      emit(next);
      return next;
    });
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
