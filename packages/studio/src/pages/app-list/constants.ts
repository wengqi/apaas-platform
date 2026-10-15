/**
 * 应用列表页 — 常量与表单类型（从 AppList.tsx 拆分，AGENTS.md 单文件 400 行规范）。
 *
 * 状态色彩/文案自 2026-10-12 起收敛到 @apaas/shared/design（评审 P1：
 * 双前端共享视觉 SSOT），此处派生保持既有调用点不变。
 */

import { APP_STATUS_META } from '@apaas/shared/design';

/** 应用状态 → Tag 颜色映射。 */
export const STATUS_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(APP_STATUS_META).map(([k, v]) => [k, v.color]),
);

/** 应用状态 → 中文标签。 */
export const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(APP_STATUS_META).map(([k, v]) => [k, v.label]),
);

/** 创建应用表单值（素蓝：图标/主题色随统一瓷片退役，新增分组）。 */
export interface CreateFormValues {
  apiName?: string;
  name: string;
  description?: string;
  /** 应用分组（空=未分组；输入新名即建组） */
  group?: string;
}
