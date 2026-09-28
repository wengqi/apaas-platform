/**
 * 表单生成器 — 字段类型 → 输入组件映射（纯函数）。
 *
 * 对齐飞书 aPaaS 表单生成器：每个对象字段映射到默认输入组件，
 * 并提供可替换的候选组件列表（生成器表格内「输入组件」列可改）。
 */

import type { ComponentType } from '../../../api/pages.js';
import type { Field } from '../../../api/objects.js';
import type { FieldType } from '../../../constants/fieldTypes.js';

/** 每个字段类型允许的输入组件（第一个为默认映射）。 */
const FIELD_COMPONENT_CANDIDATES: Record<FieldType, ComponentType[]> = {
  text: ['text_input'],
  long_text: ['textarea', 'text_input'],
  rich_text: ['textarea'],
  number: ['number_input', 'text_input'],
  currency: ['number_input'],
  percent: ['number_input'],
  auto_number: ['text_input'],
  single_select: ['select', 'radio'],
  multi_select: ['multi_select', 'checkbox'],
  date: ['date_picker'],
  date_time: ['date_picker'],
  checkbox: ['switch', 'checkbox'],
  attachment: ['attachment_upload'],
  user: ['user_picker'],
  lookup: ['lookup_picker'],
  sub_form: ['sub_form_table'],
  formula: ['text_input'],
  rollup: ['text_input'],
};

/** 候选组件的展示名（与 COMPONENT_META.label 一致的简表，避免引入图标依赖）。 */
const COMPONENT_LABELS: Record<string, string> = {
  text_input: '文本输入',
  textarea: '多行文本',
  number_input: '数字输入',
  select: '下拉单选',
  multi_select: '下拉多选',
  date_picker: '日期选择',
  radio: '单选框',
  checkbox: '复选框',
  switch: '开关',
  lookup_picker: '关联选择',
  sub_form_table: '明细输入',
  attachment_upload: '附件上传',
  user_picker: '人员选择',
};

/** 字段类型的默认输入组件。 */
export function defaultComponentFor(field: Field): ComponentType {
  const candidates = FIELD_COMPONENT_CANDIDATES[field.type] ?? ['text_input'];
  return candidates[0] ?? 'text_input';
}

/** 字段类型允许替换的输入组件选项（Select 用）。 */
export function componentOptionsFor(field: Field): { value: ComponentType; label: string }[] {
  const candidates = FIELD_COMPONENT_CANDIDATES[field.type] ?? ['text_input'];
  return candidates.map((type) => ({
    value: type,
    label: COMPONENT_LABELS[type] ?? type,
  }));
}

/** 输入组件是否为只读展示类（自动编号/公式/汇总生成后锁定）。 */
export function isReadonlyComponent(field: Field, component: ComponentType): boolean {
  return (
    (field.type === 'auto_number' || field.type === 'formula' || field.type === 'rollup') &&
    (component === 'text_input' || component === 'number_input')
  );
}
