/**
 * 表单生成器 — 字段配置表格。
 *
 * 对齐飞书 aPaaS 表单生成器字段表格：勾选 | 字段 | 类型 | 标题(可编辑) |
 * 输入组件(类型映射可改) | 必填(勾选)，行首拖拽手柄可排序（dnd-kit sortable）。
 */

import { useMemo } from 'react';
import { Checkbox, Input, Select, Typography } from 'antd';
import { HolderOutlined } from '@ant-design/icons';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FIELD_TYPE_META } from '../../../constants/fieldTypes.js';
import { componentOptionsFor } from './mapping.js';
import type { FormGenRow } from './generate.js';
import type { Field } from '../../../api/objects.js';
import type { DragEndEvent } from '@dnd-kit/core';

const { Text } = Typography;

/** 列宽（px），表格总宽约 640。 */
const COL = { check: 36, field: 170, type: 96, title: 150, component: 130, required: 48 } as const;

interface FieldRowsTableProps {
  fields: Field[];
  rows: FormGenRow[];
  onChange: (rows: FormGenRow[]) => void;
}

/** 字段配置表格主组件。 */
export default function FieldRowsTable({ fields, rows, onChange }: FieldRowsTableProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((r) => r.fieldId === active.id);
    const to = rows.findIndex((r) => r.fieldId === over.id);
    if (from === -1 || to === -1) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    onChange(next);
  };

  const updateRow = (fieldId: string, patch: Partial<FormGenRow>) => {
    onChange(rows.map((r) => (r.fieldId === fieldId ? { ...r, ...patch } : r)));
  };

  const selectedCount = rows.filter((r) => r.selected).length;
  const allChecked = selectedCount === rows.length && rows.length > 0;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      {/* 表头 */}
      <div style={headerRowStyle}>
        <div style={{ ...cellStyle(COL.check) }}>
          <Checkbox
            checked={allChecked}
            indeterminate={selectedCount > 0 && !allChecked}
            onChange={(e) =>
              onChange(rows.map((r) => (r.required ? r : { ...r, selected: e.target.checked })))
            }
          />
        </div>
        <div style={cellStyle(COL.field)}>字段</div>
        <div style={cellStyle(COL.type)}>类型</div>
        <div style={cellStyle(COL.title)}>标题</div>
        <div style={cellStyle(COL.component)}>输入组件</div>
        <div style={cellStyle(COL.required)}>必填</div>
      </div>

      {/* 行（可排序） */}
      <SortableContext items={rows.map((r) => r.fieldId)} strategy={verticalListSortingStrategy}>
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {rows.map((row) => (
            <SortableRow
              key={row.fieldId}
              row={row}
              field={fieldById.get(row.fieldId)}
              onUpdate={(patch) => updateRow(row.fieldId, patch)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// 可排序行
// ---------------------------------------------------------------------------

function SortableRow({
  row,
  field,
  onUpdate,
}: {
  row: FormGenRow;
  field: Field | undefined;
  onUpdate: (patch: Partial<FormGenRow>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.fieldId,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: row.fieldId });

  if (!field) return null;
  const typeMeta = FIELD_TYPE_META[field.type];
  const TypeIcon = typeMeta?.icon;
  const lockedRequired = field.required;

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 44,
        borderBottom: '1px solid #f2f3f5',
        background: isDragging ? '#e1eaff' : isOver ? '#f7f9fc' : '#fff',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.85 : 1,
      }}
    >
      {/* 拖拽手柄 */}
      <div
        {...attributes}
        {...listeners}
        style={{
          width: 20,
          display: 'flex',
          justifyContent: 'center',
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        <HolderOutlined style={{ color: 'rgba(0,0,0,0.3)', fontSize: 12 }} />
      </div>
      <div ref={setDropRef} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
        <div style={cellStyle(COL.check)}>
          <Checkbox
            checked={row.selected}
            disabled={lockedRequired}
            onChange={(e) => onUpdate({ selected: e.target.checked })}
          />
        </div>
        <div style={{ ...cellStyle(COL.field), overflow: 'hidden' }}>
          <Text style={{ fontSize: 13 }} ellipsis>
            {field.label}（{field.apiName}）
          </Text>
        </div>
        <div style={cellStyle(COL.type)}>
          {TypeIcon && (
            <TypeIcon style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', marginRight: 4 }} />
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>
            {typeMeta?.label ?? field.type}
          </Text>
        </div>
        <div style={cellStyle(COL.title)}>
          <Input
            size="small"
            variant="borderless"
            value={row.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder="--"
            style={{ fontSize: 13 }}
          />
        </div>
        <div style={cellStyle(COL.component)}>
          <Select
            size="small"
            variant="borderless"
            value={row.component}
            options={componentOptionsFor(field)}
            onChange={(v) => onUpdate({ component: v })}
            style={{ width: '100%', fontSize: 13 }}
            popupMatchSelectWidth={false}
          />
        </div>
        <div style={cellStyle(COL.required)}>
          <Checkbox
            checked={row.required}
            disabled={lockedRequired}
            onChange={(e) =>
              onUpdate({
                required: e.target.checked,
                selected: e.target.checked ? true : row.selected,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 样式
// ---------------------------------------------------------------------------

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: 36,
  borderBottom: '1px solid #e5e6eb',
  background: '#fafbfc',
  paddingLeft: 20,
};

function cellStyle(width: number): React.CSSProperties {
  return {
    width,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    paddingRight: 8,
  };
}
