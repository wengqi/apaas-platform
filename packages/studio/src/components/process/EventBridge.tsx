/**
 * 事件驱动桥接器 — 替代 300ms 轮询方案。
 *
 * 从 SimplifiedEditor.tsx 提取。使用 flowgram 原生事件 API
 * （onSelectionChanged / onNodeCreate / onNodeDispose / onNodeUpdate / onExtInfoChange）
 * 在状态变化时立即同步，无需周期性全量扫描。
 */

import { useCallback, useEffect, useRef } from 'react';
import { useClientContext } from '@flowgram.ai/fixed-layout-editor';
import { DisposableCollection } from '@flowgram.ai/utils';
import type { FlowNodeEntity } from '@flowgram.ai/document';
import type { WorkflowSchema, WorkflowNode } from '../../api/processes.js';
import {
  flowToWorkflowSchema,
  type FlowDocumentJSON,
} from '../../../features/process/simplified/src/index.js';
import type { FlowNodeJSON } from '../../../features/process/simplified/src/typings.js';
import { useProcessEditorStore } from '../../stores/processEditor.js';
import { reconcileConditionBranches, mergeConditionsIntoSchema } from './conditionBranchUtils.js';

/** flowgram 结构性节点类型——extInfo 合并时跳过（其 data 由创建 JSON 携带）。 */
const STRUCTURAL_NODE_TYPES = new Set([
  'block',
  'blockIcon',
  'blockOrderIcon',
  'inlineBlocks',
  'root',
]);

/**
 * 将业务节点的 extInfo 并入导出 doc 的 node.data。
 *
 * 配置侧栏经 flowNode.updateExtInfo(data) 写入（ConfigSidebar.handleNodeDataChange），
 * 而 document.toJSON() 不含 extInfo——不并入则 fieldMapping/operation 等配置
 * 全部丢失于导出路径（此前仅靠 store 直写补丁兜底，schema-serializer 的
 * fieldMapping→inputsValues 转换也因此看不到 fieldMapping）。
 */
function mergeExtInfoIntoDocData(
  nodes: FlowNodeJSON[],
  getNode: (id: string) => FlowNodeEntity | undefined,
): void {
  for (const n of nodes) {
    if (n && n.type && !STRUCTURAL_NODE_TYPES.has(n.type)) {
      const extInfo = (getNode(n.id)?.getExtInfo?.() ?? {}) as Record<string, unknown>;
      if (Object.keys(extInfo).length > 0) {
        n.data = { ...(n.data ?? {}), ...extInfo };
      }
    }
    if (n?.blocks) mergeExtInfoIntoDocData(n.blocks, getNode);
  }
}

export function EventBridge({
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
    mergeExtInfoIntoDocData(doc.nodes ?? [], (id) => ctx.document.getNode(id));
    const schema = flowToWorkflowSchema(doc);
    for (const node of ctx.document.getAllNodes()) {
      if (node.flowNodeType === 'condition' || node.flowNodeType === 'inclusive') {
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

    const syncSelection = () => {
      const sel = ctx.selection?.selection;
      const newId = sel && sel.length > 0 ? (sel[0]?.id ?? null) : null;
      setSelectedNode(newId);
    };
    syncSelection();
    disposables.push(ctx.selection?.onSelectionChanged(syncSelection));

    const subscribeConditionNode = (node: FlowNodeEntity) => {
      disposables.push(
        node.onExtInfoChange(() => {
          const extInfo = node.getExtInfo?.() ?? {};
          const extConditions = extInfo.conditions;
          if (!extConditions) return;
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

    disposables.push(
      ctx.document.onNodeCreate(({ node }) => {
        if (node.flowNodeType === 'condition' || node.flowNodeType === 'inclusive') {
          subscribeConditionNode(node);
        }
        const originParent = node.originParent;
        if (node.flowNodeType === 'block' && originParent?.flowNodeType === 'condition') {
          const blockExtInfo = node.getExtInfo?.() ?? {};
          const isApaasAdderBlock =
            node.id?.includes('ifBlock_') || node.id?.includes('elseBlock_');
          if (!blockExtInfo.title && !isApaasAdderBlock) {
            node.updateExtInfo({ title: '分支', isElse: false, condition: null }, true);
            const blockOrderIcon = node.blocks?.[0];
            if (blockOrderIcon) {
              blockOrderIcon.updateExtInfo({ title: '分支', isElse: false, condition: null }, true);
            }
          }
          const reconcileWithExport = () => {
            const condNode = ctx.document.getNode(originParent.id);
            if (!condNode) return;
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

    disposables.push(
      ctx.document.onNodeDispose(({ node }) => {
        const originParent = node.originParent;
        if (node.flowNodeType === 'block' && originParent?.flowNodeType === 'condition') {
          reconcileConditionBranches(originParent, ctx.document, updateNodeData);
        }
        scheduleExport();
      }),
    );

    let updateTimer: ReturnType<typeof setTimeout> | null = null;
    disposables.push(
      ctx.document.onNodeUpdate(() => {
        if (updateTimer) clearTimeout(updateTimer);
        updateTimer = setTimeout(() => {
          updateTimer = null;
          for (const node of ctx.document.getAllNodes()) {
            if (node.flowNodeType === 'condition' || node.flowNodeType === 'inclusive') {
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

    for (const node of ctx.document.getAllNodes()) {
      if (node.flowNodeType === 'condition' || node.flowNodeType === 'inclusive') {
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
