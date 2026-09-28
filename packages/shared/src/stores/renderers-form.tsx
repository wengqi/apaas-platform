/**
 * 表单类渲染器 — form / text_input / textarea / number_input / select /
 * multi_select / date_picker / radio / checkbox / switch / lookup_picker /
 * sub_form_table / attachment_upload / user_picker（共 14 个）。
 *
 * 从 component-renderer.tsx 拆分，实现逻辑不变。
 * 类型与辅助函数从 renderer-helpers.tsx 导入，避免循环依赖。
 */

import type { ReactNode } from 'react';
import {
  Button,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Switch,
  Table,
  Upload,
} from 'antd';
import { Typography } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { ComponentNode } from './types.js';
import { resolvePropValue } from './expression-engine.js';
import type { RenderContext, RenderChild, TableRow } from './renderer-helpers.js';
import {
  getPropAsString,
  getPropAsNumber,
  getPropAsBool,
  getFieldBinding,
  extractSelectOptions,
  extractTableColumns,
  FormFieldItem,
  renderContainerChildren,
} from './renderer-helpers.js';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// 表单类渲染器
// ---------------------------------------------------------------------------

/**
 * 表单渲染器组件 — 接线 onFinish/onReset 到 ctx.onAction。
 *
 * F-B2 修复：此前 Form 无 onFinish/onReset，EventsTab 配置的 onSubmit 动作永不触发。
 * 现在通过 Form.useForm() 获取 form 实例，验证通过后触发 onSubmit 动作链。
 *
 * 飞书对齐：渲染真实 <form> 元素（component="form"），使 htmlType="submit"
 * 的提交按钮可触发整表校验 + onSubmit 动作链（表单生成器生成的提交按钮依赖此行为）。
 */
function FormRenderer({
  node,
  ctx,
  renderChild,
}: {
  node: ComponentNode;
  ctx: RenderContext;
  renderChild: RenderChild;
}) {
  const [form] = Form.useForm();
  const layout = getPropAsString(node, 'layout', ctx) || 'vertical';

  return (
    <Form
      form={form}
      layout={layout as 'vertical' | 'horizontal'}
      component="form"
      onFinish={() => ctx.onAction(node.id, 'onSubmit')}
      onReset={() => ctx.onAction(node.id, 'onReset')}
    >
      {renderContainerChildren(node, ctx, renderChild)}
    </Form>
  );
}

export function renderForm(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): ReactNode {
  return <FormRenderer node={node} ctx={ctx} renderChild={renderChild} />;
}

export function renderTextInput(node: ComponentNode, ctx: RenderContext): ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请输入';
  const maxLength = getPropAsNumber(node, 'maxLength', ctx) || undefined;
  const { isPreview, value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Input
        placeholder={placeholder}
        maxLength={maxLength || undefined}
        size="small"
        value={isPreview ? (value as string) || '' : undefined}
        onChange={(e) => setValue(e.target.value)}
      />
    </FormFieldItem>
  );
}

export function renderTextArea(node: ComponentNode, ctx: RenderContext): ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请输入';
  const rows = getPropAsNumber(node, 'rows', ctx) || 4;
  const showCount = getPropAsBool(node, 'showCount', ctx);
  const { isPreview, value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Input.TextArea
        placeholder={placeholder}
        rows={rows}
        showCount={showCount}
        size="small"
        value={isPreview ? (value as string) || '' : undefined}
        onChange={(e) => setValue(e.target.value)}
      />
    </FormFieldItem>
  );
}

export function renderNumberInput(node: ComponentNode, ctx: RenderContext): ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请输入数字';
  const precision = getPropAsNumber(node, 'precision', ctx) || undefined;
  const min = getPropAsNumber(node, 'min', ctx) || undefined;
  const max = getPropAsNumber(node, 'max', ctx) || undefined;
  const step = getPropAsNumber(node, 'step', ctx) || undefined;
  const { isPreview, value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <InputNumber
        placeholder={placeholder}
        precision={precision || undefined}
        min={min || undefined}
        max={max || undefined}
        step={step || undefined}
        size="small"
        style={{ width: '100%' }}
        value={isPreview ? (value as number) : undefined}
        onChange={(v) => setValue(v)}
      />
    </FormFieldItem>
  );
}

export function renderSelect(node: ComponentNode, ctx: RenderContext): ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请选择';
  const options = extractSelectOptions(node);
  const allowClear = getPropAsBool(node, 'allowClear', ctx);
  const { isPreview, value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Select
        placeholder={placeholder}
        options={options}
        allowClear={allowClear}
        size="small"
        style={{ width: '100%' }}
        value={isPreview ? (value as string) : undefined}
        onChange={(v) => setValue(v)}
      />
    </FormFieldItem>
  );
}

export function renderMultiSelect(node: ComponentNode, ctx: RenderContext): ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请选择';
  const options = extractSelectOptions(node);
  const allowClear = getPropAsBool(node, 'allowClear', ctx);
  const { isPreview, value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Select
        mode="multiple"
        placeholder={placeholder}
        options={options}
        allowClear={allowClear}
        size="small"
        style={{ width: '100%' }}
        value={isPreview ? (value as string[]) : undefined}
        onChange={(v) => setValue(v)}
      />
    </FormFieldItem>
  );
}

export function renderDatePicker(node: ComponentNode, ctx: RenderContext): ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请选择日期';
  const showTime = getPropAsBool(node, 'showTime', ctx);
  const format = getPropAsString(node, 'format', ctx) || undefined;
  const { isPreview, value, setValue } = getFieldBinding(node, ctx);
  const dayjsVal = isPreview && value ? dayjs(value as string | number | Date) : undefined;
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <DatePicker
        placeholder={placeholder}
        showTime={showTime || undefined}
        format={format}
        size="small"
        style={{ width: '100%' }}
        value={dayjsVal as Dayjs | undefined}
        onChange={(_d, str) => setValue(str as string)}
      />
    </FormFieldItem>
  );
}

export function renderRadio(node: ComponentNode, ctx: RenderContext): ReactNode {
  const options = extractSelectOptions(node);
  const radioOptions = options.map((o) => ({ label: o.label, value: o.value }));
  const { isPreview, value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Radio.Group
        options={radioOptions}
        size="small"
        value={isPreview ? (value as string) : undefined}
        onChange={(e) => setValue(e.target.value)}
      />
    </FormFieldItem>
  );
}

export function renderCheckbox(node: ComponentNode, ctx: RenderContext): ReactNode {
  const label = getPropAsString(node, 'label', ctx) || node.name || '复选框';
  const { isPreview, value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Checkbox
        checked={isPreview ? !!value : undefined}
        onChange={(e) => setValue(e.target.checked)}
      >
        {label}
      </Checkbox>
    </FormFieldItem>
  );
}

export function renderSwitch(node: ComponentNode, ctx: RenderContext): ReactNode {
  const label = getPropAsString(node, 'label', ctx);
  const { isPreview, value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Switch checked={isPreview ? !!value : undefined} onChange={(checked) => setValue(checked)} />
      {label ? <Text style={{ marginLeft: 8, fontSize: 13 }}>{label}</Text> : null}
    </FormFieldItem>
  );
}

export function renderLookupPicker(node: ComponentNode, ctx: RenderContext): ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请选择关联记录';
  const multiple = getPropAsBool(node, 'multiple', ctx);
  const { isPreview, value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Select
        mode={multiple ? 'multiple' : undefined}
        placeholder={placeholder}
        showSearch
        size="small"
        style={{ width: '100%' }}
        value={isPreview ? (value as string | string[]) : undefined}
        onChange={(v) => setValue(v)}
        notFoundContent={ctx.mode === 'edit' ? '编辑模式不加载远程数据' : '无匹配数据'}
      />
    </FormFieldItem>
  );
}

export function renderSubFormTable(node: ComponentNode, ctx: RenderContext): ReactNode {
  const columns = extractTableColumns(node);
  let dataSource: TableRow[] = [];
  if (ctx.mode === 'preview') {
    const data = resolvePropValue(node.props.data ?? null, { vm: ctx.vm });
    if (Array.isArray(data)) dataSource = data as TableRow[];
  }
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Table<TableRow>
        size="small"
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        pagination={false}
        locale={{ emptyText: '暂无子表记录' }}
      />
    </FormFieldItem>
  );
}

export function renderAttachmentUpload(node: ComponentNode, ctx: RenderContext): ReactNode {
  const maxCount = getPropAsNumber(node, 'maxCount', ctx) || undefined;
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Upload maxCount={maxCount || undefined} listType="text">
        <Button icon={<UploadOutlined />} size="small">
          上传附件
        </Button>
      </Upload>
    </FormFieldItem>
  );
}

export function renderUserPicker(node: ComponentNode, ctx: RenderContext): ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请选择人员';
  const multiple = getPropAsBool(node, 'multiple', ctx);
  const { isPreview, value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Select
        mode={multiple ? 'multiple' : undefined}
        placeholder={placeholder}
        showSearch
        size="small"
        style={{ width: '100%' }}
        value={isPreview ? (value as string | string[]) : undefined}
        onChange={(v) => setValue(v)}
        notFoundContent={ctx.mode === 'edit' ? '编辑模式不加载人员数据' : '无匹配人员'}
      />
    </FormFieldItem>
  );
}
