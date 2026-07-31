import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { prisma, Prisma } from '@apaas/db';
import { randomUUID } from 'node:crypto';

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
   * 创建对象。
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

    return this.get(tenantId, obj.id);
  }

  /**
   * 更新对象（name/description/icon）。
   */
  async update(tenantId: string, objectId: string, data: UpdateObjectInput) {
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

    return this.get(tenantId, objectId);
  }

  /**
   * 删除对象（校验有无记录）。
   */
  async delete(tenantId: string, objectId: string): Promise<void> {
    const existing = await prisma.objectMeta.findFirst({
      where: { id: objectId, tenantId },
    });
    if (!existing) throw new NotFoundException('对象不存在');

    // 校验对象下是否有记录
    const recordCount = await prisma.record.count({
      where: { objectId, tenantId },
    });
    if (recordCount > 0) {
      throw new BadRequestException(
        `对象下存在 ${recordCount} 条记录，无法删除`,
      );
    }

    await prisma.objectMeta.delete({ where: { id: objectId } });
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
  async listViews(objectId: string) {
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
  async createView(objectId: string, data: CreateViewInput) {
    // 校验对象存在
    const obj = await prisma.objectMeta.findUnique({
      where: { id: objectId },
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
  async updateView(viewId: string, data: UpdateViewInput) {
    const existing = await prisma.view.findUnique({
      where: { id: viewId },
    });
    if (!existing) throw new NotFoundException('视图不存在');

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
  async deleteView(viewId: string): Promise<void> {
    const existing = await prisma.view.findUnique({
      where: { id: viewId },
    });
    if (!existing) throw new NotFoundException('视图不存在');

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
