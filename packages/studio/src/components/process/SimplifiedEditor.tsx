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

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FixedLayoutEditorProvider,
  EditorRenderer,
  usePlaygroundTools,
  useClientContext,
  useNodeRender,
} from '@flowgram.ai/fixed-layout-editor';
import { useListenEvents } from '@flowgram.ai/core';
import { DisposableCollection } from '@flowgram.ai/utils';
import type { FlowDocument, FlowNodeEntity } from '@flowgram.ai/document';
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
  if (inlineBlocks?.blocks) {
    return inlineBlocks.blocks;
  }

  // 方式2：通过 ID 直接查找 $inlineBlocks$<id> 节点
  const doc = conditionNode.document;
  if (doc) {
    const inlineBlocksById = doc.getNode(`$inlineBlocks$${conditionNode.id}`);
    if (inlineBlocksById?.blocks) {
      return inlineBlocksById.blocks;
    }
  }

  // 方式3：fallback — conditionNode.blocks 中过滤出 type='block' 的节点
  return (conditionNode?.blocks ?? []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b: any) => b.flowNodeType === 'block',
  );
}

/**
 * 判断 block 是否为 else 分支。
 * 优先依赖 extInfo.isElse 标志（支持 extInfo 交换方案，isElse 可变），
 * 当 extInfo.isElse 为 undefined（初始创建未初始化）时，回退到 block ID 判断。
 */
function isElseBlock(block: FlowNodeEntity): boolean {
  const bi = block.getExtInfo?.() ?? {};
  if (bi.isElse !== undefined) return !!(bi.isElse as boolean);
  // extInfo.isElse 未初始化时，用 block ID 推导（仅初始创建时触发）
  return block.id?.includes('elseBlock') ?? false;
}

/**
 * 将 extInfo 中的 conditions 合并到 schema 中对应节点的 data。
 *
 * flowgram 的 toJSON() 不输出 extInfo，而 conditions 存在 extInfo 中，
 * 因此导出 schema 后需要手动合并 conditions，保证 store 中的数据不过时。
 */
function mergeConditionsIntoSchema(
  nodes: WorkflowNode[],
  conditionNodeId: string,
  conditions: unknown,
): void {
  for (const n of nodes) {
    if (n.id === conditionNodeId) {
      n.data = { ...n.data, conditions };
      return;
    }
    if (n.blocks) mergeConditionsIntoSchema(n.blocks, conditionNodeId, conditions);
  }
}

/**
 * 条件分支重建 — 当画布原生添加/删除分支时，同步 conditions 数组。
 *
 * 从 flowgram document 的 branchBlocks 重建 conditions 数组（非 else 在前、
 * else 在末尾），同步 extInfo 到各 block/blockOrderIcon，调用 updateNodeData
 * 同步到 Zustand store，并物理重排 else block 到末尾。
 *
 * @returns true 如果执行了重建（调用方据此决定是否跳过 schema 导出）
 */
function reconcileConditionBranches(
  conditionNode: FlowNodeEntity,
  document: FlowDocument,
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void,
): boolean {
  const extInfo = conditionNode.getExtInfo?.() ?? {};
  let conditions =
    (extInfo.conditions as Array<{ label?: string; condition?: object | null; id?: string }>) || [];

  // 初始创建时 conditions 存在 formData 中（condition 节点有 formMeta），
  // 不在 extInfo 中。从 formData 读取并写入 extInfo。
  // 使用类型字符串 'FlowNodeEntityFormData' 查找 formData，避免跨包 import 导致的类标识不一致。
  if (conditions.length === 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formData = (conditionNode as any).getData?.({ type: 'FlowNodeEntityFormData' });
      if (formData?.formModel?.initialized) {
        const formJSON = formData.toJSON() as { conditions?: unknown } | undefined;
        const formConditions = formJSON?.conditions;
        if (Array.isArray(formConditions) && formConditions.length > 0) {
          conditions = formConditions as Array<{
            label?: string;
            condition?: object | null;
            id?: string;
          }>;
          conditionNode.updateExtInfo({ conditions }, true);
        }
      }
    } catch {
      // formData 不可用时忽略，后续 reconcile 会重试
    }
  }

  const branchBlocks = getBranchBlocks(conditionNode);

  if (import.meta.env.DEV) {
    console.debug(
      '[reconcileConditionBranches]',
      conditionNode.id,
      'branchBlocks=',
      branchBlocks.length,
      'conditions=',
      conditions.length,
      'blockExtInfos=',
      branchBlocks.map((b) => ({ id: b.id, ext: b.getExtInfo?.() })),
    );
  }

  // 初始 block（由 ApaasAdder 创建）的 data.title/data.isElse 存在 formData 中，
  // 但 block 节点无 formMeta，fromNodeJSON 不会将 data 写入 extInfo。
  // 因此 extInfo.title 为 undefined 时，从 conditions 数组和 block ID 推导 block 的 label/isElse：
  //   - block ID 含 'elseBlock' → else 分支（label='默认分支', condition=null）
  //   - 其他 block → 非 else 分支，label 从 conditions 数组按位置取
  // 这只在 block 首次被 reconcile 时执行，后续纯走 extInfo（extInfo swap 不受影响）。
  // 注意：conditions 可能为空（formData 尚未初始化），此时仅用 block ID 初始化 extInfo。
  {
    const nonElseConditions = conditions.filter(
      (_, i) => !(i === conditions.length - 1 && !conditions[i]?.condition),
    );

    let nonElseIdx = 0;
    for (let i = 0; i < branchBlocks.length; i++) {
      const block = branchBlocks[i];
      const blockExtInfo = block.getExtInfo?.() ?? {};
      // extInfo.title 为 undefined 时表示 block 尚未被 reconcile 初始化。
      // 用 isElseBlock(block) 判断是否为 else 分支（已支持 ID 回退）。
      if (!blockExtInfo.title || blockExtInfo.title === '分支') {
        const isElse = isElseBlock(block);
        let title: string;
        let condition: object | null;
        if (isElse) {
          title = '默认分支';
          condition = null;
        } else {
          const cond = nonElseConditions[nonElseIdx];
          // conditions 为空时（formData 未初始化），用 block ID 中的语义推导初始 label：
          // ifBlock → '条件成立'，其他 → '分支 N'
          if (conditions.length === 0) {
            title = block.id?.includes('ifBlock') ? '条件成立' : `分支 ${nonElseIdx + 1}`;
          } else {
            title = cond?.label || `分支 ${nonElseIdx + 1}`;
          }
          condition = cond?.condition ?? null;
        }
        nonElseIdx++;
        block.updateExtInfo({ title, isElse, condition }, true);
        const blockOrderIcon = block.blocks?.[0];
        if (blockOrderIcon) {
          blockOrderIcon.updateExtInfo({ title, isElse, condition }, true);
        }
      } else {
        // 已初始化的 block，只递增 nonElseIdx 用于位置计数
        if (!isElseBlock(block)) nonElseIdx++;
      }
    }
  }

  // 物理重排：将 else block 移动到 $inlineBlocks$ 的末尾（最右侧）
  // flowgram 的 BranchAdder 追加新 block 到末尾，导致 else block 不在最后
  const ensureElseBlockLast = () => {
    let currentBranchBlocks = getBranchBlocks(conditionNode);
    if (currentBranchBlocks.length <= 1) return;
    let lastBlock = currentBranchBlocks[currentBranchBlocks.length - 1];
    let lastIsElse = lastBlock ? isElseBlock(lastBlock) : false;
    if (!lastIsElse) {
      const elseBlock = currentBranchBlocks.find((b) => isElseBlock(b));
      if (elseBlock && lastBlock) {
        // 尝试 flowgram moveChildNodes API
        const inlineBlocksId = `$inlineBlocks$${conditionNode.id}`;
        try {
          document.moveChildNodes({
            toParentId: inlineBlocksId,
            toIndex: currentBranchBlocks.length - 1,
            nodeIds: [elseBlock.id],
          });
        } catch {
          // moveChildNodes 可能失败，忽略错误
        }

        // 重新检查 moveChildNodes 是否生效
        currentBranchBlocks = getBranchBlocks(conditionNode);
        lastBlock = currentBranchBlocks[currentBranchBlocks.length - 1];
        lastIsElse = lastBlock ? isElseBlock(lastBlock) : false;

        // 兜底：如果 moveChildNodes 未生效（在事件回调中经常静默失败），
        // 交换 else block 和最后一个非 else block 的 extInfo 数据。
        // 这样物理上最后位置的 block 变成 "else"（显示"默认分支"），
        // 而原 else 位置的 block 变成普通分支。
        if (!lastIsElse && lastBlock) {
          const elseInfo = elseBlock.getExtInfo?.() ?? {};
          const lastInfo = lastBlock.getExtInfo?.() ?? {};
          // 交换 block extInfo
          elseBlock.updateExtInfo({
            title: lastInfo.title || '分支',
            isElse: false,
            condition: lastInfo.condition ?? null,
          });
          lastBlock.updateExtInfo({
            title: elseInfo.title || '默认分支',
            isElse: true,
            condition: null,
          });
          // 交换 blockOrderIcon extInfo
          const elseIcon = elseBlock.blocks?.[0];
          const lastIcon = lastBlock.blocks?.[0];
          if (elseIcon && lastIcon) {
            elseIcon.updateExtInfo({
              title: lastInfo.title || '分支',
              isElse: false,
              condition: lastInfo.condition ?? null,
            });
            lastIcon.updateExtInfo({
              title: elseInfo.title || '默认分支',
              isElse: true,
              condition: null,
            });
          }
        }
      }
    }
  };

  // 在任何 conditions 重建之前，先执行 extInfo 交换，
  // 确保后续读取 block extInfo 时 isElse 标志已正确
  ensureElseBlockLast();

  // 始终从 branchBlocks 重建 conditions 数组（不从 needsRebuild 判断）
  // 这确保画布与配置面板始终同步
  // 关键：保留 existing.id，避免 ConditionConfigForm 因 id 丢失而重新生成 key → 分支子树重挂载
  const rawConditions = branchBlocks.map((block, idx) => {
    const blockInfo = block.getExtInfo?.() ?? {};
    const isElse = isElseBlock(block);
    const blockTitle = blockInfo.title as string;
    // 先按 label 匹配，再按 index 回退（用户正在编辑 label 时 label 可能临时不匹配）
    let existing = conditions.find((c) => c.label === blockTitle);
    if (!existing && idx < conditions.length) {
      existing = conditions[idx];
    }
    return {
      isElse,
      label: existing?.label || blockTitle || '',
      condition: existing?.condition ?? null,
      id: existing?.id,
    };
  });

  const nonElse = rawConditions.filter((c) => !c.isElse);
  const elseBranches = rawConditions.filter((c) => c.isElse);
  const elseBranch = elseBranches.length > 0 ? elseBranches[0] : null;

  const newConditions = [
    ...nonElse.map((c, i) => ({
      id: c.id,
      label: c.label || `分支 ${i + 1}`,
      condition: c.condition,
    })),
    ...(elseBranch
      ? [
          {
            id: elseBranch.id,
            label: elseBranch.label || '默认分支',
            condition: null as object | null,
          },
        ]
      : []),
  ];

  // fullUpdate: true 确保 onExtInfoChange 触发（绕过 flowgram Compare.isChanged depth=1 浅比较）
  conditionNode.updateExtInfo({ conditions: newConditions }, true);

  branchBlocks.forEach((block, i) => {
    const rawCond = rawConditions[i];
    const isElseBlockFlag = rawCond?.isElse ?? false;
    let matched;
    if (isElseBlockFlag) {
      matched = newConditions[newConditions.length - 1];
    } else {
      const nonElseIdx = rawConditions.slice(0, i).filter((c) => !c.isElse).length;
      matched = newConditions[nonElseIdx];
    }
    const newTitle =
      matched?.label ||
      (isElseBlockFlag
        ? '默认分支'
        : `分支 ${rawConditions.slice(0, i).filter((c) => !c.isElse).length + 1}`);
    block.updateExtInfo({
      title: newTitle,
      isElse: isElseBlockFlag,
      condition: matched?.condition ?? null,
    });
    const blockOrderIcon = block.blocks?.[0];
    if (blockOrderIcon) {
      blockOrderIcon.updateExtInfo({
        title: newTitle,
        isElse: isElseBlockFlag,
        condition: matched?.condition ?? null,
      });
    }
  });

  updateNodeData(conditionNode.id, { conditions: newConditions });

  return true;
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
 * 分支标签组件 — 从 flowgram extInfo 和块树实时读取数据。
 *
 * 关键设计：conditions 数组、isElse 标志、nonElseIndex 全部在渲染时
 * 从 flowgram document 实时读取，确保与 handleNodeDataChange 的
 * updateExtInfo 同步（extInfo 是同一对象，不存在序列化延迟）。
 * 通过 useListenEvents 订阅 condition 节点的 onExtInfoChange 事件，
 * 在 extInfo 变更时立即触发重渲染（替代之前的 store 订阅间接方式）。
 */
function BlockOrderIconLabel({
  blockId,
  conditionNodeId,
  fallbackLabel,
  fallbackIsElse,
}: {
  /** 当前 block 节点 ID */
  blockId?: string;
  conditionNodeId?: string;
  /** 从 block extInfo 读取的兜底标签 */
  fallbackLabel: string;
  /** 从 block extInfo 读取的兜底 isElse 标志 */
  fallbackIsElse: boolean;
}) {
  const ctx = useClientContext();
  const conditionNode = conditionNodeId ? ctx.document.getNode(conditionNodeId) : undefined;
  // 订阅 condition 节点的 extInfo 变更事件，数据变化时立即重渲染
  useListenEvents(...(conditionNode?.onExtInfoChange ? [conditionNode.onExtInfoChange] : []));
  // 兜底：store 变更也触发重渲染（handleNodeDataChange → updateNodeData 路径，
  // 以及 block/blockOrderIcon 节点 extInfo 变更时 condition 节点事件可能不触发）
  // BlockOrderIconLabel 始终从 flowgram extInfo 读数据，store 仅作渲染触发器
  const _storeVersion = useProcessEditorStore((s) => s.schema);

  let isElse = fallbackIsElse;
  let conditions: Array<{ label?: string; condition?: object | null; id?: string }> = [];
  // displayIndex = 当前 block 在 conditions 数组中的位置（权威排序）
  let displayIndex = 0;
  if (blockId && conditionNode) {
    const condExtInfo = conditionNode.getExtInfo?.() ?? {};
    conditions =
      (condExtInfo.conditions as Array<{
        label?: string;
        condition?: object | null;
        id?: string;
      }>) || [];
    const branchBlocks = getBranchBlocks(conditionNode);
    const blockNode = branchBlocks.find((b) => b.id === blockId);
    if (blockNode) {
      isElse = isElseBlock(blockNode);
    } else {
      // blockNode 未在 branchBlocks 中找到（文档树可能尚未更新），
      // 用 blockId 推导 isElse 作为兜底
      isElse = blockId.includes('elseBlock') || fallbackIsElse;
    }

    if (conditions.length > 0) {
      // 从 conditions 数组中按 label 匹配当前 block 的位置
      // conditions 数组顺序：非 else 分支在前，else 分支在末尾
      // 这是权威排序，不受物理块位置影响
      const blockTitle = blockNode?.getExtInfo?.()?.title as string | undefined;
      if (isElse) {
        // else 分支始终是 conditions 数组的最后一个
        displayIndex = conditions.length - 1;
      } else {
        // 非 else 分支：通过 label 匹配找到在 conditions 中的位置
        // 仅用 blockTitle 匹配，不用 fallbackLabel，避免 fallbackLabel 中的
        // '条件成立' 等回退值误匹配到 conditions[0] 导致优先级重复。
        const matchedIdx = conditions.findIndex((c) => c.label === blockTitle);
        if (matchedIdx >= 0) {
          displayIndex = matchedIdx;
        } else {
          // label 匹配失败时，退回到基于非 else 块的物理计数
          let counter = 0;
          for (const sibling of branchBlocks) {
            if (sibling.id === blockId) break;
            if (!isElseBlock(sibling)) counter++;
          }
          displayIndex = counter;
        }
      }
    } else {
      // conditions 尚未同步到 extInfo（初始渲染），基于物理块计数
      const branchBlockCount = branchBlocks.length;
      if (isElse) {
        displayIndex = Math.max(branchBlockCount - 1, 0);
      } else {
        let counter = 0;
        for (const sibling of branchBlocks) {
          if (sibling.id === blockId) break;
          if (!isElseBlock(sibling)) counter++;
        }
        displayIndex = counter;
      }
    }
  }

  // 从 conditions 数组中取当前分支的数据
  const branchData = conditions[displayIndex];
  const label = branchData?.label || fallbackLabel;
  const condition = branchData?.condition ?? null;

  // JsonLogic 对象 → 可读表达式字符串（异常时降级为 JSON 摘要，避免页面崩溃）
  const conditionText = useMemo(() => {
    if (!condition) return '';
    try {
      return jsonLogicToExpression(condition);
    } catch {
      return JSON.stringify(condition).substring(0, 30) + '...';
    }
  }, [condition]);

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
          优先级 {displayIndex + 1}
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
    // 从父级链中找到 condition 节点 ID 和 block ID
    const flowNode = ctx.document.getNode(node.id);
    let conditionNodeId: string | undefined;
    let blockId: string | undefined;
    let fallbackIsElse = false;
    let fallbackLabel = '';
    if (flowNode) {
      const blockNode = flowNode.parent;
      if (blockNode) {
        blockId = blockNode.id;
        const inlineBlocksNode = blockNode.parent;
        if (inlineBlocksNode) {
          conditionNodeId = inlineBlocksNode.parent?.id;
        }
        // 判断是否为 else 分支：优先 extInfo.isElse，回退到 block ID
        const blockExtInfo = blockNode.getExtInfo?.() ?? {};
        fallbackIsElse = isElseBlock(blockNode);
        // 读取 extInfo title。仅在 title 为空（未初始化）时用 block ID 推导语义化标签。
        // 不对 '分支 N' 等真实标签做替换，因为面板 addBranch 创建的分支 label 就是 '分支 N'。
        const rawTitle = (blockExtInfo.title as string) || (extInfo.title as string) || '';
        fallbackLabel = rawTitle
          ? rawTitle
          : fallbackIsElse
            ? '默认分支'
            : blockNode.id?.includes('ifBlock')
              ? '条件成立'
              : '分支';
      }
    }

    return (
      <BlockOrderIconLabel
        blockId={blockId}
        conditionNodeId={conditionNodeId}
        fallbackLabel={fallbackLabel}
        fallbackIsElse={fallbackIsElse}
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
    const node = findNode(schema.nodes);
    if (!node) return null;

    // 对于条件分支节点，直接从 flowgram extInfo 读取 conditions，
    // 因为 store schema 中的 conditions 可能滞后于画布实际分支数
    // （getBranchBlocks 在事件回调中可能返回过时数据导致 reconcile 失败）
    if (node.type === 'condition') {
      const flowNode = ctx.document.getNode(selectedNodeId);
      if (flowNode) {
        const extInfo = flowNode.getExtInfo?.() ?? {};
        const extConditions = extInfo.conditions;
        if (extConditions && Array.isArray(extConditions) && extConditions.length > 0) {
          return { ...node, data: { ...node.data, conditions: extConditions } };
        }
        // extInfo.conditions 为空时，尝试从 formData 读取（condition 节点有 formMeta）
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const formData = (flowNode as any).getData?.({ type: 'FlowNodeEntityFormData' });
          if (formData?.formModel?.initialized) {
            const formJSON = formData.toJSON() as { conditions?: unknown } | undefined;
            const formConditions = formJSON?.conditions;
            if (Array.isArray(formConditions) && formConditions.length > 0) {
              return { ...node, data: { ...node.data, conditions: formConditions } };
            }
          }
        } catch {
          // formData 不可用时忽略
        }
      }
    }
    return node;
  }, [schema, selectedNodeId, ctx.document]);

  const handleNodeDataChange = useCallback(
    (id: string, data: Record<string, unknown>) => {
      const flowNode = ctx.document.getNode(id);
      if (flowNode) {
        // fullUpdate: true 确保 onExtInfoChange 触发（绕过 flowgram Compare.isChanged depth=1 浅比较）
        flowNode.updateExtInfo(data, true);
        // 同步到 Zustand store，确保配置面板立即反映 conditions 变化
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
              return !(bi.isElse as boolean);
            });
            const newNonElseCount = conditionsNonElse.length - branchBlocksNonElse.length;
            // 检查是否需要新增 else 分支
            const conditionsHasElse =
              conditions.length > 0 && !conditions[conditions.length - 1]?.condition;
            const branchBlocksHasElse = branchBlocks.some((b) => {
              const bi = b.getExtInfo?.() ?? {};
              return bi.isElse as boolean;
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
                  return bi.isElse as boolean;
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

          // conditions 数组变短 → 删除多余的 block 节点
          // 使用位置匹配（非 else 序号）而非标签匹配，避免标题不同步导致删错块
          if (conditions.length < branchBlocks.length) {
            const conditionsNonElse = conditions.filter(
              (_, i) => !(i === conditions.length - 1 && !conditions[i]?.condition),
            );
            const conditionsHasElse =
              conditions.length > 0 && !conditions[conditions.length - 1]?.condition;

            // 分类现有 block：非 else 和 else
            const nonElseBlocks = branchBlocks.filter((b) => {
              const bi = b.getExtInfo?.() ?? {};
              return !(bi.isElse as boolean);
            });
            const elseBlocks = branchBlocks.filter((b) => {
              const bi = b.getExtInfo?.() ?? {};
              return bi.isElse as boolean;
            });

            // 需要删除的非 else 块：倒序删除多余的
            const nonElseToDelete = Math.max(0, nonElseBlocks.length - conditionsNonElse.length);
            for (let i = 0; i < nonElseToDelete; i++) {
              const block = nonElseBlocks[nonElseBlocks.length - 1 - i];
              if (!block) continue;
              try {
                ctx.operation.deleteNode(block.id);
              } catch (e) {
                console.error('[handleNodeDataChange] deleteBlock failed', e);
              }
            }

            // 需要删除的 else 块：如果 conditions 没有 else 但 block 有 else
            if (!conditionsHasElse && elseBlocks.length > 0) {
              for (const block of elseBlocks) {
                try {
                  ctx.operation.deleteNode(block.id);
                } catch (e) {
                  console.error('[handleNodeDataChange] deleteElseBlock failed', e);
                }
              }
            } else if (conditionsHasElse && elseBlocks.length > 1) {
              // 只保留一个 else 块，删除多余的
              for (let i = 1; i < elseBlocks.length; i++) {
                try {
                  ctx.operation.deleteNode(elseBlocks[i]!.id);
                } catch (e) {
                  console.error('[handleNodeDataChange] deleteDuplicateElseBlock failed', e);
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
            const isElseBlock = !!(blockInfo.isElse as boolean);
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
              condition: cond?.condition ?? null,
              isElse: isElseBlock,
            });
          }

          // 物理重排：确保 else block 始终在 inlineBlocks 的末尾（最右侧）
          // 从配置面板添加/删除分支后，else block 的物理位置可能不在末尾
          const finalBranchBlocks = getBranchBlocks(flowNode);
          if (finalBranchBlocks.length > 1) {
            const lastBlock = finalBranchBlocks[finalBranchBlocks.length - 1];
            const lastIsElse = lastBlock
              ? (() => {
                  const bi = lastBlock.getExtInfo?.() ?? {};
                  return bi.isElse as boolean;
                })()
              : false;
            if (!lastIsElse) {
              const elseBlock = finalBranchBlocks.find((b) => {
                const bi = b.getExtInfo?.() ?? {};
                return bi.isElse as boolean;
              });
              if (elseBlock) {
                const inlineBlocksId = `$inlineBlocks$${id}`;
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
                    toIndex: finalBranchBlocks.length - 1,
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
      className="apaas-config-sidebar"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 480,
        background: '#fff',
        borderLeft: '1px solid #eef0f4',
        boxShadow: '-4px 0 12px rgba(0,0,0,0.06)',
        zIndex: 1000,
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
    syncConditionBlockExtInfo(ctx, type, nodeId);
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

/**
 * 条件分支节点创建后，显式将 block data 同步到 extInfo。
 * fromNodeJSON 不会将 block data 写入 extInfo（block 有 formData 但无 formMeta），
 * 因此在节点创建后通过 RAF + setTimeout 显式写入，确保 label/isElse 正确显示。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function syncConditionBlockExtInfo(ctx: any, type: string, nodeId: string): void {
  if (type !== 'condition') return;
  const ifBlockId = `ifBlock_${nodeId}`;
  const elseBlockId = `elseBlock_${nodeId}`;
  const sync = () => {
    const ifBlock = ctx.document.getNode(ifBlockId);
    const elseBlock = ctx.document.getNode(elseBlockId);
    if (ifBlock) {
      ifBlock.updateExtInfo({ title: '条件成立', isElse: false, condition: null }, true);
      const ifIcon = ifBlock.blocks?.[0];
      if (ifIcon) {
        ifIcon.updateExtInfo({ title: '条件成立', isElse: false, condition: null }, true);
      }
    }
    if (elseBlock) {
      elseBlock.updateExtInfo({ title: '默认分支', isElse: true, condition: null }, true);
      const elseIcon = elseBlock.blocks?.[0];
      if (elseIcon) {
        elseIcon.updateExtInfo({ title: '默认分支', isElse: true, condition: null }, true);
      }
    }
    const condNode = ctx.document.getNode(nodeId);
    if (condNode) {
      condNode.updateExtInfo(
        {
          conditions: [
            { label: '条件成立', condition: null },
            { label: '默认分支', condition: null },
          ],
        },
        true,
      );
    }
  };
  requestAnimationFrame(sync);
  setTimeout(sync, 50);
}

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

      if (fromId) {
        const fromNode = ctx.document.getNode(fromId);
        if (fromNode) {
          ctx.operation.addFromNode(fromNode, nodeJSON);
          syncConditionBlockExtInfo(ctx, type, nodeId);
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
      syncConditionBlockExtInfo(ctx, type, nodeId);
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
      {/* CSS 覆盖:禁用 flowgram 选择框/连线层的 pointer-events，
          确保配置面板内的按钮（Add rule/Add group/删除等）可点击 */}
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
        /* 配置面板容器及其所有子元素强制可点击，防止 flowgram overlay 拦截 */
        .apaas-config-sidebar,
        .apaas-config-sidebar * {
          pointer-events: auto !important;
        }
      `}</style>
      <EditorRenderer />
      {!readonly && <ZoomToolbar />}
      {/* ConfigSidebar 通过 Portal 渲染到 document.body，避免 flowgram 半屏 UI 组件（Semi UI）
          的事件委托机制拦截配置面板内 Ant Design 和 RAQB 按钮的点击事件 */}
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

/**
 * 事件驱动桥接器 — 替代 300ms 轮询方案。
 *
 * 使用 flowgram 原生事件 API（onSelectionChanged / onNodeCreate /
 * onNodeDispose / onNodeUpdate / onExtInfoChange）替代 setInterval 轮询，
 * 在状态变化时立即同步，无需周期性全量扫描。
 *
 * - 选中同步：onSelectionChanged → setSelectedNode（立即，无防抖）
 * - 条件分支重建：onNodeCreate / onNodeDispose → reconcileConditionBranches
 * - extInfo→store 同步：onExtInfoChange（per condition node，带 JSON.stringify 去重）
 * - schema 导出：所有事件 → 防抖 50ms 批量处理
 */
function EventBridge({ onSchemaChange }: { onSchemaChange?: (schema: WorkflowSchema) => void }) {
  const ctx = useClientContext();
  const setSelectedNode = useProcessEditorStore((s) => s.setSelectedNode);
  const updateNodeData = useProcessEditorStore((s) => s.updateNodeData);
  const onSchemaChangeRef = useRef(onSchemaChange);
  onSchemaChangeRef.current = onSchemaChange;

  const exportSchema = useCallback(() => {
    const doc = ctx.document.toJSON() as FlowDocumentJSON;
    const schema = flowToWorkflowSchema(doc);
    // 合并 extInfo 中的 conditions 到 schema（toJSON 不含 extInfo）
    for (const node of ctx.document.getAllNodes()) {
      if (node.flowNodeType === 'condition') {
        const extInfo = node.getExtInfo?.() ?? {};
        const conditions = extInfo.conditions;
        if (conditions) {
          mergeConditionsIntoSchema(schema.nodes, node.id, conditions);
        }
      }
    }
    return schema;
  }, [ctx.document]);

  useEffect(() => {
    const disposables = new DisposableCollection();
    let lastDocSig = '';
    let exportTimer: ReturnType<typeof setTimeout> | null = null;

    // --- 防抖导出（50ms 批量处理连续变更） ---
    const scheduleExport = () => {
      if (exportTimer) clearTimeout(exportTimer);
      exportTimer = setTimeout(() => {
        exportTimer = null;
        if (!onSchemaChangeRef.current) return;
        const schema = exportSchema();
        const sig = JSON.stringify(schema);
        if (sig !== lastDocSig) {
          lastDocSig = sig;
          onSchemaChangeRef.current(schema);
        }
      }, 50);
    };

    // --- 1. 选中同步（立即，无防抖） ---
    const syncSelection = () => {
      const sel = ctx.selection?.selection;
      const newId = sel && sel.length > 0 ? (sel[0]?.id ?? null) : null;
      setSelectedNode(newId);
    };
    syncSelection();
    disposables.push(ctx.selection?.onSelectionChanged(syncSelection));

    // --- 2. 条件节点 extInfo 订阅：同步 conditions 到 store ---
    const subscribeConditionNode = (node: FlowNodeEntity) => {
      disposables.push(
        node.onExtInfoChange(() => {
          const extInfo = node.getExtInfo?.() ?? {};
          const extConditions = extInfo.conditions;
          if (!extConditions) return;
          // 用 getState() 命令式读取 store，避免依赖 storeSchema 导致重订阅
          const storeSchema = useProcessEditorStore.getState().schema;
          if (storeSchema) {
            let storeConditions: unknown = undefined;
            const findInStore = (nodes: WorkflowNode[]): void => {
              for (const sn of nodes) {
                if (sn.id === node.id) {
                  storeConditions = sn.data?.conditions;
                  return;
                }
                if (sn.blocks) findInStore(sn.blocks);
              }
            };
            findInStore(storeSchema.nodes);
            if (JSON.stringify(storeConditions) !== JSON.stringify(extConditions)) {
              updateNodeData(node.id, { conditions: extConditions });
            }
          }
          scheduleExport();
        }),
      );
    };

    // --- 3. 节点创建：为新 condition 节点订阅 extInfo；block 创建触发重建 ---
    disposables.push(
      ctx.document.onNodeCreate(({ node }) => {
        if (node.flowNodeType === 'condition') {
          subscribeConditionNode(node);
        }
        // block 节点创建 → 父 condition 节点需要重建 conditions 数组
        // 关键：使用 originParent（逻辑父 = condition 节点），而非 parent（结构性父 = $inlineBlocks$）。
        // flowgram 的 addBlock 设置 block.parent = $inlineBlocks$<id>、block.originParent = condition 节点。
        // 若用 node.parent 则 flowNodeType 永远是 'inlineBlocks'，reconcile 永不触发。
        const originParent = node.originParent;
        if (node.flowNodeType === 'block' && originParent?.flowNodeType === 'condition') {
          // BranchAdder 创建的 block 无 data（裸 block），需初始化 extInfo
          // 但 ApaasAdder 创建的 block（ID 含 'ifBlock_'/'elseBlock_'）有 data，
          // 其 extInfo 由 reconcileConditionBranches 中的 data→extInfo 同步处理。
          // 仅对 BranchAdder 创建的裸 block（ID 不含 ifBlock/elseBlock）初始化 extInfo。
          const blockExtInfo = node.getExtInfo?.() ?? {};
          const isApaasAdderBlock =
            node.id?.includes('ifBlock_') || node.id?.includes('elseBlock_');
          if (!blockExtInfo.title && blockExtInfo.isElse === undefined && !isApaasAdderBlock) {
            node.updateExtInfo(
              { title: '分支', isElse: false, condition: null },
              true, // fullUpdate 绕过浅比较，确保 onExtInfoChange 触发
            );
            const blockOrderIcon = node.blocks?.[0];
            if (blockOrderIcon) {
              blockOrderIcon.updateExtInfo({ title: '分支', isElse: false, condition: null }, true);
            }
          }
          // originTree 在 addChild 时同步更新，getBranchBlocks 能立即读到正确计数。
          // requestAnimationFrame 确保 renderTree.updateRenderStruct 完成（moveChildNodes 依赖渲染树）；
          // setTimeout(50) 兜底处理 moveChildNodes 在事件回调中静默失败的场景。
          const reconcileWithExport = () => {
            const condNode = ctx.document.getNode(originParent.id);
            if (!condNode) return;
            // 同步导出（不经防抖），确保 store schema 含最新节点树，
            // 否则 updateNodeData 找不到 condition 节点导致同步失败
            const schema = exportSchema();
            const sig = JSON.stringify(schema);
            if (sig !== lastDocSig) {
              lastDocSig = sig;
              onSchemaChangeRef.current?.(schema);
            }
            reconcileConditionBranches(condNode, ctx.document, updateNodeData);
          };
          requestAnimationFrame(reconcileWithExport);
          setTimeout(reconcileWithExport, 50);
        }
        scheduleExport();
      }),
    );

    // --- 4. 节点删除：block 删除触发父 condition 重建 ---
    disposables.push(
      ctx.document.onNodeDispose(({ node }) => {
        // 同 onNodeCreate：用 originParent 获取逻辑父（condition 节点）
        const originParent = node.originParent;
        if (node.flowNodeType === 'block' && originParent?.flowNodeType === 'condition') {
          reconcileConditionBranches(originParent, ctx.document, updateNodeData);
        }
        scheduleExport();
      }),
    );

    // --- 5. 节点 data 更变 → 防抖导出 + 条件分支同步 ---
    // onNodeUpdate 在 flowgram 文档树提交后触发，此时 getBranchBlocks 返回正确计数。
    // 使用防抖 setTimeout(500) 确保所有更新完成后重建 conditions 并同步到 store。
    let updateTimer: ReturnType<typeof setTimeout> | null = null;
    disposables.push(
      ctx.document.onNodeUpdate(() => {
        if (updateTimer) clearTimeout(updateTimer);
        updateTimer = setTimeout(() => {
          updateTimer = null;
          for (const node of ctx.document.getAllNodes()) {
            if (node.flowNodeType === 'condition') {
              const schema = exportSchema();
              const sig = JSON.stringify(schema);
              if (sig !== lastDocSig) {
                lastDocSig = sig;
                onSchemaChangeRef.current?.(schema);
              }
              reconcileConditionBranches(node, ctx.document, updateNodeData);
            }
          }
        }, 500);
        scheduleExport();
      }),
    );

    // --- 6. 初始：订阅所有已存在的 condition 节点 + 初始重建 + 初始导出 ---
    for (const node of ctx.document.getAllNodes()) {
      if (node.flowNodeType === 'condition') {
        subscribeConditionNode(node);
        reconcileConditionBranches(node, ctx.document, updateNodeData);
      }
    }
    scheduleExport();

    return () => {
      if (exportTimer) clearTimeout(exportTimer);
      disposables.dispose();
    };
  }, [ctx.selection, ctx.document, exportSchema, updateNodeData, setSelectedNode]);

  return null;
}
