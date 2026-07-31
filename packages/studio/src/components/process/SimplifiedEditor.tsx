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

import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import {
  FixedLayoutEditorProvider,
  EditorRenderer,
  usePlaygroundTools,
  useClientContext,
} from '@flowgram.ai/fixed-layout-editor';
import { FlowRendererKey } from '@flowgram.ai/renderer';
import { Button, Space } from 'antd';
import {
  MinusOutlined,
  PlusOutlined,
  CompressOutlined,
} from '@ant-design/icons';
import type { WorkflowSchema, WorkflowNode } from '../../api/processes.js';
import {
  ApaasNodeRegistries,
  initialData,
  flowToWorkflowSchema,
  workflowToFlowSchema,
  type FlowDocumentJSON,
} from '../../../features/process/simplified/src/index.js';
import { getNodeMeta } from '../../constants/process.js';

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

  /**
   * materials 配置 — 注册 flowgram 渲染器组件。
   *
   * FixedLayoutEditorProvider 不内置默认渲染组件,需通过 materials.components 提供。
   * flowgram 渲染层通过 FlowRendererKey 查找组件,缺少注册时抛出
   * "Unknown render key <key>"。这里注册全部所需 key:
   *  - node-render:        节点画布渲染器(form-core 的 NodeRender)
   *  - drag-node:          拖拽预览
   *  - adder / *-adder:    节点间"+"添加按钮
   *  - collapse:           折叠/展开按钮
   *  - branch-adder:       分支添加按钮
   *  - try-catch-collapse: try-catch 折叠
   *  - arrow-renderer:     连线箭头
   *  - marker-*:           箭头标记
   */
  const editorProps = useMemo(
    () => ({
      initialData: initialDoc,
      nodeRegistries: ApaasNodeRegistries,
      readonly,
      history: { enable: true },
      materials: {
        components: {
          [FlowRendererKey.NODE_RENDER]: ApaasNodeRenderer,
          [FlowRendererKey.DRAG_NODE]: ApaasNodeRenderer,
          [FlowRendererKey.ADDER]: NoopRenderer,
          [FlowRendererKey.DRAGGABLE_ADDER]: NoopRenderer,
          [FlowRendererKey.DRAG_HIGHLIGHT_ADDER]: NoopRenderer,
          [FlowRendererKey.DRAG_BRANCH_HIGHLIGHT_ADDER]: NoopRenderer,
          [FlowRendererKey.COLLAPSE]: NoopRenderer,
          [FlowRendererKey.BRANCH_ADDER]: NoopRenderer,
          [FlowRendererKey.TRY_CATCH_COLLAPSE]: NoopRenderer,
          [FlowRendererKey.ARROW_RENDERER]: NoopRenderer,
          [FlowRendererKey.MARKER_ARROW]: NoopRenderer,
          [FlowRendererKey.MARKER_ACTIVATE_ARROW]: NoopRenderer,
        },
      },
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
// 节点渲染器 — 在 flowgram 画布上渲染 aPaaS 业务节点卡片
// ---------------------------------------------------------------------------

/** flowgram 渲染器传入的 props(node/version/activated/readonly)。 */
interface NodeRendererProps {
  node?: { flowNodeType?: string; getExtInfo?: () => Record<string, unknown> };
  activated?: boolean;
  readonly?: boolean;
}

/**
 * 自定义节点渲染器,替代 flowgram 默认的 NodeRender。
 *
 * flowgram 渲染层通过 materials.components[node-render] 调用此组件,
 * 传入 { node, activated, readonly } props。
 * 根据 node.flowNodeType 查找 aPaaS 节点元数据(图标/颜色/标签)并渲染卡片。
 */
const ApaasNodeRenderer: FC<NodeRendererProps> = ({ node, activated, readonly }) => {
  const type = node?.flowNodeType ?? 'unknown';
  const extInfo = node?.getExtInfo?.() ?? {};
  const meta = getNodeMeta(type);
  const Icon = meta.icon;
  const title = (extInfo.title as string) || meta.label;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        borderRadius: 10,
        background: '#fff',
        border: `2px solid ${activated ? '#1677ff' : '#e8eaed'}`,
        boxShadow: activated
          ? '0 2px 12px rgba(22,119,255,0.15)'
          : '0 1px 4px rgba(0,0,0,0.06)',
        cursor: readonly ? 'default' : 'pointer',
        minHeight: 48,
        minWidth: 180,
        transition: 'all 0.2s ease',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)`,
          color: '#fff',
          fontSize: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon style={{ fontSize: 18 }} />
      </div>
      <span style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a' }}>
        {title}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 空渲染器 — flowgram 辅助渲染 key(adder/collapse/arrow 等)的占位组件
// ---------------------------------------------------------------------------

/** 不渲染任何内容的占位组件,供 adder/collapse/arrow 等辅助 render key 使用。 */
const NoopRenderer: FC = () => null;

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

  /** 轮询选中变化(flowgram 不导出 useListenEvents,用定时器替代)。 */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    const interval = setInterval(() => {
      const sel = ctx.selection?.selection;
      const newId = sel && sel.length > 0 ? (sel[0]?.id ?? null) : null;
      setSelectedId((prev) => (prev !== newId ? newId : prev));
    }, 300);
    return () => clearInterval(interval);
  }, [ctx.selection]);

  useEffect(() => {
    setSelectedNode(selectedId);
  }, [selectedId, setSelectedNode]);

  /** 导出当前 Schema(防抖)。 */
  const exportSchema = useCallback(() => {
    const doc = ctx.document.toJSON() as FlowDocumentJSON;
    return flowToWorkflowSchema(doc);
  }, [ctx.document]);

  // 文档变化时回调(定时导出)。
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
