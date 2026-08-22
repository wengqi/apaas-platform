/**
 * 云函数服务 — CRUD + 发布 + 执行。
 *
 * 克隆 Connector 模式：CRUD 操作带 tenantId 隔离 + ChangeLog 记录，
 * 执行委托给 CloudFunctionRunner（沙箱引擎）。
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import { ChangeLogService } from '../application/changelog.service.js';
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

@Injectable()
export class CloudFunctionService {
  constructor(
    private readonly changeLogService: ChangeLogService,
    private readonly runner: CloudFunctionRunner,
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
  async get(tenantId: string, functionId: string): Promise<CloudFunction> {
    const fn = await prisma.cloudFunction.findFirst({
      where: { id: functionId, tenantId },
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
    functionId: string,
    updatedBy: string,
    data: UpdateCloudFunctionRequest,
  ): Promise<CloudFunction> {
    const existing = await prisma.cloudFunction.findFirst({
      where: { id: functionId, tenantId },
    });
    if (!existing) throw new NotFoundException('云函数不存在');

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
  async delete(tenantId: string, functionId: string, deletedBy: string): Promise<void> {
    const existing = await prisma.cloudFunction.findFirst({
      where: { id: functionId, tenantId },
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
  async publish(tenantId: string, functionId: string, publishedBy: string): Promise<CloudFunction> {
    const existing = await prisma.cloudFunction.findFirst({
      where: { id: functionId, tenantId },
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

    return this.runner.execute(code.source, input, tenantId, fn.appId);
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
