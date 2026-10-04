/**
 * amis 页面 schema 校验器（G3）。
 *
 * 真值策略（spike 实证）：官方 amis schema.json 与渲染器行为不一致，不可机判——
 * 本校验器以"渲染器实际接受度 + 平台约束子集"为准：
 * 1. 类型白名单（amis-type-registry，来自渲染器文档组件清单）+ 平台黑名单
 * 2. 结构约束：body/items 等容器属性可对象可数组（SchemaCollection 语义）
 * 3. 平台约束：动作类型白名单、api.url 必须平台相对路径、深度预算
 * 4. 结构化错误带候选建议（agent 自修正闭环的最小反馈单元）
 */

import type { SchemaIssue } from '@apaas/shared';
import { SCHEMA_ISSUE_CODES } from '@apaas/shared';
import {
  AMIS_ALL_TYPES,
  AMIS_CONTAINER_BODY_KEYS,
  AMIS_FORBIDDEN_TYPES,
  suggestAmisType,
} from '../amis-type-registry.js';

/** 页面节点最大深度（防 AI 生成的病态嵌套）。 */
const MAX_DEPTH = 24;
/** 单页节点数上限（防病态膨胀；正常业务页 < 200 节点）。 */
const MAX_NODES = 500;

/** 平台允许的按钮动作类型（amis actionType 子集）。 */
const KNOWN_ACTION_TYPES: ReadonlySet<string> = new Set([
  'ajax',
  'submit',
  'reset',
  'dialog',
  'drawer',
  'url',
  'link',
  'jump',
  'confirm',
  'reload',
  'setValue',
  'copy',
  'toast',
  'tips',
  'alert',
  'email',
  'broadcast',
  'custom',
  'pageNum',
  'preventable',
  'stopAutoRefresh',
]);

/** 容器属性中"每项是独立节点数组"的键 vs "选项类配置"键（选项项不是渲染器节点）。 */
const NON_NODE_ARRAY_KEYS: ReadonlySet<string> = new Set([
  'options',
  'columns',
  'items',
  'data',
  'map',
  'recipients',
  'required',
]);

/**
 * 校验 amis 页面 schema。
 * @param schema 页面根对象（type: 'page'）
 */
export function validateAmisPage(schema: unknown): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  if (!isPlainObject(schema) || typeof schema['type'] !== 'string') {
    issues.push({
      path: '',
      code: SCHEMA_ISSUE_CODES.ROOT_INVALID,
      message: '页面 schema 必须是对象且带 type 字段（根节点 type 应为 "page"）',
      severity: 'error',
    });
    return issues;
  }
  if (schema['type'] !== 'page') {
    issues.push({
      path: 'type',
      code: SCHEMA_ISSUE_CODES.ROOT_INVALID,
      message: `页面根节点 type 必须为 "page"，收到 "${String(schema['type'])}"。一切界面皆页面（ADR-0003）：审批表单也应包在 page 内`,
      severity: 'error',
    });
    return issues;
  }

  let nodeCount = 0;
  walkNode(schema, '', 0, issues, () => {
    nodeCount++;
    return nodeCount <= MAX_NODES;
  });
  return issues;
}

/** 递归遍历节点树，产出类型/结构问题。 */
function walkNode(
  node: unknown,
  path: string,
  depth: number,
  issues: SchemaIssue[],
  budget: () => boolean,
): void {
  if (!budget()) {
    issues.push({
      path,
      code: SCHEMA_ISSUE_CODES.STRUCTURE_LIMIT,
      message: `节点数超过上限 ${MAX_NODES}，请拆分页面或精简结构`,
      severity: 'error',
    });
    return;
  }
  if (depth > MAX_DEPTH) {
    issues.push({
      path,
      code: SCHEMA_ISSUE_CODES.STRUCTURE_LIMIT,
      message: `嵌套深度超过上限 ${MAX_DEPTH}`,
      severity: 'error',
    });
    return;
  }
  if (!isPlainObject(node)) return;

  const type = node['type'];
  if (typeof type === 'string' && type.length > 0) {
    validateType(type, path, issues);
  }

  // 递归容器属性（body/items/tabs 等中的渲染器节点）
  for (const key of AMIS_CONTAINER_BODY_KEYS) {
    const child = node[key];
    if (child === undefined || child === null) continue;
    const childPath = `${path}/${key}`;
    if (Array.isArray(child)) {
      // options/options 类配置数组不是渲染器节点，跳过递归
      if (NON_NODE_ARRAY_KEYS.has(key)) continue;
      child.forEach((item, idx) =>
        walkNode(item, `${childPath}/${idx}`, depth + 1, issues, budget),
      );
    } else if (isPlainObject(child)) {
      walkNode(child, childPath, depth + 1, issues, budget);
    }
  }

  // 对象值的其他子属性中可能藏节点（如 dialog/drawer 配置、crud 的 filter）
  for (const [key, value] of Object.entries(node)) {
    if (AMIS_CONTAINER_BODY_KEYS.has(key)) continue;
    if (key === 'type' || typeof value !== 'object' || value === null) continue;
    const v = value as Record<string, unknown>;
    if (typeof v['type'] === 'string' && AMIS_ALL_TYPES.has(v['type'])) {
      walkNode(value, `${path}/${key}`, depth + 1, issues, budget);
    } else if (isPlainObject(v)) {
      // 不深挖未知对象（选项/映射等配置），仅处理已知容器键的嵌套（如 filter 内 form）
      if (key === 'filter' || key === 'dialog' || key === 'drawer') {
        walkNode(v, `${path}/${key}`, depth + 1, issues, budget);
      }
    }
  }

  // 动作类型与 api 约束
  validateActions(node, path, issues);
}

function validateType(type: string, path: string, issues: SchemaIssue[]): void {
  const forbiddenMsg = AMIS_FORBIDDEN_TYPES.get(type);
  if (forbiddenMsg) {
    issues.push({
      path: `${path}/type`,
      code: SCHEMA_ISSUE_CODES.TYPE_FORBIDDEN,
      message: `类型 "${type}" 被平台禁用：${forbiddenMsg}`,
      severity: 'error',
    });
    return;
  }
  if (!AMIS_ALL_TYPES.has(type)) {
    const suggestion = suggestAmisType(type);
    issues.push({
      path: `${path}/type`,
      code: SCHEMA_ISSUE_CODES.UNKNOWN_TYPE,
      message: `未知的 amis 组件类型 "${type}"${suggestion ? `——是否想用 "${suggestion}"？` : '，请查阅平台支持的组件清单'}`,
      severity: 'error',
    });
  }
}

/** 校验 actionType 白名单与 api.url 平台相对路径约束。 */
function validateActions(node: Record<string, unknown>, path: string, issues: SchemaIssue[]): void {
  const actionType = node['actionType'];
  if (
    typeof actionType === 'string' &&
    actionType.length > 0 &&
    !KNOWN_ACTION_TYPES.has(actionType)
  ) {
    issues.push({
      path: `${path}/actionType`,
      code: SCHEMA_ISSUE_CODES.UNKNOWN_TYPE,
      message: `未知动作类型 "${actionType}"，允许值：${[...KNOWN_ACTION_TYPES].slice(0, 12).join('/')} 等`,
      severity: 'error',
    });
  }
  const api = node['api'];
  if (isPlainObject(api) && typeof api['url'] === 'string') {
    validateApiUrl(api['url'], `${path}/api/url`, issues);
  } else if (typeof api === 'string' && api.length > 0) {
    validateApiUrl(api, `${path}/api`, issues);
  }
}

/** 平台约束：页面内 api 必须走平台相对路径（防 AI 生成外联）。
 *  推荐写法 /objects/...（axios baseURL='/api' 拼接）；/api/v1/... 前缀
 *  由运行时 fetcher 兼容剥离，不再报错（AI 直觉写法的自动纠偏）。 */
function validateApiUrl(url: string, path: string, issues: SchemaIssue[]): void {
  // @ref: 令牌（批量提交占位，落地时解析为真实对象 ID）合法放行
  if (url.includes('@ref:')) return;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    issues.push({
      path,
      code: SCHEMA_ISSUE_CODES.INVALID_VALUE,
      message: '页面内 api.url 必须是平台相对路径（如 /objects/<objectId>/records），禁止外联地址',
      severity: 'error',
    });
  }
}

/** 宽松的对象判断（排除数组/null）。 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
