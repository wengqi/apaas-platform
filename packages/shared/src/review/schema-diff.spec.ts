/**
 * 结构化 diff 纯函数单测（R1.2 diff 快审内核）。
 *
 * 覆盖：对象字段按 apiName 配对、流程节点/边、amis 页面组件树、
 * 无身份键数组退化比较、全新资源全增、键序无关相等。
 */

import { describe, it, expect } from 'vitest';
import {
  diffObjectResource,
  diffPageResource,
  diffProcessResource,
  diffResource,
  stableStringifyEqual,
} from './schema-diff.js';
import type { ObjectResourceSnapshot } from './types.js';

describe('diffObjectResource（字段按 apiName 配对）', () => {
  const baseline: ObjectResourceSnapshot = {
    apiName: 'contract',
    name: '采购合同',
    fields: [
      { apiName: 'contract_name', label: '合同名称', type: 'text' },
      { apiName: 'amount', label: '金额', type: 'currency' },
    ],
  };

  it('新增/修改/删除字段各产出一条', () => {
    const diff = diffObjectResource(baseline, {
      ...baseline,
      fields: [
        { apiName: 'contract_name', label: '合同名称（改）', type: 'text' },
        { apiName: 'amount', label: '金额', type: 'currency' },
        { apiName: 'status', label: '状态', type: 'single_select' },
      ],
    });
    expect(diff.changeCount).toBe(2);
    const ops = diff.items.map((i) => `${i.op}:${i.path}`);
    expect(ops).toContain('ADDED:fields.status');
    // 字段级修改递归到具体子键（label/type 分开可读）
    expect(ops).toContain('MODIFIED:fields.contract_name.label');
    expect(diff.items.find((i) => i.path === 'fields.contract_name.label')?.detail).toContain(
      '合同名称（改）',
    );
  });

  it('删除字段', () => {
    const diff = diffObjectResource(baseline, {
      ...baseline,
      fields: [{ apiName: 'contract_name', label: '合同名称', type: 'text' }],
    });
    expect(diff.changeCount).toBe(1);
    expect(diff.items[0]!.op).toBe('REMOVED');
    expect(diff.items[0]!.path).toBe('fields.amount');
  });

  it('无差异 → changeCount 0', () => {
    const diff = diffObjectResource(baseline, JSON.parse(JSON.stringify(baseline)));
    expect(diff.changeCount).toBe(0);
    expect(diff.summary).toContain('新增 0');
  });
});

describe('diffProcessResource（节点按 id 配对）', () => {
  const baseline = {
    apiName: 'flow',
    name: '审批流',
    workflowSchema: {
      nodes: [
        { id: 's', type: 'start', data: {} },
        { id: 'ut1', type: 'user_task', data: { taskName: '一审' } },
        { id: 'e', type: 'end', data: {} },
      ],
      edges: [{ sourceNodeID: 's', targetNodeID: 'ut1' }],
    },
    triggerType: 'MANUAL',
  };

  it('节点新增与属性修改', () => {
    const diff = diffProcessResource(baseline, {
      ...baseline,
      workflowSchema: {
        nodes: [
          { id: 's', type: 'start', data: {} },
          { id: 'ut1', type: 'user_task', data: { taskName: '一审（改）' } },
          { id: 'ut2', type: 'user_task', data: { taskName: '二审' } },
          { id: 'e', type: 'end', data: {} },
        ],
        edges: [{ sourceNodeID: 's', targetNodeID: 'ut1' }],
      },
    });
    const paths = diff.items.map((i) => i.path);
    expect(paths).toContain('workflowSchema.nodes.ut2');
    expect(paths).toContain('workflowSchema.nodes.ut1.data.taskName');
  });

  it('触发类型变更', () => {
    const diff = diffProcessResource(baseline, { ...baseline, triggerType: 'SCHEDULED' });
    expect(diff.items.some((i) => i.path.includes('triggerType'))).toBe(true);
  });
});

describe('diffPageResource（组件树）', () => {
  it('无 id 的元素按相对顺序配对，尾部新增可识别', () => {
    const baseline = {
      apiName: 'page',
      name: '页面',
      type: 'custom',
      objectId: null,
      schema: { type: 'page', body: ['a', 'b'] },
    };
    const diff = diffPageResource(baseline, {
      ...baseline,
      schema: { type: 'page', body: ['a', 'b', 'c'] },
    });
    expect(diff.changeCount).toBe(1);
    expect(diff.items[0]!.op).toBe('ADDED');
    expect(diff.items[0]!.path).toContain('body[2]');
  });

  it('带 id 的组件按 id 配对递归', () => {
    const baseline = {
      apiName: 'page',
      name: '页面',
      type: 'custom',
      objectId: null,
      schema: {
        type: 'page',
        body: [{ type: 'form', id: 'f1', title: '表单' }],
      },
    };
    const diff = diffPageResource(baseline, {
      ...baseline,
      schema: {
        type: 'page',
        body: [
          { type: 'form', id: 'f1', title: '表单（改）' },
          { type: 'chart', id: 'c1' },
        ],
      },
    });
    const paths = diff.items.map((i) => i.path);
    expect(paths).toContain('schema.body.c1');
    expect(paths).toContain('schema.body.f1.title');
  });
});

describe('diffResource（通用）', () => {
  it('baseline 为 null → 全部为新增', () => {
    const diff = diffResource('OBJECT', null, {
      apiName: 'new_obj',
      name: '新对象',
      fields: [{ apiName: 'a', label: 'A', type: 'text' }],
    });
    expect(diff.changeCount).toBeGreaterThan(0);
    expect(diff.items.every((i) => i.op === 'ADDED')).toBe(true);
  });

  it('超上限只截断明细不截断计数', () => {
    const fields = Array.from({ length: 260 }, (_, i) => ({
      apiName: `f${i}`,
      label: `F${i}`,
      type: 'text',
    }));
    const diff = diffResource('OBJECT', null, { apiName: 'big', name: '大对象', fields });
    expect(diff.changeCount).toBeGreaterThan(260);
    expect(diff.items.length).toBeLessThanOrEqual(200);
  });
});

describe('stableStringifyEqual', () => {
  it('键序无关相等', () => {
    expect(stableStringifyEqual({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(
      true,
    );
  });
  it('值不等 / 数组长度不等 / 类型不等', () => {
    expect(stableStringifyEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(stableStringifyEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(stableStringifyEqual({ a: 1 }, [1])).toBe(false);
    expect(stableStringifyEqual(null, {})).toBe(false);
    expect(stableStringifyEqual('x', 'x')).toBe(true);
  });
});
