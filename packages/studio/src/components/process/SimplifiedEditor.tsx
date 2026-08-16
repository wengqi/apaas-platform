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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ColumnHeightOutlined,
  ColumnWidthOutlined,
} from '@ant-design/icons';
import type { WorkflowSchema, WorkflowNode } from '../../api/processes.js';
import {
  ApaasNodeRegistries,
  flowToWorkflowSchema,
  workflowToFlowSchema,
  type FlowDocumentJSON,
  type FlowNodeJSON,
} from '../../../features/process/simplified/src/index.js';
import { NODE_GROUPS, NODE_META, getNodeMeta } from '../../constants/process.js';

import '@flowgram.ai/fixed-layout-editor/index.css';
import NodeConfigPanel from './NodeConfigPanel.js';
import { useProcessEditorStore } from '../../stores/processEditor.js';
import { jsonLogicToExpression } from './configs/jsonlogic-utils.js';

const { Text } = Typography;

/**
 * 获取 dynamicSplit 条件节点的分支 block 列表。
 *
 * flowgram 的 dynamicSplit 节点结构：
 *   conditionNode
 *     ├── $blockIcon$<id>      (结构系统节点)
 *     ├── $inlineBlocks$<id>   (结构系统节点)
 *     │     ├── block (分支1)
 *     │     ├── block (分支2)
 *     │     └── block (分支N)
 *
 * `conditionNode.blocks` 返回的是 [$blockIcon$, $inlineBlocks$]，
 * 不是分支列表。分支 block 在 $inlineBlocks$ 子节点的 blocks 下。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBranchBlocks(conditionNode: any): any[] {
  if (!conditionNode) return [];

  // 方式1：通过 flowNodeType 查找 inlineBlocks 子节点
  const inlineBlocks = conditionNode?.blocks?.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b: any) =>
      b.flowNodeType === 'inlineBlocks' ||
      b.flowNodeType === 'mainInlineBlocks' ||
      b.flowNodeType === 'catchInlineBlocks',
  );
  if (inlineBlocks?.blocks) return inlineBlocks.blocks;

  // 方式2：通过 ID 直接查找 $inlineBlocks$<id> 节点
  const doc = conditionNode.document;
  if (doc) {
    const inlineBlocksById = doc.getNode(`$inlineBlocks$${conditionNode.id}`);
    if (inlineBlocksById?.blocks) return inlineBlocksById.blocks;
  }

  // 方式3：fallback — conditionNode.blocks 中过滤出 type='block' 的节点
  // （在不稳定的结构下作为最后手段）
  return (conditionNode?.blocks ?? []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b: any) => b.flowNodeType === 'block',
  );
}

export interface SimplifiedEditorProps {
  initialSchema?: WorkflowSchema;
  readonly?: boolean;
  onSchemaChange?: (schema: WorkflowSchema) => void;
  objectOptions?: { label: string; value: string }[];
  formOptions?: { label: string; value: string }[];
  templateOptions?: { label: string; value: string }[];
  onHistoryReady?: (api: {
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
  }) => void;
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

  // 存储选项到 window 供 ConfigSidebar 使用
  useEffect(() => {
    const w = window as unknown as {
      __apaasConfigOptions?: {
        objectOptions: typeof objectOptions;
        formOptions: typeof formOptions;
        templateOptions: typeof templateOptions;
      };
    };
    w.__apaasConfigOptions = { objectOptions, formOptions, templateOptions };
  }, [objectOptions, formOptions, templateOptions]);

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, background: '#f5f7fa' }}>
      <FixedLayoutEditorProvider {...editorProps}>
        <HistoryBridge onHistoryReady={onHistoryReady} />
        <CanvasColumn readonly={readonly} onSchemaChange={onSchemaChange} />
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
  label,
  isElse,
  condition,
  conditionNodeId,
  blockIndex,
}: {
  label: string;
  isElse: boolean;
  condition: object | null;
  conditionNodeId?: string;
  blockIndex: number;
}) {
  const conditionData = useProcessEditorStore((s) => {
    if (!s.schema || !conditionNodeId) return null;
    const findNode = (nodes: WorkflowNode[]): WorkflowNode | null => {
      for (const n of nodes) {
        if (n.id === conditionNodeId) return n;
        if (n.blocks) {
          const f = findNode(n.blocks);
          if (f) return f;
        }
      }
      return null;
    };
    return findNode(s.schema.nodes)?.data ?? null;
  });
  const conditions =
    (conditionData?.conditions as Array<{ label?: string; condition?: object | null }>) || [];
  const latestCondition = conditions.find((c) => c.label === label)?.condition ?? condition;

  // JsonLogic 对象 → 可读表达式字符串（异常时降级为 JSON 摘要，避免页面崩溃）
  const conditionText = useMemo(() => {
    if (!latestCondition) return '';
    try {
      return jsonLogicToExpression(latestCondition);
    } catch {
      return JSON.stringify(latestCondition).substring(0, 30) + '...';
    }
  }, [latestCondition]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '6px 12px',
        borderRadius: 6,
        background: '#fafbfc',
        border: '1px solid #e8eaed',
        minWidth: 120,
        maxWidth: 200,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', flexShrink: 0 }}>
          优先级 {blockIndex + 1}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'rgba(0,0,0,0.65)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flexShrink: 1,
          }}
        >
          {label}
        </span>
        {!isElse && !conditionText && (
          <Text style={{ fontSize: 11, color: '#ff4d4f', flexShrink: 0 }}>(未配置)</Text>
        )}
        {!isElse && conditionText && (
          <Text
            style={{
              fontSize: 11,
              color: 'rgba(0,0,0,0.45)',
              flexShrink: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 80,
            }}
          >
            {conditionText.length > 20 ? conditionText.substring(0, 20) + '...' : conditionText}
          </Text>
        )}
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
function ApaasNodeRenderer({
  node,
}: {
  node: { id: string; flowNodeType?: string; getExtInfo?: () => Record<string, unknown> };
}) {
  const {
    startDrag,
    dragging,
    activated,
    onMouseEnter,
    onMouseLeave,
    isBlockIcon: _isBlockIcon,
    isBlockOrderIcon: _isBlockOrderIcon,
  } = useNodeRender();
  const ctx = useClientContext();

  const type = node?.flowNodeType ?? 'unknown';
  const extInfo = node?.getExtInfo?.() ?? {};

  // 系统节点处理
  // blockIcon: 条件分支的菱形图标
  // blockOrderIcon: 分支标签(条件成立/默认分支)
  // inlineBlocks/block/root: 隐藏的布局容器
  if (
    type === 'inlineBlocks' ||
    type === 'block' ||
    type === 'root' ||
    type === 'mainInlineBlocks' ||
    type === 'catchInlineBlocks' ||
    type === 'trySlot' ||
    type === 'tryBlock' ||
    type === 'catchBlock' ||
    type === 'dynamicSplit' ||
    type === 'staticSplit' ||
    type === 'simpleSplit'
  ) {
    return null;
  }

  // blockIcon: 渲染菱形图标 — 点击选中其父 condition 节点
  if (type === 'blockIcon') {
    const handleBlockIconClick = () => {
      const flowNode = ctx.document.getNode(node.id);
      if (flowNode) {
        // blockIcon 的 originParent 是 condition 节点
        const conditionNode = flowNode.originParent;
        if (conditionNode) {
          ctx.selection.selection = [conditionNode];
        }
      }
    };
    return (
      <div
        onClick={handleBlockIconClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40,
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            transform: 'rotate(45deg)',
            background: '#fff',
            border: '2px solid #1677ff',
            borderRadius: 4,
          }}
        />
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
    const conditions =
      (conditionExtInfo.conditions as Array<{ label?: string; condition?: object | null }>) || [];
    // 读取 block 节点的 extInfo（blockOrderIcon 的父级）
    const blockNode = flowNode?.parent;
    const blockExtInfo = blockNode?.getExtInfo?.() ?? {};
    // 判断是否为 else 分支：通过 block 自身标记（isElse 或 ID 含 elseBlock）
    const isElse =
      !!(blockExtInfo.isElse as boolean) ||
      !!(extInfo.isElse as boolean) ||
      (blockNode?.id?.includes('elseBlock') ?? false);
    // 从 conditions 数组中查找匹配当前 block 的条件
    const blockTitle = (blockExtInfo.title as string) || (extInfo.title as string) || '';
    const branchData = conditions.find((c) => c.label === blockTitle) ?? conditions[blockIndex];
    // 标签优先从 conditions 数组取，其次从 block extInfo 取
    const label = branchData?.label || blockTitle || (isElse ? '默认分支' : '条件成立');
    const condition = branchData?.condition ?? null;
    // 优先级编号计算：
    // - else 分支：优先级 = conditions 数组长度（最后一个）
    // - 非 else 分支：计算此 block 之前的非 else block 数量 + 1
    //   （因为 conditions 数组中非 else 分支在前，else 在末尾）
    let displayIndex;
    if (isElse) {
      // else 分支始终是最低优先级（conditions 数组末尾）
      displayIndex = conditions.length - 1;
    } else {
      // 计算 inlineBlocks 中此 block 之前的非 else block 数量
      const inlineBlocks = blockNode?.parent;
      const siblings = inlineBlocks?.blocks || [];
      let nonElseBefore = 0;
      for (let i = 0; i < blockIndex; i++) {
        const sib = siblings[i];
        if (sib) {
          const sibInfo = sib.getExtInfo?.() ?? {};
          const sibIsElse =
            !!(sibInfo.isElse as boolean) || (sib.id?.includes('elseBlock') ?? false);
          if (!sibIsElse) nonElseBefore++;
        }
      }
      displayIndex = nonElseBefore;
    }

    return (
      <BlockOrderIconLabel
        label={label}
        isElse={isElse}
        condition={condition}
        conditionNodeId={conditionNode?.id}
        blockIndex={displayIndex}
      />
    );
  }

  return (
    <BusinessNodeRenderer
      node={node}
      ctx={ctx}
      startDrag={startDrag}
      dragging={dragging}
      activated={activated}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}

/**
 * 业务节点渲染器 — 提取为独立组件以满足 React Hooks 规则(避免在条件返回后调用 hooks)。
 */
interface BusinessNodeRendererProps extends Pick<
  ReturnType<typeof useNodeRender>,
  'startDrag' | 'dragging' | 'activated' | 'onMouseEnter' | 'onMouseLeave'
> {
  node: { id: string; flowNodeType?: string; getExtInfo?: () => Record<string, unknown> };
  ctx: ReturnType<typeof useClientContext>;
}

function BusinessNodeRenderer({
  node,
  ctx,
  startDrag,
  dragging,
  activated,
  onMouseEnter,
  onMouseLeave,
}: BusinessNodeRendererProps) {
  const type = node?.flowNodeType ?? 'unknown';
  const extInfo = node?.getExtInfo?.() ?? {};

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

  const borderColor = isSelected ? '#1677ff' : activated ? '#91caff' : '#e8eaed';

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
        boxShadow: isSelected ? '0 2px 12px rgba(22,119,255,0.15)' : '0 1px 4px rgba(0,0,0,0.06)',
        cursor: 'grab',
        width: 240,
        opacity: dragging ? 0.5 : 1,
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* 节点头:图标 + 标题 + 警告 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          flexShrink: 0,
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
        <span style={{ fontSize: 14, fontWeight: 500, color: '#1a1a1a', flex: 1 }}>{title}</span>
        {isIncomplete && <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 14 }} />}
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
        if (n.blocks) {
          const f = findNode(n.blocks);
          if (f) return f;
        }
      }
      return null;
    };
    return findNode(schema.nodes);
  }, [schema, selectedNodeId]);

  const handleNodeDataChange = useCallback(
    (id: string, data: Record<string, unknown>) => {
      const flowNode = ctx.document.getNode(id);
      if (flowNode) {
        flowNode.updateExtInfo(data);
        // 先同步到 Zustand store，确保配置面板立即反映 conditions 变化
        // （在 block 创建之前，避免 SelectionBridge 轮询覆盖 conditions）
        updateNodeData(id, data);
        // 条件分支节点:同步 conditions 到 block 节点 + blockOrderIcon 节点
        if (flowNode.flowNodeType === 'condition' && Array.isArray(data.conditions)) {
          const conditions = data.conditions as Array<{
            label?: string;
            condition?: object | null;
          }>;
          // 获取实际分支 block 列表（不是 flowNode.blocks，那是结构系统节点）
          let branchBlocks = getBranchBlocks(flowNode);

          // conditions 数组变长 → 创建新 block 节点
          // 循环处理，每次创建后重新获取 branchBlocks（addBlock 可能不是立即反映到树中）
          while (conditions.length > branchBlocks.length) {
            const doc = ctx.document as unknown as {
              addBlock: (
                parent: unknown,
                json: unknown,
                addedNodes?: unknown[],
                ctx?: unknown,
                index?: number,
              ) => unknown;
            };
            // 计算需要新增多少个非 else 分支
            // else 分支 = 最后一个且 condition 为空；非 else = 其余所有分支
            const conditionsNonElse = conditions.filter(
              (_, i) => !(i === conditions.length - 1 && !conditions[i]?.condition),
            );
            const branchBlocksNonElse = branchBlocks.filter((b) => {
              const bi = b.getExtInfo?.() ?? {};
              return !((bi.isElse as boolean) || (b.id?.includes('elseBlock') ?? false));
            });
            const newNonElseCount = conditionsNonElse.length - branchBlocksNonElse.length;
            // 检查是否需要新增 else 分支
            const conditionsHasElse =
              conditions.length > 0 && !conditions[conditions.length - 1]?.condition;
            const branchBlocksHasElse = branchBlocks.some((b) => {
              const bi = b.getExtInfo?.() ?? {};
              return (bi.isElse as boolean) || (b.id?.includes('elseBlock') ?? false);
            });
            const needNewElse = conditionsHasElse && !branchBlocksHasElse;

            if (newNonElseCount > 0) {
              // 创建非 else 分支的 block（插入到 else block 之前）
              const cond = conditionsNonElse[branchBlocksNonElse.length];
              const blockJSON = {
                id: `ifBlock_${id}_${Date.now()}_${branchBlocksNonElse.length}`,
                type: 'block',
                data: {
                  title: cond?.label || `分支 ${branchBlocksNonElse.length + 1}`,
                  isElse: false,
                  condition: cond?.condition ?? null,
                },
              };
              try {
                const elseIndex = branchBlocks.findIndex((b) => {
                  const bi = b.getExtInfo?.() ?? {};
                  return (bi.isElse as boolean) || (b.id?.includes('elseBlock') ?? false);
                });
                const insertIndex = elseIndex >= 0 ? elseIndex : undefined;
                doc.addBlock(flowNode, blockJSON, undefined, undefined, insertIndex);
              } catch (e) {
                console.error('[handleNodeDataChange] addBlock failed', e);
                break; // 避免死循环
              }
            } else if (needNewElse) {
              // 创建 else 分支（追加到末尾）
              const cond = conditions[conditions.length - 1];
              const blockJSON = {
                id: `elseBlock_${id}_${Date.now()}_else`,
                type: 'block',
                data: {
                  title: cond?.label || '默认分支',
                  isElse: true,
                  condition: null,
                },
              };
              try {
                doc.addBlock(flowNode, blockJSON);
              } catch (e) {
                console.error('[handleNodeDataChange] addBlock else failed', e);
                break;
              }
            } else {
              break; // 无法创建更多 block
            }
            // 重新获取 branchBlocks
            branchBlocks = getBranchBlocks(flowNode);
          }

          // conditions 数组变短 → 删除多余 block 节点
          if (conditions.length < branchBlocks.length) {
            for (let i = branchBlocks.length - 1; i >= conditions.length; i--) {
              const block = branchBlocks[i];
              if (block) {
                try {
                  ctx.operation.deleteNode(block.id);
                } catch (e) {
                  console.error('[handleNodeDataChange] deleteBlock failed', e);
                }
              }
            }
          }

          // 同步 conditions 到所有 blockOrderIcon 和 block 节点
          // 注意：block 的物理顺序可能与 conditions 数组顺序不一致
          // （else block 可能在物理位置 1，但在 conditions 数组末尾）
          // 所以需要通过 block 的 isElse 标记来匹配 conditions 中的对应项
          const updatedBranchBlocks = getBranchBlocks(flowNode);
          // 将 conditions 分为非 else 和 else
          const conditionsNonElse = conditions.filter(
            (_, i) => !(i === conditions.length - 1 && !conditions[i]?.condition),
          );
          const conditionsElse =
            conditions.length > 0 && !conditions[conditions.length - 1]?.condition
              ? conditions[conditions.length - 1]
              : null;
          let nonElseCounter = 0;
          for (let i = 0; i < updatedBranchBlocks.length; i++) {
            const block = updatedBranchBlocks[i];
            if (!block) continue;
            // 判断此 block 是否为 else block
            const blockInfo = block.getExtInfo?.() ?? {};
            const isElseBlock =
              !!(blockInfo.isElse as boolean) || (block.id?.includes('elseBlock') ?? false);
            // 从 conditions 中取对应的条件
            const cond = isElseBlock ? conditionsElse : conditionsNonElse[nonElseCounter];
            if (!isElseBlock) nonElseCounter++;
            const title = cond?.label || (isElseBlock ? '默认分支' : `分支 ${nonElseCounter}`);
            const blockOrderIcon = block.blocks?.[0];
            if (blockOrderIcon) {
              blockOrderIcon.updateExtInfo({
                title,
                condition: cond?.condition ?? null,
                isElse: isElseBlock,
              });
            }
            block.updateExtInfo({
              title,
              isElse: isElseBlock,
            });
          }
        }
      }
    },
    [ctx.document, ctx.operation, updateNodeData],
  );

  const handleDeleteNode = useCallback(
    (id: string) => {
      ctx.operation.deleteNode(id);
      deleteNodeStore(id);
    },
    [ctx.operation, deleteNodeStore],
  );

  if (!selectedNode || readonly) return null;

  const w = window as unknown as {
    __apaasConfigOptions?: {
      objectOptions: { label: string; value: string }[];
      formOptions: { label: string; value: string }[];
      templateOptions: { label: string; value: string }[];
    };
  };
  const options = w.__apaasConfigOptions ?? {
    objectOptions: [],
    formOptions: [],
    templateOptions: [],
  };

  // 从 schema 构建节点候选列表（用于驳回目标选择）
  const nodeOptions = (schema?.nodes ?? []).map((n) => ({
    label: (n.data?.title as string) || n.type || n.id,
    value: n.id,
  }));

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 480,
        background: '#fff',
        borderLeft: '1px solid #eef0f4',
        boxShadow: '-4px 0 12px rgba(0,0,0,0.06)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #eef0f4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <Text strong style={{ fontSize: 14 }}>
          节点配置
        </Text>
        <Button
          type="text"
          size="small"
          onClick={() => {
            ctx.selection.selection = [];
          }}
        >
          ✕
        </Button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <NodeConfigPanel
          node={selectedNode}
          readonly={false}
          objectOptions={options.objectOptions}
          formOptions={options.formOptions}
          templateOptions={options.templateOptions}
          nodeOptions={nodeOptions}
          schema={schema ?? undefined}
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
    case 'trigger':
      return !data.triggerType;
    case 'userTask':
      return !data.assigneeId || !data.approvalMode;
    case 'notification':
      return !data.channel || !data.recipient;
    case 'objectOperation':
      return !data.operation || !data.objectId;
    case 'httpRequest':
      return !data.method || !data.url;
    case 'delay':
      return !data.duration;
    case 'start':
    case 'end':
    case 'assign':
      return false;
    default:
      return false;
  }
}

function getNodeSummary(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case 'trigger': {
      const t = data.triggerType as string;
      return t ? `触发: ${t}` : '';
    }
    case 'userTask': {
      const a = data.assigneeId as string;
      const m = data.approvalMode as string;
      const p: string[] = [];
      if (a) p.push(`审批人: ${a}`);
      if (m) p.push(m);
      return p.join(' · ');
    }
    case 'notification': {
      const c = data.channel as string;
      const r = data.recipient as string;
      const p: string[] = [];
      if (c) p.push(`渠道: ${c}`);
      if (r) p.push(`接收人: ${r}`);
      return p.join(' · ');
    }
    case 'objectOperation': {
      const o = data.operation as string;
      const obj = data.objectId as string;
      const p: string[] = [];
      if (o) p.push(o);
      if (obj) p.push(obj);
      return p.join(' · ');
    }
    case 'httpRequest': {
      const m = data.method as string;
      const u = data.url as string;
      if (m && u) return `${m} ${u}`;
      return m ?? '';
    }
    case 'delay': {
      const d = data.duration as string | number;
      const u = data.unit as string;
      if (d) return `等待 ${d}${u ?? ''}`;
      return '';
    }
    case 'condition':
      return '条件分支';
    case 'assign':
      return '变量赋值';
    default:
      return '';
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
        { id: `ifBlock_${nodeId}`, type: 'block', data: { title: '条件成立', isElse: false } },
        { id: `elseBlock_${nodeId}`, type: 'block', data: { title: '默认分支', isElse: true } },
      ];
      nodeJSON.data = {
        title: meta.label,
        conditions: [
          { label: '条件成立', condition: null },
          { label: '默认分支', condition: null },
        ],
      };
    }

    const fromNode = ctx.document.getNode(props.from.id);
    if (fromNode) ctx.operation.addFromNode(fromNode, nodeJSON);
    setPopoverOpen(false);
  };

  const content = (
    <div style={{ width: 320, maxHeight: 400, overflow: 'auto' }}>
      {NODE_GROUPS.map((group) => (
        <div key={group.category} style={{ marginBottom: 8 }}>
          <Text
            strong
            style={{ fontSize: 12, display: 'block', marginBottom: 4, color: 'rgba(0,0,0,0.45)' }}
          >
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
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    padding: '6px 2px',
                    borderRadius: 6,
                    border: '1px solid #eef0f4',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      background: `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)`,
                      color: '#fff',
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          margin: '4px auto',
          transition: 'all 0.15s ease',
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
  return useCallback(
    (type: string, fromId?: string) => {
      const meta = getNodeMeta(type);
      const nodeId = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const nodeJSON: FlowNodeJSON = { id: nodeId, type, data: { title: meta.label } };

      // 条件分支节点:提供初始 blocks 数据,让 DynamicSplitRegistry.onCreate 创建分支
      if (type === 'condition') {
        nodeJSON.blocks = [
          { id: `ifBlock_${nodeId}`, type: 'block', data: { title: '条件成立', isElse: false } },
          { id: `elseBlock_${nodeId}`, type: 'block', data: { title: '否则', isElse: true } },
        ];
        nodeJSON.data = {
          title: meta.label,
          conditions: [
            { label: '条件成立', condition: null },
            { label: '否则', condition: null },
          ],
        };
      }

      if (fromId) {
        const fromNode = ctx.document.getNode(fromId);
        if (fromNode) {
          ctx.operation.addFromNode(fromNode, nodeJSON);
          return;
        }
      }
      const allNodes = ctx.document.getAllNodes();
      let anchorNode = undefined;
      for (let i = allNodes.length - 1; i >= 0; i--) {
        const n = allNodes[i];
        if (n && n.flowNodeType !== 'end') {
          anchorNode = n;
          break;
        }
      }
      if (anchorNode) ctx.operation.addFromNode(anchorNode, nodeJSON);
      else ctx.operation.addNode(nodeJSON);
    },
    [ctx],
  );
}

/**
 * 根据拖放位置找到最近的插入位置节点。
 *
 * 使用 flowgram 的 playground.getRelativePos() 将鼠标事件转换为画布坐标，
 * 然后与节点的 bounds.center.y 比较找到最近节点。
 * 如果 getRelativePos 不可用，回退到追加到最后一个非 end 节点之后。
 */
function useFindDropAnchor() {
  const ctx = useClientContext();
  return useCallback(
    (e: React.DragEvent): string | undefined => {
      const allNodes = ctx.document.getAllNodes();
      // 过滤出业务节点（排除系统节点和 end 节点）
      const businessNodes = allNodes.filter((n) => {
        const type = n.flowNodeType as string;
        return (
          type &&
          !['block', 'inlineBlocks', 'blockIcon', 'blockOrderIcon', 'dynamicSplit', 'end'].includes(
            type,
          )
        );
      });
      if (businessNodes.length === 0) return undefined;

      // 使用 flowgram 的坐标转换：将鼠标事件转为画布坐标
      const playground = ctx.playground as unknown as {
        getRelativePos?: (event: { clientX: number; clientY: number }) => { x: number; y: number };
      };

      if (!playground?.getRelativePos) {
        // 回退：返回最后一个业务节点（追加到末尾）
        return businessNodes[businessNodes.length - 1]?.id;
      }

      const pos = playground.getRelativePos({ clientX: e.clientX, clientY: e.clientY });
      const canvasY = pos.y;

      // 找到中心 Y 最接近 canvasY 的节点
      let closest: (typeof businessNodes)[0] | undefined;
      let minDist = Infinity;
      for (const n of businessNodes) {
        const bounds = n.bounds;
        if (!bounds) continue;
        const centerY = bounds.center.y;
        const dist = Math.abs(centerY - canvasY);
        if (dist < minDist) {
          minDist = dist;
          closest = n;
        }
      }
      return closest?.id ?? businessNodes[businessNodes.length - 1]?.id;
    },
    [ctx],
  );
}

// ---------------------------------------------------------------------------
// 撤销/重做桥接
// ---------------------------------------------------------------------------

function HistoryBridge({
  onHistoryReady,
}: {
  onHistoryReady?: (api: {
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
  }) => void;
}) {
  const tools = usePlaygroundTools();
  const onReadyRef = useRef(onHistoryReady);
  onReadyRef.current = onHistoryReady;
  useEffect(() => {
    onReadyRef.current?.({
      undo: () => tools.undo(),
      redo: () => tools.redo(),
      canUndo: tools.canUndo,
      canRedo: tools.canRedo,
    });
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
          // 根据拖放位置找到最近的节点作为锚点，实现位置感知插入
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

function SelectionBridge({
  onSchemaChange,
}: {
  onSchemaChange?: (schema: WorkflowSchema) => void;
}) {
  const ctx = useClientContext();
  const setSelectedNode = useProcessEditorStore((s) => s.setSelectedNode);
  const updateNodeData = useProcessEditorStore((s) => s.updateNodeData);
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

      // 同步 condition 节点的 conditions 数组与分支 block 数量
      // 当 DynamicSplit 在画布上添加/删除分支时，conditions 数组需要同步更新
      const allNodes = ctx.document.getAllNodes();
      for (const n of allNodes) {
        if (n.flowNodeType === 'condition') {
          const extInfo = n.getExtInfo?.() ?? {};
          const conditions =
            (extInfo.conditions as Array<{ label?: string; condition?: object | null }>) || [];
          // 获取实际分支 block 列表（不是 n.blocks，那是结构系统节点）
          const branchBlocks = getBranchBlocks(n);
          // 检查是否需要重建 conditions 数组：
          // 1. branchBlocks 比 conditions 多（画布添加了分支）
          // 2. else 分支不在末尾或有多余的 else block
          // 3. else block 不在物理末尾（需要 moveChildNodes 重排）
          // 注意：不处理 conditions > branchBlocks 的情况（由 handleNodeDataChange 处理 block 创建）
          const branchBlockElseCount = branchBlocks.filter((b) => {
            const bi = b.getExtInfo?.() ?? {};
            return (bi.isElse as boolean) || (b.id?.includes('elseBlock') ?? false);
          }).length;
          // 检查 else block 是否在物理末尾
          const lastBranchBlock = branchBlocks[branchBlocks.length - 1];
          const lastBranchBlockIsElse = lastBranchBlock
            ? (() => {
                const bi = lastBranchBlock.getExtInfo?.() ?? {};
                return (
                  (bi.isElse as boolean) || (lastBranchBlock.id?.includes('elseBlock') ?? false)
                );
              })()
            : false;
          const needsRebuild =
            branchBlocks.length > conditions.length ||
            (conditions.length === branchBlocks.length &&
              conditions.length > 1 &&
              (() => {
                const lastCond = conditions[conditions.length - 1];
                const lastIsElse = !lastCond?.condition;
                return !lastIsElse || branchBlockElseCount > 1;
              })()) ||
            (branchBlockElseCount > 0 && !lastBranchBlockIsElse);
          if (needsRebuild) {
            // 重建 conditions 数组
            // 识别 else block：通过 extInfo.isElse 标志或 ID 含 elseBlock
            // 确保只有一个 else 分支，且放在 conditions 数组末尾
            const rawConditions = branchBlocks.map((block) => {
              const blockInfo = block.getExtInfo?.() ?? {};
              const isElse =
                !!(blockInfo.isElse as boolean) || (block.id?.includes('elseBlock') ?? false);
              const blockTitle = blockInfo.title as string;
              const existing = conditions.find((c) => c.label === blockTitle);
              return {
                isElse,
                label: existing?.label || blockTitle || '',
                condition: existing?.condition ?? null,
              };
            });

            // 非 else 分支在前，else 分支在末尾（只保留一个 else）
            const nonElse = rawConditions.filter((c) => !c.isElse);
            // 如果有多个 else block，只保留第一个作为默认分支
            const elseBranches = rawConditions.filter((c) => c.isElse);
            const elseBranch = elseBranches.length > 0 ? elseBranches[0] : null;

            // 为非 else 分支分配序号和默认 label
            const newConditions = [
              ...nonElse.map((c, i) => ({
                label: c.label || `分支 ${i + 1}`,
                condition: c.condition,
              })),
              ...(elseBranch
                ? [
                    {
                      label: elseBranch.label || '默认分支',
                      condition: null as object | null,
                    },
                  ]
                : []),
            ];
            n.updateExtInfo({ conditions: newConditions });
            // 同时同步各 block 的 extInfo（title/isElse），使 blockOrderIcon 渲染正确
            branchBlocks.forEach((block, i) => {
              const rawCond = rawConditions[i];
              const isElseBlock = rawCond?.isElse ?? false;
              // 在 newConditions 中查找对应的 condition
              // 非 else 分支按在 nonElse 中的序号匹配；else 分支匹配末尾的 else
              let matched;
              if (isElseBlock) {
                // else 分支 = newConditions 的最后一个
                matched = newConditions[newConditions.length - 1];
              } else {
                const nonElseIdx = rawConditions.slice(0, i).filter((c) => !c.isElse).length;
                matched = newConditions[nonElseIdx];
              }
              const newTitle =
                matched?.label ||
                (isElseBlock
                  ? '默认分支'
                  : `分支 ${rawConditions.slice(0, i).filter((c) => !c.isElse).length + 1}`);
              block.updateExtInfo({
                title: newTitle,
                isElse: isElseBlock,
                condition: matched?.condition ?? null,
              });
              // 也更新 blockOrderIcon 子节点的 extInfo
              const blockOrderIcon = block.blocks?.[0];
              if (blockOrderIcon) {
                blockOrderIcon.updateExtInfo({
                  title: newTitle,
                  isElse: isElseBlock,
                  condition: matched?.condition ?? null,
                });
              }
            });
            // 同步到 Zustand store，使配置面板能立即看到画布上的分支变化
            updateNodeData(n.id, { conditions: newConditions });
            // 物理重排：将 else block 移动到 $inlineBlocks$ 的末尾
            // flowgram 的 BranchAdder 追加新 block 到末尾，导致 else block 不在最后
            // 需要用 moveChildNodes 将 else block 移到末尾，使画布左右排列正确
            if (elseBranch && branchBlocks.length > 1) {
              // 重新获取 branchBlocks（extInfo 更新后可能变化）
              const currentBranchBlocks = getBranchBlocks(n);
              const lastBlock = currentBranchBlocks[currentBranchBlocks.length - 1];
              const lastIsElse = lastBlock
                ? (() => {
                    const bi = lastBlock.getExtInfo?.() ?? {};
                    return (bi.isElse as boolean) || (lastBlock.id?.includes('elseBlock') ?? false);
                  })()
                : false;
              if (!lastIsElse) {
                // 找到 else block 的 ID 和 inlineBlocks 的 ID
                const elseBlock = currentBranchBlocks.find((b) => {
                  const bi = b.getExtInfo?.() ?? {};
                  return (bi.isElse as boolean) || (b.id?.includes('elseBlock') ?? false);
                });
                if (elseBlock) {
                  const inlineBlocksId = `$inlineBlocks$${n.id}`;
                  try {
                    (
                      ctx.document as unknown as {
                        moveChildNodes: (opts: {
                          toParentId: string;
                          toIndex: number;
                          nodeIds: string[];
                        }) => void;
                      }
                    ).moveChildNodes({
                      toParentId: inlineBlocksId,
                      toIndex: currentBranchBlocks.length - 1,
                      nodeIds: [elseBlock.id],
                    });
                  } catch {
                    // moveChildNodes 可能失败（节点已在正确位置等），忽略错误
                  }
                }
              }
            }
          }
        }
      }

      if (onSchemaChangeRef.current) {
        const schema = exportSchema();
        const sig = JSON.stringify(schema);
        if (sig !== lastDocSig) {
          lastDocSig = sig;
          onSchemaChangeRef.current(schema);
        }
      }
    }, 300);
    return () => clearInterval(interval);
  }, [ctx.selection, ctx.document, exportSchema, updateNodeData]);

  useEffect(() => {
    setSelectedNode(selectedId);
  }, [selectedId, setSelectedNode]);
  return null;
}
