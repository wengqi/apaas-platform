/**
 * RecordImportExportService 单元测试 — CSV 导入导出 + 模板生成。
 *
 * 测试覆盖：
 * - CSV 导出：列头正确、只读字段排除、分页合并、fieldScope 过滤
 * - CSV 导入：正常解析、列头匹配、只读字段跳过、错误行报告
 * - 模板生成：列头 + 示例行
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { FieldType } from '@apaas/shared';
import { RecordImportExportService } from './record-import-export.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

// ---------------------------------------------------------------------------
// Mock RecordService
// ---------------------------------------------------------------------------

function createMockRecordService() {
  return {
    query: vi.fn(),
    // P1-22：游标续页通道（默认空——具体用例按需 mock）
    queryCursorPage: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    batchCreate: vi.fn().mockResolvedValue({ created: 0, errors: [] }),
    batchUpdate: vi.fn(),
    batchDelete: vi.fn(),
  };
}

function createService() {
  const recordService = createMockRecordService();
  const service = new RecordImportExportService(
    recordService as unknown as ConstructorParameters<typeof RecordImportExportService>[0],
  );
  return { service, recordService };
}

/** 构造带字段的对象元数据。 */
function makeObjectWithFields(fields: Array<{ apiName: string; type: string }>) {
  return {
    id: 'obj-001',
    tenantId: 'tenant-001',
    appId: 'app-001',
    fields: fields.map((f, i) => ({ id: `field-${i}`, ...f, config: {} })),
  };
}

describe('RecordImportExportService', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // exportToCsv
  // =========================================================================

  it('P1-13：以 = + - @ 开头的单元格导出时中和（防 Excel 公式注入 CWE-1236）', async () => {
    prisma.objectMeta.findFirst.mockResolvedValue(
      makeObjectWithFields([{ apiName: 'note', type: FieldType.Text }]),
    );
    const { service, recordService } = createService();
    recordService.query.mockResolvedValue({
      total: 3,
      items: [
        { id: 'r1', data: { note: '=cmd|/C calc!A1' } },
        { id: 'r2', data: { note: '@SUM(1)' } },
        { id: 'r3', data: { note: '+1-1' } },
      ],
    });

    const csv = await service.exportToCsv('tenant-001', 'obj-001', {});

    expect(csv).toContain("'=cmd|/C calc!A1");
    expect(csv).toContain("'@SUM(1)");
    expect(csv).toContain("'+1-1");
    // 原样裸输出不得出现
    expect(csv).not.toContain('\n=cmd');
    expect(csv).not.toContain('\n@SUM');
  });

  it('P1-13：以 - 开头的数字单元格同样中和，普通文本不受影响', async () => {
    prisma.objectMeta.findFirst.mockResolvedValue(
      makeObjectWithFields([{ apiName: 'note', type: FieldType.Text }]),
    );
    const { service, recordService } = createService();
    recordService.query.mockResolvedValue({
      total: 2,
      items: [
        { id: 'r1', data: { note: '-1+cmd|/C calc!A0' } },
        { id: 'r2', data: { note: '普通文本' } },
      ],
    });

    const csv = await service.exportToCsv('tenant-001', 'obj-001', {});

    expect(csv).toContain("'-1+cmd");
    expect(csv).toContain('普通文本');
    // 空值/普通值不加前缀
    expect(csv).not.toContain("'普通文本");
  });

  describe('exportToCsv', () => {
    it('导出 CSV 含正确列头和数据', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectWithFields([
          { apiName: 'name', type: FieldType.Text },
          { apiName: 'amount', type: FieldType.Number },
        ]),
      );

      const { service, recordService } = createService();
      recordService.query.mockResolvedValue({
        items: [
          { id: 'r1', data: { name: '记录1', amount: 100 } },
          { id: 'r2', data: { name: '记录2', amount: 200 } },
        ],
        total: 2,
        page: 1,
        pageSize: 100,
      });

      const csv = await service.exportToCsv('tenant-001', 'obj-001', {});

      const lines = csv.trim().split('\n');
      expect(lines[0]).toBe('name,amount');
      expect(lines.length).toBe(3); // header + 2 rows
    });

    it('排除只读字段（AutoNumber/Formula/Rollup）', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectWithFields([
          { apiName: 'name', type: FieldType.Text },
          { apiName: 'code', type: FieldType.AutoNumber },
          { apiName: 'total', type: FieldType.Formula },
          { apiName: 'count', type: FieldType.Number },
        ]),
      );

      const { service, recordService } = createService();
      recordService.query.mockResolvedValue({
        items: [{ id: 'r1', data: { name: 'A', count: 5 } }],
        total: 1,
        page: 1,
        pageSize: 100,
      });

      const csv = await service.exportToCsv('tenant-001', 'obj-001', {});
      const headers = csv.split('\n')[0]!.split(',');
      expect(headers).toContain('name');
      expect(headers).toContain('count');
      expect(headers).not.toContain('code');
      expect(headers).not.toContain('total');
    });

    it('分页查询合并所有记录', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectWithFields([{ apiName: 'name', type: FieldType.Text }]),
      );

      const { service, recordService } = createService();
      // 模拟 2 页数据（total > 100 触发第二页）
      const page1Records = Array.from({ length: 100 }, (_, i) => ({
        id: `r${i}`,
        data: { name: `A${i}` },
      }));
      recordService.query.mockResolvedValueOnce({
        items: page1Records,
        total: 101,
        page: 1,
        pageSize: 100,
      });
      // P1-22：第二页经游标通道（零 count）
      recordService.queryCursorPage.mockResolvedValue([{ id: 'r100', data: { name: 'B100' } }]);

      const csv = await service.exportToCsv('tenant-001', 'obj-001', {});
      const lines = csv.trim().split('\n');
      expect(lines.length).toBe(102); // header + 101 rows
      // query 仅首页一次（含唯一 count），续页走游标
      expect(recordService.query).toHaveBeenCalledTimes(1);
      expect(recordService.queryCursorPage).toHaveBeenCalledTimes(1);
    });

    it('对象不存在时报错', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(null);
      const { service } = createService();
      await expect(service.exportToCsv('t', 'o', {})).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // importFromCsv
  // =========================================================================

  describe('P1-22 导出 total 一次计算 + 游标分页', () => {
    it('total 只查一次（首页 query），后续页走游标取行（零 count）', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectWithFields([{ apiName: 'name', type: FieldType.Text }]),
      );
      const all = Array.from({ length: 250 }, (_, i) => ({
        id: `r${String(i).padStart(4, '0')}`,
        data: { name: `n${i}` },
      }));
      const { service, recordService } = createService();

      // 首页 query（内含一次 count）；后续页 = queryCursorPage 游标（findMany，无 count）
      recordService.query.mockResolvedValue({
        total: 250,
        items: all.slice(0, 100),
        page: 1,
        pageSize: 100,
      });
      recordService.queryCursorPage = vi.fn(async (_t: string, _o: string, cursorId: string) => {
        const idx = all.findIndex((r) => r.id === cursorId);
        return all.slice(idx + 1, idx + 1 + 100);
      });
      prisma.record.count.mockResolvedValue(250);

      const csv = await service.exportToCsv('tenant-001', 'obj-001', {});

      expect(csv.split('\n').length).toBeGreaterThanOrEqual(251); // 表头 + 250 行
      // O(N²/100) 根因消除：query（含 count）仅首页一次；后续页游标取行零 count
      expect(recordService.query).toHaveBeenCalledTimes(1);
      expect(recordService.queryCursorPage).toHaveBeenCalledTimes(2); // 100+100+50 → 两轮游标
    });
  });

  describe('importFromCsv', () => {
    it('P1-13：导出时中和的前缀在导入时还原（round-trip 不损坏数据）', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectWithFields([
          { apiName: 'name', type: FieldType.Text },
          { apiName: 'amount', type: FieldType.Number },
        ]),
      );

      const { service, recordService } = createService();
      recordService.batchCreate.mockResolvedValue({ created: 2, errors: [] });

      // "'=cmd" / "'-100" 是导出中和后的形态——导入应剥掉中和前缀
      const csv = "name,amount\n'=cmd,-100";
      const result = await service.importFromCsv('tenant-001', 'obj-001', 'user-001', csv);

      expect(result.errors).toHaveLength(0);
      expect(recordService.batchCreate).toHaveBeenCalledWith(
        'tenant-001',
        'obj-001',
        'user-001',
        expect.arrayContaining([expect.objectContaining({ name: '=cmd', amount: '-100' })]),
        undefined,
      );
    });

    it('正常解析并导入 CSV', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectWithFields([
          { apiName: 'name', type: FieldType.Text },
          { apiName: 'amount', type: FieldType.Number },
        ]),
      );

      const { service, recordService } = createService();
      recordService.batchCreate.mockResolvedValue({ created: 2, errors: [] });

      const csv = 'name,amount\n记录1,100\n记录2,200';
      const result = await service.importFromCsv('tenant-001', 'obj-001', 'user-001', csv);

      expect(result.total).toBe(2);
      expect(result.success).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(recordService.batchCreate).toHaveBeenCalledWith(
        'tenant-001',
        'obj-001',
        'user-001',
        expect.arrayContaining([
          expect.objectContaining({ name: '记录1', amount: '100' }),
          expect.objectContaining({ name: '记录2', amount: '200' }),
        ]),
        undefined, // permissionContext（导入测试不传权限上下文）
      );
    });

    it('只读字段在导入时跳过', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectWithFields([
          { apiName: 'name', type: FieldType.Text },
          { apiName: 'code', type: FieldType.AutoNumber },
        ]),
      );

      const { service, recordService } = createService();
      recordService.batchCreate.mockResolvedValue({ created: 1, errors: [] });

      const csv = 'name,code\n记录1,ORD-001';
      const result = await service.importFromCsv('tenant-001', 'obj-001', 'user-001', csv);

      expect(result.success).toBe(1);
      // code 字段应被跳过
      const callArgs = recordService.batchCreate.mock.calls[0]![3] as Record<string, unknown>[];
      expect(callArgs[0]).not.toHaveProperty('code');
      expect(callArgs[0]).toHaveProperty('name');
    });

    it('空 CSV 返回 0 成功', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectWithFields([{ apiName: 'name', type: FieldType.Text }]),
      );

      const { service } = createService();
      const result = await service.importFromCsv('tenant-001', 'obj-001', 'user-001', 'name\n');

      expect(result.total).toBe(0);
      expect(result.success).toBe(0);
    });

    it('对象不存在时报错', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(null);
      const { service } = createService();
      await expect(service.importFromCsv('t', 'o', 'u', 'name\nA')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // getImportTemplate
  // =========================================================================

  describe('getImportTemplate', () => {
    it('生成含列头和示例行的 CSV', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectWithFields([
          { apiName: 'name', type: FieldType.Text },
          { apiName: 'amount', type: FieldType.Number },
          { apiName: 'code', type: FieldType.AutoNumber },
        ]),
      );

      const { service } = createService();
      const csv = await service.getImportTemplate('tenant-001', 'obj-001');

      const lines = csv.trim().split('\n');
      expect(lines.length).toBe(2); // header + example
      const headers = lines[0]!.split(',');
      expect(headers).toContain('name');
      expect(headers).toContain('amount');
      expect(headers).not.toContain('code'); // AutoNumber 排除
    });

    it('对象不存在时报错', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(null);
      const { service } = createService();
      await expect(service.getImportTemplate('t', 'o')).rejects.toThrow(NotFoundException);
    });
  });
});
