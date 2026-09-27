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
  ForbiddenException,
  HttpCode,
  Param,
  Req,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { prisma, runWithTenant } from '@apaas/db';
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

    // 2.5 评审 M-5：可选 HMAC-SHA256 签名 + 时间戳防重放。
    // 配置 webhookSecret 后强制校验 X-Apaas-Signature（hex）与 X-Apaas-Timestamp（毫秒）。
    if (config.webhookSecret) {
      const signature = req.headers['x-apaas-signature'] as string | undefined;
      const timestamp = req.headers['x-apaas-timestamp'] as string | undefined;
      const ts = Number(timestamp);
      if (!signature || !timestamp || !Number.isFinite(ts)) {
        throw new ForbiddenException('缺少签名或时间戳头');
      }
      // 时间戳窗口 5 分钟——超窗直接拒绝（防重放）
      if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
        throw new ForbiddenException('时间戳超出允许窗口（疑似重放）');
      }
      const maybeRaw = (req as unknown as { rawBody?: Buffer }).rawBody;
      const rawBody = Buffer.isBuffer(maybeRaw)
        ? maybeRaw
        : Buffer.from(JSON.stringify(body ?? {}));
      const expected = createHmac('sha256', config.webhookSecret).update(rawBody).digest('hex');
      const a = Buffer.from(signature, 'hex');
      const b = Buffer.from(expected, 'hex');
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new ForbiddenException('签名校验失败');
      }
    }

    // Webhook 是公开端点（无 JWT），需从 connector 记录恢复租户上下文
    return runWithTenant(connector.tenantId, async () => {
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
    });
  }
}
