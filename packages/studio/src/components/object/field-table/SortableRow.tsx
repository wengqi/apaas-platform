/**
 * 字段表格 — 拖拽排序行组件与手柄（从 FieldTable.tsx 拆分，AGENTS.md 单文件 400 行规范）。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { createContext, useContext } from 'react';
import { Button } from 'antd';
import { HolderOutlined } from '@ant-design/icons';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ---------------------------------------------------------------------------
// 拖拽排序:行组件 + 拖拽手柄
// ---------------------------------------------------------------------------

/** 行间共享 useSortable 的 listeners/attributes(供手柄使用)。 */
interface RowDragContextValue {
  listeners?: ReturnType<typeof useSortable>['listeners'];
  attributes?: ReturnType<typeof useSortable>['attributes'];
  isDragging?: boolean;
}
const RowDragContext = createContext<RowDragContextValue>({});

/** AntD Table 自定义行:绑定 useSortable,通过 Context 暴露手柄事件。 */
export function SortableRow(
  props: React.HTMLAttributes<HTMLTableRowElement> & { 'data-row-key'?: string },
) {
  const id = props['data-row-key'] as string | undefined;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: id ?? '',
  });
  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: 'move',
    ...(isDragging ? { position: 'relative', zIndex: 10, background: T.colorPrimaryBg } : {}),
  };
  return (
    <RowDragContext.Provider value={{ listeners, attributes, isDragging }}>
      <tr {...props} ref={setNodeRef} style={style} />
    </RowDragContext.Provider>
  );
}

/** 拖拽手柄(第一列)。从 Context 取 listeners 绑定到图标按钮。 */
export function DragHandle() {
  const { listeners, attributes } = useContext(RowDragContext);
  return (
    <Button
      type="text"
      size="small"
      {...attributes}
      {...listeners}
      icon={<HolderOutlined style={{ cursor: 'grab', color: 'rgba(0,0,0,0.35)' }} />}
      style={{ touchAction: 'none' }}
    />
  );
}
