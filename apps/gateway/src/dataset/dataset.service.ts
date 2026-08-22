/**
 * 数据集服务 — 数据集 CRUD + 刷新调度。
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@apaas/db';
import { DataFlowService } from './dataflow.service.js';
import type { Dataset, DatasetColumn } from '@apaas/shared';

@Injectable()
export class DatasetService {
  constructor(private readonly dataFlowService: DataFlowService) {}

  async list(tenantId: string, appId: string): Promise<Dataset[]> {
    const datasets = await prisma.dataset.findMany({
      where: { tenantId, appId },
      orderBy: { updatedAt: 'desc' },
    });
    return datasets.map((d) => this.toDto(d));
  }

  async get(tenantId: string, datasetId: string): Promise<Dataset> {
    const dataset = await prisma.dataset.findFirst({ where: { id: datasetId, tenantId } });
    if (!dataset) throw new NotFoundException('数据集不存在');
    return this.toDto(dataset);
  }

  async delete(tenantId: string, datasetId: string): Promise<void> {
    const existing = await prisma.dataset.findFirst({ where: { id: datasetId, tenantId } });
    if (!existing) throw new NotFoundException('数据集不存在');
    // DatasetRow 通过 onDelete: Cascade 自动删除
    await prisma.dataset.delete({ where: { id: datasetId } });
  }

  /**
   * 刷新数据集 — 重新执行关联的数据流。
   * 返回 datasetId（实际执行由 BullMQ worker 异步处理）。
   */
  async refresh(tenantId: string, datasetId: string): Promise<string> {
    const dataset = await prisma.dataset.findFirst({ where: { id: datasetId, tenantId } });
    if (!dataset) throw new NotFoundException('数据集不存在');
    // 委托给 DataFlowService.execute（它会设置 REFRESHING 状态）
    return this.dataFlowService.execute(tenantId, dataset.sourceFlowId);
  }

  private toDto(d: {
    id: string;
    tenantId: string;
    appId: string;
    apiName: string;
    name: string;
    description: string | null;
    sourceFlowId: string;
    status: string;
    rowCount: number;
    columns: unknown;
    lastRefreshedAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Dataset {
    return {
      id: d.id,
      tenantId: d.tenantId,
      appId: d.appId,
      apiName: d.apiName,
      name: d.name,
      description: d.description ?? undefined,
      sourceFlowId: d.sourceFlowId,
      status: d.status as Dataset['status'],
      rowCount: d.rowCount,
      columns: d.columns as DatasetColumn[],
      lastRefreshedAt: d.lastRefreshedAt?.toISOString(),
      lastError: d.lastError ?? undefined,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }
}
