/**
 * 条件分支工具函数 — flowgram dynamicSplit 条件节点的分支操作。
 *
 * 从 SimplifiedEditor.tsx 提取，包含：
 * - getBranchBlocks: 获取条件节点的分支 block 列表
 * - isElseBlock: 判断 block 是否为 else 分支
 * - reconcileConditionBranches: 画布原生添加/删除分支时同步 conditions 数组
 * - mergeConditionsIntoSchema: 导出 schema 时合并 extInfo 中的 conditions
 */

import type { FlowDocument, FlowNodeEntity } from '@flowgram.ai/document';
import type { WorkflowNode } from '../../api/processes.js';

/**
 * flowgram form-core 在运行时注入的 getData 方法重载不在 FlowNodeEntity 静态类型上。
 * 使用类型断言访问，避免接口继承冲突。
 */
interface FormDataResult {
  formModel?: { initialized?: boolean };
  toJSON(): { conditions?: unknown } | undefined;
}

/**
 * 获取 dynamicSplit 条件节点的分支 block 列表。
 */
export function getBranchBlocks(conditionNode: FlowNodeEntity | undefined): FlowNodeEntity[] {
  if (!conditionNode) return [];

  const inlineBlocks = conditionNode?.blocks?.find(
    (b: FlowNodeEntity) =>
      b.flowNodeType === 'inlineBlocks' ||
      b.flowNodeType === 'mainInlineBlocks' ||
      b.flowNodeType === 'catchInlineBlocks',
  );
  if (inlineBlocks?.blocks) {
    return inlineBlocks.blocks;
  }

  const doc = conditionNode.document;
  if (doc) {
    const inlineBlocksById = doc.getNode(`$inlineBlocks$${conditionNode.id}`);
    if (inlineBlocksById?.blocks) {
      return inlineBlocksById.blocks;
    }
  }

  return (conditionNode?.blocks ?? []).filter((b: FlowNodeEntity) => b.flowNodeType === 'block');
}

/**
 * 判断 block 是否为 else 分支。
 */
export function isElseBlock(block: FlowNodeEntity): boolean {
  const bi = block.getExtInfo?.() ?? {};
  if (bi.isElse !== undefined) return !!(bi.isElse as boolean);
  return block.id?.includes('elseBlock') ?? false;
}

/**
 * 将 extInfo 中的 conditions 合并到 schema 中对应节点的 data。
 */
export function mergeConditionsIntoSchema(
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
 * @returns true 如果执行了重建
 */
export function reconcileConditionBranches(
  conditionNode: FlowNodeEntity,
  document: FlowDocument,
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void,
): boolean {
  const extInfo = conditionNode.getExtInfo?.() ?? {};
  let conditions =
    (extInfo.conditions as Array<{ label?: string; condition?: object | null; id?: string }>) || [];

  if (conditions.length === 0) {
    try {
      const nodeWithForm = conditionNode as unknown as {
        getData?(opts: { type: 'FlowNodeEntityFormData' }): FormDataResult | undefined;
      };
      const formData = nodeWithForm.getData?.({ type: 'FlowNodeEntityFormData' });
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
      // formData 不可用时忽略
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

  {
    const nonElseConditions = conditions.filter(
      (_, i) => !(i === conditions.length - 1 && !conditions[i]?.condition),
    );

    let nonElseIdx = 0;
    for (let i = 0; i < branchBlocks.length; i++) {
      const block = branchBlocks[i];
      if (!block) continue;
      const blockExtInfo = block.getExtInfo?.() ?? {};
      if (!blockExtInfo.title || blockExtInfo.title === '分支') {
        const isElse = isElseBlock(block);
        let title: string;
        let condition: object | null;
        if (isElse) {
          title = '默认分支';
          condition = null;
        } else {
          const cond = nonElseConditions[nonElseIdx];
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
        if (!isElseBlock(block)) nonElseIdx++;
      }
    }
  }

  const ensureElseBlockLast = () => {
    let currentBranchBlocks = getBranchBlocks(conditionNode);
    if (currentBranchBlocks.length <= 1) return;
    let lastBlock = currentBranchBlocks[currentBranchBlocks.length - 1];
    let lastIsElse = lastBlock ? isElseBlock(lastBlock) : false;
    if (!lastIsElse) {
      const elseBlock = currentBranchBlocks.find((b) => isElseBlock(b));
      if (elseBlock && lastBlock) {
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

        currentBranchBlocks = getBranchBlocks(conditionNode);
        lastBlock = currentBranchBlocks[currentBranchBlocks.length - 1];
        lastIsElse = lastBlock ? isElseBlock(lastBlock) : false;
      }
    }
  };

  ensureElseBlockLast();

  {
    const afterBlocks = getBranchBlocks(conditionNode);
    const elseBlocks = afterBlocks.filter((b) => isElseBlock(b));
    if (elseBlocks.length > 1) {
      const keepElse = elseBlocks[0];
      let nonElseCount = afterBlocks.filter((b) => b !== keepElse && !isElseBlock(b)).length;
      for (const b of elseBlocks) {
        if (b !== keepElse) {
          nonElseCount++;
          const title = `分支 ${nonElseCount}`;
          b.updateExtInfo({ isElse: false, title, condition: null }, true);
          const icon = b.blocks?.[0];
          if (icon) icon.updateExtInfo({ isElse: false, title, condition: null }, true);
        }
      }
    }
  }

  const rawConditions = branchBlocks.map((block, idx) => {
    const blockInfo = block.getExtInfo?.() ?? {};
    const isElse = isElseBlock(block);
    const blockTitle = blockInfo.title as string;
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

  const newConditions = [...rawConditions];

  conditionNode.updateExtInfo({ conditions: newConditions }, true);

  updateNodeData(conditionNode.id, { conditions: newConditions });

  return true;
}
