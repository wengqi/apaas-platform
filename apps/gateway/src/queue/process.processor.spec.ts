/**
 * ProcessProcessor 单元测试 — 失败分类与 final-failure 判定（PE-13，R-B 波次④⑤合并批，
 * 兼 PE-29 queue 目录零 spec 的首块补强）。
 *
 * 覆盖：
 * - NonRetryableNodeError：同步落实例 FAILED（finalizeFailedInstance，R2-scale-01
 *   防 9 处抛出点从 FAILED 留痕变永久 RUNNING）+ 不再重试（吞异常 → job 记成功）
 * - 瞬时失败非最终尝试：仅上抛交 BullMQ attempts 重试，实例不动（PE-13：引擎已不
 *   先行置 FAILED，重试进门不再因非 RUNNING 早退空转）
 * - 瞬时失败最终尝试（attemptsMade+1 >= attempts）：先 finalizeFailedInstance 再上抛
 *   ——判定点与 BullMQ shouldRetryJob 的 `attemptsMade + 1 < opts.attempts` 精确镜像
 *   （BullMQ 5.81.3：attemptsMade 于 moveToFailed 内自增，handler 运行期为既往尝试数）
 * - scheduled 触发分支不受影响（envKey 透传）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Job } from 'bullmq';
import { ProcessProcessor } from './process.processor.js';
import { NonRetryableNodeError } from '../process/types.js';
import { getMockPrisma } from '../test/test-helpers.js';
import { PROCESS_QUEUE } from './queue.constants.js';

const { workerHandlers } = vi.hoisted(() => ({
  workerHandlers: new Map<string, (job: Job) => Promise<void>>(),
}));

vi.mock('bullmq', () => {
  class FakeWorker {
    constructor(queueName: string, handler: (job: Job) => Promise<void>, _opts?: unknown) {
      workerHandlers.set(queueName, handler);
    }
    on(): void {
      /* 事件监听在单测中不挂载 */
    }
    async close(): Promise<void> {}
  }
  return { Worker: FakeWorker };
});

vi.mock('ioredis', () => {
  class FakeRedis {
    duplicate(): FakeRedis {
      return new FakeRedis();
    }
    async quit(): Promise<void> {}
  }
  return { default: FakeRedis };
});

/** 构造被测 processor 并触发 Worker 注册，返回 process 队列 handler 与 mock 引擎。 */
function createProcessor() {
  const engine = {
    executeNextNode: vi.fn().mockResolvedValue(undefined),
    finalizeFailedInstance: vi.fn().mockResolvedValue(undefined),
    startProcessByDefId: vi.fn().mockResolvedValue('pi-x'),
    handleTaskTimeout: vi.fn().mockResolvedValue(undefined),
    resumeParentAfterSubProcess: vi.fn().mockResolvedValue(undefined),
    resumeWaitCondition: vi.fn().mockResolvedValue(undefined),
    resumeDelayedNode: vi.fn().mockResolvedValue(undefined),
  };
  const processor = new ProcessProcessor(
    engine as unknown as ConstructorParameters<typeof ProcessProcessor>[0],
    {
      get: vi.fn().mockReturnValue('redis://localhost:6379'),
    } as unknown as ConstructorParameters<typeof ProcessProcessor>[1],
  );
  processor.onModuleInit();
  const handler = workerHandlers.get(PROCESS_QUEUE);
  if (!handler) throw new Error('process worker handler 未注册');
  return { engine, handler };
}

/** 构造伪 BullMQ Job（handler 仅消费 data / attemptsMade / opts.attempts）。 */
function makeJob(
  overrides: { attemptsMade?: number; attempts?: number; data?: unknown } = {},
): Job {
  return {
    data: overrides.data ?? { instanceId: 'pi-001' },
    attemptsMade: overrides.attemptsMade ?? 0,
    opts: { attempts: overrides.attempts ?? 3 },
  } as unknown as Job;
}

describe('ProcessProcessor 失败分类与 final-failure 判定（PE-13）', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    prisma.processInstance.findFirst.mockResolvedValue({ tenantId: 'tenant-001' });
  });

  it('NonRetryableNodeError：同步 finalizeFailedInstance 且不再重试（job 记成功）', async () => {
    const { engine, handler } = createProcessor();
    engine.executeNextNode.mockRejectedValue(new NonRetryableNodeError('未配置审批人'));

    await expect(handler(makeJob())).resolves.toBeUndefined();

    expect(engine.finalizeFailedInstance).toHaveBeenCalledWith('pi-001', '未配置审批人');
  });

  it('瞬时失败非最终尝试：仅上抛交 BullMQ 重试，实例不落 FAILED', async () => {
    const { engine, handler } = createProcessor();
    engine.executeNextNode.mockRejectedValue(new Error('HTTP 502'));

    await expect(handler(makeJob({ attemptsMade: 0, attempts: 3 }))).rejects.toThrow('HTTP 502');

    expect(engine.finalizeFailedInstance).not.toHaveBeenCalled();
  });

  it('瞬时失败最终尝试（attemptsMade+1 >= attempts）：先 finalize 再上抛', async () => {
    const { engine, handler } = createProcessor();
    engine.executeNextNode.mockRejectedValue(new Error('HTTP 502'));

    await expect(handler(makeJob({ attemptsMade: 2, attempts: 3 }))).rejects.toThrow('HTTP 502');

    expect(engine.finalizeFailedInstance).toHaveBeenCalledWith('pi-001', 'HTTP 502');
  });

  it('正常完成：不触发 finalize', async () => {
    const { engine, handler } = createProcessor();

    await handler(makeJob());

    expect(engine.executeNextNode).toHaveBeenCalledWith('pi-001');
    expect(engine.finalizeFailedInstance).not.toHaveBeenCalled();
  });

  it('scheduled 触发分支不受影响（envKey 透传）', async () => {
    const { engine, handler } = createProcessor();

    await handler(makeJob({ data: { type: 'scheduled', processDefId: 'pd-001', envKey: 'dev' } }));

    expect(engine.startProcessByDefId).toHaveBeenCalledWith('pd-001', expect.anything(), 'dev');
    expect(engine.finalizeFailedInstance).not.toHaveBeenCalled();
  });
});
