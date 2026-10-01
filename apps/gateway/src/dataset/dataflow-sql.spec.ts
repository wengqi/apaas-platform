/**
 * dataflow-sql 单测（G5）——join/filter/聚合三分支 SQL 结构、参数顺序、语义复刻。
 */

import { describe, it, expect } from 'vitest';
import { buildPipelineSql, DATAFLOW_MAX_SOURCE_ROWS } from './dataflow-sql.js';
import type { DataFlowConfig } from '@apaas/shared';

const BASE: DataFlowConfig = {
  sources: [{ objectId: 'obj-1', alias: 'orders' }],
  outputFields: [{ alias: 'title', label: '标题', source: 'title', type: 'string' }],
};

function build(config: DataFlowConfig, opts?: { limit?: number; includeTotal?: boolean }) {
  return buildPipelineSql(config, {
    tenantId: 't1',
    environmentId: 'prod',
    limit: opts?.limit ?? 100,
    includeTotal: opts?.includeTotal ?? false,
  });
}

describe('单源非聚合', () => {
  it('SQL 结构：源子查询（租户/环境/对象过滤 + LIMIT）+ 输出映射 + 结果 LIMIT', () => {
    const r = build(BASE);
    expect(r.text).toContain('FROM records r');
    expect(r.text).toContain('r.tenant_id = $1');
    expect(r.text).toContain('r.environment_id = $2');
    expect(r.text).toContain('r.object_id = $3');
    expect(r.text).toContain(`LIMIT ${DATAFLOW_MAX_SOURCE_ROWS}) AS q_orders`);
    expect(r.text).toContain(`jsonb_build_object('title', d.data->'title')`);
    expect(r.text.trim().endsWith('LIMIT 100')).toBe(true);
    expect(r.values).toEqual(['t1', 'prod', 'obj-1']);
    expect(r.filterPushedDown).toBe(true); // 无 filter 视为已下推
  });

  it('alias.field 输出映射 → joinedKey 优先 + bare 兜底', () => {
    const r = build({
      ...BASE,
      outputFields: [{ alias: 'name', label: '客户', source: 'customers.name', type: 'string' }],
    });
    expect(r.text).toContain(`COALESCE(d.data->'customers_name', d.data->'name')`);
  });

  it('preview includeTotal → COUNT(*) OVER() 窗口列', () => {
    const r = build(BASE, { includeTotal: true });
    expect(r.text).toContain('COUNT(*) OVER ()::int AS __total');
  });
});

describe('双源 join', () => {
  const JOINED: DataFlowConfig = {
    sources: [
      { objectId: 'obj-orders', alias: 'orders' },
      { objectId: 'obj-customers', alias: 'customers' },
    ],
    join: {
      leftAlias: 'orders',
      rightAlias: 'customers',
      type: 'left',
      leftField: 'customer_id',
      rightField: 'cid',
    },
    outputFields: [
      { alias: 'title', label: '标题', source: 'orders.title', type: 'string' },
      { alias: 'cname', label: '客户', source: 'customers.name', type: 'string' },
    ],
  };

  it('LEFT JOIN + COALESCE 键规范化（复刻 String(v ?? "")）+ 右表字段前缀聚合', () => {
    const r = build(JOINED);
    expect(r.text).toContain('LEFT JOIN');
    expect(r.text).toContain(`COALESCE(l.data->>'customer_id', '') = COALESCE(r.data->>'cid', '')`);
    expect(r.text).toContain(`jsonb_object_agg('customers_' || key, value)`);
    expect(r.text).toContain(`(l.data || COALESCE(rp.prefixed, '{}'::jsonb)) AS data`);
    expect(r.values).toEqual(['t1', 'prod', 'obj-orders', 'obj-customers']);
  });

  it('inner 类型 → INNER JOIN', () => {
    const r = build({ ...JOINED, join: { ...JOINED.join!, type: 'inner' } });
    expect(r.text).toContain('INNER JOIN');
  });

  it('join 引用不存在的别名 → BadRequest', () => {
    expect(() => build({ ...JOINED, join: { ...JOINED.join!, rightAlias: 'ghost' } })).toThrow(
      /不存在的数据源别名/,
    );
  });
});

describe('filter 下推', () => {
  it('可翻译 filter → WHERE 注入 + 参数续位', () => {
    const r = build({
      ...BASE,
      filter: { '==': [{ var: 'region' }, 'east'] },
    });
    expect(r.text).toContain(`WHERE data->>'region' = $4`);
    expect(r.values).toEqual(['t1', 'prod', 'obj-1', 'east']);
    expect(r.filterPushedDown).toBe(true);
  });

  it('不可翻译 filter → filterPushedDown=false（引擎兜底）', () => {
    const r = build({
      ...BASE,
      filter: { var: 'active' }, // 裸 var 真值
    });
    expect(r.filterPushedDown).toBe(false);
    // filtered CTE 不含 filter（源子查询自身的 WHERE 不受影响）
    expect(r.text).not.toMatch(/SELECT data FROM joined WHERE/);
  });
});

describe('聚合分支', () => {
  const AGG: DataFlowConfig = {
    sources: [{ objectId: 'obj-1', alias: 'orders' }],
    filter: { '==': [{ var: 'region' }, 'east'] },
    aggregation: {
      groupBy: ['region'],
      metrics: [
        { alias: 'total', label: '总额', field: 'amount', function: 'sum' },
        { alias: 'cnt', label: '笔数', field: 'amount', function: 'count' },
        { alias: 'avg_amt', label: '均值', field: 'amount', function: 'avg' },
      ],
    },
    outputFields: [
      { alias: 'region', label: '区域', source: 'region', type: 'string' },
      { alias: 'total', label: '总额', source: 'orders.amount', type: 'number' },
      { alias: 'cnt', label: '笔数', source: 'orders.amount', type: 'number' },
      { alias: 'avg_amt', label: '均值', source: 'orders.amount', type: 'number' },
    ],
  };

  it('GROUP BY + regex 守卫 cast 指标 + ROUND(2) + count=组行数', () => {
    const r = build(AGG);
    // filter 先于聚合（WHERE 在内层）
    expect(r.text.indexOf('WHERE')).toBeLessThan(r.text.indexOf('GROUP BY'));
    expect(r.text).toContain(`GROUP BY d.data->>'region'`);
    expect(r.text).toContain(`(array_agg(d.data->'region'))[1] AS __g_0`);
    expect(r.text).toMatch(/SUM\(\(CASE WHEN d\.data->>'amount' ~ '/);
    expect(r.text).toContain('ROUND(COALESCE(__s_0, 0), 2)');
    expect(r.text).toContain('ROUND(COALESCE(__s_2 / NULLIF(__c_2, 0), 0), 2)');
    expect(r.text).toContain(`'cnt', __cnt`);
    expect(r.text).toContain('COUNT(*) AS __cnt');
  });

  it('聚合 + 不可翻译 filter → filterPushedDown=false（引擎报错）', () => {
    const r = build({ ...AGG, filter: { var: 'x' } });
    expect(r.filterPushedDown).toBe(false);
  });
});

describe('配置校验', () => {
  it('缺数据源 / 别名重复 / 非法标识符（防注入）', () => {
    expect(() => build({ ...BASE, sources: [] })).toThrow(/缺少数据源/);
    expect(() =>
      build({
        ...BASE,
        sources: [
          { objectId: 'a', alias: 'dup' },
          { objectId: 'b', alias: 'dup' },
        ],
      }),
    ).toThrow(/别名重复/);
    expect(() => build({ ...BASE, sources: [{ objectId: 'a', alias: 'evil; DROP' }] })).toThrow(
      /不合法/,
    );
  });
});
