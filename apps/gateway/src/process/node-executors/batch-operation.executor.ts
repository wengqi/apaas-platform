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

import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { prisma, Prisma } from '@apaas/db';
import type { NodeExecutor, ExecutionContext, NodeExecutionResult } from '../types.js';
import { jsonLogicToPrismaWhere } from '../../shared/jsonlogic-to-prisma.js';
import { RecordService } from '../../record/record.service.js';
import { resolveFlowActorId } from './flow-actor.js';

/** 批量操作最大行数（与 env.validation.ts 的 BATCH_MAX_ROWS 一致）。 */
const BATCH_MAX_ROWS = Number(process.env.BATCH_MAX_ROWS) || 500;

/** 批量节点的保留输入键（不作为待写入字段）。 */
const RESERVED_INPUT_KEYS = new Set(['data', 'records', 'recordIds', 'filter']);

/**
 * 批量操作节点。
 *
 * 评审 P1-5：批量写操作统一复用 RecordService（记录写内核），
 * 使流程批量写入同样经过字段校验、AutoNumber/Formula/Rollup 计算与
 * triggerService.onRecordEvent 事件触发；单条 merge 语义亦由内核保证。
 */
@Injectable()
export class BatchOperationExecutor implements NodeExecutor {
  readonly type = 'batch_operation';

  constructor(
    @Inject(forwardRef(() => RecordService))
    private readonly recordService: RecordService,
  ) {}

  async execute(ctx: ExecutionContext): Promise<NodeExecutionResult> {
    const data = ctx.node.data as Record<string, unknown>;
    const operation = (data['operation'] as string) ?? 'create';
    const objectId = (data['objectId'] as string) ?? (data['object_id'] as string);

    if (!objectId) {
      throw new Error('批量操作节点缺少 objectId 配置');
    }

    switch (operation) {
      case 'create':
        return this.batchCreate(ctx, objectId);
      case 'update':
        return this.batchUpdate(ctx, objectId);
      case 'delete':
        return this.batchDelete(ctx, objectId);
      default:
        throw new Error(`不支持的批量操作: ${operation}`);
    }
  }

  /** 批量创建：inputs.records 为记录数据数组（评审 P1-5：复用记录写内核）。 */
  private async batchCreate(ctx: ExecutionContext, objectId: string): Promise<NodeExecutionResult> {
    const records = ctx.inputs['records'];
    if (!Array.isArray(records)) {
      throw new Error('批量创建节点的 inputs.records 必须是数组');
    }
    if (records.length > BATCH_MAX_ROWS) {
      throw new Error(`批量创建 ${records.length} 条超过上限 ${BATCH_MAX_ROWS}`);
    }

    const result = await this.recordService.batchCreate(
      ctx.tenantId,
      objectId,
      resolveFlowActorId(ctx),
      records as Record<string, unknown>[],
    );
    if (result.errors.length > 0) {
      // 与 API 路径一致：部分失败时透出错误明细，避免"看似成功但部分未写入"
      throw new Error(
        `批量创建部分失败（成功 ${result.created} / 失败 ${result.errors.length}）: ${result.errors
          .slice(0, 3)
          .map((e) => `#${e.row} ${e.message}`)
          .join('; ')}`,
      );
    }
    return { output: { createdCount: result.created } };
  }

  /** 批量更新：inputs.data 为更新字段值，范围 = inputs.recordIds 或 data.filter。 */
  private async batchUpdate(ctx: ExecutionContext, objectId: string): Promise<NodeExecutionResult> {
    // 兼容两种配置形状：inputs.data = {字段: 值}（文档约定）或扁平 inputs（与对象操作节点一致）
    const updateData = this.resolveUpdatePayload(ctx);

    const where = await this.buildScopeWhere(ctx, objectId);

    // 评审 P0-1 + P1-5：逐条 merge 由记录写内核完成（含公式/Rollup/事件）
    const targets = await prisma.record.findMany({ where, select: { id: true } });
    if (targets.length === 0) return { output: { affectedCount: 0 } };

    const result = await this.recordService.batchUpdate(
      ctx.tenantId,
      targets.map((t) => t.id),
      resolveFlowActorId(ctx),
      updateData as Record<string, unknown>,
    );
    return { output: { affectedCount: result.updated } };
  }

  /** 批量删除：范围 = inputs.recordIds 或 data.filter（评审 P1-5：复用写内核）。 */
  private async batchDelete(ctx: ExecutionContext, objectId: string): Promise<NodeExecutionResult> {
    const where = await this.buildScopeWhere(ctx, objectId);
    const targets = await prisma.record.findMany({ where, select: { id: true } });
    if (targets.length === 0) return { output: { affectedCount: 0 } };

    const result = await this.recordService.batchDelete(
      ctx.tenantId,
      targets.map((t) => t.id),
    );
    return { output: { affectedCount: result.deleted } };
  }

  /** 解析批量更新的字段载荷（优先 inputs.data，回退扁平 inputs）。 */
  private resolveUpdatePayload(ctx: ExecutionContext): Record<string, unknown> {
    const nested = ctx.inputs['data'];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
    const flat: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(ctx.inputs)) {
      if (!RESERVED_INPUT_KEYS.has(key)) flat[key] = value;
    }
    if (Object.keys(flat).length > 0) return flat;
    throw new Error('批量更新节点的 inputs.data 必须是字段键值对象');
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
