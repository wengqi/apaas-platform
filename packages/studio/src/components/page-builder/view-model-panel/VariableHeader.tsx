/**
 * 变量头部（名称 + 类型标签 + 删除）—— 从 components/page-builder/ViewModelPanel.tsx
 * 拆分（AGENTS.md 单文件 400 行规范）。
 */

import { Button, Popconfirm, Tag, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { VariableDef } from '../../../api/pages.js';
import { VARIABLE_TYPE_META } from './variableMeta.js';

const { Text } = Typography;

export function VariableHeader({
  varKey,
  def,
  onDelete,
}: {
  varKey: string;
  def: VariableDef;
  onDelete: () => void;
}) {
  const meta = VARIABLE_TYPE_META[def.type] ?? { label: def.type, color: 'default' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <Text strong style={{ fontSize: 13, fontFamily: 'monospace' }}>
        {varKey}
      </Text>
      <Tag style={{ margin: 0, fontSize: 11 }} color={meta.color}>
        {meta.label}
      </Tag>
      <div style={{ flex: 1 }} />
      <Popconfirm
        title="删除变量"
        description="删除变量将解除所有引用它的绑定,是否继续?"
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        onConfirm={(e) => {
          e?.stopPropagation();
          onDelete();
        }}
        onCancel={(e) => e?.stopPropagation()}
      >
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={(e) => e.stopPropagation()}
        />
      </Popconfirm>
    </div>
  );
}
