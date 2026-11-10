/**
 * HealthController 单元测试 — 依赖探测（PE-12，R-B 波次④收官）。
 *
 * 原缺陷：/health 纯静态返回 ok，不探 PG/Redis/BullMQ——依赖不可达时探活仍绿，
 * 编排器不放流/不重启，故障发现延迟到业务报错。修复契约：
 * - 健康态：{status:'ok', dependencies:{database,redis}} 200（shape 兼容既有探活）
 * - 任一依赖失败/超时：HttpException 503 + status:'degraded' + 失败明细
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { getMockPrisma } from './test/test-helpers.js';

function createController(
  getJobCounts: () => Promise<unknown> = () => Promise.resolve({ waiting: 0 }),
) {
  const queue = { getJobCounts };
  return new HealthController(
    queue as unknown as ConstructorParameters<typeof HealthController>[0],
  );
}

async function expectDegraded(promise: Promise<unknown>) {
  const err = (await promise.catch((e: unknown) => e)) as HttpException;
  expect(err).toBeInstanceOf(HttpException);
  expect(err.getStatus()).toBe(503);
  return err.getResponse() as { status: string; dependencies: Record<string, string> };
}

describe('HealthController 依赖探测（PE-12）', () => {
  const prisma = getMockPrisma();

  afterEach(() => {
    delete process.env['HEALTH_PROBE_TIMEOUT_MS'];
    vi.restoreAllMocks();
  });

  it('双依赖健康：200 {status:ok, dependencies 全 ok}（shape 兼容既有探活）', async () => {
    const controller = createController();
    const result = await controller.check();

    expect(result).toEqual(
      expect.objectContaining({
        status: 'ok',
        dependencies: { database: 'ok', redis: 'ok' },
        timestamp: expect.any(String),
      }),
    );
  });

  it('PG 探测失败：503 degraded + database:error', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const controller = createController();

    const body = await expectDegraded(controller.check());

    expect(body.status).toBe('degraded');
    expect(body.dependencies).toEqual({ database: 'error', redis: 'ok' });
  });

  it('Redis ping 失败：503 degraded + redis:error', async () => {
    const controller = createController(() => Promise.reject(new Error('redis timeout')));

    const body = await expectDegraded(controller.check());

    expect(body.status).toBe('degraded');
    expect(body.dependencies).toEqual({ database: 'ok', redis: 'error' });
  });

  it('探测挂起超 HEALTH_PROBE_TIMEOUT_MS：503 degraded（不无限等待）', async () => {
    process.env['HEALTH_PROBE_TIMEOUT_MS'] = '20';
    prisma.$queryRaw.mockImplementationOnce(() => new Promise(() => undefined));
    const controller = createController();

    const body = await expectDegraded(controller.check());

    expect(body.status).toBe('degraded');
    expect(body.dependencies.database).toBe('error');
  });
});
