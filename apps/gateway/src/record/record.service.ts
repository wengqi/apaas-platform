import {
  Logger,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { prisma, Prisma, getEnvironmentId } from '@apaas/db';
import { FieldType } from '@apaas/shared';
import type {
  BatchCreateResult,
  BatchUpdateResult,
  BatchDeleteResult,
  ImportError,
} from '@apaas/shared';
import { FormulaEngine } from '../object/formula-engine.js';
import { RollupService } from './rollup.service.js';
import { AutoNumberGenerator } from '../object/auto-number.js';
import { TriggerService } from '../process/trigger.service.js';
import { EnvironmentResolverService } from '../environment/environment-resolver.service.js';
import { translateCondition } from '../permission/condition-translator.js';
import { jsonLogicToPrismaWhere } from '../shared/jsonlogic-to-prisma.js';
import {
  buildFieldOrderSql,
  compareFieldValues,
  extractContainmentFilter,
  parseSortSpec,
  type SortSpec,
} from './record-query.js';
import type { PermissionContext } from '../auth/authenticated-request.js';
import { writeAudit } from '../common/audit.js';

/**
 * 存储在 ObjectMeta.fields JSON 数组中的字段定义（与 object.service.ts 的 StoredField 一致）。
 * 此处仅声明计算所需的最小结构（required/unique/label/isSystem 供 D-002 约束校验消费）。
 */
interface ObjectField {
  id: string;
  apiName: string;
  type: string;
  config: unknown;
  label?: string;
  required?: boolean;
  unique?: boolean;
  isSystem?: boolean;
}

/** 查询记录参数。 */
export interface RecordQueryParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  filter?: string;
  /**
   * 关键词搜索（P1 运维治理：对象级搜索配置消费）。
   * 只匹配对象字段中 searchable=true 的文本类字段（contains，大小写敏感）；
   * 字段全部不可搜索时忽略该参数（不出空结果）。
   */
  keyword?: string;
}

/** 关键词搜索覆盖的字段类型（字符串值域；数值/日期等类型不参与 contains）。 */
const KEYWORD_SEARCHABLE_FIELD_TYPES = new Set<string>([
  'text',
  'long_text',
  'rich_text',
  'auto_number',
]);

/**
 * 构建关键词搜索 where（纯函数，OR over searchable 文本字段）。
 * 对象无此类 searchable 字段或关键词为空白时返回 null（不过滤，不出空结果）。
 * 可搜索文本类字段 = FieldType.Text/LongText/RichText/AutoNumber（字符串值域）。
 */
export function buildKeywordWhereFromFields(
  fields: unknown,
  keyword: string | undefined,
): Prisma.RecordWhereInput | null {
  const trimmed = keyword?.trim();
  if (!trimmed) return null;
  const fieldList = Array.isArray(fields) ? fields : [];
  const searchableNames = fieldList
    .map((f) => f as { apiName?: unknown; type?: unknown; searchable?: unknown })
    .filter(
      (f) =>
        typeof f.apiName === 'string' &&
        typeof f.type === 'string' &&
        f.searchable === true &&
        KEYWORD_SEARCHABLE_FIELD_TYPES.has(f.type),
    )
    .map((f) => f.apiName as string);
  if (searchableNames.length === 0) return null;
  return {
    OR: searchableNames.map((name) => ({
      data: { path: [name], string_contains: trimmed },
    })),
  };
}

/** 查询结果项。 */
export interface RecordResult {
  id: string;
  tenantId: string;
  /** 乐观锁版本（P1-02）：客户端编辑快照回传后服务端严格比对 */
  version: number;
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

/**
 * 评审 A-H1：GIN 下推路径的候选行上限。
 * 超过该规模时放弃 raw 排序下推，改走内存排序（有界），避免一次性载入过多行。
 */
const RAW_SORT_CANDIDATE_CAP = 5000;

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
  private readonly logger = new Logger(RecordService.name);

  constructor(
    private readonly formulaEngine: FormulaEngine,
    private readonly autoNumberGenerator: AutoNumberGenerator,
    @Inject(forwardRef(() => TriggerService))
    private readonly triggerService: TriggerService,
    private readonly rollupService: RollupService,
    private readonly environmentResolver: EnvironmentResolverService,
  ) {}

  /**
   * R1.4：解析对象字段定义（环境感知）——bundle 模式取快照 objects，
   * 降级活表 ObjectMeta。appId 兜底从活表行取得（bundle 匹配也需要）。
   */
  private async resolveObject(
    tenantId: string,
    objectId: string,
  ): Promise<{
    appId: string;
    apiName: string;
    fields: unknown;
    live: { appId: string; apiName: string; fields: unknown } | null;
  }> {
    const live = await prisma.objectMeta.findFirst({
      where: { id: objectId, tenantId },
      select: { appId: true, apiName: true, fields: true },
    });
    if (!live) {
      return { appId: '', apiName: '', fields: [], live: null };
    }
    const env = getEnvironmentId() ?? 'prod';
    const resolved = await this.environmentResolver.resolve(tenantId, live.appId, env);
    if (resolved.bundle) {
      const bundled = resolved.bundle.objects.find((o) => o.id === objectId);
      if (bundled) {
        return { appId: live.appId, apiName: bundled.apiName, fields: bundled.fields, live };
      }
      // bundle 中不存在该对象（发布后新建的活表对象）→ 视为未发布，按空字段处理
      return { appId: live.appId, apiName: live.apiName, fields: [], live };
    }
    // 搭建期语义（非兼容兜底）：应用未部署到当前环境时，运行时"不可变快照"尚不存在，
    // 字段定义取活表——支撑建对象后、发布前的记录试录（AutoNumber/Formula/校验）。
    return { appId: live.appId, apiName: live.apiName, fields: live.fields, live };
  }
  // ===========================================================================
  // 查询
  // ===========================================================================

  /**
   * 将权限上下文中的 ABAC 行级条件翻译为 Prisma where 子句。
   * 供 query/get/update/delete 统一注入，确保行级条件在所有读写路径上生效。
   */
  private buildConditionWhere(
    permissionContext?: PermissionContext,
  ): Prisma.RecordWhereInput | null {
    if (!permissionContext?.condition) return null;
    return translateCondition(permissionContext.condition, {
      currentUser: permissionContext.currentUserId,
    });
  }

  /**
   * 按 fieldScope 白名单过滤写操作的字段（fieldScope=null 表示不限制）。
   * 保证持有字段级受限规则的 EDIT 用户无法越权写入范围外字段。
   */
  private filterWritableFields(
    data: Record<string, unknown>,
    permissionContext?: PermissionContext,
  ): Record<string, unknown> {
    const fieldScope = permissionContext?.fieldScope;
    if (!fieldScope) return data;
    const allowed = new Set(fieldScope);
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (allowed.has(key)) filtered[key] = value;
    }
    return filtered;
  }

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

    // 关键词搜索（对象级搜索配置消费）：OR 串 searchable 文本字段的 contains。
    // 未命中 GIN（LIKE 语义）——大表场景下可观测（慢查询事件）后评估性能优化
    const keywordWhere = await this.buildKeywordWhere(tenantId, objectId, params.keyword);
    if (keywordWhere) {
      if (where.AND) {
        (where.AND as Prisma.RecordWhereInput[]).push(keywordWhere);
      } else {
        where.AND = [keywordWhere];
      }
    }

    // 注入行级权限条件
    const conditionWhere = this.buildConditionWhere(permissionContext);
    if (conditionWhere) {
      if (where.AND) {
        (where.AND as Prisma.RecordWhereInput[]).push(conditionWhere);
      } else {
        where.AND = [conditionWhere];
      }
    }

    // 排序计划（评审 A-H1）：系统列排序走 Prisma；业务字段排序需 raw/内存排序
    const sortSpec = parseSortSpec(params.sort);
    const isBusinessSort = Boolean(sortSpec && !SYSTEM_SORT_FIELDS.has(sortSpec.field));

    const pageResult = isBusinessSort
      ? await this.queryWithBusinessSort({
          tenantId,
          objectId,
          where,
          filterRule: this.parseFilterRule(params.filter),
          sortSpec: sortSpec!,
          hasPermissionCondition: Boolean(this.buildConditionWhere(permissionContext)),
          page,
          pageSize,
          fieldScope: permissionContext?.fieldScope,
        })
      : await this.queryWithColumnSort({ where, sort: params.sort, page, pageSize });

    return {
      items: pageResult.records.map((r) => this.toResult(r, permissionContext?.fieldScope)),
      total: pageResult.total,
      page,
      pageSize,
    };
  }

  /** 关键词搜索 where（环境感知取字段定义后委托纯函数）。 */
  private async buildKeywordWhere(
    tenantId: string,
    objectId: string,
    keyword: string | undefined,
  ): Promise<Prisma.RecordWhereInput | null> {
    if (!keyword?.trim()) return null;
    const object = await this.resolveObject(tenantId, objectId);
    return buildKeywordWhereFromFields(object.fields, keyword);
  }

  /** 系统列排序路径（Prisma 原生分页，性能与语义均正确）。 */
  private async queryWithColumnSort(params: {
    where: Prisma.RecordWhereInput;
    sort?: string;
    page: number;
    pageSize: number;
  }): Promise<{
    records: Prisma.RecordGetPayload<Record<string, never>>[];
    total: number;
  }> {
    const { where, sort, page, pageSize } = params;
    const orderBy = this.buildOrderBy(sort);
    const [records, total] = await Promise.all([
      prisma.record.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.record.count({ where }),
    ]);
    return { records, total };
  }

  /**
   * 业务字段排序路径（评审 A-H1）。
   *
   * 两条子路径：
   *  a) **GIN 下推**：过滤条件可完整表达为 jsonb 包含（AND 树内的 == ）且无行级权限
   *     条件时，用 raw SQL 完成 `data @> $::jsonb`（命中 records_data_idx 的 GIN 索引）
   *     + ORDER BY（按字段类型 cast） + LIMIT/OFFSET + COUNT，随后按 id 取回记录。
   *  b) **回退**：其余情况（LIKE/比较/OR/权限条件等）走 Prisma 取候选（有界），
   *     按字段类型在内存中排序后分页，保证排序语义正确（此前退化为整列 JSONB 序）。
   */
  private async queryWithBusinessSort(params: {
    tenantId: string;
    objectId: string;
    where: Prisma.RecordWhereInput;
    filterRule: unknown;
    sortSpec: SortSpec;
    hasPermissionCondition: boolean;
    page: number;
    pageSize: number;
    fieldScope?: string[] | null;
  }): Promise<{
    records: Prisma.RecordGetPayload<Record<string, never>>[];
    total: number;
  }> {
    const {
      tenantId,
      objectId,
      where,
      filterRule,
      sortSpec,
      hasPermissionCondition,
      page,
      pageSize,
    } = params;

    const obj = await this.resolveObject(tenantId, objectId);
    const fields = this.parseFields(obj.fields).map((f) => ({ apiName: f.apiName, type: f.type }));

    const extraction = extractContainmentFilter(filterRule);
    const canPushDown = Boolean(extraction) && extraction!.rest === null && !hasPermissionCondition;

    if (canPushDown && extraction) {
      const orderSql = buildFieldOrderSql([sortSpec], fields);
      if (orderSql) {
        const containmentJson = JSON.stringify(extraction.containment);
        const offset = (page - 1) * pageSize;

        // R1.4：raw SQL 旁路不经 $extends，需显式过滤环境
        const envFilter = getEnvironmentId() ?? 'prod';
        const ids = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT r.id FROM records r
          WHERE r.tenant_id = ${tenantId}
            AND r.object_id = ${objectId}
            AND r.environment_id = ${envFilter}
            AND r.data @> ${containmentJson}::jsonb
          ORDER BY ${Prisma.raw(orderSql)}
          LIMIT ${pageSize} OFFSET ${offset}
        `;
        const countRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT count(*)::bigint AS count FROM records r
          WHERE r.tenant_id = ${tenantId}
            AND r.object_id = ${objectId}
            AND r.environment_id = ${envFilter}
            AND r.data @> ${containmentJson}::jsonb
        `;

        const orderedIds = ids.map((r) => r.id);
        const rows = orderedIds.length
          ? await prisma.record.findMany({ where: { id: { in: orderedIds }, tenantId, objectId } })
          : [];
        const byId = new Map(rows.map((r) => [r.id, r]));
        return {
          records: orderedIds.map((id) => byId.get(id)).filter(Boolean) as typeof rows,
          total: Number(countRows[0]?.count ?? 0),
        };
      }
    }

    // 回退：Prisma 取候选（有界）→ 按字段类型内存排序 → 分页
    const candidates = await prisma.record.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: RAW_SORT_CANDIDATE_CAP,
    });
    const total = await prisma.record.count({ where });

    const sorted = [...candidates].sort((a, b) => {
      const av = ((a.data ?? {}) as Record<string, unknown>)[sortSpec.field];
      const bv = ((b.data ?? {}) as Record<string, unknown>)[sortSpec.field];
      const cmp = compareFieldValues(
        av,
        bv,
        fields.find((f) => f.apiName === sortSpec.field)?.type ?? 'text',
      );
      if (cmp !== 0) return sortSpec.dir === 'asc' ? cmp : -cmp;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // 稳定排序
    });

    return {
      records: sorted.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
      total,
    };
  }

  /**
   * 按 ID 查单条记录（支持字段级投影 + 行级权限条件）。
   *
   * @param permissionContext 权限上下文（condition 注入 where，fieldScope 投影 data 字段）
   */
  async get(
    tenantId: string,
    recordId: string,
    permissionContext?: PermissionContext,
  ): Promise<RecordResult> {
    const conditionWhere = this.buildConditionWhere(permissionContext);
    const record = await prisma.record.findFirst({
      where: {
        id: recordId,
        tenantId,
        ...(conditionWhere ? { AND: [conditionWhere] } : {}),
      },
    });
    if (!record) throw new NotFoundException('记录不存在');
    return this.toResult(record, permissionContext?.fieldScope);
  }

  /**
   * 创建记录。
   * appId 从对象元数据中获取（路由不含 appId）。
   *
   * 创建前处理：
   *   1. fieldScope 列级过滤（B1 修复 — 持字段级受限规则的用户只能写白名单内字段）
   *   2. 遍历对象 fields，为 AutoNumber 字段生成编号并写入 data
   *   3. 遍历对象 fields，计算 Formula 字段并写入 data
   */
  async create(
    tenantId: string,
    objectId: string,
    userId: string,
    data: Record<string, unknown>,
    permissionContext?: PermissionContext,
  ): Promise<RecordResult> {
    // 校验对象存在且属于该租户，同时获取 appId 与字段定义（环境感知）
    const obj = await this.resolveObject(tenantId, objectId);
    if (!obj.live) throw new NotFoundException('对象不存在');

    const fields = this.parseFields(obj.fields);

    // B1 修复：fieldScope 列级过滤（在 AutoNumber/Formula 计算前执行，
    // 因为 AutoNumber/Formula 是系统计算字段，不受用户 fieldScope 限制）
    const filteredData = this.filterWritableFields(data, permissionContext);

    // 复制过滤后的 data，避免修改调用方传入的对象
    const computedData: Record<string, unknown> = { ...filteredData };

    // 0. 服务端字段约束校验（QA D-002：required/maxLength/unique）
    await this.validateFieldConstraints({
      tenantId,
      appId: obj.appId,
      objectId,
      fields,
      data: filteredData,
    });

    // 1-4 与写入同事务（P1-28）：AutoNumber 计数器递增与记录写入原子化——
    // 中间环节（lookup 校验 400 / create 失败）抛错时计数器随事务回滚，
    // 不再产生结构性跳号。Formula 为纯内存计算、lookup/rollup 为只读校验，
    // 消费同一 computedData，一并置于回调内保持计算→写入的原子边界。
    const record = await prisma.$transaction(async (tx) => {
      // 1. 生成 AutoNumber 字段编号（tx 客户端：计数器递增加入本事务）
      for (const field of fields) {
        if (field.type !== FieldType.AutoNumber) continue;
        const config = field.config as AutoNumberFieldConfig | undefined;
        const format = config?.autoNumber?.format;
        if (!format) continue;
        // 用户即便传了该字段值也以系统生成为准（自动编号由系统掌控）
        computedData[field.apiName] = await this.autoNumberGenerator.generate(
          format,
          objectId,
          tenantId,
          getEnvironmentId() ?? 'prod',
          tx,
        );
      }

      // 2. Lookup 写约束：引用的目标记录必须存在且属于配置的目标对象
      await this.rollupService.validateLookupWrites(tenantId, fields, computedData);

      // 3. 计算 Rollup 字段（P1-10：rollup 先于 formula——公式可引用 rollup 字段新值）
      const rollupResults = await this.rollupService.computeRollupFields(
        tenantId,
        fields,
        computedData,
      );
      Object.assign(computedData, rollupResults);

      // 4. 计算 Formula 字段（基于已含 rollup 值的 data）
      const formulaResults = this.formulaEngine.computeRecordFields(
        fields as unknown as import('@apaas/shared').Field[],
        computedData,
      );
      Object.assign(computedData, formulaResults);

      return tx.record.create({
        data: {
          tenantId,
          appId: obj.appId,
          objectId,
          data: computedData as Prisma.InputJsonValue,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    });

    // 评审整改：业务动作级审计
    writeAudit({
      tenantId,
      userId,
      action: 'RECORD_CREATE',
      resource: 'RECORD',
      resourceId: record.id,
      appId: obj.appId,
      detail: { objectId },
    });

    // 触发记录创建事件（非阻塞）；created_by 供流程通知等节点引用（系统字段，置于展开后保证不被业务数据覆盖）
    const result = this.toResult(record);
    void this.triggerService.onRecordEvent(
      tenantId,
      obj.appId,
      objectId,
      'created',
      {
        id: record.id,
        ...(record.data as Record<string, unknown>),
        created_by: userId,
      },
      getEnvironmentId() ?? 'prod',
    );

    // 本记录可能作为子记录被其他对象的 Rollup 聚合（异步反向重算，非阻塞）
    void this.rollupService
      .recomputeParentsForChildRecord(tenantId, obj.appId, objectId, record.id, computedData)
      .catch((err) =>
        this.logger.error(
          `Rollup 父记录重算失败: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

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
    permissionContext?: PermissionContext,
    clientVersion?: number,
  ): Promise<RecordResult> {
    // P1-02：body.version 为客户端编辑快照的乐观锁版本（可选）——
    // 传入时严格比对客户端所见版本（长持快照编辑的冲突检测）；不传按服务端最新
    const { version: _clientVersionField, ...restData } = data;
    void _clientVersionField;
    // fieldScope 写过滤：仅允许写入规则范围内的字段
    const writableData = this.filterWritableFields(restData, permissionContext);

    // 行级条件注入 where（不满足条件的记录对当前用户不可见 → 404）
    const conditionWhere = this.buildConditionWhere(permissionContext);
    const existing = await prisma.record.findFirst({
      where: {
        id: recordId,
        tenantId,
        ...(conditionWhere ? { AND: [conditionWhere] } : {}),
      },
      include: { object: { select: { fields: true, appId: true } } },
    });
    if (!existing) throw new NotFoundException('记录不存在');

    // R1.4：字段定义环境感知——环境 bundle 内对象；应用未部署到当前环境时
    // 取活表字段（搭建期语义，支撑发布前试录/改数），bundle 内不存在则空字段
    let fields: ObjectField[] = [];
    if (existing.object) {
      const env = getEnvironmentId() ?? 'prod';
      const resolved = await this.environmentResolver.resolve(
        tenantId,
        existing.object.appId ?? '',
        env,
      );
      if (resolved.bundle) {
        const bundled = resolved.bundle.objects.find((o) => o.id === existing.objectId);
        fields = bundled ? this.parseFields(bundled.fields) : [];
      } else {
        fields = this.parseFields(existing.object?.fields);
      }
    }

    // 1. 剔除入参中的 AutoNumber 字段（自动编号不可更新）
    const incoming: Record<string, unknown> = { ...writableData };
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

    // 1.5 服务端字段约束校验（QA D-002）：required 只拦"本次把必填字段清空"，
    // 存量历史缺值不阻塞无关更新；maxLength/unique 对合并后完整数据生效
    await this.validateFieldConstraints({
      tenantId,
      appId: existing.appId,
      objectId: existing.objectId,
      fields,
      data: mergedData,
      incomingKeys: new Set(Object.keys(incoming)),
      excludeRecordId: recordId,
    });

    // Lookup 写约束 + Rollup 重算（update 时 sub_form 子记录已存在，可同步算全）
    // P1-10：rollup 先于 formula——公式引用 rollup 字段时用本次新值
    await this.rollupService.validateLookupWrites(tenantId, fields, mergedData);
    const rollupResults = await this.rollupService.computeRollupFields(
      tenantId,
      fields,
      mergedData,
      recordId,
    );
    Object.assign(mergedData, rollupResults);

    // 重新计算 Formula 字段（基于已含 rollup 值的 data）
    const formulaResults = this.formulaEngine.computeRecordFields(
      fields as unknown as import('@apaas/shared').Field[],
      mergedData,
    );
    Object.assign(mergedData, formulaResults);

    // 乐观锁（P1-02，用户裁决=version 列条件更新）：WHERE version=读时值，
    // 并发他人先写则命中 0 行 → 409 提示刷新重试——消除 read-merge-write 丢失更新。
    const expectedVersion = clientVersion ?? existing.version;
    const updated = await prisma.record.updateMany({
      where: { id: recordId, version: expectedVersion },
      data: {
        data: mergedData as Prisma.InputJsonValue,
        version: { increment: 1 },
        updatedBy: userId,
      },
    });
    if (updated.count === 0) {
      throw new ConflictException('记录已被其他人修改（版本冲突），请刷新后重试');
    }
    const record = await prisma.record.findUnique({ where: { id: recordId } });
    if (!record) throw new NotFoundException('记录不存在');

    // 评审整改：业务动作级审计
    writeAudit({
      tenantId,
      userId,
      action: 'RECORD_UPDATE',
      resource: 'RECORD',
      resourceId: recordId,
      appId: existing.appId,
      detail: { objectId: existing.objectId },
    });

    // 触发记录更新事件（非阻塞）；系统字段置于展开后保证不被业务数据覆盖
    const result = this.toResult(record);
    void this.triggerService.onRecordEvent(
      tenantId,
      existing.appId,
      existing.objectId,
      'updated',
      {
        id: record.id,
        ...mergedData,
        created_by: existing.createdBy,
        updated_by: userId,
      },
      getEnvironmentId() ?? 'prod',
    );

    // 本记录可能作为子记录被其他对象的 Rollup 聚合（异步反向重算，非阻塞）
    void this.rollupService
      .recomputeParentsForChildRecord(
        tenantId,
        existing.appId,
        existing.objectId,
        record.id,
        mergedData,
      )
      .catch((err) =>
        this.logger.error(
          `Rollup 父记录重算失败: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    return result;
  }

  /**
   * 删除记录（行级权限条件注入 where）。
   */
  async delete(
    tenantId: string,
    recordId: string,
    permissionContext?: PermissionContext,
    userId?: string,
  ): Promise<void> {
    const conditionWhere = this.buildConditionWhere(permissionContext);

    // 先查记录信息（删除后无法获取 appId/objectId）；条件不满足 → 视为不存在
    const existing = await prisma.record.findFirst({
      where: {
        id: recordId,
        tenantId,
        ...(conditionWhere ? { AND: [conditionWhere] } : {}),
      },
      select: { appId: true, objectId: true, data: true, createdBy: true },
    });
    if (!existing) throw new NotFoundException('记录不存在');

    const result = await prisma.record.deleteMany({
      where: { id: recordId, tenantId },
    });
    if (result.count === 0) throw new NotFoundException('记录不存在');

    // 评审整改：业务动作级审计（删除前已查到 existing.appId/objectId）
    writeAudit({
      tenantId,
      userId: userId ?? existing.createdBy ?? 'unknown',
      action: 'RECORD_DELETE',
      resource: 'RECORD',
      resourceId: recordId,
      appId: existing.appId,
      detail: { objectId: existing.objectId },
    });

    // 触发记录删除事件（非阻塞）；created_by 供流程节点引用
    void this.triggerService.onRecordEvent(
      tenantId,
      existing.appId,
      existing.objectId,
      'deleted',
      {
        id: recordId,
        ...(existing.data as Record<string, unknown>),
        created_by: existing.createdBy,
      },
      getEnvironmentId() ?? 'prod',
    );

    // 子记录删除 → 反向重算引用它的父记录 Rollup（异步，非阻塞）
    void this.rollupService
      .recomputeParentsForChildRecord(
        tenantId,
        existing.appId,
        existing.objectId,
        recordId,
        (existing.data as Record<string, unknown>) ?? {},
      )
      .catch((err) =>
        this.logger.error(
          `Rollup 父记录重算失败: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  // ===========================================================================
  // 批量操作
  // ===========================================================================

  /**
   * 批量创建记录。
   *
   * 循环调用 create 逻辑（含 AutoNumber/Formula 计算），逐条创建。
   * 单条失败不阻断其他记录，错误收集到 errors 数组返回。
   */
  async batchCreate(
    tenantId: string,
    objectId: string,
    userId: string,
    records: Record<string, unknown>[],
    permissionContext?: PermissionContext,
  ): Promise<BatchCreateResult> {
    const errors: ImportError[] = [];
    let created = 0;

    for (let i = 0; i < records.length; i++) {
      try {
        await this.create(tenantId, objectId, userId, records[i]!, permissionContext);
        created++;
      } catch (err) {
        errors.push({
          row: i + 1,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { created, errors };
  }

  /**
   * 批量更新记录（同一 data 覆盖到多条记录）。
   *
   * 逐条调用 update 逻辑（含 Formula 重算），单条失败不阻断其他记录。
   */
  async batchUpdate(
    tenantId: string,
    recordIds: string[],
    userId: string,
    data: Record<string, unknown>,
    permissionContext?: PermissionContext,
  ): Promise<BatchUpdateResult> {
    const errors: ImportError[] = [];
    let updated = 0;

    for (let i = 0; i < recordIds.length; i++) {
      try {
        await this.update(tenantId, recordIds[i]!, userId, data, permissionContext);
        updated++;
      } catch (err) {
        errors.push({
          row: i + 1,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { updated, errors };
  }

  /**
   * 批量删除记录。
   *
   * 使用 deleteMany 一次查询删除所有匹配记录，触发删除事件。
   * 行级权限条件注入 where — 条件外的记录不会被删除（计入 ignored）。
   */
  async batchDelete(
    tenantId: string,
    recordIds: string[],
    permissionContext?: PermissionContext,
  ): Promise<BatchDeleteResult> {
    const conditionWhere = this.buildConditionWhere(permissionContext);
    const records = await prisma.record.findMany({
      where: {
        id: { in: recordIds },
        tenantId,
        ...(conditionWhere ? { AND: [conditionWhere] } : {}),
      },
      select: { id: true, appId: true, objectId: true, data: true },
    });

    if (records.length === 0) {
      throw new BadRequestException('未找到要删除的记录');
    }

    // 仅删除通过行级条件校验的记录（条件外的 ID 静默忽略）
    const deletableIds = records.map((r) => r.id);
    const result = await prisma.record.deleteMany({
      where: { id: { in: deletableIds }, tenantId },
    });

    // 按对象分组触发事件（非阻塞）
    const byObject = new Map<
      string,
      { appId: string; objectId: string; records: typeof records }
    >();
    for (const record of records) {
      const key = record.objectId;
      if (!byObject.has(key)) {
        byObject.set(key, { appId: record.appId, objectId: record.objectId, records: [] });
      }
      byObject.get(key)!.records.push(record);
    }

    for (const { appId, objectId, records: objs } of byObject.values()) {
      for (const record of objs) {
        void this.triggerService.onRecordEvent(
          tenantId,
          appId,
          objectId,
          'deleted',
          {
            id: record.id,
            ...(record.data as Record<string, unknown>),
          },
          getEnvironmentId() ?? 'prod',
        );
      }
    }

    return { deleted: result.count };
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
   * 服务端字段约束校验（QA D-002 修复，2026-10-06）：
   * required / maxLength / unique 在写内核强制——此前仅客户端拦截，
   * API 直连、AI 生成页面、流程对象操作节点可绕过写入脏数据。
   *
   * 语义：
   * - required：create 对全部必填字段生效；update 仅拦"把必填字段清空"
   *   （存量历史数据缺值不阻塞无关的部分更新）。
   * - maxLength：text/long_text/rich_text 的 config.maxLength。
   * - unique：同对象同字段等值已存在其他记录 → 409。JSONB 等值走
   *   path+equals（GIN 可达）；应用层 check-then-write 存在并发窗口，
   *   宽表架构无 DB 约束可用，容忍 best-effort。
   * - 系统字段与 AutoNumber/Formula/Rollup 系统计算字段不适用。
   */
  private async validateFieldConstraints(input: {
    tenantId: string;
    appId: string;
    objectId: string;
    fields: ObjectField[];
    /** 校验数据（create=完整提交数据；update=合并后的完整数据） */
    data: Record<string, unknown>;
    /** update 场景：本次显式写入的键（required 只拦这些键被清空） */
    incomingKeys?: ReadonlySet<string>;
    /** update 场景：排除自身记录 */
    excludeRecordId?: string;
  }): Promise<void> {
    const { tenantId, appId, objectId, fields, data } = input;
    const computedTypes = new Set<string>([
      FieldType.AutoNumber,
      FieldType.Formula,
      FieldType.Rollup,
    ]);
    for (const field of fields) {
      if (field.isSystem || computedTypes.has(field.type)) continue;
      const label = field.label ?? field.apiName;
      const value = data[field.apiName];
      const isEmpty = value === undefined || value === null || value === '';

      if (field.required && isEmpty) {
        if (!input.incomingKeys || input.incomingKeys.has(field.apiName)) {
          throw new BadRequestException(`字段「${label}」为必填项`);
        }
      }
      const config = field.config as { maxLength?: number } | undefined;
      if (typeof value === 'string' && config?.maxLength && value.length > config.maxLength) {
        throw new BadRequestException(
          `字段「${label}」长度 ${value.length} 超出最大长度 ${config.maxLength}`,
        );
      }
      if (field.unique && !isEmpty) {
        const dup = await prisma.record.findFirst({
          where: {
            tenantId,
            appId,
            objectId,
            ...(input.excludeRecordId ? { id: { not: input.excludeRecordId } } : {}),
            data: { path: [field.apiName], equals: value } as Prisma.JsonFilter,
          },
          select: { id: true },
        });
        if (dup) {
          throw new ConflictException(`字段「${label}」的值「${String(value)}」已存在（唯一约束）`);
        }
      }
    }
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
      // 乐观锁版本（P1-02）：客户端编辑快照回传后服务端严格比对
      version: record.version,
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
  /** 解析 filter 原始 JsonLogic 规则（评审 A-H1：containment 提取需要原始规则）。 */
  private parseFilterRule(filterStr?: string): unknown {
    if (!filterStr) return null;
    try {
      const parsed = JSON.parse(filterStr);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

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
