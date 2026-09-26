/**
 * 视图配置器 — 可拖拽的显隐字段行（从 ViewConfigurator.tsx 拆分，
 * AGENTS.md 单文件 400 行规范）。
 */

import { Checkbox, Tag, Typography } from 'antd';
import { HolderOutlined } from '@ant-design/icons';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const { Text } = Typography;

/** 可拖拽的显隐字段行。 */
export function SortableFieldRow({
  fieldId,
  label,
  apiName,
  color,
  checked,
  onToggle,
}: {
  fieldId: string;
  label: string;
  apiName: string;
  color: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: fieldId,
  });
  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    background: '#fff',
    border: '1px solid #eef0f4',
    borderRadius: 8,
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 10 } : {}),
  };
  return (
    <div ref={setNodeRef} style={style}>
      <HolderOutlined
        {...attributes}
        {...listeners}
        style={{ cursor: 'grab', color: 'rgba(0,0,0,0.35)' }}
      />
      <Checkbox checked={checked} onChange={(e) => onToggle(e.target.checked)} />
      <Tag color={color} style={{ margin: 0 }}>
        {label}
      </Tag>
      <Text style={{ fontSize: 13, flex: 1 }}>{apiName}</Text>
    </div>
  );
}
