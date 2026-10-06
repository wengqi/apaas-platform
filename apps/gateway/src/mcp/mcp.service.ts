/**
 * McpService — MCP 工具实现（G4/R1.6 AI 生成接口 + R1.2 治理轨道接入）。
 *
 * 定位：AI Agent 经 MCP 读写平台元数据的业务层。读 = 平台既有查询；
 * 写 = **仅草稿提交**（G1 治理轨道：AI 产出一律 PENDING 待审，人工在审核
 * 中心 diff 快审，批准后才落活表；驳回意见经 list_review_submissions 回传
 * agent 自修正）。全部写入先过 G3 SchemaContractService（非法即拒，结构化
 * issues 返回），并写业务审计（AI 操作可追溯）。
 *
 * 租户隔离：工具在 HTTP 请求上下文内执行，prisma $extends 自动注入
 * tenantId（ALS），tenantId 同时作为显式参数传入服务方法（双层防御）。
 */

import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type { SchemaKind, SchemaValidationResult } from '@apaas/shared';
import { SchemaContractService } from '../schema-contract/schema-contract.service.js';
import { PageService } from '../page/page.service.js';
import { ProcessService } from '../process/process.service.js';
import { ObjectService } from '../object/object.service.js';
import { ReviewService, collectRefTokens, type AiDraftInput } from '../review/review.service.js';
import { ApplicationService } from '../application/application.service.js';
import { writeAudit } from '../common/audit.js';

/** MCP 工具的结构化返回（JSON-RPC result.content 前的数据负载）。 */
export interface McpToolResult {
  ok: boolean;
  /** 校验失败时的结构化问题（agent 自修正输入） */
  issues?: Array<{ path: string; code: string; message: string; severity: string }>;
  [key: string]: unknown;
}

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    private readonly schemaContract: SchemaContractService,
    private readonly pageService: PageService,
    private readonly processService: ProcessService,
    private readonly objectService: ObjectService,
    private readonly reviewService: ReviewService,
    private readonly applicationService: ApplicationService,
  ) {}

  // ===========================================================================
  // 读工具
  // ===========================================================================

  async overview(tenantId: string): Promise<McpToolResult> {
    const apps = await prisma.application.findMany({
      where: { tenantId },
      select: { id: true, apiName: true, name: true, status: true, version: true },
      orderBy: { createdAt: 'asc' },
    });
    const result: Array<Record<string, unknown>> = [];
    for (const app of apps) {
      const [objects, pages, processes] = await Promise.all([
        prisma.objectMeta.count({ where: { appId: app.id } }),
        prisma.pageMeta.count({ where: { appId: app.id } }),
        prisma.processDef.count({ where: { appId: app.id } }),
      ]);
      result.push({ ...app, counts: { objects, pages, processes } });
    }
    return {
      ok: true,
      apps: result,
      hint: '用 list_objects/list_pages/list_processes 查看应用内容；写操作一律生成草稿，需人工在搭建器发布',
    };
  }

  async listObjects(tenantId: string, appId: string): Promise<McpToolResult> {
    const objects = await this.objectService.list(tenantId, appId);
    return { ok: true, objects };
  }

  async listPages(tenantId: string, appId: string): Promise<McpToolResult> {
    const pages = await this.pageService.list(tenantId, appId);
    return { ok: true, pages };
  }

  async listProcesses(tenantId: string, appId: string): Promise<McpToolResult> {
    const processes = await this.processService.listProcesses(tenantId, appId);
    return { ok: true, processes };
  }

  /** 应用权限规则现状（按角色分组）——AI 配置权限前读现状的依据。 */
  async listPermissionRules(tenantId: string, appId: string): Promise<McpToolResult> {
    const roles = await prisma.role.findMany({
      where: { tenantId, appId },
      select: { id: true, code: true, name: true, description: true, isBuiltIn: true },
    });
    const rules = await prisma.permissionRule.findMany({
      where: { tenantId, appId, roleId: { in: roles.map((r) => r.id) } },
    });
    const byRole = roles.map((r) => ({
      roleId: r.id,
      code: r.code,
      name: r.name,
      description: r.description ?? undefined,
      isBuiltIn: r.isBuiltIn,
      rules: rules
        .filter((x) => x.roleId === r.id)
        .map((x) => ({
          type: x.type,
          action: x.action,
          targetId: x.targetId,
          targetNodeId: x.targetNodeId ?? undefined,
          condition: (x.condition ?? undefined) as unknown,
          fieldScope: (x.fieldScope ?? undefined) as unknown,
          effect: x.effect,
        })),
    }));
    return { ok: true, roles: byRole };
  }

  /**
   * 提交权限规则集草稿（AI 主线第四轮）：以角色为治理单元，快照=该角色目标
   * 规则集（批准=全量替换）。targetId 对照活表校验（同 workflow pageId 模式）。
   */
  async submitPermissionRuleDraft(
    tenantId: string,
    userId: string,
    args: {
      appId: string;
      roleId: string;
      rules: Array<Record<string, unknown>>;
    },
  ): Promise<McpToolResult> {
    const role = await prisma.role.findFirst({
      where: { tenantId, appId: args.appId, id: args.roleId },
    });
    if (!role) {
      return {
        ok: false,
        hint: `角色 ${args.roleId} 不存在或不是该应用的角色（list_roles 获取应用级角色 ID）`,
      };
    }

    const check = this.schemaContract.validate('permission', {
      apiName: role.code,
      name: role.name,
      rules: args.rules,
    });
    if (!check.valid) return this.rejected(check);

    // targetId 存在性校验：PAGE/DATA_MODEL/PROCESS/CONNECTOR 的目标须在活表
    const ruleList = args.rules;
    for (const [idx, r] of ruleList.entries()) {
      const type = String(r['type'] ?? '');
      const targetId = String(r['targetId'] ?? '');
      if (!targetId || targetId.startsWith('@ref:')) continue; // 令牌交由批准层（现状不支持令牌，提示用户用 list_* 拿真实 ID）
      let exists = true;
      if (type === 'PAGE') {
        exists = Boolean(
          await prisma.pageMeta.findFirst({
            where: { tenantId, appId: args.appId, id: targetId },
            select: { id: true },
          }),
        );
      } else if (type === 'RECORD' || type === 'DATA_MODEL') {
        exists = Boolean(
          await prisma.objectMeta.findFirst({
            where: { tenantId, appId: args.appId, id: targetId },
            select: { id: true },
          }),
        );
      } else if (type === 'PROCESS') {
        exists = Boolean(
          await prisma.processDef.findFirst({
            where: { tenantId, appId: args.appId, id: targetId },
            select: { id: true },
          }),
        );
      }
      if (!exists) {
        return {
          ok: false,
          hint: `rules/${idx} 的 targetId "${targetId}"（${type}）在应用活表中不存在——用 list_pages/list_objects/list_processes 获取真实 ID`,
        };
      }
    }

    const snapshot = {
      apiName: role.code,
      name: role.name,
      roleId: role.id,
      rules: ruleList as never,
    };
    const existingApproved = await prisma.resourceVersion.findFirst({
      where: {
        tenantId,
        appId: args.appId,
        module: 'PERMISSION',
        entityId: role.id,
        status: 'APPROVED',
      },
      orderBy: { versionNumber: 'desc' },
    });
    const submission = await this.reviewService.submitAiDraft(
      tenantId,
      {
        module: 'PERMISSION',
        appId: args.appId,
        apiName: role.code,
        name: role.name,
        snapshot: snapshot as never,
        entityId: role.id,
      },
      userId,
    );
    void existingApproved;

    this.auditDraft(tenantId, userId, args.appId, 'PERMISSION', submission.id, 'update');
    this.logger.log(
      `MCP 权限规则集草稿待审: ${submission.id}（角色 ${role.code}，${ruleList.length} 条）by ${userId}`,
    );
    return {
      ok: true,
      submissionId: submission.id,
      versionNumber: submission.versionNumber,
      status: submission.status,
      roleId: role.id,
      action: 'submitted_ruleset',
      published: false,
      hint: `已进入待审队列。批准时全量替换角色「${role.code}」的规则集（${ruleList.length} 条，deny-overrides 语义不变）`,
    };
  }

  /** 数据集列表（含列定义与行数/状态）——AI 写数据集图表（chart-data sourceId）的依据。 */
  async listDatasets(tenantId: string, appId: string): Promise<McpToolResult> {
    const datasets = await prisma.dataset.findMany({
      where: { tenantId, appId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        apiName: true,
        name: true,
        description: true,
        status: true,
        rowCount: true,
        columns: true,
        sourceFlowId: true,
        lastRefreshedAt: true,
      },
    });
    return { ok: true, datasets };
  }

  /** 提交数据流草稿（AI 主线第三轮）：G3 dataset 校验 → 治理轨道 PENDING；
   *  批准时落地 ACTIVE 并立即执行物化（@ref:dataset:<数据流apiName> 可被页面引用）。 */
  async submitDatasetDraft(
    tenantId: string,
    userId: string,
    args: {
      appId: string;
      apiName: string;
      name: string;
      config: unknown;
      description?: string | null;
      datasetId?: string | null;
    },
  ): Promise<McpToolResult> {
    const check = this.schemaContract.validate('dataset', {
      apiName: args.apiName,
      name: args.name,
      config: args.config,
    });
    if (!check.valid) return this.rejected(check);

    const snapshot = {
      apiName: args.apiName,
      name: args.name,
      description: args.description ?? undefined,
      config: args.config as Record<string, unknown>,
    };
    const submission = await this.reviewService.submitAiDraft(
      tenantId,
      {
        module: 'DATASET',
        appId: args.appId,
        apiName: args.apiName,
        name: args.name,
        snapshot,
        entityId: args.datasetId ?? undefined,
      },
      userId,
    );

    this.auditDraft(
      tenantId,
      userId,
      args.appId,
      'DATASET',
      submission.id,
      args.datasetId ? 'update' : 'create',
    );
    this.logger.log(`MCP 数据流草稿待审: ${submission.id}（${args.apiName}）by ${userId}`);
    return {
      ok: true,
      submissionId: submission.id,
      versionNumber: submission.versionNumber,
      status: submission.status,
      datasetId: submission.entityId,
      action: args.datasetId ? 'submitted_update' : 'submitted_create',
      published: false,
      hint: `已进入待审队列（未落活表）。批准时自动落地数据流（ACTIVE）并执行物化数据集；页面图表 sourceId 可写 "@ref:dataset:${args.apiName}"（批准拓扑序：对象→数据集→页面→流程）`,
    };
  }

  /** 应用成员列表（id/姓名/邮箱/角色）——AI 配置审批人（assignee/approveUsers）的选人依据。 */
  async listUsers(tenantId: string, keyword?: string): Promise<McpToolResult> {
    const users = await prisma.user.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        ...(keyword
          ? {
              OR: [
                { name: { contains: keyword, mode: 'insensitive' } },
                { email: { contains: keyword, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        userRoles: { select: { role: { select: { code: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    return {
      ok: true,
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        roles: u.userRoles.map((ur) => ur.role.code),
      })),
      hint: '把 id 填入流程 user_task 的 assignee（单人）或 approveUsers（多人）；角色编码作 candidateGroups 需传角色 ID（用 list_roles 拿）',
    };
  }

  /** 角色列表（id/编码/名称）——指定角色审批（candidateGroups）的选角色依据。 */
  async listRoles(tenantId: string, appId?: string): Promise<McpToolResult> {
    const roles = await prisma.role.findMany({
      where: { tenantId, ...(appId ? { appId } : {}) },
      select: { id: true, code: true, name: true, isBuiltIn: true },
      orderBy: [{ isBuiltIn: 'desc' }, { createdAt: 'asc' }],
    });
    return {
      ok: true,
      roles,
      hint: '流程 user_task 指定角色审批时，把角色 id 填入 candidateGroups（引擎/任务中心按角色 ID 匹配，非编码）',
    };
  }

  async getPage(tenantId: string, pageId: string): Promise<McpToolResult> {
    const page = await this.pageService.get(tenantId, pageId);
    return { ok: true, page };
  }

  async getProcess(tenantId: string, processId: string): Promise<McpToolResult> {
    const process = await this.processService.getProcess(tenantId, processId);
    return { ok: true, process };
  }

  // ===========================================================================
  // 校验（dry-run，不落库——agent 提交前自检）
  // ===========================================================================

  validateSchema(tenantId: string, kind: SchemaKind, schema: unknown): Promise<McpToolResult> {
    const result: SchemaValidationResult = this.schemaContract.validate(kind, schema);
    return Promise.resolve({
      ok: result.valid,
      kind,
      issues: result.issues,
      hint: result.valid
        ? '校验通过，可调用 submit_*_draft 提交草稿'
        : '按 issues 逐项修正后重新 validate',
    });
  }

  // ===========================================================================
  // 写工具（create_application 容器操作即时生效；资源变更一律草稿提交——
  // 先过 G3 校验合同，再进 R1.2 待审队列）
  // ===========================================================================

  /** 创建应用（容器操作，与人工在搭建器创建语义一致，不入人审）。 */
  async createApplication(
    tenantId: string,
    userId: string,
    args: {
      apiName?: string;
      name: string;
      description?: string;
      icon?: string;
      color?: string;
    },
  ): Promise<McpToolResult> {
    const app = await this.applicationService.create(tenantId, userId, {
      apiName: args.apiName,
      name: args.name,
      description: args.description,
      icon: args.icon,
      color: args.color,
    });
    writeAudit({
      tenantId,
      userId,
      action: 'MCP_APP_CREATE',
      resource: 'APPLICATION',
      resourceId: app.id,
      appId: app.id,
      detail: { channel: 'mcp', apiName: app.apiName, appName: app.name },
    });
    return {
      ok: true,
      appId: app.id,
      apiName: app.apiName,
      name: app.name,
      status: app.status,
      hint: '应用已创建（DRAFT）。下一步：get_dialect_guide 阅读方言指南 → submit_object_draft 定义业务对象',
    };
  }

  async submitPageDraft(
    tenantId: string,
    userId: string,
    args: {
      appId: string;
      apiName: string;
      name: string;
      schema: unknown;
      type?: string;
      objectId?: string | null;
      pageId?: string;
    },
  ): Promise<McpToolResult> {
    const check = this.schemaContract.validate('amis_page', args.schema);
    if (!check.valid) return this.rejected(check);

    // 提交快照为完整页面定义；批准前不触碰活表
    const snapshot = {
      apiName: args.apiName,
      name: args.name,
      type: args.type ?? 'custom',
      objectId: args.objectId ?? null,
      schema: args.schema as Record<string, unknown>,
    };
    const submission = await this.reviewService.submitAiDraft(
      tenantId,
      {
        module: 'PAGE',
        appId: args.appId,
        apiName: args.apiName,
        name: args.name,
        snapshot,
        entityId: args.pageId,
      },
      userId,
    );

    this.auditDraft(
      tenantId,
      userId,
      args.appId,
      'PAGE',
      submission.id,
      args.pageId ? 'update' : 'create',
    );
    this.logger.log(`MCP 页面草稿待审: ${submission.id}（${args.apiName}）by ${userId}`);
    return {
      ok: true,
      submissionId: submission.id,
      versionNumber: submission.versionNumber,
      status: submission.status,
      pageId: submission.entityId,
      action: args.pageId ? 'submitted_update' : 'submitted_create',
      published: false,
      hint: `已进入待审队列（未落活表）。轮询 list_review_submissions(appId="${args.appId}") 等待人工批准；批准后 list_pages 可拿到新页面 pageId（供流程 user_task 绑定）`,
    };
  }

  async submitWorkflowDraft(
    tenantId: string,
    userId: string,
    args: {
      appId: string;
      apiName: string;
      name: string;
      workflowSchema: unknown;
      triggerType?:
        'MANUAL' | 'RECORD_CREATED' | 'RECORD_UPDATED' | 'RECORD_DELETED' | 'SCHEDULED' | 'WEBHOOK';
      processId?: string;
    },
  ): Promise<McpToolResult> {
    // 跨引用：审批页面绑定（pageId）必须指向本应用已存在页面
    const appPages = await this.pageService.list(tenantId, args.appId);
    const pageIds = new Set(appPages.map((p) => p.id));
    const check = this.schemaContract.validate('workflow', args.workflowSchema, { pageIds });
    if (!check.valid) return this.rejected(check);

    const snapshot = {
      apiName: args.apiName,
      name: args.name,
      workflowSchema: args.workflowSchema as Record<string, unknown>,
      triggerType: args.triggerType ?? 'MANUAL',
      cron: null,
    };
    const submission = await this.reviewService.submitAiDraft(
      tenantId,
      {
        module: 'PROCESS',
        appId: args.appId,
        apiName: args.apiName,
        name: args.name,
        snapshot,
        entityId: args.processId,
      },
      userId,
    );

    this.auditDraft(
      tenantId,
      userId,
      args.appId,
      'PROCESS',
      submission.id,
      args.processId ? 'update' : 'create',
    );
    this.logger.log(`MCP 流程草稿待审: ${submission.id}（${args.apiName}）by ${userId}`);
    return {
      ok: true,
      submissionId: submission.id,
      versionNumber: submission.versionNumber,
      status: submission.status,
      processId: submission.entityId,
      action: args.processId ? 'submitted_update' : 'submitted_create',
      hint: `已进入待审队列（未落活表）。轮询 list_review_submissions(appId="${args.appId}") 等待人工批准；批准后流程以 DRAFT 落地，仍需人工在搭建器发布流程才会激活`,
    };
  }

  async submitObjectDraft(
    tenantId: string,
    userId: string,
    args: {
      appId: string;
      apiName: string;
      name: string;
      fields: Array<Record<string, unknown>>;
      description?: string;
      icon?: string;
      objectId?: string;
    },
  ): Promise<McpToolResult> {
    const meta = { apiName: args.apiName, name: args.name, fields: args.fields };
    const check = this.schemaContract.validate('object_meta', meta);
    if (!check.valid) return this.rejected(check);

    // 快照仅含业务字段（系统字段批准落地时注入，不参与 diff）
    const snapshot = {
      apiName: args.apiName,
      name: args.name,
      description: args.description,
      icon: args.icon,
      fields: args.fields,
    };
    const submission = await this.reviewService.submitAiDraft(
      tenantId,
      {
        module: 'OBJECT',
        appId: args.appId,
        apiName: args.apiName,
        name: args.name,
        snapshot,
        entityId: args.objectId,
      },
      userId,
    );

    this.auditDraft(
      tenantId,
      userId,
      args.appId,
      'OBJECT',
      submission.id,
      args.objectId ? 'update' : 'create',
    );
    this.logger.log(`MCP 对象草稿待审: ${submission.id}（${args.apiName}）by ${userId}`);
    return {
      ok: true,
      submissionId: submission.id,
      versionNumber: submission.versionNumber,
      status: submission.status,
      objectId: submission.entityId,
      action: args.objectId ? 'submitted_update' : 'submitted_create',
      hint: `已进入待审队列（未落活表）。轮询 list_review_submissions(appId="${args.appId}") 等待人工批准；批准后 list_objects 拿到 objectId（表单页/列表页绑定需要）`,
    };
  }

  // ===========================================================================
  // 批量提交（资源依赖链单波进审：submit_app_drafts）
  // ===========================================================================

  /**
   * 批量提交完整应用草稿：全部资源校验通过后以共享 batchId 进审。
   * 跨资源引用以令牌占位：页面 objectId = "@ref:object:<apiName>"（由
   * objectApiName 解析），流程 user_task.pageId = "@ref:page:<apiName>"。
   * 引用目标必须在本批或活表中存在，否则整批拒绝（不留半批草稿）。
   */
  async submitAppDrafts(
    tenantId: string,
    userId: string,
    args: {
      appId: string;
      objects: Array<Record<string, unknown>>;
      datasets?: Array<Record<string, unknown>>;
      pages: Array<Record<string, unknown>>;
      processes: Array<Record<string, unknown>>;
    },
  ): Promise<McpToolResult> {
    const { appId, objects, datasets = [], pages, processes } = args;
    if (objects.length + datasets.length + pages.length + processes.length === 0) {
      return {
        ok: false,
        hint: '批量提交至少包含一项资源（objects/datasets/pages/processes 任一非空）',
      };
    }

    const batchObjectApiNames = new Set(objects.map((o) => String(o['apiName'] ?? '')));
    const batchPageApiNames = new Set(pages.map((p) => String(p['apiName'] ?? '')));

    // 1) 对象逐项 G3 校验
    for (const obj of objects) {
      const meta = {
        apiName: String(obj['apiName'] ?? ''),
        name: String(obj['name'] ?? ''),
        fields: (obj['fields'] as Array<Record<string, unknown>>) ?? [],
      };
      const check = this.schemaContract.validate('object_meta', meta);
      if (!check.valid) return this.rejected(check);
    }

    // 1.5) 数据流逐项 G3 校验（AI 主线第三轮）
    for (const ds of datasets) {
      const check = this.schemaContract.validate('dataset', {
        apiName: String(ds['apiName'] ?? ''),
        name: String(ds['name'] ?? ''),
        config: ds['config'] ?? {},
      });
      if (!check.valid) return this.rejected(check);
    }

    // 2) 页面逐项 G3 校验 + objectApiName 引用解析（活表对象 → 真实 ID；本批对象 → 令牌）
    const liveObjects = await this.objectService.list(tenantId, appId);
    const liveObjectIdsByApiName = new Map(liveObjects.map((o) => [o.apiName, o.id]));
    for (const page of pages) {
      const check = this.schemaContract.validate('amis_page', page['schema']);
      if (!check.valid) return this.rejected(check);
    }

    // 3) 流程逐项 G3 校验 + @ref:page 令牌目标校验（pageIds 白名单 = 活表页面 ID ∪ 合法令牌）
    const livePages = await this.pageService.list(tenantId, appId);
    const livePageIdsByApiName = new Map(livePages.map((p) => [p.apiName, p.id]));
    const tokenWhitelist = new Set<string>(livePages.map((p) => p.id));
    for (const proc of processes) {
      const tokens = collectRefTokens(proc['workflowSchema']);
      for (const token of tokens) {
        const apiName = token.replace(/^@ref:page:/, '');
        if (!batchPageApiNames.has(apiName) && !livePageIdsByApiName.has(apiName)) {
          return {
            ok: false,
            hint: `流程「${String(proc['name'] ?? '')}」引用的页面令牌 ${token} 无效：既不在本批 pages 中，也不是应用的已有页面`,
          };
        }
        tokenWhitelist.add(token);
      }
      const check = this.schemaContract.validate('workflow', proc['workflowSchema'], {
        pageIds: tokenWhitelist,
      });
      if (!check.valid) return this.rejected(check);
    }

    // 4) 组装 AiDraftInput 批量载荷（引用令牌原样入快照，批准时拓扑解析）
    const items: AiDraftInput[] = [];
    for (const obj of objects) {
      items.push({
        module: 'OBJECT',
        appId,
        apiName: String(obj['apiName']),
        name: String(obj['name']),
        entityId: obj['objectId'] ? String(obj['objectId']) : undefined,
        snapshot: {
          apiName: String(obj['apiName']),
          name: String(obj['name']),
          description: obj['description'] ? String(obj['description']) : undefined,
          icon: obj['icon'] ? String(obj['icon']) : undefined,
          fields: (obj['fields'] as Array<Record<string, unknown>>) ?? [],
        },
      });
    }
    for (const ds of datasets) {
      items.push({
        module: 'DATASET',
        appId,
        apiName: String(ds['apiName']),
        name: String(ds['name']),
        entityId: ds['datasetId'] ? String(ds['datasetId']) : undefined,
        snapshot: {
          apiName: String(ds['apiName']),
          name: String(ds['name']),
          description: ds['description'] ? String(ds['description']) : undefined,
          config: (ds['config'] as Record<string, unknown>) ?? {},
        },
      });
    }
    for (const page of pages) {
      const objectApiName = page['objectApiName'] ? String(page['objectApiName']) : null;
      let objectId: string | null = page['objectId'] ? String(page['objectId']) : null;
      if (objectApiName) {
        const live = liveObjectIdsByApiName.get(objectApiName);
        if (live) objectId = live;
        else if (batchObjectApiNames.has(objectApiName)) objectId = `@ref:object:${objectApiName}`;
        else {
          return {
            ok: false,
            hint: `页面「${String(page['name'] ?? '')}」的 objectApiName "${objectApiName}" 无效：既不在本批 objects 中，也不是应用的已有对象`,
          };
        }
      }
      items.push({
        module: 'PAGE',
        appId,
        apiName: String(page['apiName']),
        name: String(page['name']),
        entityId: page['pageId'] ? String(page['pageId']) : undefined,
        snapshot: {
          apiName: String(page['apiName']),
          name: String(page['name']),
          type: page['type'] ? String(page['type']) : 'custom',
          objectId,
          schema: (page['schema'] as Record<string, unknown>) ?? {},
        },
      });
    }
    for (const proc of processes) {
      items.push({
        module: 'PROCESS',
        appId,
        apiName: String(proc['apiName']),
        name: String(proc['name']),
        entityId: proc['processId'] ? String(proc['processId']) : undefined,
        snapshot: {
          apiName: String(proc['apiName']),
          name: String(proc['name']),
          workflowSchema: (proc['workflowSchema'] as Record<string, unknown>) ?? {},
          triggerType: proc['triggerType'] ? String(proc['triggerType']) : 'MANUAL',
          cron: null,
        },
      });
    }

    // 5) 单波进审（共享 batchId）
    const { batchId, rows } = await this.reviewService.submitAiBatch(
      tenantId,
      { appId, items },
      userId,
    );
    for (const row of rows) {
      this.auditDraft(
        tenantId,
        userId,
        appId,
        row.module,
        row.id,
        row.entityId ? 'update' : 'create',
      );
    }
    this.logger.log(`MCP 批量草稿待审: batch=${batchId} ×${rows.length} by ${userId}`);
    return {
      ok: true,
      batchId,
      submissions: rows.map((r) => ({
        id: r.id,
        module: r.module,
        apiName: r.apiName,
        name: r.name,
        versionNumber: r.versionNumber,
        status: r.status,
      })),
      hint:
        `整批 ${rows.length} 项已进入待审队列（共享 batchId=${batchId}）。` +
        `人工在审核中心对该批次一键批准（按 对象→页面→流程 顺序落地并自动解析 @ref: 引用）；` +
        `轮询 list_review_submissions(appId="${appId}") 跟踪进度，REJECTED 单的 reviewComment 是驳回意见`,
    };
  }

  // ===========================================================================
  // 治理轨道查询（agent 闭环：读取审批结果与驳回意见）
  // ===========================================================================

  async listReviewSubmissions(tenantId: string, appId: string): Promise<McpToolResult> {
    const submissions = await this.reviewService.listSubmissions(tenantId, appId);
    return {
      ok: true,
      submissions: submissions.map((s) => ({
        id: s.id,
        module: s.module,
        apiName: s.apiName,
        name: s.name,
        versionNumber: s.versionNumber,
        status: s.status,
        source: s.source,
        batchId: s.batchId,
        diffSummary: s.diff.summary,
        reviewComment: s.reviewComment,
        submittedAt: s.createdAt,
      })),
      hint: 'PENDING=待人审（batchId 非空=批量组，审核中心一键整批处置）；REJECTED 含 reviewComment（人类驳回意见，按意见修正后重新 submit）',
    };
  }

  // ===========================================================================
  // 内部
  // ===========================================================================

  private rejected(check: SchemaValidationResult): McpToolResult {
    return {
      ok: false,
      issues: check.issues,
      hint: 'schema 未通过校验合同——按 issues 逐项修正（错误含路径与候选建议）后重新提交；草稿不会保留',
    };
  }

  private auditDraft(
    tenantId: string,
    userId: string,
    appId: string,
    resource: string,
    resourceId: string,
    action: string,
  ): void {
    writeAudit({
      tenantId,
      userId,
      action: 'MCP_DRAFT_SUBMIT',
      resource: resource as 'PAGE' | 'PROCESS' | 'OBJECT',
      resourceId,
      appId,
      detail: { channel: 'mcp', draftAction: action },
    });
  }
}
