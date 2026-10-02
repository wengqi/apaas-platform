/**
 * 审计分类展示常量 — 分类筛选选项 / Tag 颜色 / 动作归类展示。
 *
 * 分类值域与中文名以 @apaas/shared/observability 为 SSOT；
 * 颜色映射为本前端展示约定（平台级与应用级审计页共用）。
 */

import {
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_LABELS,
  AUDIT_CATEGORY_OTHER,
  categoryOfAuditAction,
  type AuditCategory,
} from '@apaas/shared';

/** 分类 → AntD Tag 颜色（OTHER=未登记动作归类，灰色）。 */
export const AUDIT_CATEGORY_COLORS: Record<AuditCategory | typeof AUDIT_CATEGORY_OTHER, string> = {
  APP: 'purple',
  GOVERNANCE: 'geekblue',
  PROCESS: 'cyan',
  RECORD: 'green',
  ACCESS: 'orange',
  OTHER: 'default',
};

/** 分类筛选下拉选项（「全部分类」空值由页面用 allowClear/哨兵处理）。 */
export const AUDIT_CATEGORY_OPTIONS = AUDIT_CATEGORIES.map((c) => ({
  value: c,
  label: AUDIT_CATEGORY_LABELS[c],
}));

/** 审计动作的分类展示信息（label=中文名，OTHER 显示「其他」灰色）。 */
export function auditCategoryDisplay(action: string): { label: string; color: string } {
  const category = categoryOfAuditAction(action);
  return {
    label: category === AUDIT_CATEGORY_OTHER ? '其他' : AUDIT_CATEGORY_LABELS[category],
    color: AUDIT_CATEGORY_COLORS[category],
  };
}
