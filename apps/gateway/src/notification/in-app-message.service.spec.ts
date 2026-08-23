/**
 * InAppMessageService 单元测试 — 站内信 CRUD。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InAppMessageService } from './in-app-message.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

const now = new Date('2026-08-23T10:00:00Z');

function makeMsg(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-001',
    tenantId: 'tenant-001',
    appId: 'app-001',
    userId: 'user-001',
    title: '测试标题',
    body: '测试内容',
    read: false,
    type: 'NOTIFICATION',
    createdAt: now,
    ...overrides,
  };
}

describe('InAppMessageService', () => {
  const prisma = getMockPrisma();
  let service: InAppMessageService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new InAppMessageService();
  });

  describe('create', () => {
    it('应创建站内消息', async () => {
      prisma.inAppMessage.createMany.mockResolvedValue({ count: 2 });

      const result = await service.create({
        tenantId: 'tenant-001',
        appId: 'app-001',
        userIds: ['user-001', 'user-002'],
        title: '测试标题',
        body: '测试内容',
      });

      expect(result).toBe(2);
      expect(prisma.inAppMessage.createMany).toHaveBeenCalledTimes(1);
    });

    it('空用户列表应返回 0', async () => {
      const result = await service.create({
        tenantId: 'tenant-001',
        appId: 'app-001',
        userIds: [],
        title: '测试',
        body: '内容',
      });

      expect(result).toBe(0);
    });
  });

  describe('list', () => {
    it('应返回用户的消息列表', async () => {
      prisma.inAppMessage.findMany.mockResolvedValue([makeMsg({ readAt: null })]);
      prisma.inAppMessage.count.mockResolvedValue(1);

      const result = await service.list('tenant-001', 'user-001', { page: 1, pageSize: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.title).toBe('测试标题');
    });
  });

  describe('getUnreadCount', () => {
    it('应返回未读消息数', async () => {
      prisma.inAppMessage.count.mockResolvedValue(5);

      const result = await service.getUnreadCount('tenant-001', 'user-001');

      expect(result).toBe(5);
    });
  });

  describe('markAsRead', () => {
    it('应标记单条消息为已读', async () => {
      prisma.inAppMessage.updateMany.mockResolvedValue({ count: 1 });

      await service.markAsRead('tenant-001', 'user-001', 'msg-001');

      expect(prisma.inAppMessage.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'msg-001', userId: 'user-001' }),
        }),
      );
    });
  });

  describe('markAllAsRead', () => {
    it('应标记所有未读消息为已读', async () => {
      prisma.inAppMessage.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAllAsRead('tenant-001', 'user-001');

      expect(result).toBe(3);
    });
  });
});
