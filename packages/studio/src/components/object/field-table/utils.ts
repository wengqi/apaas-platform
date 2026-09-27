/**
 * 字段表格 — 纯逻辑与错误提示（从 FieldTable.tsx 拆分，AGENTS.md 单文件 400 行规范）。
 *
 * 职责：字段排序 + 关键字过滤、统一错误提示。均无 UI 依赖（showError 仅调用 message）。
 */

import { message } from 'antd';
import type { Field } from '../../../api/objects.js';

/**
 * 系统字段置顶,其余按 order(无值则按原始数组索引)排序;再按关键字过滤。
 * order 不存在时回退到数组下标,保持后端返回的原序。
 */
export function sortAndFilterFields(fields: Field[], keyword: string): Field[] {
  const withOrder = fields.map((f, idx) => ({
    field: f,
    order: f.order ?? idx,
  }));
  withOrder.sort((a, b) => {
    if (a.field.isSystem && !b.field.isSystem) return -1;
    if (!a.field.isSystem && b.field.isSystem) return 1;
    return a.order - b.order;
  });
  const sorted = withOrder.map((w) => w.field);
  const kw = keyword.trim().toLowerCase();
  if (!kw) return sorted;
  return sorted.filter(
    (f) => f.label.toLowerCase().includes(kw) || f.apiName.toLowerCase().includes(kw),
  );
}

/** 统一错误提示。 */
export function showError(err: unknown) {
  const axErr = err as {
    response?: { data?: { error?: { message?: string } }; message?: string };
    message?: string;
  };
  message.error(axErr.response?.data?.error?.message ?? axErr.message ?? '操作失败,请重试');
}
