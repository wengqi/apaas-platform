/**
 * 云函数服务 — CRUD + 发布 + 执行。
 *
 * 克隆 Connector 模式：CRUD 操作带 tenantId 隔离 + ChangeLog 记录，
 * 执行委托给 CloudFunctionRunner（沙箱引擎）。
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import { ChangeLogService } from '../application/changelog.service.js';
import { ObservabilityService } from '../observability/observability.service.js';
import { CloudFunctionRunner, DEFAULT_FUNCTION_CODE } from './cloud-function.runner.service.js';
import type {
  CloudFunctionStatus,
  CloudFunction,
  CloudFunctionCode,
  CloudFunctionInputParam,
  CreateCloudFunctionRequest,
  UpdateCloudFunctionRequest,
  InvokeCloudFunctionRequest,
  CloudFunctionCallResult,
} from '@apaas/shared';

/** 评审 M-8：进程内并发 Isolate 上限——防止 50 并发 × 128MB 堆上限打爆网关 */
const MAX_CONCURRENT_ISOLATES = Number(process.env.CLOUD_FUNCTION_MAX_CONCURRENT) || 4;
const ISOLATE_QUEUE_TIMEOUT_MS = 5_000;

@Injectable()
export class CloudFunctionService {
  constructor(
    private readonly changeLogService: ChangeLogService,
    private readonly runner: CloudFunctionRunner,
    private readonly observabilityService: ObservabilityService,
  ) {}

  /** 列出应用下所有云函数（不含代码内容）。 */
  async list(tenantId: string, appId: string): Promise<CloudFunction[]> {
    const functions = await prisma.cloudFunction.findMany({
      where: { tenantId, appId },
      orderBy: { updatedAt: 'desc' },
    });
    return functions.map((f) => this.toDto(f));
  }

  /** 获取云函数详情（含代码）。 */
  async get(tenantId: string, appId: string, functionId: string): Promise<CloudFunction> {
    const fn = await prisma.cloudFunction.findFirst({
      where: { id: functionId, tenantId, appId },
    });
    if (!fn) throw new NotFoundException('云函数不存在');
    return this.toDto(fn);
  }

  /** 获取原始实体（供流程执行器使用）。 */
  async getEntity(tenantId: string, functionId: string) {
    const fn = await prisma.cloudFunction.findFirst({
      where: { id: functionId, tenantId },
    });
    if (!fn) throw new NotFoundException('云函数不存在');
    return fn;
  }

  /** 创建云函数。 */
  async create(
    tenantId: string,
    appId: string,
    createdBy: string,
    data: CreateCloudFunctionRequest,
  ): Promise<CloudFunction> {
    const existing = await prisma.cloudFunction.findFirst({
      where: { tenantId, appId, apiName: data.apiName },
    });
    if (existing) throw new BadRequestException(`云函数 API 名称 "${data.apiName}" 已存在`);

    const code: CloudFunctionCode = data.code ?? {
      source: DEFAULT_FUNCTION_CODE,
      language: 'javascript',
    };

    const fn = await prisma.cloudFunction.create({
      data: {
        tenantId,
        appId,
        apiName: data.apiName,
        name: data.name,
        description: data.description,
        code: code as object,
        inputSchema: (data.inputSchema ?? null) as object,
        status: 'DRAFT',
        version: 0,
        createdById: createdBy,
      },
    });

    await this.changeLogService.log({
      tenantId,
      appId,
      module: 'CLOUD_FUNCTION',
      entityType: 'CloudFunction',
      entityId: fn.id,
      entityName: fn.name,
      changeType: 'CREATE',
      changedBy: createdBy,
    });

    return this.toDto(fn);
  }

  /** 更新云函数。 */
  async update(
    tenantId: string,
    appId: string,
    functionId: string,
    updatedBy: string,
    data: UpdateCloudFunctionRequest,
  ): Promise<CloudFunction> {
    const existing = await prisma.cloudFunction.findFirst({
      where: { id: functionId, tenantId, appId },
    });
    if (!existing) throw new NotFoundException('云函数不存在');

    // 评审 M-4：PUBLISHED 后代码仍可静默替换——发布评审形同虚设。
    // 已发布函数锁定代码与 schema，须先撤回（状态回 DRAFT）再修改。
    if (existing.status === 'PUBLISHED') {
      const codeChanged =
        data.code !== undefined && JSON.stringify(data.code) !== JSON.stringify(existing.code);
      const schemaChanged =
        data.inputSchema !== undefined &&
        JSON.stringify(data.inputSchema) !== JSON.stringify(existing.inputSchema);
      if (codeChanged || schemaChanged) {
        throw new BadRequestException('已发布的云函数不可修改代码/输入模式，请先将函数撤回为草稿');
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.code !== undefined) updateData.code = data.code as object;
    if (data.inputSchema !== undefined) updateData.inputSchema = data.inputSchema as object;
    if (data.status !== undefined) updateData.status = data.status;

    const fn = await prisma.cloudFunction.update({
      where: { id: functionId },
      data: updateData,
    });

    await this.changeLogService.log({
      tenantId,
      appId: existing.appId,
      module: 'CLOUD_FUNCTION',
      entityType: 'CloudFunction',
      entityId: fn.id,
      entityName: fn.name,
      changeType: 'UPDATE',
      changedBy: updatedBy,
    });

    return this.toDto(fn);
  }

  /** 删除云函数。 */
  async delete(
    tenantId: string,
    appId: string,
    functionId: string,
    deletedBy: string,
  ): Promise<void> {
    const existing = await prisma.cloudFunction.findFirst({
      where: { id: functionId, tenantId, appId },
    });
    if (!existing) throw new NotFoundException('云函数不存在');

    await prisma.cloudFunction.delete({ where: { id: functionId } });

    await this.changeLogService.log({
      tenantId,
      appId: existing.appId,
      module: 'CLOUD_FUNCTION',
      entityType: 'CloudFunction',
      entityId: functionId,
      entityName: existing.name,
      changeType: 'DELETE',
      changedBy: deletedBy,
    });
  }

  /** 发布云函数（DRAFT → PUBLISHED）。 */
  async publish(
    tenantId: string,
    appId: string,
    functionId: string,
    publishedBy: string,
  ): Promise<CloudFunction> {
    const existing = await prisma.cloudFunction.findFirst({
      where: { id: functionId, tenantId, appId },
    });
    if (!existing) throw new NotFoundException('云函数不存在');
    if (existing.status === 'PUBLISHED') throw new BadRequestException('云函数已发布');

    const fn = await prisma.cloudFunction.update({
      where: { id: functionId },
      data: {
        status: 'PUBLISHED',
        version: { increment: 1 },
      },
    });

    await this.changeLogService.log({
      tenantId,
      appId: existing.appId,
      module: 'CLOUD_FUNCTION',
      entityType: 'CloudFunction',
      entityId: fn.id,
      entityName: fn.name,
      changeType: 'UPDATE',
      changedBy: publishedBy,
      changeDescription: `发布云函数 v${fn.version}`,
    });

    return this.toDto(fn);
  }

  /** 评审 M-8：简单计数信号量——并发超限时排队，排队超时返回 429。 */
  private isolateSlots = MAX_CONCURRENT_ISOLATES;
  private readonly isolateWaiters: Array<() => void> = [];

  private async acquireIsolateSlot(): Promise<void> {
    if (this.isolateSlots > 0) {
      this.isolateSlots -= 1;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const waiter = () => {
        clearTimeout(timer);
        resolve();
      };
      // 对抗审查 scale-01 修复②：超时改主动定时器——原实现超时检查只在被 release 唤醒时
      // 才执行（懒检查），突发后槽位泄漏致空闲进程新 invoke 永久挂起、超时永不触发。
      const timer = setTimeout(() => {
        const idx = this.isolateWaiters.indexOf(waiter);
        if (idx >= 0) this.isolateWaiters.splice(idx, 1);
        reject(new Error('isolate queue timeout'));
      }, ISOLATE_QUEUE_TIMEOUT_MS);
      this.isolateWaiters.push(waiter);
    });
  }

  private releaseIsolateSlot(): void {
    const waiter = this.isolateWaiters.shift();
    if (waiter)
      waiter(); // 槽位直接移交等待者：占用计数不变（对抗审查 scale-01 修复①：原实现的等待者获取路径二次扣减 + 移交不加回，每次移交净 -1，突发后槽位永久泄漏至 ≤0）
    else this.isolateSlots += 1;
  }

  /** 执行云函数。 */
  async invoke(
    tenantId: string,
    functionId: string,
    params: InvokeCloudFunctionRequest,
  ): Promise<CloudFunctionCallResult> {
    const fn = await this.getEntity(tenantId, functionId);

    if (fn.status !== 'PUBLISHED') {
      throw new BadRequestException('云函数未发布，无法执行');
    }

    const code = fn.code as unknown as CloudFunctionCode;
    const input = params.input ?? {};

    // acquire 放入 try（M-8 注释承诺「排队超时返回 429」此前落空：acquire 在 try 外，
    // 超时裸 Error 直穿；acquired 标志防 finally 对未获取的槽位误释放——多还一个会放大并发额度）
    let acquired = false;
    try {
      await this.acquireIsolateSlot();
      acquired = true;
      // 观测事件（P1 运维治理）：云函数执行此前零落库——耗时/成败/错误全在响应里，
      // 失败后无迹可查。此处落 FUNCTION_EXEC 事件（非阻塞）。
      const startedAt = Date.now();
      try {
        const result = await this.runner.execute(code.source, input, tenantId, fn.appId);
        void this.observabilityService
          .record({
            tenantId,
            appId: fn.appId,
            category: 'FUNCTION_EXEC',
            level: result.success ? 'INFO' : 'ERROR',
            source: 'cloud-function:invoke',
            resourceId: fn.id,
            message: result.success
              ? `云函数 ${fn.apiName} 执行成功（${result.durationMs}ms）`
              : `云函数 ${fn.apiName} 执行失败：${result.error ?? '未知错误'}`,
            durationMs: result.durationMs,
            detail: { apiName: fn.apiName, success: result.success, logLines: result.logs.length },
          })
          .catch(() => undefined);
        return result;
      } catch (err) {
        void this.observabilityService
          .record({
            tenantId,
            appId: fn.appId,
            category: 'FUNCTION_EXEC',
            level: 'ERROR',
            source: 'cloud-function:invoke',
            resourceId: fn.id,
            message: `云函数 ${fn.apiName} 执行异常：${err instanceof Error ? err.message : String(err)}`,
            durationMs: Date.now() - startedAt,
            detail: { apiName: fn.apiName, success: false },
          })
          .catch(() => undefined);
        throw err;
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'isolate queue timeout') {
        throw new BadRequestException('云函数执行排队超时，请稍后重试');
      }
      throw err;
    } finally {
      if (acquired) this.releaseIsolateSlot();
    }
  }

  /** Prisma 实体 → DTO。 */
  private toDto(f: {
    id: string;
    tenantId: string;
    appId: string;
    apiName: string;
    name: string;
    description: string | null;
    code: unknown;
    inputSchema: unknown;
    status: string;
    version: number;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  }): CloudFunction {
    const code = (f.code ?? { source: '', language: 'javascript' }) as unknown as CloudFunctionCode;
    return {
      id: f.id,
      tenantId: f.tenantId,
      appId: f.appId,
      apiName: f.apiName,
      name: f.name,
      description: f.description ?? undefined,
      code,
      inputSchema: (f.inputSchema ?? undefined) as CloudFunctionInputParam[] | undefined,
      status: f.status as CloudFunctionStatus,
      version: f.version,
      createdById: f.createdById,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    };
  }
}
