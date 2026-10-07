import { describe, expect, it } from 'vitest';
import {
  CONTROL_FIELD_COMPAT,
  isControlFieldCompatible,
  partitionFieldsByCompat,
} from './field-control-compat.js';
import { fieldToFormControl } from './page-template.js';
import type { TemplateField } from './page-template.js';

/** 生成映射的代表性字段（覆盖 fieldToFormControl 全部分支）。 */
const GEN_FIELDS: Array<TemplateField & { _control: string; _multiple?: boolean }> = [
  { apiName: 'name', label: '名称', type: 'text', _control: 'input-text' },
  { apiName: 'd', label: '描述', type: 'long_text', _control: 'textarea' },
  { apiName: 'r', label: '富文本', type: 'rich_text', _control: 'input-text' },
  { apiName: 'q', label: '数量', type: 'number', _control: 'input-number' },
  { apiName: 'p', label: '折扣', type: 'percent', _control: 'input-number' },
  { apiName: 'c', label: '单价', type: 'currency', _control: 'input-number' },
  { apiName: 's', label: '状态', type: 'single_select', config: {}, _control: 'select' },
  {
    apiName: 'm',
    label: '标签',
    type: 'multi_select',
    config: {},
    _control: 'select',
    _multiple: true,
  },
  { apiName: 'dt', label: '日期', type: 'date', _control: 'input-date' },
  { apiName: 'ts', label: '时间', type: 'date_time', _control: 'input-datetime' },
  { apiName: 'no', label: '编号', type: 'auto_number', _control: 'static' },
  { apiName: 'ck', label: '启用', type: 'checkbox', _control: 'switch' },
  { apiName: 'at', label: '附件', type: 'attachment', _control: 'input-file' },
  { apiName: 'u', label: '负责人', type: 'user', _control: 'input-text' },
  { apiName: 'lk', label: '关联', type: 'lookup', _control: 'input-text' },
  { apiName: 'sf', label: '子表', type: 'sub_form', _control: 'input-text' },
  { apiName: 'fx', label: '公式', type: 'formula', _control: 'input-text' },
  { apiName: 'ru', label: '汇总', type: 'rollup', _control: 'input-text' },
];

describe('镜像一致性：生成映射 fieldToFormControl ↔ 兼容矩阵反演', () => {
  for (const f of GEN_FIELDS) {
    it(`${f.type} → ${f._control} 生成控件必须在兼容矩阵中判为兼容`, () => {
      const control = fieldToFormControl(f);
      expect(control['type']).toBe(f._control);
      const verdict = isControlFieldCompatible(
        control['type'],
        control['multiple'] === true,
        f.type,
      );
      expect(verdict).toBe('compatible');
    });
  }

  it('生成映射覆盖的控件类型都进了矩阵', () => {
    const usedControls = new Set(GEN_FIELDS.map((f) => f._control));
    for (const c of usedControls) {
      expect(CONTROL_FIELD_COMPAT[c]).toBeDefined();
    }
  });
});

describe('isControlFieldCompatible', () => {
  it('select 按 multiple 互斥细分', () => {
    expect(isControlFieldCompatible('select', false, 'single_select')).toBe('compatible');
    expect(isControlFieldCompatible('select', false, 'multi_select')).toBe('incompatible');
    expect(isControlFieldCompatible('select', true, 'multi_select')).toBe('compatible');
    expect(isControlFieldCompatible('select', true, 'single_select')).toBe('incompatible');
    expect(isControlFieldCompatible('select', false, 'date')).toBe('incompatible');
  });

  it('只读计算字段：input-text 兼容但绑 static 更佳，均不误报为不兼容', () => {
    expect(isControlFieldCompatible('input-text', false, 'formula')).toBe('compatible');
    expect(isControlFieldCompatible('static', false, 'auto_number')).toBe('compatible');
    expect(isControlFieldCompatible('static', false, 'text')).toBe('incompatible');
  });

  it('矩阵外控件 = unknown（不过滤不告警）', () => {
    expect(isControlFieldCompatible('input-tree', false, 'text')).toBe('unknown');
    expect(isControlFieldCompatible('chart', false, 'number')).toBe('unknown');
    expect(isControlFieldCompatible(undefined, false, 'text')).toBe('unknown');
    expect(isControlFieldCompatible('input-text', false, undefined)).toBe('unknown');
  });

  it('典型错绑判不兼容', () => {
    expect(isControlFieldCompatible('input-number', false, 'date')).toBe('incompatible');
    expect(isControlFieldCompatible('input-date', false, 'number')).toBe('incompatible');
    expect(isControlFieldCompatible('switch', false, 'text')).toBe('incompatible');
    expect(isControlFieldCompatible('input-file', false, 'number')).toBe('incompatible');
  });
});

describe('partitionFieldsByCompat', () => {
  const fields = [
    { apiName: 'name', label: '名称', type: 'text' },
    { apiName: 'deadline', label: '截止日期', type: 'date' },
    { apiName: 'status', label: '状态', type: 'single_select' },
  ];

  it('数字控件：text/status 进不兼容组，date 也进不兼容组', () => {
    const { compatible, incompatible } = partitionFieldsByCompat('input-number', false, fields);
    expect(compatible).toEqual([]);
    expect(incompatible.map((f) => f.apiName)).toEqual(['name', 'deadline', 'status']);
  });

  it('文本控件：text 兼容在前，date/single_select 进不兼容组', () => {
    const { compatible, incompatible } = partitionFieldsByCompat('input-text', false, fields);
    expect(compatible.map((f) => f.apiName)).toEqual(['name']);
    expect(incompatible.map((f) => f.apiName)).toEqual(['deadline', 'status']);
  });

  it('unknown 控件全量入兼容组（不过滤）', () => {
    const { compatible, incompatible } = partitionFieldsByCompat('input-tree', false, fields);
    expect(compatible).toHaveLength(3);
    expect(incompatible).toEqual([]);
  });
});
