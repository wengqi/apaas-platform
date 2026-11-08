/**
 * workflowSchema 引用收集（R-B functional-05，2026-11-08）——删除守卫消费。
 *
 * 从流程 schema（含 blocks 嵌套）收集对页面/通知模版的引用，供删除前
 * 「引用即硬拦」扫描（对齐删对象五守卫/P1-09 标准）：
 * - 页面引用 = user_task.pageId（审批节点绑定）+ trigger.startPageId（R6 发起页）
 * - 模版引用 = notification.templateId
 * 节点类型同时匹配 camelCase 与 snake_case（与 shared node-check 同口径）。
 */

export interface SchemaPageTemplateRefs {
  /** 被引用的页面 ID（审批绑定页 + 发起页） */
  pageIds: Set<string>;
  /** 被引用的通知模版 ID */
  templateIds: Set<string>;
}

/** 收集单个 workflowSchema 中的页面/模版引用。schema 形态非法时返回空集。 */
export function collectSchemaRefs(schema: unknown): SchemaPageTemplateRefs {
  const refs: SchemaPageTemplateRefs = { pageIds: new Set(), templateIds: new Set() };
  const nodes = (schema as { nodes?: unknown } | null)?.nodes;
  if (!Array.isArray(nodes)) return refs;
  walkNodes(nodes, refs);
  return refs;
}

function walkNodes(nodes: unknown[], refs: SchemaPageTemplateRefs): void {
  for (const raw of nodes) {
    const n = (raw ?? {}) as { type?: unknown; data?: unknown; blocks?: unknown };
    const data = (n.data ?? {}) as Record<string, unknown>;
    const type = String(n.type ?? '');
    if ((type === 'userTask' || type === 'user_task') && typeof data['pageId'] === 'string') {
      refs.pageIds.add(data['pageId']);
    }
    if (type === 'trigger' && typeof data['startPageId'] === 'string') {
      refs.pageIds.add(data['startPageId']);
    }
    if (type === 'notification' && typeof data['templateId'] === 'string') {
      refs.templateIds.add(data['templateId']);
    }
    if (Array.isArray(n.blocks)) walkNodes(n.blocks, refs);
  }
}

/** 找出命中引用匹配的流程名清单（删除守卫 409 消息直出）。 */
export function findReferencingProcessNames(
  defs: Array<{ name?: unknown; workflowSchema?: unknown }>,
  match: (refs: SchemaPageTemplateRefs) => boolean,
): string[] {
  const names: string[] = [];
  for (const d of defs) {
    if (match(collectSchemaRefs(d.workflowSchema))) names.push(String(d.name ?? ''));
  }
  return names;
}
