/**
 * ConnectorService 单元测试 — 连接器 CRUD + 测试 + 调用。
 *
 * 测试覆盖：
 * - list / get / getEntity
 * - create（apiName 唯一性校验 + Webhook token 自动生成 + ChangeLog）
 * - update / delete（存在性校验 + ChangeLog）
 * - test（非 HTTP 类型拒绝）
 * - invoke
 * - findByWebhookToken
 * - toDto 映射
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConnectorService } from './connector.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

function createMockChangeLogService() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

function createMockCallService() {
  return {
    invoke: vi.fn().mockResolvedValue({
      statusCode: 200,
      responseBody: { ok: true },
      responseHeaders: {},
      success: true,
    }),
  };
}

function createService() {
  const changeLogService = createMockChangeLogService();
  const callService = createMockCallService();
  const service = new ConnectorService(
    changeLogService as unknown as ConstructorParameters<typeof ConnectorService>[0],
    callService as unknown as ConstructorParameters<typeof ConnectorService>[1],
  );
  return { service, changeLogService, callService };
}

function makeConnector(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'conn-001',
    tenantId: 'tenant-001',
    appId: 'app-001',
    apiName: 'test_connector',
    name: 'Test Connector',
    description: 'A test connector',
    type: 'HTTP',
    baseUrl: 'https://api.example.com',
    config: { operations: [] },
    credentialId: null,
    status: 'ACTIVE',
    webhookToken: null,
    createdAt: new Date('2026-08-22'),
    updatedAt: new Date('2026-08-22'),
    ...overrides,
  };
}

describe('ConnectorService', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // list
  // =========================================================================

  describe('list', () => {
    it('返回应用下所有连接器 DTO', async () => {
      prisma.connector.findMany.mockResolvedValue([
        makeConnector(),
        makeConnector({ id: 'conn-002' }),
      ]);

      const { service } = createService();
      const result = await service.list('tenant-001', 'app-001');

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('conn-001');
      expect(prisma.connector.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-001', appId: 'app-001' },
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('空列表返回空数组', async () => {
      prisma.connector.findMany.mockResolvedValue([]);

      const { service } = createService();
      const result = await service.list('tenant-001', 'app-001');

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // get
  // =========================================================================

  describe('get', () => {
    it('返回连接器 DTO', async () => {
      prisma.connector.findFirst.mockResolvedValue(makeConnector());

      const { service } = createService();
      const result = await service.get('tenant-001', 'app-001', 'conn-001');

      expect(result.id).toBe('conn-001');
      expect(result.apiName).toBe('test_connector');
      expect(result.type).toBe('HTTP');
    });

    it('连接器不存在时抛出 NotFoundException', async () => {
      prisma.connector.findFirst.mockResolvedValue(null);

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
    it('正常创建 HTTP 连接器', async () => {
      prisma.connector.findFirst.mockResolvedValue(null);
      prisma.connector.create.mockResolvedValue(makeConnector());

      const { service, changeLogService } = createService();
      const result = await service.create('tenant-001', 'app-001', 'user-001', {
        apiName: 'test_connector',
        name: 'Test Connector',
        type: 'HTTP',
        baseUrl: 'https://api.example.com',
      });

      expect(result.id).toBe('conn-001');
      expect(prisma.connector.create).toHaveBeenCalledTimes(1);
      const createCall = prisma.connector.create.mock.calls[0]![0];
      expect(createCall.data.apiName).toBe('test_connector');
      expect(createCall.data.webhookToken).toBeNull();
      expect(changeLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ changeType: 'CREATE', module: 'CONNECTOR' }),
      );
    });

    it('Webhook 类型自动生成 token', async () => {
      prisma.connector.findFirst.mockResolvedValue(null);
      prisma.connector.create.mockResolvedValue(
        makeConnector({ type: 'WEBHOOK', webhookToken: 'abc123' }),
      );

      const { service } = createService();
      await service.create('tenant-001', 'app-001', 'user-001', {
        apiName: 'webhook_conn',
        name: 'Webhook Connector',
        type: 'WEBHOOK',
      });

      const createCall = prisma.connector.create.mock.calls[0]![0];
      expect(createCall.data.webhookToken).toBeTruthy();
      expect(typeof createCall.data.webhookToken).toBe('string');
      expect(createCall.data.webhookToken.length).toBe(32); // 16 bytes hex = 32 chars
    });

    it('apiName 已存在时抛出 BadRequestException', async () => {
      prisma.connector.findFirst.mockResolvedValue(makeConnector());

      const { service } = createService();
      await expect(
        service.create('tenant-001', 'app-001', 'user-001', {
          apiName: 'test_connector',
          name: 'Duplicate',
          type: 'HTTP',
          baseUrl: 'https://api.example.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe('update', () => {
    it('正常更新连接器', async () => {
      prisma.connector.findFirst.mockResolvedValue(makeConnector());
      prisma.connector.update.mockResolvedValue(makeConnector({ name: 'Updated Name' }));

      const { service, changeLogService } = createService();
      const result = await service.update('tenant-001', 'app-001', 'conn-001', 'user-001', {
        name: 'Updated Name',
      });

      expect(result.name).toBe('Updated Name');
      expect(changeLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ changeType: 'UPDATE' }),
      );
    });

    it('连接器不存在时抛出 NotFoundException', async () => {
      prisma.connector.findFirst.mockResolvedValue(null);

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
    it('正常删除连接器 + 记录 ChangeLog', async () => {
      prisma.connector.findFirst.mockResolvedValue(makeConnector());
      prisma.connector.delete.mockResolvedValue({});

      const { service, changeLogService } = createService();
      await service.delete('tenant-001', 'app-001', 'conn-001', 'user-001');

      expect(prisma.connector.delete).toHaveBeenCalledWith({ where: { id: 'conn-001' } });
      expect(changeLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ changeType: 'DELETE' }),
      );
    });

    it('连接器不存在时抛出 NotFoundException', async () => {
      prisma.connector.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(service.delete('tenant-001', 'app-001', 'missing', 'user-001')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // test
  // =========================================================================

  describe('test', () => {
    it('HTTP 类型连接器可测试', async () => {
      prisma.connector.findFirst.mockResolvedValue(makeConnector({ type: 'HTTP' }));

      const { service, callService } = createService();
      const result = await service.test('tenant-001', 'app-001', 'conn-001', {
        method: 'GET',
        path: '/posts',
      });

      expect(result.success).toBe(true);
      expect(callService.invoke).toHaveBeenCalledTimes(1);
    });

    it('非 HTTP 类型连接器测试时抛出 BadRequestException', async () => {
      prisma.connector.findFirst.mockResolvedValue(makeConnector({ type: 'WEBHOOK' }));

      const { service } = createService();
      await expect(
        service.test('tenant-001', 'app-001', 'conn-001', { method: 'GET' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // invoke
  // =========================================================================

  describe('invoke', () => {
    it('调用连接器并返回结果', async () => {
      prisma.connector.findFirst.mockResolvedValue(makeConnector());

      const { service, callService } = createService();
      const result = await service.invoke('tenant-001', 'conn-001', {
        operationId: 'getPosts',
      });

      expect(result.statusCode).toBe(200);
      expect(callService.invoke).toHaveBeenCalledWith(expect.objectContaining({ id: 'conn-001' }), {
        operationId: 'getPosts',
      });
    });
  });

  // =========================================================================
  // findByWebhookToken
  // =========================================================================

  describe('findByWebhookToken', () => {
    it('通过 token 查找 WEBHOOK 类型 ACTIVE 状态的连接器', async () => {
      const webhookConn = makeConnector({
        type: 'WEBHOOK',
        webhookToken: 'tok123',
        status: 'ACTIVE',
      });
      prisma.connector.findFirst.mockResolvedValue(webhookConn);

      const { service } = createService();
      const result = await service.findByWebhookToken('tok123');

      expect(result).toBeTruthy();
      expect(prisma.connector.findFirst).toHaveBeenCalledWith({
        where: { webhookToken: 'tok123', type: 'WEBHOOK', status: 'ACTIVE' },
      });
    });

    it('token 无匹配时返回 null', async () => {
      prisma.connector.findFirst.mockResolvedValue(null);

      const { service } = createService();
      const result = await service.findByWebhookToken('nonexistent');

      expect(result).toBeNull();
    });
  });
});
