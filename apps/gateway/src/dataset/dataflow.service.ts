/**
 * 数据流服务 — 数据流 CRUD + 执行调度 + 预览。
 */

import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { Queue } from 'bullmq';
import { prisma } from '@apaas/db';
import { ChangeLogService } from '../application/changelog.service.js';
import { DataFlowEngine } from './dataflow-engine.service.js';
import { DATASET_QUEUE } from '../queue/queue.constants.js';
import type {
  DataFlow,
  DataFlowConfig,
  CreateDataFlowRequest,
  UpdateDataFlowRequest,
  DataFlowPreviewResult,
} from '@apaas/shared';

@Injectable()
export class DataFlowService {
  constructor(
    private readonly changeLogService: ChangeLogService,
    private readonly engine: DataFlowEngine,
    @Inject(DATASET_QUEUE) private readonly datasetQueue: Queue,
  ) {}

  async list(tenantId: string, appId: string): Promise<DataFlow[]> {
    const flows = await prisma.dataFlow.findMany({
      where: { tenantId, appId },
      orderBy: { updatedAt: 'desc' },
    });
    return flows.map((f) => this.toDto(f));
  }

  async get(tenantId: string, flowId: string): Promise<DataFlow> {
    const flow = await prisma.dataFlow.findFirst({ where: { id: flowId, tenantId } });
    if (!flow) throw new NotFoundException('数据流不存在');
    return this.toDto(flow);
  }

  async create(
    tenantId: string,
    appId: string,
    createdBy: string,
    data: CreateDataFlowRequest,
  ): Promise<DataFlow> {
    const existing = await prisma.dataFlow.findFirst({
      where: { tenantId, appId, apiName: data.apiName },
    });
    if (existing) throw new BadRequestException(`数据流 API 名称 "${data.apiName}" 已存在`);

    const flow = await prisma.dataFlow.create({
      data: {
        tenantId,
        appId,
        apiName: data.apiName,
        name: data.name,
        description: data.description,
        config: data.config as object,
        createdBy,
      },
    });

    await this.changeLogService.log({
      tenantId,
      appId,
      module: 'CONNECTOR',
      entityType: 'DataFlow',
      entityId: flow.id,
      entityName: flow.name,
      changeType: 'CREATE',
      changedBy: createdBy,
    });

    return this.toDto(flow);
  }

  async update(
    tenantId: string,
    flowId: string,
    updatedBy: string,
    data: UpdateDataFlowRequest,
  ): Promise<DataFlow> {
    const existing = await prisma.dataFlow.findFirst({ where: { id: flowId, tenantId } });
    if (!existing) throw new NotFoundException('数据流不存在');

    const flow = await prisma.dataFlow.update({
      where: { id: flowId },
      data: {
        name: data.name,
        description: data.description,
        config: data.config as object | undefined,
        status: data.status,
      },
    });

    await this.changeLogService.log({
      tenantId,
      appId: existing.appId,
      module: 'CONNECTOR',
      entityType: 'DataFlow',
      entityId: flow.id,
      entityName: flow.name,
      changeType: 'UPDATE',
      changedBy: updatedBy,
    });

    return this.toDto(flow);
  }

  async delete(tenantId: string, flowId: string, deletedBy: string): Promise<void> {
    const existing = await prisma.dataFlow.findFirst({ where: { id: flowId, tenantId } });
    if (!existing) throw new NotFoundException('数据流不存在');

    // 删除关联的数据集（Cascade 会自动删除 DatasetRow）
    await prisma.dataset.deleteMany({ where: { sourceFlowId: flowId } });
    await prisma.dataFlow.delete({ where: { id: flowId } });

    await this.changeLogService.log({
      tenantId,
      appId: existing.appId,
      module: 'CONNECTOR',
      entityType: 'DataFlow',
      entityId: flowId,
      entityName: existing.name,
      changeType: 'DELETE',
      changedBy: deletedBy,
    });
  }

  /**
   * 预览数据流结果（不物化，限制 100 行）。
   */
  async preview(tenantId: string, flowId: string): Promise<DataFlowPreviewResult> {
    const flow = await prisma.dataFlow.findFirst({ where: { id: flowId, tenantId } });
    if (!flow) throw new NotFoundException('数据流不存在');
    const config = flow.config as unknown as DataFlowConfig;
    return this.engine.preview(tenantId, config);
  }

  /**
   * 执行数据流 — 创建/更新数据集并入队 BullMQ 异步执行。
   * 返回 datasetId。
   */
  async execute(tenantId: string, flowId: string): Promise<string> {
    const flow = await prisma.dataFlow.findFirst({ where: { id: flowId, tenantId } });
    if (!flow) throw new NotFoundException('数据流不存在');

    // 查找或创建关联数据集
    let dataset = await prisma.dataset.findFirst({
      where: { sourceFlowId: flowId, tenantId },
    });

    if (!dataset) {
      dataset = await prisma.dataset.create({
        data: {
          tenantId,
          appId: flow.appId,
          apiName: `${flow.apiName}_dataset`,
          name: `${flow.name} 数据集`,
          sourceFlowId: flowId,
          status: 'EMPTY',
        },
      });
    }

    // 设置为 REFRESHING 状态（实际执行由 BullMQ worker 处理）
    await prisma.dataset.update({
      where: { id: dataset.id },
      data: { status: 'REFRESHING' },
    });

    // 入队异步执行
    await this.datasetQueue.add('refresh', {
      datasetId: dataset.id,
      flowId,
      tenantId,
    });

    return dataset.id;
  }

  private toDto(f: {
    id: string;
    tenantId: string;
    appId: string;
    apiName: string;
    name: string;
    description: string | null;
    config: unknown;
    outputColumns: unknown;
    status: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  }): DataFlow {
    return {
      id: f.id,
      tenantId: f.tenantId,
      appId: f.appId,
      apiName: f.apiName,
      name: f.name,
      description: f.description ?? undefined,
      config: f.config as DataFlowConfig,
      outputColumns: f.outputColumns as DataFlow['outputColumns'] | undefined,
      status: f.status as DataFlow['status'],
      createdBy: f.createdBy,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    };
  }
}
