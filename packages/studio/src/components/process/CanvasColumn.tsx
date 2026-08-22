/**
 * 中栏 — 画布 + 缩放工具 + 配置侧边栏 + 事件桥接。
 *
 * 从 SimplifiedEditor.tsx 提取。
 */

import { createPortal } from 'react-dom';
import { useState } from 'react';
import { EditorRenderer, usePlaygroundTools } from '@flowgram.ai/fixed-layout-editor';
import { Button, Space } from 'antd';
import {
  MinusOutlined,
  PlusOutlined,
  CompressOutlined,
  ColumnHeightOutlined,
  ColumnWidthOutlined,
} from '@ant-design/icons';
import type { WorkflowSchema } from '../../api/processes.js';
import { ConfigSidebar } from './ConfigSidebar.js';
import { EventBridge } from './EventBridge.js';
import { useCreateNode, useFindDropAnchor, NODE_TYPE_MIME } from './nodeCreation.js';

interface CanvasColumnProps {
  readonly: boolean;
  onSchemaChange?: (schema: WorkflowSchema) => void;
}

export function CanvasColumn({ readonly, onSchemaChange }: CanvasColumnProps) {
  const createNode = useCreateNode();
  const findDropAnchor = useFindDropAnchor();
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        if (!readonly) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (!isDragOver) setIsDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDragOver(false);
      }}
      onDrop={(e) => {
        if (readonly) return;
        e.preventDefault();
        setIsDragOver(false);
        const type = e.dataTransfer.getData(NODE_TYPE_MIME);
        if (type) {
          const anchorId = findDropAnchor(e);
          createNode(type, anchorId);
        }
      }}
      style={{
        flex: 1,
        position: 'relative',
        minHeight: 0,
        background: isDragOver ? '#e6f4ff' : '#f5f7fa',
        outline: isDragOver ? '2px dashed #1677ff' : 'none',
        outlineOffset: -2,
        overflow: 'hidden',
        transition: 'background 0.15s ease',
      }}
    >
      <style>{`
        .gedit-selector-bounds-foreground,
        .gedit-selector-bounds-background,
        .gedit-selector-bounds-layer,
        .gedit-flow-lines-layer {
          pointer-events: none !important;
        }
        .flow-canvas-adder {
          pointer-events: auto !important;
        }
        .apaas-config-sidebar,
        .apaas-config-sidebar * {
          pointer-events: auto !important;
        }
      `}</style>
      <EditorRenderer />
      {!readonly && <ZoomToolbar />}
      {createPortal(<ConfigSidebar readonly={readonly} />, document.body)}
      <EventBridge onSchemaChange={onSchemaChange} />
    </div>
  );
}

function ZoomToolbar() {
  const tools = usePlaygroundTools();
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 10,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        padding: 4,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Space size={2}>
        <Button size="small" type="text" icon={<MinusOutlined />} onClick={() => tools.zoomout()} />
        <span
          style={{ fontSize: 12, minWidth: 36, textAlign: 'center', color: 'rgba(0,0,0,0.65)' }}
        >
          {Math.round(tools.zoom * 100)}%
        </span>
        <Button size="small" type="text" icon={<PlusOutlined />} onClick={() => tools.zoomin()} />
        <Button
          size="small"
          type="text"
          icon={<CompressOutlined />}
          onClick={() => void tools.fitView()}
        />
        <Button
          size="small"
          type="text"
          title={tools.isVertical ? '切换为水平布局' : '切换为垂直布局'}
          icon={tools.isVertical ? <ColumnWidthOutlined /> : <ColumnHeightOutlined />}
          onClick={() => tools.changeLayout()}
        />
      </Space>
    </div>
  );
}
