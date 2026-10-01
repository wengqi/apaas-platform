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
import { ReviewService } from '../review/review.service.js';
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
  // 写工具（一律草稿提交；先过 G3 校验合同，再进 R1.2 待审队列）
  // ===========================================================================

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
      hint: '已进入待审队列（未落活表）：人工在审核中心 diff 快审，批准后生效；可用 list_review_submissions 查询审批结果',
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
      hint: '已进入待审队列（未落活表）：批准后流程以 DRAFT 落地，需人工发布流程才会激活',
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
      hint: '已进入待审队列（未落活表）：批准后对象字段生效（系统字段自动保留）',
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
        diffSummary: s.diff.summary,
        reviewComment: s.reviewComment,
        submittedAt: s.createdAt,
      })),
      hint: 'PENDING=待人审；REJECTED 含 reviewComment（人类驳回意见，按意见修正后重新 submit）',
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
