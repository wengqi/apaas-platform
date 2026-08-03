/**
 * 站内信控制器 — 用户查看/管理站内消息。
 *
 * 路由：
 *   GET    /api/notifications             — 消息列表（支持 unreadOnly）
 *   GET    /api/notifications/unread-count — 未读数
 *   PUT    /api/notifications/:id/read     — 标记单条已读
 *   PUT    /api/notifications/read-all     — 标记全部已读
 */

import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../application/jwt-auth.guard.js';
import { InAppMessageService } from './in-app-message.service.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class InAppMessageController {
  constructor(private readonly inAppMessageService: InAppMessageService) {}

  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const result = await this.inAppMessageService.list(
      req.user.tenantId,
      req.user.id,
      {
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
        unreadOnly: unreadOnly === 'true',
      },
    );
    return { ok: true as const, data: result };
  }

  @Get('unread-count')
  async getUnreadCount(@Req() req: AuthenticatedRequest) {
    const count = await this.inAppMessageService.getUnreadCount(
      req.user.tenantId,
      req.user.id,
    );
    return { ok: true as const, data: { count } };
  }

  @Put(':id/read')
  async markAsRead(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.inAppMessageService.markAsRead(
      req.user.tenantId,
      req.user.id,
      id,
    );
    return { ok: true as const, data: { read: true } };
  }

  @Put('read-all')
  async markAllAsRead(@Req() req: AuthenticatedRequest) {
    const count = await this.inAppMessageService.markAllAsRead(
      req.user.tenantId,
      req.user.id,
    );
    return { ok: true as const, data: { marked: count } };
  }
}
