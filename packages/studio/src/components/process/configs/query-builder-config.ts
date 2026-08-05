/**
 * react-awesome-query-builder 配置工厂。
 *
 * 从 variable-resolver 的 VariableOption[] 构建 RAQB 的 fields 配置，
 * 并提供 JsonLogic 导入/导出的便捷封装。
 */

import { Utils as QbUtils, AntdConfig } from '@react-awesome-query-builder/antd';
import type { Config, ImmutableTree, JsonTree } from '@react-awesome-query-builder/antd';
import type { VariableOption } from './variable-resolver.js';

// ---------------------------------------------------------------------------
// 类型映射
// ---------------------------------------------------------------------------

/** VariableOption.type → RAQB field type */
function mapFieldType(type?: string): string {
  switch (type) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'string':
    case 'object':
    case 'array':
    case 'any':
    default:
      return 'text';
  }
}

// ---------------------------------------------------------------------------
// 配置工厂
// ---------------------------------------------------------------------------

/**
 * 从变量选项列表构建 RAQB 的 fields 配置。
 */
export function buildQbConfig(variables: VariableOption[]): Config {
  const fields: Record<string, unknown> = {};

  for (const v of variables) {
    fields[v.value] = {
      label: v.sourceNode ? `${v.label} — ${v.sourceNode}` : v.label,
      type: mapFieldType(v.type),
      valueSources: ['value'],
    };
  }

  // 如果没有变量，添加一个占位字段避免 RAQB 报错
  if (Object.keys(fields).length === 0) {
    fields['__placeholder__'] = {
      label: '（无可用变量）',
      type: 'text',
      valueSources: ['value'],
    };
  }

  // 保持 AntdConfig 的 ctx 引用完整性，只覆盖 fields
  const config = { ...AntdConfig } as Config;
  (config as { fields: Record<string, unknown> }).fields = fields;
  return config;
}

// ---------------------------------------------------------------------------
// JsonLogic 导入/导出
// ---------------------------------------------------------------------------

/**
 * 从 JsonLogic 规则加载到 RAQB 的 Immutable 树。
 *
 * @param rule JsonLogic 规则对象（或 null/undefined 表示空）
 * @param config RAQB 配置
 * @returns Immutable 树（用于 <Query value=...>）
 */
export function loadFromJsonLogic(
  rule: object | null | undefined,
  config: Config,
): ImmutableTree {
  const emptyTree = () => QbUtils.loadTree({ id: QbUtils.uuid(), type: 'group' } as JsonTree);
  if (!rule) {
    return emptyTree();
  }
  try {
    const tree = QbUtils.loadFromJsonLogic(rule, config);
    return tree ?? emptyTree();
  } catch {
    return emptyTree();
  }
}

/**
 * 从 RAQB 的 Immutable 树导出 JsonLogic 规则。
 *
 * @param immutableTree RAQB 的 Immutable 树
 * @param config RAQB 配置
 * @returns JsonLogic 规则对象（或 null 表示空）
 */
export function exportToJsonLogic(
  immutableTree: ImmutableTree | null,
  config: Config,
): object | null {
  if (!immutableTree) return null;
  try {
    const { logic } = QbUtils.jsonLogicFormat(immutableTree, config);
    return logic ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/** 生成唯一 ID（用于 RAQB 树节点） */
export function newQbId(): string {
  return QbUtils.uuid();
}
