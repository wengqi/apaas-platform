/**
 * DataFlowEngine 单元测试 — 数据流执行引擎。
 *
 * 测试覆盖：
 * - preview：预览 pipeline（限制 100 行）
 * - executeAndMaterialize：完整执行 + 物化到 DatasetRow
 * - 内存 join（left join / inner join）
 * - 分组聚合（sum / count / avg / max / min）
 * - 筛选（JsonLogic 内存过滤）
 * - 输出字段映射
 * - 列定义构建
 * - 错误处理（pipeline 失败 → 状态 FAILED）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { DataFlowEngine } from './dataflow-engine.service.js';
import type { DataFlowConfig } from '@apaas/shared';
import { getMockPrisma } from '../test/test-helpers.js';

// ---------------------------------------------------------------------------
// 辅助：构造 DataFlowConfig
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<DataFlowConfig> = {}): DataFlowConfig {
  return {
    sources: [{ objectId: 'obj-001', alias: 'orders' }],
    outputFields: [
      { alias: 'name', label: 'Name', source: 'name', type: 'string' },
      { alias: 'amount', label: 'Amount', source: 'amount', type: 'number' },
    ],
    ...overrides,
  };
}

/** 构造源数据行（模拟 Record.data JSONB 内容）。 */
function makeRow(data: Record<string, unknown>): Record<string, unknown> {
  return data;
}

describe('DataFlowEngine', () => {
  const prisma = getMockPrisma();
  let engine: DataFlowEngine;

  beforeEach(() => {
    engine = new DataFlowEngine();
  });

  // =========================================================================
  // preview
  // =========================================================================

  describe('preview', () => {
    it('返回列定义和行数据（限制 100 行）', async () => {
      const rows = Array.from({ length: 150 }, (_, i) =>
        makeRow({ name: `Item ${i}`, amount: i * 10 }),
      );
      prisma.record.findMany.mockResolvedValue(rows.map((data) => ({ data })));

      const config = makeConfig();
      const result = await engine.preview('tenant-001', config);

      expect(result.columns).toHaveLength(2);
      expect(result.columns[0]!.apiName).toBe('name');
      expect(result.columns[1]!.apiName).toBe('amount');
      expect(result.rows).toHaveLength(100); // 限制 100 行
      expect(result.total).toBe(150);
    });

    it('无数据源时抛出 BadRequestException', async () => {
      const config = makeConfig({ sources: [] });

      await expect(engine.preview('tenant-001', config)).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // executeAndMaterialize
  // =========================================================================

  describe('executeAndMaterialize', () => {
    it('正常执行 — 物化结果 + 更新状态为 READY', async () => {
      const rows = [makeRow({ name: 'A', amount: 100 }), makeRow({ name: 'B', amount: 200 })];
      prisma.record.findMany.mockResolvedValue(rows.map((data) => ({ data })));
      prisma.datasetRow.deleteMany.mockResolvedValue({ count: 5 });
      prisma.datasetRow.createMany.mockResolvedValue({ count: 2 });
      prisma.dataset.update.mockResolvedValue({});
      // B6: REFRESHING 守卫使用 updateMany
      prisma.dataset.updateMany.mockResolvedValue({ count: 1 });
      // B6: 物化在 $transaction 内执行，mock $transaction 直接调用回调
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        await fn(prisma);
      });

      const config = makeConfig();
      await engine.executeAndMaterialize('tenant-001', 'ds-001', config);

      // B6: REFRESHING 守卫通过 updateMany 设置（非 update）
      const refreshingCall = prisma.dataset.updateMany.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'REFRESHING',
      );
      expect(refreshingCall).toBeDefined();

      // 最后 update 设为 READY + rowCount
      const readyCall = prisma.dataset.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'READY',
      );
      expect(readyCall).toBeDefined();
      expect(readyCall![0]!.data.rowCount).toBe(2);

      // 旧行被清除（在 $transaction 内通过 tx 调用）
      expect(prisma.datasetRow.deleteMany).toHaveBeenCalledWith({
        where: { datasetId: 'ds-001' },
      });
      // 新行被写入
      expect(prisma.datasetRow.createMany).toHaveBeenCalled();
    });

    it('pipeline 失败时状态更新为 FAILED + 记录错误', async () => {
      // 无数据源触发 BadRequestException
      const config = makeConfig({ sources: [] });
      prisma.dataset.update.mockResolvedValue({});
      // B6: REFRESHING 守卫使用 updateMany
      prisma.dataset.updateMany.mockResolvedValue({ count: 1 });
      // B6: 物化在 $transaction 内
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
        await fn(prisma);
      });

      await expect(engine.executeAndMaterialize('tenant-001', 'ds-001', config)).rejects.toThrow(
        BadRequestException,
      );

      // 应有 FAILED 状态更新
      const failedCall = prisma.dataset.update.mock.calls.find(
        (call: { data: Record<string, unknown> }[]) => call[0]!.data.status === 'FAILED',
      );
      expect(failedCall).toBeDefined();
      expect(failedCall![0]!.data.lastError).toBeDefined();
    });
  });

  // =========================================================================
  // 内存 Join
  // =========================================================================

  describe('内存 join', () => {
    it('inner join — 只保留匹配的行', async () => {
      // 左表：orders
      // 右表：customers
      // join: orders.customer_id = customers.id
      const ordersData = [
        makeRow({ id: 'o1', customer_id: 'c1', title: 'Order 1' }),
        makeRow({ id: 'o2', customer_id: 'c2', title: 'Order 2' }),
        makeRow({ id: 'o3', customer_id: 'c999', title: 'Order 3 (no match)' }),
      ];
      const customersData = [
        makeRow({ id: 'c1', name: 'Customer A' }),
        makeRow({ id: 'c2', name: 'Customer B' }),
      ];

      // findMany 第一次返回 orders，第二次返回 customers
      prisma.record.findMany
        .mockResolvedValueOnce(ordersData.map((data) => ({ data })))
        .mockResolvedValueOnce(customersData.map((data) => ({ data })));

      const config = makeConfig({
        sources: [
          { objectId: 'obj-orders', alias: 'orders' },
          { objectId: 'obj-customers', alias: 'customers' },
        ],
        join: {
          leftAlias: 'orders',
          rightAlias: 'customers',
          type: 'inner' as const,
          leftField: 'customer_id',
          rightField: 'id',
        },
        outputFields: [
          { alias: 'order_title', label: 'Title', source: 'orders.title', type: 'string' },
          { alias: 'customer_name', label: 'Customer', source: 'customers.name', type: 'string' },
        ],
      });

      const result = await engine.preview('tenant-001', config);

      // inner join：只有 2 条匹配（c1 和 c2），c999 不匹配
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]!.order_title).toBe('Order 1');
      expect(result.rows[0]!.customer_name).toBe('Customer A');
      expect(result.rows[1]!.order_title).toBe('Order 2');
      expect(result.rows[1]!.customer_name).toBe('Customer B');
    });

    it('left join — 保留左表所有行，不匹配的右表字段为 null', async () => {
      const ordersData = [
        makeRow({ id: 'o1', customer_id: 'c1', title: 'Order 1' }),
        makeRow({ id: 'o2', customer_id: 'c999', title: 'Order 2 (no match)' }),
      ];
      const customersData = [makeRow({ id: 'c1', name: 'Customer A' })];

      prisma.record.findMany
        .mockResolvedValueOnce(ordersData.map((data) => ({ data })))
        .mockResolvedValueOnce(customersData.map((data) => ({ data })));

      const config = makeConfig({
        sources: [
          { objectId: 'obj-orders', alias: 'orders' },
          { objectId: 'obj-customers', alias: 'customers' },
        ],
        join: {
          leftAlias: 'orders',
          rightAlias: 'customers',
          type: 'left' as const,
          leftField: 'customer_id',
          rightField: 'id',
        },
        outputFields: [
          { alias: 'order_title', label: 'Title', source: 'orders.title', type: 'string' },
          { alias: 'customer_name', label: 'Customer', source: 'customers.name', type: 'string' },
        ],
      });

      const result = await engine.preview('tenant-001', config);

      // left join：2 条（左表全保留）
      expect(result.rows).toHaveLength(2);
      // 第二行无匹配 → customer_name 应为 null
      expect(result.rows[1]!.order_title).toBe('Order 2 (no match)');
      expect(result.rows[1]!.customer_name).toBeNull();
    });
  });

  // =========================================================================
  // 分组聚合
  // =========================================================================

  describe('分组聚合', () => {
    it('sum 聚合 — 按分类分组求和', async () => {
      const rows = [
        makeRow({ category: 'A', amount: 100 }),
        makeRow({ category: 'A', amount: 200 }),
        makeRow({ category: 'B', amount: 50 }),
        makeRow({ category: 'B', amount: 150 }),
      ];
      prisma.record.findMany.mockResolvedValue(rows.map((data) => ({ data })));

      const config = makeConfig({
        sources: [{ objectId: 'obj-001', alias: 'data' }],
        aggregation: {
          groupBy: ['category'],
          metrics: [
            { alias: 'total_amount', label: 'Total', field: 'amount', function: 'sum' as const },
          ],
        },
        outputFields: [
          { alias: 'category', label: 'Category', source: 'category', type: 'string' },
          { alias: 'total_amount', label: 'Total', source: 'total_amount', type: 'number' },
        ],
      });

      const result = await engine.preview('tenant-001', config);

      expect(result.rows).toHaveLength(2); // 两个分组
      const groupA = result.rows.find((r) => r.category === 'A')!;
      const groupB = result.rows.find((r) => r.category === 'B')!;
      expect(groupA.total_amount).toBe(300);
      expect(groupB.total_amount).toBe(200);
    });

    it('count 聚合 — 按分类分组计数', async () => {
      const rows = [
        makeRow({ category: 'A', amount: 100 }),
        makeRow({ category: 'A', amount: 200 }),
        makeRow({ category: 'B', amount: 50 }),
      ];
      prisma.record.findMany.mockResolvedValue(rows.map((data) => ({ data })));

      const config = makeConfig({
        sources: [{ objectId: 'obj-001', alias: 'data' }],
        aggregation: {
          groupBy: ['category'],
          metrics: [
            { alias: 'count', label: 'Count', field: 'amount', function: 'count' as const },
          ],
        },
        outputFields: [
          { alias: 'category', label: 'Category', source: 'category', type: 'string' },
          { alias: 'count', label: 'Count', source: 'count', type: 'number' },
        ],
      });

      const result = await engine.preview('tenant-001', config);

      const groupA = result.rows.find((r) => r.category === 'A')!;
      const groupB = result.rows.find((r) => r.category === 'B')!;
      expect(groupA.count).toBe(2);
      expect(groupB.count).toBe(1);
    });

    it('avg 聚合 — 平均值', async () => {
      const rows = [
        makeRow({ category: 'A', amount: 100 }),
        makeRow({ category: 'A', amount: 300 }),
      ];
      prisma.record.findMany.mockResolvedValue(rows.map((data) => ({ data })));

      const config = makeConfig({
        sources: [{ objectId: 'obj-001', alias: 'data' }],
        aggregation: {
          groupBy: ['category'],
          metrics: [
            { alias: 'avg_amount', label: 'Avg', field: 'amount', function: 'avg' as const },
          ],
        },
        outputFields: [
          { alias: 'category', label: 'Category', source: 'category', type: 'string' },
          { alias: 'avg_amount', label: 'Avg', source: 'avg_amount', type: 'number' },
        ],
      });

      const result = await engine.preview('tenant-001', config);

      expect(result.rows[0]!.avg_amount).toBe(200);
    });

    it('max/min 聚合', async () => {
      const rows = [
        makeRow({ category: 'A', amount: 100 }),
        makeRow({ category: 'A', amount: 500 }),
        makeRow({ category: 'A', amount: 50 }),
      ];
      prisma.record.findMany.mockResolvedValue(rows.map((data) => ({ data })));

      const config = makeConfig({
        sources: [{ objectId: 'obj-001', alias: 'data' }],
        aggregation: {
          groupBy: ['category'],
          metrics: [
            { alias: 'max_val', label: 'Max', field: 'amount', function: 'max' as const },
            { alias: 'min_val', label: 'Min', field: 'amount', function: 'min' as const },
          ],
        },
        outputFields: [
          { alias: 'category', label: 'Category', source: 'category', type: 'string' },
          { alias: 'max_val', label: 'Max', source: 'max_val', type: 'number' },
          { alias: 'min_val', label: 'Min', source: 'min_val', type: 'number' },
        ],
      });

      const result = await engine.preview('tenant-001', config);

      expect(result.rows[0]!.max_val).toBe(500);
      expect(result.rows[0]!.min_val).toBe(50);
    });
  });

  // =========================================================================
  // 筛选（内存 JsonLogic 过滤）
  // =========================================================================

  describe('筛选', () => {
    it('filter 保留满足条件的行', async () => {
      const rows = [
        makeRow({ name: 'A', amount: 50 }),
        makeRow({ name: 'B', amount: 150 }),
        makeRow({ name: 'C', amount: 300 }),
      ];
      prisma.record.findMany.mockResolvedValue(rows.map((data) => ({ data })));

      const config = makeConfig({
        sources: [{ objectId: 'obj-001', alias: 'data' }],
        filter: { '>': [{ var: 'amount' }, 100] },
        outputFields: [
          { alias: 'name', label: 'Name', source: 'name', type: 'string' },
          { alias: 'amount', label: 'Amount', source: 'amount', type: 'number' },
        ],
      });

      const result = await engine.preview('tenant-001', config);

      expect(result.rows).toHaveLength(2); // 150 和 300 满足 > 100
      expect(result.rows[0]!.name).toBe('B');
      expect(result.rows[1]!.name).toBe('C');
    });
  });

  // =========================================================================
  // 输出字段映射
  // =========================================================================

  describe('输出字段映射', () => {
    it('无 join 时直接从源行提取字段', async () => {
      prisma.record.findMany.mockResolvedValue([{ data: makeRow({ name: 'Test', amount: 42 }) }]);

      const config = makeConfig({
        sources: [{ objectId: 'obj-001', alias: 'data' }],
        outputFields: [
          { alias: 'display_name', label: 'Name', source: 'name', type: 'string' },
          { alias: 'value', label: 'Value', source: 'amount', type: 'number' },
        ],
      });

      const result = await engine.preview('tenant-001', config);

      expect(result.rows[0]!.display_name).toBe('Test');
      expect(result.rows[0]!.value).toBe(42);
    });

    it('源字段不存在时输出 null', async () => {
      prisma.record.findMany.mockResolvedValue([{ data: makeRow({ name: 'Test' }) }]);

      const config = makeConfig({
        sources: [{ objectId: 'obj-001', alias: 'data' }],
        outputFields: [
          { alias: 'name', label: 'Name', source: 'name', type: 'string' },
          { alias: 'missing', label: 'Missing', source: 'nonexistent', type: 'string' },
        ],
      });

      const result = await engine.preview('tenant-001', config);

      expect(result.rows[0]!.name).toBe('Test');
      expect(result.rows[0]!.missing).toBeNull();
    });
  });

  // =========================================================================
  // 列定义构建
  // =========================================================================

  describe('列定义构建', () => {
    it('有 aggregation 时列 = groupBy + metrics', async () => {
      prisma.record.findMany.mockResolvedValue([]);

      const config = makeConfig({
        sources: [{ objectId: 'obj-001', alias: 'data' }],
        aggregation: {
          groupBy: ['category'],
          metrics: [{ alias: 'total', label: 'Total', field: 'amount', function: 'sum' as const }],
        },
        outputFields: [
          { alias: 'category', label: 'Category', source: 'category', type: 'string' },
          { alias: 'total', label: 'Total', source: 'total', type: 'number' },
        ],
      });

      const result = await engine.preview('tenant-001', config);

      expect(result.columns).toHaveLength(2);
      expect(result.columns[0]!.apiName).toBe('category');
      expect(result.columns[0]!.type).toBe('string');
      expect(result.columns[1]!.apiName).toBe('total');
      expect(result.columns[1]!.type).toBe('number');
    });

    it('无 aggregation 时列直接从 outputFields 构建', async () => {
      prisma.record.findMany.mockResolvedValue([]);

      const config = makeConfig();
      const result = await engine.preview('tenant-001', config);

      expect(result.columns).toHaveLength(2);
      expect(result.columns[0]!.apiName).toBe('name');
      expect(result.columns[0]!.label).toBe('Name');
      expect(result.columns[1]!.apiName).toBe('amount');
    });
  });
});
