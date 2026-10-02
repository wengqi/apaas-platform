/**
 * 事件链路 ID（traceId）— 基于 AsyncLocalStorage 的请求级链路上下文。
 *
 * 与 @apaas/db 的租户 ALS 平行（嵌套组合，互不干扰）：请求入口处生成或
 * 采纳 X-Trace-Id，存入本 ALS；审计日志、观测事件、错误响应、pino 日志行
 * 统一读取同一 ID，实现同一请求的全链路串联。
 *
 * 背景（P1 运维治理）：全仓此前无任何 traceId 落地（shared ApiError.traceId
 * 仅为类型占位）。本模块是链路 ID 的唯一生成/读取入口。
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

interface TraceStore {
  readonly traceId: string;
}

const traceAls = new AsyncLocalStorage<TraceStore>();

/** 生成新 traceId（pino 风格 UUID）。 */
export function newTraceId(): string {
  return randomUUID();
}

/**
 * 在链路上下文中执行 fn。请求入口（TraceMiddleware）与后台任务入口调用；
 * 与租户 ALS 嵌套时，两者上下文同时可用。
 */
export function runWithTrace<T>(traceId: string, fn: () => T): T {
  return traceAls.run({ traceId }, fn);
}

/**
 * 获取当前请求的 traceId。
 *
 * @returns traceId；无链路上下文（后台任务/启动期）时返回 null
 */
export function getTraceId(): string | null {
  return traceAls.getStore()?.traceId ?? null;
}

/**
 * 从请求头解析外部传入的 traceId（无则生成新 ID）。
 * 外部系统可通过 X-Trace-Id 传入实现跨服务串联；值截断到 128 字符防滥用。
 */
export function adoptOrNewTraceId(headerValue: unknown): string {
  if (typeof headerValue === 'string' && headerValue.length > 0) {
    return headerValue.slice(0, 128);
  }
  if (Array.isArray(headerValue) && typeof headerValue[0] === 'string' && headerValue[0]) {
    return headerValue[0].slice(0, 128);
  }
  return newTraceId();
}
