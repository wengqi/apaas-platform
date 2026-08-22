/**
 * Studio 组件渲染器 — 编辑 + 预览模式。
 *
 * 共享渲染逻辑（全部 26 个渲染器 + 辅助函数）在 @apaas/shared/stores 的
 * component-renderer.tsx 中。此文件仅保留 Studio 专有部分：
 * - EditNode：选中边框 + 悬停工具条 + 删除/复制
 * - DroppableArea：@dnd-kit/core 拖放放置区
 * - DropzoneData：拖拽数据类型
 * - ctx 构建：从 usePageBuilderStore + useRuntimeCtx 组装 RenderContext
 *
 * 通过 createComponentRenderer({ wrapEdit }) 注入编辑模式包裹层；
 * ctx.renderDropzone 注入 DroppableArea 以支持编辑模式拖放。
 */

import { useState, type ReactNode } from 'react';
import { Button, Popconfirm, Typography } from 'antd';
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { useDroppable } from '@dnd-kit/core';
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

// ---------------------------------------------------------------------------
// 拖拽数据类型
// ---------------------------------------------------------------------------

/** 拖拽数据：画布放置区。 */
export interface DropzoneData {
  source: 'dropzone';
  parentId: string;
}

// ---------------------------------------------------------------------------
// 可放置区域（编辑模式容器子节点区）
// ---------------------------------------------------------------------------

/** 容器子节点放置区：空状态提示 or 递归渲染子节点。 */
function DroppableArea({
  parentId,
  isEmpty,
  children,
}: {
  parentId: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `dropzone-${parentId}`,
    data: { source: 'dropzone', parentId } as DropzoneData,
  });

  if (isEmpty) {
    return (
      <div
        ref={setNodeRef}
        style={{
          minHeight: 80,
          border: `2px dashed ${isOver ? '#1677ff' : '#d9d9d9'}`,
          borderRadius: 6,
          background: isOver ? '#e6f4ff' : '#fafbfc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease',
        }}
      >
        <Text type="secondary" style={{ fontSize: 13 }}>
          拖拽组件到此处
        </Text>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver ? '#e6f4ff' : 'transparent',
        borderRadius: 4,
        transition: 'background 0.15s ease',
        minHeight: 40,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 编辑模式包裹层（选中边框 + 悬停工具条）
// ---------------------------------------------------------------------------

/** 编辑模式：节点包裹层（选中 + 悬停 + 内容）。 */
function EditNode({ node, ctx, content, isRoot }: WrapEditProps): ReactNode {
  const selectNode = usePageBuilderStore((s) => s.selectNode);
  const removeComponent = usePageBuilderStore((s) => s.removeComponent);
  const duplicateNode = usePageBuilderStore((s) => s.duplicateNode);
  const [hovered, setHovered] = useState(false);

  const meta = getComponentMeta(node.type);
  const isSelected = ctx.selectedNodeId === node.id;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectNode(node.id);
  };

  // 边框样式：选中 > 悬停 > 默认
  let borderColor = 'transparent';
  let boxShadow = 'none';
  if (isSelected) {
    borderColor = '#1677ff';
    boxShadow = '0 0 0 2px rgba(22,119,255,0.1)';
  } else if (hovered) {
    borderColor = '#91caff';
  }

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        border: `2px solid ${borderColor}`,
        borderRadius: 6,
        margin: isRoot ? 0 : '4px 0',
        boxShadow,
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {/* 悬停工具条（非根节点） */}
      {!isRoot && (hovered || isSelected) && (
        <div
          style={{
            position: 'absolute',
            top: -28,
            left: -2,
            height: 28,
            background: '#1677ff',
            borderRadius: '6px 6px 0 0',
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            zIndex: 10,
            whiteSpace: 'nowrap',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12 }}>{node.name || meta.label}</Text>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined style={{ color: '#fff', fontSize: 13 }} />}
            onClick={(e) => {
              e.stopPropagation();
              duplicateNode(node.id);
            }}
            style={{ minHeight: 20, padding: '0 4px' }}
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
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined style={{ color: '#fff', fontSize: 13 }} />}
              onClick={(e) => e.stopPropagation()}
              style={{ minHeight: 20, padding: '0 4px' }}
            />
          </Popconfirm>
        </div>
      )}

      {content}
    </div>
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
 * - 编辑模式：包裹选中边框 + 悬停工具条 + 放置区
 * - 预览模式：纯渲染，无编辑 UI
 *
 * ctx 在此构建（从 usePageBuilderStore + useRuntimeCtx），
 * 然后传递给共享渲染器，递归子节点复用同一 ctx。
 */
export default function ComponentRenderer({ node, isRoot }: ComponentRendererProps) {
  const mode = usePageBuilderStore((s) => s.mode);
  const schema = usePageBuilderStore((s) => s.schema);
  const selectedNodeId = usePageBuilderStore((s) => s.selectedNodeId);
  const selectNode = usePageBuilderStore((s) => s.selectNode);
  const vm = useRuntimeCtx((s) => s.vm);
  const setVariable = useRuntimeCtx((s) => s.setVariable);
  const executeActions = useRuntimeCtx((s) => s.executeActions);
  const queryData = useRuntimeCtx((s) => s.queryData);
  const executeAction = useRuntimeCtx((s) => s.executeAction);

  const runtime: RuntimeState = {
    vm,
    setVariable,
    executeActions,
    queryData,
    executeAction,
  };

  const ctx: RenderContext = {
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
  };

  return <SharedRenderer node={node} ctx={ctx} isRoot={isRoot} />;
}
