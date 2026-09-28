/**
 * 身份对接配置服务 — 租户级 IntegrationConfig 的 CRUD。
 *
 * 敏感字段（ldap.bindPassword / hr-api.headers）以内联加密标记存储：
 *   { "__encrypted": "<aes-256-gcm base64>" }
 * 写入时加密、读取给适配器时解密、列表接口脱敏展示（仅返回"已设置"标记）。
 * 加密复用连接器的 AES-256-GCM 工具（CONNECTOR_ENCRYPTION_KEY）。
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import { prisma } from '@apaas/db';
import { encryptJson, decryptJson } from '../connector/crypto.util.js';

/** 各类型中需要加密的 config 字段路径 */
const SECRET_FIELDS: Record<string, string[]> = {
  ldap: ['bindPassword'],
  'hr-api': ['headers'],
  cas: [],
  feishu: ['appSecret'],
};

type ConfigJson = Record<string, unknown>;

function encryptField(value: unknown): { __encrypted: string } {
  return { __encrypted: encryptJson(value) };
}

function isEncryptedField(value: unknown): value is { __encrypted: string } {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>)['__encrypted'] === 'string'
  );
}

@Injectable()
export class IdentityConfigService {
  /** 写入（upsert）：加密敏感字段 */
  async upsertConfig(
    tenantId: string,
    kind: 'auth-provider' | 'directory-source',
    type: string,
    config: ConfigJson,
    isActive: boolean,
  ) {
    if (!config || typeof config !== 'object') {
      throw new BadRequestException('config 必须是对象');
    }
    const secrets = SECRET_FIELDS[type];
    if (!secrets) {
      throw new BadRequestException(`不支持的对接类型：${type}`);
    }
    const stored: ConfigJson = { ...config };
    for (const field of secrets) {
      if (field in stored && stored[field] !== undefined && stored[field] !== null) {
        // 前端回传脱敏占位符时保留原加密值
        if (stored[field] === '******') continue;
        stored[field] = encryptField(stored[field]);
      }
    }
    return prisma.integrationConfig.upsert({
      where: { tenantId_kind_type: { tenantId, kind, type } },
      create: { tenantId, kind, type, config: stored as object, isActive },
      update: { config: stored as object, isActive },
    });
  }

  /** 列表：敏感字段脱敏为 '******'（已设置标记），解密后的完整值只经 resolve* 提供给适配器 */
  async listConfigs(tenantId: string) {
    const rows = await prisma.integrationConfig.findMany({
      where: { tenantId },
      orderBy: [{ kind: 'asc' }, { type: 'asc' }],
    });
    return rows.map((row) => {
      const config = { ...(row.config as ConfigJson) };
      for (const field of SECRET_FIELDS[row.type] ?? []) {
        if (isEncryptedField(config[field])) {
          config[field] = '******';
        }
      }
      return {
        id: row.id,
        kind: row.kind,
        type: row.type,
        isActive: row.isActive,
        config,
        updatedAt: row.updatedAt,
      };
    });
  }

  /** 按租户取活跃的认证适配器配置（无则 null） */
  async resolveActiveAuthConfig(tenantId: string, type: 'cas'): Promise<CasRow | null> {
    const row = await prisma.integrationConfig.findUnique({
      where: { tenantId_kind_type: { tenantId, kind: 'auth-provider', type } },
    });
    if (!row || !row.isActive) return null;
    return { tenantId: row.tenantId, config: row.config as ConfigJson };
  }
}

/** 提供给适配器/同步服务：解密敏感字段后的完整 config（独立函数，供无 DI 场景复用） */
export function decryptConfigSecrets(type: string, rawConfig: unknown): ConfigJson {
  const config = { ...((rawConfig ?? {}) as ConfigJson) };
  for (const field of SECRET_FIELDS[type] ?? []) {
    if (isEncryptedField(config[field])) {
      config[field] = decryptJson<unknown>((config[field] as { __encrypted: string }).__encrypted);
    }
  }
  return config;
}

interface CasRow {
  tenantId: string;
  config: ConfigJson;
}
