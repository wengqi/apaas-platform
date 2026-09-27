/**
 * 页面 Schema 静态检查（错误检查面板数据源，纯函数）。
 *
 * 对齐飞书「错误检查」：列出会破坏运行的问题（缺标题/缺动作/绑定不存在的变量等），
 * 每条可携带 nodeId 供点击定位（选中组件）。
 */

import type { ComponentNode, PageSchema } from '../api/pages.js';

export interface SchemaIssue {
  id: string;
  nodeId?: string;
  severity: 'error' | 'warn';
  message: string;
}

let seq = 0;

/** 汇集 schema 静态问题（顺序：先 error 后 warn，同级按树序）。 */
export function collectSchemaIssues(schema: PageSchema | null): SchemaIssue[] {
  seq = 0;
  if (!schema) return [];
  const issues: SchemaIssue[] = [];
  walk(schema.root, schema, issues);
  return sortIssues(issues);
}

function walk(node: ComponentNode, schema: PageSchema, out: SchemaIssue[]): void {
  checkNode(node, schema, out);
  for (const child of node.children ?? []) walk(child, schema, out);
}

function checkNode(node: ComponentNode, schema: PageSchema, out: SchemaIssue[]): void {
  const label = node.name || node.type;

  // 表单字段组件必须有标题
  if (isFieldType(node.type) && typeof node.props.label !== 'string') {
    out.push(issue(node, 'error', `「${label}」字段缺少标题（label）`));
  }

  // 表单容器应关联对象（未用生成器时常见）
  if (node.type === 'form' && typeof node.props.objectId !== 'string') {
    out.push(issue(node, 'warn', `「${label}」表单未关联对象，提交动作不可用`));
  }

  // 按钮未配置点击动作
  if (node.type === 'button' && node.props.onClick === undefined) {
    out.push(issue(node, 'warn', `「${label}」按钮未配置点击动作`));
  }

  // 数据表格/详情/列表未绑定数据
  if (
    (node.type === 'data_table' || node.type === 'detail_card' || node.type === 'list') &&
    node.props.data === undefined &&
    node.props.record === undefined
  ) {
    out.push(issue(node, 'warn', `「${label}」未绑定数据源`));
  }

  // __bind 指向不存在的 vm 变量
  for (const path of collectBindPaths(node.props)) {
    const varName = path.replace(/^vm\./, '').split('.')[0];
    if (varName && !(varName in schema.viewModel.variables)) {
      out.push(issue(node, 'error', `「${label}」绑定到不存在的变量 vm.${varName}`));
    }
  }
}

/** 递归收集 props 中全部 __bind 路径。 */
function collectBindPaths(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectBindPaths(item, found);
    return found;
  }
  if (typeof value === 'object' && value !== null) {
    const bind = (value as { __bind?: unknown }).__bind;
    if (typeof bind === 'string' && bind.startsWith('vm.')) {
      found.push(bind);
      return found;
    }
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectBindPaths(v, found);
    }
  }
  return found;
}

function isFieldType(type: string): boolean {
  return (
    type === 'text_input' ||
    type === 'textarea' ||
    type === 'number_input' ||
    type === 'select' ||
    type === 'multi_select' ||
    type === 'date_picker' ||
    type === 'radio' ||
    type === 'checkbox' ||
    type === 'switch' ||
    type === 'lookup_picker' ||
    type === 'sub_form_table' ||
    type === 'attachment_upload' ||
    type === 'user_picker'
  );
}

function issue(node: ComponentNode, severity: 'error' | 'warn', message: string): SchemaIssue {
  return { id: `issue_${++seq}`, nodeId: node.id, severity, message };
}

function sortIssues(issues: SchemaIssue[]): SchemaIssue[] {
  const rank = (s: SchemaIssue['severity']) => (s === 'error' ? 0 : 1);
  return [...issues].sort((a, b) => rank(a.severity) - rank(b.severity));
}
