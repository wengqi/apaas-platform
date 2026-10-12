/**
 * 站内信服务 — 站内消息 CRUD、未读数查询、标记已读。
 *
 * 流程通知节点 in_app 渠道写入消息，用户在运行时前端查看。
 */

import { Injectable } from '@nestjs/common';
import { prisma } from '@apaas/db';

@Injectable()
export class InAppMessageService {
  /**
   * 创建站内消息（支持批量收件人）。
   * link（2026-10-12 评审 P0）：可选深链（如 /app/:id、/tasks），运行时通知中心
   * 点击跳转——修复"驳回消息只能标已读不能行动"。
   */
  async create(params: {
    tenantId: string;
    appId: string;
    userIds: string[];
    title: string;
    body: string;
    link?: string;
  }): Promise<number> {
    if (params.userIds.length === 0) return 0;

    const result = await prisma.inAppMessage.createMany({
      data: params.userIds.map((userId) => ({
        tenantId: params.tenantId,
        appId: params.appId,
        userId,
        title: params.title,
        body: params.body,
        link: params.link ?? null,
      })),
    });

    return result.count;
  }

  /**
   * 获取用户的站内消息列表（分页）。
   */
  async list(
    tenantId: string,
    userId: string,
    options?: { page?: number; pageSize?: number; unreadOnly?: boolean },
  ) {
    const page = Math.max(1, options?.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, options?.pageSize ?? 20));

    const where: Record<string, unknown> = { tenantId, userId };
    if (options?.unreadOnly) {
      where.read = false;
    }

    const [items, total] = await Promise.all([
      prisma.inAppMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.inAppMessage.count({ where }),
    ]);

    return {
      items: items.map((m) => ({
        id: m.id,
        title: m.title,
        body: m.body,
        link: m.link,
        read: m.read,
        createdAt: m.createdAt.toISOString(),
        readAt: m.readAt?.toISOString() ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 获取未读消息数。
   */
  async getUnreadCount(tenantId: string, userId: string): Promise<number> {
    return prisma.inAppMessage.count({
      where: { tenantId, userId, read: false },
    });
  }

  /**
   * 标记单条消息为已读。
   */
  async markAsRead(tenantId: string, userId: string, messageId: string): Promise<void> {
    await prisma.inAppMessage.updateMany({
      where: { id: messageId, tenantId, userId },
      data: { read: true, readAt: new Date() },
    });
  }

  /**
   * 标记所有消息为已读。
   */
  async markAllAsRead(tenantId: string, userId: string): Promise<number> {
    const result = await prisma.inAppMessage.updateMany({
      where: { tenantId, userId, read: false },
      data: { read: true, readAt: new Date() },
    });
    return result.count;
  }
}
