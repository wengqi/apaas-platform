/**
 * 连接器服务 — 连接器 CRUD + 测试 + 调用。
 *
 * 连接器是可复用的外部 API 调用配置，支持 HTTP（出站）和 Webhook（入站）两种类型。
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { prisma } from '@apaas/db';
import { ChangeLogService } from '../application/changelog.service.js';
import { ConnectorCallService } from './connector-call.service.js';
import type {
  ConnectorType,
  ConnectorStatus,
  Connector,
  CreateConnectorRequest,
  UpdateConnectorRequest,
  InvokeConnectorRequest,
  ConnectorCallResult,
} from '@apaas/shared';

@Injectable()
export class ConnectorService {
  constructor(
    private readonly changeLogService: ChangeLogService,
    private readonly callService: ConnectorCallService,
  ) {}

  /** 列出应用下所有连接器。 */
  async list(tenantId: string, appId: string): Promise<Connector[]> {
    const connectors = await prisma.connector.findMany({
      where: { tenantId, appId },
      orderBy: { updatedAt: 'desc' },
    });
    return connectors.map((c) => this.toDto(c));
  }

  /** 获取连接器详情。 */
  async get(tenantId: string, appId: string, connectorId: string): Promise<Connector> {
    const connector = await prisma.connector.findFirst({
      where: { id: connectorId, tenantId, appId },
    });
    if (!connector) throw new NotFoundException('连接器不存在');
    return this.toDto(connector);
  }

  /** 获取连接器原始实体（供 CallService 使用，含 tenantId 等内部字段）。 */
  async getEntity(tenantId: string, connectorId: string) {
    const connector = await prisma.connector.findFirst({
      where: { id: connectorId, tenantId },
    });
    if (!connector) throw new NotFoundException('连接器不存在');
    return connector;
  }

  /** 创建连接器。 */
  async create(
    tenantId: string,
    appId: string,
    createdBy: string,
    data: CreateConnectorRequest,
  ): Promise<Connector> {
    // 校验 apiName 唯一性
    const existing = await prisma.connector.findFirst({
      where: { tenantId, appId, apiName: data.apiName },
    });
    if (existing) throw new BadRequestException(`连接器 API 名称 "${data.apiName}" 已存在`);

    // Webhook 类型自动生成 token
    const webhookToken = data.type === 'WEBHOOK' ? randomBytes(16).toString('hex') : null;

    const connector = await prisma.connector.create({
      data: {
        tenantId,
        appId,
        apiName: data.apiName,
        name: data.name,
        description: data.description,
        type: data.type,
        baseUrl: data.baseUrl,
        config: (data.config ?? {}) as object,
        credentialId: data.credentialId,
        webhookToken,
      },
    });

    await this.changeLogService.log({
      tenantId,
      appId,
      module: 'CONNECTOR',
      entityType: 'Connector',
      entityId: connector.id,
      entityName: connector.name,
      changeType: 'CREATE',
      changedBy: createdBy,
    });

    return this.toDto(connector);
  }

  /** 更新连接器。 */
  async update(
    tenantId: string,
    appId: string,
    connectorId: string,
    updatedBy: string,
    data: UpdateConnectorRequest,
  ): Promise<Connector> {
    const existing = await prisma.connector.findFirst({
      where: { id: connectorId, tenantId, appId },
    });
    if (!existing) throw new NotFoundException('连接器不存在');

    const connector = await prisma.connector.update({
      where: { id: connectorId },
      data: {
        name: data.name,
        description: data.description,
        baseUrl: data.baseUrl,
        config: data.config as object | undefined,
        credentialId: data.credentialId,
        status: data.status,
      },
    });

    await this.changeLogService.log({
      tenantId,
      appId: existing.appId,
      module: 'CONNECTOR',
      entityType: 'Connector',
      entityId: connector.id,
      entityName: connector.name,
      changeType: 'UPDATE',
      changedBy: updatedBy,
    });

    return this.toDto(connector);
  }

  /** 删除连接器。 */
  async delete(
    tenantId: string,
    appId: string,
    connectorId: string,
    deletedBy: string,
  ): Promise<void> {
    const existing = await prisma.connector.findFirst({
      where: { id: connectorId, tenantId, appId },
    });
    if (!existing) throw new NotFoundException('连接器不存在');

    await prisma.connector.delete({ where: { id: connectorId } });

    await this.changeLogService.log({
      tenantId,
      appId: existing.appId,
      module: 'CONNECTOR',
      entityType: 'Connector',
      entityId: connectorId,
      entityName: existing.name,
      changeType: 'DELETE',
      changedBy: deletedBy,
    });
  }

  /** 测试连接器（执行一次调用并返回结果）。 */
  async test(
    tenantId: string,
    appId: string,
    connectorId: string,
    params: InvokeConnectorRequest,
  ): Promise<ConnectorCallResult> {
    const connector = await this.getEntity(tenantId, connectorId);
    if (connector.appId !== appId) throw new NotFoundException('连接器不存在');
    if (connector.type !== 'HTTP') {
      throw new BadRequestException('只有 HTTP 类型的连接器支持测试');
    }
    return this.callService.invoke(connector, params);
  }

  /** 调用连接器操作。 */
  async invoke(
    tenantId: string,
    connectorId: string,
    params: InvokeConnectorRequest,
  ): Promise<ConnectorCallResult> {
    const connector = await this.getEntity(tenantId, connectorId);
    return this.callService.invoke(connector, params);
  }

  /** 通过 webhookToken 查找连接器（供 WebhookController 使用）。 */
  async findByWebhookToken(token: string) {
    const connector = await prisma.connector.findFirst({
      where: { webhookToken: token, type: 'WEBHOOK', status: 'ACTIVE' },
    });
    return connector;
  }

  /** Prisma 实体 → DTO。 */
  private toDto(c: {
    id: string;
    tenantId: string;
    appId: string;
    apiName: string;
    name: string;
    description: string | null;
    type: string;
    baseUrl: string | null;
    config: unknown;
    credentialId: string | null;
    status: string;
    webhookToken: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Connector {
    return {
      id: c.id,
      tenantId: c.tenantId,
      appId: c.appId,
      apiName: c.apiName,
      name: c.name,
      description: c.description ?? undefined,
      type: c.type as ConnectorType,
      baseUrl: c.baseUrl ?? undefined,
      config: c.config as Record<string, unknown>,
      credentialId: c.credentialId ?? undefined,
      status: c.status as ConnectorStatus,
      webhookToken: c.webhookToken ?? undefined,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
