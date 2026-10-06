/**
 * 页面模板生成纯函数单测（QA 交互评审 2026-10-03）。
 */

import { describe, expect, it } from 'vitest';
import type { TemplateField } from './page-template.js';
import { buildPageTemplate, collectWritebackFields, supportsTemplate } from './page-template.js';

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
    config: {
      // value 显式给 → 保留；缺省 → 回退 label（A 旅程 H2：绝不回退选项 id/UUID）
      options: [
        { id: 'opt-1', label: '可用', value: 'AVAILABLE' },
        { id: 'opt-2', label: '停用' },
      ],
    } as never,
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
      options: [
        { label: '可用', value: 'AVAILABLE' },
        { label: '停用', value: '停用' },
      ],
    });

    // 提交按钮（G3 白名单回归：submit 必须合法）
    expect(form['actions']).toEqual([{ type: 'submit', label: '提交', level: 'primary' }]);
  });
});

describe('buildPageTemplate — list_page', () => {
  it('crud 列取业务字段前 5 个，带平台取数路径', () => {
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

  it('includeFields：回写状态列被裁后必入列并追加末位（QA D-004）', () => {
    const fields = [
      ...Array.from({ length: 7 }, (_, i) => ({
        apiName: `f${i + 1}`,
        label: `字段${i + 1}`,
        type: 'text',
      })),
      {
        apiName: 'status',
        label: '状态',
        type: 'single_select',
        config: { options: [{ id: 'o1', label: '已批准' }] },
      },
    ];
    const wide = { ...OBJ, fields: fields as never };

    // 默认：前 5 列，status（第 8 字段）被裁
    const plain = buildPageTemplate('list_page', wide, '台账');
    const plainCols = (plain['body'] as Array<Record<string, unknown>>)[0]!['columns'] as Array<
      Record<string, unknown>
    >;
    expect(plainCols.map((c) => c['name'])).toEqual(['f1', 'f2', 'f3', 'f4', 'f5']);

    // includeFields：status 必入列且追加末位，带 mapping 中文标签
    const withInclude = buildPageTemplate('list_page', wide, '台账', {
      includeFields: ['status'],
    });
    const cols = (withInclude['body'] as Array<Record<string, unknown>>)[0]!['columns'] as Array<
      Record<string, unknown>
    >;
    expect(cols.map((c) => c['name'])).toEqual(['f1', 'f2', 'f3', 'f4', 'f5', 'status']);
    expect(cols[5]).toMatchObject({ type: 'mapping', map: { 已批准: { label: '已批准' } } });
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

describe('collectWritebackFields — 流程回写字段提取', () => {
  it('提取 user_task 的 writeback.field，递归 blocks，忽略其他节点', () => {
    const schemas = [
      {
        nodes: [
          { type: 'start', data: {} },
          {
            type: 'user_task',
            data: { writeback: { field: 'status', approveValue: 'approved' } },
          },
          {
            type: 'parallel',
            blocks: [
              { type: 'user_task', data: { writeback: { field: 'approver_note' } } },
              { type: 'end', data: {} },
            ],
          },
        ],
      },
      undefined,
      null,
    ];
    expect(collectWritebackFields(schemas)).toEqual(['status', 'approver_note']);
  });

  it('无回写配置 / 空输入 → 空数组', () => {
    expect(collectWritebackFields([{ nodes: [{ type: 'user_task', data: {} }] }])).toEqual([]);
    expect(collectWritebackFields([])).toEqual([]);
    expect(collectWritebackFields([undefined])).toEqual([]);
  });
});

describe('buildPageTemplate — 回写字段过滤（双视角评审 2026-10-04）', () => {
  it('form_page 排除 excludeFields（申请人不可自选审批状态）', () => {
    const schema = buildPageTemplate('form_page', OBJ, '会议室预约', {
      excludeFields: ['status'],
    });
    const formBody = (schema['body'] as Array<Record<string, unknown>>)[0]!['body'] as Array<
      Record<string, unknown>
    >;
    expect(formBody.map((c) => c['name'])).toEqual(['room_name', 'capacity']);
  });

  it('list_page 不过滤（台账要展示审批状态列）', () => {
    const schema = buildPageTemplate('list_page', OBJ, '会议室台账', {
      excludeFields: ['status'],
    });
    const crud = (schema['body'] as Array<Record<string, unknown>>)[0]!;
    const columns = crud['columns'] as Array<Record<string, unknown>>;
    expect(columns.map((c) => c['name'])).toContain('status');
  });

  it('全部字段被排除 → 表单控件为空但不抛异常', () => {
    const schema = buildPageTemplate('form_page', OBJ, 'X', {
      excludeFields: ['room_name', 'capacity', 'status'],
    });
    const formBody = (schema['body'] as Array<Record<string, unknown>>)[0]!['body'];
    expect(formBody).toEqual([]);
  });
});
