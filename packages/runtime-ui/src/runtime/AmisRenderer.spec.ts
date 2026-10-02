/**
 * AmisRenderer / ApprovalPageRenderer 纯函数单测。
 * 渲染器本体依赖 amis 运行时（MST/浏览器 DOM），单测覆盖可纯函数化的部分：
 * 响应适配（adaptApiResponse）与页面含表单探测（pageContainsForm）。
 */

import { describe, expect, it } from 'vitest';
import { adaptApiResponse } from './AmisRenderer.js';
import { pageContainsForm } from './ApprovalPageRenderer.js';
import { mergeSchemaData, normalizeListResponse } from './AmisRenderer.js';

describe('normalizeListResponse（R1.7 fetcher 列表规范化）', () => {
  it('records 响应：total→count + items 摊平 data JSONB', () => {
    const r = normalizeListResponse({
      items: [{ id: 'r1', data: { name: '合同A', amount: 100 } }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    const rows = (r as { items: Array<Record<string, unknown>> }).items;
    expect(rows[0]).toEqual({ id: 'r1', name: '合同A', amount: 100 });
    expect((r as { count: number }).count).toBe(1);
  });

  it('非列表形状（对象/数组）原样返回', () => {
    expect(normalizeListResponse({ foo: 1 })).toEqual({ foo: 1 });
    const arr = [{ a: 1 }];
    expect(normalizeListResponse(arr)).toBe(arr);
  });
});

describe('adaptApiResponse — 平台响应 → amis fetcherResult', () => {
  it('平台成功响应 { ok: true, data } → status 0 + data 透传', () => {
    const r = adaptApiResponse({ data: { ok: true, data: { id: '1', name: 'x' } } });
    expect(r).toEqual({ ok: true, status: 0, data: { id: '1', name: 'x' } });
  });

  it('平台错误响应 { ok: false, error } → status=错误码 + msg', () => {
    const r = adaptApiResponse({
      data: { ok: false, error: { code: 404, message: '页面不存在' } },
    });
    expect(r.status).toBe(404);
    expect(r.msg).toBe('页面不存在');
  });

  it('ok:false 无 error.code → status 兜底 1', () => {
    const r = adaptApiResponse({ data: { ok: false, error: { code: 0, message: 'x' } } });
    expect(r.status).toBe(0);
    expect(r.msg).toBe('x');
  });

  it('非平台包裹响应（如第三方 API）→ 按 HTTP status 适配', () => {
    expect(adaptApiResponse({ status: 200, data: {} })).toEqual({
      ok: true,
      status: 0,
      msg: undefined,
      data: {},
    });
    expect(adaptApiResponse({ status: 500 }).status).toBe(500);
  });
});

describe('mergeSchemaData — 运行时数据域双通道注入（盲审回归网）', () => {
  it('schema 自带 data 作为默认值垫底，运行时数据覆盖同名键', () => {
    const merged = mergeSchemaData(
      { type: 'page', title: 'x', data: { contract_name: '默认合同', sign_date: '2026-01-01' } },
      { contract_name: '真实合同', amount: 100 },
    );
    expect(merged['data']).toEqual({
      contract_name: '真实合同',
      sign_date: '2026-01-01',
      amount: 100,
    });
    // 其余 schema 字段原样保留
    expect(merged['type']).toBe('page');
    expect(merged['title']).toBe('x');
  });

  it('schema 无 data → 运行时数据成为 page 域', () => {
    const merged = mergeSchemaData({ type: 'page', body: [] }, { taskId: 't1' });
    expect(merged['data']).toEqual({ taskId: 't1' });
  });

  it('空数据域 → 原样返回（不额外包一层 data）', () => {
    const schema = { type: 'page', data: { a: 1 } };
    expect(mergeSchemaData(schema)).toBe(schema);
    expect(mergeSchemaData(schema, {})).toBe(schema);
  });

  it('schema.data 非对象（字符串/数组）→ 整体替换为运行时数据', () => {
    expect(mergeSchemaData({ type: 'page', data: 'legacy' }, { a: 1 })['data']).toEqual({ a: 1 });
    expect(mergeSchemaData({ type: 'page', data: [1, 2] }, { a: 1 })['data']).toEqual({ a: 1 });
  });

  it('不修改入参 schema（纯函数）', () => {
    const schema: Record<string, unknown> = { type: 'page', data: { a: 1 } };
    const data = { b: 2 };
    mergeSchemaData(schema, data);
    expect(schema['data']).toEqual({ a: 1 });
    expect(data).toEqual({ b: 2 });
  });
});

describe('pageContainsForm — 审批页面是否含表单', () => {
  it('根组件即 form → true', () => {
    expect(pageContainsForm({ type: 'form', body: [] })).toBe(true);
  });

  it('page.body 内嵌 form → true', () => {
    expect(
      pageContainsForm({
        type: 'page',
        body: [
          { type: 'tpl', tpl: 'x' },
          { type: 'form', body: [{ type: 'input-text' }] },
        ],
      }),
    ).toBe(true);
  });

  it('纯展示页面 → false', () => {
    expect(pageContainsForm({ type: 'page', body: [{ type: 'tpl' }, { type: 'chart' }] })).toBe(
      false,
    );
  });

  it('空/非法 schema → false', () => {
    expect(pageContainsForm(null)).toBe(false);
    expect(pageContainsForm({})).toBe(false);
    expect(pageContainsForm({ type: 'page' })).toBe(false);
  });
});
