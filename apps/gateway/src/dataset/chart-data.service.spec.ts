/**
 * ChartDataService 单元测试 — 图表数据聚合引擎。
 *
 * 测试覆盖：
 * - 基础聚合函数（sum/count/avg/max/min）
 * - 标量聚合（无 categoryField，指标卡用）
 * - 时间分桶（day/week/month）+ 时间排序
 * - 筛选条件（JsonLogic filter）
 * - count 聚合不要求 valueField
 * - 非 count 聚合缺失 valueField 报错
 * - 数据源类型（object / dataset）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ChartDataService } from './chart-data.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

describe('ChartDataService', () => {
  const prisma = getMockPrisma();
  const service = new ChartDataService();

  const TENANT_ID = 'tenant-1';
  const APP_ID = 'app-1';
  const OBJECT_ID = 'obj-1';
  const DATASET_ID = 'ds-1';

  /** 构造 object 记录数据（record 表的 data JSONB）。 */
  function makeRecordData(data: Record<string, unknown>): { data: Record<string, unknown> } {
    return { data };
  }

  beforeEach(() => {
    // 默认返回空数组，每个 test 按需 mock
    prisma.record.findMany.mockResolvedValue([]);
    prisma.datasetRow.findMany.mockResolvedValue([]);
    // 归属校验默认通过（安全测试单独覆盖拒绝场景）
    prisma.objectMeta.findFirst.mockResolvedValue({ id: OBJECT_ID });
    prisma.dataset.findFirst.mockResolvedValue({ id: DATASET_ID });
  });

  // ---------------------------------------------------------------------------
  // 基础聚合函数
  // ---------------------------------------------------------------------------

  it('sum 聚合：按 categoryField 分组求和', async () => {
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ status: 'open', amount: 100 }),
      makeRecordData({ status: 'open', amount: 200 }),
      makeRecordData({ status: 'closed', amount: 50 }),
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      categoryField: 'status',
      valueField: 'amount',
      aggregation: 'sum',
    });

    expect(result.totalRecords).toBe(3);
    expect(result.data).toContainEqual({ category: 'open', value: 300 });
    expect(result.data).toContainEqual({ category: 'closed', value: 50 });
  });

  it('count 聚合：按 categoryField 分组计数', async () => {
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ status: 'open', amount: 100 }),
      makeRecordData({ status: 'open', amount: 200 }),
      makeRecordData({ status: 'closed', amount: 50 }),
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      categoryField: 'status',
      aggregation: 'count',
    });

    expect(result.data).toContainEqual({ category: 'open', value: 2 });
    expect(result.data).toContainEqual({ category: 'closed', value: 1 });
  });

  it('avg 聚合：按分组求平均值', async () => {
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ group: 'A', score: 80 }),
      makeRecordData({ group: 'A', score: 90 }),
      makeRecordData({ group: 'B', score: 100 }),
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      categoryField: 'group',
      valueField: 'score',
      aggregation: 'avg',
    });

    expect(result.data).toContainEqual({ category: 'A', value: 85 });
    expect(result.data).toContainEqual({ category: 'B', value: 100 });
  });

  it('max 聚合：取分组内最大值', async () => {
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ group: 'A', score: 80 }),
      makeRecordData({ group: 'A', score: 120 }),
      makeRecordData({ group: 'B', score: 50 }),
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      categoryField: 'group',
      valueField: 'score',
      aggregation: 'max',
    });

    expect(result.data).toContainEqual({ category: 'A', value: 120 });
    expect(result.data).toContainEqual({ category: 'B', value: 50 });
  });

  it('min 聚合：取分组内最小值', async () => {
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ group: 'A', score: 80 }),
      makeRecordData({ group: 'A', score: 120 }),
      makeRecordData({ group: 'B', score: 50 }),
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      categoryField: 'group',
      valueField: 'score',
      aggregation: 'min',
    });

    expect(result.data).toContainEqual({ category: 'A', value: 80 });
    expect(result.data).toContainEqual({ category: 'B', value: 50 });
  });

  // ---------------------------------------------------------------------------
  // 标量聚合（指标卡用 — 无 categoryField）
  // ---------------------------------------------------------------------------

  it('标量聚合：无 categoryField 时返回单值', async () => {
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ amount: 100 }),
      makeRecordData({ amount: 200 }),
      makeRecordData({ amount: 300 }),
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      valueField: 'amount',
      aggregation: 'sum',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.value).toBe(600);
    expect(result.categories).toHaveLength(1);
  });

  it('标量 count 聚合：无 categoryField + 无 valueField 返回记录总数', async () => {
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ foo: 1 }),
      makeRecordData({ bar: 2 }),
      makeRecordData({ baz: 3 }),
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      aggregation: 'count',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.value).toBe(3);
    expect(result.totalRecords).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // count 聚合不要求 valueField
  // ---------------------------------------------------------------------------

  it('count 聚合不要求 valueField', async () => {
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ region: 'east' }),
      makeRecordData({ region: 'west' }),
      makeRecordData({ region: 'east' }),
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      categoryField: 'region',
      aggregation: 'count',
    });

    expect(result.data).toContainEqual({ category: 'east', value: 2 });
    expect(result.data).toContainEqual({ category: 'west', value: 1 });
  });

  it('非 count 聚合缺失 valueField 报错', async () => {
    await expect(
      service.aggregate(TENANT_ID, APP_ID, {
        sourceType: 'object',
        sourceId: OBJECT_ID,
        categoryField: 'region',
        aggregation: 'sum',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ---------------------------------------------------------------------------
  // 时间分桶
  // ---------------------------------------------------------------------------

  it('时间分桶 day：按日期分桶并按时间排序', async () => {
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ date: '2026-01-03', amount: 30 }),
      makeRecordData({ date: '2026-01-01', amount: 10 }),
      makeRecordData({ date: '2026-01-02', amount: 20 }),
      makeRecordData({ date: '2026-01-01', amount: 15 }),
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      categoryField: 'date',
      valueField: 'amount',
      aggregation: 'sum',
      timeGranularity: 'day',
    });

    expect(result.categories).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(result.values).toEqual([25, 20, 30]);
  });

  it('时间分桶 month：按月分桶', async () => {
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ date: '2026-01-15', amount: 100 }),
      makeRecordData({ date: '2026-02-10', amount: 200 }),
      makeRecordData({ date: '2026-01-20', amount: 50 }),
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      categoryField: 'date',
      valueField: 'amount',
      aggregation: 'sum',
      timeGranularity: 'month',
    });

    expect(result.categories).toEqual(['2026-01', '2026-02']);
    expect(result.values).toEqual([150, 200]);
  });

  it('时间分桶 week：按周分桶（周一为起点）', async () => {
    // 2026-01-04 是周日，属于 2025-12-29 那一周（周一开始）
    // 2026-01-05 是周一，属于 2026-01-05 那一周
    // 2026-01-07 是周三，同属 2026-01-05 那一周
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ date: '2026-01-04', amount: 10 }),
      makeRecordData({ date: '2026-01-05', amount: 20 }),
      makeRecordData({ date: '2026-01-07', amount: 30 }),
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      categoryField: 'date',
      valueField: 'amount',
      aggregation: 'sum',
      timeGranularity: 'week',
    });

    expect(result.categories).toEqual(['2025-12-29', '2026-01-05']);
    expect(result.values).toEqual([10, 50]);
  });

  it('时间分桶：无法解析的日期归入"未知"并排在最后', async () => {
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ date: '2026-01-02', amount: 20 }),
      makeRecordData({ date: 'invalid-date', amount: 99 }),
      makeRecordData({ date: '2026-01-01', amount: 10 }),
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      categoryField: 'date',
      valueField: 'amount',
      aggregation: 'sum',
      timeGranularity: 'day',
    });

    expect(result.categories).toEqual(['2026-01-01', '2026-01-02', '未知']);
    expect(result.values).toEqual([10, 20, 99]);
  });

  it('时间分桶：支持 ISO 时间戳格式', async () => {
    // 使用本地时区中午的时间戳，避免 UTC 边界跨天问题
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ date: '2026-01-01T12:00:00', amount: 10 }),
      makeRecordData({ date: '2026-01-01T15:00:00', amount: 20 }),
      makeRecordData({ date: '2026-01-02T12:00:00', amount: 30 }),
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      categoryField: 'date',
      valueField: 'amount',
      aggregation: 'sum',
      timeGranularity: 'day',
    });

    expect(result.categories).toEqual(['2026-01-01', '2026-01-02']);
    expect(result.values).toEqual([30, 30]);
  });

  // ---------------------------------------------------------------------------
  // 筛选条件（JsonLogic filter）
  // ---------------------------------------------------------------------------

  it('filter 筛选：只聚合满足条件的记录', async () => {
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ status: 'open', amount: 100 }),
      makeRecordData({ status: 'closed', amount: 200 }),
      makeRecordData({ status: 'open', amount: 50 }),
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      categoryField: 'status',
      valueField: 'amount',
      aggregation: 'sum',
      filter: { '==': [{ var: 'status' }, 'open'] },
    });

    expect(result.totalRecords).toBe(2);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual({ category: 'open', value: 150 });
  });

  it('filter 筛选：数值比较', async () => {
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ group: 'A', amount: 50 }),
      makeRecordData({ group: 'A', amount: 150 }),
      makeRecordData({ group: 'B', amount: 200 }),
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      categoryField: 'group',
      valueField: 'amount',
      aggregation: 'sum',
      filter: { '>': [{ var: 'amount' }, 100] },
    });

    expect(result.totalRecords).toBe(2);
    expect(result.data).toContainEqual({ category: 'A', value: 150 });
    expect(result.data).toContainEqual({ category: 'B', value: 200 });
  });

  // ---------------------------------------------------------------------------
  // 数据集数据源
  // ---------------------------------------------------------------------------

  it('数据集数据源：从 datasetRow 加载数据', async () => {
    prisma.datasetRow.findMany.mockResolvedValue([
      makeRecordData({ region: 'east', sales: 1000 }),
      makeRecordData({ region: 'west', sales: 2000 }),
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'dataset',
      sourceId: DATASET_ID,
      categoryField: 'region',
      valueField: 'sales',
      aggregation: 'sum',
    });

    expect(result.data).toContainEqual({ category: 'east', value: 1000 });
    expect(result.data).toContainEqual({ category: 'west', value: 2000 });
    expect(prisma.record.findMany).not.toHaveBeenCalled();
    expect(prisma.datasetRow.findMany).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 边界情况
  // ---------------------------------------------------------------------------

  it('空数据集返回空数组', async () => {
    prisma.record.findMany.mockResolvedValue([]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      categoryField: 'status',
      valueField: 'amount',
      aggregation: 'sum',
    });

    expect(result.data).toEqual([]);
    expect(result.totalRecords).toBe(0);
  });

  it('categories 和 values 与 data 一致', async () => {
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ status: 'open', amount: 100 }),
      makeRecordData({ status: 'closed', amount: 200 }),
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      categoryField: 'status',
      valueField: 'amount',
      aggregation: 'sum',
    });

    expect(result.categories).toEqual(result.data.map((d) => d.category));
    expect(result.values).toEqual(result.data.map((d) => d.value));
  });

  it('缺失值的记录按 0 处理', async () => {
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ status: 'open', amount: 100 }),
      makeRecordData({ status: 'open' }), // 无 amount
    ]);

    const result = await service.aggregate(TENANT_ID, APP_ID, {
      sourceType: 'object',
      sourceId: OBJECT_ID,
      categoryField: 'status',
      valueField: 'amount',
      aggregation: 'sum',
    });

    expect(result.data).toContainEqual({ category: 'open', value: 100 });
  });

  it('不支持的数据源类型报错', async () => {
    await expect(
      service.aggregate(TENANT_ID, APP_ID, {
        sourceType: 'invalid' as 'object',
        sourceId: OBJECT_ID,
        categoryField: 'status',
        valueField: 'amount',
        aggregation: 'sum',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // -------------------------------------------------------------------------
  // 安全（P0 修复）：归属校验 / ABAC 行级条件 / fieldScope 列级校验
  // -------------------------------------------------------------------------

  it('安全: 对象不属于当前应用时拒绝（跨应用读取防护）', async () => {
    prisma.objectMeta.findFirst.mockResolvedValue(null); // 归属校验失败

    await expect(
      service.aggregate(TENANT_ID, APP_ID, {
        sourceType: 'object',
        sourceId: OBJECT_ID,
        categoryField: 'status',
        valueField: 'amount',
        aggregation: 'sum',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('安全: 数据集不属于当前应用时拒绝', async () => {
    prisma.dataset.findFirst.mockResolvedValue(null);

    await expect(
      service.aggregate(TENANT_ID, APP_ID, {
        sourceType: 'dataset',
        sourceId: DATASET_ID,
        categoryField: 'status',
        valueField: 'amount',
        aggregation: 'sum',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('安全: ABAC 行级条件注入 findMany where', async () => {
    prisma.record.findMany.mockResolvedValue([makeRecordData({ amount: 100 })]);

    await service.aggregate(
      TENANT_ID,
      APP_ID,
      {
        sourceType: 'object',
        sourceId: OBJECT_ID,
        categoryField: 'status',
        valueField: 'amount',
        aggregation: 'sum',
      },
      {
        condition: { '==': [{ var: 'created_by' }, { currentUser: true }] },
        fieldScope: null,
        currentUserId: 'user-001',
      },
    );

    const call = prisma.record.findMany.mock.calls[0]![0];
    expect(call.where.AND).toBeDefined();
    expect(Array.isArray(call.where.AND)).toBe(true);
  });

  it('安全: fieldScope 拒绝白名单外的值字段', async () => {
    await expect(
      service.aggregate(
        TENANT_ID,
        APP_ID,
        {
          sourceType: 'object',
          sourceId: OBJECT_ID,
          categoryField: 'status',
          valueField: 'salary', // 不在 fieldScope 内
          aggregation: 'avg',
        },
        {
          condition: null,
          fieldScope: ['status', 'amount'],
          currentUserId: 'user-001',
        },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('安全: fieldScope 拒绝白名单外的分类字段', async () => {
    await expect(
      service.aggregate(
        TENANT_ID,
        APP_ID,
        {
          sourceType: 'object',
          sourceId: OBJECT_ID,
          categoryField: 'secret_field',
          valueField: 'amount',
          aggregation: 'count',
        },
        {
          condition: null,
          fieldScope: ['status', 'amount'],
          currentUserId: 'user-001',
        },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('安全: fieldScope=null 不限制字段', async () => {
    prisma.record.findMany.mockResolvedValue([makeRecordData({ status: 'open', salary: 999 })]);

    const result = await service.aggregate(
      TENANT_ID,
      APP_ID,
      {
        sourceType: 'object',
        sourceId: OBJECT_ID,
        categoryField: 'status',
        valueField: 'salary',
        aggregation: 'sum',
      },
      { condition: null, fieldScope: null, currentUserId: 'user-001' },
    );

    expect(result.totalRecords).toBe(1);
  });
});
