/**
 * 记录列表 — 单元格值渲染（从 RecordList.tsx 抽出）。
 * 按字段类型渲染记录值（选择项按存储值反查展示文案）。
 */

import { Space, Tag, Typography } from 'antd';
import type { Field } from '../../../api/objects.js';
import { formatDate, formatDateTime } from './utils.js';

const { Text } = Typography;

// 单元格值渲染
// ---------------------------------------------------------------------------

/** 按字段类型渲染记录值。 */
export default function RecordCellValue({ field, value }: { field: Field; value: unknown }) {
  if (value === undefined || value === null || value === '') {
    return <Text type="secondary">—</Text>;
  }

  const type = field.type;

  if (type === 'single_select') {
    // 评审整改：存储值可能是 value 或历史 label，两者都反查展示文案
    const opt = (field.config.options ?? []).find(
      (o) => o.label === value || (o.value ?? o.label) === value,
    );
    return <Tag color={opt?.color ?? 'default'}>{String(value)}</Tag>;
  }
  if (type === 'multi_select') {
    const arr = Array.isArray(value) ? value : [value];
    return (
      <Space size={4} wrap>
        {arr.map((v, i) => {
          const opt = (field.config.options ?? []).find(
            (o) => o.label === v || (o.value ?? o.label) === v,
          );
          return (
            <Tag key={i} color={opt?.color ?? 'default'} style={{ margin: 0 }}>
              {String(v)}
            </Tag>
          );
        })}
      </Space>
    );
  }
  if (type === 'checkbox') {
    return value === true || value === 'true' ? <Tag color="green">是</Tag> : <Tag>否</Tag>;
  }
  if (type === 'date') {
    return <Text style={{ fontSize: 13 }}>{formatDate(String(value))}</Text>;
  }
  if (type === 'date_time') {
    return <Text style={{ fontSize: 13 }}>{formatDateTime(String(value))}</Text>;
  }
  if (type === 'currency') {
    const code = field.config.currency?.code ?? '';
    return (
      <Text style={{ fontSize: 13 }}>
        {code} {String(value)}
      </Text>
    );
  }
  if (type === 'percent') {
    return <Text style={{ fontSize: 13 }}>{String(value)}%</Text>;
  }
  if (['number'].includes(type)) {
    return <Text style={{ fontSize: 13 }}>{String(value)}</Text>;
  }

  return <Text style={{ fontSize: 13 }}>{String(value)}</Text>;
}

// ---------------------------------------------------------------------------
