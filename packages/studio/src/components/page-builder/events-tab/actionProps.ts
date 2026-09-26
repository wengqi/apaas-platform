/**
 * 事件配置 Tab — node.props 动作链读写（从 EventsTab.tsx 拆分，
 * AGENTS.md 单文件 400 行规范）。
 */

import type { ComponentNode, ActionConfig } from '../../../api/pages.js';

/**
 * 从 node.props 中读取指定事件的动作链。
 */
export function readActions(node: ComponentNode, eventName: string): ActionConfig[] {
  const prop = node.props[eventName];
  if (!prop) return [];
  if (Array.isArray(prop)) {
    return prop.flatMap((p) => {
      if (p && typeof p === 'object' && '__action' in p) {
        return [(p as { __action: ActionConfig }).__action];
      }
      return [];
    });
  }
  if (prop && typeof prop === 'object' && '__action' in prop) {
    return [(prop as { __action: ActionConfig }).__action];
  }
  return [];
}

/**
 * 将动作链写回 node.props[eventName]。
 * 单个动作 → { __action: ActionConfig }
 * 多个动作 → ActionConfig[]（每个元素为 { __action: ActionConfig }）
 */
export function writeActions(
  updateComponentProps: (id: string, props: Record<string, unknown>) => void,
  nodeId: string,
  eventName: string,
  actions: ActionConfig[],
) {
  if (actions.length === 0) {
    updateComponentProps(nodeId, { [eventName]: undefined });
    return;
  }
  if (actions.length === 1) {
    updateComponentProps(nodeId, { [eventName]: { __action: actions[0] } });
    return;
  }
  // 多个动作 → 数组
  const propValue = actions.map((a) => ({ __action: a }));
  updateComponentProps(nodeId, { [eventName]: propValue });
}
