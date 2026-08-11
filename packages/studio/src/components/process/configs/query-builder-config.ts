/**
 * react-awesome-query-builder 配置工厂。
 *
 * 从 variable-resolver 的 VariableOption[] 构建 RAQB 的 fields 配置，
 * 并提供 JsonLogic 导入/导出的便捷封装。
 *
 * 飞书对齐：操作符按字段类型动态过滤，支持为空/不为空/属于/不属于等。
 */

import { createElement } from 'react';
import { Utils as QbUtils, AntdConfig } from '@react-awesome-query-builder/antd';
import type { Config, ImmutableTree, JsonTree } from '@react-awesome-query-builder/antd';
import type { VariableOption } from './variable-resolver.js';
import { CustomRule } from './CustomRule.js';

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
// 操作符定义 — 按字段类型（与 CustomRule.tsx OPERATORS_BY_TYPE 对齐）
// ---------------------------------------------------------------------------

/** 各字段类型可用操作符 key 列表 */
const OPERATOR_KEYS_BY_TYPE: Record<string, string[]> = {
  text: [
    'equal',
    'not_equal',
    'in',
    'not_in',
    'contains',
    'not_contains',
    'is_empty',
    'is_not_empty',
  ],
  number: [
    'equal',
    'not_equal',
    'less',
    'less_or_equal',
    'greater',
    'greater_or_equal',
    'is_empty',
    'is_not_empty',
  ],
  boolean: ['equal', 'not_equal'],
  date: [
    'equal',
    'not_equal',
    'less',
    'less_or_equal',
    'greater',
    'greater_or_equal',
    'is_empty',
    'is_not_empty',
  ],
};

// ---------------------------------------------------------------------------
// 配置工厂
// ---------------------------------------------------------------------------

/**
 * 从变量选项列表构建 RAQB 的 fields 配置。
 */
export function buildQbConfig(variables: VariableOption[]): Config {
  const fields: Record<string, unknown> = {};

  for (const v of variables) {
    const fieldType = mapFieldType(v.type);
    fields[v.value] = {
      label: v.sourceNode ? `${v.label} — ${v.sourceNode}` : v.label,
      type: fieldType,
      // 按字段类型限定可用操作符
      operators: OPERATOR_KEYS_BY_TYPE[fieldType] ?? OPERATOR_KEYS_BY_TYPE.text,
      // 值来源：常量 + 引用字段 + 公式
      valueSources: ['value', 'field', 'expr'],
    };
  }

  // 如果没有变量，添加一个占位字段避免 RAQB 报错
  if (Object.keys(fields).length === 0) {
    fields['__placeholder__'] = {
      label: '（无可用变量）',
      type: 'text',
      operators: OPERATOR_KEYS_BY_TYPE.text,
      valueSources: ['value'],
    };
  }

  // 浅拷贝 AntdConfig 并覆盖 fields
  const config = { ...AntdConfig } as Config;
  (config as { fields: Record<string, unknown> }).fields = fields;

  // 深拷贝 operators 字典并注册自定义操作符
  // RAQB 要求每个操作符在 config.operators 中有定义（label + cardinality 等）
  // 不深拷贝会直接修改 AntdConfig 原始对象（引用共享），HMR 后可能被重置
  const origOperators = (config as { operators: Record<string, unknown> }).operators;
  const operators: Record<string, unknown> = { ...origOperators };
  (config as { operators: Record<string, unknown> }).operators = operators;

  // RAQB 原生已有 is_empty / is_not_empty，但 label 是英文，覆盖为中文
  operators['is_empty'] = {
    ...((operators['is_empty'] as object) ?? {}),
    label: '为空',
    labelForFormat: '为空',
  };
  operators['is_not_empty'] = {
    ...((operators['is_not_empty'] as object) ?? {}),
    label: '不为空',
    labelForFormat: '不为空',
  };

  // 注册 RAQB 默认不存在的自定义操作符
  if (!operators['contains']) {
    operators['contains'] = {
      label: '包含',
      labelForFormat: '包含',
      reversedOp: 'not_contains',
      jsonLogic: 'in', // RAQB jsonLogic: in(op, [val, {var: field}])
    };
  } else {
    operators['contains'] = { ...(operators['contains'] as object), label: '包含' };
  }
  if (!operators['not_contains']) {
    operators['not_contains'] = {
      label: '不包含',
      labelForFormat: '不包含',
      reversedOp: 'contains',
    };
  } else {
    operators['not_contains'] = { ...(operators['not_contains'] as object), label: '不包含' };
  }
  if (!operators['in']) {
    operators['in'] = {
      label: '属于',
      labelForFormat: '属于',
      reversedOp: 'not_in',
    };
  }
  if (!operators['not_in']) {
    operators['not_in'] = {
      label: '不属于',
      labelForFormat: '不属于',
      reversedOp: 'in',
    };
  }

  // 覆盖 config.types 中每种字段类型的 widget operators 列表
  // RAQB 从 config.types[fieldType].widgets[widgetName].operators 读取可用操作符，
  // 而非从字段的 operators 属性读取。必须在此覆盖才能使自定义操作符出现在下拉中。
  const types = (config as { types: Record<string, unknown> }).types;
  if (types) {
    for (const fieldType of Object.keys(OPERATOR_KEYS_BY_TYPE)) {
      const typeDef = types[fieldType] as
        { widgets?: Record<string, { operators?: string[] }> } | undefined;
      if (!typeDef?.widgets) continue;
      const ops = OPERATOR_KEYS_BY_TYPE[fieldType]!;
      for (const widgetDef of Object.values(typeDef.widgets)) {
        if (widgetDef) {
          widgetDef.operators = ops;
        }
      }
    }
  }

  // 注入自定义规则渲染器（飞书 aPaaS 风格横向四列栅格）
  (config.settings as unknown as Record<string, unknown>).renderItem = (props: unknown) =>
    createElement(CustomRule, props as never);

  // 注册自定义 JsonLogic 导出钩子
  const origJsonLogic = (config as unknown as { jsonLogic?: Record<string, unknown> }).jsonLogic;
  if (origJsonLogic) {
    (origJsonLogic as Record<string, unknown>)['is_empty'] = (field: string) => ({
      '!': { var: field },
    });
    (origJsonLogic as Record<string, unknown>)['is_not_empty'] = (field: string) => ({
      '!!': { var: field },
    });
  }

  return config;
}

// ---------------------------------------------------------------------------
// JsonLogic 导入/导出
// ---------------------------------------------------------------------------

/**
 * 从 JsonLogic 规则加载到 RAQB 的 Immutable 树。
 */
export function loadFromJsonLogic(rule: object | null | undefined, config: Config): ImmutableTree {
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
