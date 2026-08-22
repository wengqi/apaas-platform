/**
 * Vitest 全局 setup — 在所有测试文件之前运行。
 *
 * 注册 @apaas/db 的全局 mock，使所有直接 import { prisma } from '@apaas/db'
 * 的 Service 在测试中获得 Proxy mock，无需在每个 spec 文件中重复 vi.mock。
 *
 * mockPrisma 通过 Proxy 自动为任意 prisma.modelName.methodName 创建 vi.fn()，
 * 测试中可通过 getMockPrisma().model.method.mockResolvedValue(...) 设置返回值。
 */

import { vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Prisma Mock — Proxy-based auto-mock
// ---------------------------------------------------------------------------

/** 所有已创建的 vi.fn 集合（按 model → method 索引），用于 beforeEach 重置。 */
const allFns: Map<string, ReturnType<typeof vi.fn>> = new Map();

/** $transaction mock（独立管理，因为它在 prisma 顶层而非 model delegate 上）。
 * 支持两种形式：
 * - 数组形式：prisma.$transaction([op1, op2]) → Promise.all
 * - 回调形式：prisma.$transaction(async (tx) => { ... }) → 以 prisma 自身为 tx 执行回调
 */
const transactionFn = vi.fn((arg: unknown) => {
  if (typeof arg === 'function') {
    return arg(mockPrisma);
  }
  return Promise.all(arg as unknown[]);
});

/**
 * 为单个 Prisma model delegate 创建 Proxy。
 * 首次访问某方法时创建 vi.fn()，后续访问返回同一实例。
 */
function createDelegate(model: string): Record<string, ReturnType<typeof vi.fn>> {
  return new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
    get(_target, method: string) {
      const key = `${model}.${method}`;
      if (!allFns.has(key)) {
        allFns.set(key, vi.fn());
      }
      return allFns.get(key)!;
    },
  });
}

/** model delegate 缓存（确保 prisma.user 多次访问返回同一 delegate）。 */
const delegates: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};

/**
 * mockPrisma — 替换 @apaas/db 导出的 prisma 单例。
 *
 * 用法（测试中）：
 *   const prisma = getMockPrisma();
 *   prisma.permissionRule.findMany.mockResolvedValue([...]);
 *   prisma.record.create.mockResolvedValue({ id: 'rec-1', ... });
 */
const mockPrisma = new Proxy({} as Record<string, unknown>, {
  get(_target, prop: string) {
    if (prop === '$transaction') return transactionFn;
    if (!delegates[prop]) delegates[prop] = createDelegate(prop);
    return delegates[prop]!;
  },
});

// 全局 mock @apaas/db — 所有 import { prisma } from '@apaas/db' 将获得 mockPrisma
vi.mock('@apaas/db', () => ({
  prisma: mockPrisma,
  // Prisma namespace 仅用于 TypeScript 类型（as Prisma.InputJsonValue 等），
  // 运行时不被访问，提供空对象即可。
  Prisma: {},
}));

// 暴露到 globalThis 供测试文件访问
(globalThis as Record<string, unknown>).__mockPrisma = mockPrisma;
(globalThis as Record<string, unknown>).__mockTransactionFn = transactionFn;

// ---------------------------------------------------------------------------
// 全局 mock 重置
// ---------------------------------------------------------------------------

beforeEach(() => {
  // 重置所有 model delegate 的 vi.fn 调用记录和返回值
  for (const fn of allFns.values()) {
    fn.mockReset();
  }
  // 重置 $transaction（支持数组形式和回调形式）
  transactionFn.mockReset();
  transactionFn.mockImplementation((arg: unknown) => {
    if (typeof arg === 'function') {
      return arg(mockPrisma);
    }
    return Promise.all(arg as unknown[]);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
