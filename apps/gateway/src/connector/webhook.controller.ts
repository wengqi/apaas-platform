/**
 * Webhook 接收器 — 公开端点，通过 URL token 验证。
 *
 * 路由：
 *   ANY /api/webhooks/:token — 接收外部请求，触发关联流程
 *
 * 外部系统通过 POST /api/webhooks/{token} 调用，
 * 将请求 body/method/headers 作为触发上下文启动流程。
 */

import {
  All,
  Body,
  Controller,
  HttpCode,
  Param,
  Req,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { prisma } from '@apaas/db';
import { ConnectorService } from './connector.service.js';
import { ProcessService } from '../process/process.service.js';
import type { WebhookConnectorConfig } from '@apaas/shared';

@ApiTags('Webhook')
@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly connectorService: ConnectorService,
    private readonly processService: ProcessService,
  ) {}

  @All(':token')
  @HttpCode(200)
  async receive(@Param('token') token: string, @Req() req: Request, @Body() body: unknown) {
    // 1. 查找 webhookToken 匹配的连接器
    const connector = await this.connectorService.findByWebhookToken(token);
    if (!connector) {
      throw new NotFoundException('Webhook 不存在或已失效');
    }

    // 2. 验证请求方法是否在 allowedMethods 中
    const config = (connector.config ?? {}) as unknown as WebhookConnectorConfig;
    const allowedMethods = config.allowedMethods ?? ['POST'];
    if (!allowedMethods.includes(req.method)) {
      throw new BadRequestException(`Webhook 不允许 ${req.method} 方法`);
    }

    // 3. 查找该应用下 triggerType 为 WEBHOOK 的已发布流程
    const processes = await prisma.processDef.findMany({
      where: {
        tenantId: connector.tenantId,
        appId: connector.appId,
        triggerType: 'WEBHOOK',
        status: 'PUBLISHED',
      },
      select: { id: true, name: true },
    });

    if (processes.length === 0) {
      return {
        ok: true as const,
        data: {
          message: 'Webhook 已接收，但未找到已发布的 Webhook 触发流程',
          connectorId: connector.id,
        },
      };
    }

    // 4. 启动流程实例（将请求信息作为触发上下文）
    const triggerContext = {
      triggerType: 'WEBHOOK',
      triggeredBy: 'WEBHOOK',
      connectorId: connector.id,
      connectorName: connector.name,
      httpMethod: req.method,
      httpHeaders: req.headers as Record<string, string>,
      body: body ?? {},
    };

    const instances = await Promise.all(
      processes.map(async (p) => {
        const instance = await this.processService.startInstance(connector.tenantId, p.id, {
          variables: { webhook: triggerContext },
        });
        return { processId: p.id, processName: p.name, instanceId: instance.id };
      }),
    );

    return {
      ok: true as const,
      data: {
        message: `Webhook 触发成功，启动了 ${instances.length} 个流程`,
        instances,
      },
    };
  }
}
