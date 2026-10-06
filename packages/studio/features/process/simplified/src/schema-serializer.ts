/**
 * Schema 序列化器 — flowgram 内部格式 ↔ WorkflowSchema (SSOT) 双向转换。
 *
 * 基于 flowgram.ai Fixed Layout 引擎:
 *  - fixed-layout 的 toJSON() 只输出 { nodes: [...] },不含 edges
 *  - 节点间的顺序关系靠树结构中兄弟节点排列顺序隐式表达
 *  - edges 从树结构推导生成
 *
 * 这是"同源互转"的核心：
 *  - 编辑器产出/消费 flowgram 内部格式 (FlowDocumentJSON)
 *  - 转换为 WorkflowSchema JSON 后，存入 process_definitions.workflow_schema (Prisma)
 *  - 自研执行引擎直接消费 WorkflowSchema
 */

import type { FlowDocumentJSON, FlowNodeJSON } from './typings.js';
import type { WorkflowSchema, WorkflowNode, WorkflowEdge } from '@apaas/shared';

/**
 * flowgram 内部系统节点类型 — 这些是布局引擎自动创建的结构性节点,
 * 不应出现在 WorkflowSchema 中(它们由 condition 节点的 onCreate 重建)。
 */
const SYSTEM_NODE_TYPES = new Set(['blockIcon', 'inlineBlocks', 'blockOrderIcon', 'root']);

/**
 * 判断节点是否为系统节点(不应序列化到 WorkflowSchema)。
 */
function isSystemNode(node: FlowNodeJSON): boolean {
  return SYSTEM_NODE_TYPES.has(node.type ?? '');
}

/**
 * 节点类型标准化：flowgram 注册名（驼峰，如 userTask）→ 引擎/SSOT 名（snake_case，如 user_task）。
 *
 * 自研引擎按 snake_case 注册执行器（SimplifiedNodeType），而 flowgram 物料注册用驼峰名。
 * 序列化到 SSOT 时统一转 snake_case，否则编辑器搭建的流程在引擎执行时报
 * unsupported_node_type。已是 snake_case 的类型（引擎/种子数据）幂等不变。
 */
export function toEngineNodeType(type: string): string {
  return type.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/**
 * 引擎/SSOT 名（snake_case）→ flowgram 注册名（驼峰）。
 * 仅映射仍以驼峰注册的历史物料；新物料（loop/inclusive 等）直接以 snake_case 注册，无需映射。
 */
export function toEditorNodeType(type: string): string {
  const map: Record<string, string> = {
    object_operation: 'objectOperation',
    user_task: 'userTask',
    http_request: 'httpRequest',
  };
  return map[type] ?? type;
}

/**
 * FlowDocumentJSON (flowgram fixed-layout 内部格式) → WorkflowSchema (SSOT)
 *
 * fixed-layout 的 toJSON() 只输出 { nodes: [...] },不含 edges。
 * 节点间的顺序关系靠树结构中兄弟节点排列顺序隐式表达。
 * 因此需要从树结构推导 edges(优先使用 doc.edges,若为空则从树推导)。
 *
 * 注意:flowgram 的 toJSON() 会包含系统节点(blockIcon/inlineBlocks/blockOrderIcon),
 * 这些节点在转换为 WorkflowSchema 时被过滤 — 它们由 condition 的 onCreate 重建。
 */
export function flowToWorkflowSchema(doc: FlowDocumentJSON): WorkflowSchema {
  // 过滤系统节点(blockIcon/inlineBlocks/blockOrderIcon),
  // 只保留业务节点和 block(分支容器,其 data 携带分支元数据)
  const businessNodes = (doc.nodes || []).filter((n) => !isSystemNode(n));

  const nodes = businessNodes.map(flowNodeToWorkflowNode);

  // 若 doc.edges 存在(future compat),直接映射;否则从树结构推导
  let edges: WorkflowEdge[];
  if (doc.edges && doc.edges.length > 0) {
    edges = doc.edges.map((e) => ({
      sourceNodeID: e.sourceNodeID,
      targetNodeID: e.targetNodeID,
      sourcePortID: e.sourcePortID,
      targetPortID: e.targetPortID,
      label: e.label,
    }));
  } else {
    // 兼容:从树结构推导 edges(fixed-layout 场景)
    edges = generateEdgesFromTree(businessNodes);
  }

  return {
    nodes,
    edges,
    groups: doc.groups as WorkflowSchema['groups'],
  };
}

/**
 * 从 flowgram 树结构推导 edges。
 *
 * 规则：
 * - 同一 blocks 数组中的连续兄弟节点生成顺序边 A→B
 *   (但分支节点本身不生成兄弟边 — 其流通过分支汇聚)
 * - 含子 blocks 的节点(如 condition) → 每个子 block(分支容器)生成边
 * - 分支容器(block) → 其首子节点(如果分支非空)
 * - 分支末节点(或空分支容器自身) → 父节点的下一个兄弟节点(分支汇聚)
 * - 递归处理嵌套 blocks
 * - 系统节点(blockIcon/inlineBlocks/blockOrderIcon)已在外层过滤,不传入此函数
 *
 * @param siblings 同一父节点下的兄弟节点数组(已过滤系统节点)
 * @param nextOfParent 父节点的下一个兄弟节点(用于分支汇聚)
 */
function generateEdgesFromTree(
  siblings: FlowNodeJSON[],
  nextOfParent?: FlowNodeJSON,
): WorkflowEdge[] {
  const edges: WorkflowEdge[] = [];

  for (let i = 0; i < siblings.length; i++) {
    const node = siblings[i]!;
    const nextSibling = siblings[i + 1];
    const nodeBlocks = node.blocks;
    const isBranching = !!(nodeBlocks && nodeBlocks.length > 0);

    // 1. 兄弟节点间的顺序边(分支节点跳过 — 流通过分支汇聚)
    //    block 类型节点(分支容器)不在这里生成兄弟边,它们由父分支节点管理
    if (nextSibling && !isBranching && node.type !== 'block') {
      edges.push({ sourceNodeID: node.id, targetNodeID: nextSibling.id });
    }

    // 2. 递归处理子 blocks(条件分支等复合节点)
    if (isBranching && nodeBlocks) {
      // 确定分支汇聚目标:优先下一个兄弟节点,否则用父级的下一个兄弟
      const mergeTarget = nextSibling ?? nextOfParent;

      for (const block of nodeBlocks) {
        if (!block) continue;

        // 父节点 → 分支容器（条件分支：edge.label = 分支名）
        // #17：ConditionExecutor 按 conditions[].label 匹配出边——block 只有
        // data.title（与分支名同源），此前取不存在的 data.label 落到 block.id，
        // 运行时永远匹配不上而降级第一条出边（驳回被误写"已完成"的根因）。
        edges.push({
          sourceNodeID: node.id,
          targetNodeID: block.id,
          label:
            (block.data?.['label'] as string | undefined) ??
            (block.data?.['title'] as string | undefined) ??
            block.id,
        });

        // block 的子节点:递归处理
        // 注意:block 的子节点存储在 block.blocks 中(已过滤系统节点)
        const blockChildren = block.blocks || [];

        // 分支容器 → 首子节点(如果分支非空)
        if (blockChildren.length > 0) {
          const firstChild = blockChildren[0];
          if (firstChild) {
            edges.push({ sourceNodeID: block.id, targetNodeID: firstChild.id });
          }
        }

        // 递归处理分支内部
        const innerEdges = generateEdgesFromTree(blockChildren, mergeTarget);
        edges.push(...innerEdges);

        // 分支末节点(或空分支容器自身) → 汇聚目标
        if (mergeTarget) {
          const lastInBlock = getLastNodeInBlock(block);
          if (lastInBlock) {
            edges.push({
              sourceNodeID: lastInBlock.id,
              targetNodeID: mergeTarget.id,
            });
          }
        }
      }
    }
  }

  return edges;
}

/**
 * 获取 block(分支容器)内的最后一个业务节点。
 * 如果 block 内有子节点(已过滤系统节点),取最后一个;否则返回 block 自身。
 */
function getLastNodeInBlock(block: FlowNodeJSON): FlowNodeJSON | undefined {
  // 过滤系统节点,只看业务子节点
  const businessChildren = (block.blocks || []).filter((b) => !isSystemNode(b));
  if (businessChildren.length > 0) {
    const last = businessChildren[businessChildren.length - 1];
    if (last) return last;
  }
  return block;
}

/**
 * 将编辑器字段映射（FieldMapper 产出 Record<string,string>）转换为引擎
 * inputsValues 四态契约（执行器只消费 inputsValues，见 gateway
 * object-operation.executor：ctx.inputs 由 node.data.inputsValues 解析而来；
 * 此前 fieldMapping 直传不转换，UI 配置的更新节点运行时报"缺少 recordId"）。
 *
 * 转换规则：
 * - 值恰为单个 `${path}` → ref（content 为点分路径数组，与种子数据契约一致）
 * - 值含 `${` 插值 → template（引擎 renderTemplateDotted 插值）
 * - 其余 → constant
 */
function fieldMappingToInputsValues(
  fieldMapping: Record<string, string>,
): Record<string, { type: string; content: unknown }> {
  const inputsValues: Record<string, { type: string; content: unknown }> = {};
  for (const [key, value] of Object.entries(fieldMapping)) {
    if (!key.trim()) continue;
    const singleRef = /^\$\{([a-zA-Z_][\w.]*)\}$/.exec(value.trim());
    if (singleRef) {
      inputsValues[key] = { type: 'ref', content: singleRef[1]!.split('.') };
    } else if (value.includes('${')) {
      inputsValues[key] = { type: 'template', content: value };
    } else {
      inputsValues[key] = { type: 'constant', content: value };
    }
  }
  return inputsValues;
}

function flowNodeToWorkflowNode(node: FlowNodeJSON): WorkflowNode {
  // 递归过滤子节点中的系统节点,只保留业务节点和 block(分支容器)
  // 注意:flowgram 的 toNodeJSON 已经跳过了以 $ 开头的系统节点,
  // 但 block 节点(分支容器)不应以 $ 开头,否则也会被跳过。
  const filteredBlocks = (node.blocks ?? []).filter((b) => b && !isSystemNode(b));

  const engineType = toEngineNodeType(node.type ?? '');
  const data: Record<string, unknown> = {
    title: node.data?.title ?? node.type,
    ...(node.data ?? {}),
  };

  // 对象/批量操作：fieldMapping → inputsValues（引擎唯一消费的输入契约）。
  // fieldMapping 保留原样供编辑器回显往返，inputsValues 每次导出重建；
  // fieldMapping 未覆盖的既有键（API/种子创作的 ref 等）合并保留。
  if (
    (engineType === 'object_operation' || engineType === 'batch_operation') &&
    data['fieldMapping'] &&
    typeof data['fieldMapping'] === 'object' &&
    Object.keys(data['fieldMapping'] as Record<string, string>).length > 0
  ) {
    const existing =
      data['inputsValues'] &&
      typeof data['inputsValues'] === 'object' &&
      !Array.isArray(data['inputsValues'])
        ? (data['inputsValues'] as Record<string, unknown>)
        : {};
    data['inputsValues'] = {
      ...existing,
      ...fieldMappingToInputsValues(data['fieldMapping'] as Record<string, string>),
    };
  }

  const result: WorkflowNode = {
    id: node.id,
    type: engineType as WorkflowNode['type'],
    meta: node.meta ?? {},
    data,
    blocks: filteredBlocks.map(flowNodeToWorkflowNode),
  };
  // 仅当存在边时才写 edges 键——无条件写 undefined 会让 JSON.stringify 与
  // 入库 schema 不等（打开即标"未保存"；用户反馈 2026-10-06）
  if (node.edges && node.edges.length > 0) {
    result.edges = node.edges.map((e) => ({
      sourceNodeID: e.sourceNodeID,
      targetNodeID: e.targetNodeID,
      sourcePortID: e.sourcePortID,
      targetPortID: e.targetPortID,
      label: e.label,
    }));
  }
  return result;
}

/**
 * WorkflowSchema (SSOT) → FlowDocumentJSON (flowgram fixed-layout 内部格式)
 *
 * fixed-layout 不需要节点坐标(位置由布局引擎自动计算)。
 * edges 在 fixed-layout 中被忽略(连接靠树结构兄弟顺序隐式表达),
 * 但保留在输出中以兼容其他消费者。
 */
export function workflowToFlowSchema(schema: WorkflowSchema): FlowDocumentJSON {
  return {
    nodes: (schema.nodes || []).map(workflowNodeToFlow),
    edges: (schema.edges || []).map((e) => ({
      sourceNodeID: e.sourceNodeID,
      targetNodeID: e.targetNodeID,
      sourcePortID: e.sourcePortID,
      targetPortID: e.targetPortID,
      label: e.label,
    })),
    groups: schema.groups as unknown[],
  };
}

function workflowNodeToFlow(node: WorkflowNode): FlowNodeJSON {
  return {
    id: node.id,
    type: toEditorNodeType(node.type),
    meta: (node.meta ?? {}) as Record<string, unknown>,
    data: node.data as FlowNodeJSON['data'],
    blocks: node.blocks?.map(workflowNodeToFlow),
    edges: node.edges?.map((e) => ({
      sourceNodeID: e.sourceNodeID,
      targetNodeID: e.targetNodeID,
      sourcePortID: e.sourcePortID,
      targetPortID: e.targetPortID,
      label: e.label,
    })),
  };
}
