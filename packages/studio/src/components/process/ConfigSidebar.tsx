/**
 * 配置侧边栏 — 浮在画布右侧的节点配置面板。
 *
 * 从 SimplifiedEditor.tsx 提取。包含：
 * - 选中节点解析（含条件分支 extInfo 实时读取）
 * - handleNodeDataChange（条件分支 block 创建/删除/同步）
 * - NodeConfigPanel 渲染
 */

import { useCallback, useMemo } from 'react';
import { useClientContext } from '@flowgram.ai/fixed-layout-editor';
import { Button, Typography } from 'antd';
import type { WorkflowNode } from '../../api/processes.js';
import { useProcessEditorStore } from '../../stores/processEditor.js';
import NodeConfigPanel from './NodeConfigPanel.js';

/** flowgram form-core 运行时注入的 getData 方法重载不在 FlowNodeEntity 静态类型上。 */
interface FormDataResult {
  formModel?: { initialized?: boolean };
  toJSON(): { conditions?: unknown } | undefined;
}
import { getBranchBlocks } from './conditionBranchUtils.js';

/** 分支容器类节点（condition/inclusive 共用 block 结构与配置逻辑）。 */
function isBranchingType(type: string | number | undefined): boolean {
  return type === 'condition' || type === 'inclusive';
}

const { Text } = Typography;

export function ConfigSidebar({ readonly }: { readonly: boolean }) {
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

    if (isBranchingType(node.type)) {
      const flowNode = ctx.document.getNode(selectedNodeId);
      if (flowNode) {
        const extInfo = flowNode.getExtInfo?.() ?? {};
        const extConditions = extInfo.conditions;
        if (extConditions && Array.isArray(extConditions) && extConditions.length > 0) {
          return { ...node, data: { ...node.data, conditions: extConditions } };
        }
        try {
          const nodeWithForm = flowNode as unknown as {
            getData?(opts: { type: 'FlowNodeEntityFormData' }): FormDataResult | undefined;
          };
          const formData = nodeWithForm.getData?.({ type: 'FlowNodeEntityFormData' });
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
        flowNode.updateExtInfo(data, true);
        updateNodeData(id, data);
        if (isBranchingType(flowNode.flowNodeType) && Array.isArray(data.conditions)) {
          const conditions = data.conditions as Array<{
            label?: string;
            condition?: object | null;
          }>;
          let branchBlocks = getBranchBlocks(flowNode);

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
            const conditionsNonElse = conditions.filter(
              (_, i) => !(i === conditions.length - 1 && !conditions[i]?.condition),
            );
            const branchBlocksNonElse = branchBlocks.filter((b) => {
              const bi = b.getExtInfo?.() ?? {};
              return !(bi.isElse as boolean);
            });
            const newNonElseCount = conditionsNonElse.length - branchBlocksNonElse.length;
            const conditionsHasElse =
              conditions.length > 0 && !conditions[conditions.length - 1]?.condition;
            const branchBlocksHasElse = branchBlocks.some((b) => {
              const bi = b.getExtInfo?.() ?? {};
              return bi.isElse as boolean;
            });
            const needNewElse = conditionsHasElse && !branchBlocksHasElse;

            if (newNonElseCount > 0) {
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
                break;
              }
            } else if (needNewElse) {
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
              break;
            }
            branchBlocks = getBranchBlocks(flowNode);
          }

          if (conditions.length < branchBlocks.length) {
            const conditionsNonElse = conditions.filter(
              (_, i) => !(i === conditions.length - 1 && !conditions[i]?.condition),
            );
            const conditionsHasElse =
              conditions.length > 0 && !conditions[conditions.length - 1]?.condition;

            const nonElseBlocks = branchBlocks.filter((b) => {
              const bi = b.getExtInfo?.() ?? {};
              return !(bi.isElse as boolean);
            });
            const elseBlocks = branchBlocks.filter((b) => {
              const bi = b.getExtInfo?.() ?? {};
              return bi.isElse as boolean;
            });

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

            if (!conditionsHasElse && elseBlocks.length > 0) {
              for (const block of elseBlocks) {
                try {
                  ctx.operation.deleteNode(block.id);
                } catch (e) {
                  console.error('[handleNodeDataChange] deleteElseBlock failed', e);
                }
              }
            } else if (conditionsHasElse && elseBlocks.length > 1) {
              for (let i = 1; i < elseBlocks.length; i++) {
                try {
                  ctx.operation.deleteNode(elseBlocks[i]!.id);
                } catch (e) {
                  console.error('[handleNodeDataChange] deleteDuplicateElseBlock failed', e);
                }
              }
            }
          }

          const updatedBranchBlocks = getBranchBlocks(flowNode);
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
            const blockInfo = block.getExtInfo?.() ?? {};
            const isElseFlag = !!(blockInfo.isElse as boolean);
            const cond = isElseFlag ? conditionsElse : conditionsNonElse[nonElseCounter];
            if (!isElseFlag) nonElseCounter++;
            const title = cond?.label || (isElseFlag ? '默认分支' : `分支 ${nonElseCounter}`);
            const blockOrderIcon = block.blocks?.[0];
            if (blockOrderIcon) {
              blockOrderIcon.updateExtInfo({
                title,
                condition: cond?.condition ?? null,
                isElse: isElseFlag,
              });
            }
            block.updateExtInfo({
              title,
              condition: cond?.condition ?? null,
              isElse: isElseFlag,
            });
          }

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
                  // moveChildNodes 可能失败，忽略错误
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
      processOptions: { label: string; value: string }[];
    };
  };
  const options = w.__apaasConfigOptions ?? {
    objectOptions: [],
    formOptions: [],
    templateOptions: [],
    processOptions: [],
  };

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
          processOptions={options.processOptions}
          schema={schema ?? undefined}
          onNodeDataChange={handleNodeDataChange}
          onDeleteNode={handleDeleteNode}
        />
      </div>
    </div>
  );
}
