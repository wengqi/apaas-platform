/**
 * 表单生成器纯函数单元测试 — 字段映射 / 行初始化 / 生成结果。
 *
 * 对齐飞书 aPaaS 表单生成器语义：
 * - 字段类型 → 默认输入组件映射
 * - 业务字段默认勾选、系统字段默认不勾选且必填锁定
 * - 生成字段节点带 vm.record 绑定 + onSubmit=create_record + record 变量
 */

import { describe, expect, it } from 'vitest';
import { componentOptionsFor, defaultComponentFor } from './mapping.js';
import {
  buildFormGeneration,
  buildSubmitButtonNode,
  initRowsFromFields,
  type FormGenRow,
} from './generate.js';
import type { Field, FieldConfig } from '../../../api/objects.js';

/** 构造测试字段。 */
function makeField(partial: Partial<Field> & Pick<Field, 'id' | 'apiName' | 'type'>): Field {
  return {
    objectId: 'obj_1',
    label: partial.apiName ?? partial.id,
    config: (partial.config ?? {}) as FieldConfig,
    required: false,
    unique: false,
    searchable: false,
    isSystem: false,
    createdAt: '',
    updatedAt: '',
    ...partial,
  } as Field;
}

describe('表单生成器 — 字段类型映射', () => {
  it('文本字段默认映射为文本输入', () => {
    expect(defaultComponentFor(makeField({ id: 'f1', apiName: 'name', type: 'text' }))).toBe(
      'text_input',
    );
  });

  it('单选字段默认下拉单选，可替换为单选框', () => {
    const field = makeField({ id: 'f2', apiName: 'status', type: 'single_select' });
    expect(defaultComponentFor(field)).toBe('select');
    const options = componentOptionsFor(field);
    expect(options.map((o) => o.value)).toEqual(['select', 'radio']);
  });

  it('自动编号/公式等只读字段映射为文本输入', () => {
    expect(defaultComponentFor(makeField({ id: 'f3', apiName: 'no', type: 'auto_number' }))).toBe(
      'text_input',
    );
  });

  it('未知映射兜底为文本输入', () => {
    expect(defaultComponentFor(makeField({ id: 'f4', apiName: 'x', type: 'rollup' }))).toBe(
      'text_input',
    );
  });
});

describe('表单生成器 — 行初始化', () => {
  it('业务字段默认勾选，系统字段默认不勾选', () => {
    const rows = initRowsFromFields([
      makeField({ id: 'sys1', apiName: '_id', type: 'text', isSystem: true }),
      makeField({ id: 'biz1', apiName: 'title', type: 'text' }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.selected).toBe(false);
    expect(rows[1]?.selected).toBe(true);
  });

  it('行标题默认取字段 label，必填继承字段 required', () => {
    const rows = initRowsFromFields([
      makeField({ id: 'b1', apiName: 'title', type: 'text', label: '标题', required: true }),
    ]);
    expect(rows[0]?.title).toBe('标题');
    expect(rows[0]?.required).toBe(true);
  });
});

describe('表单生成器 — 生成结果', () => {
  const fields = [
    makeField({ id: 'f1', apiName: 'title', type: 'text', label: '标题' }),
    makeField({
      id: 'f2',
      apiName: 'status',
      type: 'single_select',
      label: '状态',
      required: true,
      config: { type: 'single_select', options: [{ id: 'o1', label: '启用', value: 'on' }] },
    }),
    makeField({ id: 'f3', apiName: '_createdBy', type: 'user', isSystem: true }),
  ];

  it('只生成勾选行，且顺序与行顺序一致', () => {
    const rows: FormGenRow[] = [
      {
        fieldId: 'f2',
        selected: true,
        apiName: 'status',
        title: '状态',
        component: 'select',
        required: true,
      },
      {
        fieldId: 'f1',
        selected: true,
        apiName: 'title',
        title: '标题',
        component: 'text_input',
        required: false,
      },
      {
        fieldId: 'f3',
        selected: false,
        apiName: '_createdBy',
        title: '创建人',
        component: 'user_picker',
        required: false,
      },
    ];
    const { fieldNodes } = buildFormGeneration(fields, rows, 'obj_1');
    expect(fieldNodes).toHaveLength(2);
    expect(fieldNodes[0]?.props.apiName).toBe('status');
    expect(fieldNodes[1]?.props.apiName).toBe('title');
  });

  it('字段节点绑定 vm.record.{apiName}，标题取行标题，必填取行配置', () => {
    const rows = initRowsFromFields(fields);
    const { fieldNodes } = buildFormGeneration(fields, rows, 'obj_1');
    const titleNode = fieldNodes.find((n) => n.props.apiName === 'title');
    expect(titleNode?.props.value).toEqual({ __bind: 'vm.record.title' });
    expect(titleNode?.props.label).toBe('标题');
    expect(titleNode?.props.required).toBe(false);

    const statusNode = fieldNodes.find((n) => n.props.apiName === 'status');
    expect(statusNode?.props.required).toBe(true);
    expect(statusNode?.props.options).toEqual([{ label: '启用', value: 'on' }]);
  });

  it('onSubmit 接线 create_record 且数据源为 vm.record', () => {
    const rows = initRowsFromFields(fields);
    const { onSubmitAction, recordVariable } = buildFormGeneration(fields, rows, 'obj_1');
    expect(onSubmitAction).toEqual({
      __action: {
        type: 'create_record',
        params: { objectId: 'obj_1', data: { __bind: 'vm.record' } },
      },
    });
    expect(recordVariable.type).toBe('record');
    expect(recordVariable.datasource?.objectId).toBe('obj_1');
    expect(recordVariable.datasource?.autoQuery).toBe(false);
  });

  it('提交按钮为 htmlType=submit 的主按钮', () => {
    const btn = buildSubmitButtonNode();
    expect(btn.type).toBe('button');
    expect(btn.props.htmlType).toBe('submit');
    expect(btn.props.type).toBe('primary');
  });

  it('日期时间字段生成 showTime 与格式', () => {
    const dtFields = [makeField({ id: 'd1', apiName: 'plan_at', type: 'date_time' })];
    const rows = initRowsFromFields(dtFields);
    const { fieldNodes } = buildFormGeneration(dtFields, rows, 'obj_1');
    expect(fieldNodes[0]?.props.showTime).toBe(true);
    expect(fieldNodes[0]?.props.format).toBe('YYYY-MM-DD HH:mm:ss');
  });
});
