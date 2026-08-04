/**
 * 简化模式编辑器 —— 基于 flowgram.ai Fixed Layout 引擎。
 *
 * 对齐 flowgram.ai 官方最佳实践 (fixed-feature-overview):
 *  - 使用 defaultFixedSemiMaterials 作为基础材质,仅覆盖 ADDER
 *  - 使用 materials.renderDefaultNode 注册节点渲染器
 *  - 条件分支节点使用 extend: 'dynamicSplit'(在 condition registry 中)
 *  - 不覆盖几何常量(SPICING/ROUNDED_LINE_RADIUS 等),使用默认值
 *  - 不设 meta.size,继承 DEFAULT_SIZE (280x60)
 *  - 启用 nodeEngine
 *  - 选中节点时显示浮动配置侧边栏
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import {
  FixedLayoutEditorProvider,
  EditorRenderer,
  usePlaygroundTools,
  useClientContext,
  useNodeRender,
} from '@flowgram.ai/fixed-layout-editor';
import { FlowRendererKey } from '@flowgram.ai/renderer';
import { defaultFixedSemiMaterials } from '@flowgram.ai/fixed-semi-materials';
import { Button, Popover, Space, Typography } from 'antd';
import {
  MinusOutlined,
  PlusOutlined,
  CompressOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { WorkflowSchema, WorkflowNode } from '../../api/processes.js';
import {
  ApaasNodeRegistries,
  flowToWorkflowSchema,
  workflowToFlowSchema,
  type FlowDocumentJSON,
  type FlowNodeJSON,
} from '../../../features/process/simplified/src/index.js';
import {
  NODE_GROUPS,
  NODE_META,
  getNodeMeta,
} from '../../constants/process.js';

import '@flowgram.ai/fixed-layout-editor/index.css';
import NodePanel from './NodePanel.js';
import NodeConfigPanel from './NodeConfigPanel.js';
import { useProcessEditorStore } from '../../stores/processEditor.js';

const { Text } = Typography;

export interface SimplifiedEditorProps {
  initialSchema?: WorkflowSchema;
  readonly?: boolean;
  onSchemaChange?: (schema: WorkflowSchema) => void;
  objectOptions?: { label: string; value: string }[];
  formOptions?: { label: string; value: string }[];
  templateOptions?: { label: string; value: string }[];
  onHistoryReady?: (api: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }) => void;
}

export default function SimplifiedEditor({
  initialSchema,
  readonly = false,
  onSchemaChange,
  objectOptions = [],
  formOptions = [],
  templateOptions = [],
  onHistoryReady,
}: SimplifiedEditorProps) {
  const initialDoc = useMemo<FlowDocumentJSON>(() => {
    if (initialSchema && initialSchema.nodes.length > 0) {
      return workflowToFlowSchema(initialSchema);
    }
    return { nodes: [], edges: [], groups: [] };
  }, [initialSchema]);

  /**
   * editorProps — 对齐 flowgram.ai 官方最佳实践。
   *
   * 关键配置:
   *  1. materials.components 展开默认材质,仅覆盖 ADDER
   *  2. materials.renderDefaultNode 注册节点渲染器
   *  3. 不覆盖几何常量(使用默认 NODE_SPACING=32, ROUNDED_LINE_RADIUS=16)
   *  4. 启用 nodeEngine
   *  5. 不设 meta.size(继承 DEFAULT_SIZE 280x60)
   */
  const editorProps = useMemo(
    () => ({
      initialData: initialDoc,
      nodeRegistries: ApaasNodeRegistries,
      readonly,
      history: { enable: true },
      dragdrop: { enable: true },
      nodeEngine: { enable: true },
      constants: {
        BASE_COLOR: '#B8BCC1',
        BASE_ACTIVATED_COLOR: '#82A7FC',
      },
      materials: {
        components: {
          ...defaultFixedSemiMaterials,
          [FlowRendererKey.ADDER]: ApaasAdder,
        },
        renderDefaultNode: ApaasNodeRenderer,
      },
    }),
    [initialDoc, readonly],
  );

  const createNodeRef = useRef<((type: string, fromId?: string) => void) | null>(null);

  // 存储选项到 window 供 ConfigSidebar 使用
  useEffect(() => {
    const w = window as unknown as { __apaasConfigOptions?: { objectOptions: typeof objectOptions; formOptions: typeof formOptions; templateOptions: typeof templateOptions } };
    w.__apaasConfigOptions = { objectOptions, formOptions, templateOptions };
  }, [objectOptions, formOptions, templateOptions]);

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, background: '#f5f7fa' }}>
      <NodePanel
        readonly={readonly}
        onCreateNode={(type) => createNodeRef.current?.(type)}
      />
      <FixedLayoutEditorProvider {...editorProps}>
        <NodeCreationBridge createNodeRef={createNodeRef} />
        <HistoryBridge onHistoryReady={onHistoryReady} />
        <CanvasColumn
          readonly={readonly}
          onSchemaChange={onSchemaChange}
        />
      </FixedLayoutEditorProvider>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 节点渲染器 — 通过 renderDefaultNode 注册
// ---------------------------------------------------------------------------

/**
 * 分支标签组件 — 订阅 store 中 condition 节点的数据变化。
 */
function BlockOrderIconLabel({
  label, isElse, condition, conditionNodeId,
}: {
  label: string; isElse: boolean; condition: string; conditionNodeId?: string;
}) {
  const conditionData = useProcessEditorStore((s) => {
    if (!s.schema || !conditionNodeId) return null;
    const findNode = (nodes: WorkflowNode[]): WorkflowNode | null => {
      for (const n of nodes) {
        if (n.id === conditionNodeId) return n;
        if (n.blocks) { const f = findNode(n.blocks); if (f) return f; }
      }
      return null;
    };
    return findNode(s.schema.nodes)?.data ?? null;
  });
  const conditions = (conditionData?.conditions as Array<{ label?: string; condition?: string }>) || [];
  const latestCondition = conditions.find((c) => c.label === label)?.condition ?? condition;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 12px', borderRadius: 6, background: '#fafbfc', border: '1px solid #e8eaed', minWidth: 120, maxWidth: 200, userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(0,0,0,0.65)' }}>{label}</span>
        {!isElse && !latestCondition && <Text style={{ fontSize: 11, color: '#ff4d4f' }}>(未配置)</Text>}
        {!isElse && latestCondition && <Text style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>{latestCondition.length > 20 ? latestCondition.substring(0, 20) + '...' : latestCondition}</Text>}
      </div>
    </div>
  );
}

/**
 * 节点渲染器 — 对齐官方 BaseNode 组件模式。
 *
 * 使用 useNodeRender() 获取节点渲染状态和方法。
 * 点击节点时显示配置侧边栏。
 * 固定宽度 240px(对齐官方 simple demo)。
 */
function ApaasNodeRenderer({ node }: { node: { id: string; flowNodeType?: string; getExtInfo?: () => Record<string, unknown> } }) {
  const { startDrag, dragging, activated, onMouseEnter, onMouseLeave, isBlockIcon, isBlockOrderIcon } = useNodeRender();
  const ctx = useClientContext();

  const type = node?.flowNodeType ?? 'unknown';
  const extInfo = node?.getExtInfo?.() ?? {};

  // 系统节点处理
  // blockIcon: 条件分支的菱形图标
  // blockOrderIcon: 分支标签(条件成立/否则)
  // inlineBlocks/block/root: 隐藏的布局容器
  if (type === 'inlineBlocks' || type === 'block' || type === 'root' ||
      type === 'mainInlineBlocks' || type === 'catchInlineBlocks' ||
      type === 'trySlot' || type === 'tryBlock' || type === 'catchBlock' ||
      type === 'dynamicSplit' || type === 'staticSplit' || type === 'simpleSplit') {
    return null;
  }

  // blockIcon: 渲染菱形图标
  if (type === 'blockIcon') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }}>
        <div style={{ width: 24, height: 24, transform: 'rotate(45deg)', background: '#fff', border: '2px solid #1677ff', borderRadius: 4 }} />
      </div>
    );
  }

  // blockOrderIcon: 渲染分支标签
  if (type === 'blockOrderIcon') {
    // 从父级链中找到 condition 节点,读取其 conditions 数组
    const flowNode = ctx.document.getNode(node.id);
    let conditionNode = null;
    let blockIndex = -1;
    if (flowNode) {
      const blockNode = flowNode.parent;
      if (blockNode) {
        const inlineBlocksNode = blockNode.parent;
        if (inlineBlocksNode) {
          blockIndex = (inlineBlocksNode.blocks || []).indexOf(blockNode);
          conditionNode = inlineBlocksNode.parent;
        }
      }
    }
    const conditionExtInfo = conditionNode?.getExtInfo?.() ?? {};
    const conditions = (conditionExtInfo.conditions as Array<{ label?: string; condition?: string }>) || [];
    const branchData = blockIndex >= 0 ? conditions[blockIndex] : undefined;
    const isElse = blockIndex === (conditions.length - 1) || !!(extInfo.isElse as boolean);
    const blockTitle = branchData?.label || (extInfo.title as string) || '';
    const condition = branchData?.condition || '';
    const label = blockTitle || (isElse ? '否则' : '条件成立');

    return <BlockOrderIconLabel label={label} isElse={isElse} condition={condition} conditionNodeId={conditionNode?.id} />;
  }

  const meta = getNodeMeta(type);
  const Icon = meta.icon;
  const title = (extInfo.title as string) || meta.label;
  const summary = getNodeSummary(type, extInfo);
  const isIncomplete = checkNodeIncomplete(type, extInfo);
  const [isSelected, setIsSelected] = useState(false);

  // 监听 selection 变化
  useEffect(() => {
    const check = () => {
      const sel = ctx.selection?.selection;
      setIsSelected(!!(sel && sel.length > 0 && sel[0]?.id === node?.id));
    };
    check();
    const disposable = ctx.selection?.onSelectionChanged?.(check);
    return () => disposable?.dispose?.();
  }, [ctx.selection, node?.id]);

  // 点击选中节点
  const handleClick = () => {
    if (dragging) return;
    const flowNode = ctx.document.getNode(node.id);
    if (flowNode) ctx.selection.selection = [flowNode];
  };

  const borderColor = isSelected
    ? '#1677ff'
    : activated
      ? '#91caff'
      : '#e8eaed';

  return (
    <div
      onMouseDown={startDrag}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={handleClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 10,
        background: '#fff',
        border: `2px solid ${borderColor}`,
        boxShadow: isSelected
          ? '0 2px 12px rgba(22,119,255,0.15)'
          : '0 1px 4px rgba(0,0,0,0.06)',
        cursor: 'grab',
        width: 240,
        opacity: dragging ? 0.5 : 1,
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* 节点头:图标 + 标题 + 警告 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', flexShrink: 0 }}>
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
        <span style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a', flex: 1 }}>
          {title}
        </span>
        {isIncomplete && (
          <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 14 }} />
        )}
      </div>

      {/* 摘要 */}
      {summary && (
        <Text
          style={{
            fontSize: 12,
            color: 'rgba(0,0,0,0.45)',
            padding: '0 16px 8px 40px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {summary}
        </Text>
      )}

      {/* 配置不完整警告 */}
      {isIncomplete && (
        <div style={{ padding: '0 16px 8px 40px' }}>
          <Text style={{ fontSize: 12, color: '#ff4d4f' }}>有未完成的配置</Text>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 配置侧边栏 — 浮在画布右侧
// ---------------------------------------------------------------------------

function ConfigSidebar({ readonly }: { readonly: boolean }) {
  const selectedNodeId = useProcessEditorStore((s) => s.selectedNodeId);
  const schema = useProcessEditorStore((s) => s.schema);
  const updateNodeData = useProcessEditorStore((s) => s.updateNodeData);
  const deleteNodeStore = useProcessEditorStore((s) => s.deleteNode);
  const ctx = useClientContext();

  const selectedNode: WorkflowNode | null = useMemo(() => {
    if (!schema || !selectedNodeId) return null;
    const findNode = (nodes: WorkflowNode[]): WorkflowNode | null => {
      for (const n of nodes) {
        if (n.id === selectedNodeId) return n;
        if (n.blocks) { const f = findNode(n.blocks); if (f) return f; }
      }
      return null;
    };
    return findNode(schema.nodes);
  }, [schema, selectedNodeId]);

  const handleNodeDataChange = useCallback((id: string, data: Record<string, unknown>) => {
    const flowNode = ctx.document.getNode(id);
    if (flowNode) {
      flowNode.updateExtInfo(data);
      // 条件分支节点:同步 conditions 到子 blockOrderIcon 节点
      if (flowNode.flowNodeType === 'condition' && Array.isArray(data.conditions)) {
        const blocks = flowNode.blocks || [];
        for (let i = 0; i < blocks.length; i++) {
          const block = blocks[i];
          if (!block) continue;
          const blockOrderIcon = block.blocks?.[0];
          if (blockOrderIcon) {
            const cond = data.conditions[i];
            blockOrderIcon.updateExtInfo({
              title: cond?.label || (i === blocks.length - 1 ? '否则' : `分支 ${i + 1}`),
              condition: cond?.condition || '',
              isElse: i === blocks.length - 1,
            });
          }
        }
      }
    }
    updateNodeData(id, data);
  }, [ctx.document, updateNodeData]);

  const handleDeleteNode = useCallback((id: string) => {
    ctx.operation.deleteNode(id);
    deleteNodeStore(id);
  }, [ctx.operation, deleteNodeStore]);

  if (!selectedNode || readonly) return null;

  const w = window as unknown as { __apaasConfigOptions?: { objectOptions: { label: string; value: string }[]; formOptions: { label: string; value: string }[]; templateOptions: { label: string; value: string }[] } };
  const options = w.__apaasConfigOptions ?? { objectOptions: [], formOptions: [], templateOptions: [] };

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 400,
      background: '#fff', borderLeft: '1px solid #eef0f4',
      boxShadow: '-4px 0 12px rgba(0,0,0,0.06)', zIndex: 100,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid #eef0f4',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <Text strong style={{ fontSize: 14 }}>节点配置</Text>
        <Button type="text" size="small" onClick={() => { ctx.selection.selection = []; }}>✕</Button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <NodeConfigPanel
          node={selectedNode}
          readonly={false}
          objectOptions={options.objectOptions}
          formOptions={options.formOptions}
          templateOptions={options.templateOptions}
          onNodeDataChange={handleNodeDataChange}
          onDeleteNode={handleDeleteNode}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

function checkNodeIncomplete(type: string, data: Record<string, unknown>): boolean {
  switch (type) {
    case 'trigger': return !data.triggerType;
    case 'userTask': return !data.assigneeId || !data.approvalMode;
    case 'notification': return !data.channel || !data.recipient;
    case 'objectOperation': return !data.operation || !data.objectId;
    case 'httpRequest': return !data.method || !data.url;
    case 'delay': return !data.duration;
    case 'start': case 'end': case 'assign': return false;
    default: return false;
  }
}

function getNodeSummary(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case 'trigger': { const t = data.triggerType as string; return t ? `触发: ${t}` : ''; }
    case 'userTask': { const a = data.assigneeId as string; const m = data.approvalMode as string; const p: string[] = []; if (a) p.push(`审批人: ${a}`); if (m) p.push(m); return p.join(' · '); }
    case 'notification': { const c = data.channel as string; const r = data.recipient as string; const p: string[] = []; if (c) p.push(`渠道: ${c}`); if (r) p.push(`接收人: ${r}`); return p.join(' · '); }
    case 'objectOperation': { const o = data.operation as string; const obj = data.objectId as string; const p: string[] = []; if (o) p.push(o); if (obj) p.push(obj); return p.join(' · '); }
    case 'httpRequest': { const m = data.method as string; const u = data.url as string; if (m && u) return `${m} ${u}`; return m ?? ''; }
    case 'delay': { const d = data.duration as string | number; const u = data.unit as string; if (d) return `等待 ${d}${u ?? ''}`; return ''; }
    case 'condition': return '条件分支';
    case 'assign': return '变量赋值';
    default: return '';
  }
}

// ---------------------------------------------------------------------------
// Adder — 节点间"+"按钮(对齐官方 Adder 组件)
// ---------------------------------------------------------------------------

/**
 * Adder 组件 — 对齐官方 Adder 模式。
 * Props: { from: FlowNodeEntity, to?: FlowNodeEntity, hoverActivated: boolean }
 */
function ApaasAdder(props: {
  from?: { id: string };
  to?: { id: string };
  hoverActivated?: boolean;
  [key: string]: unknown;
}) {
  const ctx = useClientContext();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const playground = ctx.playground as unknown as { config?: { readonly?: boolean } };
  if (playground?.config?.readonly) return null;

  const handleSelect = (type: string) => {
    if (!props.from?.id) return;
    const meta = getNodeMeta(type);
    const nodeId = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nodeJSON: FlowNodeJSON = { id: nodeId, type, data: { title: meta.label } };

    // 条件分支节点:提供初始 blocks 数据,让 DynamicSplitRegistry.onCreate 创建分支
    if (type === 'condition') {
      nodeJSON.blocks = [
        { id: `$ifBlock$${nodeId}`, type: 'block', data: { title: '条件成立', isElse: false } },
        { id: `$elseBlock$${nodeId}`, type: 'block', data: { title: '否则', isElse: true } },
      ];
      nodeJSON.data = { title: meta.label, conditions: [
        { label: '条件成立', condition: '' },
        { label: '否则', condition: '' },
      ] };
    }

    const fromNode = ctx.document.getNode(props.from.id);
    if (fromNode) ctx.operation.addFromNode(fromNode, nodeJSON);
    setPopoverOpen(false);
  };

  const content = (
    <div style={{ width: 320, maxHeight: 400, overflow: 'auto' }}>
      {NODE_GROUPS.map((group) => (
        <div key={group.category} style={{ marginBottom: 8 }}>
          <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(0,0,0,0.45)' }}>
            {group.title}
          </Text>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {group.types.map((type) => {
              const meta = NODE_META[type];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <div
                  key={type}
                  onClick={() => handleSelect(type)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    padding: '6px 2px', borderRadius: 6, border: '1px solid #eef0f4',
                    background: '#fff', cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 4,
                    background: `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)`,
                    color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon style={{ fontSize: 11 }} />
                  </div>
                  <Text style={{ fontSize: 10, textAlign: 'center' }}>{meta.label}</Text>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <Popover
      open={popoverOpen}
      onOpenChange={setPopoverOpen}
      content={content}
      trigger="click"
      placement="right"
      overlayStyle={{ padding: 0 }}
    >
      <div
        style={{
          width: props.hoverActivated ? 20 : 8,
          height: props.hoverActivated ? 20 : 8,
          borderRadius: '50%',
          background: props.hoverActivated ? '#fff' : '#d9d9d9',
          border: props.hoverActivated ? '2px solid #1677ff' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', margin: '4px auto', transition: 'all 0.15s ease',
        }}
      >
        {props.hoverActivated && <PlusOutlined style={{ fontSize: 10, color: '#1677ff' }} />}
      </div>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// 节点创建 — 从左侧面板拖放
// ---------------------------------------------------------------------------

const NODE_TYPE_MIME = 'application/x-apaas-node-type';

function useCreateNode() {
  const ctx = useClientContext();
  return useCallback((type: string, fromId?: string) => {
    const meta = getNodeMeta(type);
    const nodeId = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nodeJSON: FlowNodeJSON = { id: nodeId, type, data: { title: meta.label } };

    // 条件分支节点:提供初始 blocks 数据,让 DynamicSplitRegistry.onCreate 创建分支
    if (type === 'condition') {
      nodeJSON.blocks = [
        { id: `$ifBlock$${nodeId}`, type: 'block', data: { title: '条件成立', isElse: false } },
        { id: `$elseBlock$${nodeId}`, type: 'block', data: { title: '否则', isElse: true } },
      ];
      nodeJSON.data = { title: meta.label, conditions: [
        { label: '条件成立', condition: '' },
        { label: '否则', condition: '' },
      ] };
    }

    if (fromId) {
      const fromNode = ctx.document.getNode(fromId);
      if (fromNode) { ctx.operation.addFromNode(fromNode, nodeJSON); return; }
    }
    const allNodes = ctx.document.getAllNodes();
    let anchorNode = undefined;
    for (let i = allNodes.length - 1; i >= 0; i--) {
      const n = allNodes[i];
      if (n && n.flowNodeType !== 'end') { anchorNode = n; break; }
    }
    if (anchorNode) ctx.operation.addFromNode(anchorNode, nodeJSON);
    else ctx.operation.addNode(nodeJSON);
  }, [ctx]);
}

function NodeCreationBridge({ createNodeRef }: { createNodeRef: React.MutableRefObject<((type: string, fromId?: string) => void) | null> }) {
  const createNode = useCreateNode();
  useEffect(() => { createNodeRef.current = createNode; return () => { createNodeRef.current = null; }; }, [createNode]);
  return null;
}

// ---------------------------------------------------------------------------
// 撤销/重做桥接
// ---------------------------------------------------------------------------

function HistoryBridge({ onHistoryReady }: { onHistoryReady?: (api: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }) => void }) {
  const tools = usePlaygroundTools();
  const onReadyRef = useRef(onHistoryReady);
  onReadyRef.current = onHistoryReady;
  useEffect(() => {
    onReadyRef.current?.({ undo: () => tools.undo(), redo: () => tools.redo(), canUndo: tools.canUndo, canRedo: tools.canRedo });
  }, [tools.canUndo, tools.canRedo, tools]);
  return null;
}

// ---------------------------------------------------------------------------
// 中栏:画布 + 缩放工具 + 配置侧边栏 + schema 桥接
// ---------------------------------------------------------------------------

interface CanvasColumnProps {
  readonly: boolean;
  onSchemaChange?: (schema: WorkflowSchema) => void;
}

function CanvasColumn({ readonly, onSchemaChange }: CanvasColumnProps) {
  const createNode = useCreateNode();
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      onDragOver={(e) => { if (!readonly) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!isDragOver) setIsDragOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDragOver(false); }}
      onDrop={(e) => {
        if (readonly) return;
        e.preventDefault(); setIsDragOver(false);
        const type = e.dataTransfer.getData(NODE_TYPE_MIME);
        if (type) createNode(type);
      }}
      style={{
        flex: 1, position: 'relative', minHeight: 0,
        background: isDragOver ? '#e6f4ff' : '#f5f7fa',
        outline: isDragOver ? '2px dashed #1677ff' : 'none', outlineOffset: -2,
        overflow: 'hidden', transition: 'background 0.15s ease',
      }}
    >
      {/* CSS 覆盖:禁用 flowgram 选择框/连线层的 pointer-events */}
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
      `}</style>
      <EditorRenderer />
      {!readonly && <ZoomToolbar />}
      <ConfigSidebar readonly={readonly} />
      <SelectionBridge onSchemaChange={onSchemaChange} />
    </div>
  );
}

function ZoomToolbar() {
  const tools = usePlaygroundTools();
  return (
    <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
      <Space size={2}>
        <Button size="small" type="text" icon={<MinusOutlined />} onClick={() => tools.zoomout()} />
        <span style={{ fontSize: 12, minWidth: 36, textAlign: 'center', color: 'rgba(0,0,0,0.65)' }}>{Math.round(tools.zoom * 100)}%</span>
        <Button size="small" type="text" icon={<PlusOutlined />} onClick={() => tools.zoomin()} />
        <Button size="small" type="text" icon={<CompressOutlined />} onClick={() => void tools.fitView()} />
      </Space>
    </div>
  );
}

function SelectionBridge({ onSchemaChange }: { onSchemaChange?: (schema: WorkflowSchema) => void }) {
  const ctx = useClientContext();
  const setSelectedNode = useProcessEditorStore((s) => s.setSelectedNode);
  const onSchemaChangeRef = useRef(onSchemaChange);
  onSchemaChangeRef.current = onSchemaChange;

  const exportSchema = useCallback(() => {
    const doc = ctx.document.toJSON() as FlowDocumentJSON;
    return flowToWorkflowSchema(doc);
  }, [ctx.document]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    let lastDocSig = '';
    const interval = setInterval(() => {
      const sel = ctx.selection?.selection;
      const newId = sel && sel.length > 0 ? (sel[0]?.id ?? null) : null;
      setSelectedId((prev) => (prev !== newId ? newId : prev));
      if (onSchemaChangeRef.current) {
        const schema = exportSchema();
        const sig = JSON.stringify(schema);
        if (sig !== lastDocSig) { lastDocSig = sig; onSchemaChangeRef.current(schema); }
      }
    }, 300);
    return () => clearInterval(interval);
  }, [ctx.selection, ctx.document, exportSchema]);

  useEffect(() => { setSelectedNode(selectedId); }, [selectedId, setSelectedNode]);
  return null;
}
