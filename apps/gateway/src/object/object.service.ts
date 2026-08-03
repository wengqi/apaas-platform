import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { prisma, Prisma } from '@apaas/db';
import { randomUUID } from 'node:crypto';
import { ChangeLogService } from '../application/changelog.service.js';

/**
 * 存储在 ObjectMeta.fields JSON 数组中的字段定义。
 * 格式参照 packages/shared/src/object/index.ts 的 Field 接口。
 */
export interface StoredField {
  id: string;
  objectId: string;
  apiName: string;
  label: string;
  type: string;
  config: unknown;
  required: boolean;
  unique: boolean;
  searchable: boolean;
  defaultValue?: unknown;
  description?: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 创建对象请求体。 */
export interface CreateObjectInput {
  apiName: string;
  name: string;
  description?: string;
  icon?: string;
}

/** 更新对象请求体。 */
export interface UpdateObjectInput {
  name?: string;
  description?: string;
  icon?: string;
}

/** 新增字段请求体。 */
export interface CreateFieldInput {
  apiName: string;
  label: string;
  type: string;
  config?: unknown;
  required?: boolean;
  unique?: boolean;
  searchable?: boolean;
  defaultValue?: unknown;
  description?: string;
}

/** 更新字段请求体。 */
export interface UpdateFieldInput {
  apiName?: string;
  label?: string;
  type?: string;
  config?: unknown;
  required?: boolean;
  unique?: boolean;
  searchable?: boolean;
  defaultValue?: unknown;
  description?: string;
}

/** 创建视图请求体。 */
export interface CreateViewInput {
  name: string;
  type: string;
  config?: Record<string, unknown>;
}

/** 更新视图请求体。 */
export interface UpdateViewInput {
  name?: string;
  type?: string;
  config?: Record<string, unknown>;
}

/**
 * 对象服务 — 对象元数据 / 字段 / 视图 CRUD。
 *
 * 对象(ObjectMeta)存储于 object_metas 表；字段以 JSON 数组存于
 * ObjectMeta.fields；视图(View)存于独立的 views 表。
 * 所有方法返回 plain data（Prisma 原始数据），不做 brand 类型转换。
 */
@Injectable()
export class ObjectService {
  constructor(private readonly changeLogService: ChangeLogService) {}

  // ===========================================================================
  // 系统字段定义
  // ===========================================================================

  /**
   * 预置系统字段 — 创建对象时自动生成。
   *
   * 这些字段不可删除、不可修改类型，由系统自动维护：
   *   - name        : 记录名称（主字段）
   *   - created_by  : 创建人
   *   - created_at  : 创建时间
   *   - updated_by  : 更新人
   *   - updated_at  : 更新时间
   *   - owner       : 拥有者（默认为创建人，可转交）
   */
  private static readonly SYSTEM_FIELDS: Array<{
    apiName: string;
    label: string;
    type: string;
    description: string;
  }> = [
    { apiName: 'created_by', label: '创建人', type: 'user', description: '记录创建人，系统自动填充' },
    { apiName: 'created_at', label: '创建时间', type: 'datetime', description: '记录创建时间，系统自动填充' },
    { apiName: 'updated_by', label: '更新人', type: 'user', description: '最后更新人，系统自动填充' },
    { apiName: 'updated_at', label: '更新时间', type: 'datetime', description: '最后更新时间，系统自动填充' },
    { apiName: 'owner', label: '拥有者', type: 'user', description: '记录拥有者，默认为创建人' },
  ];

  /** 生成预置系统字段列表。 */
  private static createSystemFields(objectId: string): StoredField[] {
    const now = new Date().toISOString();
    return ObjectService.SYSTEM_FIELDS.map((f) => ({
      id: randomUUID(),
      objectId,
      apiName: f.apiName,
      label: f.label,
      type: f.type,
      config: {},
      required: false,
      unique: false,
      searchable: true,
      description: f.description,
      isSystem: true,
      createdAt: now,
      updatedAt: now,
    }));
  }

  // ===========================================================================
  // 对象 CRUD
  // ===========================================================================

  /**
   * 列出应用下所有对象（含字段数统计）。
   */
  async list(tenantId: string, appId: string) {
    const objects = await prisma.objectMeta.findMany({
      where: { tenantId, appId },
      orderBy: { updatedAt: 'desc' },
    });

    return objects.map((obj) => ({
      id: obj.id,
      tenantId: obj.tenantId,
      appId: obj.appId,
      apiName: obj.apiName,
      name: obj.name,
      description: obj.description,
      icon: obj.icon,
      isSystem: obj.isSystem,
      fields: this.parseFields(obj.fields),
      fieldCount: this.parseFields(obj.fields).length,
      createdAt: obj.createdAt.toISOString(),
      updatedAt: obj.updatedAt.toISOString(),
    }));
  }

  /**
   * 获取单个对象（含完整 fields JSON）。
   */
  async get(tenantId: string, objectId: string) {
    const obj = await prisma.objectMeta.findFirst({
      where: { id: objectId, tenantId },
    });
    if (!obj) throw new NotFoundException('对象不存在');

    return {
      id: obj.id,
      tenantId: obj.tenantId,
      appId: obj.appId,
      apiName: obj.apiName,
      name: obj.name,
      description: obj.description,
      icon: obj.icon,
      fields: this.parseFields(obj.fields),
      isSystem: obj.isSystem,
      createdAt: obj.createdAt.toISOString(),
      updatedAt: obj.updatedAt.toISOString(),
    };
  }

  /**
   * 创建对象（自动预置 6 个系统字段）。
   */
  async create(
    tenantId: string,
    appId: string,
    createdBy: string,
    data: CreateObjectInput,
  ) {
    const obj = await prisma.objectMeta.create({
      data: {
        tenantId,
        appId,
        apiName: data.apiName,
        name: data.name,
        description: data.description,
        icon: data.icon,
        fields: [],
        isSystem: false,
      },
    });

    // 预置系统字段
    const systemFields = ObjectService.createSystemFields(obj.id);
    await prisma.objectMeta.update({
      where: { id: obj.id },
      data: { fields: systemFields as unknown as object[] },
    });

    await this.changeLogService.log({
      tenantId,
      appId,
      module: 'OBJECT',
      entityType: 'ObjectMeta',
      entityId: obj.id,
      entityName: data.name,
      changeType: 'CREATE',
      changedBy: createdBy,
      changeDescription: `新建对象: ${data.name}`,
    });

    return this.get(tenantId, obj.id);
  }

  /**
   * 更新对象（name/description/icon）。
   */
  async update(tenantId: string, objectId: string, data: UpdateObjectInput, changedBy?: string) {
    // 先校验对象存在且属于该租户
    const existing = await prisma.objectMeta.findFirst({
      where: { id: objectId, tenantId },
    });
    if (!existing) throw new NotFoundException('对象不存在');

    await prisma.objectMeta.update({
      where: { id: objectId },
      data: {
        name: data.name,
        description: data.description,
        icon: data.icon,
      },
    });

    await this.changeLogService.log({
      tenantId,
      appId: existing.appId,
      module: 'OBJECT',
      entityType: 'ObjectMeta',
      entityId: objectId,
      entityName: data.name ?? existing.name,
      changeType: 'UPDATE',
      changedBy: changedBy ?? 'system',
      changeDescription: `更新对象: ${data.name ?? existing.name}`,
    });

    return this.get(tenantId, objectId);
  }

  /**
   * 删除对象（校验引用关系）。
   *
   * 阻断性校验（有则拒绝删除）：
   *   1. 对象下有业务记录
   *   2. 有页面引用此对象
   *   3. 有流程引用此对象（RECORD_CREATED/RECORD_UPDATED 触发器）
   *   4. 有权限规则引用此对象（DATA_MODEL/RECORD 类型的 targetId）
   */
  async delete(tenantId: string, objectId: string, changedBy?: string): Promise<void> {
    const existing = await prisma.objectMeta.findFirst({
      where: { id: objectId, tenantId },
    });
    if (!existing) throw new NotFoundException('对象不存在');

    // 1. 校验对象下是否有业务记录
    const recordCount = await prisma.record.count({
      where: { objectId, tenantId },
    });
    if (recordCount > 0) {
      throw new BadRequestException(
        `对象下存在 ${recordCount} 条业务记录，无法删除。请先清空数据后再删除对象。`,
      );
    }

    // 2. 校验是否有页面引用此对象
    const pageCount = await prisma.pageMeta.count({
      where: { objectId, tenantId },
    });
    if (pageCount > 0) {
      throw new BadRequestException(
        `有 ${pageCount} 个页面引用了此对象，无法删除。请先删除或解绑相关页面后再删除对象。`,
      );
    }

    // 3. 校验是否有流程引用此对象（触发器类型为 RECORD_CREATED/RECORD_UPDATED）
    const processCount = await prisma.processDef.count({
      where: {
        tenantId,
        appId: existing.appId,
        triggerType: { in: ['RECORD_CREATED', 'RECORD_UPDATED'] },
        status: { not: 'ARCHIVED' },
      },
    });
    if (processCount > 0) {
      throw new BadRequestException(
        `有 ${processCount} 个流程的触发器引用了对象变更事件，无法删除。请先删除或归档相关流程后再删除对象。`,
      );
    }

    // 4. 校验是否有权限规则引用此对象（DATA_MODEL 或 RECORD 类型的 targetId）
    const ruleCount = await prisma.permissionRule.count({
      where: {
        tenantId,
        type: { in: ['DATA_MODEL', 'RECORD'] },
        targetId: objectId,
      },
    });
    if (ruleCount > 0) {
      throw new BadRequestException(
        `有 ${ruleCount} 条权限规则引用了此对象，无法删除。请先删除相关权限规则后再删除对象。`,
      );
    }

    await prisma.objectMeta.delete({ where: { id: objectId } });

    await this.changeLogService.log({
      tenantId,
      appId: existing.appId,
      module: 'OBJECT',
      entityType: 'ObjectMeta',
      entityId: objectId,
      entityName: existing.name,
      changeType: 'DELETE',
      changedBy: changedBy ?? 'system',
      changeDescription: `删除对象: ${existing.name}`,
    });
  }

  // ===========================================================================
  // 字段管理（字段以 JSON 数组存于 ObjectMeta.fields）
  // ===========================================================================

  /**
   * 新增字段到 fields JSON 数组。
   */
  async addField(tenantId: string, objectId: string, data: CreateFieldInput) {
    const obj = await prisma.objectMeta.findFirst({
      where: { id: objectId, tenantId },
    });
    if (!obj) throw new NotFoundException('对象不存在');

    const fields = this.parseFields(obj.fields);

    // 校验 apiName 唯一
    if (fields.some((f) => f.apiName === data.apiName)) {
      throw new BadRequestException(`字段 API 名称 "${data.apiName}" 已存在`);
    }

    const now = new Date().toISOString();
    const newField: StoredField = {
      id: randomUUID(),
      objectId,
      apiName: data.apiName,
      label: data.label,
      type: data.type,
      config: data.config ?? {},
      required: data.required ?? false,
      unique: data.unique ?? false,
      searchable: data.searchable ?? false,
      defaultValue: data.defaultValue,
      description: data.description,
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    };

    fields.push(newField);

    await prisma.objectMeta.update({
      where: { id: objectId },
      data: { fields: fields as unknown as object[] },
    });

    return newField;
  }

  /**
   * 更新字段。
   */
  async updateField(
    tenantId: string,
    objectId: string,
    fieldId: string,
    data: UpdateFieldInput,
  ) {
    const obj = await prisma.objectMeta.findFirst({
      where: { id: objectId, tenantId },
    });
    if (!obj) throw new NotFoundException('对象不存在');

    const fields = this.parseFields(obj.fields);
    const index = fields.findIndex((f) => f.id === fieldId);
    if (index === -1) throw new NotFoundException('字段不存在');

    const existing = fields[index]!;

    // 如果修改了 apiName，校验唯一性
    if (
      data.apiName !== undefined &&
      data.apiName !== existing.apiName &&
      fields.some((f) => f.apiName === data.apiName)
    ) {
      throw new BadRequestException(
        `字段 API 名称 "${data.apiName}" 已存在`,
      );
    }

    const updated: StoredField = {
      ...existing,
      apiName: data.apiName ?? existing.apiName,
      label: data.label ?? existing.label,
      type: data.type ?? existing.type,
      config: data.config !== undefined ? data.config : existing.config,
      required: data.required ?? existing.required,
      unique: data.unique ?? existing.unique,
      searchable: data.searchable ?? existing.searchable,
      defaultValue:
        data.defaultValue !== undefined
          ? data.defaultValue
          : existing.defaultValue,
      description: data.description ?? existing.description,
      updatedAt: new Date().toISOString(),
    };

    fields[index] = updated;

    await prisma.objectMeta.update({
      where: { id: objectId },
      data: { fields: fields as unknown as object[] },
    });

    return updated;
  }

  /**
   * 删除字段（系统字段禁止删除）。
   */
  async deleteField(
    tenantId: string,
    objectId: string,
    fieldId: string,
  ): Promise<void> {
    const obj = await prisma.objectMeta.findFirst({
      where: { id: objectId, tenantId },
    });
    if (!obj) throw new NotFoundException('对象不存在');

    const fields = this.parseFields(obj.fields);
    const field = fields.find((f) => f.id === fieldId);
    if (!field) throw new NotFoundException('字段不存在');

    if (field.isSystem) {
      throw new BadRequestException('系统字段不可删除');
    }

    const filtered = fields.filter((f) => f.id !== fieldId);

    await prisma.objectMeta.update({
      where: { id: objectId },
      data: { fields: filtered as unknown as object[] },
    });
  }

  // ===========================================================================
  // 视图管理
  // ===========================================================================

  /**
   * 列出对象视图。
   */
  async listViews(tenantId: string, objectId: string) {
    // View 无 tenantId 列，通过校验 object 归属来实现租户隔离
    const obj = await prisma.objectMeta.findFirst({ where: { id: objectId, tenantId } });
    if (!obj) throw new NotFoundException('对象不存在');

    const views = await prisma.view.findMany({
      where: { objectId },
      orderBy: { createdAt: 'asc' },
    });

    return views.map((v) => ({
      id: v.id,
      objectId: v.objectId,
      name: v.name,
      type: v.type,
      config: v.config,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    }));
  }

  /**
   * 创建视图。
   */
  async createView(tenantId: string, objectId: string, data: CreateViewInput) {
    // 校验对象存在且属于当前租户
    const obj = await prisma.objectMeta.findFirst({
      where: { id: objectId, tenantId },
    });
    if (!obj) throw new NotFoundException('对象不存在');

    const view = await prisma.view.create({
      data: {
        objectId,
        name: data.name,
        type: data.type,
        config: (data.config ?? {}) as Prisma.InputJsonValue,
      },
    });

    return {
      id: view.id,
      objectId: view.objectId,
      name: view.name,
      type: view.type,
      config: view.config,
      createdAt: view.createdAt.toISOString(),
      updatedAt: view.updatedAt.toISOString(),
    };
  }

  /**
   * 更新视图。
   */
  async updateView(tenantId: string, viewId: string, data: UpdateViewInput) {
    // View 无 tenantId 列，先查视图获取 objectId，再校验 object 归属
    const existing = await prisma.view.findUnique({
      where: { id: viewId },
    });
    if (!existing) throw new NotFoundException('视图不存在');
    const obj = await prisma.objectMeta.findFirst({
      where: { id: existing.objectId, tenantId },
    });
    if (!obj) throw new NotFoundException('对象不存在');

    const view = await prisma.view.update({
      where: { id: viewId },
      data: {
        name: data.name,
        type: data.type,
        config: data.config as Prisma.InputJsonValue,
      },
    });

    return {
      id: view.id,
      objectId: view.objectId,
      name: view.name,
      type: view.type,
      config: view.config,
      createdAt: view.createdAt.toISOString(),
      updatedAt: view.updatedAt.toISOString(),
    };
  }

  /**
   * 删除视图。
   */
  async deleteView(tenantId: string, viewId: string): Promise<void> {
    // View 无 tenantId 列，先查视图获取 objectId，再校验 object 归属
    const existing = await prisma.view.findUnique({
      where: { id: viewId },
    });
    if (!existing) throw new NotFoundException('视图不存在');
    const obj = await prisma.objectMeta.findFirst({
      where: { id: existing.objectId, tenantId },
    });
    if (!obj) throw new NotFoundException('对象不存在');

    await prisma.view.delete({ where: { id: viewId } });
  }

  // ===========================================================================
  // 辅助方法
  // ===========================================================================

  /**
   * 安全解析 fields JSON 为数组。
   * Prisma 返回的 JsonValue 需要断言为 StoredField[]。
   */
  private parseFields(raw: unknown): StoredField[] {
    if (!Array.isArray(raw)) return [];
    return raw as StoredField[];
  }
}
