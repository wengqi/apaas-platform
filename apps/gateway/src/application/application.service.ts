import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { prisma, Prisma } from '@apaas/db';
import {
  asAppId,
  asTenantId,
  asUserId,
  type Application,
  type AppSummary,
  type AppStatus,
  type CreateAppRequest,
  type UpdateAppRequest,
  type PublishAppRequest,
  type AppVersion,
  type AppVersionSummary,
  type CheckResult,
  type ChangeSet,
  type AppCheckRecord,
} from '@apaas/shared';
import { SnapshotService } from './snapshot.service.js';
import { CheckService } from './check.service.js';
import { ChangeLogService } from './changelog.service.js';
import { TriggerService } from '../process/trigger.service.js';
import { writeAudit } from '../common/audit.js';
import { EnvironmentService } from '../environment/environment.service.js';
import { PermissionService } from '../permission/permission.service.js';
import { AppAccessService } from '../app-access/app-access.service.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';

/** 应用详情响应：shared Application + 资源统计（GET /design/apps/:appId 与 GET /apps/:appId 共用）。 */
export type ApplicationDetail = Application & { stats: AppSummary['stats'] };

/**
 * 应用服务 — Application CRUD + 发布/回滚/版本管理。
 * 对标飞书 aPaaS：应用是顶层业务容器，包含对象/页面/流程/权限。
 */
@Injectable()
export class ApplicationService {
  constructor(
    private readonly snapshotService: SnapshotService,
    private readonly checkService: CheckService,
    private readonly changeLogService: ChangeLogService,
    private readonly triggerService: TriggerService,
    private readonly environmentService: EnvironmentService,
    private readonly permissionService: PermissionService,
    private readonly appAccess: AppAccessService,
  ) {}

  /** 评审整改：类内日志器（不作为 DI 依赖） */
  private readonly logger = new Logger(ApplicationService.name);

  /**
   * 设计面列应用（GET /design/apps）— 搭建者归属可见集（ADR-0005）：
   * 管理员全量（含他人 DRAFT）；搭建者只见自己为 OWNER/MEMBER 的应用。
   * 每项附 myRole（卡片据此显示「由 {ownerName} 共享」）与 OWNER 姓名。
   */
  async listForDesign(tenantId: string, user: AuthenticatedUser): Promise<AppSummary[]> {
    const visible = await this.appAccess.visibleAppIds(user, tenantId);
    if (visible !== 'all' && visible.length === 0) return [];

    const apps = await prisma.application.findMany({
      where: { tenantId, ...(visible === 'all' ? {} : { id: { in: visible } }) },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { objects: true, pages: true, processes: true },
        },
      },
    });
    if (apps.length === 0) return [];

    const [owners, myRoles] = await Promise.all([
      prisma.applicationMember.findMany({
        where: { tenantId, appId: { in: apps.map((a) => a.id) }, role: 'OWNER' },
        select: { appId: true, user: { select: { name: true } } },
      }),
      this.appAccess.membershipRoles(user, tenantId),
    ]);
    const ownerNameByApp = new Map(owners.map((o) => [o.appId, o.user.name]));
    return apps.map((app) => ({
      ...this.toSummary(app, ownerNameByApp.get(app.id)),
      myRole: user.isSuperAdmin ? 'admin' : myRoles.get(app.id),
    }));
  }

  /**
   * 运行时可见应用集归纳（GET /apps 与 GET /apps/:appId 共用，单次规则查询；
   * 不做逐应用 explain 的 N 次查询）：
   * - 管理员短路（isSuperAdmin = 平台超管或 TENANT_ADMIN，与 PermissionService/jwt.strategy
   *   同源）→ 'all'；
   * - 用户有效角色集（直接+组织授权+扩散，复用 PermissionService.getUserRoleIds）名下存在
   *   租户级 ALLOW 规则（appId=null，种子 END_USER/BUILDER 通配即此类）→ 'all'
   *   （R5 裁决①：种子通配维持，终端用户开箱可见全部已发布应用）；
   * - 否则仅 appId 命中角色 ALLOW 规则的应用（R4 应用级角色语义）；无角色/无命中 → []（默认拒绝）。
   */
  private async resolveRuntimeVisibleAppIds(
    tenantId: string,
    user: AuthenticatedUser,
  ): Promise<'all' | string[]> {
    if (user.isSuperAdmin) return 'all';
    const roleIds = await this.permissionService.getUserRoleIds(user.id, tenantId);
    if (roleIds.length === 0) return [];
    const rules = await prisma.permissionRule.findMany({
      where: { tenantId, roleId: { in: roleIds }, effect: 'ALLOW' },
      select: { appId: true },
    });
    if (rules.some((r) => r.appId === null)) return 'all';
    return [...new Set(rules.map((r) => r.appId).filter((v): v is string => v !== null))];
  }

  /**
   * 运行时视图列应用（GET /apps）— 终端用户语义：仅返回【已发布】且【当前用户有权限】的应用。
   *
   * "已发布"用 Application.status='PUBLISHED' 判定（与前端既有客户端过滤、e2e 断言一致），
   * 不用 prod 环境指针——publish 事务后 deploy 失败可容忍（仅告警），指针判定会漏掉这部分应用。
   */
  async listVisibleForUser(tenantId: string, user: AuthenticatedUser): Promise<AppSummary[]> {
    const visible = await this.resolveRuntimeVisibleAppIds(tenantId, user);
    if (visible !== 'all' && visible.length === 0) return [];

    // isInternal=false（2026-10-12 评审 P0）：E2E/QA 夹具等内部应用不进业务用户运行时门户
    const where: Prisma.ApplicationWhereInput = {
      tenantId,
      status: 'PUBLISHED',
      isInternal: false,
      ...(visible === 'all' ? {} : { id: { in: visible } }),
    };

    const apps = await prisma.application.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { objects: true, pages: true, processes: true },
        },
      },
    });
    // 维护者姓名（2026-10-13 素蓝设计轮）：业务端卡片展示 v版本 · 维护者
    const creatorIds = [...new Set(apps.map((a) => a.createdBy))];
    const creators = await prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(creators.map((u) => [u.id, u.name]));
    return apps.map((app) => this.toSummary(app, nameById.get(app.createdBy)));
  }

  /**
   * 运行时读单个应用（GET /apps/:appId）— 与 listVisibleForUser 同一可见性归纳。
   * 未发布或无权限一律 404：运行时视角该应用尚不存在，不区分"存在但无权"。
   * 不过滤 isInternal：内部应用只是不进门户列表，直链（e2e/QA 夹具）仍可打开。
   */
  async getVisibleForUser(
    tenantId: string,
    user: AuthenticatedUser,
    appId: string,
  ): Promise<ApplicationDetail> {
    const visible = await this.resolveRuntimeVisibleAppIds(tenantId, user);
    if (visible !== 'all' && !visible.includes(appId)) {
      throw new NotFoundException('应用不存在');
    }
    const app = await prisma.application.findFirst({
      where: { id: appId, tenantId, status: 'PUBLISHED' },
      include: {
        _count: {
          select: { objects: true, pages: true, processes: true },
        },
      },
    });
    if (!app) throw new NotFoundException('应用不存在');
    return this.toApplication(app);
  }

  /** Prisma 实体 → AppSummary（list / listVisibleForUser 共用投影）。 */
  private toSummary(
    app: {
      id: string;
      apiName: string;
      name: string;
      description: string | null;
      icon: string | null;
      color: string | null;
      group?: string | null;
      status: string;
      version: number;
      createdAt: Date;
      updatedAt: Date;
      _count: { objects: number; pages: number; processes: number };
    },
    ownerName?: string,
  ): AppSummary {
    return {
      id: asAppId(app.id),
      apiName: app.apiName,
      name: app.name,
      description: app.description ?? undefined,
      icon: app.icon ?? undefined,
      color: app.color ?? undefined,
      group: app.group ?? undefined,
      ownerName,
      status: app.status as AppStatus,
      version: app.version,
      stats: {
        objects: app._count.objects,
        pages: app._count.pages,
        processes: app._count.processes,
      },
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
    };
  }

  /**
   * 获取单个应用详情 — 设计面 GET /design/apps/:appId（含 DRAFT/ARCHIVED）。
   */
  async get(tenantId: string, appId: string): Promise<ApplicationDetail> {
    const app = await prisma.application.findFirst({
      where: { id: appId, tenantId },
      include: {
        _count: {
          select: { objects: true, pages: true, processes: true },
        },
      },
    });
    if (!app) throw new NotFoundException('应用不存在');
    return this.toApplication(app);
  }

  /** Prisma 实体 → Application DTO（get / getVisibleForUser 共用投影）。 */
  private toApplication(app: {
    id: string;
    tenantId: string;
    apiName: string;
    name: string;
    description: string | null;
    icon: string | null;
    color: string | null;
    status: string;
    version: number;
    publishedAt: Date | null;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    _count: { objects: number; pages: number; processes: number };
  }): ApplicationDetail {
    return {
      id: asAppId(app.id),
      tenantId: asTenantId(app.tenantId),
      apiName: app.apiName,
      name: app.name,
      description: app.description ?? undefined,
      icon: app.icon ?? undefined,
      color: app.color ?? undefined,
      status: app.status as AppStatus,
      version: app.version,
      publishedAt: app.publishedAt?.toISOString(),
      createdBy: asUserId(app.createdBy),
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
      stats: {
        objects: app._count.objects,
        pages: app._count.pages,
        processes: app._count.processes,
      },
    };
  }

  /**
   * 创建应用 — apiName 自动生成（若未传入）。
   */
  /**
   * 分组管理（2026-10-13 素蓝首页）：重命名（from→to）或删除分组（to 空 → 移入未分组）。
   * 分组是应用上的自由文本，无独立实体——管理即批量改写；
   * 改写范围收口到调用者的归属可见集（ADR-0005）：搭建者改分组名不连带他人应用。
   */
  async updateGroup(
    tenantId: string,
    user: AuthenticatedUser,
    from: string,
    to?: string,
  ): Promise<{ updated: number }> {
    const target = to?.trim();
    if (!from.trim()) throw new BadRequestException('现分组名不能为空');
    if (target && target === from) return { updated: 0 };
    const visible = await this.appAccess.visibleAppIds(user, tenantId);
    if (visible !== 'all' && visible.length === 0) return { updated: 0 };
    const result = await prisma.application.updateMany({
      where: { tenantId, group: from, ...(visible === 'all' ? {} : { id: { in: visible } }) },
      data: { group: target || null },
    });
    this.logger.log(`分组「${from}」→「${target || '未分组'}」：更新 ${result.count} 个应用`);
    return { updated: result.count };
  }

  async create(tenantId: string, createdBy: string, req: CreateAppRequest): Promise<Application> {
    const apiName = req.apiName || this.generateApiName();

    // P1-08（对抗审查 R1-devil-03，ADR-0005 决策 7）：应用创建与 OWNER 行授予
    // 同事务——此前非事务，故障窗口产生的应用无主（创建者本人 403）。
    const app = await prisma.$transaction(async (tx) => {
      const created = await tx.application.create({
        data: {
          tenantId,
          apiName,
          name: req.name,
          description: req.description,
          icon: req.icon,
          color: req.color,
          group: req.group,
          status: 'DRAFT',
          version: 0,
          createdBy,
        },
      });
      // ADR-0005：创建人即应用 OWNER（归属以成员表为准，createdBy 仅保留历史创建人语义）
      await this.appAccess.grantOwner(tenantId, created.id, createdBy, tx);
      return created;
    });

    // 记录变更日志
    await this.changeLogService.log({
      tenantId,
      appId: app.id,
      module: 'APPLICATION',
      entityType: 'Application',
      entityId: app.id,
      entityName: req.name,
      changeType: 'CREATE',
      changedBy: createdBy,
      changeDescription: '新建应用',
    });

    return this.get(tenantId, app.id);
  }

  /**
   * 更新应用。
   */
  async update(
    tenantId: string,
    appId: string,
    req: UpdateAppRequest,
    changedBy?: string,
  ): Promise<Application> {
    const existing = await prisma.application.findFirst({
      where: { id: appId, tenantId },
      select: { name: true },
    });
    if (!existing) throw new NotFoundException('应用不存在');

    await prisma.application.updateMany({
      where: { id: appId, tenantId },
      data: {
        name: req.name,
        description: req.description,
        icon: req.icon,
        color: req.color,
        group: req.group,
      },
    });

    await this.changeLogService.log({
      tenantId,
      appId,
      module: 'APPLICATION',
      entityType: 'Application',
      entityId: appId,
      entityName: req.name ?? existing.name,
      changeType: 'UPDATE',
      changedBy: changedBy ?? 'system',
      changeDescription: `更新应用: ${req.name ?? existing.name}`,
    });

    return this.get(tenantId, appId);
  }

  /**
   * 归档应用 — 冻结运行态入口，在途流程仍可继续完成。
   * 仅 PUBLISHED 状态可归档。
   */
  async archive(tenantId: string, appId: string, archivedBy: string): Promise<Application> {
    const app = await prisma.application.findFirst({
      where: { id: appId, tenantId },
      select: { id: true, name: true, status: true },
    });
    if (!app) throw new NotFoundException('应用不存在');
    if (app.status === 'ARCHIVED') {
      throw new BadRequestException('应用已归档');
    }
    if (app.status !== 'PUBLISHED') {
      throw new BadRequestException('仅已发布的应用可归档');
    }

    await prisma.application.update({
      where: { id: appId },
      data: { status: 'ARCHIVED' },
    });

    await this.changeLogService.log({
      tenantId,
      appId,
      module: 'APPLICATION',
      entityType: 'Application',
      entityId: appId,
      entityName: app.name,
      changeType: 'UPDATE',
      changedBy: archivedBy,
      changeDescription: `归档应用: ${app.name}`,
    });

    return this.get(tenantId, appId);
  }

  /**
   * 删除应用。
   * - DRAFT：可直接删除（无运行态数据）
   * - PUBLISHED：不可直接删除，需先归档
   * - ARCHIVED：检查是否有在途流程实例，有则阻止删除
   */
  async delete(tenantId: string, appId: string, changedBy?: string): Promise<void> {
    const existing = await prisma.application.findFirst({
      where: { id: appId, tenantId },
      select: { id: true, name: true, status: true },
    });
    if (!existing) throw new NotFoundException('应用不存在');

    // 已发布应用不可直接删除，需先归档
    if (existing.status === 'PUBLISHED') {
      throw new BadRequestException('已发布的应用不可直接删除，请先归档');
    }

    // 已归档应用：检查是否有在途流程实例
    if (existing.status === 'ARCHIVED') {
      const activeInstances = await prisma.processInstance.count({
        where: {
          tenantId,
          processDef: { appId },
          status: { in: ['RUNNING', 'WAITING_USER_TASK'] },
        },
      });
      if (activeInstances > 0) {
        throw new BadRequestException(
          `应用下有 ${activeInstances} 个在途流程实例，无法删除。请等待流程完成后再删除。`,
        );
      }
    }

    const result = await prisma.application.deleteMany({
      where: { id: appId, tenantId },
    });
    if (result.count === 0) throw new NotFoundException('应用不存在');

    await this.changeLogService.log({
      tenantId,
      appId,
      module: 'APPLICATION',
      entityType: 'Application',
      entityId: appId,
      entityName: existing.name,
      changeType: 'DELETE',
      changedBy: changedBy ?? 'system',
      changeDescription: `删除应用: ${existing.name}`,
    });
  }

  // ===========================================================================
  // 发布相关
  // ===========================================================================

  /**
   * 执行预检。
   */
  async check(tenantId: string, appId: string, checkedBy: string): Promise<CheckResult> {
    return this.checkService.check(tenantId, appId, checkedBy);
  }

  /**
   * 获取预检记录列表。
   */
  async listChecks(tenantId: string, appId: string): Promise<AppCheckRecord[]> {
    const checks = await prisma.appCheck.findMany({
      where: { tenantId, appId },
      orderBy: { checkedAt: 'desc' },
      take: 20,
    });
    return checks.map((c) => ({
      id: c.id,
      appId: asAppId(c.appId),
      result: c.result as 'PASS' | 'FAIL',
      issues: (c.issues as CheckResult['issues']) ?? null,
      checkedBy: asUserId(c.checkedBy),
      checkedAt: c.checkedAt.toISOString(),
    }));
  }

  /**
   * 获取未发布的变更清单。
   */
  async getChanges(tenantId: string, appId: string): Promise<ChangeSet> {
    return this.changeLogService.getChangeSet(tenantId, appId);
  }

  /**
   * 发布应用 — 核心方法。
   * 1. 预检 → 2. 收集快照 → 3. 生成变更清单 → 4. 事务写入版本+更新应用状态 → 5. 同步子资源
   */
  async publish(
    tenantId: string,
    appId: string,
    publishedBy: string,
    req: PublishAppRequest,
  ): Promise<AppVersion> {
    // 1. 验证版本号格式
    if (!/^\d+\.\d+\.\d+$/.test(req.version)) {
      throw new BadRequestException('版本号格式不正确，应为 x.y.z 格式');
    }

    // 2. 检查版本号是否已存在
    const existing = await prisma.appVersion.findFirst({
      where: { appId, versionNumber: req.version },
    });
    if (existing) {
      throw new BadRequestException(`版本号 ${req.version} 已存在`);
    }

    // 3. 执行预检
    const checkResult = await this.checkService.check(tenantId, appId, publishedBy);
    if (checkResult.status === 'FAIL') {
      throw new BadRequestException({
        message: '预检未通过，请修复以下问题后再发布',
        issues: checkResult.issues.filter((i) => i.level === 'ERROR'),
      });
    }

    // 4. 收集快照（复用 check 阶段已收集的快照，避免重复收集）
    const snapshot = await this.snapshotService.collectSnapshot(
      tenantId,
      appId,
      req.version,
      publishedBy,
    );

    // 5. 生成变更清单
    const changeSet = await this.changeLogService.getChangeSet(tenantId, appId);

    // 6. 事务写入：创建版本记录 + 更新应用状态 + 同步子资源发布状态
    const version = await prisma.$transaction(async (tx) => {
      // 创建版本记录（不可变快照）
      const newVersion = await tx.appVersion.create({
        data: {
          tenantId,
          appId,
          versionNumber: req.version,
          description: req.description,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          changeSet: changeSet as unknown as Prisma.InputJsonValue,
          status: 'PUBLISHED',
          publishedBy,
        },
      });

      // 更新应用状态
      await tx.application.update({
        where: { id: appId },
        data: {
          status: 'PUBLISHED',
          version: { increment: 1 },
          publishedAt: new Date(),
        },
      });

      // 同步子资源发布状态
      await tx.pageMeta.updateMany({
        where: { tenantId, appId },
        data: { isPublished: true },
      });
      // 评审 P1-7：只把 DRAFT 流程随应用发布——未完成的草稿不强制上线
      await tx.processDef.updateMany({
        where: { tenantId, appId, status: 'DRAFT' },
        data: { status: 'PUBLISHED' },
      });

      return newVersion;
    });

    // 评审 P1-7：应用级发布上线的 SCHEDULED 流程需即时注册定时触发器
    // （此前仅 onModuleInit 注册，应用级发布后定时流程静默不执行）
    // I-1：不按顶层列预过滤——画布配置的定时触发只写在 schema 触发节点
    const publishedDefs = await prisma.processDef.findMany({
      where: { tenantId, appId, status: 'PUBLISHED' },
      select: { id: true, triggerType: true, cron: true, apiName: true, workflowSchema: true },
    });
    for (const def of publishedDefs) {
      await this.triggerService
        .onProcessPublished(def.id, def.triggerType, def.cron, def.apiName, def.workflowSchema)
        .catch((err: unknown) => this.logger?.warn?.(`定时触发器注册失败: ${String(err)}`));
    }

    // R1.4：应用发布 = 部署到 prod 环境（确保环境行存在 + 切指针 + Deployment 历史）
    // 指针切换失败不回滚发布本身（版本记录已落库，可重新部署）
    try {
      await this.environmentService.deploy(tenantId, appId, 'prod', publishedBy, {
        versionId: version.id,
        note: '应用发布（prod）',
      });
    } catch (err) {
      this.logger?.warn?.(
        `prod 环境指针切换失败（运行时将沿用旧快照）: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 评审整改：业务动作级审计
    writeAudit({
      tenantId,
      userId: publishedBy,
      action: 'APP_PUBLISH',
      resource: 'APPLICATION',
      resourceId: appId,
      appId,
      detail: { version: version.versionNumber },
    });

    return this.toAppVersion(version);
  }

  /**
   * 回滚到指定版本。
   * 以目标版本快照创建新的 PUBLISHED 版本记录。
   * 将被取代的当前版本标记为 ROLLED_BACK。
   */
  async rollback(
    tenantId: string,
    appId: string,
    versionId: string,
    rolledBackBy: string,
  ): Promise<AppVersion> {
    // 1. 查找目标版本
    const targetVersion = await prisma.appVersion.findFirst({
      where: { id: versionId, tenantId, appId },
    });
    if (!targetVersion) throw new NotFoundException('版本不存在');

    // 2. 查找当前活跃的 PUBLISHED 版本（将被取代）
    const currentVersion = await prisma.appVersion.findFirst({
      where: { tenantId, appId, status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
    });

    // 3. 生成碰撞安全的版本号
    const newVersionNumber = await this.generateRollbackVersionNumber(
      appId,
      targetVersion.versionNumber,
    );

    // 4. 事务执行回滚
    const version = await prisma.$transaction(async (tx) => {
      // 将被取代的当前版本标记为 ROLLED_BACK
      if (currentVersion && currentVersion.id !== targetVersion.id) {
        await tx.appVersion.update({
          where: { id: currentVersion.id },
          data: { status: 'ROLLED_BACK' },
        });
      }

      // 刷新应用发布时间
      await tx.application.update({
        where: { id: appId },
        data: { publishedAt: new Date() },
      });

      // 创建新的回滚版本记录
      const newVersion = await tx.appVersion.create({
        data: {
          tenantId,
          appId,
          versionNumber: newVersionNumber,
          description: `回滚到版本 ${targetVersion.versionNumber}`,
          snapshot: targetVersion.snapshot as unknown as Prisma.InputJsonValue,
          changeSet: Prisma.JsonNull,
          status: 'PUBLISHED',
          publishedBy: rolledBackBy,
        },
      });

      return newVersion;
    });

    // R1.4：回滚产生新版本 → prod 指针切到回滚版本
    try {
      await this.environmentService.deploy(tenantId, appId, 'prod', rolledBackBy, {
        versionId: version.id,
        note: '应用回滚（prod）',
      });
    } catch (err) {
      this.logger?.warn?.(
        `回滚后 prod 指针切换失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return this.toAppVersion(version);
  }

  /**
   * 获取版本列表（不含快照，避免大字段传输）。
   */
  async listVersions(tenantId: string, appId: string): Promise<AppVersionSummary[]> {
    const versions = await prisma.appVersion.findMany({
      where: { tenantId, appId },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        appId: true,
        versionNumber: true,
        description: true,
        status: true,
        publishedBy: true,
        publishedAt: true,
      },
    });

    // 发布人姓名后端直出（A 旅程 2026-10-03：builder 无用户列表权限，
    // 前端二次查询 403 导致发布历史显示裸用户 ID）
    const publisherIds = [...new Set(versions.map((v) => v.publishedBy))];
    const publishers = new Map(
      (
        await prisma.user.findMany({
          where: { id: { in: publisherIds } },
          select: { id: true, name: true },
        })
      ).map((u) => [u.id, u.name]),
    );
    return versions.map((v) => ({
      id: v.id,
      appId: asAppId(v.appId),
      versionNumber: v.versionNumber,
      description: v.description,
      status: v.status as 'PUBLISHED' | 'ROLLED_BACK',
      publishedBy: asUserId(v.publishedBy),
      publishedByName: publishers.get(v.publishedBy),
      publishedAt: v.publishedAt.toISOString(),
    }));
  }

  /**
   * 获取版本详情（含完整快照）。
   */
  async getVersion(tenantId: string, appId: string, versionId: string): Promise<AppVersion> {
    const version = await prisma.appVersion.findFirst({
      where: { id: versionId, tenantId, appId },
    });
    if (!version) throw new NotFoundException('版本不存在');
    return this.toAppVersion(version);
  }

  // ===========================================================================
  // 私有辅助方法
  // ===========================================================================

  /**
   * 生成命名空间 — app_ + 6位随机十六进制。
   * QA 交互评审（2026-10-03）：前缀从 package_ 改为 app_——自动生成的标识
   * 应与资源类型语义一致（用户可见，如「会议室管理 → app_a5c3ba」）。
   */
  private generateApiName(): string {
    const hex = Math.random().toString(16).substring(2, 8);
    return `app_${hex}`;
  }

  /**
   * 生成回滚版本号（碰撞安全）。
   * 策略：在原版本号基础上递增 patch，若碰撞则继续递增直到不碰撞。
   */
  private async generateRollbackVersionNumber(appId: string, baseVersion: string): Promise<string> {
    const [major, minor, patch] = baseVersion.split('.').map(Number);
    const basePatch = patch ?? 0;
    let candidate = `${major}.${minor}.${basePatch + 1}`;

    // 查询已存在的版本号，最多尝试 100 次
    for (let i = 0; i < 100; i++) {
      const existing = await prisma.appVersion.findFirst({
        where: { appId, versionNumber: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
      candidate = `${major}.${minor}.${basePatch + 1 + i + 1}`;
    }

    // 兜底：使用时间戳
    return `${major}.${minor}.${Date.now()}`;
  }

  /**
   * Prisma AppVersion 记录 → AppVersion DTO。
   */
  private toAppVersion(v: {
    id: string;
    appId: string;
    versionNumber: string;
    description: string;
    snapshot: unknown;
    changeSet: unknown;
    status: string;
    publishedBy: string;
    publishedAt: Date;
  }): AppVersion {
    return {
      id: v.id,
      appId: asAppId(v.appId),
      versionNumber: v.versionNumber,
      description: v.description,
      snapshot: v.snapshot as AppVersion['snapshot'],
      changeSet: v.changeSet as ChangeSet | null,
      status: v.status as 'PUBLISHED' | 'ROLLED_BACK',
      publishedBy: asUserId(v.publishedBy),
      publishedAt: v.publishedAt.toISOString(),
    };
  }
}
