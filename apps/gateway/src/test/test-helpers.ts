/**
 * 测试辅助工具 — 提供 mock 访问器和常用断言工具。
 */

import { vi } from 'vitest';

/**
 * 获取全局 setup 中注册的 mockPrisma 对象。
 * 用于在测试中设置 prisma.model.method.mockResolvedValue(...)。
 *
 * 返回类型为 `Record<string, any>` 以绕过 noUncheckedIndexedAccess，
 * 使测试中的 `prisma.model.method` 链式访问不需要 `!` 断言。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMockPrisma(): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as Record<string, unknown>).__mockPrisma as Record<string, any>;
}

/**
 * 获取 $transaction mock（用于验证事务调用或设置事务返回值）。
 */
export function getMockTransaction(): ReturnType<typeof vi.fn> {
  return (globalThis as Record<string, unknown>).__mockTransactionFn as ReturnType<typeof vi.fn>;
}

/**
 * 获取 $queryRawUnsafe mock（G5：数据流引擎 raw SQL 路径）。
 */
export function getMockQueryRawUnsafe(): ReturnType<typeof vi.fn> {
  return (globalThis as Record<string, unknown>).__mockQueryRawUnsafe as ReturnType<typeof vi.fn>;
}

/**
 * 创建一个 mock BullMQ Queue（用于 process-engine 测试）。
 * 返回 { add: vi.fn() }，模拟 BullMQ Queue 的 add 方法。
 */
export function createMockQueue(): {
  add: ReturnType<typeof vi.fn>;
  getJob: ReturnType<typeof vi.fn>;
} {
  return {
    add: vi.fn().mockResolvedValue(undefined),
    // S1 超时取消：真实 BullMQ Queue.getJob（job 不存在返回 undefined）
    getJob: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * 创建一个 mock NodeExecutor（用于 process-engine 测试）。
 */
export function createMockExecutor(
  type: string,
  executeImpl?: (ctx: unknown) => Promise<unknown>,
): { type: string; execute: ReturnType<typeof vi.fn> } {
  return {
    type,
    execute: vi.fn(
      executeImpl ?? (async () => ({ output: {}, nextNodeIds: undefined, wait: false })),
    ),
  };
}
