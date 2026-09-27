/**
 * 表单生成器 — 由勾选的字段行生成表单子节点（纯函数）。
 *
 * 对齐飞书 aPaaS「表单生成器」：勾选字段 + 编辑标题 + 指定输入组件 + 必填
 * → 生成字段组件节点列表；同时产出 vm.record 变量定义与表单提交动作
 * （对应飞书「将自动生成 N 个组件以及 1 个数据请求」）。
 */

import type {
  ComponentNode,
  ComponentProps,
  ComponentType,
  PropValue,
  VariableDef,
} from '../../../api/pages.js';
import type { Field, SelectOption } from '../../../api/objects.js';
import { defaultComponentFor } from './mapping.js';

/** 生成器中的一行字段配置（对应飞书表格的一行）。 */
export interface FormGenRow {
  fieldId: string;
  /** 是否勾选生成 */
  selected: boolean;
  /** 字段 ID（同 fieldId，冗余便于排序回调取回 Field） */
  apiName: string;
  /** 展示标题（可编辑，默认字段 label） */
  title: string;
  /** 输入组件（默认按字段类型映射，可改） */
  component: ComponentType;
  /** 必填（字段本身 required 时锁定为 true） */
  required: boolean;
}

/** 从对象字段初始化生成器行（默认全选业务字段、按序排列）。 */
export function initRowsFromFields(fields: Field[]): FormGenRow[] {
  return fields.map((field) => ({
    fieldId: field.id,
    selected: !field.isSystem,
    apiName: field.apiName,
    title: field.label,
    component: defaultComponentFor(field),
    required: field.required,
  }));
}

/** 生成结果：字段节点 + 提交动作 + 视图模型补丁。 */
export interface FormGenerationResult {
  fieldNodes: ComponentNode[];
  /** 表单 onSubmit 动作（create_record ← vm.record） */
  onSubmitAction: PropValue;
  /** vm.record 变量定义（幂等写入用） */
  recordVariable: VariableDef;
}

/** 单选字段选项 → Select options 属性值。 */
function toSelectOptions(options?: SelectOption[]): PropValue[] {
  if (!options) return [];
  return options.map((opt) => ({ label: opt.label, value: opt.value || opt.id }));
}

/** 由一行配置 + 字段元数据生成单个字段节点。 */
export function buildFieldNode(field: Field, row: FormGenRow): ComponentNode {
  const props: ComponentProps = {
    fieldId: field.id,
    apiName: field.apiName,
    label: row.title,
    required: row.required,
    value: { __bind: `vm.record.${field.apiName}` },
  };

  // 只读展示类字段（自动编号/公式/汇总）
  if (field.type === 'auto_number' || field.type === 'formula' || field.type === 'rollup') {
    props.readonly = true;
    props.disabled = true;
  }

  switch (field.type) {
    case 'text':
      if (field.config.maxLength) props.maxLength = field.config.maxLength;
      if (!props.placeholder) props.placeholder = '请输入';
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
    case 'multi_select':
      props.options = toSelectOptions(field.config.options);
      props.allowClear = true;
      break;
    case 'date':
      props.format = 'YYYY-MM-DD';
      break;
    case 'date_time':
      props.showTime = true;
      props.format = 'YYYY-MM-DD HH:mm:ss';
      break;
    case 'lookup':
      if (field.config.lookup) props.targetObjectId = field.config.lookup.targetObjectId;
      break;
    case 'sub_form':
      if (field.config.subForm) props.childObjectId = field.config.subForm.childObjectId;
      break;
    default:
      break;
  }

  return {
    id: `${row.component}_${Math.random().toString(36).slice(2, 8)}`,
    type: row.component,
    name: row.title,
    props,
  };
}

/** 表单底部提交按钮节点（飞书样式：右下角主按钮「提交」）。 */
export function buildSubmitButtonNode(): ComponentNode {
  return {
    id: `button_${Math.random().toString(36).slice(2, 8)}`,
    type: 'button',
    name: '提交',
    props: { text: '提交', type: 'primary', htmlType: 'submit' },
  };
}

/**
 * 由勾选行生成完整结果。
 * 行顺序即字段顺序（生成器表格内已排序）。
 */
export function buildFormGeneration(
  fields: Field[],
  rows: FormGenRow[],
  objectId: string,
): FormGenerationResult {
  const fieldById = new Map(fields.map((f) => [f.id, f]));
  const fieldNodes = rows
    .filter((row) => row.selected && fieldById.has(row.fieldId))
    .map((row) => {
      const field = fieldById.get(row.fieldId);
      if (!field) throw new Error(`field ${row.fieldId} not found`);
      return buildFieldNode(field, row);
    });

  const onSubmitAction: PropValue = {
    __action: {
      type: 'create_record',
      params: {
        objectId,
        data: { __bind: 'vm.record' },
      },
    },
  };

  const recordVariable: VariableDef = {
    type: 'record',
    initialValue: {},
    datasource: { objectId, autoQuery: false },
  };

  return { fieldNodes, onSubmitAction, recordVariable };
}
