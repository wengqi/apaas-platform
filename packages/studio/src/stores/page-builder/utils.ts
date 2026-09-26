/**
 * 从 stores/pageBuilder.ts 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 页面搭建器 store 的纯工具集:快照 / ID 生成 / 深拷贝 / 组件树操作 / Schema 工厂。
 */

import type {
  ComponentNode,
  ComponentProps,
  ComponentType,
  PageMeta,
  PageSchema,
  PageType,
} from '../../api/pages.js';
import { COMPONENT_META } from '../../constants/pageComponents.js';

/** 评审 P2-5：当前可保存内容的快照（schema + 可保存元数据） */
export function snapshotOf(state: {
  schema: PageSchema | null;
  currentPage: PageMeta | null;
}): string {
  return JSON.stringify({
    schema: state.schema,
    name: state.currentPage?.name ?? null,
    apiName: state.currentPage?.apiName ?? null,
    type: state.currentPage?.type ?? null,
    objectId: state.currentPage?.objectId ?? null,
  });
}

// ---------------------------------------------------------------------------
// 辅助函数:ID 生成 / 深拷贝 / 树操作
// ---------------------------------------------------------------------------

/** 生成组件节点唯一 ID。 */
export function generateNodeId(type: ComponentType): string {
  return `${type}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 深拷贝 Schema(用于历史栈快照)。 */
export function cloneSchema(schema: PageSchema): PageSchema {
  return structuredClone(schema);
}

/** 历史栈上限 — 防止长编辑会话内存无限增长（与 processEditor 一致）。 */
export const MAX_HISTORY = 50;

/** 推入历史栈（带上限截断）。 */
export function pushHistory(past: PageSchema[], schema: PageSchema): PageSchema[] {
  return [...past, cloneSchema(schema)].slice(-MAX_HISTORY);
}

/** 创建一个新的组件节点(根据类型元数据填充默认值)。 */
export function createComponentNode(type: ComponentType): ComponentNode {
  const meta = COMPONENT_META[type];
  return {
    id: generateNodeId(type),
    type,
    name: meta.label,
    props: { ...meta.defaultProps } as ComponentProps,
    children: meta.isContainer ? [] : undefined,
  };
}

/** 在树中按 ID 查找节点(递归)。 */
export function findNode(node: ComponentNode, id: string): ComponentNode | undefined {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** 在树中查找节点的父节点(递归)。 */
export function findParent(node: ComponentNode, id: string): ComponentNode | undefined {
  if (node.children) {
    for (const child of node.children) {
      if (child.id === id) return node;
      const found = findParent(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** 检查 ancestorId 是否是 descendantId 的祖先(用于循环检测)。 */
export function isAncestorOf(
  node: ComponentNode,
  ancestorId: string,
  descendantId: string,
): boolean {
  if (node.id === ancestorId) {
    return containsId(node, descendantId);
  }
  if (node.children) {
    for (const child of node.children) {
      if (isAncestorOf(child, ancestorId, descendantId)) return true;
    }
  }
  return false;
}

/** 检查 node 的子树中是否包含指定 ID。 */
export function containsId(node: ComponentNode, id: string): boolean {
  if (node.id === id) return true;
  if (node.children) {
    for (const child of node.children) {
      if (containsId(child, id)) return true;
    }
  }
  return false;
}

/** 深拷贝节点(递归),并为所有节点重新生成 ID。 */
export function deepCloneWithNewIds(node: ComponentNode): ComponentNode {
  return {
    ...node,
    id: generateNodeId(node.type),
    props: { ...node.props },
    children: node.children?.map((child) => deepCloneWithNewIds(child)),
  };
}

// ---------------------------------------------------------------------------
// Schema 工厂
// ---------------------------------------------------------------------------

/** 创建默认空页面 Schema(仅含根 Page 节点)。 */
export function createDefaultSchema(pageType: PageType): PageSchema {
  return {
    version: '1',
    pageType,
    viewModel: { variables: {} },
    root: {
      id: generateNodeId('page'),
      type: 'page',
      name: '页面',
      props: {},
      children: [],
    },
  };
}
