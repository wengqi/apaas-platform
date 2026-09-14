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
      recordService.query
        .mockResolvedValueOnce({
          items: page1Records,
          total: 101,
          page: 1,
          pageSize: 100,
        })
        .mockResolvedValueOnce({
          items: [{ id: 'r100', data: { name: 'B100' } }],
          total: 101,
          page: 2,
          pageSize: 100,
        });

      const csv = await service.exportToCsv('tenant-001', 'obj-001', {});
      const lines = csv.trim().split('\n');
      expect(lines.length).toBe(102); // header + 101 rows
      expect(recordService.query).toHaveBeenCalledTimes(2);
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

  describe('importFromCsv', () => {
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
