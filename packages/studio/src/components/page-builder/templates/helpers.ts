/**
 * 从 components/page-builder/templates.ts 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 模板生成辅助:节点工厂 / 绑定表达式 / 字段过滤 / 字段类型 → 表单组件映射。
 */

import type { ComponentNode, ComponentType, PropValue } from '../../../api/pages.js';
import type { Field, ObjectWithFields, SelectOption } from '../../../api/objects.js';

// ---------------------------------------------------------------------------
// 辅助:ID 生成 / 字段过滤
// ---------------------------------------------------------------------------

/** 生成组件节点唯一 ID。 */
function nodeId(type: string): string {
  return `${type}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 创建组件节点(简化构造)。 */
export function makeNode(
  type: ComponentType,
  name: string,
  props: Record<string, PropValue> = {},
  children?: ComponentNode[],
): ComponentNode {
  return { id: nodeId(type), type, name, props, children };
}

/** 绑定表达式。 */
export function bind(path: string): PropValue {
  return { __bind: path };
}

/** 过滤业务字段(排除系统字段)。 */
export function businessFields(fields: Field[]): Field[] {
  return fields.filter((f) => !f.isSystem);
}

/** 取对象显示名(优先 labelPlural,回退 label)。 */
export function displayLabel(meta: ObjectWithFields): string {
  return meta.labelPlural || meta.label || meta.name || meta.apiName;
}

// ---------------------------------------------------------------------------
// 字段类型 → 表单组件映射
// ---------------------------------------------------------------------------

interface FieldComponentMapping {
  type: ComponentType;
  /** 是否只读(自动编号 / 公式 / 汇总) */
  readonly?: boolean;
}

/** 字段类型 → 表单组件映射(对齐 PRD §4.4 / DESIGN §6.3)。 */
function fieldToFormComponent(field: Field): FieldComponentMapping {
  switch (field.type) {
    case 'text':
      return { type: 'text_input' };
    case 'long_text':
    case 'rich_text':
      return { type: 'textarea' };
    case 'number':
    case 'currency':
    case 'percent':
      return { type: 'number_input' };
    case 'auto_number':
      return { type: 'text_input', readonly: true };
    case 'single_select':
      return { type: 'select' };
    case 'multi_select':
      return { type: 'multi_select' };
    case 'date':
    case 'date_time':
      return { type: 'date_picker' };
    case 'checkbox':
      return { type: 'switch' };
    case 'attachment':
      return { type: 'attachment_upload' };
    case 'user':
      return { type: 'user_picker' };
    case 'lookup':
      return { type: 'lookup_picker' };
    case 'sub_form':
      return { type: 'sub_form_table' };
    case 'formula':
    case 'rollup':
      return { type: 'text_input', readonly: true };
    default:
      return { type: 'text_input' };
  }
}

/** 单选字段选项 → Select options。 */
function toSelectOptions(options?: SelectOption[]): PropValue[] {
  if (!options) return [];
  return options.map((opt) => ({ label: opt.label, value: opt.id }));
}

/** 根据字段生成表单子组件节点。 */
export function fieldToFormNode(field: Field): ComponentNode {
  const mapping = fieldToFormComponent(field);
  const props: Record<string, PropValue> = {
    fieldId: field.id,
    apiName: field.apiName,
    label: field.label,
    required: field.required,
    value: bind(`vm.record.${field.apiName}`),
  };

  if (mapping.readonly) {
    props.readonly = true;
    props.disabled = true;
  }

  // 按字段类型补充特有属性
  switch (field.type) {
    case 'text':
      if (field.config.maxLength) props.maxLength = field.config.maxLength;
      break;
    case 'long_text':
    case 'rich_text':
      props.rows = 4;
      if (field.config.maxLength) props.maxLength = field.config.maxLength;
      break;
    case 'number':
    case 'currency':
    case 'percent':
      if (field.config.number) props.precision = field.config.number.precision;
      break;
    case 'single_select':
      props.options = toSelectOptions(field.config.options);
      props.allowClear = true;
      break;
    case 'multi_select':
      props.options = toSelectOptions(field.config.options);
      props.allowClear = true;
      break;
    case 'date_time':
      props.showTime = true;
      props.format = 'YYYY-MM-DD HH:mm:ss';
      break;
    case 'date':
      props.format = 'YYYY-MM-DD';
      break;
    case 'lookup':
      if (field.config.lookup) {
        props.targetObjectId = field.config.lookup.targetObjectId;
      }
      break;
    case 'sub_form':
      if (field.config.subForm) {
        props.childObjectId = field.config.subForm.childObjectId;
      }
      break;
    default:
      break;
  }

  return makeNode(mapping.type, field.label, props);
}
