/**
 * 状态数据页签 — 纯函数辅助（变量分组 / 组件状态摘要 / 值格式化）。
 */

import type { ComponentNode, VariableDef } from '../api/pages.js';

/** 变量分组结果：带数据源的为「数据请求」，其余为「自定义变量」。 */
export interface VariableGroups {
  dataRequests: [string, VariableDef][];
  custom: [string, VariableDef][];
}

/** 按是否存在 datasource 把 viewModel 变量分成 数据请求 / 自定义变量 两组。 */
export function splitVariables(variables: Record<string, VariableDef>): VariableGroups {
  const dataRequests: [string, VariableDef][] = [];
  const custom: [string, VariableDef][] = [];
  for (const [name, def] of Object.entries(variables)) {
    if (def?.datasource) dataRequests.push([name, def]);
    else custom.push([name, def]);
  }
  return { dataRequests, custom };
}

/** 组件状态摘要：props 键数（对应飞书「{ } n keys」）。 */
export function propKeyCount(node: ComponentNode): number {
  return Object.keys(node.props ?? {}).length;
}

/** 组件状态展开行：props 键值摘要（值截断到 60 字符）。 */
export function summarizeProps(node: ComponentNode): [string, string][] {
  return Object.entries(node.props ?? {}).map(([key, value]) => [
    key,
    truncate(stringifyValue(value), 60),
  ]);
}

/** 运行时值格式化（状态树展示用）。 */
export function stringifyValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
