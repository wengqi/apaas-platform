import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { prisma, Prisma } from '@apaas/db';
import { FieldType } from '@apaas/shared';
import { FormulaEngine } from '../object/formula-engine.js';
import { AutoNumberGenerator } from '../object/auto-number.js';
import { TriggerService } from '../process/trigger.service.js';
import { translateCondition } from '../permission/condition-translator.js';
import { jsonLogicToPrismaWhere } from '../shared/jsonlogic-to-prisma.js';
import type { PermissionContext } from '../auth/authenticated-request.js';

/**
 * 存储在 ObjectMeta.fields JSON 数组中的字段定义（与 object.service.ts 的 StoredField 一致）。
 * 此处仅声明计算所需的最小结构。
 */
interface ObjectField {
  id: string;
  apiName: string;
  type: string;
  config: unknown;
}

/** 查询记录参数。 */
export interface RecordQueryParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  filter?: string;
}

/** 查询结果项。 */
export interface RecordResult {
  id: string;
  tenantId: string;
  appId: string;
  objectId: string;
  data: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 分页查询结果。 */
export interface PaginatedRecords {
  items: RecordResult[];
  total: number;
  page: number;
  pageSize: number;
}

/** 系统字段（直接存于 records 表列，非 data JSON）。 */
const SYSTEM_SORT_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy']);

/** 自动编号配置的最小结构。 */
interface AutoNumberFieldConfig {
  autoNumber?: { format?: string };
}

/**
 * 记录服务 — 基于 JSONB 宽表的记录 CRUD。
 *
 * 所有业务记录统一存于 records 表，字段值存于 data JSONB 列。
 * 查询使用 Prisma 的 JSONB path 过滤与排序。
 * 所有方法返回 plain data，不做 brand 类型转换。
 *
 * 集成公式引擎与自动编号：
 *   - create：先为 AutoNumber 字段生成编号，再计算 Formula 字段，结果写入 data
 *   - update：重新计算 Formula 字段（依赖字段可能已变）；AutoNumber 字段不可更新（忽略）
 */
@Injectable()
export class RecordService {
  constructor(
    private readonly formulaEngine: FormulaEngine,
    private readonly autoNumberGenerator: AutoNumberGenerator,
    @Inject(forwardRef(() => TriggerService))
    private readonly triggerService: TriggerService,
  ) {}
  // ===========================================================================
  // 查询
  // ===========================================================================

  /**
   * 分页查询记录（支持筛选 / 排序 / 行级权限过滤 / 字段级投影）。
   * 用 Prisma 的 JSONB path 查询过滤 data JSON 内的字段值。
   *
   * @param permissionContext 权限上下文（condition 注入 where，fieldScope 投影 data 字段）
   */
  async query(
    tenantId: string,
    objectId: string,
    params: RecordQueryParams,
    permissionContext?: PermissionContext,
  ): Promise<PaginatedRecords> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

    // 构建 where 子句
    const where: Prisma.RecordWhereInput = { tenantId, objectId };

    // 视图筛选（JsonLogic JSON 字符串）
    const filterWhere = this.parseFilter(params.filter);
    if (filterWhere) {
      where.AND = [filterWhere];
    }

    // 注入行级权限条件
    if (permissionContext?.condition) {
      const conditionWhere = translateCondition(permissionContext.condition, {
        currentUser: permissionContext.currentUserId,
      });
      if (conditionWhere) {
        if (where.AND) {
          (where.AND as Prisma.RecordWhereInput[]).push(conditionWhere);
        } else {
          where.AND = [conditionWhere];
        }
      }
    }

    // 构建 orderBy
    const orderBy = this.buildOrderBy(params.sort);

    const [records, total] = await Promise.all([
      prisma.record.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.record.count({ where }),
    ]);

    return {
      items: records.map((r) => this.toResult(r, permissionContext?.fieldScope)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 按 ID 查单条记录（支持字段级投影）。
   *
   * @param permissionContext 权限上下文（fieldScope 投影 data 字段）
   */
  async get(
    tenantId: string,
    recordId: string,
    permissionContext?: PermissionContext,
  ): Promise<RecordResult> {
    const record = await prisma.record.findFirst({
      where: { id: recordId, tenantId },
    });
    if (!record) throw new NotFoundException('记录不存在');
    return this.toResult(record, permissionContext?.fieldScope);
  }

  /**
   * 创建记录。
   * appId 从对象元数据中获取（路由不含 appId）。
   *
   * 创建前处理：
   *   1. 遍历对象 fields，为 AutoNumber 字段生成编号并写入 data
   *   2. 遍历对象 fields，计算 Formula 字段并写入 data
   */
  async create(
    tenantId: string,
    objectId: string,
    userId: string,
    data: Record<string, unknown>,
  ): Promise<RecordResult> {
    // 校验对象存在且属于该租户，同时获取 appId 与字段定义
    const obj = await prisma.objectMeta.findFirst({
      where: { id: objectId, tenantId },
    });
    if (!obj) throw new NotFoundException('对象不存在');

    const fields = this.parseFields(obj.fields);

    // 复制入参 data，避免修改调用方传入的对象
    const computedData: Record<string, unknown> = { ...data };

    // 1. 生成 AutoNumber 字段编号
    for (const field of fields) {
      if (field.type !== FieldType.AutoNumber) continue;
      const config = field.config as AutoNumberFieldConfig | undefined;
      const format = config?.autoNumber?.format;
      if (!format) continue;
      // 用户即便传了该字段值也以系统生成为准（自动编号由系统掌控）
      computedData[field.apiName] = await this.autoNumberGenerator.generate(format, objectId);
    }

    // 2. 计算 Formula 字段（基于已含自动编号的 data）
    const formulaResults = this.formulaEngine.computeRecordFields(
      fields as unknown as import('@apaas/shared').Field[],
      computedData,
    );
    Object.assign(computedData, formulaResults);

    const record = await prisma.record.create({
      data: {
        tenantId,
        appId: obj.appId,
        objectId,
        data: computedData as Prisma.InputJsonValue,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    // 触发记录创建事件（非阻塞）
    const result = this.toResult(record);
    void this.triggerService.onRecordEvent(tenantId, obj.appId, objectId, 'created', {
      id: record.id,
      ...(record.data as Record<string, unknown>),
    });

    return result;
  }

  /**
   * 更新记录（部分更新，merge）。
   *
   * 更新处理：
   *   1. AutoNumber 字段不可更新 —— 从入参 data 中剔除
   *   2. 合并旧数据与新数据后，重新计算 Formula 字段（依赖字段可能已变）
   */
  async update(
    tenantId: string,
    recordId: string,
    userId: string,
    data: Record<string, unknown>,
  ): Promise<RecordResult> {
    const existing = await prisma.record.findFirst({
      where: { id: recordId, tenantId },
      include: { object: { select: { fields: true } } },
    });
    if (!existing) throw new NotFoundException('记录不存在');

    const fields = this.parseFields(existing.object.fields);

    // 1. 剔除入参中的 AutoNumber 字段（自动编号不可更新）
    const incoming: Record<string, unknown> = { ...data };
    for (const field of fields) {
      if (field.type === FieldType.AutoNumber) {
        delete incoming[field.apiName];
      }
    }

    // 部分更新：合并旧数据与新数据
    const mergedData: Record<string, unknown> = {
      ...(existing.data as Record<string, unknown>),
      ...incoming,
    };

    // 2. 重新计算 Formula 字段
    const formulaResults = this.formulaEngine.computeRecordFields(
      fields as unknown as import('@apaas/shared').Field[],
      mergedData,
    );
    Object.assign(mergedData, formulaResults);

    const record = await prisma.record.update({
      where: { id: recordId },
      data: {
        data: mergedData as Prisma.InputJsonValue,
        updatedBy: userId,
      },
    });

    // 触发记录更新事件（非阻塞）
    const result = this.toResult(record);
    void this.triggerService.onRecordEvent(tenantId, existing.appId, existing.objectId, 'updated', {
      id: record.id,
      ...mergedData,
    });

    return result;
  }

  /**
   * 删除记录。
   */
  async delete(tenantId: string, recordId: string): Promise<void> {
    // 先查记录信息（删除后无法获取 appId/objectId）
    const existing = await prisma.record.findFirst({
      where: { id: recordId, tenantId },
      select: { appId: true, objectId: true, data: true },
    });
    if (!existing) throw new NotFoundException('记录不存在');

    const result = await prisma.record.deleteMany({
      where: { id: recordId, tenantId },
    });
    if (result.count === 0) throw new NotFoundException('记录不存在');

    // 触发记录删除事件（非阻塞）
    void this.triggerService.onRecordEvent(tenantId, existing.appId, existing.objectId, 'deleted', {
      id: recordId,
      ...(existing.data as Record<string, unknown>),
    });
  }

  // ===========================================================================
  // 辅助方法
  // ===========================================================================

  /**
   * 安全解析 ObjectMeta.fields JSON 为字段数组。
   * Prisma 返回的 JsonValue 需断言为 ObjectField[]。
   */
  private parseFields(raw: unknown): ObjectField[] {
    if (!Array.isArray(raw)) return [];
    return raw as ObjectField[];
  }

  /**
   * 将 Prisma Record 映射为返回结果。
   * 若提供了 fieldScope，则仅保留白名单内的字段（字段级权限）。
   */
  private toResult(
    record: Prisma.RecordGetPayload<Record<string, unknown>>,
    fieldScope?: string[] | null,
  ): RecordResult {
    const fullData = (record.data as Record<string, unknown>) ?? {};

    // 字段级投影：仅保留 fieldScope 白名单中的字段
    const data =
      fieldScope && fieldScope.length > 0
        ? Object.fromEntries(Object.entries(fullData).filter(([key]) => fieldScope.includes(key)))
        : fullData;

    return {
      id: record.id,
      tenantId: record.tenantId,
      appId: record.appId,
      objectId: record.objectId,
      data,
      createdBy: record.createdBy,
      updatedBy: record.updatedBy,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * 解析 filter 查询参数（JsonLogic JSON 字符串）为 Prisma where 片段。
   * 接受格式：JsonLogic JSON 对象，如 {"==": [{"var":"status"}, "active"]}
   */
  private parseFilter(filterStr?: string): Prisma.RecordWhereInput | null {
    if (!filterStr) return null;
    try {
      const parsed = JSON.parse(filterStr);
      if (!parsed || typeof parsed !== 'object') return null;
      return jsonLogicToPrismaWhere(parsed);
    } catch {
      return null;
    }
  }

  /**
   * 构建 orderBy：支持系统字段列排序。
   * sort 格式："fieldApiName:asc" 或 "fieldApiName:desc"
   *
   * 注：Prisma 5.x 的 orderBy 不直接支持 JSONB path 排序（需 raw SQL）。
   * 系统字段（id/createdAt/updatedAt/createdBy/updatedBy）按列排序；
   * 非 JSONB 路径排序将在后续迭代通过 raw query 增强。
   */
  private buildOrderBy(sort?: string): Prisma.RecordOrderByWithRelationInput {
    if (!sort) return { createdAt: 'desc' };

    const [field, orderStr] = sort.split(':');
    const order = orderStr === 'asc' ? 'asc' : 'desc';

    if (!field) return { createdAt: 'desc' };

    // 系统字段直接按列排序
    if (SYSTEM_SORT_FIELDS.has(field)) {
      return { [field]: order } as Prisma.RecordOrderByWithRelationInput;
    }

    // JSONB data 字段仅支持整体排序方向（path 排序需 raw SQL）
    return { data: order } as Prisma.RecordOrderByWithRelationInput;
  }
}
