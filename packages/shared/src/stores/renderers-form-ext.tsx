/**
 * 表单类扩展渲染器 — 页面模块对齐批次C2：
 * email_input / phone_input / user_picker_multi / lookup_picker_multi /
 * image_upload / rich_text_input / cascader_single / cascader_multi /
 * tree_select_single / tree_select_multi。
 *
 * 复用 FormFieldItem（标题/必填/禁用/12栅格）与 getFieldBinding（vm 绑定）。
 * rich_text_input 为 v1：多行输入 HTML/文本，富文本工具条后续批次补。
 */

import type { ReactNode } from 'react';
import { Cascader, Input, Select, TreeSelect, Upload } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ComponentNode } from './types.js';
import type { RenderContext } from './renderer-helpers.js';
import {
  getPropAsNumber,
  getPropAsString,
  extractSelectOptions,
  FormFieldItem,
} from './renderer-helpers.js';

export function renderEmailInput(node: ComponentNode, ctx: RenderContext): ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请输入邮箱';
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Input type="email" placeholder={placeholder} size="small" />
    </FormFieldItem>
  );
}

export function renderPhoneInput(node: ComponentNode, ctx: RenderContext): ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请输入手机号';
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Input maxLength={11} placeholder={placeholder} size="small" />
    </FormFieldItem>
  );
}

export function renderUserPickerMulti(node: ComponentNode, ctx: RenderContext): ReactNode {
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Select
        mode="multiple"
        placeholder={getPropAsString(node, 'placeholder', ctx) || '请选择人员'}
        showSearch
        size="small"
        style={{ width: '100%' }}
        options={[]}
        notFoundContent={ctx.mode === 'edit' ? '编辑模式不加载人员数据' : '无匹配人员'}
      />
    </FormFieldItem>
  );
}

export function renderLookupPickerMulti(node: ComponentNode, ctx: RenderContext): ReactNode {
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Select
        mode="multiple"
        placeholder={getPropAsString(node, 'placeholder', ctx) || '请选择关联记录'}
        showSearch
        size="small"
        style={{ width: '100%' }}
        options={[]}
        notFoundContent={ctx.mode === 'edit' ? '编辑模式不加载远程数据' : '无匹配数据'}
      />
    </FormFieldItem>
  );
}

export function renderImageUpload(node: ComponentNode, ctx: RenderContext): ReactNode {
  const maxCount = getPropAsNumber(node, 'maxCount', ctx) || undefined;
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Upload listType="picture-card" maxCount={maxCount || 3} beforeUpload={() => false}>
        <div style={{ color: 'rgba(0,0,0,0.45)' }}>
          <PlusOutlined />
          <div style={{ fontSize: 11 }}>上传</div>
        </div>
      </Upload>
    </FormFieldItem>
  );
}

export function renderRichTextInput(node: ComponentNode, ctx: RenderContext): ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请输入内容';
  const rows = getPropAsNumber(node, 'rows', ctx) || 6;
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Input.TextArea rows={rows} placeholder={placeholder} size="small" />
    </FormFieldItem>
  );
}

/** options（label/value）→ Cascader 级联选项（children 透传）。 */
export function toCascaderOptions(node: ComponentNode): { label: string; value: string }[] {
  return extractSelectOptions(node) as { label: string; value: string }[];
}

export function renderCascaderSingle(node: ComponentNode, ctx: RenderContext): ReactNode {
  const options = toCascaderOptions(node);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Cascader
        options={options}
        placeholder={getPropAsString(node, 'placeholder', ctx) || '请选择'}
        size="small"
        changeOnSelect
      />
    </FormFieldItem>
  );
}

export function renderCascaderMulti(node: ComponentNode, ctx: RenderContext): ReactNode {
  const options = toCascaderOptions(node);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Cascader
        options={options}
        multiple
        placeholder={getPropAsString(node, 'placeholder', ctx) || '请选择'}
        size="small"
        maxTagCount="responsive"
      />
    </FormFieldItem>
  );
}

/** options（label/value）→ TreeSelect treeData（label→title 映射）。 */
function toTreeData(
  options: { label: string; value: string }[],
): { title: string; value: string }[] {
  return options.map((o) => ({ title: o.label, value: o.value }));
}

export function renderTreeSelectSingle(node: ComponentNode, ctx: RenderContext): ReactNode {
  const treeData = toTreeData(extractSelectOptions(node));
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <TreeSelect
        treeData={treeData}
        placeholder={getPropAsString(node, 'placeholder', ctx) || '请选择'}
        size="small"
        allowClear
        style={{ width: '100%' }}
      />
    </FormFieldItem>
  );
}

export function renderTreeSelectMulti(node: ComponentNode, ctx: RenderContext): ReactNode {
  const treeData = toTreeData(extractSelectOptions(node));
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <TreeSelect
        treeData={treeData}
        multiple
        placeholder={getPropAsString(node, 'placeholder', ctx) || '请选择'}
        size="small"
        maxTagCount="responsive"
        style={{ width: '100%' }}
      />
    </FormFieldItem>
  );
}
