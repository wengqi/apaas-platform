/**
 * 权限条件翻译器 — 将 JsonLogic 行级条件翻译为 Prisma RecordWhereInput。
 *
 * 委托给共享的 jsonLogicToPrismaWhere 翻译器，与视图筛选、API filter 共用同一套逻辑。
 *
 * 变量替换：
 *   {"var": "__currentUser"} → 从 variables 映射取值（如 currentUser: 'user_xxx'）
 */

import { Prisma } from '@apaas/db';
import { jsonLogicToPrismaWhere, type VariableMap } from '../shared/jsonlogic-to-prisma.js';

export type { VariableMap };

/**
 * 将权限条件（JsonLogic JSON）翻译为 Prisma RecordWhereInput。
 *
 * @param condition JsonLogic JSON 规则
 * @param variables 动态变量映射（如 { currentUser: 'user_xxx' }）
 * @returns Prisma where 片段，null 表示无条件（放行所有行）
 * @throws UntranslatableConditionError 条件包含无法翻译的操作符时抛出
 *   （fail-closed：静默放行会将"仅本人记录"类规则放大为全表访问）
 */
export function translateCondition(
  condition: unknown,
  variables: VariableMap,
): Prisma.RecordWhereInput | null {
  // 权限场景强制 strict — 不可翻译即拒绝，绝不退化为无条件放行
  return jsonLogicToPrismaWhere(condition, variables, { strict: true });
}
