/**
 * 数据集行查询服务 — 分页/筛选/排序（复用 jsonLogicToPrismaWhere）。
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Prisma } from '@apaas/db';
import { jsonLogicToPrismaWhere } from '../shared/jsonlogic-to-prisma.js';
import type { DatasetRowListResponse } from '@apaas/shared';

const SYSTEM_SORT_FIELDS = new Set(['id', 'createdAt']);

@Injectable()
export class DatasetRowService {
  async query(
    tenantId: string,
    datasetId: string,
    params: { page?: number; pageSize?: number; sort?: string; filter?: string },
  ): Promise<DatasetRowListResponse> {
    // 校验数据集归属
    const dataset = await prisma.dataset.findFirst({ where: { id: datasetId, tenantId } });
    if (!dataset) throw new NotFoundException('数据集不存在');

    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

    const where: Prisma.DatasetRowWhereInput = { tenantId, datasetId };

    // 应用 filter（JsonLogic）
    if (params.filter) {
      try {
        const parsed = JSON.parse(params.filter);
        const filterWhere = jsonLogicToPrismaWhere(parsed);
        if (filterWhere) {
          // jsonLogicToPrismaWhere 返回 RecordWhereInput，DatasetRow 结构相同（JSONB data 列）
          where.AND = [filterWhere as unknown as Prisma.DatasetRowWhereInput];
        }
      } catch {
        // filter 解析失败时忽略
      }
    }

    // 排序
    const orderBy = this.buildOrderBy(params.sort);

    const [items, total] = await Promise.all([
      prisma.datasetRow.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.datasetRow.count({ where }),
    ]);

    return {
      items: items.map((r) => r.data as Record<string, unknown>),
      total,
      page,
      pageSize,
    };
  }

  private buildOrderBy(sort?: string): Prisma.DatasetRowOrderByWithRelationInput {
    if (!sort) return { createdAt: 'desc' };
    const [field, order] = sort.split(':');
    if (!field) return { createdAt: 'desc' };
    const sortOrder = order === 'asc' ? 'asc' : 'desc';
    if (SYSTEM_SORT_FIELDS.has(field)) {
      return { [field]: sortOrder };
    }
    // JSONB 字段排序（与 RecordService 相同的限制：按整体 data 列排序）
    return { data: sortOrder };
  }
}
