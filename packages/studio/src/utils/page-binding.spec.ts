import { describe, expect, it } from 'vitest';
import {
  collectBoundObjectIds,
  collectFieldBindingIssues,
  extractObjectIdFromApiUrl,
  isBindableControlType,
} from './page-binding.js';

const FIELDS_A = new Set(['name', 'description', 'quantity']);
const FIELDS_B = new Set(['title', 'amount']);
const FIELDS_BY_OBJECT = new Map([
  ['obj_a', FIELDS_A],
  ['obj_b', FIELDS_B],
]);

describe('isBindableControlType', () => {
  it('表单控件类型为绑定候选', () => {
    expect(isBindableControlType('input-text')).toBe(true);
    expect(isBindableControlType('select')).toBe(true);
    expect(isBindableControlType('static')).toBe(true);
    expect(isBindableControlType('input-table')).toBe(true);
  });

  it('结构/动作容器与空/非字符串类型不是绑定候选', () => {
    expect(isBindableControlType('grid')).toBe(false);
    expect(isBindableControlType('button')).toBe(false);
    expect(isBindableControlType('dialog')).toBe(false);
    expect(isBindableControlType('')).toBe(false);
    expect(isBindableControlType(undefined)).toBe(false);
    expect(isBindableControlType(123)).toBe(false);
  });
});

describe('extractObjectIdFromApiUrl', () => {
  it('解析 string 与 {url} 两态的平台约定地址', () => {
    expect(extractObjectIdFromApiUrl('/objects/obj_a/records')).toBe('obj_a');
    expect(extractObjectIdFromApiUrl({ url: '/objects/obj_b/records', method: 'post' })).toBe(
      'obj_b',
    );
  });

  it('非对象地址/形态不符返回 null', () => {
    expect(extractObjectIdFromApiUrl('/api/other')).toBeNull();
    expect(extractObjectIdFromApiUrl(undefined)).toBeNull();
    expect(extractObjectIdFromApiUrl({ method: 'post' })).toBeNull();
  });
});

describe('collectBoundObjectIds', () => {
  it('逐 form 解析自身 api.url，页面级 objectId 兜底并去重', () => {
    const schema = {
      type: 'page',
      data: { objectId: 'obj_page' },
      body: [
        { type: 'form', api: { url: '/objects/obj_a/records' }, body: [] },
        { type: 'form', api: { url: '/objects/obj_b/records' }, body: [] },
        { type: 'form', body: [] },
      ],
    };
    expect(collectBoundObjectIds(schema).sort()).toEqual(['obj_a', 'obj_b', 'obj_page']);
  });

  it('容器内嵌套 form 也被检出；无任何绑定返回空', () => {
    expect(
      collectBoundObjectIds({
        type: 'page',
        body: [{ type: 'grid', columns: [{ type: 'form', api: '/objects/obj_c/records' }] }],
      }),
    ).toEqual(['obj_c']);
    expect(collectBoundObjectIds({ type: 'page', body: [] })).toEqual([]);
  });
});

describe('collectFieldBindingIssues（多表）', () => {
  it('各 form 控件命中各自对象字段 → 无 issue', () => {
    const schema = {
      type: 'page',
      body: [
        {
          type: 'form',
          api: { url: '/objects/obj_a/records' },
          body: [{ type: 'input-text', name: 'name', label: '名称' }],
        },
        {
          type: 'form',
          api: { url: '/objects/obj_b/records' },
          body: [{ type: 'input-text', name: 'amount', label: '金额' }],
        },
      ],
    };
    expect(collectFieldBindingIssues(schema, FIELDS_BY_OBJECT)).toEqual([]);
  });

  it('错配按所属对象判定：A 表合法键在 B 表 form 中应报', () => {
    const schema = {
      type: 'page',
      body: [
        {
          type: 'form',
          api: { url: '/objects/obj_b/records' },
          body: [{ type: 'input-text', name: 'name', label: '跨表错绑' }],
        },
      ],
    };
    const issues = collectFieldBindingIssues(schema, FIELDS_BY_OBJECT);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ name: 'name', objectId: 'obj_b', path: 'body[0].body[0]' });
  });

  it('页面级 data.objectId 兜底无自身 api 的 form', () => {
    const schema = {
      type: 'page',
      data: { objectId: 'obj_a' },
      body: [{ type: 'form', body: [{ type: 'input-number', name: 'qtyy', label: '数量' }] }],
    };
    const issues = collectFieldBindingIssues(schema, FIELDS_BY_OBJECT);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.objectId).toBe('obj_a');
  });

  it('无法解析对象的 form 跳过判定（不误报）', () => {
    const schema = {
      type: 'page',
      body: [{ type: 'form', body: [{ type: 'input-text', name: 'whatever' }] }],
    };
    expect(collectFieldBindingIssues(schema, FIELDS_BY_OBJECT)).toEqual([]);
  });

  it('form 外节点、结构容器、actions 按钮不比对；dialog 内 form 检出', () => {
    const schema = {
      type: 'page',
      body: [
        { type: 'crud', name: 'not_checked' },
        {
          type: 'button',
          dialog: {
            type: 'dialog',
            body: [
              {
                type: 'form',
                api: '/objects/obj_a/records',
                body: [{ type: 'input-text', name: 'oops' }],
              },
            ],
          },
        },
        {
          type: 'form',
          api: '/objects/obj_a/records',
          name: 'form_key',
          actions: [{ type: 'button', name: 'btn_key' }],
          body: [
            { type: 'grid', name: 'grid_key', columns: [{ type: 'input-text', name: 'name' }] },
          ],
        },
      ],
    };
    const issues = collectFieldBindingIssues(schema, FIELDS_BY_OBJECT);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.name).toBe('oops');
  });

  it('label 缺失回退 title；空/非 string name 跳过', () => {
    const schema = {
      type: 'page',
      data: { objectId: 'obj_a' },
      body: [
        {
          type: 'form',
          body: [
            { type: 'input-text', name: 'nope', title: '标题回退' },
            { type: 'input-text', label: '无 name' },
            { type: 'input-text', name: '' },
            { type: 'select', name: 'name' },
          ],
        },
      ],
    };
    const issues = collectFieldBindingIssues(schema, FIELDS_BY_OBJECT);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.label).toBe('标题回退');
  });
});
