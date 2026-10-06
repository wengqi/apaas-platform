/**
 * 数据流校验器单测（G3 第四类，AI 主线第三轮）。
 */

import { describe, expect, it } from 'vitest';
import { validateDataset } from './dataset.validator.js';

/** 合法基准草稿：单源聚合（订单金额按区域汇总）。 */
function validDraft(): Record<string, unknown> {
  return {
    apiName: 'sales_by_region',
    name: '区域销售额',
    config: {
      sources: [{ objectId: '@ref:object:sales_order', alias: 'orders' }],
      aggregation: {
        groupBy: ['region'],
        metrics: [{ alias: 'total_amount', label: '金额合计', field: 'amount', function: 'sum' }],
      },
      outputFields: [
        { alias: 'region', label: '销售区域', source: 'orders.region', type: 'string' },
        { alias: 'total_amount', label: '金额合计', source: 'total_amount', type: 'number' },
      ],
    },
  };
}

describe('validateDataset — 合法输入', () => {
  it('单源聚合草稿通过（objectId 允许 @ref 令牌）', () => {
    expect(validateDataset(validDraft())).toEqual([]);
  });

  it('双源 join 草稿通过', () => {
    const draft = validDraft();
    const config = draft['config'] as Record<string, unknown>;
    delete config['aggregation'];
    config['sources'] = [
      { objectId: '@ref:object:borrow_request', alias: 'borrows' },
      { objectId: 'obj-asset-1', alias: 'assets' },
    ];
    config['join'] = {
      leftAlias: 'borrows',
      rightAlias: 'assets',
      type: 'left',
      leftField: 'asset_id',
      rightField: 'id',
    };
    config['outputFields'] = [
      { alias: 'borrow_no', label: '领用单号', source: 'borrows.borrow_no', type: 'string' },
      { alias: 'asset_name', label: '资产名称', source: 'assets.asset_name', type: 'string' },
    ];
    expect(validateDataset(draft)).toEqual([]);
  });
});

describe('validateDataset — 结构缺失', () => {
  it('非对象输入 → ROOT_INVALID', () => {
    const issues = validateDataset('x');
    expect(issues[0]).toMatchObject({ code: 'ROOT_INVALID', severity: 'error' });
  });

  it('缺 config / 缺 sources / 缺 outputFields → MISSING_REQUIRED', () => {
    for (const path of ['config', 'config.sources', 'config.outputFields']) {
      const draft = validDraft();
      if (path === 'config') {
        delete draft['config'];
      } else {
        const config = draft['config'] as Record<string, unknown>;
        delete config[path.replace('config.', '')];
      }
      expect(
        validateDataset(draft).some((i) => i.path === path && i.code === 'MISSING_REQUIRED'),
      ).toBe(true);
    }
  });

  it('apiName 非法 / 缺 name → error', () => {
    const draft = validDraft();
    draft['apiName'] = 'Bad-Name';
    draft['name'] = '';
    const issues = validateDataset(draft);
    expect(issues.some((i) => i.path === 'apiName')).toBe(true);
    expect(issues.some((i) => i.path === 'name')).toBe(true);
  });
});

describe('validateDataset — 引用一致性', () => {
  it('join 别名不在 sources 中 → REF_NOT_FOUND', () => {
    const draft = validDraft();
    const config = draft['config'] as Record<string, unknown>;
    delete config['aggregation'];
    config['sources'] = [
      { objectId: 'obj-a', alias: 'a' },
      { objectId: 'obj-b', alias: 'b' },
    ];
    config['join'] = {
      leftAlias: 'a',
      rightAlias: 'ghost',
      type: 'left',
      leftField: 'asset_id',
      rightField: 'id',
    };
    expect(
      validateDataset(draft).some(
        (i) => i.path === 'config.join/rightAlias' && i.code === 'REF_NOT_FOUND',
      ),
    ).toBe(true);
  });

  it('outputFields.source 前缀不在源别名或聚合别名中 → REF_NOT_FOUND', () => {
    const draft = validDraft();
    const config = draft['config'] as Record<string, unknown>;
    (config['outputFields'] as Array<Record<string, unknown>>)[1]!['source'] = 'customers.name';
    const issues = validateDataset(draft);
    expect(
      issues.some((i) => i.path === 'config.outputFields/1/source' && i.code === 'REF_NOT_FOUND'),
    ).toBe(true);
  });

  it('outputFields.source 直接引用聚合指标别名 → 合法', () => {
    const draft = validDraft();
    expect(validateDataset(draft)).toEqual([]);
  });
});

describe('validateDataset — 值域与护栏', () => {
  it('非法聚合函数 / 非法输出列类型 → INVALID_VALUE', () => {
    const draft = validDraft();
    const config = draft['config'] as Record<string, unknown>;
    (
      (config['aggregation'] as Record<string, unknown>)['metrics'] as Array<
        Record<string, unknown>
      >
    )[0]!['function'] = 'median';
    (config['outputFields'] as Array<Record<string, unknown>>)[1]!['type'] = 'boolean';
    const issues = validateDataset(draft);
    expect(issues.some((i) => i.path.endsWith('metrics/0/function'))).toBe(true);
    expect(issues.some((i) => i.path === 'config.outputFields/1/type')).toBe(true);
  });

  it('聚合字段点路径被拒并提示前缀键规则（实测 2026-10-05 踩坑）', () => {
    const draft = validDraft();
    const config = draft['config'] as Record<string, unknown>;
    config['sources'] = [
      { objectId: 'obj-po', alias: 'orders' },
      { objectId: 'obj-supplier', alias: 'suppliers' },
    ];
    config['join'] = {
      leftAlias: 'orders',
      rightAlias: 'suppliers',
      type: 'left',
      leftField: 'supplier_name',
      rightField: 'supplier_name',
    };
    config['aggregation'] = {
      groupBy: ['suppliers.supplier_name'],
      metrics: [
        { alias: 'total_amount', label: '金额合计', field: 'orders.amount', function: 'sum' },
      ],
    };
    const issues = validateDataset(draft);
    expect(
      issues.some((i) => i.path === 'config.aggregation.groupBy' && i.code === 'INVALID_VALUE'),
    ).toBe(true);
    expect(
      issues.some((i) => i.path.endsWith('metrics/0/field') && i.code === 'INVALID_VALUE'),
    ).toBe(true);
  });

  it('三源超过上限 → STRUCTURE_LIMIT', () => {
    const draft = validDraft();
    const config = draft['config'] as Record<string, unknown>;
    delete config['aggregation'];
    config['sources'] = [
      { objectId: 'a', alias: 'a' },
      { objectId: 'b', alias: 'b' },
      { objectId: 'c', alias: 'c' },
    ];
    (config['outputFields'] as Array<Record<string, unknown>>)[1]!['source'] = 'a.x';
    expect(
      validateDataset(draft).some(
        (i) => i.path === 'config.sources' && i.code === 'STRUCTURE_LIMIT',
      ),
    ).toBe(true);
  });
});
