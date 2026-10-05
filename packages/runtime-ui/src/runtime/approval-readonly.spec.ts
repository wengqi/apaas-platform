/**
 * 审批查看态变换纯函数单测（双视角评审 2026-10-04）。
 */

import { describe, expect, it } from 'vitest';
import { makeAmisPageReadonly } from './approval-readonly.js';

describe('makeAmisPageReadonly — 表单查看态', () => {
  it('form 置 static 并清除 submit/reset actions（含默认 actions 补空数组）', () => {
    const schema = {
      type: 'page',
      body: [
        {
          type: 'form',
          title: '礼品申请表单',
          api: { url: '/objects/x/records', method: 'post' },
          body: [{ type: 'input-text', name: 'gift_name', label: '礼品名称' }],
          actions: [
            { type: 'submit', label: '提交', level: 'primary' },
            { type: 'reset', label: '重置' },
          ],
        },
      ],
    };
    const readonly = makeAmisPageReadonly(schema) as typeof schema;
    const form = (readonly.body as Array<Record<string, unknown>>)[0]!;
    expect(form['static']).toBe(true);
    expect(form['actions']).toEqual([]);
    // 原 schema 不被修改（React Query 缓存共享）
    const originalForm = (schema.body as Array<Record<string, unknown>>)[0]!;
    expect(originalForm['static']).toBeUndefined();
    expect(originalForm['actions']).toHaveLength(2);
  });

  it('未配置 actions 的表单显式置空，阻止 amis 默认提交按钮', () => {
    const schema = {
      type: 'page',
      body: [{ type: 'form', body: [{ type: 'input-number', name: 'amount' }] }],
    };
    const readonly = makeAmisPageReadonly(schema) as typeof schema;
    const form = (readonly.body as Array<Record<string, unknown>>)[0]!;
    expect(form['static']).toBe(true);
    expect(form['actions']).toEqual([]);
  });

  it('crud 去掉 create feature，保留查询类 feature', () => {
    const schema = {
      type: 'page',
      body: [{ type: 'crud', features: ['create', 'filter', 'bulkDelete'] }],
    };
    const readonly = makeAmisPageReadonly(schema) as typeof schema;
    const crud = (readonly.body as Array<Record<string, unknown>>)[0]!;
    expect(crud['features']).toEqual(['filter', 'bulkDelete']);
  });

  it('递归 tabs/items 嵌套容器', () => {
    const schema = {
      type: 'page',
      body: [
        {
          type: 'tabs',
          items: [
            {
              body: [{ type: 'form', actions: [{ type: 'submit', label: '提交' }] }],
            },
          ],
        },
      ],
    };
    const readonly = makeAmisPageReadonly(schema) as typeof schema;
    const tab = (
      (readonly.body as Array<Record<string, unknown>>)[0]!['items'] as Array<
        Record<string, unknown>
      >
    )[0]!;
    const form = (tab['body'] as Array<Record<string, unknown>>)[0]!;
    expect(form['static']).toBe(true);
    expect(form['actions']).toEqual([]);
  });

  it('非对象输入原样返回', () => {
    expect(makeAmisPageReadonly(null)).toBeNull();
    expect(makeAmisPageReadonly('x')).toBe('x');
    expect(makeAmisPageReadonly([1, 2])).toEqual([1, 2]);
  });
});
