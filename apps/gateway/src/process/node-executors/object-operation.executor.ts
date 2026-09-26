/**
 * ObjectOperationExecutor — 对象操作节点。
 *
 * 定位：对 aPaaS 对象记录执行 CRUD，是流程与数据建模的桥梁。
 * 配置项（node.data）：operation（create/update/query/delete）/ objectId /
 *   recordId（update/delete 指定记录）/ filter（查询条件 JSON）/ resultVariable（查询结果变量名）。
 * 输入（inputs）：create/update 的字段值（编辑器将字段映射为 inputsValues，key=字段 apiName）。
 * 输出：create→{ recordId } / update·delete→{ affectedCount } / query→{ records, record }。
 */

import { Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { prisma, Prisma } from '@apaas/db';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';
import { jsonLogicToPrismaWhere } from '../../shared/jsonlogic-to-prisma.js';
import { RecordService } from '../../record/record.service.js';
import { resolveFlowActorId } from './flow-actor.js';

/** 筛选范围删除的候选行上限（与批量操作一致，防止无界删除）。 */
const FILTER_DELETE_MAX_ROWS = Number(process.env.BATCH_MAX_ROWS) || 500;

/**
 * 对象操作节点。
 *
 * 评审 P1-5：写操作统一走 RecordService（记录写内核），与主 API 路径共享
 * 字段校验、AutoNumber/Formula/Rollup 计算、行级权限条件注入与
 * triggerService.onRecordEvent 事件触发（此前直接 prisma.record.* 写库，
 * 导致流程写入的记录缺编号/公式、父记录 Rollup 不更新、且不触发其他流程）。
 * 查询路径仍为系统范围直读（流程上下文无终端用户行级条件）。
 */
@Injectable()
export class ObjectOperationExecutor implements NodeExecutor {
  private readonly logger = new Logger(ObjectOperationExecutor.name);
  readonly type = 'object_operation';

  constructor(
    @Inject(forwardRef(() => RecordService))
    private readonly recordService: RecordService,
  ) {}

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
        return this.update(ctx);
      case 'delete':
        return this.delete(ctx, objectId);
      case 'query':
        return this.query(ctx, objectId);
      default:
        throw new Error(`不支持的对象操作: ${operation}`);
    }
  }

  /** 创建记录（评审 P1-5：复用记录写内核）。 */
  private async create(ctx: ExecutionContext, objectId: string): Promise<NodeExecutionResult> {
    const record = await this.recordService.create(
      ctx.tenantId,
      objectId,
      resolveFlowActorId(ctx),
      { ...ctx.inputs },
    );
    return { output: { recordId: record.id, record } };
  }

  /** 更新记录。 */
  private async update(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const recordId = (data['recordId'] as string) ?? (ctx.inputs['recordId'] as string);
    if (!recordId) throw new Error('对象更新节点缺少 recordId');

    // 仅取非 recordId 的字段作为更新数据
    const updateData: Record<string, unknown> = { ...ctx.inputs };
    delete updateData['recordId'];

    // 评审 P1-5：复用记录写内核（部分更新 merge + 公式/Rollup 重算 + 记录事件）
    try {
      await this.recordService.update(ctx.tenantId, recordId, resolveFlowActorId(ctx), updateData);
    } catch (err) {
      // 保持原语义：recordId/objectId 不匹配或不存在时显式失败（此前静默 COMPLETED）
      if (err instanceof NotFoundException) {
        throw new Error('对象更新节点未命中任何记录（recordId 或 objectId 不匹配）');
      }
      throw err;
    }
    return { output: { affectedCount: 1, recordId } };
  }

  /** 删除记录。 */
  private async delete(ctx: ExecutionContext, objectId: string): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const recordId = (data['recordId'] as string) ?? (ctx.inputs['recordId'] as string);

    const actor = resolveFlowActorId(ctx);
    if (recordId) {
      // 评审 P1-5：走记录写内核（含删除事件触发）
      await this.recordService.delete(ctx.tenantId, recordId, undefined, actor);
      return { output: { affectedCount: 1 } };
    }

    // 按筛选条件删除：先解析受影响的记录 ID（有界），再走批量删除内核
    const where = this.buildWhere(ctx.tenantId, objectId, data['filter']);
    const targets = await prisma.record.findMany({
      where,
      select: { id: true },
      take: FILTER_DELETE_MAX_ROWS,
    });
    if (targets.length === 0) return { output: { affectedCount: 0 } };

    const result = await this.recordService.batchDelete(
      ctx.tenantId,
      targets.map((t) => t.id),
    );
    return { output: { affectedCount: result.deleted } };
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
