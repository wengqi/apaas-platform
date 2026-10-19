/**
 * 凭证服务 — 连接器凭证 CRUD + 加解密。
 *
 * 凭证数据通过 AES-256-GCM 加密后存储在 Prisma Json 字段中。
 * 列表 API 只返回元信息（id/name/type），不返回加密数据。
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import { encryptJson, decryptJson } from './crypto.util.js';
import type {
  CredentialType,
  BasicCredentialData,
  ApiKeyCredentialData,
  BearerCredentialData,
  OAuth2CredentialData,
} from '@apaas/shared';

export interface CreateCredentialInput {
  name: string;
  type: CredentialType;
  data: BasicCredentialData | ApiKeyCredentialData | BearerCredentialData | OAuth2CredentialData;
}

export interface UpdateCredentialInput {
  name?: string;
  data?: BasicCredentialData | ApiKeyCredentialData | BearerCredentialData | OAuth2CredentialData;
}

@Injectable()
export class CredentialService {
  /** 列出应用下所有凭证（不含敏感数据）。 */
  async list(tenantId: string, appId: string) {
    const credentials = await prisma.connectorCredential.findMany({
      where: { tenantId, appId },
      orderBy: { updatedAt: 'desc' },
    });
    return credentials.map((c) => ({
      id: c.id,
      tenantId: c.tenantId,
      appId: c.appId,
      name: c.name,
      type: c.type as CredentialType,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  /** 创建凭证。 */
  async create(tenantId: string, appId: string, data: CreateCredentialInput) {
    this.validateCredentialData(data.type, data.data);
    const encrypted = encryptJson(data.data);
    const credential = await prisma.connectorCredential.create({
      data: {
        tenantId,
        appId,
        name: data.name,
        type: data.type,
        data: encrypted,
      },
    });
    return {
      id: credential.id,
      tenantId: credential.tenantId,
      appId: credential.appId,
      name: credential.name,
      type: credential.type as CredentialType,
      createdAt: credential.createdAt.toISOString(),
      updatedAt: credential.updatedAt.toISOString(),
    };
  }

  /** 更新凭证。 */
  async update(tenantId: string, appId: string, credentialId: string, data: UpdateCredentialInput) {
    const existing = await prisma.connectorCredential.findFirst({
      where: { id: credentialId, tenantId, appId },
    });
    if (!existing) throw new NotFoundException('凭证不存在');

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.data !== undefined) {
      this.validateCredentialData(existing.type as CredentialType, data.data);
      updateData.data = encryptJson(data.data);
    }

    const credential = await prisma.connectorCredential.update({
      where: { id: credentialId },
      data: updateData,
    });
    return {
      id: credential.id,
      tenantId: credential.tenantId,
      appId: credential.appId,
      name: credential.name,
      type: credential.type as CredentialType,
      createdAt: credential.createdAt.toISOString(),
      updatedAt: credential.updatedAt.toISOString(),
    };
  }

  /** 删除凭证。 */
  async delete(tenantId: string, appId: string, credentialId: string) {
    const existing = await prisma.connectorCredential.findFirst({
      where: { id: credentialId, tenantId, appId },
    });
    if (!existing) throw new NotFoundException('凭证不存在');

    // 检查是否有连接器正在使用
    const connectors = await prisma.connector.findMany({
      where: { credentialId, tenantId },
      select: { id: true, name: true },
    });
    if (connectors.length > 0) {
      throw new BadRequestException(
        `凭证正在被 ${connectors.length} 个连接器使用：${connectors.map((c) => c.name).join(', ')}`,
      );
    }

    await prisma.connectorCredential.delete({ where: { id: credentialId } });
  }

  /** 解密凭证数据（供 ConnectorCallService 内部使用）。 */
  async decrypt(
    tenantId: string,
    credentialId: string,
  ): Promise<BasicCredentialData | ApiKeyCredentialData | BearerCredentialData> {
    const credential = await prisma.connectorCredential.findFirst({
      where: { id: credentialId, tenantId },
    });
    if (!credential) throw new NotFoundException('凭证不存在');
    const encrypted = credential.data as string;
    return decryptJson(encrypted);
  }

  /** 校验凭证数据格式。 */
  private validateCredentialData(
    type: CredentialType,
    data: BasicCredentialData | ApiKeyCredentialData | BearerCredentialData | OAuth2CredentialData,
  ) {
    switch (type) {
      case 'BASIC': {
        const d = data as BasicCredentialData;
        if (!d.username || !d.password) {
          throw new BadRequestException('Basic Auth 凭证需要 username 和 password');
        }
        break;
      }
      case 'API_KEY': {
        const d = data as ApiKeyCredentialData;
        if (!d.headerName || !d.apiKey) {
          throw new BadRequestException('API Key 凭证需要 headerName 和 apiKey');
        }
        break;
      }
      case 'BEARER': {
        const d = data as BearerCredentialData;
        if (!d.token) {
          throw new BadRequestException('Bearer Token 凭证需要 token');
        }
        break;
      }
      case 'OAUTH2': {
        const d = data as OAuth2CredentialData;
        if (!d.tokenUrl || !d.clientId || !d.clientSecret) {
          throw new BadRequestException('OAuth2 凭证需要 tokenUrl、clientId 和 clientSecret');
        }
        break;
      }
      default:
        throw new BadRequestException(`不支持的凭证类型：${type}`);
    }
  }
}
