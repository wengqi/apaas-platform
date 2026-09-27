/**
 * Studio 组件渲染器 — 编辑 + 预览模式。
 *
 * 共享渲染逻辑（全部 26 个渲染器 + 辅助函数）在 @apaas/shared/stores 的
 * component-renderer.tsx 中。此文件仅保留 Studio 专有部分：
 * - EditNode：选中边框 + 飞书式蓝色胶囊工具条（类型名 + 复制/删除）+ 画布内排序
 * - DroppableArea：@dnd-kit 放置区 + SortableContext（同层拖拽排序）
 * - DropzoneData / CanvasNodeDragData：拖拽数据类型
 * - ctx 构建：从 usePageBuilderStore + useRuntimeCtx 组装 RenderContext
 */

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Popconfirm, Typography } from 'antd';
import {
  CodeOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EyeInvisibleOutlined,
  HolderOutlined,
} from '@ant-design/icons';
import { spanFromDrag } from '../../utils/designer-shortcuts.js';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import { getComponentMeta } from '../../constants/pageComponents.js';
import type { ComponentNode } from '../../api/pages.js';
import {
  createComponentRenderer,
  extractActions,
  findNodeById,
  type RenderContext,
  type WrapEditProps,
} from '@apaas/shared/stores';
import { useRuntimeCtx, type RuntimeState } from './RuntimeStore.js';

const { Text } = Typography;

/** 飞书主色（选中态/工具条）。 */
const ACCENT = '#1456f0';

// ---------------------------------------------------------------------------
// 拖拽数据类型
// ---------------------------------------------------------------------------

/** 拖拽数据：画布放置区。 */
export interface DropzoneData {
  source: 'dropzone';
  parentId: string;
}

/** 拖拽数据：画布内节点（同层排序）。 */
export interface CanvasNodeDragData {
  source: 'canvas-node';
  node: ComponentNode;
}

// ---------------------------------------------------------------------------
// 可放置区域（容器子节点区 + SortableContext）
// ---------------------------------------------------------------------------

/** 容器子节点放置区：空状态提示 or 子节点排序列表。 */
function DroppableArea({
  parentId,
  isEmpty,
  children,
}: {
  parentId: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  const schema = usePageBuilderStore((s) => s.schema);
  const { setNodeRef, isOver } = useDroppable({
    id: `dropzone-${parentId}`,
    data: { source: 'dropzone', parentId } as DropzoneData,
  });

  // 子节点 id 列表（供 SortableContext 做同层排序）
  const childIds = useMemo(() => {
    if (!schema) return [];
    const parent = findNodeById(schema.root, parentId);
    return (parent?.children ?? []).map((c) => c.id);
  }, [schema, parentId]);

  if (isEmpty) {
    const isFormBody = getNodeType(parentId) === 'form';
    return (
      <div
        ref={setNodeRef}
        style={{
          minHeight: 96,
          border: `1.5px dashed ${isOver ? ACCENT : '#bbbfd4'}`,
          borderRadius: 8,
          background: isOver ? '#eef4ff' : '#fafbfc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease',
        }}
      >
        <Text type="secondary" style={{ fontSize: 13 }}>
          {isFormBody ? (
            <>
              拖入组件搭建，或点击右侧属性面板
              <FormGenLink formNodeId={parentId}>表单生成器</FormGenLink>
            </>
          ) : (
            '拖拽组件到此处'
          )}
        </Text>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver ? '#eef4ff' : 'transparent',
        borderRadius: 4,
        transition: 'background 0.15s ease',
        minHeight: 40,
      }}
    >
      <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </div>
  );
}

/** 读取节点类型（容器空态文案分支用）。 */
function getNodeType(nodeId: string): string | null {
  const schema = usePageBuilderStore.getState().schema;
  if (!schema) return null;
  return findNodeById(schema.root, nodeId)?.type ?? null;
}

/** 表单生成器链接（选中表单节点并打开全局 FormGeneratorModal）。 */
function FormGenLink({ formNodeId, children }: { formNodeId: string; children: ReactNode }) {
  const selectNode = usePageBuilderStore((s) => s.selectNode);
  const setFormGeneratorNodeId = usePageBuilderStore((s) => s.setFormGeneratorNodeId);
  return (
    <Text
      onClick={(e) => {
        e.stopPropagation();
        selectNode(formNodeId);
        setFormGeneratorNodeId(formNodeId);
      }}
      style={{ color: ACCENT, fontSize: 13, cursor: 'pointer', marginLeft: 4 }}
    >
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// 编辑模式包裹层（选中边框 + 飞书式胶囊工具条 + 画布内排序）
// ---------------------------------------------------------------------------

/** 编辑模式：节点包裹层（选中 + 悬停 + 内容 + 同层拖拽）。 */
function EditNode({ node, ctx, content, isRoot }: WrapEditProps): ReactNode {
  const selectNode = usePageBuilderStore((s) => s.selectNode);
  const removeComponent = usePageBuilderStore((s) => s.removeComponent);
  const duplicateNode = usePageBuilderStore((s) => s.duplicateNode);
  const updateComponentProps = usePageBuilderStore((s) => s.updateComponentProps);
  const setVmPanelOpen = usePageBuilderStore((s) => s.setVmPanelOpen);
  const [hovered, setHovered] = useState(false);
  const [previewSpan, setPreviewSpan] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<{ startX: number; baseSpan: number; width: number; dir: 1 | -1 } | null>(
    null,
  );

  // 选中节点的左右 resize 手柄（批次D）：拖拽调整 12 栅格 span，松手一次性提交
  const baseSpan = typeof node.props.span === 'number' ? node.props.span : 12;
  const onHandleDown = (e: React.PointerEvent, dir: 1 | -1) => {
    e.stopPropagation();
    const width = wrapperRef.current?.getBoundingClientRect().width || 1;
    resizeRef.current = { startX: e.clientX, baseSpan, width, dir };
    setPreviewSpan(baseSpan);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    setPreviewSpan(spanFromDrag(r.baseSpan, (e.clientX - r.startX) * r.dir, r.width));
  };
  const onHandleUp = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    resizeRef.current = null;
    const final = spanFromDrag(r.baseSpan, (e.clientX - r.startX) * r.dir, r.width);
    setPreviewSpan(null);
    if (final !== baseSpan) updateComponentProps(node.id, { span: final });
  };

  const meta = getComponentMeta(node.type);
  const isSelected = ctx.selectedNodeId === node.id;

  // 同层排序（根节点不参与）
  const sortable = useSortable({
    id: node.id,
    disabled: isRoot,
    data: { source: 'canvas-node', node } as CanvasNodeDragData,
  });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectNode(node.id);
  };

  // 边框样式：选中 > 悬停 > 默认（飞书 1.5px 主色）
  let borderColor = 'transparent';
  let boxShadow = 'none';
  if (isSelected) {
    borderColor = ACCENT;
    boxShadow = '0 0 0 2px rgba(20, 86, 240, 0.08)';
  } else if (hovered) {
    borderColor = '#85a8ff';
  }

  const hidden = node.hidden === true;
  const span =
    typeof node.props.span === 'number' && node.props.span >= 1 && node.props.span <= 12
      ? node.props.span
      : 12;
  const widthPct =
    previewSpan !== null
      ? `${(previewSpan / 12) * 100}%`
      : span < 12
        ? `${(span / 12) * 100}%`
        : undefined;

  return (
    <div
      ref={(el) => {
        wrapperRef.current = el;
        if (!isRoot) sortable.setNodeRef(el);
      }}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        border: `1.5px solid ${borderColor}`,
        borderRadius: 6,
        margin: isRoot ? 0 : '4px 0',
        boxShadow,
        width: widthPct,
        opacity: hidden ? 0.4 : sortable.isDragging ? 0.5 : 1,
        transform: isRoot ? undefined : CSS.Translate.toString(sortable.transform),
        transition: sortable.isDragging ? 'none' : 'border-color 0.15s ease, box-shadow 0.15s ease',
        zIndex: sortable.isDragging ? 20 : undefined,
      }}
    >
      {/* 飞书式胶囊工具条（非根节点，选中或悬停时）。左侧握把为拖拽排序手柄，
          名称点击选中组件（拖拽监听与点击选中分离，避免吞掉 click）。 */}
      {!isRoot && (hovered || isSelected) && (
        <div
          style={{
            position: 'absolute',
            top: -26,
            left: -1.5,
            height: 24,
            background: ACCENT,
            borderRadius: '4px 4px 0 0',
            padding: '0 2px 0 2px',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            zIndex: 10,
            whiteSpace: 'nowrap',
          }}
        >
          <span
            {...sortable.attributes}
            {...sortable.listeners}
            title="拖拽排序"
            style={{
              width: 18,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: sortable.isDragging ? 'grabbing' : 'grab',
              touchAction: 'none',
              color: 'rgba(255,255,255,0.85)',
            }}
          >
            <HolderOutlined style={{ fontSize: 12 }} />
          </span>
          <Text
            onClick={(e) => {
              e.stopPropagation();
              selectNode(node.id);
            }}
            style={{ color: '#fff', fontSize: 12, marginRight: 4, cursor: 'pointer' }}
          >
            {node.name || meta.label}
          </Text>
          <ToolDivider />
          <ToolIcon
            title="数据绑定"
            icon={<DatabaseOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              setVmPanelOpen(true);
            }}
          />
          <ToolIcon
            title="事件 / JS 脚本"
            icon={<CodeOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              document
                .getElementById('prop-events')
                ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }}
          />
          <ToolDivider />
          <ToolIcon
            title="复制"
            icon={<CopyOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              duplicateNode(node.id);
            }}
          />
          <Popconfirm
            title="删除组件"
            description={`确定删除「${node.name || meta.label}」吗？`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={(e) => {
              e?.stopPropagation();
              removeComponent(node.id);
            }}
            onCancel={(e) => e?.stopPropagation()}
          >
            <ToolIcon title="删除" icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
          </Popconfirm>
          <ToolDivider />
          <ToolIcon
            title="隐藏"
            icon={<EyeInvisibleOutlined />}
            active={node.hidden === true}
            onClick={(e) => {
              e.stopPropagation();
              updateComponentProps(node.id, { hidden: node.hidden !== true });
            }}
          />
        </div>
      )}

      {/* 左右 resize 手柄（选中态，拖拽调整 12 栅格宽度） */}
      {isSelected && !isRoot && (
        <>
          <div
            onPointerDown={(e) => onHandleDown(e, -1)}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            title="拖拽调整宽度"
            style={{
              position: 'absolute',
              left: -5,
              top: '50%',
              width: 9,
              height: 20,
              marginTop: -10,
              borderRadius: 5,
              background: ACCENT,
              cursor: 'ew-resize',
              touchAction: 'none',
              zIndex: 11,
            }}
          />
          <div
            onPointerDown={(e) => onHandleDown(e, 1)}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            title="拖拽调整宽度"
            style={{
              position: 'absolute',
              right: -5,
              top: '50%',
              width: 9,
              height: 20,
              marginTop: -10,
              borderRadius: 5,
              background: ACCENT,
              cursor: 'ew-resize',
              touchAction: 'none',
              zIndex: 11,
            }}
          />
        </>
      )}

      {content}
    </div>
  );
}

/** 工具条竖分隔线。 */
function ToolDivider() {
  return (
    <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.3)', margin: '0 4px' }} />
  );
}

/** 工具条图标按钮（白描边风格）；active 表示开关型图标已激活。 */
function ToolIcon({
  title,
  icon,
  active,
  onClick,
}: {
  title: string;
  icon: ReactNode;
  active?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        height: 22,
        width: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? 'rgba(255,255,255,0.25)' : 'transparent',
        border: 'none',
        color: '#fff',
        cursor: 'pointer',
        borderRadius: 4,
        padding: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? 'rgba(255,255,255,0.25)' : 'transparent';
      }}
    >
      {icon}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 共享渲染器（注入 EditNode + DroppableArea）
// ---------------------------------------------------------------------------

const SharedRenderer = createComponentRenderer({
  wrapEdit: (props) => <EditNode {...props} />,
});

// ---------------------------------------------------------------------------
// 顶层：根据模式分流（编辑 / 预览）
// ---------------------------------------------------------------------------

interface ComponentRendererProps {
  node: ComponentNode;
  isRoot?: boolean;
}

/**
 * 组件节点递归渲染器。
 * - 编辑模式：包裹选中边框 + 胶囊工具条 + 放置区/排序
 * - 预览模式：纯渲染，无编辑 UI
 */
export default function ComponentRenderer({ node, isRoot }: ComponentRendererProps) {
  const mode = usePageBuilderStore((s) => s.mode);
  const schema = usePageBuilderStore((s) => s.schema);
  const selectedNodeId = usePageBuilderStore((s) => s.selectedNodeId);
  const selectNode = usePageBuilderStore((s) => s.selectNode);
  const updateComponentProps = usePageBuilderStore((s) => s.updateComponentProps);
  const vm = useRuntimeCtx((s) => s.vm);
  const setVariable = useRuntimeCtx((s) => s.setVariable);
  const executeActions = useRuntimeCtx((s) => s.executeActions);
  const queryData = useRuntimeCtx((s) => s.queryData);
  const executeAction = useRuntimeCtx((s) => s.executeAction);

  // ctx 稳定化：避免每次渲染创建新对象（配合 PageLoadEffect 的 ref 防重入，杜绝 onLoad 重跑）。
  const ctx = useMemo<RenderContext>(() => {
    const runtime: RuntimeState = {
      vm,
      setVariable,
      executeActions,
      queryData,
      executeAction,
    };
    return {
      mode,
      viewModel: schema?.viewModel ?? { variables: {} },
      selectedNodeId,
      onSelect: (id: string) => selectNode(id),
      onAction: (nodeId: string, eventName: string) => {
        if (mode !== 'preview') return;
        const schemaState = usePageBuilderStore.getState().schema;
        if (!schemaState) return;
        const target = findNodeById(schemaState.root, nodeId);
        if (!target) return;
        const actions = extractActions(target.props[eventName]);
        if (actions.length > 0) {
          void executeActions(actions);
        }
      },
      runtime,
      vm: mode === 'preview' ? runtime.vm : {},
      renderDropzone: (parentId, isEmpty, children) => (
        <DroppableArea parentId={parentId} isEmpty={isEmpty}>
          {children}
        </DroppableArea>
      ),
      onLayoutChange: (nodeId, layout) => {
        if (mode !== 'edit') return;
        updateComponentProps(nodeId, { layout });
      },
    };
  }, [
    mode,
    schema,
    selectedNodeId,
    selectNode,
    updateComponentProps,
    vm,
    setVariable,
    executeActions,
    queryData,
    executeAction,
  ]);

  return <SharedRenderer node={node} ctx={ctx} isRoot={isRoot} />;
}
