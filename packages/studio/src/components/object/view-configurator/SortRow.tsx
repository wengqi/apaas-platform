/**
 * 视图配置器 — 单条排序设置行（从 ViewConfigurator.tsx 拆分，
 * AGENTS.md 单文件 400 行规范）。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { Button, Select, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { Field, ViewSortConfig } from '../../../api/objects.js';

const { Text } = Typography;

/** 排序设置行（字段 + 升/降序 + 删除）。 */
export function SortRow({
  index,
  sort,
  fields,
  onUpdate,
  onRemove,
}: {
  index: number;
  sort: ViewSortConfig;
  fields: Field[];
  onUpdate: (index: number, patch: Partial<ViewSortConfig>) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        background: T.colorFillQuaternary,
        borderRadius: 8,
        padding: '6px 8px',
      }}
    >
      <Text type="secondary" style={{ fontSize: 12, width: 20 }}>
        {index + 1}.
      </Text>
      <Select
        size="small"
        value={sort.field}
        onChange={(v) => onUpdate(index, { field: v })}
        style={{ flex: 1 }}
        showSearch
        optionFilterProp="label"
        options={fields.map((f) => ({ value: f.apiName, label: f.label }))}
      />
      <Select
        size="small"
        value={sort.order}
        onChange={(v) => onUpdate(index, { order: v })}
        style={{ width: 90 }}
        options={[
          { value: 'asc', label: '升序' },
          { value: 'desc', label: '降序' },
        ]}
      />
      <Button
        type="text"
        size="small"
        danger
        icon={<DeleteOutlined />}
        onClick={() => onRemove(index)}
      />
    </div>
  );
}
