/**
 * API 名称自动建议 — 显示名称输入后为 API 名称字段生成语义前缀的候选值。
 *
 * QA 交互评审（2026-10-03）：新建对象/页面/流程时 API 名称必填但用户不知如何
 * 起名——提供 `${prefix}${时间基36}` 建议值（如 obj_mg3k2j），用户可改可不改。
 * 平台不做拼音转换（避免重依赖），语义前缀已保证可读性。
 */

/** base36 时间戳后 6 位（同一毫秒内碰撞概率可忽略；仅前端建议值，唯一性由后端约束兜底）。 */
export function suggestApiName(prefix: 'obj' | 'page' | 'flow'): string {
  const suffix = Date.now().toString(36).slice(-6);
  return `${prefix}_${suffix}`;
}
