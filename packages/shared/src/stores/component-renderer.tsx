/**
 * 共享组件渲染器 — Studio（编辑 + 预览）与 Runtime-UI（纯预览）共用。
 *
 * 从两包的 ComponentRenderer.tsx 提取共享逻辑：
 * - 渲染上下文（RenderContext，超集：含 mode / edit-mode 放置区回调）
 * - 属性读取辅助（getProp / getPropAsString / ...）
 * - 全部 26 个组件渲染器（studio 超集形式，edit-mode 分支由 ctx.mode === 'edit' 守卫）
 * - PreviewNode 组件 + createComponentRenderer 工厂
 *
 * Studio 通过 createComponentRenderer({ wrapEdit: EditNode }) 注入编辑模式包裹层；
 * Runtime-UI 通过 createComponentRenderer({ renderers: { chart: ... } }) 覆盖图表渲染器。
 */

import { useEffect, type ReactNode } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  List,
  Radio,
  Row,
  Select,
  Statistic,
  Switch,
  Table,
  Tabs,
  Typography,
  Upload,
} from 'antd';
import type { DescriptionsProps, TableProps } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import ReactECharts from 'echarts-for-react';
import type { ActionConfig, ComponentNode, ComponentType, PropValue, ViewModel } from './types.js';
import type { RuntimeState } from './runtime-store.js';
import { resolvePropValue, getByPath } from './expression-engine.js';
import { buildChartOption } from '../page/chart-options.js';
import type { ChartType, ChartAggregation } from '../page/index.js';

const { Text, Title } = Typography;

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 表格行记录类型。 */
export type TableRow = Record<string, unknown>;

/** 组件渲染上下文，传递模式 / 视图模型 / 选择 / 事件回调。 */
export interface RenderContext {
  mode: 'edit' | 'preview';
  viewModel: ViewModel;
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
  onAction: (nodeId: string, eventName: string) => void;
  /** 运行时上下文（预览模式数据/事件；编辑模式为 no-op）。 */
  runtime: RuntimeState;
  /** 运行时 vm 值（预览模式；编辑模式为空对象）。 */
  vm: Record<string, unknown>;
  /**
   * 编辑模式：容器子节点放置区渲染回调。
   * 由 Studio 注入 DroppableArea（@dnd-kit/core）；Runtime-UI 不需要（始终 preview）。
   */
  renderDropzone?: (parentId: string, isEmpty: boolean, children: ReactNode) => ReactNode;
}

/** 子节点渲染回调。 */
export type RenderChild = (child: ComponentNode) => ReactNode;

/** 组件渲染函数签名。 */
export type RendererFn = (
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
) => ReactNode;

// ---------------------------------------------------------------------------
// 节点查找 / 事件动作提取 / 隐藏判定
// ---------------------------------------------------------------------------

/** 在组件树中按 ID 查找节点（递归）。 */
export function findNodeById(root: ComponentNode, id: string): ComponentNode | undefined {
  if (root.id === id) return root;
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** 从事件属性值提取动作链（ActionConfig[] / ActionConfig / { __action }）。 */
export function extractActions(prop: PropValue | undefined): ActionConfig[] {
  if (!prop) return [];
  if (Array.isArray(prop)) {
    return prop.flatMap((p) => extractActions(p));
  }
  if (prop && typeof prop === 'object' && '__action' in prop) {
    return [(prop as { __action: ActionConfig }).__action];
  }
  if (prop && typeof prop === 'object' && 'type' in prop) {
    return [prop as unknown as ActionConfig];
  }
  return [];
}

/** 预览模式判定节点是否隐藏（hidden 可为布尔或 { __bind }）。 */
export function shouldHide(node: ComponentNode, vm: Record<string, unknown>): boolean {
  const h = node.hidden;
  if (h === undefined || h === false) return false;
  if (h === true) return true;
  return !!resolvePropValue(h, { vm });
}

// ---------------------------------------------------------------------------
// 属性读取辅助
// ---------------------------------------------------------------------------

/** 读取属性原始值（编辑模式）或解析后值（预览模式解析绑定/表达式）。 */
export function getProp(node: ComponentNode, key: string, ctx?: RenderContext): unknown {
  const raw = node.props[key] ?? null;
  if (ctx && ctx.mode === 'preview') {
    return resolvePropValue(raw, { vm: ctx.vm });
  }
  return raw;
}

/** 安全获取字符串属性值（预览模式解析绑定/表达式）。 */
export function getPropAsString(node: ComponentNode, key: string, ctx?: RenderContext): string {
  const v = getProp(node, key, ctx);
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

/** 安全获取数字属性值（预览模式解析绑定/表达式）。 */
export function getPropAsNumber(node: ComponentNode, key: string, ctx?: RenderContext): number {
  const v = getProp(node, key, ctx);
  return typeof v === 'number' ? v : 0;
}

/** 安全获取布尔属性值（预览模式解析绑定/表达式）。 */
export function getPropAsBool(node: ComponentNode, key: string, ctx?: RenderContext): boolean {
  const v = getProp(node, key, ctx);
  return typeof v === 'boolean' ? v : false;
}

/** 从 value 属性推断写回路径（优先 __bind，回退 vm.record.<apiName>）。 */
export function getFieldBindPath(node: ComponentNode): string | null {
  // 优先检查 __bind 表达式
  const raw = node.props.value;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && '__bind' in raw) {
    return (raw as { __bind: string }).__bind;
  }
  // 检查 bindPath 属性（Studio 搭建器输出的直接绑定路径）
  const bindPath = node.props.bindPath;
  if (typeof bindPath === 'string' && bindPath) {
    return bindPath;
  }
  const apiName = node.props.apiName;
  return typeof apiName === 'string' ? `vm.record.${apiName}` : null;
}

/** 表单字段双向绑定：读取 value + 构造 onChange 写回 vm。 */
export function getFieldBinding(
  node: ComponentNode,
  ctx: RenderContext,
): {
  isPreview: boolean;
  value: unknown;
  setValue: (v: unknown) => void;
} {
  const isPreview = ctx.mode === 'preview';
  const bindPath = isPreview ? getFieldBindPath(node) : null;
  const value = isPreview
    ? bindPath
      ? getByPath(ctx.vm, bindPath.startsWith('vm.') ? bindPath.slice(3) : bindPath)
      : getProp(node, 'value', ctx)
    : undefined;
  const setValue = (v: unknown) => {
    if (bindPath) ctx.runtime.setVariable(bindPath, v);
  };
  return { isPreview, value, setValue };
}

/** 将 PropValue 对象提取为 Record。 */
export function asPropObject(value: PropValue | undefined): Record<string, PropValue> | null {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !('__bind' in value) &&
    !('__expr' in value) &&
    !('__action' in value)
  ) {
    return value as Record<string, PropValue>;
  }
  return null;
}

/** 从 columns prop 提取 AntD 表格列配置。 */
export function extractTableColumns(node: ComponentNode): TableProps<TableRow>['columns'] {
  const raw = node.props.columns;
  if (!Array.isArray(raw)) return [];
  return raw.map((col, i) => {
    const obj = asPropObject(col);
    const label = obj && typeof obj.label === 'string' ? obj.label : `列${i + 1}`;
    const apiName =
      obj && typeof obj.apiName === 'string'
        ? obj.apiName
        : obj && typeof obj.fieldId === 'string'
          ? obj.fieldId
          : `col_${i}`;
    const width = obj && typeof obj.width === 'number' ? obj.width : undefined;
    return { title: label, dataIndex: apiName, width, key: apiName };
  });
}

/** 从 fields prop 提取详情卡片字段配置（预览模式从 record 取值）。 */
export function extractDetailFields(
  node: ComponentNode,
  record: Record<string, unknown>,
  ctx: RenderContext,
): DescriptionsProps['items'] {
  const raw = node.props.fields;
  if (!Array.isArray(raw)) return [];
  return raw.map((field, i) => {
    const obj = asPropObject(field);
    const label = obj && typeof obj.label === 'string' ? obj.label : `字段${i + 1}`;
    const key = obj && typeof obj.fieldId === 'string' ? obj.fieldId : String(i);
    let child: ReactNode = '—';
    if (ctx.mode === 'preview') {
      const apiName =
        obj && typeof obj.apiName === 'string'
          ? obj.apiName
          : obj && typeof obj.fieldId === 'string'
            ? obj.fieldId
            : '';
      if (apiName) {
        const val = record[apiName];
        child = val == null ? '—' : String(val);
      }
    }
    return { key, label, children: child };
  });
}

/** 从 options prop 提取下拉选项。 */
export function extractSelectOptions(node: ComponentNode): { label: string; value: string }[] {
  const raw = node.props.options;
  if (!Array.isArray(raw)) return [];
  return raw.map((opt) => {
    const obj = asPropObject(opt);
    if (!obj) return { label: '', value: '' };
    const label = typeof obj.label === 'string' ? obj.label : '';
    const value =
      typeof obj.value === 'string' ? obj.value : typeof obj.id === 'string' ? obj.id : '';
    return { label, value };
  });
}

// ---------------------------------------------------------------------------
// 容器子节点渲染（编辑模式通过 ctx.renderDropzone 注入放置区）
// ---------------------------------------------------------------------------

/** 渲染容器子节点（编辑模式包裹放置区；预览模式直接渲染）。 */
export function renderContainerChildren(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): ReactNode {
  const children = node.children ?? [];
  if (ctx.mode === 'edit' && ctx.renderDropzone) {
    return ctx.renderDropzone(node.id, children.length === 0, children.map(renderChild));
  }
  return <>{children.map(renderChild)}</>;
}

// ---------------------------------------------------------------------------
// 表单字段包裹（Form.Item + 标签 + 必填）
// ---------------------------------------------------------------------------

/** 表单字段包裹组件：Form.Item + 标签 + 必填 + 禁用。 */
export function FormFieldItem({
  node,
  ctx,
  children,
}: {
  node: ComponentNode;
  ctx: RenderContext;
  children: ReactNode;
}) {
  const label = getPropAsString(node, 'label', ctx) || node.name || '';
  const required = getPropAsBool(node, 'required', ctx);
  const disabled = getPropAsBool(node, 'disabled', ctx) || getPropAsBool(node, 'readonly', ctx);
  return (
    <Form.Item label={label || undefined} required={required} style={{ marginBottom: 16 }}>
      <div style={{ pointerEvents: disabled ? 'none' : 'auto', opacity: disabled ? 0.6 : 1 }}>
        {children}
      </div>
    </Form.Item>
  );
}

// ---------------------------------------------------------------------------
// 页面加载副作用
// ---------------------------------------------------------------------------

/** 页面加载副作用 — 提取为独立组件以满足 React Hooks 规则。 */
export function PageLoadEffect({ node, ctx }: { node: ComponentNode; ctx: RenderContext }) {
  useEffect(() => {
    if (ctx.mode === 'preview') ctx.onAction(node.id, 'onLoad');
  }, [ctx, node.id]);
  return null;
}

// ---------------------------------------------------------------------------
// 组件渲染器注册表
// ---------------------------------------------------------------------------

/** 全部 26 个组件渲染器（studio 超集形式）。 */
export const RENDERERS: Record<ComponentType, RendererFn> = {
  // —— 容器类 ——
  page: renderPage,
  section: renderSection,
  tabs: renderTabs,
  grid: renderGrid,
  grid_column: renderGridColumn,

  // —— 数据类 ——
  data_table: renderDataTable,
  detail_card: renderDetailCard,
  list: renderList,

  // —— 表单类 ——
  form: renderForm,
  text_input: renderTextInput,
  textarea: renderTextArea,
  number_input: renderNumberInput,
  select: renderSelect,
  multi_select: renderMultiSelect,
  date_picker: renderDatePicker,
  radio: renderRadio,
  checkbox: renderCheckbox,
  switch: renderSwitch,
  lookup_picker: renderLookupPicker,
  sub_form_table: renderSubFormTable,
  attachment_upload: renderAttachmentUpload,
  user_picker: renderUserPicker,

  // —— 展示类 ——
  button: renderButton,
  statistic: renderStatistic,
  chart: renderChart,
  rich_text_display: renderRichTextDisplay,
  divider: renderDivider,
  text: renderText,
};

// ---------------------------------------------------------------------------
// 容器类渲染器
// ---------------------------------------------------------------------------

function renderPage(node: ComponentNode, ctx: RenderContext, renderChild: RenderChild): ReactNode {
  return (
    <div style={{ minHeight: 60, padding: 8 }}>
      <PageLoadEffect node={node} ctx={ctx} />
      {renderContainerChildren(node, ctx, renderChild)}
    </div>
  );
}

function renderSection(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): ReactNode {
  const title = getPropAsString(node, 'title', ctx);
  return (
    <Card
      size="small"
      title={title || undefined}
      styles={{ body: { padding: 12 } }}
      style={{ marginBottom: 0 }}
    >
      {renderContainerChildren(node, ctx, renderChild)}
    </Card>
  );
}

function renderTabs(node: ComponentNode, ctx: RenderContext, renderChild: RenderChild): ReactNode {
  const children = node.children ?? [];
  const items = children.map((child, i) => ({
    key: child.id,
    label: getPropAsString(child, 'title', ctx) || child.name || `标签 ${i + 1}`,
    children: renderChild(child),
  }));
  const tabs = <Tabs items={items} size="small" />;
  if (ctx.mode === 'edit' && children.length === 0 && ctx.renderDropzone) {
    return ctx.renderDropzone(node.id, true, tabs);
  }
  return tabs;
}

function renderGrid(node: ComponentNode, ctx: RenderContext, renderChild: RenderChild): ReactNode {
  const gutter = getPropAsNumber(node, 'gutter', ctx) || 8;
  const children = node.children ?? [];
  const cols = children.map((child) => {
    const span = getPropAsNumber(child, 'span', ctx) || 12;
    return (
      <Col key={child.id} span={span}>
        {renderChild(child)}
      </Col>
    );
  });
  const row = <Row gutter={gutter}>{cols}</Row>;
  if (ctx.mode === 'edit' && ctx.renderDropzone) {
    return ctx.renderDropzone(node.id, children.length === 0, row);
  }
  return row;
}

function renderGridColumn(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): ReactNode {
  return renderContainerChildren(node, ctx, renderChild);
}

// ---------------------------------------------------------------------------
// 数据类渲染器
// ---------------------------------------------------------------------------

function renderDataTable(node: ComponentNode, ctx: RenderContext): ReactNode {
  const columns = extractTableColumns(node);
  const pagination = getPropAsBool(node, 'pagination', ctx);
  const pageSize = getPropAsNumber(node, 'pageSize', ctx) || 20;

  let dataSource: TableRow[] = [];
  if (ctx.mode === 'preview') {
    const data = resolvePropValue(node.props.data ?? null, { vm: ctx.vm });
    if (Array.isArray(data)) {
      dataSource = data as TableRow[];
    } else if (
      data &&
      typeof data === 'object' &&
      Array.isArray((data as Record<string, unknown>).records)
    ) {
      dataSource = (data as Record<string, unknown>).records as TableRow[];
    }
  }

  return (
    <Table<TableRow>
      size="small"
      columns={columns}
      dataSource={dataSource}
      rowKey="id"
      pagination={pagination ? { pageSize, showSizeChanger: false } : false}
      locale={{ emptyText: ctx.mode === 'edit' ? '暂无数据(编辑模式不加载)' : '暂无数据' }}
      onRow={(record) => ({
        onClick: () => {
          if (ctx.mode === 'preview') ctx.onAction(node.id, 'onRowClick');
          return record;
        },
      })}
    />
  );
}

function renderDetailCard(node: ComponentNode, ctx: RenderContext): ReactNode {
  const record =
    ctx.mode === 'preview'
      ? (resolvePropValue(node.props.record ?? null, { vm: ctx.vm }) as
          Record<string, unknown> | undefined)
      : undefined;
  const items = extractDetailFields(node, record ?? {}, ctx);
  const columns = getPropAsNumber(node, 'columns', ctx) || 2;
  return <Descriptions size="small" column={columns} bordered items={items} />;
}

function renderList(node: ComponentNode, ctx: RenderContext): ReactNode {
  let data: unknown[] = [];
  if (ctx.mode === 'edit') {
    data = [1, 2, 3];
  } else {
    const v = resolvePropValue(node.props.data ?? null, { vm: ctx.vm });
    if (Array.isArray(v)) data = v;
    else if (v && typeof v === 'object' && Array.isArray((v as Record<string, unknown>).records))
      data = (v as Record<string, unknown>).records as unknown[];
  }
  return (
    <List
      size="small"
      dataSource={data as TableRow[]}
      renderItem={(item) => {
        if (ctx.mode === 'preview' && item && typeof item === 'object') {
          const r = item as Record<string, unknown>;
          return <List.Item>{String(r.name ?? r.id ?? JSON.stringify(r))}</List.Item>;
        }
        return <List.Item>列表项 {String(item)}</List.Item>;
      }}
      locale={{ emptyText: '暂无数据' }}
    />
  );
}

// ---------------------------------------------------------------------------
// 表单类渲染器
// ---------------------------------------------------------------------------

function renderForm(node: ComponentNode, ctx: RenderContext, renderChild: RenderChild): ReactNode {
  const layout = getPropAsString(node, 'layout', ctx) || 'vertical';
  return (
    <Form layout={layout as 'vertical' | 'horizontal'} component={false}>
      {renderContainerChildren(node, ctx, renderChild)}
    </Form>
  );
}

function renderTextInput(node: ComponentNode, ctx: RenderContext): ReactNode {
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

function renderTextArea(node: ComponentNode, ctx: RenderContext): ReactNode {
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

function renderNumberInput(node: ComponentNode, ctx: RenderContext): ReactNode {
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

function renderSelect(node: ComponentNode, ctx: RenderContext): ReactNode {
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

function renderMultiSelect(node: ComponentNode, ctx: RenderContext): ReactNode {
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

function renderDatePicker(node: ComponentNode, ctx: RenderContext): ReactNode {
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

function renderRadio(node: ComponentNode, ctx: RenderContext): ReactNode {
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

function renderCheckbox(node: ComponentNode, ctx: RenderContext): ReactNode {
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

function renderSwitch(node: ComponentNode, ctx: RenderContext): ReactNode {
  const label = getPropAsString(node, 'label', ctx);
  const { isPreview, value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Switch checked={isPreview ? !!value : undefined} onChange={(checked) => setValue(checked)} />
      {label ? <Text style={{ marginLeft: 8, fontSize: 13 }}>{label}</Text> : null}
    </FormFieldItem>
  );
}

function renderLookupPicker(node: ComponentNode, ctx: RenderContext): ReactNode {
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

function renderSubFormTable(node: ComponentNode, ctx: RenderContext): ReactNode {
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

function renderAttachmentUpload(node: ComponentNode, ctx: RenderContext): ReactNode {
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

function renderUserPicker(node: ComponentNode, ctx: RenderContext): ReactNode {
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

// ---------------------------------------------------------------------------
// 展示类渲染器
// ---------------------------------------------------------------------------

function renderButton(node: ComponentNode, ctx: RenderContext): ReactNode {
  const text = getPropAsString(node, 'text', ctx) || getPropAsString(node, 'label', ctx) || '按钮';
  const type = getPropAsString(node, 'type', ctx) || 'default';
  const danger = getPropAsBool(node, 'danger', ctx);
  return (
    <Button
      type={type as 'primary' | 'default' | 'dashed' | 'link' | 'text'}
      danger={danger || undefined}
      size="small"
      onClick={() => ctx.onAction(node.id, 'onClick')}
    >
      {text}
    </Button>
  );
}

function renderStatistic(node: ComponentNode, ctx: RenderContext): ReactNode {
  const title = getPropAsString(node, 'title', ctx) || '统计';
  const value = getPropAsNumber(node, 'value', ctx);
  const prefix = getPropAsString(node, 'prefix', ctx) || undefined;
  const suffix = getPropAsString(node, 'suffix', ctx) || undefined;
  return <Statistic title={title} value={value} prefix={prefix} suffix={suffix} />;
}

function renderChart(node: ComponentNode, ctx: RenderContext): ReactNode {
  const title = getPropAsString(node, 'title', ctx) || '图表';
  const chartType = (getPropAsString(node, 'chartType', ctx) || 'bar') as ChartType;
  const categoryField = getPropAsString(node, 'categoryField', ctx) || undefined;
  const valueField = getPropAsString(node, 'valueField', ctx) || undefined;
  const aggregation = (getPropAsString(node, 'aggregation', ctx) || 'sum') as ChartAggregation;

  // 编辑模式使用 mock 数据；预览模式解析绑定数据
  const data =
    ctx.mode === 'preview' ? resolvePropValue(node.props.data ?? null, { vm: ctx.vm }) : null;

  const option = buildChartOption(chartType, title, categoryField, valueField, aggregation, data);

  return (
    <div style={{ padding: 8, background: '#fff', borderRadius: 6, minHeight: 200 }}>
      <ReactECharts option={option} style={{ height: 200 }} />
    </div>
  );
}

function renderRichTextDisplay(node: ComponentNode, ctx: RenderContext): ReactNode {
  const content = getPropAsString(node, 'content', ctx);
  if (content) {
    return <div style={{ padding: 8 }} dangerouslySetInnerHTML={{ __html: content }} />;
  }
  return (
    <div
      style={{
        padding: 16,
        background: '#fafbfc',
        border: '1px dashed #eef0f4',
        borderRadius: 6,
        minHeight: 60,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <Text type="secondary" style={{ fontSize: 13 }}>
        富文本内容
      </Text>
    </div>
  );
}

function renderDivider(node: ComponentNode, ctx: RenderContext): ReactNode {
  const label = getPropAsString(node, 'label', ctx) || getPropAsString(node, 'text', ctx);
  const orientation = getPropAsString(node, 'orientation', ctx) || 'left';
  return (
    <Divider orientation={orientation as 'left' | 'center' | 'right'} style={{ margin: '8px 0' }}>
      {label || undefined}
    </Divider>
  );
}

function renderText(node: ComponentNode, ctx: RenderContext): ReactNode {
  const content = getPropAsString(node, 'content', ctx) || '文本内容';
  const level = getPropAsNumber(node, 'level', ctx);
  if (level >= 1 && level <= 5) {
    return <Title level={level as 1 | 2 | 3 | 4 | 5}>{content}</Title>;
  }
  return <Text>{content}</Text>;
}

// ---------------------------------------------------------------------------
// PreviewNode 组件
// ---------------------------------------------------------------------------

/** PreviewNode 属性。 */
export interface PreviewNodeProps {
  node: ComponentNode;
  ctx: RenderContext;
  renderChild: RenderChild;
  /** 自定义渲染器覆盖（如 runtime-ui 的 chart 数据集渲染）。 */
  renderers?: Record<ComponentType, RendererFn>;
}

/** 预览模式纯渲染：调用 RENDERERS[node.type]（或自定义覆盖）。 */
export function PreviewNode({ node, ctx, renderChild, renderers }: PreviewNodeProps): ReactNode {
  const registry = renderers ?? RENDERERS;
  return registry[node.type](node, ctx, renderChild);
}

// ---------------------------------------------------------------------------
// createRenderer 函数
// ---------------------------------------------------------------------------

/**
 * 创建渲染函数（不含递归 / 隐藏判定，仅查找 RENDERERS 并调用）。
 *
 * 用于需要直接调用渲染器（而非通过组件递归）的场景。
 */
export function createRenderer(
  renderers?: Record<ComponentType, RendererFn>,
): (node: ComponentNode, ctx: RenderContext, renderChild: RenderChild) => ReactNode {
  const registry = renderers ?? RENDERERS;
  return (node, ctx, renderChild) => registry[node.type](node, ctx, renderChild);
}

// ---------------------------------------------------------------------------
// createComponentRenderer 工厂
// ---------------------------------------------------------------------------

/** 共享渲染器属性。 */
export interface ComponentRendererSharedProps {
  node: ComponentNode;
  isRoot?: boolean;
  ctx: RenderContext;
}

/** 编辑模式包裹层属性（Studio 的 EditNode 实现）。 */
export interface WrapEditProps {
  node: ComponentNode;
  ctx: RenderContext;
  content: ReactNode;
  isRoot?: boolean;
}

/** createComponentRenderer 工厂选项。 */
export interface CreateComponentRendererOptions {
  /** 自定义渲染器覆盖（如 runtime-ui 的 chart 数据集渲染）。 */
  renderers?: Partial<Record<ComponentType, RendererFn>>;
  /** 编辑模式包裹层（studio 注入 EditNode）。 */
  wrapEdit?: (props: WrapEditProps) => ReactNode;
}

/**
 * 创建组件渲染器组件。
 *
 * - 预览模式：检查 shouldHide → 调用 RENDERERS → 返回内容
 * - 编辑模式：调用 RENDERERS → 通过 wrapEdit 包裹 EditNode → 返回
 * - 递归：renderChild 创建 <ComponentRendererShared> 子节点
 *
 * Studio 通过 wrapEdit 注入编辑模式包裹层；
 * Runtime-UI 通过 renderers 覆盖图表渲染器。
 */
export function createComponentRenderer(
  options?: CreateComponentRendererOptions,
): (props: ComponentRendererSharedProps) => ReactNode {
  const customRenderers = options?.renderers ? { ...RENDERERS, ...options.renderers } : RENDERERS;
  const wrapEdit = options?.wrapEdit;

  function ComponentRendererShared({ node, isRoot, ctx }: ComponentRendererSharedProps): ReactNode {
    // 预览模式：隐藏表达式求值为真则不渲染
    if (ctx.mode === 'preview' && shouldHide(node, ctx.vm)) {
      return null;
    }

    const renderChild: RenderChild = (child) => (
      <ComponentRendererShared key={child.id} node={child} ctx={ctx} />
    );

    const content = customRenderers[node.type](node, ctx, renderChild);

    if (ctx.mode === 'edit' && wrapEdit) {
      return wrapEdit({ node, ctx, content, isRoot });
    }
    return content;
  }

  return ComponentRendererShared;
}
