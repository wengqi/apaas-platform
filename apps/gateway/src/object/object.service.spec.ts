/**
 * ObjectService 单元测试 — 对象/字段/视图 CRUD。
 *
 * 测试覆盖：
 * - 对象 CRUD（list/get/create/update/delete）
 * - create 自动生成 5 个系统字段
 * - delete 的 4 道引用校验（records/pages/processDefs/permissionRules）
 * - 字段管理（addField apiName 唯一性 / updateField 重名校验 / deleteField 系统字段保护）
 * - 视图管理（createView/updateView/deleteView 的两步租户校验）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ObjectService } from './object.service.js';
import { getMockPrisma, getMockExecuteRawUnsafe } from '../test/test-helpers.js';

function createMockChangeLogService() {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

function createService() {
  const changeLogService = createMockChangeLogService();
  const service = new ObjectService(
    changeLogService as unknown as ConstructorParameters<typeof ObjectService>[0],
  );
  return { service, changeLogService };
}

function makeObject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'obj-001',
    tenantId: 'tenant-001',
    appId: 'app-001',
    apiName: 'test_object',
    name: 'Test Object',
    description: 'A test object',
    icon: '📋',
    isSystem: false,
    fields: [],
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
  };
}

function makeSystemField(apiName: string): Record<string, unknown> {
  return {
    id: `field-${apiName}`,
    objectId: 'obj-001',
    apiName,
    label: apiName,
    type: 'user',
    config: {},
    required: false,
    unique: false,
    searchable: true,
    isSystem: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

function makeView(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'view-001',
    objectId: 'obj-001',
    name: 'All Records',
    type: 'LIST',
    config: {},
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
  };
}

describe('ObjectService', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // list
  // =========================================================================

  describe('list', () => {
    it('返回应用下所有对象含字段数统计', async () => {
      const fields = [makeSystemField('created_by'), makeSystemField('owner')];
      prisma.objectMeta.findMany.mockResolvedValue([makeObject({ fields })]);

      const { service } = createService();
      const result = await service.list('tenant-001', 'app-001');

      expect(result).toHaveLength(1);
      expect(result[0]!.fieldCount).toBe(2);
      expect(prisma.objectMeta.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-001', appId: 'app-001' },
        orderBy: { updatedAt: 'desc' },
      });
    });
  });

  // =========================================================================
  // get
  // =========================================================================

  describe('get', () => {
    it('返回对象详情含 fields', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObject({ fields: [makeSystemField('created_by')] }),
      );

      const { service } = createService();
      const result = await service.get('tenant-001', 'app-001', 'obj-001');

      expect(result.id).toBe('obj-001');
      expect(result.fields).toHaveLength(1);
    });

    it('对象不存在时抛出 NotFoundException', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(service.get('tenant-001', 'app-001', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe('create', () => {
    it('正常创建 — 自动生成 5 个系统字段', async () => {
      prisma.objectMeta.create.mockResolvedValue(makeObject({ fields: [] }));
      prisma.objectMeta.update.mockResolvedValue(makeObject());
      // create 内部调用 get() 返回详情
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObject({ fields: [makeSystemField('created_by')] }),
      );

      const { service, changeLogService } = createService();
      await service.create('tenant-001', 'app-001', 'user-001', {
        apiName: 'test_object',
        name: 'Test Object',
      });

      // 应先创建空对象
      expect(prisma.objectMeta.create).toHaveBeenCalledTimes(1);
      // 然后更新注入系统字段
      expect(prisma.objectMeta.update).toHaveBeenCalledTimes(1);
      const updateCall = prisma.objectMeta.update.mock.calls[0]![0];
      const systemFields = updateCall.data.fields as unknown[];
      expect(systemFields.length).toBe(5);
      expect(systemFields.every((f) => (f as { isSystem: boolean }).isSystem)).toBe(true);
      // ChangeLog
      expect(changeLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ changeType: 'CREATE', module: 'OBJECT' }),
      );
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe('update', () => {
    it('正常更新对象名称', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(makeObject());
      prisma.objectMeta.update.mockResolvedValue(makeObject());
      // get() 内部调用
      prisma.objectMeta.findFirst
        .mockResolvedValueOnce(makeObject())
        .mockResolvedValueOnce(makeObject({ name: 'Updated' }));

      const { service } = createService();
      await service.update('tenant-001', 'app-001', 'obj-001', { name: 'Updated' });

      expect(prisma.objectMeta.update).toHaveBeenCalledWith({
        where: { id: 'obj-001' },
        data: expect.objectContaining({ name: 'Updated' }),
      });
    });

    it('对象不存在时抛出 NotFoundException', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(
        service.update('tenant-001', 'app-001', 'missing', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // delete — 4 道引用校验
  // =========================================================================

  it('P1-01：unique 字段新增时建 partial unique index（check-then-write 竞态的 DB 兜底）', async () => {
    prisma.objectMeta.findFirst.mockResolvedValue(makeObject());
    const { service } = createService();

    await service.addField('tenant-001', 'app-001', 'obj-001', {
      apiName: 'email',
      label: '邮箱',
      type: 'text',
      unique: true,
    } as never);

    const raw = getMockExecuteRawUnsafe();
    expect(raw).toHaveBeenCalledTimes(1);
    const text = String(raw.mock.calls[0]![0]);
    expect(text).toContain('CREATE UNIQUE INDEX IF NOT EXISTS');
    expect(text).toContain("data->>'email'");
    expect(text).toContain('IS NOT NULL');
  });

  it('P1-01：unique 撤销（true→false）时删索引', async () => {
    prisma.objectMeta.findFirst.mockResolvedValue(
      makeObject({
        fields: [
          {
            id: 'f1',
            apiName: 'email',
            label: '邮箱',
            type: 'text',
            unique: true,
            config: {},
            isSystem: false,
          },
        ],
      }),
    );
    const { service } = createService();

    await service.updateField('tenant-001', 'app-001', 'obj-001', 'f1', { unique: false });

    const raw = getMockExecuteRawUnsafe();
    expect(raw).toHaveBeenCalledTimes(1);
    expect(String(raw.mock.calls[0]![0])).toContain('DROP INDEX IF EXISTS');
  });

  it('P1-01：非 unique 字段零 DDL', async () => {
    prisma.objectMeta.findFirst.mockResolvedValue(makeObject());
    const { service } = createService();

    await service.addField('tenant-001', 'app-001', 'obj-001', {
      apiName: 'note',
      label: '备注',
      type: 'text',
    } as never);

    expect(getMockExecuteRawUnsafe()).not.toHaveBeenCalled();
  });

  it('P1-09：改名被页面 schema 引用时硬拦并列出引用', async () => {
    prisma.objectMeta.findFirst.mockResolvedValue(
      makeObject({
        fields: [
          {
            id: 'f1',
            apiName: 'old_name',
            label: '旧名',
            type: 'text',
            config: {},
            isSystem: false,
          },
        ],
      }),
    );
    prisma.pageMeta.findMany.mockResolvedValue([
      {
        id: 'page-1',
        name: '台账页',
        schema: { fields: ['old_name'], columns: [{ dataIndex: 'old_name' }] },
      },
    ]);

    const { service } = createService();
    await expect(
      service.updateField('tenant-001', 'app-001', 'obj-001', 'f1', { apiName: 'new_name' }),
    ).rejects.toThrow(/台账页/);
    // 硬拦后元数据不得变更
    expect(prisma.objectMeta.update).not.toHaveBeenCalled();
  });

  it('P1-09：删除字段被同对象 rollup 引用时硬拦', async () => {
    prisma.objectMeta.findFirst.mockResolvedValue(
      makeObject({
        fields: [
          {
            id: 'f-rel',
            apiName: 'items_ref',
            label: '明细引用',
            type: 'lookup',
            config: { lookup: { targetObjectId: 'x' } },
            isSystem: false,
          },
          {
            id: 'f-rollup',
            apiName: 'total',
            label: '合计',
            type: 'rollup',
            config: { rollup: { relationFieldId: 'f-rel', aggregate: 'sum' } },
            isSystem: false,
          },
          {
            id: 'f-target',
            apiName: 'plain',
            label: '普通',
            type: 'text',
            config: {},
            isSystem: false,
          },
        ],
      }),
    );
    prisma.pageMeta.findMany.mockResolvedValue([]);

    const { service } = createService();
    await expect(service.deleteField('tenant-001', 'app-001', 'obj-001', 'f-rel')).rejects.toThrow(
      /rollup/,
    );
    expect(prisma.objectMeta.update).not.toHaveBeenCalled();

    // 无引用字段正常删除
    await expect(
      service.deleteField('tenant-001', 'app-001', 'obj-001', 'f-target'),
    ).resolves.toBeUndefined();
  });

  it('P1-09：改名被流程 writeback/权限 condition 引用时硬拦（列出来源）', async () => {
    prisma.objectMeta.findFirst.mockResolvedValue(
      makeObject({
        fields: [
          { id: 'f1', apiName: 'status', label: '状态', type: 'text', config: {}, isSystem: false },
        ],
      }),
    );
    prisma.pageMeta.findMany.mockResolvedValue([]);
    prisma.processDef.findMany.mockResolvedValue([
      {
        id: 'p1',
        name: '审批流',
        workflowSchema: {
          nodes: [{ id: 'n1', type: 'user_task', data: { writeback: { field: 'status' } } }],
        },
      },
    ]);
    prisma.permissionRule.findMany.mockResolvedValue([
      { id: 'r1', name: '行级规则', condition: { '==': [{ var: 'status' }, 'approved'] } },
    ]);

    const { service } = createService();
    await expect(
      service.updateField('tenant-001', 'app-001', 'obj-001', 'f1', { apiName: 'state' }),
    ).rejects.toThrow(/审批流|行级规则/);
  });

  describe('delete', () => {
    beforeEach(() => {
      prisma.objectMeta.findFirst.mockResolvedValue(makeObject());
      prisma.$queryRaw.mockResolvedValue([{ count: 0 }]);
    });

    it('校验1b — 记录统计必须跨环境（对抗审查 correctness-01/R1）：$queryRaw SQL 不含 environment_id 过滤', async () => {
      const { service } = createService();
      await service.delete('tenant-001', 'app-001', 'obj-001');

      // tagged template 调用：mock.calls[0][0] 是 SQL 字符串数组
      const [strings] = prisma.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray];
      const sql = strings.join(' ? ').toLowerCase();
      expect(sql).toContain('object_id');
      expect(sql).toContain('tenant_id');
      expect(sql).not.toContain('environment_id');
    });

    it('校验1 — 有业务记录时拒绝删除', async () => {
      prisma.$queryRaw.mockResolvedValue([{ count: 5 }]);

      const { service } = createService();
      await expect(service.delete('tenant-001', 'app-001', 'obj-001')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('校验2 — 有页面引用时拒绝删除', async () => {
      prisma.$queryRaw.mockResolvedValue([{ count: 0 }]);
      prisma.pageMeta.count.mockResolvedValue(3);

      const { service } = createService();
      await expect(service.delete('tenant-001', 'app-001', 'obj-001')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('校验3 — 有流程触发器引用时拒绝删除', async () => {
      prisma.$queryRaw.mockResolvedValue([{ count: 0 }]);
      prisma.pageMeta.count.mockResolvedValue(0);
      prisma.processDef.count.mockResolvedValue(2);

      const { service } = createService();
      await expect(service.delete('tenant-001', 'app-001', 'obj-001')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('校验4 — 有权限规则引用时拒绝删除', async () => {
      prisma.$queryRaw.mockResolvedValue([{ count: 0 }]);
      prisma.pageMeta.count.mockResolvedValue(0);
      prisma.processDef.count.mockResolvedValue(0);
      prisma.permissionRule.count.mockResolvedValue(1);

      const { service } = createService();
      await expect(service.delete('tenant-001', 'app-001', 'obj-001')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('校验5（P1-29）— 其他对象 lookup 字段引用此对象时拒绝删除', async () => {
      prisma.$queryRaw.mockResolvedValue([{ count: 0 }]);
      prisma.pageMeta.count.mockResolvedValue(0);
      prisma.processDef.count.mockResolvedValue(0);
      prisma.permissionRule.count.mockResolvedValue(0);
      prisma.objectMeta.findMany.mockResolvedValue([
        makeObject({
          id: 'obj-002',
          name: 'Order',
          fields: [
            {
              id: 'fld-lookup',
              apiName: 'customer_ref',
              label: '客户',
              type: 'lookup',
              config: { lookup: { targetObjectId: 'obj-001', relationType: 'one_to_many' } },
            },
          ],
        }),
      ]);

      const { service } = createService();
      await expect(service.delete('tenant-001', 'app-001', 'obj-001')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.objectMeta.delete).not.toHaveBeenCalled();
    });

    it('校验5（P1-29）— 其他对象 sub_form 字段引用此对象时拒绝删除', async () => {
      prisma.$queryRaw.mockResolvedValue([{ count: 0 }]);
      prisma.pageMeta.count.mockResolvedValue(0);
      prisma.processDef.count.mockResolvedValue(0);
      prisma.permissionRule.count.mockResolvedValue(0);
      prisma.objectMeta.findMany.mockResolvedValue([
        makeObject({
          id: 'obj-003',
          name: 'OrderMain',
          fields: [
            {
              id: 'fld-subform',
              apiName: 'items',
              label: '明细',
              type: 'sub_form',
              config: { subForm: { childObjectId: 'obj-001', parentFieldId: 'fld-parent' } },
            },
          ],
        }),
      ]);

      const { service } = createService();
      await expect(service.delete('tenant-001', 'app-001', 'obj-001')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.objectMeta.delete).not.toHaveBeenCalled();
    });

    it('校验5（P1-29）— 引用字段指向其他对象时不误伤，正常删除', async () => {
      prisma.$queryRaw.mockResolvedValue([{ count: 0 }]);
      prisma.pageMeta.count.mockResolvedValue(0);
      prisma.processDef.count.mockResolvedValue(0);
      prisma.permissionRule.count.mockResolvedValue(0);
      prisma.objectMeta.findMany.mockResolvedValue([
        makeObject({
          id: 'obj-002',
          name: 'Order',
          fields: [
            {
              id: 'fld-lookup',
              apiName: 'other_ref',
              label: '其他引用',
              type: 'lookup',
              config: { lookup: { targetObjectId: 'obj-009', relationType: 'one_to_many' } },
            },
          ],
        }),
      ]);
      prisma.objectMeta.delete.mockResolvedValue({});

      const { service } = createService();
      await expect(service.delete('tenant-001', 'app-001', 'obj-001')).resolves.toBeUndefined();
      expect(prisma.objectMeta.delete).toHaveBeenCalledWith({ where: { id: 'obj-001' } });
    });

    it('无引用时正常删除 + 记录 ChangeLog', async () => {
      prisma.$queryRaw.mockResolvedValue([{ count: 0 }]);
      prisma.pageMeta.count.mockResolvedValue(0);
      prisma.processDef.count.mockResolvedValue(0);
      prisma.permissionRule.count.mockResolvedValue(0);
      prisma.objectMeta.delete.mockResolvedValue({});

      const { service, changeLogService } = createService();
      await service.delete('tenant-001', 'app-001', 'obj-001');

      expect(prisma.objectMeta.delete).toHaveBeenCalledWith({ where: { id: 'obj-001' } });
      expect(changeLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ changeType: 'DELETE' }),
      );
    });

    it('对象不存在时抛出 NotFoundException', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(service.delete('tenant-001', 'app-001', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // 字段管理
  // =========================================================================

  describe('addField', () => {
    it('正常添加字段', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(makeObject({ fields: [] }));
      prisma.objectMeta.update.mockResolvedValue(makeObject());

      const { service } = createService();
      const result = await service.addField('tenant-001', 'app-001', 'obj-001', {
        apiName: 'amount',
        label: '金额',
        type: 'number',
      });

      expect(result.apiName).toBe('amount');
      expect(result.isSystem).toBe(false);
      expect(prisma.objectMeta.update).toHaveBeenCalled();
    });

    it('apiName 已存在时抛出 BadRequestException', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObject({ fields: [makeSystemField('created_by')] }),
      );

      const { service } = createService();
      await expect(
        service.addField('tenant-001', 'app-001', 'obj-001', {
          apiName: 'created_by',
          label: '重复',
          type: 'text',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('对象不存在时抛出 NotFoundException', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(
        service.addField('tenant-001', 'app-001', 'missing', {
          apiName: 'x',
          label: 'X',
          type: 'text',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateField', () => {
    it('正常更新字段 label', async () => {
      const field = makeSystemField('amount');
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObject({ fields: [{ ...field, isSystem: false }] }),
      );
      prisma.objectMeta.update.mockResolvedValue(makeObject());

      const { service } = createService();
      const result = await service.updateField('tenant-001', 'app-001', 'obj-001', 'field-amount', {
        label: '总金额',
      });

      expect(result.label).toBe('总金额');
    });

    it('修改 apiName 时校验唯一性 — 重名抛出 BadRequestException', async () => {
      const fields = [
        { ...makeSystemField('amount'), isSystem: false, id: 'field-1' },
        { ...makeSystemField('name'), isSystem: false, id: 'field-2' },
      ];
      prisma.objectMeta.findFirst.mockResolvedValue(makeObject({ fields }));

      const { service } = createService();
      await expect(
        service.updateField('tenant-001', 'app-001', 'obj-001', 'field-1', { apiName: 'name' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('字段不存在时抛出 NotFoundException', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(makeObject({ fields: [] }));

      const { service } = createService();
      await expect(
        service.updateField('tenant-001', 'app-001', 'obj-001', 'missing-field', { label: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteField', () => {
    it('系统字段不可删除 — 抛出 BadRequestException', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObject({ fields: [makeSystemField('created_by')] }),
      );

      const { service } = createService();
      await expect(
        service.deleteField('tenant-001', 'app-001', 'obj-001', 'field-created_by'),
      ).rejects.toThrow(BadRequestException);
    });

    it('非系统字段可正常删除', async () => {
      const field = { ...makeSystemField('amount'), isSystem: false };
      prisma.objectMeta.findFirst.mockResolvedValue(makeObject({ fields: [field] }));
      prisma.objectMeta.update.mockResolvedValue(makeObject());

      const { service } = createService();
      await service.deleteField('tenant-001', 'app-001', 'obj-001', 'field-amount');

      expect(prisma.objectMeta.update).toHaveBeenCalled();
      const updateCall = prisma.objectMeta.update.mock.calls[0]![0];
      expect((updateCall.data.fields as unknown[]).length).toBe(0);
    });

    it('字段不存在时抛出 NotFoundException', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(makeObject({ fields: [] }));

      const { service } = createService();
      await expect(
        service.deleteField('tenant-001', 'app-001', 'obj-001', 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // 视图管理
  // =========================================================================

  describe('listViews', () => {
    it('返回对象视图列表', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(makeObject());
      prisma.view.findMany.mockResolvedValue([makeView()]);

      const { service } = createService();
      const result = await service.listViews('tenant-001', 'app-001', 'obj-001');

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('All Records');
    });

    it('对象不存在时抛出 NotFoundException', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(service.listViews('tenant-001', 'app-001', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createView', () => {
    it('正常创建视图', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(makeObject());
      prisma.view.create.mockResolvedValue(makeView({ name: 'My View' }));

      const { service } = createService();
      const result = await service.createView('tenant-001', 'app-001', 'obj-001', {
        name: 'My View',
        type: 'LIST',
      });

      expect(result.name).toBe('My View');
      expect(prisma.view.create).toHaveBeenCalled();
    });

    it('对象不存在时抛出 NotFoundException', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(
        service.createView('tenant-001', 'app-001', 'missing', { name: 'V', type: 'LIST' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateView', () => {
    it('正常更新视图（两步租户校验通过）', async () => {
      prisma.view.findFirst.mockResolvedValue(makeView());
      prisma.objectMeta.findFirst.mockResolvedValue(makeObject());
      prisma.view.update.mockResolvedValue(makeView({ name: 'Updated View' }));

      const { service } = createService();
      const result = await service.updateView('tenant-001', 'app-001', 'obj-001', 'view-001', {
        name: 'Updated View',
      });

      expect(result.name).toBe('Updated View');
    });

    it('视图不存在时抛出 NotFoundException', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(makeObject());
      prisma.view.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(
        service.updateView('tenant-001', 'app-001', 'obj-001', 'missing', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('对象不属于该应用（跨应用 ID）时抛出 NotFoundException，不查视图', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(
        service.updateView('tenant-001', 'app-001', 'obj-001', 'view-001', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteView', () => {
    it('正常删除视图', async () => {
      prisma.view.findFirst.mockResolvedValue(makeView());
      prisma.objectMeta.findFirst.mockResolvedValue(makeObject());
      prisma.view.delete.mockResolvedValue({});

      const { service } = createService();
      await service.deleteView('tenant-001', 'app-001', 'obj-001', 'view-001');

      expect(prisma.view.delete).toHaveBeenCalledWith({ where: { id: 'view-001' } });
    });

    it('视图不存在时抛出 NotFoundException', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(makeObject());
      prisma.view.findFirst.mockResolvedValue(null);

      const { service } = createService();
      await expect(
        service.deleteView('tenant-001', 'app-001', 'obj-001', 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
