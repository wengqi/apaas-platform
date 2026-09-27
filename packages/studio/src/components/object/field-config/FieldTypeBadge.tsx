/**
 * 字段配置 — 字段类型徽章（抽屉内只读展示，从 FieldConfigDrawer.tsx 抽出）。
 */

import { Space, Typography } from 'antd';
import type { FieldType } from '../../../constants/fieldTypes.js';
import { getFieldTypeMeta } from '../../../constants/fieldTypes.js';

const { Text } = Typography;

export default function FieldTypeBadge({ type }: { type: FieldType }) {
  const meta = getFieldTypeMeta(type);
  const Icon = meta.icon;
  return (
    <Space size={6}>
      <Icon style={{ color: '#1677ff' }} />
      <Text strong>{meta.label}</Text>
    </Space>
  );
}
