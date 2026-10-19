/**
 * CloudFunctionService 单元测试 — CRUD + 发布 + 执行。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CloudFunctionService } from './cloud-function.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

function createMockChangeLogService() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

function createMockRunner() {
  return {
    execute: vi.fn().mockResolvedValue({
      success: true,
      result: { message: 'ok' },
      logs: ['Hello!'],
      durationMs: 42,
    }),
  };
}

function createService() {
  const changeLogService = createMockChangeLogService();
  const runner = createMockRunner();
  // 观测服务传入哑实现：invoke 路径的 FUNCTION_EXEC 事件不打扰单测
  const observabilityService = {
    record: vi.fn().mockResolvedValue(undefined),
  };
  const service = new CloudFunctionService(
    changeLogService as unknown as ConstructorParameters<typeof CloudFunctionService>[0],
    runner as unknown as ConstructorParameters<typeof CloudFunctionService>[1],
    observabilityService as unknown as ConstructorParameters<typeof CloudFunctionService>[2],
  );
  return { service, changeLogService, runner };
}

function makeFn(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cf-001',
    tenantId: 'tenant-001',
    appId: 'app-001',
    apiName: 'test_fn',
    name: 'Test Function',
    description: 'A test function',
    code: {
      source: 'async function handler(input, context) { return input; }',
      language: 'javascript',
    },
    inputSchema: null,
    status: 'DRAFT',
    version: 0,
    createdById: 'user-001',
    createdAt: new Date('2026-08-22'),
    updatedAt: new Date('2026-08-22'),
    ...overrides,
  };
}

describe('CloudFunctionService', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // list
  // =========================================================================

  describe('list', () => {
    it('返回应用下所有云函数', async () => {
      prisma.cloudFunction.findMany.mockResolvedValue([makeFn()]);

      const { service } = createService();
      const result = await service.list('tenant-001', 'app-001');

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('cf-001');
    });
  });

  // =========================================================================
  // get
  // =========================================================================

  describe('get', () => {
    it('返回云函数详情', async () => {
      prisma.cloudFunction.findFirst.mockResolvedValue(makeFn());

      const { service } = createService();
      const result = await service.get('tenant-001', 'app-001', 'cf-001');

      expect(result.id).toBe('cf-001');
      expect(result.code.source).toContain('handler');
    });

    it('云函数不存在时抛出 NotFoundException', async () => {
      prisma.cloudFunction.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(service.get('tenant-001', 'app-001', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe('create', () => {
    it('正常创建云函数', async () => {
      prisma.cloudFunction.findFirst.mockResolvedValue(null);
      prisma.cloudFunction.create.mockResolvedValue(makeFn());

      const { service, changeLogService } = createService();
      const result = await service.create('tenant-001', 'app-001', 'user-001', {
        apiName: 'test_fn',
        name: 'Test Function',
      });

      expect(result.id).toBe('cf-001');
      expect(prisma.cloudFunction.create).toHaveBeenCalledTimes(1);
      expect(changeLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ changeType: 'CREATE', module: 'CLOUD_FUNCTION' }),
      );
    });

    it('apiName 已存在时抛出 BadRequestException', async () => {
      prisma.cloudFunction.findFirst.mockResolvedValue(makeFn());

      const { service } = createService();
      await expect(
        service.create('tenant-001', 'app-001', 'user-001', {
          apiName: 'test_fn',
          name: 'Dup',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe('update', () => {
    it('正常更新云函数', async () => {
      prisma.cloudFunction.findFirst.mockResolvedValue(makeFn());
      prisma.cloudFunction.update.mockResolvedValue(makeFn({ name: 'Updated' }));

      const { service } = createService();
      const result = await service.update('tenant-001', 'app-001', 'cf-001', 'user-001', {
        name: 'Updated',
      });

      expect(result.name).toBe('Updated');
    });

    it('云函数不存在时抛出 NotFoundException', async () => {
      prisma.cloudFunction.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(
        service.update('tenant-001', 'app-001', 'missing', 'user-001', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe('delete', () => {
    it('正常删除 + 记录 ChangeLog', async () => {
      prisma.cloudFunction.findFirst.mockResolvedValue(makeFn());
      prisma.cloudFunction.delete.mockResolvedValue({});

      const { service, changeLogService } = createService();
      await service.delete('tenant-001', 'app-001', 'cf-001', 'user-001');

      expect(prisma.cloudFunction.delete).toHaveBeenCalledWith({ where: { id: 'cf-001' } });
      expect(changeLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ changeType: 'DELETE' }),
      );
    });

    it('云函数不存在时抛出 NotFoundException', async () => {
      prisma.cloudFunction.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(service.delete('tenant-001', 'app-001', 'missing', 'user-001')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // publish
  // =========================================================================

  describe('publish', () => {
    it('正常发布（DRAFT → PUBLISHED + version 自增）', async () => {
      prisma.cloudFunction.findFirst.mockResolvedValue(makeFn({ status: 'DRAFT', version: 0 }));
      prisma.cloudFunction.update.mockResolvedValue(makeFn({ status: 'PUBLISHED', version: 1 }));

      const { service } = createService();
      const result = await service.publish('tenant-001', 'app-001', 'cf-001', 'user-001');

      expect(result.status).toBe('PUBLISHED');
      expect(result.version).toBe(1);
    });

    it('已发布的云函数再次发布时抛出 BadRequestException', async () => {
      prisma.cloudFunction.findFirst.mockResolvedValue(makeFn({ status: 'PUBLISHED' }));

      const { service } = createService();
      await expect(service.publish('tenant-001', 'app-001', 'cf-001', 'user-001')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // invoke
  // =========================================================================

  describe('invoke', () => {
    it('正常执行已发布的云函数', async () => {
      prisma.cloudFunction.findFirst.mockResolvedValue(makeFn({ status: 'PUBLISHED' }));

      const { service, runner } = createService();
      const result = await service.invoke('tenant-001', 'cf-001', {
        input: { key: 'value' },
      });

      expect(result.success).toBe(true);
      expect(runner.execute).toHaveBeenCalledWith(
        expect.stringContaining('handler'),
        { key: 'value' },
        'tenant-001',
        'app-001',
      );
    });

    it('未发布的云函数执行时抛出 BadRequestException', async () => {
      prisma.cloudFunction.findFirst.mockResolvedValue(makeFn({ status: 'DRAFT' }));

      const { service } = createService();
      await expect(service.invoke('tenant-001', 'cf-001', { input: {} })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('云函数不存在时抛出 NotFoundException', async () => {
      prisma.cloudFunction.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(service.invoke('tenant-001', 'missing', { input: {} })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
