/**
 * 页面模板生成 —— 根据 PRD 第 4 节,基于对象元数据自动生成列表/详情/表单页 Schema。
 *
 * 字段类型 → 表单组件映射、ViewModel 自动创建、组件树自动布局均在此实现。
 * 模板产出标准 PageSchema,搭建者可在此基础上微调。
 */

import type {
  ComponentNode,
  ComponentType,
  PageSchema,
  PageType,
  PropValue,
  VariableDef,
} from '../../api/pages.js';
import type { Field, ObjectWithFields, SelectOption } from '../../api/objects.js';
import { createDefaultSchema } from '../../stores/pageBuilder.js';

// ---------------------------------------------------------------------------
// 辅助:ID 生成 / 字段过滤
// ---------------------------------------------------------------------------

/** 生成组件节点唯一 ID。 */
function nodeId(type: string): string {
  return `${type}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 创建组件节点(简化构造)。 */
function makeNode(
  type: ComponentType,
  name: string,
  props: Record<string, PropValue> = {},
  children?: ComponentNode[],
): ComponentNode {
  return { id: nodeId(type), type, name, props, children };
}

/** 绑定表达式。 */
function bind(path: string): PropValue {
  return { __bind: path };
}

/** 过滤业务字段(排除系统字段)。 */
function businessFields(fields: Field[]): Field[] {
  return fields.filter((f) => !f.isSystem);
}

/** 取对象显示名(优先 labelPlural,回退 label)。 */
function displayLabel(meta: ObjectWithFields): string {
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
function fieldToFormNode(field: Field): ComponentNode {
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

// ---------------------------------------------------------------------------
// 列表页模板
// ---------------------------------------------------------------------------

/**
 * 列表页模板:Section(标题) + 新建按钮 + DataTable(绑定 vm.list)。
 * ViewModel: list(record_list, autoQuery) + selectedId(scalar) + keyword(scalar)。
 */
export function generateListPageTemplate(meta: ObjectWithFields): PageSchema {
  const label = displayLabel(meta);
  const fields = businessFields(meta.fields).slice(0, 6);

  // DataTable 列配置
  const columns: PropValue[] = fields.map((f) => ({
    fieldId: f.id,
    apiName: f.apiName,
    label: f.label,
    width: 160,
    sortable: true,
  }));

  const dataTable = makeNode('data_table', `${label}表格`, {
    data: bind('vm.list.records'),
    columns,
    pagination: true,
    pageSize: 20,
    selectable: true,
    showIndex: true,
  });

  const createButton = makeNode('button', '新建', {
    text: '新建',
    type: 'primary',
  });

  const section = makeNode('section', label, { title: label }, [
    createButton,
    dataTable,
  ]);

  const root = makeNode('page', '页面', { title: `${label}列表` }, [section]);

  return {
    version: '1',
    pageType: 'list_page',
    viewModel: {
      variables: {
        list: {
          type: 'record_list',
          datasource: {
            objectId: meta.id,
            autoQuery: true,
          },
        },
        selectedId: { type: 'scalar', initialValue: null },
        keyword: { type: 'scalar', initialValue: '' },
      },
    },
    root,
  };
}

// ---------------------------------------------------------------------------
// 详情页模板
// ---------------------------------------------------------------------------

/**
 * 详情页模板:Section(标题) + 编辑/删除按钮 + DetailCard(绑定 vm.record)。
 * ViewModel: record(record, autoQuery false)。
 */
export function generateDetailPageTemplate(meta: ObjectWithFields): PageSchema {
  const label = displayLabel(meta);
  const fields = businessFields(meta.fields);

  // DetailCard 字段配置
  const fieldConfigs: PropValue[] = fields.map((f) => ({
    fieldId: f.id,
    apiName: f.apiName,
    label: f.label,
  }));

  const detailCard = makeNode('detail_card', `${label}详情`, {
    record: bind('vm.record'),
    fields: fieldConfigs,
    columns: 2,
  });

  const editButton = makeNode('button', '编辑', {
    text: '编辑',
    type: 'primary',
  });

  const deleteButton = makeNode('button', '删除', {
    text: '删除',
    type: 'default',
    danger: true,
  });

  const section = makeNode('section', label, { title: label }, [
    editButton,
    deleteButton,
    detailCard,
  ]);

  const root = makeNode('page', '页面', { title: `${label}详情` }, [section]);

  return {
    version: '1',
    pageType: 'detail_page',
    viewModel: {
      variables: {
        record: {
          type: 'record',
          datasource: {
            objectId: meta.id,
            autoQuery: false,
          },
        },
      },
    },
    root,
  };
}

// ---------------------------------------------------------------------------
// 表单页模板
// ---------------------------------------------------------------------------

/**
 * 表单页模板:Section(标题) + Form(绑定 vm.record,字段自动生成) + 保存/取消按钮。
 * ViewModel: record(record, autoQuery false, initialValue 空对象)。
 */
export function generateFormPageTemplate(meta: ObjectWithFields): PageSchema {
  const label = displayLabel(meta);
  const fields = businessFields(meta.fields);

  // 按字段类型生成表单项
  const fieldNodes = fields.map(fieldToFormNode);

  // 保存 / 取消按钮
  const saveButton = makeNode('button', '保存', {
    text: '保存',
    type: 'primary',
  });
  const cancelButton = makeNode('button', '取消', {
    text: '取消',
    type: 'default',
  });

  const form = makeNode(
    'form',
    `${label}表单`,
    {
      record: bind('vm.record'),
      objectId: meta.id,
      layout: 'vertical',
      columns: 1,
    },
    [...fieldNodes, saveButton, cancelButton],
  );

  const section = makeNode('section', label, { title: label }, [form]);
  const root = makeNode('page', '页面', { title: `${label}表单` }, [section]);

  return {
    version: '1',
    pageType: 'form_page',
    viewModel: {
      variables: {
        record: {
          type: 'record',
          initialValue: {},
          datasource: {
            objectId: meta.id,
            autoQuery: false,
          },
        },
      },
    },
    root,
  };
}

// ---------------------------------------------------------------------------
// 模板分发
// ---------------------------------------------------------------------------

/**
 * 按页面类型生成模板。
 * - list_page / detail_page / form_page: 基于对象字段自动生成
 * - dashboard / custom: 空白 Schema
 */
export function generatePageTemplate(
  pageType: PageType,
  meta: ObjectWithFields | null,
): PageSchema {
  if (!meta) {
    return createDefaultSchema(pageType);
  }

  switch (pageType) {
    case 'list_page':
      return generateListPageTemplate(meta);
    case 'detail_page':
      return generateDetailPageTemplate(meta);
    case 'form_page':
      return generateFormPageTemplate(meta);
    default:
      return createDefaultSchema(pageType);
  }
}

/** 判断页面类型是否需要关联对象。 */
export function pageTypeRequiresObject(pageType: PageType): boolean {
  return pageType === 'list_page' || pageType === 'detail_page' || pageType === 'form_page';
}

export type { VariableDef };
