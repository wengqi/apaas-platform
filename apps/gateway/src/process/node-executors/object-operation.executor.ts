/**
 * ObjectOperationExecutor — 对象操作节点。
 *
 * 定位：对 aPaaS 对象记录执行 CRUD，是流程与数据建模的桥梁。
 * 配置项（node.data）：operation（create/update/query/delete）/ objectId /
 *   recordId（update/delete 指定记录）/ filter（查询条件 JSON）/ resultVariable（查询结果变量名）。
 * 输入（inputs）：create/update 的字段值（编辑器将字段映射为 inputsValues，key=字段 apiName）。
 * 输出：create→{ recordId } / update·delete→{ affectedCount } / query→{ records, record }。
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { prisma, Prisma } from '@apaas/db';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';
import { jsonLogicToPrismaWhere } from '../../shared/jsonlogic-to-prisma.js';

@Injectable()
export class ObjectOperationExecutor implements NodeExecutor {
  private readonly logger = new Logger(ObjectOperationExecutor.name);
  readonly type = 'object_operation';

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const operation = (data['operation'] as string) ?? 'query';
    const objectId = (data['objectId'] as string) ?? (data['object_id'] as string);

    if (!objectId) {
      throw new Error('对象操作节点缺少 objectId 配置');
    }

    switch (operation) {
      case 'create':
        return this.create(ctx, objectId);
      case 'update':
        return this.update(ctx, objectId);
      case 'delete':
        return this.delete(ctx, objectId);
      case 'query':
        return this.query(ctx, objectId);
      default:
        throw new Error(`不支持的对象操作: ${operation}`);
    }
  }

  /** 创建记录。 */
  private async create(ctx: ExecutionContext, objectId: string): Promise<NodeExecutionResult> {
    const obj = await prisma.objectMeta.findFirst({
      where: { id: objectId, tenantId: ctx.tenantId },
    });
    if (!obj) throw new NotFoundException(`对象 ${objectId} 不存在`);

    const recordData = { ...ctx.inputs };
    const record = await prisma.record.create({
      data: {
        tenantId: ctx.tenantId,
        appId: obj.appId,
        objectId,
        data: recordData as Prisma.InputJsonValue,
      },
    });
    return { output: { recordId: record.id, record } };
  }

  /** 更新记录。 */
  private async update(ctx: ExecutionContext, objectId: string): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const recordId = (data['recordId'] as string) ?? (ctx.inputs['recordId'] as string);
    if (!recordId) throw new Error('对象更新节点缺少 recordId');

    // 仅取非 recordId 的字段作为更新数据
    const updateData: Record<string, unknown> = { ...ctx.inputs };
    delete updateData['recordId'];

    const result = await prisma.record.updateMany({
      where: { id: recordId, tenantId: ctx.tenantId, objectId },
      data: { data: updateData as Prisma.InputJsonValue },
    });
    return { output: { affectedCount: result.count, recordId } };
  }

  /** 删除记录。 */
  private async delete(ctx: ExecutionContext, objectId: string): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const recordId = (data['recordId'] as string) ?? (ctx.inputs['recordId'] as string);

    let count: number;
    if (recordId) {
      const result = await prisma.record.deleteMany({
        where: { id: recordId, tenantId: ctx.tenantId, objectId },
      });
      count = result.count;
    } else {
      // 按筛选条件删除
      const where = this.buildWhere(ctx.tenantId, objectId, data['filter']);
      const result = await prisma.record.deleteMany({ where });
      count = result.count;
    }
    return { output: { affectedCount: count } };
  }

  /** 查询记录。 */
  private async query(ctx: ExecutionContext, objectId: string): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const where = this.buildWhere(ctx.tenantId, objectId, data['filter']);
    const records = await prisma.record.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const output: Record<string, unknown> = {
      records,
      record: records[0] ?? null,
      count: records.length,
    };

    // 查询结果映射到全局变量
    const resultVariable =
      (data['resultVariable'] as string) ?? (data['result_variable'] as string);
    if (resultVariable) {
      const global = (ctx.variables['global'] as Record<string, unknown>) ?? {};
      global[resultVariable] = records;
      ctx.variables['global'] = global;
    }

    return { output };
  }

  /**
   * 构建查询 where 子句。
   * filter 支持 JsonLogic JSON 字符串，如 {"==": [{"var":"status"}, "active"]}
   */
  private buildWhere(tenantId: string, objectId: string, filter: unknown): Prisma.RecordWhereInput {
    const where: Prisma.RecordWhereInput = { tenantId, objectId };
    if (!filter) return where;
    try {
      const rule = typeof filter === 'string' ? JSON.parse(filter) : filter;
      const filterWhere = jsonLogicToPrismaWhere(rule);
      if (filterWhere) {
        where.AND = [filterWhere];
      }
    } catch {
      // 解析失败，忽略筛选条件
    }
    return where;
  }
}
