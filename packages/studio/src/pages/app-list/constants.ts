/**
 * 应用列表页 — 常量与表单类型（从 AppList.tsx 拆分，AGENTS.md 单文件 400 行规范）。
 */

/** 应用状态 → Tag 颜色映射。 */
export const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  PUBLISHED: 'green',
  ARCHIVED: 'red',
};

/** 应用状态 → 中文标签。 */
export const STATUS_LABEL: Record<string, string> = {
  DRAFT: '开发中',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
};

/** 创建应用表单值。 */
export interface CreateFormValues {
  apiName?: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}
