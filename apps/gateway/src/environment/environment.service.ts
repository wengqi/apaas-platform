/**
 * 环境管理服务（R1.4）——发布=切指针 / 回滚 / Deployment 历史 / 应用环境变量。
 *
 * 治理原则（DESIGN-identity-env-versioning §1/§3.3/§3.7）：
 * - 版本快照不可变，发布只是把 AppEnvironment.currentVersionId 切到某个 AppVersion；
 * - 发布双闸：预检（必填环境变量齐全=G4 硬闸；破坏性变更=半自动警告）→ 人工动作；
 * - 回滚=指针回切+触发器重建，记录数据不回滚；
 * - G3：环境变量值修改写审计，敏感值加密落库、写后不可读仅可重置。
 */

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type {
  AppEnvironmentDto,
  DeployPreflightDto,
  DeploymentDto,
  EnvironmentKey,
  EnvVarDefDto,
  EnvVarValueDto,
} from '@apaas/shared';
import { collectEnvRefPaths } from '@apaas/shared';
import { encryptJson } from '../connector/crypto.util.js';
import { writeAudit } from '../common/audit.js';
import { EnvironmentResolverService } from './environment-resolver.service.js';

export interface DeployResult {
  environment: AppEnvironmentDto;
  deployment: DeploymentDto;
}

@Injectable()
export class EnvironmentService {
  private readonly logger = new Logger(EnvironmentService.name);

  constructor(private readonly resolver: EnvironmentResolverService) {}

  // ===========================================================================
  // 环境列表
  // ===========================================================================

  async listEnvironments(tenantId: string, appId: string): Promise<AppEnvironmentDto[]> {
    await this.resolver.ensureEnvironments(tenantId, appId);
    const envs = await prisma.appEnvironment.findMany({
      where: { appId, tenantId },
      orderBy: { key: 'desc' }, // prod 在前
    });

    const result: AppEnvironmentDto[] = [];
    for (const env of envs) {
      const currentVersion = env.currentVersionId
        ? await prisma.appVersion.findFirst({
            where: { id: env.currentVersionId, tenantId },
            select: { versionNumber: true },
          })
        : null;
      const lastDeployment = await prisma.deployment.findFirst({
        where: { environmentId: env.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      result.push({
        id: env.id,
        appId: env.appId,
        key: env.key as EnvironmentKey,
        currentVersionId: env.currentVersionId,
        currentVersionNumber: currentVersion?.versionNumber ?? null,
        lastDeployedAt: lastDeployment?.createdAt.toISOString() ?? null,
      });
    }
    return result;
  }

  /** 列出环境的发布历史（Deployment，含版本号与环境 key） */
  async listDeployments(
    tenantId: string,
    appId: string,
    envKey: EnvironmentKey,
  ): Promise<DeploymentDto[]> {
    const env = await this.getEnvironmentRow(tenantId, appId, envKey);
    const rows = await prisma.deployment.findMany({
      where: { environmentId: env.id, appId, tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { environment: { select: { key: true } } },
    });
    const result: DeploymentDto[] = [];
    for (const row of rows) {
      const version = await prisma.appVersion.findFirst({
        where: { id: row.versionId },
        select: { versionNumber: true },
      });
      result.push({
        id: row.id,
        environmentId: row.environmentId,
        environmentKey: row.environment.key as EnvironmentKey,
        versionId: row.versionId,
        versionNumber: version?.versionNumber ?? '?',
        kind: row.kind as 'deploy' | 'rollback',
        operator: row.operator,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      });
    }
    return result;
  }

  // ===========================================================================
  // 发布 / 回滚（切指针 + Deployment + 触发器重建）
  // ===========================================================================

  /**
   * 部署指定版本到指定环境（切指针）。versionId 缺省 = 该应用最新 PUBLISHED 版本。
   * 指针切换 + Deployment 写入在同一事务；触发器重建由调用方（controller 层）
   * 在事务成功后执行（BullMQ 操作不可回滚）。
   */
  async deploy(
    tenantId: string,
    appId: string,
    envKey: string,
    operator: string,
    opts?: { versionId?: string; note?: string },
  ): Promise<DeployResult> {
    await this.resolver.ensureEnvironments(tenantId, appId);
    const env = await this.getEnvironmentRow(tenantId, appId, envKey);

    const version = opts?.versionId
      ? await prisma.appVersion.findFirst({ where: { id: opts.versionId, appId, tenantId } })
      : await prisma.appVersion.findFirst({
          where: { appId, tenantId, status: 'PUBLISHED' },
          orderBy: { publishedAt: 'desc' },
        });
    if (!version) throw new NotFoundException('可部署的版本不存在');

    // G4 预检：必填环境变量齐全 + 页面不引用敏感变量
    const preflight = await this.preflight(tenantId, appId, envKey, version.id);
    if (preflight.missingRequired.length > 0) {
      throw new BadRequestException(
        `发布预检失败（G4）：必填环境变量缺失：${preflight.missingRequired.join(', ')}。请在环境管理中设置后重试。`,
      );
    }
    if (preflight.sensitivePageRefs.length > 0) {
      throw new BadRequestException(
        `发布预检失败（G4）：页面引用敏感环境变量（浏览器侧禁止携带敏感值）：${preflight.sensitivePageRefs.join('；')}。请改用连接器保管凭据，或改用非敏感变量。`,
      );
    }

    const [, deployment] = await prisma.$transaction([
      prisma.appEnvironment.update({
        where: { id: env.id },
        data: { currentVersionId: version.id },
      }),
      prisma.deployment.create({
        data: {
          tenantId,
          appId,
          environmentId: env.id,
          versionId: version.id,
          kind: 'deploy',
          operator,
          note: opts?.note ?? null,
        },
      }),
    ]);

    this.resolver.invalidateApp(appId);
    writeAudit({
      tenantId,
      userId: operator,
      action: 'ENV_DEPLOY',
      resource: 'APP_ENVIRONMENT',
      resourceId: env.id,
      appId,
      detail: { envKey, versionId: version.id, versionNumber: version.versionNumber },
    });
    this.logger.log(`部署到环境: app=${appId} env=${envKey} version=${version.versionNumber}`);

    return {
      environment: (await this.listEnvironments(tenantId, appId)).find((e) => e.key === envKey)!,
      deployment: {
        id: deployment.id,
        environmentId: deployment.environmentId,
        environmentKey: envKey as EnvironmentKey,
        versionId: deployment.versionId,
        versionNumber: version.versionNumber,
        kind: 'deploy',
        operator: deployment.operator,
        note: deployment.note,
        createdAt: deployment.createdAt.toISOString(),
      },
    };
  }

  /** 回滚：指针切回目标版本（记录数据不回滚），Deployment kind=rollback。 */
  async rollback(
    tenantId: string,
    appId: string,
    envKey: string,
    versionId: string,
    operator: string,
    note?: string,
  ): Promise<DeployResult> {
    const env = await this.getEnvironmentRow(tenantId, appId, envKey);
    const version = await prisma.appVersion.findFirst({
      where: { id: versionId, appId, tenantId },
    });
    if (!version) throw new NotFoundException('目标版本不存在');

    const [, deployment] = await prisma.$transaction([
      prisma.appEnvironment.update({
        where: { id: env.id },
        data: { currentVersionId: version.id },
      }),
      prisma.deployment.create({
        data: {
          tenantId,
          appId,
          environmentId: env.id,
          versionId: version.id,
          kind: 'rollback',
          operator,
          note: note ?? null,
        },
      }),
    ]);

    this.resolver.invalidateApp(appId);
    writeAudit({
      tenantId,
      userId: operator,
      action: 'ENV_ROLLBACK',
      resource: 'APP_ENVIRONMENT',
      resourceId: env.id,
      appId,
      detail: { envKey, versionId: version.id, versionNumber: version.versionNumber },
    });

    return {
      environment: (await this.listEnvironments(tenantId, appId)).find((e) => e.key === envKey)!,
      deployment: {
        id: deployment.id,
        environmentId: deployment.environmentId,
        environmentKey: envKey as EnvironmentKey,
        versionId: deployment.versionId,
        versionNumber: version.versionNumber,
        kind: 'rollback',
        operator: deployment.operator,
        note: deployment.note,
        createdAt: deployment.createdAt.toISOString(),
      },
    };
  }

  /** 最新已发布版本（预检/部署缺省目标） */
  async latestPublishedVersion(tenantId: string, appId: string) {
    return prisma.appVersion.findFirst({
      where: { appId, tenantId, status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
    });
  }

  /** 发布预检（G4 硬闸 + 破坏性变更/G1 引用清单半自动警告） */
  async preflight(
    tenantId: string,
    appId: string,
    envKey: string,
    versionId: string,
  ): Promise<DeployPreflightDto> {
    const env = await this.getEnvironmentRow(tenantId, appId, envKey);
    const version = await prisma.appVersion.findFirst({
      where: { id: versionId, appId, tenantId },
    });
    if (!version) throw new NotFoundException('版本不存在');

    // 1) G4：必填环境变量在该环境是否已设值
    const defs = await prisma.envVarDef.findMany({ where: { appId, tenantId, required: true } });
    const values = await prisma.envVarValue.findMany({ where: { environmentId: env.id } });
    const setDefIds = new Set(values.map((v) => v.defId));
    const missingRequired = defs.filter((d) => !setDefIds.has(d.id)).map((d) => d.key);

    // 2) 破坏性变更（半自动）：changeSet 中 DELETE 类目
    const destructiveWarnings: string[] = [];
    const changeSet = version.changeSet as {
      modules?: Array<{
        module: string;
        changes?: Array<{ changeType?: string; entityName?: string; changeDescription?: string }>;
      }>;
    } | null;
    if (changeSet?.modules) {
      for (const mod of changeSet.modules) {
        for (const change of mod.changes ?? []) {
          if (change.changeType === 'DELETE') {
            destructiveWarnings.push(
              `${mod.module} 删除：${change.entityName ?? change.changeDescription ?? '?'}`,
            );
          }
        }
      }
    }

    // 3) G1（第一版警告级）：bundle 中的 ${env.*} 引用位置清单
    const envRefWarnings = collectEnvRefPaths(version.snapshot);

    // 4) G4（对抗审查 security-02，error 级硬闸）：页面（浏览器可达面）引用 sensitive 环境变量——
    //    敏感值随页面 schema 下发浏览器即泄露，页面该走连接器取凭据；流程/节点服务端引用不受限
    const sensitiveKeys = new Set(
      (
        await prisma.envVarDef.findMany({
          where: { appId, tenantId, sensitive: true },
          select: { key: true },
        })
      ).map((d) => d.key),
    );
    const sensitivePageRefs = envRefWarnings
      .filter((p) => p.startsWith('$.pages'))
      .filter((p) => {
        const key = p.split(' → env.')[1];
        return key !== undefined && sensitiveKeys.has(key);
      });

    return {
      ok: missingRequired.length === 0 && sensitivePageRefs.length === 0,
      missingRequired,
      destructiveWarnings,
      envRefWarnings,
      sensitivePageRefs,
    };
  }

  // ===========================================================================
  // 环境变量（G2 三分类 / G3 审计与敏感值）
  // ===========================================================================

  async listEnvVars(
    tenantId: string,
    appId: string,
    envKey: string,
  ): Promise<{ defs: EnvVarDefDto[]; values: EnvVarValueDto[] }> {
    const env = await this.getEnvironmentRow(tenantId, appId, envKey);
    const defs = await prisma.envVarDef.findMany({
      where: { appId, tenantId },
      orderBy: { key: 'asc' },
    });
    const values = await prisma.envVarValue.findMany({
      where: { environmentId: env.id, tenantId },
    });
    const valueByDef = new Map(values.map((v) => [v.defId, v]));

    return {
      defs: defs.map((d) => ({
        id: d.id,
        appId: d.appId,
        key: d.key,
        description: d.description,
        required: d.required,
        sensitive: d.sensitive,
      })),
      values: defs.map((d) => {
        const v = valueByDef.get(d.id);
        return {
          id: v?.id ?? '',
          environmentId: env.id,
          defId: d.id,
          // G3：敏感值写后不可读（恒 null），仅暴露"已配置"状态
          value: v ? (d.sensitive ? null : v.value) : null,
          isSet: !!v,
          updatedBy: v?.updatedBy ?? '',
          updatedAt: v?.updatedAt.toISOString() ?? '',
        };
      }),
    };
  }

  /** 设值（敏感值 AES-256-GCM 加密；写审计 G3） */
  async setEnvVarValue(
    tenantId: string,
    appId: string,
    envKey: string,
    defId: string,
    value: string,
    userId: string,
  ): Promise<EnvVarValueDto> {
    const env = await this.getEnvironmentRow(tenantId, appId, envKey);
    const def = await prisma.envVarDef.findFirst({ where: { id: defId, appId, tenantId } });
    if (!def) throw new NotFoundException('环境变量定义不存在');

    const stored = def.sensitive ? encryptJson(value) : value;
    const saved = await prisma.envVarValue.upsert({
      where: { environmentId_defId: { environmentId: env.id, defId } },
      create: { tenantId, environmentId: env.id, defId, value: stored, updatedBy: userId },
      update: { value: stored, updatedBy: userId },
    });

    writeAudit({
      tenantId,
      userId,
      action: 'ENV_VAR_SET',
      resource: 'ENV_VAR_DEF',
      resourceId: def.id,
      appId,
      detail: { envKey, key: def.key, sensitive: def.sensitive },
    });

    return {
      id: saved.id,
      environmentId: env.id,
      defId,
      value: def.sensitive ? null : value,
      isSet: true,
      updatedBy: userId,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async createEnvVarDef(
    tenantId: string,
    appId: string,
    data: { key: string; description?: string; required?: boolean; sensitive?: boolean },
    userId: string,
  ): Promise<EnvVarDefDto> {
    const dup = await prisma.envVarDef.findFirst({ where: { appId, key: data.key, tenantId } });
    if (dup) throw new BadRequestException(`环境变量 "${data.key}" 已定义`);
    const created = await prisma.envVarDef.create({
      data: {
        tenantId,
        appId,
        key: data.key,
        description: data.description ?? null,
        required: data.required ?? false,
        sensitive: data.sensitive ?? false,
      },
    });
    writeAudit({
      tenantId,
      userId,
      action: 'ENV_VAR_DEF_CREATE',
      resource: 'ENV_VAR_DEF',
      resourceId: created.id,
      appId,
      detail: { key: data.key, required: created.required, sensitive: created.sensitive },
    });
    return {
      id: created.id,
      appId: created.appId,
      key: created.key,
      description: created.description,
      required: created.required,
      sensitive: created.sensitive,
    };
  }

  async deleteEnvVarDef(
    tenantId: string,
    appId: string,
    defId: string,
    userId: string,
  ): Promise<void> {
    const def = await prisma.envVarDef.findFirst({ where: { id: defId, appId, tenantId } });
    if (!def) throw new NotFoundException('环境变量定义不存在');
    await prisma.envVarDef.delete({ where: { id: defId } });
    writeAudit({
      tenantId,
      userId,
      action: 'ENV_VAR_DEF_DELETE',
      resource: 'ENV_VAR_DEF',
      resourceId: defId,
      appId,
      detail: { key: def.key },
    });
  }

  // ===========================================================================
  // 内部
  // ===========================================================================

  private async getEnvironmentRow(tenantId: string, appId: string, envKey: string) {
    const env = await prisma.appEnvironment.findFirst({
      where: { appId, tenantId, key: envKey },
    });
    if (!env) {
      // 兜底自愈（正常路径 ensureEnvironments 已建）
      await this.resolver.ensureEnvironments(tenantId, appId);
      const created = await prisma.appEnvironment.findFirst({
        where: { appId, tenantId, key: envKey },
      });
      if (!created) throw new NotFoundException(`环境 ${envKey} 不存在`);
      return created;
    }
    return env;
  }
}
