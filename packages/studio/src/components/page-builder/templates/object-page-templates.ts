/**
 * 从 components/page-builder/templates.ts 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 对象驱动的页面模板:列表页 / 详情页 / 表单页。
 */

import type { PageSchema, PropValue } from '../../../api/pages.js';
import type { ObjectWithFields } from '../../../api/objects.js';
import { bind, businessFields, displayLabel, fieldToFormNode, makeNode } from './helpers.js';

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

  const section = makeNode('section', label, { title: label }, [createButton, dataTable]);

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
 * 表单页模板:Section(标题) + Form(绑定 vm.record,字段自动生成) + 提交按钮。
 * 对齐表单生成器行为：提交按钮 htmlType=submit + onSubmit=create_record 接线。
 * ViewModel: record(record, autoQuery false, initialValue 空对象)。
 */
export function generateFormPageTemplate(meta: ObjectWithFields): PageSchema {
  const label = displayLabel(meta);
  const fields = businessFields(meta.fields);

  // 按字段类型生成表单项
  const fieldNodes = fields.map(fieldToFormNode);

  // 提交按钮（飞书样式：底部主按钮，触发整表校验 + onSubmit 动作）
  const submitButton = makeNode('button', '提交', {
    text: '提交',
    type: 'primary',
    htmlType: 'submit',
  });

  const form = makeNode(
    'form',
    `${label}表单`,
    {
      record: bind('vm.record'),
      objectId: meta.id,
      layout: 'vertical',
      columns: 1,
      onSubmit: {
        __action: {
          type: 'create_record',
          params: { objectId: meta.id, data: bind('vm.record') },
        },
      },
    },
    [...fieldNodes, submitButton],
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
