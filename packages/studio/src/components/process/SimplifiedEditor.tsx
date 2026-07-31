/**
 * 简化模式编辑器(三栏外壳) —— 对齐 DESIGN-process.md §3。
 *
 * 基于 flowgram.ai Fixed Layout 引擎(复用 @apaas/process-simplified 的
 * ApaasNodeRegistries / initialData / schema-serializer),在其外层封装三栏:
 *  - 左栏(280px): 节点面板(NodePanel,可拖拽)
 *  - 中栏: flowgram Fixed Layout 画布(EditorRenderer + 缩放工具)
 *  - 右栏(360px): 节点配置面板(NodeConfigPanel)
 *
 * 不修改 features/process/simplified 的核心代码,仅复用其导出物料与序列化器。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FixedLayoutEditorProvider,
  EditorRenderer,
  usePlaygroundTools,
  useClientContext,
  useListenEvents,
} from '@flowgram.ai/fixed-layout-editor';
import { Button, Space } from 'antd';
import {
  MinusOutlined,
  PlusOutlined,
  CompressOutlined,
} from '@ant-design/icons';
import type { WorkflowSchema, WorkflowNode } from '@apaas/shared';
import {
  ApaasNodeRegistries,
  initialData,
  flowToWorkflowSchema,
  workflowToFlowSchema,
  type FlowDocumentJSON,
} from '../../../features/process/simplified/src/index.js';

import '@flowgram.ai/fixed-layout-editor/index.css';
import NodePanel from './NodePanel.js';
import NodeConfigPanel from './NodeConfigPanel.js';
import { useProcessEditorStore } from '../../stores/processEditor.js';

export interface SimplifiedEditorProps {
  /** 初始 WorkflowSchema(从 ProcessDef.workflowSchema 转换) */
  initialSchema?: WorkflowSchema;
  /** 只读模式(标准→简化含高级元素时) */
  readonly?: boolean;
  /** Schema 变化回调(防抖保存) */
  onSchemaChange?: (schema: WorkflowSchema) => void;
  /** 对象候选(配置面板用) */
  objectOptions?: { label: string; value: string }[];
  /** 表单候选(人工任务用) */
  formOptions?: { label: string; value: string }[];
  /** 通知模版候选 */
  templateOptions?: { label: string; value: string }[];
}

export default function SimplifiedEditor({
  initialSchema,
  readonly = false,
  onSchemaChange,
  objectOptions = [],
  formOptions = [],
  templateOptions = [],
}: SimplifiedEditorProps) {
  /** 初始 flowgram 文档(从 WorkflowSchema 转换,或内置示例)。 */
  const initialDoc = useMemo<FlowDocumentJSON>(() => {
    if (initialSchema && initialSchema.nodes.length > 0) {
      return workflowToFlowSchema(initialSchema);
    }
    return initialData;
  }, [initialSchema]);

  const editorProps = useMemo(
    () => ({
      initialData: initialDoc,
      nodeRegistries: ApaasNodeRegistries,
      readonly,
    }),
    [initialDoc, readonly],
  );

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, background: '#f5f7fa' }}>
      <NodePanel readonly={readonly} />
      <FixedLayoutEditorProvider {...editorProps}>
        <CanvasColumn readonly={readonly} onSchemaChange={onSchemaChange} />
      </FixedLayoutEditorProvider>
      <ConfigColumn
        readonly={readonly}
        objectOptions={objectOptions}
        formOptions={formOptions}
        templateOptions={templateOptions}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 中栏:画布 + 缩放工具 + 选中/schema 桥接
// ---------------------------------------------------------------------------

interface CanvasColumnProps {
  readonly: boolean;
  onSchemaChange?: (schema: WorkflowSchema) => void;
}

function CanvasColumn({ readonly, onSchemaChange }: CanvasColumnProps) {
  return (
    <div
      style={{
        flex: 1,
        position: 'relative',
        minHeight: 0,
        background: '#f5f7fa',
        overflow: 'hidden',
      }}
    >
      <EditorRenderer />
      {!readonly && <ZoomToolbar />}
      <SelectionBridge onSchemaChange={onSchemaChange} />
    </div>
  );
}

/**
 * 缩放工具(右上浮动) —— 复用 usePlaygroundTools。
 */
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
        <Button
          size="small"
          type="text"
          icon={<MinusOutlined />}
          onClick={() => tools.zoomout()}
        />
        <span style={{ fontSize: 12, minWidth: 36, textAlign: 'center', color: 'rgba(0,0,0,0.65)' }}>
          {Math.round(tools.zoom * 100)}%
        </span>
        <Button
          size="small"
          type="text"
          icon={<PlusOutlined />}
          onClick={() => tools.zoomin()}
        />
        <Button
          size="small"
          type="text"
          icon={<CompressOutlined />}
          onClick={() => void tools.fitView()}
        />
      </Space>
    </div>
  );
}

/**
 * 选中状态 / Schema 变化桥接(在 FixedLayoutEditorProvider 内运行)。
 *
 * - 监听 selection.onSelectionChanged,同步选中节点 ID 到 store
 * - 监听 document 数据变化,导出 WorkflowSchema 回调
 */
function SelectionBridge({
  onSchemaChange,
}: {
  onSchemaChange?: (schema: WorkflowSchema) => void;
}) {
  const ctx = useClientContext();
  const setSelectedNode = useProcessEditorStore((s) => s.setSelectedNode);
  const onSchemaChangeRef = useRef(onSchemaChange);
  onSchemaChangeRef.current = onSchemaChange;

  // 监听选中变化(useListenEvents 触发重渲染)
  useListenEvents(ctx.selection.onSelectionChanged);

  /** 当前选中节点 ID。 */
  const selectedId = useMemo(() => {
    const sel = ctx.selection.selection;
    if (!sel || sel.length === 0) return null;
    const first = sel[0];
    return first?.id ?? null;
  }, [ctx.selection.selection]);

  useEffect(() => {
    setSelectedNode(selectedId);
  }, [selectedId, setSelectedNode]);

  /** 导出当前 Schema(防抖)。 */
  const exportSchema = useCallback(() => {
    const doc = ctx.document.toJSON() as FlowDocumentJSON;
    return flowToWorkflowSchema(doc);
  }, [ctx.document]);

  // 文档变化时回调(简易:每次 selection 变化或定时导出)。
  // 自动保存由父组件(PageBuilder 层)防抖处理,这里仅提供导出能力。
  useEffect(() => {
    if (onSchemaChangeRef.current) {
      const schema = exportSchema();
      onSchemaChangeRef.current(schema);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.document, exportSchema]);

  return null;
}

// ---------------------------------------------------------------------------
// 右栏:节点配置面板(从 store 取选中节点)
// ---------------------------------------------------------------------------

interface ConfigColumnProps {
  readonly: boolean;
  objectOptions: { label: string; value: string }[];
  formOptions: { label: string; value: string }[];
  templateOptions: { label: string; value: string }[];
}

function ConfigColumn({
  readonly,
  objectOptions,
  formOptions,
  templateOptions,
}: ConfigColumnProps) {
  const schema = useProcessEditorStore((s) => s.schema);
  const selectedNodeId = useProcessEditorStore((s) => s.selectedNodeId);
  const updateNodeData = useProcessEditorStore((s) => s.updateNodeData);
  const deleteNode = useProcessEditorStore((s) => s.deleteNode);

  const selectedNode: WorkflowNode | null = useMemo(() => {
    if (!schema || !selectedNodeId) return null;
    return schema.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [schema, selectedNodeId]);

  const handleNodeDataChange = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      updateNodeData(nodeId, data);
    },
    [updateNodeData],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      deleteNode(nodeId);
    },
    [deleteNode],
  );

  return (
    <NodeConfigPanel
      node={selectedNode}
      readonly={readonly}
      objectOptions={objectOptions}
      formOptions={formOptions}
      templateOptions={templateOptions}
      onNodeDataChange={handleNodeDataChange}
      onDeleteNode={handleDeleteNode}
    />
  );
}
