/**
 * RollupService 单元测试 — 汇总字段计算 / Lookup 写约束 / 子记录反向重算。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { RollupService } from './rollup.service.js';
import { getMockPrisma } from '../test/test-helpers.js';

// ---------------------------------------------------------------------------
// 测试数据工厂
// ---------------------------------------------------------------------------

const RELATION_FIELD_ID = 'fld-lookup';
const ROLLUP_FIELD_ID = 'fld-rollup';
const TARGET_FIELD_ID = 'fld-amount';

/** 父对象（asset）字段：含 lookup 关系字段 + rollup 汇总字段 */
function makeParentFields() {
  return [
    { id: 'fld-name', apiName: 'name', type: 'text', config: {} },
    {
      id: RELATION_FIELD_ID,
      apiName: 'category_ref',
      type: 'lookup',
      config: { lookup: { targetObjectId: 'obj-category', relationType: 'one_to_many' } },
    },
    {
      id: ROLLUP_FIELD_ID,
      apiName: 'total_amount',
      type: 'rollup',
      config: {
        rollup: {
          relationFieldId: RELATION_FIELD_ID,
          targetFieldId: TARGET_FIELD_ID,
          aggregate: 'sum',
        },
      },
    },
  ];
}

/** 子对象（category）字段：含金额字段 */
function makeChildFields() {
  return [
    { id: 'fld-title', apiName: 'title', type: 'text', config: {} },
    { id: TARGET_FIELD_ID, apiName: 'amount', type: 'number', config: {} },
  ];
}

// ---------------------------------------------------------------------------
// Lookup 写约束
// ---------------------------------------------------------------------------

describe('RollupService — Lookup 写约束', () => {
  const prisma = getMockPrisma();
  const service = new RollupService({ computeRecordFields: vi.fn().mockReturnValue({}) } as never);

  it('引用的目标记录全部存在：通过', async () => {
    prisma.record.count.mockResolvedValue(2);
    await expect(
      service.validateLookupWrites('t-1', makeParentFields(), { category_ref: 'r1' }),
    ).resolves.toBeUndefined();
    expect(prisma.record.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ objectId: 'obj-category', id: { in: ['r1'] } }),
      }),
    );
  });

  it('引用不存在：抛 BadRequestException', async () => {
    prisma.record.count.mockResolvedValue(0);
    await expect(
      service.validateLookupWrites('t-1', makeParentFields(), { category_ref: 'ghost' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('无 lookup 字段：跳过校验', async () => {
    await expect(
      service.validateLookupWrites(
        't-1',
        [{ id: 'f', apiName: 'name', type: 'text', config: {} }],
        {
          name: 'x',
        },
      ),
    ).resolves.toBeUndefined();
    expect(prisma.record.count).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Rollup 计算
// ---------------------------------------------------------------------------

describe('RollupService — 聚合计算', () => {
  const prisma = getMockPrisma();
  const service = new RollupService({ computeRecordFields: vi.fn().mockReturnValue({}) } as never);

  beforeEach(() => {
    // 目标对象字段解析（targetFieldId → amount）
    prisma.objectMeta.findFirst.mockResolvedValue({
      id: 'obj-category',
      fields: makeChildFields(),
    });
  });

  it('sum：聚合关联记录的目标字段值', async () => {
    prisma.record.findMany.mockResolvedValue([
      { data: { amount: 100 } },
      { data: { amount: 250 } },
    ]);
    const result = await service.computeRollupFields(
      't-1',
      makeParentFields(),
      { category_ref: 'r1' },
      'parent-1',
    );
    expect(result['total_amount']).toBe(350);
  });

  it('lookup 值为空：count 返回 0，sum 返回 null', async () => {
    const countFields = makeParentFields().map((f) =>
      f.id === ROLLUP_FIELD_ID
        ? {
            ...f,
            config: {
              rollup: { relationFieldId: RELATION_FIELD_ID, aggregate: 'count' },
            },
          }
        : f,
    );
    const result = await service.computeRollupFields('t-1', countFields, {}, 'parent-1');
    expect(result['total_amount']).toBe(0);
  });

  it('avg / min / max', async () => {
    prisma.record.findMany.mockResolvedValue([
      { data: { amount: 10 } },
      { data: { amount: 20 } },
      { data: { amount: 30 } },
    ]);
    const mkFields = (aggregate: string) =>
      makeParentFields().map((f) =>
        f.id === ROLLUP_FIELD_ID
          ? {
              ...f,
              config: {
                rollup: {
                  relationFieldId: RELATION_FIELD_ID,
                  targetFieldId: TARGET_FIELD_ID,
                  aggregate,
                },
              },
            }
          : f,
      );
    expect(
      (await service.computeRollupFields('t-1', mkFields('avg'), { category_ref: 'r' }))[
        'total_amount'
      ],
    ).toBe(20);
    expect(
      (await service.computeRollupFields('t-1', mkFields('min'), { category_ref: 'r' }))[
        'total_amount'
      ],
    ).toBe(10);
    expect(
      (await service.computeRollupFields('t-1', mkFields('max'), { category_ref: 'r' }))[
        'total_amount'
      ],
    ).toBe(30);
  });

  it('rollup 配置缺 relationFieldId：返回 null（不抛错）', async () => {
    const badFields = makeParentFields().map((f) =>
      f.id === ROLLUP_FIELD_ID ? { ...f, config: { rollup: { aggregate: 'sum' } } } : f,
    );
    const result = await service.computeRollupFields('t-1', badFields, { category_ref: 'r' }, 'p');
    // 无效配置的字段被跳过（不出现在结果中）
    expect(result['total_amount']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 子记录写入 → 反向重算父记录
// ---------------------------------------------------------------------------

describe('RollupService — 子记录反向重算', () => {
  const prisma = getMockPrisma();
  const service = new RollupService({ computeRecordFields: vi.fn().mockReturnValue({}) } as never);

  it('lookup 反查引用父记录并重算回写', async () => {
    // 应用内两个对象：父（asset，含 rollup）+ 子（category）
    prisma.objectMeta.findMany.mockResolvedValue([
      { id: 'obj-asset', fields: makeParentFields() },
      { id: 'obj-category', fields: makeChildFields() },
    ]);
    // P1-19：反查走 $queryRaw @>（返回两个父记录）；后续 findMany=子记录聚合读取
    prisma.$queryRaw.mockResolvedValue([{ id: 'parent-1' }, { id: 'parent-2' }]);
    prisma.record.findMany.mockResolvedValue([{ data: { amount: 50 } }]);
    // 读取父记录当前 data（findFirst）
    prisma.objectMeta.findFirst.mockResolvedValue({
      id: 'obj-category',
      fields: makeChildFields(),
    });
    prisma.record.findFirst.mockResolvedValue({
      data: { name: 'x', total_amount: 0, category_ref: 'child-1' },
    });
    prisma.$executeRaw.mockResolvedValue({ count: 1 });

    await service.recomputeParentsForChildRecord('t-1', 'app-1', 'obj-category', 'child-1', {});

    // P1-05：两个父记录都经字段定向 merge 回写（不再整份 updateMany）
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    const [strings, values] = prisma.$executeRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      unknown[],
    ];
    expect(strings.join(' ? ')).toContain('data = data ||');
    // 实现以 JSON.stringify(patch) 作为 $1 参数（mock tagged template 直传原值）
    const patch = JSON.parse(String(values)) as Record<string, unknown>;
    expect(patch['total_amount']).toBe(50);
  });

  it('应用内无 rollup 字段：不做任何查询回写', async () => {
    prisma.objectMeta.findMany.mockResolvedValue([
      { id: 'obj-x', fields: [{ id: 'f', apiName: 'name', type: 'text', config: {} }] },
    ]);
    await service.recomputeParentsForChildRecord('t-1', 'app-1', 'obj-y', 'child-1', {});
    expect(prisma.record.updateMany).not.toHaveBeenCalled();
  });
});

function createRollupService() {
  const formulaEngine = { computeRecordFields: vi.fn().mockReturnValue({}) };
  // P1-10 落地后 RollupService 注入 FormulaEngine（构造参数在实现前传入不报错——esbuild 无类型检查）
  const service = new RollupService(formulaEngine as never);
  return { service, formulaEngine };
}

describe('P1-19 反查与条件查询走 @>（GIN）', () => {
  const prisma = getMockPrisma();

  beforeEach(() => vi.clearAllMocks());

  it('findParentsReferencing 改 raw SQL @>（标量与数组两形态 OR）', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 'parent-1' }]);
    const { service } = createRollupService();

    const ids = await (
      service as unknown as {
        findParentsReferencing: (t: string, o: string, f: string, r: string) => Promise<string[]>;
      }
    ).findParentsReferencing('t-1', 'parent-obj', 'items_ref', 'child-1');

    expect(ids).toEqual(['parent-1']);
    const [strings, ...params] = prisma.$queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = strings.join(' ? ').toLowerCase();
    expect(sql).toContain('data @>');
    expect(sql).toContain('or');
    expect(JSON.stringify(params)).toContain('items_ref');
    // 旧 findMany path 形态不再出现
    expect(prisma.record.findMany).not.toHaveBeenCalled();
  });
});

describe('recomputeOneParent — P1-05 字段定向写 + P1-10 formula 补算', () => {
  const prisma = getMockPrisma();

  beforeEach(() => vi.clearAllMocks());

  function makeParentWithRollupAndFormula() {
    // rollup 字段（relationFieldId 指向本对象 lookup 字段）+ 引用 rollup 的 formula 字段
    return [
      {
        id: 'fld-rel',
        apiName: 'items_ref',
        label: '明细引用',
        type: 'lookup',
        config: { lookup: { targetObjectId: 'child-obj', relationType: 'one_to_many' } },
      },
      {
        id: 'fld-rollup',
        apiName: 'total_amount',
        label: '金额合计',
        type: 'rollup',
        config: {
          rollup: { relationFieldId: 'fld-rel', targetFieldId: 'fld-amount', aggregate: 'sum' },
        },
      },
      {
        id: 'fld-formula',
        apiName: 'tax',
        label: '税额',
        type: 'formula',
        config: { formula: '{{total_amount * 0.1}}', returnType: 'Number' },
      },
      { id: 'fld-biz', apiName: 'owner_note', label: '人工备注', type: 'text', config: {} },
    ];
  }

  it('P1-05：回写走 JSONB 字段定向 merge（data = data ||），不整份写回陈旧副本', async () => {
    prisma.objectMeta.findMany.mockResolvedValue([]);
    prisma.record.findFirst.mockResolvedValue({
      id: 'parent-1',
      data: { owner_note: '并发修改后的值', total_amount: 0 },
    });
    // rollup 计算出 total_amount=150
    const findMany = prisma.record.findMany;
    findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      // 子记录聚合查询（rollup 反查）：返回一条金额 150 的子记录
      if ((args.where as { objectId?: string })?.objectId === 'child-obj') {
        return [{ id: 'c1', data: { amount: 150, items_ref: 'parent-1' } }];
      }
      return [];
    });
    prisma.$executeRaw.mockResolvedValue({ count: 1 });

    const { service, formulaEngine } = createRollupService();
    formulaEngine.computeRecordFields.mockReturnValue({ tax: 15 });
    await service.recomputeOneParent(
      't-1',
      'parent-obj',
      makeParentWithRollupAndFormula(),
      'parent-1',
    );

    // 整份写回（旧实现 updateMany data=mergedData）必须消失
    expect(prisma.record.updateMany).not.toHaveBeenCalled();
    const raw = prisma.$executeRaw as ReturnType<typeof vi.fn>;
    expect(raw).toHaveBeenCalledTimes(1);
    const [strings, values] = raw.mock.calls[0] as unknown as [TemplateStringsArray, unknown[]];
    const sql = strings.join(' ? ');
    expect(sql).toContain('data = data ||');
    // patch 只含计算字段（rollup+formula），绝不含人工字段
    const patch = JSON.parse(String(values)) as Record<string, unknown>;
    // patch 键集 = 计算字段（rollup ∪ formula），绝不含业务字段
    expect(Object.keys(patch).sort()).toEqual(['tax', 'total_amount']);
    expect(patch.owner_note).toBeUndefined();
  });

  it('P1-10：父记录 rollup 重算后补 formula 重算（公式引用 rollup 字段不再滞后）', async () => {
    prisma.objectMeta.findMany.mockResolvedValue([]);
    prisma.record.findFirst.mockResolvedValue({
      id: 'parent-1',
      data: { total_amount: 0 },
    });
    prisma.record.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      if ((args.where as { objectId?: string })?.objectId === 'child-obj') {
        return [{ id: 'c1', data: { amount: 150, items_ref: 'parent-1' } }];
      }
      return [];
    });
    prisma.$executeRaw.mockResolvedValue({ count: 1 });

    const { service, formulaEngine } = createRollupService();
    formulaEngine.computeRecordFields.mockReturnValue({ tax: 15 });
    await service.recomputeOneParent(
      't-1',
      'parent-obj',
      makeParentWithRollupAndFormula(),
      'parent-1',
    );

    expect(formulaEngine.computeRecordFields).toHaveBeenCalledTimes(1);
  });
});
