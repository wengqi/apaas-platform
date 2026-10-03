/**
 * API 名称自动建议 — 显示名称输入后为 API 名称字段生成候选值。
 *
 * 演进:
 * - QA 交互评审（2026-10-03 第一轮）:随机语义前缀 `${prefix}${时间base36}`,平台不做拼音转换;
 * - A 旅程实测（2026-10-03 第二轮）:随机名(obj_mg3k2j)对新手仍是乱码,且字段弹窗未覆盖
 *   ——引入 pinyin-pro 按显示名称转写（如"报修单"→ repair_order）,转写为空回退随机前缀。
 * 用户始终可手改;唯一性由后端约束兜底。
 */

import { toApiName } from './api-name.js';

/** base36 时间戳后 6 位（同一毫秒内碰撞概率可忽略;仅前端建议值,唯一性由后端约束兜底）。 */
export function suggestApiName(prefix: 'obj' | 'page' | 'flow'): string {
  const suffix = Date.now().toString(36).slice(-6);
  return `${prefix}_${suffix}`;
}

/** 显示名称转写优先（拼音 snake_case),为空（纯符号/空白）回退随机前缀。 */
export function suggestApiNameFromLabel(label: string, prefix: 'obj' | 'page' | 'flow'): string {
  return toApiName(label) || suggestApiName(prefix);
}
