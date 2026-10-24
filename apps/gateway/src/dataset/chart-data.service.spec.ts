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

  /** P1-17：mock SQL 聚合行（DB 侧 GROUP BY 结果直返）。 */
  function mockSqlRows(rows: Array<{ category: string; value: number; total: number }>) {
    prisma.$queryRawUnsafe.mockResolvedValue(rows);
  }

  beforeEach(() => {
    // 默认返回空数组，每个 test 按需 mock（SQL 路径默认空聚合行）
    prisma.record.findMany.mockResolvedValue([]);
    prisma.datasetRow.findMany.mockResolvedValue([]);
    prisma.$queryRawUnsafe.mockResolvedValue([]);
    // 归属校验默认通过（安全测试单独覆盖拒绝场景）
    prisma.objectMeta.findFirst.mockResolvedValue({ id: OBJECT_ID });
    prisma.dataset.findFirst.mockResolvedValue({ id: DATASET_ID });
  });

  // ---------------------------------------------------------------------------
  // 基础聚合函数
  // ---------------------------------------------------------------------------

  it('sum 聚合：按 categoryField 分组求和（P1-17 SQL 下推，DB 聚合行直返）', async () => {
    mockSqlRows([
      { category: 'open', value: 300, total: 3 },
      { category: 'closed', value: 50, total: 3 },
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

  it('count 聚合：按 categoryField 分组计数（P1-17 SQL）', async () => {
    mockSqlRows([
      { category: 'open', value: 2, total: 3 },
      { category: 'closed', value: 1, total: 3 },
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

  it('avg 聚合：按分组求平均值（P1-17 SQL）', async () => {
    mockSqlRows([
      { category: 'A', value: 85, total: 3 },
      { category: 'B', value: 100, total: 3 },
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

  it('max 聚合：取分组内最大值（P1-17 SQL）', async () => {
    mockSqlRows([
      { category: 'A', value: 120, total: 3 },
      { category: 'B', value: 50, total: 3 },
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

  it('min 聚合：取分组内最小值（P1-17 SQL）', async () => {
    mockSqlRows([
      { category: 'A', value: 80, total: 3 },
      { category: 'B', value: 50, total: 3 },
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

  it('标量聚合：无 categoryField 时返回单值（P1-17 SQL）', async () => {
    mockSqlRows([{ category: '_total', value: 600, total: 3 }]);

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

  it('标量 count 聚合：无 categoryField + 无 valueField 返回记录总数（P1-17 SQL）', async () => {
    mockSqlRows([{ category: '_total', value: 3, total: 3 }]);

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

  it('count 聚合不要求 valueField（P1-17 SQL）', async () => {
    mockSqlRows([
      { category: 'east', value: 2, total: 3 },
      { category: 'west', value: 1, total: 3 },
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

  it('filter 筛选：只聚合满足条件的记录（P1-17 SQL——filter 下推 WHERE 后 DB 聚合）', async () => {
    mockSqlRows([{ category: 'open', value: 150, total: 2 }]);

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

  it('filter 筛选：数值比较（P1-17 SQL）', async () => {
    mockSqlRows([
      { category: 'A', value: 150, total: 2 },
      { category: 'B', value: 200, total: 2 },
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

  it('缺失值的记录按 0 处理（P1-17 SQL——DB 守卫 cast 缺失值不参与，组聚合=100）', async () => {
    mockSqlRows([{ category: 'open', value: 100, total: 2 }]);

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
    mockSqlRows([{ category: 'open', value: 999, total: 1 }]);

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

// ---------------------------------------------------------------------------
// P1-17：object 源聚合 SQL 下推（GROUP BY + 守卫 cast，全量行 DB 内聚合）
// ---------------------------------------------------------------------------

describe('P1-17 图表聚合 SQL 下推', () => {
  const prisma = getMockPrisma();
  const service = new ChartDataService();
  const makeRecordData = (data: Record<string, unknown>): { data: Record<string, unknown> } => ({
    data,
  });

  beforeEach(() => {
    prisma.objectMeta.findFirst.mockResolvedValue({ id: 'obj-1' });
    prisma.record.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockReset();
  });

  it('object 源（无 ABAC/无时间分桶）→ raw SQL 聚合：GROUP BY + 守卫 cast + 全量 COUNT，不再拉行', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      { category: 'open', value: 300, total: 2 },
      { category: 'closed', value: 50, total: 2 },
    ]);

    const result = await service.aggregate('tenant-1', 'app-1', {
      sourceType: 'object',
      sourceId: 'obj-1',
      categoryField: 'status',
      valueField: 'amount',
      aggregation: 'sum',
    });

    // 不再拉原始行（旧实现 take 10000 无 orderBy 静默截断 + totalRecords 谎报）
    expect(prisma.record.findMany).not.toHaveBeenCalled();
    const sql = String(prisma.$queryRawUnsafe.mock.calls[0]![0]).toLowerCase();
    expect(sql).toContain('group by');
    expect(sql).toContain('data->>');
    expect(sql).not.toContain(' limit 10000');
    // 守卫 cast（G5 同款：非数值不参与）
    expect(sql).toContain('~');
    expect(sql).toContain('::numeric');
    // 适配输出
    expect(result.data).toEqual([
      { category: 'open', value: 300 },
      { category: 'closed', value: 50 },
    ]);
    expect(result.totalRecords).toBe(2); // 满足 filter 的行数（DB 全量，非截断计数）
  });

  it('filter（JsonLogic 可翻译）下推 WHERE', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ category: '_total', value: 5, __total: 5 }]);
    await service.aggregate('tenant-1', 'app-1', {
      sourceType: 'object',
      sourceId: 'obj-1',
      valueField: 'amount',
      aggregation: 'sum',
      filter: { '==': [{ var: 'status' }, 'open'] },
    });
    expect(String(prisma.$queryRawUnsafe.mock.calls[0]![0]).toLowerCase()).toContain('where');
  });

  it('timeGranularity 时间分桶保留内存路径（裁决：非数值/时间分桶不下推）', async () => {
    prisma.record.findMany.mockResolvedValue([
      makeRecordData({ d: '2026-10-01', amount: 1 }),
      makeRecordData({ d: '2026-10-02', amount: 2 }),
    ]);
    const result = await service.aggregate('tenant-1', 'app-1', {
      sourceType: 'object',
      sourceId: 'obj-1',
      categoryField: 'd',
      valueField: 'amount',
      aggregation: 'sum',
      timeGranularity: 'day',
    });
    expect(prisma.record.findMany).toHaveBeenCalled();
    expect(result.values).toEqual([1, 2]);
  });

  it('ABAC 行级条件存在时保留内存路径（权限语义优先，防旁路）', async () => {
    prisma.record.findMany.mockResolvedValue([makeRecordData({ amount: 7 })]);
    const result = await service.aggregate(
      'tenant-1',
      'app-1',
      {
        sourceType: 'object',
        sourceId: 'obj-1',
        valueField: 'amount',
        aggregation: 'sum',
      },
      { condition: { '==': [{ var: 'owner' }, 'u1'] }, currentUserId: 'u1' } as never,
    );
    expect(prisma.record.findMany).toHaveBeenCalled();
    expect(result.data[0]!.value).toBe(7);
  });

  it('dataset 源保留内存路径（DatasetRow 不在本次下推范围）', async () => {
    prisma.dataset.findFirst.mockResolvedValue({ id: 'ds-1' });
    prisma.datasetRow.findMany.mockResolvedValue([makeRecordData({ amount: 3 })]);
    await service.aggregate('tenant-1', 'app-1', {
      sourceType: 'dataset',
      sourceId: 'ds-1',
      valueField: 'amount',
      aggregation: 'sum',
    });
    expect(prisma.datasetRow.findMany).toHaveBeenCalled();
  });
});
