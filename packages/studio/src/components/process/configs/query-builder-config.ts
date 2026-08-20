/**
 * react-awesome-query-builder 配置工厂。
 *
 * 从 variable-resolver 的 VariableOption[] 构建 RAQB 的 fields 配置，
 * 并提供 JsonLogic 导入/导出的便捷封装。
 *
 * 飞书对齐：操作符按字段类型动态过滤，支持为空/不为空/属于/不属于等。
 */

import { createElement } from 'react';
import { Popconfirm } from 'antd';
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
      _jsonLogicIsExclamationOp: true, // 标记 ! 包装的反向操作符，RAQB 在反向导入时能识别 {"!": {"in": [...]}} 格式
    };
  } else {
    operators['not_contains'] = {
      ...(operators['not_contains'] as object),
      label: '不包含',
      _jsonLogicIsExclamationOp: true,
    };
  }
  if (!operators['not_in']) {
    operators['not_in'] = {
      label: '不属于',
      labelForFormat: '不属于',
      reversedOp: 'in',
      _jsonLogicIsExclamationOp: true,
    };
  } else {
    operators['not_in'] = {
      ...(operators['not_in'] as object),
      label: '不属于',
      _jsonLogicIsExclamationOp: true,
    };
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

  // 拦截 RAQB 删除类按钮（delGroup/delRuleGroup/delRule），统一加二次确认。
  // 默认 renderButton 直接渲染 AntD Button，点击即删除；这里屏蔽按钮自身 onClick，
  // 改为 Popconfirm 确认后再执行删除。其余按钮类型走默认渲染。
  const settingsRecord = config.settings as unknown as Record<string, unknown>;
  const origRenderButton = settingsRecord['renderButton'] as
    ((props: Record<string, unknown>, ctx: unknown) => unknown) | undefined;
  const deleteConfirmText: Record<string, string> = {
    delGroup: '组内所有条件将一并删除',
    delRuleGroup: '该规则组将一并删除',
    delRule: '',
  };
  settingsRecord['renderButton'] = (props: Record<string, unknown>, ctx: unknown) => {
    const type = props['type'] as string | undefined;
    if (!origRenderButton) return null;
    if (type && type in deleteConfirmText) {
      // 屏蔽按钮自身 onClick，仅用其打开 Popconfirm；确认后才触发删除
      const safeProps = { ...props, onClick: undefined };
      return createElement(
        Popconfirm,
        {
          title: '确定删除吗？',
          description: deleteConfirmText[type] || undefined,
          onConfirm: props['onClick'] as (() => void) | undefined,
          okText: '确定删除',
          cancelText: '取消',
          placement: 'top',
        },
        origRenderButton(safeProps, ctx) as never,
      );
    }
    return origRenderButton(props, ctx);
  };

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
 * 规范化 JsonLogic 规则：递归确保 and/or 操作符的值是数组。
 *
 * 历史数据中可能出现 `{ and: { ... } }`（单个条件对象）而不是 `{ and: [{...}] }`（数组），
 * RAQB 6.6 加载时会在 `r.join()` 调用上抛错（"r.join is not a function"）。
 * 修复策略：发现 and/or 节点的值不是数组时，自动包装为单元素数组。
 */
function normalizeJsonLogic(rule: object): object {
  if (!rule || typeof rule !== 'object') return rule;
  const keys = Object.keys(rule);
  if (keys.length !== 1) return rule;
  const op = keys[0]!;
  const value = (rule as Record<string, unknown>)[op];

  if (op === 'and' || op === 'or') {
    const arr = Array.isArray(value) ? value : [value];
    return { [op]: arr.map((v) => (v && typeof v === 'object' ? normalizeJsonLogic(v) : v)) };
  }

  // 其他操作符：递归处理子节点（比较/函数调用）
  if (Array.isArray(value)) {
    return { [op]: value.map((v) => (v && typeof v === 'object' ? normalizeJsonLogic(v) : v)) };
  }
  if (value && typeof value === 'object') {
    return { [op]: normalizeJsonLogic(value) };
  }
  return rule;
}

/**
 * RAQB 内置操作符到本平台操作符的映射。
 *
 * RAQB 的 loadFromJsonLogic 可能把 {"!":{"in":["vip",{"var":"tags"}]}} 匹配到
 * 内置 not_like 操作符（value-first 格式），而非我们自定义的 not_contains。
 * not_like 没有在本平台 config 中注册 widget，渲染时会崩溃（r.join is not a function）。
 *
 * 修复：加载后把 not_like/like 替换回 not_contains/contains。
 */
const RAQB_OP_REMAP: Record<string, string> = {
  not_like: 'not_contains',
  like: 'contains',
};

/**
 * 递归遍历 RAQB tree，把不在本平台白名单内的操作符映射回本平台操作符。
 */
function remapTreeOperators(tree: ImmutableTree): ImmutableTree {
  try {
    const js = tree.toJS() as unknown as {
      type: string;
      children1?: Record<string, unknown>;
      properties?: { operator?: string };
    };
    const remapped = remapNodeOperators(js);
    if (remapped === js) return tree; // 无变化，返回原 tree
    // 重新加载为 ImmutableTree
    return QbUtils.loadTree(remapped as JsonTree);
  } catch {
    return tree;
  }
}

function remapNodeOperators(node: {
  type: string;
  children1?: Record<string, unknown>;
  properties?: { operator?: string };
}): unknown {
  let changed = false;
  let properties = node.properties;
  if (properties?.operator && RAQB_OP_REMAP[properties.operator]) {
    properties = { ...properties, operator: RAQB_OP_REMAP[properties.operator] };
    changed = true;
  }
  let children1 = node.children1;
  if (children1) {
    const newChildren: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(children1)) {
      const remapped = remapNodeOperators(child as never);
      if (remapped !== child) changed = true;
      newChildren[key] = remapped;
    }
    children1 = newChildren;
  }
  if (!changed) return node;
  return { ...node, properties, children1 };
}

/**
 * 从 JsonLogic 规则加载到 RAQB 的 Immutable 树。
 */
export function loadFromJsonLogic(rule: object | null | undefined, config: Config): ImmutableTree {
  const emptyTree = () => QbUtils.loadTree({ id: QbUtils.uuid(), type: 'group' } as JsonTree);
  if (!rule) {
    return emptyTree();
  }
  try {
    // 规范化 rule：确保 and/or 的值始终为数组（修复某些旧数据格式导致 RAQB r.join() 失败）
    const normalized = normalizeJsonLogic(rule);
    const tree = QbUtils.loadFromJsonLogic(normalized, config);
    if (!tree) return emptyTree();
    // RAQB 可能把 {"!":{"in":[...]}} 匹配到内置 not_like/like 操作符，
    // 这些操作符没有在本平台 config 中注册 widget，渲染时会崩溃。
    // 把 not_like/like 映射回本平台的 not_contains/contains。
    return remapTreeOperators(tree);
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
