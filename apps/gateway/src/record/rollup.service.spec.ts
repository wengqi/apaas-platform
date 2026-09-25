/**
 * RollupService 单元测试 — 汇总字段计算 / Lookup 写约束 / 子记录反向重算。
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
  const service = new RollupService();

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
  const service = new RollupService();

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
  const service = new RollupService();

  it('lookup 反查引用父记录并重算回写', async () => {
    // 应用内两个对象：父（asset，含 rollup）+ 子（category）
    prisma.objectMeta.findMany.mockResolvedValue([
      { id: 'obj-asset', fields: makeParentFields() },
      { id: 'obj-category', fields: makeChildFields() },
    ]);
    // 反查父记录
    prisma.record.findMany
      // 第一次调用：反查引用子记录的父记录
      .mockResolvedValueOnce([{ id: 'parent-1' }, { id: 'parent-2' }])
      // 后续调用：读取父记录 data + 子记录值
      .mockResolvedValue([{ data: { amount: 50 } }]);
    // 读取父记录当前 data（findFirst）
    prisma.objectMeta.findFirst.mockResolvedValue({
      id: 'obj-category',
      fields: makeChildFields(),
    });
    prisma.record.findFirst.mockResolvedValue({
      data: { name: 'x', total_amount: 0, category_ref: 'child-1' },
    });
    prisma.record.updateMany.mockResolvedValue({ count: 1 });

    await service.recomputeParentsForChildRecord('t-1', 'app-1', 'obj-category', 'child-1', {});

    // 两个父记录都被回写
    expect(prisma.record.updateMany).toHaveBeenCalledTimes(2);
    const arg = prisma.record.updateMany.mock.calls[0]?.[0] as {
      data: { data: Record<string, unknown> };
    };
    expect(arg.data.data['total_amount']).toBe(50);
  });

  it('应用内无 rollup 字段：不做任何查询回写', async () => {
    prisma.objectMeta.findMany.mockResolvedValue([
      { id: 'obj-x', fields: [{ id: 'f', apiName: 'name', type: 'text', config: {} }] },
    ]);
    await service.recomputeParentsForChildRecord('t-1', 'app-1', 'obj-y', 'child-1', {});
    expect(prisma.record.updateMany).not.toHaveBeenCalled();
  });
});
