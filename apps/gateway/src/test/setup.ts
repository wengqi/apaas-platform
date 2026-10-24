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
 * 为 Prisma 查询类方法设置类型正确的默认返回值。
 * 在 delegate 创建时和每次 mockReset 后调用（mockReset 会清除实现）。
 */
function applyDefaultImplementation(method: string, fn: ReturnType<typeof vi.fn>): void {
  if (method === 'findMany' || method === 'groupBy') {
    fn.mockResolvedValue([]);
  } else if (method === 'findFirst' || method === 'findUnique') {
    fn.mockResolvedValue(null);
  } else if (method === 'count' || method === 'aggregate') {
    fn.mockResolvedValue(0);
  } else if (method === 'updateMany' || method === 'deleteMany' || method === 'createMany') {
    fn.mockResolvedValue({ count: 1 });
  }
}

/**
 * 为单个 Prisma model delegate 创建 Proxy。
 * 首次访问某方法时创建 vi.fn()，后续访问返回同一实例。
 * 查询类方法设置类型正确的默认返回值（测试可覆盖）。
 */
function createDelegate(model: string): Record<string, ReturnType<typeof vi.fn>> {
  return new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
    get(_target, method: string) {
      const key = `${model}.${method}`;
      if (!allFns.has(key)) {
        const fn = vi.fn();
        applyDefaultImplementation(method, fn);
        allFns.set(key, fn);
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
/** $queryRawUnsafe mock（G5 数据下沉：数据流引擎 raw SQL 路径） */
const queryRawUnsafeFn = vi.fn();
/** $queryRaw mock（tagged template 参数化 raw SQL；对抗审查 P0-8 跨环境守卫统计消费） */
const queryRawFn = vi.fn().mockResolvedValue([{ count: 0 }]);
/** $executeRawUnsafe mock（P1-01 unique 字段 DDL 管理：索引标识符不可参数化） */
const executeRawUnsafeFn = vi.fn().mockResolvedValue(0);
/** $executeRaw mock（tagged template 参数化 SQL；P1-05 Rollup 字段定向写消费） */
const executeRawFn = vi.fn().mockResolvedValue({ count: 1 });

const mockPrisma = new Proxy({} as Record<string, unknown>, {
  get(_target, prop: string) {
    if (prop === '$transaction') return transactionFn;
    if (prop === '$queryRawUnsafe') return queryRawUnsafeFn;
    if (prop === '$executeRawUnsafe') return executeRawUnsafeFn;
    if (prop === '$executeRaw') return executeRawFn;
    if (prop === '$queryRaw') return queryRawFn;
    if (!delegates[prop]) delegates[prop] = createDelegate(prop);
    return delegates[prop]!;
  },
});

// 全局 mock @apaas/db — 所有 import { prisma } from '@apaas/db' 将获得 mockPrisma
vi.mock('@apaas/db', () => ({
  prisma: mockPrisma,
  // Prisma namespace：类型用途 + Prisma.raw（tagged template 内联 SQL 片段，
  // 如 ORDER BY/聚合表达式；mock 返回带标记的对象，raw SQL 直接进 mock 调用参数）
  Prisma: {
    raw: (sql: string) => ({ __prismaRaw: sql }),
  },
  // 租户上下文函数 — 使用真实实现（纯 ALS，不依赖 Prisma）
  runWithTenant: <T>(tenantId: string, fn: () => T): T => fn(),
  runAsSystem: <T>(fn: () => T): T => fn(),
  // 默认 null；需要租户上下文的测试设置 __mockCurrentTenantId（用后清理）
  getTenantId: (): string | null =>
    ((globalThis as Record<string, unknown>).__mockCurrentTenantId as string | null) ?? null,
  getTenantContext: () => undefined,
  isSystemContext: () => false,
  // R1.4 多环境：测试默认无环境上下文（注入跳过，降级活表语义）
  runWithEnv: <T>(_tenantId: string, _env: string, fn: () => T): T => fn(),
  getEnvironmentId: (): string | null => null,
  // 慢查询观测（P1 运维治理）：注册表语义与真实实现一致（handler 可触发）
  onSlowQuery: (handler: (info: unknown) => void): (() => void) => {
    slowQueryHandlers.add(handler);
    return () => {
      slowQueryHandlers.delete(handler);
    };
  },
}));

/** 慢查询 handler 注册表（供测试触发 notifySlowQuery 语义验证）。 */
const slowQueryHandlers = new Set<(info: unknown) => void>();
(globalThis as Record<string, unknown>).__mockSlowQueryHandlers = slowQueryHandlers;
(globalThis as Record<string, unknown>).__mockSlowQueryNotify = (info: unknown): void => {
  for (const handler of slowQueryHandlers) handler(info);
};

// 暴露到 globalThis 供测试文件访问
(globalThis as Record<string, unknown>).__mockPrisma = mockPrisma;
(globalThis as Record<string, unknown>).__mockTransactionFn = transactionFn;
(globalThis as Record<string, unknown>).__mockQueryRawUnsafe = queryRawUnsafeFn;
(globalThis as Record<string, unknown>).__mockExecuteRawUnsafe = executeRawUnsafeFn;
(globalThis as Record<string, unknown>).__mockExecuteRaw = executeRawFn;
(globalThis as Record<string, unknown>).__mockQueryRaw = queryRawFn;

// ---------------------------------------------------------------------------
// 全局 mock 重置
// ---------------------------------------------------------------------------

beforeEach(() => {
  // 重置所有 model delegate 的 vi.fn 调用记录和返回值，并重新应用默认实现
  for (const [key, fn] of allFns.entries()) {
    fn.mockReset();
    applyDefaultImplementation(key.split('.')[1] ?? '', fn);
  }
  // 重置 $queryRawUnsafe（G5 数据流 SQL 路径）——默认空结果防 undefined 崩
  queryRawUnsafeFn.mockReset();
  queryRawUnsafeFn.mockResolvedValue([]);
  // 重置 $executeRawUnsafe（P1-01 unique 字段 DDL 路径）
  executeRawUnsafeFn.mockReset();
  executeRawUnsafeFn.mockResolvedValue(0);
  // 重置 $executeRaw（P1-05 字段定向写路径）
  executeRawFn.mockReset();
  executeRawFn.mockResolvedValue({ count: 1 });
  // 重置 $queryRaw 并恢复默认（无记录）
  queryRawFn.mockReset();
  queryRawFn.mockResolvedValue([{ count: 0 }]);
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
