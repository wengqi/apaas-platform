/**
 * ApiKeyService（G6 服务身份）——入站 API Key 的生成/校验/吊销。
 *
 * 安全设计：
 * - 完整 key = `ak_` + 24 字节随机 hex（192 位熵）；明文仅创建响应返回一次
 * - 库中仅存 sha256(key)（unique 索引直查）；库泄露不泄露凭证
 * - 校验失败统一 401 脱敏（不区分不存在/吊销）
 * - lastUsedAt fire-and-forget 更新（不阻塞请求路径）
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@apaas/db';
import type { ServiceIdentityDto, ServiceIdentityCreatedDto } from '@apaas/shared';
import { writeAudit } from '../common/audit.js';

/** 合成请求身份（TenantContextInterceptor/requireTenantId 消费） */
export interface ServiceIdentityUser {
  id: string;
  tenantId: string;
  isSuperAdmin: false;
  serviceIdentityId: string;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

@Injectable()
export class ApiKeyService {
  /** 生成新身份：明文 key 仅此一次返回。 */
  async create(
    tenantId: string,
    userId: string,
    data: { name: string; appId?: string | null },
  ): Promise<ServiceIdentityCreatedDto> {
    const apiKey = `ak_${randomBytes(24).toString('hex')}`;
    const row = await prisma.serviceIdentity.create({
      data: {
        tenantId,
        appId: data.appId ?? null,
        name: data.name,
        keyPrefix: apiKey.slice(0, 12),
        keyHash: sha256(apiKey),
        createdBy: userId,
      },
    });
    writeAudit({
      tenantId,
      userId,
      action: 'SERVICE_IDENTITY_CREATE',
      resource: 'SERVICE_IDENTITY',
      resourceId: row.id,
      appId: data.appId ?? null,
      detail: { name: data.name, keyPrefix: row.keyPrefix },
    });
    return { ...this.toDto(row), apiKey };
  }

  async list(tenantId: string, appId?: string | null): Promise<ServiceIdentityDto[]> {
    const rows = await prisma.serviceIdentity.findMany({
      where: { tenantId, ...(appId ? { appId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async revoke(tenantId: string, userId: string, identityId: string): Promise<ServiceIdentityDto> {
    const row = await prisma.serviceIdentity.update({
      where: { id: identityId, tenantId },
      data: { status: 'REVOKED' },
    });
    writeAudit({
      tenantId,
      userId,
      action: 'SERVICE_IDENTITY_REVOKE',
      resource: 'SERVICE_IDENTITY',
      resourceId: identityId,
      appId: row.appId,
      detail: { name: row.name },
    });
    return this.toDto(row);
  }

  /**
   * 校验 API Key → 合成请求身份（失败统一 401 脱敏）。
   */
  async verify(apiKey: string): Promise<ServiceIdentityUser> {
    if (!apiKey || !apiKey.startsWith('ak_')) {
      throw new UnauthorizedException('无效的 API Key');
    }
    const row = await prisma.serviceIdentity.findUnique({
      where: { keyHash: sha256(apiKey) },
    });
    if (!row || row.status !== 'ACTIVE') {
      throw new UnauthorizedException('无效的 API Key');
    }
    // fire-and-forget：最后使用时间
    void prisma.serviceIdentity
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return {
      id: row.id,
      tenantId: row.tenantId,
      isSuperAdmin: false,
      serviceIdentityId: row.id,
    };
  }

  private toDto(row: {
    id: string;
    tenantId: string;
    appId: string | null;
    name: string;
    keyPrefix: string;
    status: string;
    lastUsedAt: Date | null;
    createdBy: string;
    createdAt: Date;
  }): ServiceIdentityDto {
    return {
      id: row.id,
      tenantId: row.tenantId,
      appId: row.appId,
      name: row.name,
      keyPrefix: row.keyPrefix,
      status: row.status as ServiceIdentityDto['status'],
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
