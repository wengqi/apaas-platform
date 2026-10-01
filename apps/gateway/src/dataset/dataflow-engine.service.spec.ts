/**
 * DataFlowEngine 单元测试（G5 SQL 下推后）——租约守卫/物化事务/FAILED 重试
 * 语义/preview total/filter 内存兜底/聚合分支报错。
 *
 * SQL 结构与参数由 dataflow-sql.spec / jsonlogic-to-sql.spec 锁定；
 * 本文件锁定引擎编排行为（$queryRawUnsafe → 物化 → 状态机）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { DataFlowEngine } from './dataflow-engine.service.js';
import { getMockPrisma, getMockQueryRawUnsafe } from '../test/test-helpers.js';
import type { DataFlowConfig } from '@apaas/shared';

const SINGLE: DataFlowConfig = {
  sources: [{ objectId: 'obj-1', alias: 'orders' }],
  outputFields: [{ alias: 'title', label: '标题', source: 'title', type: 'string' }],
};

function makeEngine() {
  return new DataFlowEngine();
}

describe('preview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SQL 下推：rows 取 data 列，total 取窗口计数', async () => {
    const engine = makeEngine();
    const q = getMockQueryRawUnsafe();
    q.mockResolvedValue([
      { data: { title: 'A' }, __total: 42 },
      { data: { title: 'B' }, __total: 42 },
    ]);

    const r = await engine.preview('t1', SINGLE);
    expect(r.rows).toEqual([{ title: 'A' }, { title: 'B' }]);
    expect(r.total).toBe(42);
    expect(r.columns).toEqual([
      { apiName: 'title', label: '标题', type: 'string', source: 'title' },
    ]);
    // SQL 带 LIMIT 100（preview 限额）与全量计数窗口
    const [text, ...values] = q.mock.calls[0] as [string, ...unknown[]];
    expect(text).toContain('LIMIT 100');
    expect(text).toContain('__total');
    expect(values[0]).toBe('t1');
    expect(values[1]).toBe('prod'); // 无环境上下文 → 缺省 prod
  });

  it('缺数据源 → BadRequest（不触 SQL）', async () => {
    const engine = makeEngine();
    await expect(engine.preview('t1', { ...SINGLE, sources: [] })).rejects.toThrow(
      BadRequestException,
    );
    expect(getMockQueryRawUnsafe()).not.toHaveBeenCalled();
  });

  it('可下推 filter → WHERE 注入（total 取窗口计数而非内存过滤）', async () => {
    const engine = makeEngine();
    getMockQueryRawUnsafe().mockResolvedValue([{ data: { title: 'east-1' }, __total: 1 }]);

    const r = await engine.preview('t1', {
      ...SINGLE,
      filter: { '==': [{ var: 'title' }, 'east-1'] },
    });
    expect(r.total).toBe(1);
    const [text] = getMockQueryRawUnsafe().mock.calls[0] as [string];
    expect(text).toMatch(/WHERE data->>'title' = /);
  });
});

describe('executeAndMaterialize', () => {
  beforeEach(() => vi.clearAllMocks());

  function arrangeGuard(count = 1) {
    const prisma = getMockPrisma();
    prisma.dataset.updateMany.mockResolvedValue({ count });
    return prisma;
  }

  it('租约守卫：已 REFRESHING（未超租约）→ 跳过刷新', async () => {
    const prisma = arrangeGuard(0);
    const engine = makeEngine();
    await engine.executeAndMaterialize('t1', 'ds-1', SINGLE);
    expect(prisma.dataset.update).not.toHaveBeenCalled();
    expect(getMockQueryRawUnsafe()).not.toHaveBeenCalled();
  });

  it('成功：SQL 取数 → 事务内换血（deleteMany + createMany）→ READY + rowCount', async () => {
    const prisma = arrangeGuard(1);
    prisma.dataset.update.mockResolvedValue({});
    // 回调形式事务以 mockPrisma 作为 tx
    prisma.datasetRow.deleteMany.mockResolvedValue({});
    prisma.datasetRow.createMany.mockResolvedValue({});
    getMockQueryRawUnsafe().mockResolvedValue([
      { data: { title: 'A' } },
      { data: { title: 'B' } },
      { data: { title: 'C' } },
    ]);

    const engine = makeEngine();
    await engine.executeAndMaterialize('t1', 'ds-1', SINGLE);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.datasetRow.deleteMany).toHaveBeenCalledWith({ where: { datasetId: 'ds-1' } });
    expect(prisma.datasetRow.createMany).toHaveBeenCalled();
    expect(prisma.dataset.update).toHaveBeenCalledWith({
      where: { id: 'ds-1' },
      data: expect.objectContaining({ status: 'READY', rowCount: 3, lastError: null }),
    });
  });

  it('SQL 失败 → FAILED + lastError + rethrow（BullMQ 重试）', async () => {
    const prisma = arrangeGuard(1);
    prisma.dataset.update.mockResolvedValue({});
    getMockQueryRawUnsafe().mockRejectedValue(new Error('relation "records" does not exist'));

    const engine = makeEngine();
    await expect(engine.executeAndMaterialize('t1', 'ds-1', SINGLE)).rejects.toThrow(/records/);
    expect(prisma.dataset.update).toHaveBeenCalledWith({
      where: { id: 'ds-1' },
      data: { status: 'FAILED', lastError: expect.stringContaining('records') },
    });
  });

  it('聚合 + 不可下推 filter → BadRequest（预检即报，配置作者可见）', async () => {
    arrangeGuard(1);
    const engine = makeEngine();
    await expect(
      engine.executeAndMaterialize('t1', 'ds-1', {
        ...SINGLE,
        filter: { var: 'x' },
        aggregation: {
          groupBy: ['title'],
          metrics: [{ alias: 'cnt', label: 'N', field: 'title', function: 'count' }],
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
