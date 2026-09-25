/**
 * BatchOperationExecutor — 批量操作节点。
 *
 * 定位：对对象记录执行批量 CRUD（区别于 object_operation 的单记录操作）。
 * 配置项（node.data）：operation（create/update/delete）/ objectId /
 *   filter（update/delete 的 JsonLogic 筛选）/ loopNodeId 引用的集合等。
 * 输入（inputs）：
 *   - create：records = 记录数据数组（如循环节点收集的列表）
 *   - update：data = 要更新的字段值；recordIds 可选（指定记录集，缺省用 filter）
 * 输出：create→{ createdCount } / update·delete→{ affectedCount }。
 * 上限：批量行数受 BATCH_MAX_ROWS 环境变量约束（默认 500，与 record 模块一致）。
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Prisma } from '@apaas/db';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';
import { jsonLogicToPrismaWhere } from '../../shared/jsonlogic-to-prisma.js';

/** 批量操作最大行数（与 env.validation.ts 的 BATCH_MAX_ROWS 一致）。 */
const BATCH_MAX_ROWS = Number(process.env.BATCH_MAX_ROWS) || 500;

@Injectable()
export class BatchOperationExecutor implements NodeExecutor {
  readonly type = 'batch_operation';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const operation = (data['operation'] as string) ?? 'create';
    const objectId = (data['objectId'] as string) ?? (data['object_id'] as string);

    if (!objectId) {
      throw new Error('批量操作节点缺少 objectId 配置');
    }

    const obj = await prisma.objectMeta.findFirst({
      where: { id: objectId, tenantId: ctx.tenantId },
    });
    if (!obj) throw new NotFoundException(`对象 ${objectId} 不存在`);

    switch (operation) {
      case 'create':
        return this.batchCreate(ctx, objectId, obj.appId);
      case 'update':
        return this.batchUpdate(ctx, objectId);
      case 'delete':
        return this.batchDelete(ctx, objectId);
      default:
        throw new Error(`不支持的批量操作: ${operation}`);
    }
  }

  /** 批量创建：inputs.records 为记录数据数组。 */
  private async batchCreate(
    ctx: ExecutionContext,
    objectId: string,
    appId: string,
  ): Promise<NodeExecutionResult> {
    const records = ctx.inputs['records'];
    if (!Array.isArray(records)) {
      throw new Error('批量创建节点的 inputs.records 必须是数组');
    }
    if (records.length > BATCH_MAX_ROWS) {
      throw new Error(`批量创建 ${records.length} 条超过上限 ${BATCH_MAX_ROWS}`);
    }

    const result = await prisma.record.createMany({
      data: records.map((r) => ({
        tenantId: ctx.tenantId,
        appId,
        objectId,
        data: (r ?? {}) as Prisma.InputJsonValue,
      })),
    });
    return { output: { createdCount: result.count } };
  }

  /** 批量更新：inputs.data 为更新字段值，范围 = inputs.recordIds 或 data.filter。 */
  private async batchUpdate(ctx: ExecutionContext, objectId: string): Promise<NodeExecutionResult> {
    const updateData = ctx.inputs['data'];
    if (!updateData || typeof updateData !== 'object' || Array.isArray(updateData)) {
      throw new Error('批量更新节点的 inputs.data 必须是字段键值对象');
    }

    const where = await this.buildScopeWhere(ctx, objectId);
    const result = await prisma.record.updateMany({
      where,
      data: { data: updateData as Prisma.InputJsonValue },
    });
    return { output: { affectedCount: result.count } };
  }

  /** 批量删除：范围 = inputs.recordIds 或 data.filter。 */
  private async batchDelete(ctx: ExecutionContext, objectId: string): Promise<NodeExecutionResult> {
    const where = await this.buildScopeWhere(ctx, objectId);
    const result = await prisma.record.deleteMany({ where });
    return { output: { affectedCount: result.count } };
  }

  /** 构建批量范围 where：优先 recordIds（校验归属），否则 JsonLogic filter，都缺省则报错。 */
  private async buildScopeWhere(
    ctx: ExecutionContext,
    objectId: string,
  ): Promise<Prisma.RecordWhereInput> {
    const data = ctx.node.data as Record<string, unknown>;
    const recordIds = ctx.inputs['recordIds'];

    if (Array.isArray(recordIds) && recordIds.length > 0) {
      if (recordIds.length > BATCH_MAX_ROWS) {
        throw new Error(`批量操作 ${recordIds.length} 条记录超过上限 ${BATCH_MAX_ROWS}`);
      }
      return { tenantId: ctx.tenantId, objectId, id: { in: recordIds as string[] } };
    }

    const filter = data['filter'] ?? ctx.inputs['filter'];
    if (!filter) {
      throw new Error('批量操作缺少范围（recordIds 或 filter），拒绝全表操作');
    }

    const where: Prisma.RecordWhereInput = { tenantId: ctx.tenantId, objectId };
    try {
      const rule = typeof filter === 'string' ? JSON.parse(filter) : filter;
      const filterWhere = jsonLogicToPrismaWhere(rule);
      if (filterWhere) {
        where.AND = [filterWhere];
      }
    } catch {
      throw new Error('批量操作的 filter 不是有效的 JsonLogic 规则');
    }
    return where;
  }
}
