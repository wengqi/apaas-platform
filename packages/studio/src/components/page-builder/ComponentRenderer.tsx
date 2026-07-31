import { useState } from 'react';
import { Button, Divider, Popconfirm, Statistic, Typography } from 'antd';
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { useDroppable } from '@dnd-kit/core';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import { getComponentMeta } from '../../constants/pageComponents.js';
import type { ComponentNode, ComponentType } from '../../api/pages.js';

const { Text } = Typography;

/** 拖拽数据:画布放置区。 */
export interface DropzoneData {
  source: 'dropzone';
  parentId: string;
}

// ---------------------------------------------------------------------------
// 顶层:根据模式分流(编辑 / 预览)
// ---------------------------------------------------------------------------

interface ComponentRendererProps {
  node: ComponentNode;
  isRoot?: boolean;
}

/**
 * 组件节点递归渲染器。
 * - 编辑模式:包裹选中边框 + 悬停工具条 + 放置区
 * - 预览模式:纯渲染,无编辑 UI
 */
export default function ComponentRenderer({ node, isRoot }: ComponentRendererProps) {
  const mode = usePageBuilderStore((s) => s.mode);

  if (mode === 'preview') {
    return <PreviewNode node={node} isRoot={isRoot} />;
  }
  return <EditNode node={node} isRoot={isRoot} />;
}

// ---------------------------------------------------------------------------
// 编辑模式渲染
// ---------------------------------------------------------------------------

/** 编辑模式:节点包裹层(选中 + 悬停 + 内容)。 */
function EditNode({ node, isRoot }: ComponentRendererProps) {
  const selectedNodeId = usePageBuilderStore((s) => s.selectedNodeId);
  const selectNode = usePageBuilderStore((s) => s.selectNode);
  const removeComponent = usePageBuilderStore((s) => s.removeComponent);
  const duplicateNode = usePageBuilderStore((s) => s.duplicateNode);
  const [hovered, setHovered] = useState(false);

  const meta = getComponentMeta(node.type);
  const isSelected = selectedNodeId === node.id;
  const isContainer = meta.isContainer;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectNode(node.id);
  };

  // 边框样式:选中 > 悬停 > 默认
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
      {/* 悬停工具条(非根节点) */}
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
          <Text style={{ color: '#fff', fontSize: 12 }}>
            {node.name || meta.label}
          </Text>
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
            description={`确定删除「${node.name || meta.label}」吗?`}
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

      {/* 组件内容 */}
      {isContainer ? (
        <ContainerContent node={node} isRoot={isRoot} />
      ) : (
        <ComponentPreview node={node} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 预览模式渲染(无编辑 UI,无 dnd-kit hooks)
// ---------------------------------------------------------------------------

/** 预览模式:纯渲染。 */
function PreviewNode({ node, isRoot }: ComponentRendererProps) {
  const meta = getComponentMeta(node.type);
  const isContainer = meta.isContainer;

  if (isContainer) {
    const children = node.children ?? [];
    return (
      <div style={{ padding: isRoot ? 0 : 8 }}>
        {!isRoot && (
          <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>
            {node.name || meta.label}
          </div>
        )}
        {children.length === 0 ? (
          <div style={{ minHeight: 40, background: '#fafbfc', borderRadius: 6 }} />
        ) : (
          children.map((child) => (
            <PreviewNode key={child.id} node={child} />
          ))
        )}
      </div>
    );
  }

  return <ComponentPreview node={node} />;
}

// ---------------------------------------------------------------------------
// 容器内容(含放置区)
// ---------------------------------------------------------------------------

/** 容器内容:标签 + 子节点放置区(useDroppable)。 */
function ContainerContent({ node, isRoot }: { node: ComponentNode; isRoot?: boolean }) {
  const meta = getComponentMeta(node.type);

  return (
    <div style={{ padding: isRoot ? 0 : 8 }}>
      {/* 容器标签(非根) */}
      {!isRoot && (
        <div
          style={{
            fontSize: 12,
            color: 'rgba(0,0,0,0.45)',
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {node.name || meta.label}
        </div>
      )}
      <DroppableChildren node={node} />
    </div>
  );
}

/** 可放置的子节点区域:空状态提示 or 递归渲染子节点。 */
function DroppableChildren({ node }: { node: ComponentNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `dropzone-${node.id}`,
    data: { source: 'dropzone', parentId: node.id } as DropzoneData,
  });

  const children = node.children ?? [];

  if (children.length === 0) {
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
      {children.map((child) => (
        <ComponentRenderer key={child.id} node={child} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 组件预览(非容器组件的实际渲染)
// ---------------------------------------------------------------------------

/** 安全获取字符串属性值。 */
function getPropAsString(node: ComponentNode, key: string): string {
  const value = node.props[key];
  if (typeof value === 'string') return value;
  return '';
}

/** 安全获取数字属性值。 */
function getPropAsNumber(node: ComponentNode, key: string): number {
  const value = node.props[key];
  if (typeof value === 'number') return value;
  return 0;
}

/**
 * 非容器组件的搭建态预览。
 * MVP 使用占位渲染,后续接入真实组件库。
 */
function ComponentPreview({ node }: { node: ComponentNode }) {
  const meta = getComponentMeta(node.type);
  const Icon = meta.icon;

  // 按组件类型渲染简化预览
  switch (node.type) {
    case 'button': {
      const text = getPropAsString(node, 'text') || '按钮';
      return (
        <div style={{ padding: 8 }}>
          <Button type="primary">{text}</Button>
        </div>
      );
    }
    case 'text': {
      const content = getPropAsString(node, 'content') || '文本内容';
      return (
        <div style={{ padding: 8 }}>
          <Text>{content}</Text>
        </div>
      );
    }
    case 'statistic': {
      const title = getPropAsString(node, 'title') || '统计';
      const value = getPropAsNumber(node, 'value');
      return (
        <div style={{ padding: 8 }}>
          <Statistic title={title} value={value} />
        </div>
      );
    }
    case 'divider':
      return <div style={{ padding: '8px 4px' }}><Divider style={{ margin: 0 }} /></div>;
    default:
      // 通用占位:图标 + 组件名 + 类型
      return (
        <div
          style={{
            padding: 12,
            background: '#fafbfc',
            border: '1px dashed #eef0f4',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minHeight: 40,
          }}
        >
          <Icon style={{ fontSize: 18, color: '#1677ff', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <Text strong style={{ fontSize: 13 }}>
              {node.name || meta.label}
            </Text>
            <div>
              <Text
                type="secondary"
                style={{ fontSize: 11, fontFamily: 'monospace' }}
              >
                {node.type}
              </Text>
            </div>
          </div>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// 辅助:根据 ComponentType 获取图标(供 PageBuilder DragOverlay 使用)
// ---------------------------------------------------------------------------

/** 获取组件类型的图标组件。 */
export function getComponentIcon(type: ComponentType) {
  return getComponentMeta(type).icon;
}
