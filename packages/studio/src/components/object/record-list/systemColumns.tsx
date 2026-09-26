/**
 * 记录列表 — 系统字段列定义（从 RecordList.tsx 抽出）。
 *
 * 创建时间/更新时间/创建人直接从记录列读取（非 data JSON），
 * 与业务字段列区分，避免系统字段重复渲染。
 */

import { Typography } from 'antd';
import type { RecordItem } from '../../../api/objects.js';
import { formatDateTime } from './utils.js';

const { Text } = Typography;

/** 系统字段列定义(直接从记录列读取,非 data JSON)。 */
export interface SystemColumn {
  key: string;
  title: string;
  width: number;
  render: (record: RecordItem) => React.ReactNode;
}

/** 构建系统字段列（创建时间 / 更新时间 / 创建人）。 */
export function buildSystemColumns(): SystemColumn[] {
  return ([] = [
    {
      key: 'createdAt',
      title: '创建时间',
      width: 160,
      render: (r: RecordItem) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {formatDateTime(r.createdAt)}
        </Text>
      ),
    },
    {
      key: 'updatedAt',
      title: '更新时间',
      width: 160,
      render: (r: RecordItem) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {formatDateTime(r.updatedAt)}
        </Text>
      ),
    },
    {
      key: 'createdBy',
      title: '创建人',
      width: 120,
      render: (r: RecordItem) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {r.createdBy ?? '—'}
        </Text>
      ),
    },
  ]);
}
