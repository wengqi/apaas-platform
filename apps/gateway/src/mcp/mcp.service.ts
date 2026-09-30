/**
 * McpService — MCP 工具实现（G4/R1.6 AI 生成接口）。
 *
 * 定位：AI Agent 经 MCP 读写平台元数据的业务层。读 = 平台既有查询；
 * 写 = **仅草稿**（G1 治理轨道的合同闸 + 治理闸：AI 产出不发布，人工在
 * 搭建器审核/发布）。全部写入过 G3 SchemaContractService（非法即拒，
 * 结构化 issues 返回给 agent 自修正），并写业务审计（AI 操作可追溯）。
 *
 * 租户隔离：工具在 HTTP 请求上下文内执行，prisma $extends 自动注入
 * tenantId（ALS），tenantId 同时作为显式参数传入服务方法（双层防御）。
 */

import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@apaas/db';
import type { SchemaKind, SchemaValidationResult } from '@apaas/shared';
import type { PageSchema, PageType } from '@apaas/shared';
import { SchemaContractService } from '../schema-contract/schema-contract.service.js';
import { PageService } from '../page/page.service.js';
import { ProcessService } from '../process/process.service.js';
import { ObjectService } from '../object/object.service.js';
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
  // 写工具（一律草稿；先过 G3 校验合同）
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

    // schema 列为 JSONB：过渡期存 v1/amis 双方言（P2 统一 amis 后收窄类型）
    const schemaJson = args.schema as unknown as PageSchema;
    const result = args.pageId
      ? await this.pageService.update(
          tenantId,
          args.pageId,
          { name: args.name, schema: schemaJson },
          `mcp:${userId}`,
        )
      : await this.pageService.create(
          tenantId,
          args.appId,
          {
            apiName: args.apiName,
            name: args.name,
            type: (args.type ?? 'custom') as PageType,
            objectId: args.objectId ?? undefined,
            schema: schemaJson,
          },
          `mcp:${userId}`,
        );

    this.auditDraft(
      tenantId,
      userId,
      args.appId,
      'PAGE',
      result.id,
      args.pageId ? 'update' : 'create',
    );
    this.logger.log(
      `MCP 页面草稿${args.pageId ? '更新' : '创建'}: ${result.id}（${args.apiName}）by ${userId}`,
    );
    return {
      ok: true,
      pageId: result.id,
      action: args.pageId ? 'updated' : 'created',
      published: false,
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

    const result = args.processId
      ? await this.processService.updateProcess(
          tenantId,
          args.processId,
          { name: args.name, workflowSchema: args.workflowSchema as Record<string, unknown> },
          `mcp:${userId}`,
        )
      : await this.processService.createProcess(
          tenantId,
          args.appId,
          {
            apiName: args.apiName,
            name: args.name,
            workflowSchema: args.workflowSchema as Record<string, unknown>,
            triggerType: args.triggerType ?? 'MANUAL',
          },
          `mcp:${userId}`,
        );

    this.auditDraft(
      tenantId,
      userId,
      args.appId,
      'PROCESS',
      result.id,
      args.processId ? 'update' : 'create',
    );
    this.logger.log(
      `MCP 流程草稿${args.processId ? '更新' : '创建'}: ${result.id}（${args.apiName}）by ${userId}`,
    );
    const status = (result as { status?: string }).status ?? 'DRAFT';
    return {
      ok: true,
      processId: result.id,
      action: args.processId ? 'updated' : 'created',
      status,
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

    // 已存在 → 保留系统字段、业务字段整体替换（草稿语义：对象随应用发布快照生效）
    const existing = await prisma.objectMeta.findFirst({
      where: { tenantId, appId: args.appId, apiName: args.apiName },
      select: { id: true, fields: true },
    });

    let objectId: string;
    let action: 'created' | 'updated';
    if (existing) {
      const existingFields = (existing.fields as unknown as Array<Record<string, unknown>>) ?? [];
      const systemFields = existingFields.filter((f) => f['isSystem'] === true);
      const merged = [...systemFields, ...(args.fields as Array<Record<string, unknown>>)];
      await prisma.objectMeta.update({
        where: { id: existing.id },
        data: { fields: merged as object[] },
      });
      objectId = existing.id;
      action = 'updated';
    } else {
      // 先建对象（注入系统字段），再合并业务字段
      const created = await this.objectService.create(tenantId, args.appId, userId, {
        apiName: args.apiName,
        name: args.name,
        description: args.description,
        icon: args.icon ?? '📦',
      });
      const systemFields = (
        (created.fields ?? []) as unknown as Array<Record<string, unknown>>
      ).filter((f) => f['isSystem'] === true);
      await prisma.objectMeta.update({
        where: { id: created.id },
        data: {
          fields: [...systemFields, ...(args.fields as Array<Record<string, unknown>>)] as object[],
        },
      });
      objectId = created.id;
      action = 'created';
    }

    this.auditDraft(tenantId, userId, args.appId, 'OBJECT', objectId, action);
    this.logger.log(`MCP 对象草稿${action}: ${objectId}（${args.apiName}）by ${userId}`);
    return { ok: true, objectId, action };
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
