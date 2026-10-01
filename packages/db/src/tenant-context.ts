/**
 * 租户上下文 — 基于 AsyncLocalStorage 的请求级租户隔离基础设施。
 *
 * 在 HTTP 请求/后台任务入口处通过 {@link runWithTenant} 设置当前租户 ID，
 * Prisma $extends 查询扩展通过 {@link getTenantContext} 读取并自动注入到 where/data，
 * 实现纵深防御（Layer 2）。
 *
 * 三层防御体系：
 * - Layer 1: 手动 tenantId 参数（现有约定，保留作为 belt-and-suspenders）
 * - Layer 2: Prisma $extends 自动注入（基于 ALS）← 本模块支撑
 * - Layer 3: PostgreSQL RLS（未来生产部署叠加）
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * ALS 存储的租户上下文。
 *
 * - tenantId 非空 + explicit=true: 正常租户上下文（HTTP 请求/后台任务）
 * - tenantId 为空 + explicit=true: 系统上下文（runAsSystem，扩展跳过注入且不告警）
 * - ALS 未进入 run(): getStore() 返回 undefined，扩展跳过注入并告警
 */
interface TenantStore {
  readonly tenantId: string | null;
  readonly explicit: boolean;
  /** R1.4 多环境：当前环境 key（'dev'|'prod'）；null=未指定（不注入环境过滤，兼容旧语义） */
  readonly environmentId: string | null;
}

const tenantAls = new AsyncLocalStorage<TenantStore>();

/**
 * 获取当前租户 ID。
 *
 * @returns 租户 ID；系统上下文或无上下文时返回 null
 */
export function getTenantId(): string | null {
  return tenantAls.getStore()?.tenantId ?? null;
}

/**
 * 获取当前环境 key（R1.4）。
 *
 * @returns 'dev'|'prod'；未指定环境时返回 null（$extends 跳过环境注入）
 */
export function getEnvironmentId(): string | null {
  return tenantAls.getStore()?.environmentId ?? null;
}

/**
 * 获取完整租户上下文（供 $extends 扩展区分系统上下文与无上下文）。
 *
 * @returns 上下文对象；未进入 ALS run 时返回 undefined
 */
export function getTenantContext(): TenantStore | undefined {
  return tenantAls.getStore();
}

/**
 * 检查当前是否处于系统上下文（显式 runAsSystem）。
 *
 * 在系统上下文中，$extends 扩展跳过 tenantId 注入且不告警，
 * 允许跨租户操作（seed 脚本、迁移、平台管理）。
 */
export function isSystemContext(): boolean {
  const store = tenantAls.getStore();
  return store !== undefined && store.tenantId === null;
}

/**
 * 在租户上下文中执行 fn。
 *
 * 在 HTTP 拦截器、BullMQ worker 回调等入口处调用，
 * 设置当前租户 ID，后续所有 Prisma 查询自动注入。
 *
 * @param tenantId 租户 ID
 * @param fn 在租户上下文中执行的函数
 * @returns fn 的返回值
 */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return tenantAls.run({ tenantId, explicit: true, environmentId: null }, fn);
}

/**
 * 在租户 + 环境上下文中执行 fn（R1.4 多环境）。
 *
 * environmentId 非空时，$extends 对 ENV_SCOPED_MODELS 白名单模型自动注入
 * where/data.environmentId（值域 'dev'|'prod'）。为 null 时仅注入租户，
 * 环境过滤由调用方显式处理（兼容无环境概念的既有路径）。
 *
 * @param tenantId 租户 ID
 * @param environmentId 环境 key（'dev'|'prod'）
 * @param fn 在环境上下文中执行的函数
 */
export function runWithEnv<T>(tenantId: string, environmentId: string, fn: () => T): T {
  return tenantAls.run({ tenantId, explicit: true, environmentId }, fn);
}

/**
 * 在系统上下文中执行 fn（跳过租户过滤）。
 *
 * 用于 seed 脚本、迁移工具、平台管理等需要跨租户操作的场景。
 * 扩展检测到系统上下文时跳过 tenantId 注入且不告警。
 *
 * @param fn 在系统上下文中执行的函数
 * @returns fn 的返回值
 */
export function runAsSystem<T>(fn: () => T): T {
  return tenantAls.run({ tenantId: null, explicit: true, environmentId: null }, fn);
}
