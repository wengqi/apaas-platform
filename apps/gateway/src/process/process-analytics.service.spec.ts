/**
 * 流程效率分析服务单测（P1 运维治理）— 状态透视/完成率/超时数/raw SQL 参数。
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { getMockPrisma, getMockQueryRawUnsafe } from '../test/test-helpers.js';
import { ProcessAnalyticsService } from './process-analytics.service.js';

const TENANT = 'tenant-001';
const APP = 'app-001';

function mockDefs() {
  const prisma = getMockPrisma();
  prisma.processDef.findMany.mockResolvedValue([
    { id: 'def-1', name: '合同审批', apiName: 'contract_approval' },
    { id: 'def-2', name: '报销审批', apiName: 'expense_approval' },
  ]);
}

describe('ProcessAnalyticsService.getAnalytics', () => {
  let service: ProcessAnalyticsService;

  beforeEach(() => {
    service = new ProcessAnalyticsService();
    mockDefs();
  });

  it('状态 groupBy 透视成 totals + byProcess，完成率 = COMPLETED/终态', async () => {
    const prisma = getMockPrisma();
    prisma.processInstance.groupBy.mockImplementation((arg: { by: string[] }) => {
      if (arg.by.includes('status')) {
        return Promise.resolve([
          { processDefId: 'def-1', status: 'COMPLETED', _count: { _all: 6 } },
          { processDefId: 'def-1', status: 'FAILED', _count: { _all: 2 } },
          { processDefId: 'def-1', status: 'RUNNING', _count: { _all: 2 } },
          { processDefId: 'def-2', status: 'COMPLETED', _count: { _all: 8 } },
          { processDefId: 'def-2', status: 'TERMINATED', _count: { _all: 2 } },
        ]);
      }
      // timedOut 分组（by 只有 processDefId）
      return Promise.resolve([{ processDefId: 'def-1', _count: { _all: 2 } }]);
    });
    getMockQueryRawUnsafe()
      .mockResolvedValueOnce([{ processDefId: 'def-1', avgDurationMs: 5000 }]) // 按流程
      .mockResolvedValueOnce([{ avgDurationMs: 6000, maxDurationMs: 120000 }]); // 全局

    const result = await service.getAnalytics({ tenantId: TENANT, appId: APP });

    expect(result.totals).toMatchObject({
      total: 20,
      completed: 14,
      failed: 2,
      terminated: 2,
      running: 2,
      timedOut: 2,
    });
    // 完成率 = 14 / 终态 18（COMPLETED 14 + FAILED 2 + TERMINATED 2）
    expect(result.totals.completionRate).toBeCloseTo(14 / 18);
    expect(result.totals.avgDurationMs).toBe(6000);
    expect(result.totals.maxDurationMs).toBe(120000);

    expect(result.byProcess).toHaveLength(2);
    const def1 = result.byProcess.find((r) => r.processDefId === 'def-1')!;
    expect(def1).toMatchObject({
      name: '合同审批',
      total: 10,
      completed: 6,
      failed: 2,
      running: 2,
      timedOut: 2,
      avgDurationMs: 5000,
    });
    expect(def1.completionRate).toBeCloseTo(6 / 8);
  });

  it('无终态实例时完成率为 null；从未运行的流程不出现在 byProcess', async () => {
    const prisma = getMockPrisma();
    prisma.processInstance.groupBy.mockImplementation((arg: { by: string[] }) => {
      if (arg.by.includes('status')) {
        return Promise.resolve([{ processDefId: 'def-1', status: 'RUNNING', _count: { _all: 3 } }]);
      }
      return Promise.resolve([]);
    });
    getMockQueryRawUnsafe()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ avgDurationMs: null, maxDurationMs: null }]);

    const result = await service.getAnalytics({ tenantId: TENANT, appId: APP });

    expect(result.totals.completionRate).toBeNull();
    expect(result.totals.avgDurationMs).toBeNull();
    expect(result.byProcess).toHaveLength(1);
    expect(result.byProcess[0]!.processDefId).toBe('def-1');
  });

  it('范围内无流程定义 → 空结果且不触达实例表', async () => {
    const prisma = getMockPrisma();
    prisma.processDef.findMany.mockResolvedValue([]);

    const result = await service.getAnalytics({ tenantId: TENANT, appId: APP });

    expect(result.totals.total).toBe(0);
    expect(result.byProcess).toEqual([]);
    expect(prisma.processInstance.groupBy).not.toHaveBeenCalled();
  });

  it('raw SQL 参数化：tenant/environment/defIds 走位置参数（无字符串拼接）', async () => {
    const prisma = getMockPrisma();
    prisma.processInstance.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    getMockQueryRawUnsafe()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ avgDurationMs: null, maxDurationMs: null }]);

    await service.getAnalytics({ tenantId: TENANT, appId: APP });

    const firstCall = getMockQueryRawUnsafe().mock.calls[0] as unknown[];
    const sql = firstCall[0] as string;
    expect(sql).toContain('tenant_id = $1');
    expect(sql).toContain('environment_id = $2');
    expect(sql).toContain('ANY($3::text[])');
    expect(firstCall[1]).toBe(TENANT);
    expect(firstCall[2]).toBe('prod'); // ALS 无环境上下文 → 缺省 prod
    expect(firstCall[3]).toEqual(['def-1', 'def-2']);
  });
});
