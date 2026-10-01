/**
 * 租户隔离注入逻辑 — 纯函数，可独立单元测试。
 *
 * 被 index.ts 的 $extends 查询扩展调用，将 tenantId 注入到 Prisma 查询参数。
 * 提取为独立模块以便测试注入正确性，无需启动 PrismaClient。
 */

import type { getTenantContext } from './tenant-context.js';

/** $extends 查询回调中的参数类型（简化，仅关注 where/data） */
type QueryArgs = Record<string, unknown>;

/** 注入决策结果 */
export interface InjectionDecision {
  /** 是否注入 tenantId */
  inject: boolean;
  /** 租户 ID（inject=true 时非空） */
  tenantId: string | null;
  /** 是否为系统上下文（不注入且不告警） */
  systemContext: boolean;
}

/**
 * 根据模型名和租户上下文，判断是否需要注入 tenantId。
 *
 * @param model Prisma 模型名
 * @param tenantContext ALS 租户上下文（getTenantContext() 返回值）
 * @param tenantScopedModels 需要租户过滤的模型集合
 * @returns 注入决策
 */
export function decideInjection(
  model: string,
  tenantContext: ReturnType<typeof getTenantContext>,
  tenantScopedModels: Set<string>,
): InjectionDecision {
  // 模型不在白名单 → 不注入
  if (!tenantScopedModels.has(model)) {
    return { inject: false, tenantId: null, systemContext: false };
  }

  // 无 ALS 上下文 → 不注入，需告警（非系统路径）
  if (!tenantContext) {
    return { inject: false, tenantId: null, systemContext: false };
  }

  // 系统上下文（runAsSystem）→ 不注入，不告警
  if (tenantContext.tenantId === null) {
    return { inject: false, tenantId: null, systemContext: true };
  }

  // 正常租户上下文 → 注入
  return { inject: true, tenantId: tenantContext.tenantId, systemContext: false };
}

/**
 * 将 tenantId 注入到查询的 where 子句。
 * 浅拷贝 where 后追加 tenantId，不修改原始对象。
 */
export function injectToWhere(args: QueryArgs, tenantId: string): void {
  args.where = { ...(args.where as Record<string, unknown> | undefined), tenantId };
}

/**
 * 将 tenantId 注入到 create/createMany 的 data 字段。
 * 支持单个对象和数组两种形式。
 */
export function injectToData(args: QueryArgs, tenantId: string): void {
  const data = args.data;
  if (Array.isArray(data)) {
    args.data = data.map((item) => ({ ...item, tenantId }));
  } else {
    args.data = { ...(data as Record<string, unknown> | undefined), tenantId };
  }
}

/**
 * 将 tenantId 注入到 upsert 的 where + Create（双重注入）。
 * update 不注入（更新已有行，where.tenantId 已保障归属）。
 */
export function injectToUpsert(args: QueryArgs, tenantId: string): void {
  args.where = { ...(args.where as Record<string, unknown> | undefined), tenantId };
  args.create = { ...(args.create as Record<string, unknown> | undefined), tenantId };
}

// ===========================================================================
// R1.4 多环境：environmentId 第二维注入（ENV_SCOPED_MODELS 白名单模型）
// ===========================================================================

/** 环境注入决策结果 */
export interface EnvInjectionDecision {
  /** 是否注入 environmentId */
  inject: boolean;
  /** 环境 key（inject=true 时非空，'dev'|'prod'） */
  environmentId: string | null;
}

/**
 * 根据模型名与 ALS 环境 key，判断是否需要注入 environmentId。
 *
 * 语义：仅 ENV_SCOPED_MODELS 且 ALS 环境上下文非空时注入；
 * 未指定环境 → 不注入且不告警（兼容无环境概念的既有路径，与租户 fail-open 不同）。
 */
export function decideEnvInjection(
  model: string,
  environmentId: string | null,
  envScopedModels: Set<string>,
): EnvInjectionDecision {
  if (!envScopedModels.has(model) || !environmentId) {
    return { inject: false, environmentId: null };
  }
  return { inject: true, environmentId };
}

/** 将 environmentId 注入到查询的 where 子句（浅拷贝后追加） */
export function injectEnvToWhere(args: QueryArgs, environmentId: string): void {
  args.where = { ...(args.where as Record<string, unknown> | undefined), environmentId };
}

/** 将 environmentId 注入到 create/createMany 的 data 字段（支持单对象与数组） */
export function injectEnvToData(args: QueryArgs, environmentId: string): void {
  const data = args.data;
  if (Array.isArray(data)) {
    args.data = data.map((item) => ({ ...item, environmentId }));
  } else {
    args.data = { ...(data as Record<string, unknown> | undefined), environmentId };
  }
}

/** 将 environmentId 注入到 upsert 的 where + create（双重注入） */
export function injectEnvToUpsert(args: QueryArgs, environmentId: string): void {
  args.where = { ...(args.where as Record<string, unknown> | undefined), environmentId };
  args.create = { ...(args.create as Record<string, unknown> | undefined), environmentId };
}
