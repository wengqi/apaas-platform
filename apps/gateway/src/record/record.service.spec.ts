/**
 * RecordService 单元测试 — JSONB 宽表记录 CRUD。
 *
 * 测试覆盖：
 * - 查询（分页、筛选、权限条件注入、字段级投影）
 * - 单条查询（get）
 * - 创建（AutoNumber 生成 + Formula 计算 + 事件触发）
 * - 更新（AutoNumber 不可更新 + Formula 重算 + 合并）
 * - 删除 + 事件触发
 * - 辅助方法（parseFilter / buildOrderBy / toResult）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FieldType } from '@apaas/shared';
import { RecordService } from './record.service.js';
import { getMockPrisma } from '../test/test-helpers.js';
import { makeObjectMeta, makeRecord } from '../test/mock-factories.js';

// ---------------------------------------------------------------------------
// Mock 依赖工厂
// ---------------------------------------------------------------------------

function createMockFormulaEngine() {
  return {
    computeRecordFields: vi.fn().mockReturnValue({}),
  };
}

function createMockAutoNumberGenerator() {
  return {
    generate: vi.fn().mockResolvedValue('ORD-0001'),
  };
}

function createMockTriggerService() {
  return {
    onRecordEvent: vi.fn().mockResolvedValue(undefined),
  };
}

function createService() {
  const formulaEngine = createMockFormulaEngine();
  const autoNumberGenerator = createMockAutoNumberGenerator();
  const triggerService = createMockTriggerService();
  const rollupService = {
    validateLookupWrites: vi.fn().mockResolvedValue(undefined),
    computeRollupFields: vi.fn().mockResolvedValue({}),
    recomputeParentsForChildRecord: vi.fn().mockResolvedValue(undefined),
  };
  // R1.4：默认未部署（bundle=null → 搭建期活表字段语义）；已部署用例显式配置 bundle
  const envResolver = {
    resolve: vi.fn().mockResolvedValue({
      environmentId: '',
      versionId: null,
      bundle: null,
    }),
  };
  const service = new RecordService(
    formulaEngine as unknown as ConstructorParameters<typeof RecordService>[0],
    autoNumberGenerator as unknown as ConstructorParameters<typeof RecordService>[1],
    triggerService as unknown as ConstructorParameters<typeof RecordService>[2],
    rollupService as unknown as ConstructorParameters<typeof RecordService>[3],
    envResolver as unknown as ConstructorParameters<typeof RecordService>[4],
  );
  return {
    service,
    formulaEngine,
    autoNumberGenerator,
    triggerService,
    rollupService,
    envResolver,
  };
}

describe('RecordService', () => {
  const prisma = getMockPrisma();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // query
  // =========================================================================

  describe('query', () => {
    it('返回分页记录（默认 page=1, pageSize=20）', async () => {
      const records = [makeRecord()];
      prisma.record.findMany.mockResolvedValue(records);
      prisma.record.count.mockResolvedValue(1);

      const { service } = createService();
      const result = await service.query('tenant-001', 'obj-001', {});

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('rec-001');
    });

    it('自定义 page 和 pageSize 被正确应用', async () => {
      prisma.record.findMany.mockResolvedValue([]);
      prisma.record.count.mockResolvedValue(0);

      const { service } = createService();
      await service.query('tenant-001', 'obj-001', { page: 3, pageSize: 50 });

      const findManyCall = prisma.record.findMany.mock.calls[0]![0];
      expect(findManyCall.skip).toBe(100); // (3-1) * 50
      expect(findManyCall.take).toBe(50);
    });

    it('pageSize 上限 100', async () => {
      prisma.record.findMany.mockResolvedValue([]);
      prisma.record.count.mockResolvedValue(0);

      const { service } = createService();
      await service.query('tenant-001', 'obj-001', { pageSize: 500 });

      expect(prisma.record.findMany.mock.calls[0]![0].take).toBe(100);
    });

    it('where 子句包含 tenantId 和 objectId', async () => {
      prisma.record.findMany.mockResolvedValue([]);
      prisma.record.count.mockResolvedValue(0);

      const { service } = createService();
      await service.query('tenant-001', 'obj-001', {});

      const where = prisma.record.findMany.mock.calls[0]![0].where;
      expect(where.tenantId).toBe('tenant-001');
      expect(where.objectId).toBe('obj-001');
    });

    it('权限条件被注入到 where.AND', async () => {
      prisma.record.findMany.mockResolvedValue([]);
      prisma.record.count.mockResolvedValue(0);

      const { service } = createService();
      await service.query(
        'tenant-001',
        'obj-001',
        {},
        {
          condition: { '==': [{ var: 'createdBy' }, 'user-001'] },
          fieldScope: null,
          currentUserId: 'user-001',
        },
      );

      const where = prisma.record.findMany.mock.calls[0]![0].where;
      expect(where.AND).toBeDefined();
      expect(Array.isArray(where.AND)).toBe(true);
    });

    it('fieldScope 白名单投影 data 字段', async () => {
      prisma.record.findMany.mockResolvedValue([
        makeRecord({ data: { name: 'Record A', status: 'active', secret: 'hidden' } }),
      ]);
      prisma.record.count.mockResolvedValue(1);

      const { service } = createService();
      const result = await service.query(
        'tenant-001',
        'obj-001',
        {},
        {
          condition: null,
          fieldScope: ['name', 'status'],
          currentUserId: 'user-001',
        },
      );

      const data = result.items[0]!.data;
      expect(data.name).toBe('Record A');
      expect(data.status).toBe('active');
      expect(data.secret).toBeUndefined();
    });

    it('排序 — 系统字段 createdAt:desc（默认）', async () => {
      prisma.record.findMany.mockResolvedValue([]);
      prisma.record.count.mockResolvedValue(0);

      const { service } = createService();
      await service.query('tenant-001', 'obj-001', {});

      expect(prisma.record.findMany.mock.calls[0]![0].orderBy).toEqual({ createdAt: 'desc' });
    });

    it('排序 — 自定义系统字段 updatedAt:asc', async () => {
      prisma.record.findMany.mockResolvedValue([]);
      prisma.record.count.mockResolvedValue(0);

      const { service } = createService();
      await service.query('tenant-001', 'obj-001', { sort: 'updatedAt:asc' });

      expect(prisma.record.findMany.mock.calls[0]![0].orderBy).toEqual({ updatedAt: 'asc' });
    });

    it('filter 参数解析为 JsonLogic where', async () => {
      prisma.record.findMany.mockResolvedValue([]);
      prisma.record.count.mockResolvedValue(0);

      const { service } = createService();
      const filter = JSON.stringify({ '==': [{ var: 'status' }, 'active'] });
      await service.query('tenant-001', 'obj-001', { filter });

      const where = prisma.record.findMany.mock.calls[0]![0].where;
      expect(where.AND).toBeDefined();
    });

    it('filter 为无效 JSON 时不崩溃（返回 null filter）', async () => {
      prisma.record.findMany.mockResolvedValue([]);
      prisma.record.count.mockResolvedValue(0);

      const { service } = createService();
      await service.query('tenant-001', 'obj-001', { filter: 'not-json' });

      // 查询正常执行，where 不含 AND filter
      const where = prisma.record.findMany.mock.calls[0]![0].where;
      expect(where.AND).toBeUndefined();
    });
  });

  // =========================================================================
  // get
  // =========================================================================

  describe('get', () => {
    it('记录不存在时抛出 NotFoundException', async () => {
      prisma.record.findFirst.mockResolvedValue(null);
      const { service } = createService();

      await expect(service.get('tenant-001', 'missing-rec')).rejects.toThrow(NotFoundException);
    });

    it('返回记录数据', async () => {
      prisma.record.findFirst.mockResolvedValue(makeRecord());
      const { service } = createService();

      const result = await service.get('tenant-001', 'rec-001');

      expect(result.id).toBe('rec-001');
      expect(result.data.name).toBe('Test Record');
    });

    it('fieldScope 投影生效', async () => {
      prisma.record.findFirst.mockResolvedValue(
        makeRecord({ data: { name: 'A', code: 'X', desc: 'D' } }),
      );
      const { service } = createService();

      const result = await service.get('tenant-001', 'rec-001', {
        condition: null,
        fieldScope: ['name'],
        currentUserId: 'user-001',
      });

      expect(result.data.name).toBe('A');
      expect(result.data.code).toBeUndefined();
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe('create', () => {
    it('对象不存在时抛出 NotFoundException', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(null);
      const { service } = createService();

      await expect(service.create('tenant-001', 'missing-obj', 'user-001', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('AutoNumber 字段自动生成编号', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectMeta({
          fields: [
            {
              id: 'f1',
              apiName: 'order_no',
              type: FieldType.AutoNumber,
              config: { autoNumber: { format: 'ORD-{seq:0000}' } },
            },
          ],
        }),
      );
      prisma.record.create.mockResolvedValue(makeRecord({ data: { order_no: 'ORD-0001' } }));

      const { service, autoNumberGenerator, envResolver } = createService();
      envResolver.resolve.mockResolvedValue({
        environmentId: 'envrow-1',
        versionId: 'v-1',
        bundle: {
          meta: { appId: 'app-1' },
          pages: [],
          processes: [],
          objects: [
            {
              id: 'obj-001',
              apiName: 'object',
              fields: [
                {
                  id: 'f1',
                  apiName: 'order_no',
                  type: FieldType.AutoNumber,
                  config: { autoNumber: { format: 'ORD-{seq:0000}' } },
                },
              ],
            },
          ],
        },
      });
      await service.create('tenant-001', 'obj-001', 'user-001', { name: 'Test' });

      expect(autoNumberGenerator.generate).toHaveBeenCalledWith(
        'ORD-{seq:0000}',
        'obj-001',
        'tenant-001',
        'prod',
        expect.anything(), // P1-28：事务客户端（计数器递增加入创建事务）
      );
    });

    it('P1-28：AutoNumber 生成与记录写入同事务（计数器递增在 $transaction 回调内，失败可回滚防结构性跳号）', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectMeta({
          fields: [
            {
              id: 'f1',
              apiName: 'order_no',
              type: FieldType.AutoNumber,
              config: { autoNumber: { format: 'ORD-{seq:0000}' } },
            },
          ],
        }),
      );
      prisma.record.create.mockResolvedValue(makeRecord());

      const { service, autoNumberGenerator } = createService();
      await service.create('tenant-001', 'obj-001', 'user-001', { name: 'Test' });

      // 编号生成与记录写入必须发生在同一 $transaction 回调内——中间环节
      // （lookup 校验 400 / create 失败）抛错时计数器随事务回滚，不再永久跳号
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const txOrder = prisma.$transaction.mock.invocationCallOrder[0]!;
      expect(autoNumberGenerator.generate.mock.invocationCallOrder[0]!).toBeGreaterThan(txOrder);
      expect(prisma.record.create.mock.invocationCallOrder[0]!).toBeGreaterThan(txOrder);
      // 事务客户端传入生成器（计数器 upsert 消费同一事务连接）
      const genArgs = autoNumberGenerator.generate.mock.calls[0]! as unknown[];
      expect(genArgs[4]).toBeDefined();
    });

    it('Formula 字段自动计算', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectMeta({
          fields: [
            {
              id: 'f1',
              apiName: 'total',
              type: FieldType.Formula,
              config: { formula: '{{price * quantity}}' },
            },
          ],
        }),
      );
      prisma.record.create.mockResolvedValue(
        makeRecord({ data: { price: 100, quantity: 3, total: 300 } }),
      );

      const { service, formulaEngine } = createService();
      formulaEngine.computeRecordFields.mockReturnValue({ total: 300 });

      const result = await service.create('tenant-001', 'obj-001', 'user-001', {
        price: 100,
        quantity: 3,
      });

      expect(formulaEngine.computeRecordFields).toHaveBeenCalled();
      expect(result.data.total).toBe(300);
    });

    it('P1-10：计算顺序按依赖方向——Rollup 先于 Formula（公式可引用 rollup 字段）', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectMeta({
          fields: [
            {
              id: 'f-rollup',
              apiName: 'total_amount',
              type: FieldType.Rollup,
              config: {
                rollup: { relationFieldId: 'f-rel', targetFieldId: 'x', aggregate: 'sum' },
              },
            },
            {
              id: 'f-formula',
              apiName: 'tax',
              type: FieldType.Formula,
              config: { formula: '{{total_amount * 0.1}}', returnType: 'Number' },
            },
          ],
        }),
      );
      prisma.record.create.mockResolvedValue(makeRecord());
      const { service, formulaEngine, rollupService } = createService();

      await service.create('tenant-001', 'obj-001', 'user-001', {});

      // rollup 计算必须先于 formula 计算（formula 引用 rollup 字段才拿得到新值）
      const rollupOrder = rollupService.computeRollupFields.mock.invocationCallOrder[0]!;
      const formulaOrder = formulaEngine.computeRecordFields.mock.invocationCallOrder[0]!;
      expect(rollupOrder).toBeLessThan(formulaOrder);
    });

    it('创建后触发 onRecordEvent(created)', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(makeObjectMeta());
      prisma.record.create.mockResolvedValue(makeRecord());

      const { service, triggerService } = createService();
      await service.create('tenant-001', 'obj-001', 'user-001', { name: 'Test' });

      expect(triggerService.onRecordEvent).toHaveBeenCalledWith(
        'tenant-001',
        'app-001',
        'obj-001',
        'created',
        expect.objectContaining({ id: 'rec-001' }),
        'prod',
      );
    });

    it('B1: fieldScope 过滤创建时的写入字段', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(makeObjectMeta());
      prisma.record.create.mockResolvedValue(makeRecord());

      const { service } = createService();
      await service.create(
        'tenant-001',
        'obj-001',
        'user-001',
        { name: 'Test', salary: 999 },
        { condition: null, fieldScope: ['name'], currentUserId: 'user-001' },
      );

      // 验证 prisma.record.create 收到的 data 仅含 name（salary 被 fieldScope 过滤）
      const createCall = prisma.record.create.mock.calls[0]![0];
      expect(createCall.data.data).toEqual({ name: 'Test' });
    });

    it('B1: fieldScope=null 不限制创建字段', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(makeObjectMeta());
      prisma.record.create.mockResolvedValue(makeRecord());

      const { service } = createService();
      await service.create(
        'tenant-001',
        'obj-001',
        'user-001',
        { name: 'Test', salary: 999 },
        { condition: null, fieldScope: null, currentUserId: 'user-001' },
      );

      const createCall = prisma.record.create.mock.calls[0]![0];
      expect(createCall.data.data).toEqual({ name: 'Test', salary: 999 });
    });

    // ======================================================================
    // 服务端字段约束校验（QA D-002 修复，2026-10-06）
    // ======================================================================
    it('required 字段缺失 → BadRequestException', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectMeta({
          fields: [
            {
              id: 'f1',
              apiName: 'name',
              label: '名称',
              type: FieldType.Text,
              required: true,
              config: {},
            },
          ],
        }),
      );
      const { service } = createService();

      await expect(
        service.create('tenant-001', 'obj-001', 'user-001', { name: '' }),
      ).rejects.toThrow('字段「名称」为必填项');
    });

    it('maxLength 超长 → BadRequestException', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectMeta({
          fields: [
            {
              id: 'f1',
              apiName: 'name',
              label: '名称',
              type: FieldType.Text,
              config: { type: 'text', maxLength: 5 },
            },
          ],
        }),
      );
      const { service } = createService();

      await expect(
        service.create('tenant-001', 'obj-001', 'user-001', { name: '123456' }),
      ).rejects.toThrow('超出最大长度 5');
    });

    it('unique 字段重名 → ConflictException（含 @> 等值查询）', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectMeta({
          fields: [
            {
              id: 'f1',
              apiName: 'name',
              label: '名称',
              type: FieldType.Text,
              unique: true,
              config: {},
            },
          ],
        }),
      );
      prisma.$queryRaw.mockResolvedValue([{ count: 1 }]);
      prisma.record.findFirst.mockResolvedValue(makeRecord());
      const { service } = createService();

      await expect(
        service.create('tenant-001', 'obj-001', 'user-001', { name: '重复名' }),
      ).rejects.toThrow('已存在（唯一约束）');
      // P1-19：查重走 $queryRaw @>（参数含 {name:'重复名'} 包含形态）
      const [strings, ...params] = prisma.$queryRaw.mock.calls[0] as unknown as [
        TemplateStringsArray,
        ...unknown[],
      ];
      expect(strings.join(' ? ').toLowerCase()).toContain('data @>');
      expect(JSON.stringify(params)).toContain('重复名');
    });

    it('unique 校验通过（无重名）→ 正常创建', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectMeta({
          fields: [{ id: 'f1', apiName: 'name', type: FieldType.Text, unique: true, config: {} }],
        }),
      );
      prisma.record.findFirst.mockResolvedValue(null);
      prisma.record.create.mockResolvedValue(makeRecord({ data: { name: '唯一名' } }));
      const { service } = createService();

      const result = await service.create('tenant-001', 'obj-001', 'user-001', { name: '唯一名' });
      expect(result.data.name).toBe('唯一名');
    });

    it('AutoNumber/Formula/Rollup 与系统字段不参与约束校验', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectMeta({
          fields: [
            {
              id: 'f1',
              apiName: 'order_no',
              type: FieldType.AutoNumber,
              required: true,
              config: { autoNumber: { format: 'A-{seq}' } },
            },
            {
              id: 'f2',
              apiName: 'owner',
              type: FieldType.User,
              required: true,
              isSystem: true,
              config: {},
            },
          ],
        }),
      );
      prisma.record.create.mockResolvedValue(makeRecord());
      const { service } = createService();

      // 两者均由系统生成/管理——不因用户未传而拦截
      await expect(service.create('tenant-001', 'obj-001', 'user-001', {})).resolves.toBeTruthy();
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe('update', () => {
    it('P1-02：更新走乐观锁条件更新（WHERE version=旧值 + version 递增）', async () => {
      prisma.record.findFirst.mockResolvedValue(
        makeRecord({ data: { name: '旧名' }, version: 3, object: { fields: [] } }),
      );
      prisma.record.updateMany.mockResolvedValue({ count: 1 });
      prisma.record.updateMany.mockResolvedValue({ count: 1 });
      prisma.record.findUnique.mockResolvedValue(makeRecord({ data: { name: '新名' } }));

      const { service } = createService();
      await service.update('tenant-001', 'rec-001', 'user-001', { name: '新名' });

      expect(prisma.record.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'rec-001', version: 3 }),
          data: expect.objectContaining({ version: { increment: 1 } }),
        }),
      );
    });

    it('P1-19：unique 查重走 GIN 可达的 @> 形态（raw SQL，不再 path+equals Seq Scan）', async () => {
      prisma.objectMeta.findFirst.mockResolvedValue(
        makeObjectMeta({
          fields: [{ id: 'f1', apiName: 'code', type: FieldType.Text, unique: true, config: {} }],
        }),
      );
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.record.create.mockResolvedValue(makeRecord());
      const { service } = createService();

      await service.create('tenant-001', 'obj-001', 'user-001', { code: 'A-1' });

      const raw = prisma.$queryRaw as ReturnType<typeof vi.fn>;
      expect(raw).toHaveBeenCalled();
      const [strings] = raw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
      const sql = strings.join(' ? ').toLowerCase();
      expect(sql).toContain('data @>');
      expect(sql).not.toContain("data->>'code'");
      // 参数含 {code:'A-1'} 包含形态（jsonb 包含语义，命中 GIN）
      const params = raw.mock.calls[0]!.slice(1) as unknown[];
      expect(JSON.stringify(params)).toContain('code');
    });

    it('P1-02：客户端回传 version 时严格比对快照（长持快照编辑冲突检测）', async () => {
      prisma.record.findFirst.mockResolvedValue(
        makeRecord({ data: { name: '旧名' }, version: 7, object: { fields: [] } }),
      );
      prisma.record.updateMany.mockResolvedValue({ count: 0 });

      const { service } = createService();
      // 客户端持有 version=3 的旧快照（服务端已是 7）→ 严格比对 → 409
      await expect(
        service.update('tenant-001', 'rec-001', 'user-001', { name: '新' }, undefined, 3),
      ).rejects.toThrow(ConflictException);
      const where = prisma.record.updateMany.mock.calls[0]![0]!.where as Record<string, unknown>;
      expect(where.version).toBe(3);
    });

    it('P1-02：版本冲突（updateMany 命中 0 行）→ 409 提示刷新重试', async () => {
      prisma.record.findFirst.mockResolvedValue(
        makeRecord({ data: { name: '旧名' }, version: 3, object: { fields: [] } }),
      );
      // 他人先一步更新，version 已推进 → 条件更新命中 0 行
      prisma.record.updateMany.mockResolvedValue({ count: 0 });

      const { service } = createService();
      await expect(
        service.update('tenant-001', 'rec-001', 'user-001', { name: '新名' }),
      ).rejects.toThrow(ConflictException);

      // 冲突时不得以陈旧快照覆盖写入
      expect(prisma.record.update).not.toHaveBeenCalled();
    });

    it('记录不存在时抛出 NotFoundException', async () => {
      prisma.record.findFirst.mockResolvedValue(null);
      const { service } = createService();

      await expect(service.update('tenant-001', 'missing-rec', 'user-001', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('把必填字段清空 → BadRequestException（QA D-002）', async () => {
      const fields = [
        {
          id: 'f1',
          apiName: 'name',
          label: '名称',
          type: FieldType.Text,
          required: true,
          config: {},
        },
      ];
      prisma.record.findFirst.mockResolvedValue(
        makeRecord({ data: { name: '旧名' }, object: { fields } }),
      );
      const { service } = createService();

      await expect(
        service.update('tenant-001', 'rec-001', 'user-001', { name: '' }),
      ).rejects.toThrow('字段「名称」为必填项');
    });

    it('存量缺必填值不阻塞无关更新（required 只拦本次清空）', async () => {
      const fields = [
        {
          id: 'f1',
          apiName: 'name',
          label: '名称',
          type: FieldType.Text,
          required: true,
          config: {},
        },
      ];
      prisma.record.findFirst.mockResolvedValue(
        makeRecord({ data: {}, object: { fields } }), // 历史数据缺 name
      );
      prisma.record.updateMany.mockResolvedValue({ count: 1 });
      prisma.record.findUnique.mockResolvedValue(makeRecord({ data: { remark: 'x' } }));
      const { service } = createService();

      await expect(
        service.update('tenant-001', 'rec-001', 'user-001', { remark: 'x' }),
      ).resolves.toBeTruthy();
    });

    it('unique 校验排除自身记录（QA D-002）', async () => {
      const fields = [
        { id: 'f1', apiName: 'name', type: FieldType.Text, unique: true, config: {} },
      ];
      prisma.record.findFirst.mockResolvedValueOnce(
        makeRecord({ data: { name: '我自己的名字' }, object: { fields } }),
      ); // 取 existing
      // P1-19：unique 查重走 $queryRaw → 无重复
      prisma.$queryRaw.mockResolvedValue([{ count: 0 }]);
      prisma.record.updateMany.mockResolvedValue({ count: 1 });
      prisma.record.findUnique.mockResolvedValue(makeRecord({ data: { name: '我自己的名字' } }));
      const { service } = createService();

      await service.update('tenant-001', 'rec-001', 'user-001', { name: '我自己的名字' });
      // P1-19：排除自身经 $queryRaw SQL（id <> 占位符）
      const excludeSelf = prisma.$queryRaw.mock.calls.some((call: unknown[]) =>
        (call[0] as TemplateStringsArray).join(' ? ').toLowerCase().includes('id <>'),
      );
      expect(excludeSelf).toBe(true);
    });

    it('AutoNumber 字段在更新时被忽略', async () => {
      const existingData = { name: 'Old', order_no: 'ORD-0001' };
      prisma.record.findFirst.mockResolvedValue(
        makeRecord({
          data: existingData,
          object: {
            fields: [{ id: 'f1', apiName: 'order_no', type: FieldType.AutoNumber, config: {} }],
          },
        }),
      );
      prisma.record.updateMany.mockResolvedValue({ count: 1 });
      prisma.record.findUnique.mockResolvedValue(
        makeRecord({ data: { name: 'New', order_no: 'ORD-0001' } }),
      );

      const { service, envResolver } = createService();
      envResolver.resolve.mockResolvedValue({
        environmentId: 'envrow-1',
        versionId: 'v-1',
        bundle: {
          meta: { appId: 'app-1' },
          pages: [],
          processes: [],
          objects: [
            {
              id: 'obj-001',
              apiName: 'object',
              fields: [{ id: 'f1', apiName: 'order_no', type: FieldType.AutoNumber, config: {} }],
            },
          ],
        },
      });
      // 尝试更新 order_no（应被忽略）
      const result = await service.update('tenant-001', 'rec-001', 'user-001', {
        name: 'New',
        order_no: 'ORD-9999',
      });

      // order_no 应保持原值
      expect(result.data.order_no).toBe('ORD-0001');
      // update 调用中的 data 不应包含 order_no=ORD-9999
      const updateCall = prisma.record.updateMany.mock.calls[0]![0];
      expect((updateCall.data.data as Record<string, unknown>).order_no).not.toBe('ORD-9999');
    });

    it('更新后触发 onRecordEvent(updated)', async () => {
      prisma.record.findFirst.mockResolvedValue(
        makeRecord({
          data: { name: 'Old' },
          object: { fields: [] },
        }),
      );
      prisma.record.updateMany.mockResolvedValue({ count: 1 });
      prisma.record.findUnique.mockResolvedValue(makeRecord({ data: { name: 'New' } }));

      const { service, triggerService } = createService();
      await service.update('tenant-001', 'rec-001', 'user-001', { name: 'New' });

      expect(triggerService.onRecordEvent).toHaveBeenCalledWith(
        'tenant-001',
        'app-001',
        'obj-001',
        'updated',
        expect.objectContaining({ id: 'rec-001' }),
        'prod',
      );
    });

    it('Formula 字段在更新后被重新计算', async () => {
      prisma.record.findFirst.mockResolvedValue(
        makeRecord({
          data: { price: 100, quantity: 2, total: 200 },
          object: {
            fields: [
              {
                id: 'f1',
                apiName: 'total',
                type: FieldType.Formula,
                config: { formula: '{{price * quantity}}' },
              },
            ],
          },
        }),
      );
      prisma.record.updateMany.mockResolvedValue({ count: 1 });
      prisma.record.findUnique.mockResolvedValue(
        makeRecord({ data: { price: 100, quantity: 5, total: 500 } }),
      );

      const { service, formulaEngine } = createService();
      formulaEngine.computeRecordFields.mockReturnValue({ total: 500 });

      const result = await service.update('tenant-001', 'rec-001', 'user-001', {
        quantity: 5,
      });

      expect(formulaEngine.computeRecordFields).toHaveBeenCalled();
      expect(result.data.total).toBe(500);
    });

    it('S1: update 注入行级权限条件到 findFirst where', async () => {
      prisma.record.findFirst.mockResolvedValue(
        makeRecord({ data: { name: 'Old' }, object: { fields: [] } }),
      );
      prisma.record.updateMany.mockResolvedValue({ count: 1 });
      prisma.record.findUnique.mockResolvedValue(makeRecord({ data: { name: 'New' } }));

      const { service } = createService();
      const permissionContext = {
        condition: { '==': [{ var: 'created_by' }, { currentUser: true }] },
        fieldScope: null,
        currentUserId: 'user-001',
      };
      await service.update('tenant-001', 'rec-001', 'user-001', { name: 'New' }, permissionContext);

      // findFirst 的 where 应包含 AND（行级条件注入）
      const findCall = prisma.record.findFirst.mock.calls[0]![0];
      expect(findCall.where.AND).toBeDefined();
      expect(Array.isArray(findCall.where.AND)).toBe(true);
    });

    it('S1: update 时 fieldScope 白名单过滤写入字段', async () => {
      prisma.record.findFirst.mockResolvedValue(
        makeRecord({ data: { name: 'Old', status: 'active' }, object: { fields: [] } }),
      );
      prisma.record.updateMany.mockResolvedValue({ count: 1 });
      prisma.record.findUnique.mockResolvedValue(
        makeRecord({ data: { name: 'New', status: 'active' } }),
      );

      const { service } = createService();
      const permissionContext = {
        condition: null,
        fieldScope: ['name'], // 仅允许写 name 字段
        currentUserId: 'user-001',
      };
      await service.update(
        'tenant-001',
        'rec-001',
        'user-001',
        { name: 'New', status: 'hacked' },
        permissionContext,
      );

      // status 不在 fieldScope 内，不应被写入
      const updateCall = prisma.record.updateMany.mock.calls[0]![0];
      const writtenData = updateCall.data.data as Record<string, unknown>;
      expect(writtenData.name).toBe('New');
      expect(writtenData.status).toBe('active');
    });
  });

  // =========================================================================
  // S1 行级权限 — get / delete 条件注入
  // =========================================================================

  describe('S1 行级权限注入', () => {
    const permissionContext = {
      condition: { '==': [{ var: 'created_by' }, { currentUser: true }] },
      fieldScope: null,
      currentUserId: 'user-001',
    };

    it('get 注入行级条件到 findFirst where', async () => {
      prisma.record.findFirst.mockResolvedValue(makeRecord({ data: { name: 'A' } }));

      const { service } = createService();
      await service.get('tenant-001', 'rec-001', permissionContext);

      const findCall = prisma.record.findFirst.mock.calls[0]![0];
      expect(findCall.where.id).toBe('rec-001');
      expect(findCall.where.AND).toBeDefined();
    });

    it('delete 注入行级条件到 findFirst where', async () => {
      prisma.record.findFirst.mockResolvedValue(makeRecord({ data: { name: 'A' } }));
      prisma.record.deleteMany.mockResolvedValue({ count: 1 });

      const { service } = createService();
      await service.delete('tenant-001', 'rec-001', permissionContext);

      const findCall = prisma.record.findFirst.mock.calls[0]![0];
      expect(findCall.where.AND).toBeDefined();
    });

    it('batchDelete 仅删除通过条件校验的记录', async () => {
      prisma.record.findMany.mockResolvedValue([makeRecord({ id: 'rec-001', data: {} })]);
      prisma.record.deleteMany.mockResolvedValue({ count: 1 });

      const { service, triggerService } = createService();
      await service.batchDelete('tenant-001', ['rec-001', 'rec-002'], permissionContext);

      // deleteMany 仅收到通过校验的 rec-001（rec-002 条件外被忽略）
      const deleteCall = prisma.record.deleteMany.mock.calls[0]![0];
      expect(deleteCall.where.id).toEqual({ in: ['rec-001'] });
      // findMany 的 where 应包含行级条件
      const findCall = prisma.record.findMany.mock.calls[0]![0];
      expect(findCall.where.AND).toBeDefined();
      expect(triggerService.onRecordEvent).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe('delete', () => {
    it('记录不存在时抛出 NotFoundException', async () => {
      prisma.record.findFirst.mockResolvedValue(null);
      const { service } = createService();

      await expect(service.delete('tenant-001', 'missing-rec')).rejects.toThrow(NotFoundException);
    });

    it('正常删除并触发 onRecordEvent(deleted)', async () => {
      prisma.record.findFirst.mockResolvedValue(makeRecord({ data: { name: 'To Delete' } }));
      prisma.record.deleteMany.mockResolvedValue({ count: 1 });

      const { service, triggerService } = createService();
      await service.delete('tenant-001', 'rec-001');

      expect(prisma.record.deleteMany).toHaveBeenCalledWith({
        where: { id: 'rec-001', tenantId: 'tenant-001' },
      });
      expect(triggerService.onRecordEvent).toHaveBeenCalledWith(
        'tenant-001',
        'app-001',
        'obj-001',
        'deleted',
        expect.objectContaining({ id: 'rec-001', name: 'To Delete' }),
        'prod',
      );
    });

    it('deleteMany 返回 count=0 时抛出 NotFoundException', async () => {
      prisma.record.findFirst.mockResolvedValue(makeRecord());
      prisma.record.deleteMany.mockResolvedValue({ count: 0 });

      const { service } = createService();

      await expect(service.delete('tenant-001', 'rec-001')).rejects.toThrow(NotFoundException);
    });
  });
});
