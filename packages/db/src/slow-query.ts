/**
 * 慢查询观测（P1 运维治理）— 查询耗时 hook 注册表。
 *
 * Prisma 扩展层（index.ts 的第二层 $extends）测量每个模型操作的耗时，
 * 超过阈值（SLOW_QUERY_THRESHOLD_MS，缺省 1000ms）时通知已注册的 handler。
 * db 包保持领域中立：不知道观测事件的存在，只负责"测量 + 通知"；
 * 由 gateway 的 ObservabilityModule 启动时注册 handler 落库为 SLOW_QUERY 事件。
 *
 * 脱敏口径（与审计/开放 API 一致）：handler 只收到模型名/操作名/耗时，
 * 不含查询参数——慢查询事件不落业务数据。
 */

/** 慢查询默认阈值（毫秒）——SLOW_QUERY_THRESHOLD_MS 未设置时生效。 */
export const SLOW_QUERY_DEFAULT_THRESHOLD_MS = 1000;

/** 慢查询信息（脱敏：不含查询参数）。 */
export interface SlowQueryInfo {
  model: string;
  operation: string;
  durationMs: number;
}

export type SlowQueryHandler = (info: SlowQueryInfo) => void;

const handlers = new Set<SlowQueryHandler>();

/**
 * 注册慢查询 handler。
 *
 * @returns 取消注册函数（模块销毁时调用，防重复注册泄漏）
 */
export function onSlowQuery(handler: SlowQueryHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/** 通知全部 handler；单个 handler 异常不影响其他 handler 与查询本身。 */
export function notifySlowQuery(info: SlowQueryInfo): void {
  for (const handler of handlers) {
    try {
      handler(info);
    } catch {
      // 观测失败不反噬业务查询——有意吞没
    }
  }
}

/**
 * 解析当前生效的慢查询阈值。
 * 每次调用时读取环境变量（而非模块加载时固化），便于测试与运行期调整；非法值回退默认。
 */
export function resolveSlowQueryThresholdMs(): number {
  const raw = process.env.SLOW_QUERY_THRESHOLD_MS;
  if (raw === undefined || raw === '') return SLOW_QUERY_DEFAULT_THRESHOLD_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : SLOW_QUERY_DEFAULT_THRESHOLD_MS;
}
