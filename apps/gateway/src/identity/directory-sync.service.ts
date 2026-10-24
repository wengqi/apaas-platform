/**
 * 目录同步服务 — 拉取外部目录（LDAP/人力主数据）并 diff 到平台组织模型。
 *
 * - 部门 → OrgNode（code = 外部唯一键，租户内唯一）；父先子后拓扑排序
 * - 人员 → User（JIT 建号，随机密码使密码登录不可用）+ UserIdentity 绑定 + OrgMember 挂部门
 * - 离职（源中消失）→ 用户 status=DISABLED（不删除，保留审计与数据归属）
 * - 每次同步写 DirectorySyncLog；错误不中断整体（逐条容错，计数进 stats）
 */

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { prisma } from '@apaas/db';
import { invalidatePermissionCache } from '../permission/permission-cache.js';
import type { DeptRecord, UserRecord } from './external-identity.types.js';
import { LdapDirectorySource } from './sources/ldap.directory-source.js';
import { HrApiDirectorySource } from './sources/hr-api.directory-source.js';
import { decryptConfigSecrets } from './identity-config.service.js';
import type { DirectorySource, LdapConfig, HrApiConfig } from './external-identity.types.js';

export interface SyncStats {
  departments: { created: number; updated: number; total: number };
  users: { created: number; updated: number; disabled: number; conflicts: number; total: number };
  conflicts: string[];
}

@Injectable()
export class DirectorySyncService {
  private readonly logger = new Logger(DirectorySyncService.name);

  /** 按类型构建目录源（新生态=新增一个分支 + 适配器文件） */
  buildSource(type: string, rawConfig: unknown): DirectorySource {
    const config = decryptConfigSecrets(type, rawConfig);
    switch (type) {
      case 'ldap':
        return new LdapDirectorySource(config as unknown as LdapConfig);
      case 'hr-api':
        return new HrApiDirectorySource(config as unknown as HrApiConfig);
      default:
        throw new BadRequestException(`暂不支持的目录源类型：${type}`);
    }
  }

  /** 同步指定租户的指定目录源（手动触发 / 定时任务共用） */
  async syncTenant(tenantId: string, sourceType: 'ldap' | 'hr-api'): Promise<SyncStats> {
    const config = await prisma.integrationConfig.findUnique({
      where: { tenantId_kind_type: { tenantId, kind: 'directory-source', type: sourceType } },
    });
    if (!config || !config.isActive) {
      throw new BadRequestException(`目录源未启用：${sourceType}`);
    }

    const stats: SyncStats = {
      departments: { created: 0, updated: 0, total: 0 },
      users: { created: 0, updated: 0, disabled: 0, conflicts: 0, total: 0 },
      conflicts: [],
    };

    try {
      const source = this.buildSource(sourceType, config.config);
      const [departments, users] = await Promise.all([
        source.pullDepartments(),
        source.pullUsers(),
      ]);
      stats.departments.total = departments.length;
      stats.users.total = users.length;

      await this.syncDepartments(tenantId, departments, stats);
      await this.syncUsers(tenantId, sourceType, users, stats);

      await prisma.directorySyncLog.create({
        data: { tenantId, source: sourceType, status: 'success', stats },
      });
      this.logger.log(
        `目录同步完成 tenant=${tenantId} source=${sourceType} ${JSON.stringify(stats)}`,
      );
      return stats;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.directorySyncLog
        .create({ data: { tenantId, source: sourceType, status: 'error', stats, error: message } })
        .catch(() => undefined);
      this.logger.error(`目录同步失败 tenant=${tenantId} source=${sourceType}: ${message}`);
      throw error;
    }
  }

  /** 同步日志（最近 N 条，倒序） */
  async listLogs(tenantId: string, limit = 50) {
    return prisma.directorySyncLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** 部门 diff：父先子后拓扑排序后 upsert（OrgNode.code = 外部唯一键） */
  private async syncDepartments(
    tenantId: string,
    departments: DeptRecord[],
    stats: SyncStats,
  ): Promise<void> {
    const existing = await prisma.orgNode.findMany({
      where: { tenantId },
      select: { id: true, code: true, name: true, parentId: true },
    });
    const byCode = new Map(existing.map((n) => [n.code, n]));
    const resolved = new Map<string, string>(); // externalId → orgNode.id

    // 拓扑排序：无父/父已解析者先处理
    const pending = [...departments];
    const sorted: DeptRecord[] = [];
    const resolvedExternal = new Set<string>();
    while (pending.length > 0 && pending.length !== sorted.length) {
      const before = pending.length;
      for (let i = pending.length - 1; i >= 0; i--) {
        const dept = pending[i]!;
        if (dept.parentExternalId === null || resolvedExternal.has(dept.parentExternalId)) {
          sorted.push(dept);
          resolvedExternal.add(dept.externalId);
          pending.splice(i, 1);
        }
      }
      if (pending.length === before) {
        // 剩余为孤儿/循环引用：父缺失按顶层处理，避免死循环
        for (const dept of pending) {
          sorted.push({ ...dept, parentExternalId: null });
          resolvedExternal.add(dept.externalId);
        }
        pending.length = 0;
      }
    }

    for (const dept of sorted) {
      const node = byCode.get(dept.externalId);
      const parentId = dept.parentExternalId ? (resolved.get(dept.parentExternalId) ?? null) : null;
      if (node) {
        if (node.name !== dept.name || (node.parentId ?? null) !== parentId) {
          invalidatePermissionCache(tenantId);
          await prisma.orgNode.update({
            where: { id: node.id },
            data: { name: dept.name, parentId },
          });
          stats.departments.updated++;
        }
        resolved.set(dept.externalId, node.id);
      } else {
        invalidatePermissionCache(tenantId);
        const created = await prisma.orgNode.create({
          data: {
            tenantId,
            code: dept.externalId,
            name: dept.name,
            parentId,
          },
        });
        stats.departments.created++;
        resolved.set(dept.externalId, created.id);
      }
    }
  }

  /** 人员 diff：绑定存在→更新；未绑定→JIT 建号；源中消失→禁用 */
  private async syncUsers(
    tenantId: string,
    sourceType: string,
    users: UserRecord[],
    stats: SyncStats,
  ): Promise<void> {
    const identities = await prisma.userIdentity.findMany({
      where: { tenantId, provider: sourceType },
      select: { id: true, userId: true, externalId: true },
    });
    const byExternal = new Map(identities.map((i) => [i.externalId, i]));
    const seenExternal = new Set<string>();

    // 部门编码 → id（人员挂载用）
    const orgNodes = await prisma.orgNode.findMany({
      where: { tenantId },
      select: { id: true, code: true },
    });
    const orgByCode = new Map(orgNodes.map((n) => [n.code, n.id]));

    for (const user of users) {
      seenExternal.add(user.externalId);
      try {
        await this.upsertUser(
          tenantId,
          sourceType,
          user,
          byExternal.get(user.externalId),
          orgByCode,
          stats,
        );
      } catch (error) {
        // 单条容错：冲突/数据问题计数后继续，不中断整体同步
        stats.users.conflicts++;
        stats.conflicts.push(
          `${user.externalId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // 离职：绑定存在但本次源中未见 → 禁用（不删除）
    for (const identity of identities) {
      if (!seenExternal.has(identity.externalId)) {
        await prisma.user.update({
          where: { id: identity.userId },
          data: { status: 'DISABLED' },
        });
        stats.users.disabled++;
      }
    }
  }

  private async upsertUser(
    tenantId: string,
    sourceType: string,
    user: UserRecord,
    identity: { id: string; userId: string } | undefined,
    orgByCode: Map<string, string>,
    stats: SyncStats,
  ): Promise<void> {
    if (identity) {
      const orgId = user.departmentExternalId
        ? (orgByCode.get(user.departmentExternalId) ?? null)
        : null;
      await prisma.user.update({
        where: { id: identity.userId },
        data: {
          name: user.name,
          ...(user.email ? { email: user.email } : {}),
          status: 'ACTIVE', // 在源中出现即视为在职（覆盖上次误禁用）
        },
      });
      if (orgId) {
        await prisma.orgMember
          .upsert({
            where: { userId_orgId: { userId: identity.userId, orgId } },
            create: { userId: identity.userId, orgId },
            update: {},
          })
          .catch(() => undefined);
      }
      await prisma.userIdentity.update({
        where: { id: identity.id },
        data: { lastSyncAt: new Date() },
      });
      stats.users.updated++;
      return;
    }

    // JIT 建号：邮箱冲突（同租户已被他人占用）→ 记冲突不建号（不自动绑定他人账号）
    const email = user.email ?? `${user.externalId}@identity.local`;
    const emailTaken = await prisma.user.findFirst({ where: { tenantId, email } });
    if (emailTaken) {
      throw new Error(`邮箱冲突：${email} 已被占用`);
    }
    // 随机密码：SSO 场景密码登录不可用（bcrypt 哈希后无法逆推）
    const randomSecret = bcrypt.hashSync(Math.random().toString(36) + Date.now(), 10);
    const created = await prisma.user.create({
      data: {
        tenantId,
        email,
        name: user.name,
        passwordHash: randomSecret,
        status: 'ACTIVE',
      },
    });
    await prisma.userIdentity.create({
      data: {
        tenantId,
        userId: created.id,
        provider: sourceType,
        externalId: user.externalId,
        lastSyncAt: new Date(),
      },
    });
    const orgId = user.departmentExternalId
      ? (orgByCode.get(user.departmentExternalId) ?? null)
      : null;
    if (orgId) {
      invalidatePermissionCache(tenantId);
      await prisma.orgMember.create({ data: { userId: created.id, orgId } }).catch(() => undefined);
    }
    stats.users.created++;
  }
}
