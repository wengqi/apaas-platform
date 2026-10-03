/**
 * 页面模板生成纯函数单测（QA 交互评审 2026-10-03）。
 */

import { describe, expect, it } from 'vitest';
import type { TemplateField } from './page-template.js';
import { buildPageTemplate, supportsTemplate } from './page-template.js';

function makeField(
  overrides: Partial<TemplateField> & Pick<TemplateField, 'apiName' | 'type'>,
): TemplateField {
  return {
    id: `f_${overrides.apiName}`,
    objectId: 'obj1',
    apiName: overrides.apiName,
    label: overrides.label ?? overrides.apiName,
    type: overrides.type,
    config: overrides.config ?? {},
    required: overrides.required ?? false,
    unique: false,
    searchable: false,
    isSystem: overrides.isSystem ?? false,
    createdAt: '2026-10-03T00:00:00Z',
    updatedAt: '2026-10-03T00:00:00Z',
  } as TemplateField;
}

const FIELDS = [
  makeField({ apiName: 'room_name', label: '会议室名称', type: 'text', required: true }),
  makeField({ apiName: 'capacity', label: '容纳人数', type: 'number' }),
  makeField({
    apiName: 'status',
    label: '状态',
    type: 'single_select',
    config: { options: [{ id: 'AVAILABLE', label: '可用' }] } as never,
  }),
  makeField({ apiName: 'created_by', label: '创建人', type: 'user', isSystem: true }),
];

const OBJ = { id: 'obj1', apiName: 'meeting_room', label: '会议室', fields: FIELDS };

describe('supportsTemplate', () => {
  it('form_page/list_page 支持；detail/dashboard/undefined 不支持', () => {
    expect(supportsTemplate('form_page')).toBe(true);
    expect(supportsTemplate('list_page')).toBe(true);
    expect(supportsTemplate('detail_page')).toBe(false);
    expect(supportsTemplate('dashboard')).toBe(false);
    expect(supportsTemplate(undefined)).toBe(false);
  });
});

describe('buildPageTemplate — form_page', () => {
  it('按字段类型映射控件：必填/单选选项/系统字段排除', () => {
    const schema = buildPageTemplate('form_page', OBJ, '会议室预约');
    expect(schema['type']).toBe('page');
    expect(schema['data']).toEqual({ objectId: 'obj1' });

    const form = (schema['body'] as Array<Record<string, unknown>>)[0]!;
    expect(form['type']).toBe('form');
    expect(form['api']).toEqual({ url: '/objects/obj1/records', method: 'post' });

    const controls = form['body'] as Array<Record<string, unknown>>;
    // 系统字段 created_by 被排除
    expect(controls).toHaveLength(3);
    expect(controls[0]).toMatchObject({
      type: 'input-text',
      name: 'room_name',
      required: true,
    });
    expect(controls[1]).toMatchObject({ type: 'input-number', name: 'capacity' });
    expect(controls[2]).toMatchObject({
      type: 'select',
      name: 'status',
      options: [{ label: '可用', value: 'AVAILABLE' }],
    });

    // 提交按钮（G3 白名单回归：submit 必须合法）
    expect(form['actions']).toEqual([{ type: 'submit', label: '提交', level: 'primary' }]);
  });
});

describe('buildPageTemplate — list_page', () => {
  it('crud 列取业务字段前 6 个，带平台取数路径', () => {
    const schema = buildPageTemplate('list_page', OBJ, '会议室列表');
    const crud = (schema['body'] as Array<Record<string, unknown>>)[0]!;
    expect(crud['type']).toBe('crud');
    expect(crud['api']).toEqual({
      url: '/objects/obj1/records?page=$page&pageSize=$perPage',
      method: 'get',
    });
    const columns = crud['columns'] as Array<Record<string, unknown>>;
    expect(columns).toHaveLength(3);
    expect(columns[0]).toMatchObject({ name: 'room_name', label: '会议室名称', sortable: true });
  });
});

describe('buildPageTemplate — 不支持的类型 / 脏数据', () => {
  it('detail_page / dashboard 返回空白页 scaffold', () => {
    for (const t of ['detail_page', 'dashboard', undefined] as const) {
      const schema = buildPageTemplate(t, OBJ, 'X');
      expect(schema).toEqual({ type: 'page', title: 'X', body: [] });
    }
  });

  it('对象无字段 → 空模板不抛异常', () => {
    const schema = buildPageTemplate('form_page', { ...OBJ, fields: [] }, '空对象');
    expect((schema['body'] as Array<Record<string, unknown>>)[0]!['body']).toEqual([]);
    expect(buildPageTemplate('form_page', { ...OBJ, fields: undefined as never }, 'X')).toEqual({
      type: 'page',
      title: 'X',
      body: [],
    });
  });
});
