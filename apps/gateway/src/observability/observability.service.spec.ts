/**
 * 观测事件服务单测 — record 白名单校验 / query 过滤 / summary 映射。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMockPrisma } from '../test/test-helpers.js';
import { ObservabilityService } from './observability.service.js';

describe('ObservabilityService.record', () => {
  let service: ObservabilityService;

  beforeEach(() => {
    service = new ObservabilityService();
  });

  it('合法分类落库：traceId/环境缺省由 ALS 兜底（测试上下文为 null → prod）', async () => {
    const prisma = getMockPrisma();
    await service.record({
      tenantId: 't1',
      category: 'FUNCTION_EXEC',
      source: 'cloud-function:invoke',
      message: '执行成功',
      appId: 'app1',
      durationMs: 42,
    });
    expect(prisma.observabilityEvent.create).toHaveBeenCalledTimes(1);
    const arg = prisma.observabilityEvent.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(arg.data).toMatchObject({
      tenantId: 't1',
      appId: 'app1',
      category: 'FUNCTION_EXEC',
      level: 'INFO',
      source: 'cloud-function:invoke',
      durationMs: 42,
      environmentId: 'prod',
      traceId: null,
    });
  });

  it('未知分类直接丢弃（不落库，防脏分类）', async () => {
    const prisma = getMockPrisma();
    await service.record({
      tenantId: 't1',
      category: 'HACK' as never,
      source: 'x',
      message: 'm',
    });
    expect(prisma.observabilityEvent.create).not.toHaveBeenCalled();
  });

  it('非法级别回退 INFO 落库', async () => {
    const prisma = getMockPrisma();
    await service.record({
      tenantId: 't1',
      category: 'SLOW_QUERY',
      level: 'LOUD' as never,
      source: 'prisma:slow-query',
      message: 'm',
    });
    const arg = prisma.observabilityEvent.create.mock.calls[0]![0] as {
      data: { level: string };
    };
    expect(arg.data.level).toBe('INFO');
  });

  it('落库异常被吞没（非阻塞语义）', async () => {
    const prisma = getMockPrisma();
    prisma.observabilityEvent.create.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.record({ tenantId: 't1', category: 'PAGE_ERROR', source: 'x', message: 'm' }),
    ).resolves.toBeUndefined();
  });
});

describe('ObservabilityService.query', () => {
  it('过滤条件完整透传（分类/级别/应用/时间窗）+ 分页上限 100', async () => {
    const prisma = getMockPrisma();
    const service = new ObservabilityService();
    const since = new Date('2026-10-01T00:00:00Z');
    const until = new Date('2026-10-02T00:00:00Z');
    await service.query({
      tenantId: 't1',
      page: 2,
      pageSize: 500,
      category: 'SLOW_QUERY',
      level: 'WARN',
      appId: 'app1',
      since,
      until,
    });
    const findArg = prisma.observabilityEvent.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      skip: number;
      take: number;
    };
    expect(findArg.where).toEqual({
      tenantId: 't1',
      category: 'SLOW_QUERY',
      level: 'WARN',
      appId: 'app1',
      createdAt: { gte: since, lte: until },
    });
    expect(findArg.skip).toBe(100);
    expect(findArg.take).toBe(100);
  });
});

describe('ObservabilityService.summary', () => {
  it('按 shared SSOT 分类补齐（无事件的分类补 0），错误数按级别拆分', async () => {
    const prisma = getMockPrisma();
    prisma.observabilityEvent.groupBy.mockImplementation(
      (arg: { by: string[]; where?: Record<string, unknown> }) => {
        if ((arg.where as Record<string, unknown>).level === 'ERROR') {
          return Promise.resolve([{ category: 'PAGE_ERROR', _count: { _all: 3 } }]);
        }
        return Promise.resolve([
          { category: 'FUNCTION_EXEC', _count: { _all: 10 } },
          { category: 'PAGE_ERROR', _count: { _all: 5 } },
        ]);
      },
    );
    const service = new ObservabilityService();
    const result = await service.summary('t1', 'app1');
    expect(result).toEqual([
      { category: 'FUNCTION_EXEC', total: 10, errors: 0 },
      { category: 'SLOW_QUERY', total: 0, errors: 0 },
      { category: 'PAGE_ERROR', total: 5, errors: 3 },
      { category: 'OPEN_API_CALL', total: 0, errors: 0 },
      { category: 'AI_GENERATION', total: 0, errors: 0 },
    ]);
    // appId 过滤进入 where
    const where = prisma.observabilityEvent.groupBy.mock.calls[0]![0].where as Record<
      string,
      unknown
    >;
    expect(where['appId']).toBe('app1');
  });
});

describe('ObservabilityService 慢查询 hook 生命周期', () => {
  afterEach(() => {
    (globalThis as Record<string, unknown>).__mockCurrentTenantId = null;
  });

  it('init 注册 handler → 有租户上下文时通知落库；destroy 取消注册（不泄漏）', async () => {
    const prisma = getMockPrisma();
    const notify = (globalThis as Record<string, unknown>).__mockSlowQueryNotify as (
      info: unknown,
    ) => void;
    const service = new ObservabilityService();
    service.onModuleInit();

    // 无租户上下文（启动期/系统任务）→ 不落库
    notify({ model: 'Record', operation: 'findMany', durationMs: 1234.5 });
    expect(prisma.observabilityEvent.create).not.toHaveBeenCalled();

    (globalThis as Record<string, unknown>).__mockCurrentTenantId = 't1';

    notify({ model: 'Record', operation: 'findMany', durationMs: 1234.5 });
    expect(prisma.observabilityEvent.create).toHaveBeenCalledTimes(1);
    const arg = prisma.observabilityEvent.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(arg.data).toMatchObject({
      category: 'SLOW_QUERY',
      level: 'WARN',
      source: 'prisma:slow-query',
      durationMs: 1235,
    });

    service.onModuleDestroy();
    notify({ model: 'Record', operation: 'count', durationMs: 9999 });
    expect(prisma.observabilityEvent.create).toHaveBeenCalledTimes(1); // 不再落库
  });
});
