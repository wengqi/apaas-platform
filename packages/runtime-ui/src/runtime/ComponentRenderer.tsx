/**
 * 运行时组件渲染器 — 从 Studio ComponentRenderer 精简移植。
 *
 * 仅保留 preview 模式渲染逻辑，移除编辑模式的 dnd-kit / 选择边框 / 悬浮工具栏。
 * 递归解析组件树 + 解析表达式 + 表单双向绑定 + 数据展示。
 */

import { useEffect } from 'react';
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
import type {
  ActionConfig,
  ComponentNode,
  ComponentType,
  PropValue,
  ViewModel,
} from '../api/pages.js';
import type { Dayjs } from 'dayjs';
import { resolvePropValue, getByPath } from '@apaas/shared/stores';
import { buildChartOption } from '@apaas/shared/page';
import type { ChartType, ChartAggregation } from '@apaas/shared';
import { useQuery } from '@tanstack/react-query';
import { datasetsApi } from '../api/datasets.js';
import { useRuntimeCtx, type RuntimeState } from './RuntimeStore.js';
import ReactECharts from 'echarts-for-react';

const { Text, Title } = Typography;

/** 表格行记录类型。 */
type TableRow = Record<string, unknown>;

// ---------------------------------------------------------------------------
// 渲染上下文
// ---------------------------------------------------------------------------

/** 组件渲染上下文（运行时仅 preview 模式）。 */
export interface RenderContext {
  viewModel: ViewModel;
  /** 事件回调：节点事件 → 提取动作链 → 执行。 */
  onAction: (nodeId: string, eventName: string) => void;
  /** 运行时上下文（数据/事件）。 */
  runtime: RuntimeState;
  /** 运行时 vm 值。 */
  vm: Record<string, unknown>;
}

/** 子节点渲染回调。 */
type RenderChild = (child: ComponentNode) => React.ReactNode;

/** 组件渲染函数签名。 */
type RendererFn = (
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
) => React.ReactNode;

// ---------------------------------------------------------------------------
// 节点查找 / 事件动作提取 / 隐藏判定
// ---------------------------------------------------------------------------

/** 在组件树中按 ID 查找节点（递归）。 */
function findNodeById(root: ComponentNode, id: string): ComponentNode | undefined {
  if (root.id === id) return root;
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** 从事件属性值提取动作链。 */
function extractActions(prop: PropValue | undefined): ActionConfig[] {
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

/** 判定节点是否隐藏。 */
function shouldHide(node: ComponentNode, vm: Record<string, unknown>): boolean {
  const h = node.hidden;
  if (h === undefined || h === false) return false;
  if (h === true) return true;
  return !!resolvePropValue(h, { vm });
}

// ---------------------------------------------------------------------------
// 顶层渲染入口
// ---------------------------------------------------------------------------

interface ComponentRendererProps {
  node: ComponentNode;
  root: ComponentNode;
  isRoot?: boolean;
}

/** 组件节点递归渲染器（运行时）。 */
export default function ComponentRenderer({ node, root, isRoot: _isRoot }: ComponentRendererProps) {
  const vm = useRuntimeCtx((s) => s.vm);
  const setVariable = useRuntimeCtx((s) => s.setVariable);
  const executeActions = useRuntimeCtx((s) => s.executeActions);

  const runtime: RuntimeState = {
    vm,
    setVariable,
    executeActions,
    queryData: useRuntimeCtx((s) => s.queryData),
    executeAction: useRuntimeCtx((s) => s.executeAction),
  };

  const ctx: RenderContext = {
    viewModel: { variables: {} },
    onAction: (nodeId: string, eventName: string) => {
      const target = findNodeById(root, nodeId);
      if (!target) {
        console.warn(`[onAction] Node ${nodeId} not found in root`);
        return;
      }
      const propValue = target.props[eventName];
      const actions = extractActions(propValue);
      if (actions.length > 0) {
        void executeActions(actions);
      } else {
        console.warn(
          `[onAction] No actions found for event ${eventName} on node ${nodeId}`,
          propValue,
        );
      }
    },
    runtime,
    vm,
  };

  if (shouldHide(node, vm)) {
    return null;
  }

  return <PreviewNode node={node} ctx={ctx} />;
}

/** 预览模式纯渲染。 */
function PreviewNode({ node, ctx }: { node: ComponentNode; ctx: RenderContext }) {
  const renderChild: RenderChild = (child) => (
    <ComponentRenderer key={child.id} node={child} root={child} />
  );
  return RENDERERS[node.type](node, ctx, renderChild);
}

// ---------------------------------------------------------------------------
// 属性读取辅助
// ---------------------------------------------------------------------------

function getProp(node: ComponentNode, key: string, ctx: RenderContext): unknown {
  const raw = node.props[key] ?? null;
  return resolvePropValue(raw, { vm: ctx.vm });
}

function getPropAsString(node: ComponentNode, key: string, ctx: RenderContext): string {
  const v = getProp(node, key, ctx);
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function getPropAsNumber(node: ComponentNode, key: string, ctx: RenderContext): number {
  const v = getProp(node, key, ctx);
  return typeof v === 'number' ? v : 0;
}

function getPropAsBool(node: ComponentNode, key: string, ctx: RenderContext): boolean {
  const v = getProp(node, key, ctx);
  return typeof v === 'boolean' ? v : false;
}

function getFieldBindPath(node: ComponentNode): string | null {
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

function getFieldBinding(
  node: ComponentNode,
  ctx: RenderContext,
): {
  value: unknown;
  setValue: (v: unknown) => void;
} {
  const bindPath = getFieldBindPath(node);
  // 如果有绑定路径，从 VM 中读取当前值；否则从 props 读取
  const value = bindPath
    ? getByPath(ctx.vm, bindPath.startsWith('vm.') ? bindPath.slice(3) : bindPath)
    : getProp(node, 'value', ctx);
  const setValue = (v: unknown) => {
    if (bindPath) ctx.runtime.setVariable(bindPath, v);
  };
  return { value, setValue };
}

function asPropObject(value: PropValue | undefined): Record<string, PropValue> | null {
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

function extractTableColumns(node: ComponentNode): TableProps<TableRow>['columns'] {
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

function extractDetailFields(
  node: ComponentNode,
  record: Record<string, unknown>,
  _ctx: RenderContext,
): DescriptionsProps['items'] {
  const raw = node.props.fields;
  if (!Array.isArray(raw)) return [];
  return raw.map((field, i) => {
    const obj = asPropObject(field);
    const label = obj && typeof obj.label === 'string' ? obj.label : `字段${i + 1}`;
    const key = obj && typeof obj.fieldId === 'string' ? obj.fieldId : String(i);
    let child: React.ReactNode = '—';
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
    return { key, label, children: child };
  });
}

function extractSelectOptions(node: ComponentNode): { label: string; value: string }[] {
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
// 表单字段包裹
// ---------------------------------------------------------------------------

function FormFieldItem({
  node,
  ctx,
  children,
}: {
  node: ComponentNode;
  ctx: RenderContext;
  children: React.ReactNode;
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
// 组件渲染器注册表
// ---------------------------------------------------------------------------

const RENDERERS: Record<ComponentType, RendererFn> = {
  page: renderPage,
  section: renderSection,
  tabs: renderTabs,
  grid: renderGrid,
  grid_column: renderGridColumn,
  data_table: renderDataTable,
  detail_card: renderDetailCard,
  list: renderList,
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

function renderPage(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): React.ReactNode {
  return (
    <div style={{ minHeight: 60, padding: 8 }}>
      <PageLoadEffect node={node} ctx={ctx} />
      {(node.children ?? []).map(renderChild)}
    </div>
  );
}

/** 页面加载副作用 — 提取为独立组件以满足 React Hooks 规则。 */
function PageLoadEffect({ node, ctx }: { node: ComponentNode; ctx: RenderContext }) {
  useEffect(() => {
    ctx.onAction(node.id, 'onLoad');
  }, [ctx, node.id]);
  return null;
}

function renderSection(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): React.ReactNode {
  const title = getPropAsString(node, 'title', ctx);
  return (
    <Card size="small" title={title || undefined} styles={{ body: { padding: 12 } }}>
      {(node.children ?? []).map(renderChild)}
    </Card>
  );
}

function renderTabs(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): React.ReactNode {
  const children = node.children ?? [];
  const items = children.map((child, i) => ({
    key: child.id,
    label: getPropAsString(child, 'title', ctx) || child.name || `标签 ${i + 1}`,
    children: renderChild(child),
  }));
  return <Tabs items={items} size="small" />;
}

function renderGrid(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): React.ReactNode {
  const gutter = getPropAsNumber(node, 'gutter', ctx) || 8;
  const children = node.children ?? [];
  return (
    <Row gutter={gutter}>
      {children.map((child) => {
        const span = getPropAsNumber(child, 'span', ctx) || 12;
        return (
          <Col key={child.id} span={span}>
            {renderChild(child)}
          </Col>
        );
      })}
    </Row>
  );
}

function renderGridColumn(
  node: ComponentNode,
  _ctx: RenderContext,
  renderChild: RenderChild,
): React.ReactNode {
  return <>{(node.children ?? []).map(renderChild)}</>;
}

// ---------------------------------------------------------------------------
// 数据类渲染器
// ---------------------------------------------------------------------------

function renderDataTable(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const columns = extractTableColumns(node);
  const pagination = getPropAsBool(node, 'pagination', ctx);
  const pageSize = getPropAsNumber(node, 'pageSize', ctx) || 20;

  let dataSource: TableRow[] = [];
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

  return (
    <Table<TableRow>
      size="small"
      columns={columns}
      dataSource={dataSource}
      rowKey="id"
      pagination={pagination ? { pageSize, showSizeChanger: false } : false}
      locale={{ emptyText: '暂无数据' }}
      onRow={(record) =>
        ({
          onClick: () => ctx.onAction(node.id, 'onRowClick'),
          ...record,
        }) as never
      }
    />
  );
}

function renderDetailCard(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const record =
    (resolvePropValue(node.props.record ?? null, { vm: ctx.vm }) as
      Record<string, unknown> | undefined) ?? {};
  const items = extractDetailFields(node, record, ctx);
  const columns = getPropAsNumber(node, 'columns', ctx) || 2;
  return <Descriptions size="small" column={columns} bordered items={items} />;
}

function renderList(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  let data: unknown[] = [];
  const v = resolvePropValue(node.props.data ?? null, { vm: ctx.vm });
  if (Array.isArray(v)) data = v;
  else if (v && typeof v === 'object' && Array.isArray((v as Record<string, unknown>).records))
    data = (v as Record<string, unknown>).records as unknown[];
  return (
    <List
      size="small"
      dataSource={data as TableRow[]}
      renderItem={(item) => {
        if (item && typeof item === 'object') {
          const r = item as Record<string, unknown>;
          return <List.Item>{String(r.name ?? r.id ?? JSON.stringify(r))}</List.Item>;
        }
        return <List.Item>{String(item)}</List.Item>;
      }}
      locale={{ emptyText: '暂无数据' }}
    />
  );
}

// ---------------------------------------------------------------------------
// 表单类渲染器
// ---------------------------------------------------------------------------

function renderForm(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): React.ReactNode {
  const layout = getPropAsString(node, 'layout', ctx) || 'vertical';
  return (
    <Form layout={layout as 'vertical' | 'horizontal'} component={false}>
      {(node.children ?? []).map(renderChild)}
    </Form>
  );
}

function renderTextInput(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请输入';
  const maxLength = getPropAsNumber(node, 'maxLength', ctx) || undefined;
  const { value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Input
        placeholder={placeholder}
        maxLength={maxLength || undefined}
        size="small"
        value={(value as string) || ''}
        onChange={(e) => setValue(e.target.value)}
      />
    </FormFieldItem>
  );
}

function renderTextArea(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请输入';
  const rows = getPropAsNumber(node, 'rows', ctx) || 4;
  const showCount = getPropAsBool(node, 'showCount', ctx);
  const { value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Input.TextArea
        placeholder={placeholder}
        rows={rows}
        showCount={showCount}
        size="small"
        value={(value as string) || ''}
        onChange={(e) => setValue(e.target.value)}
      />
    </FormFieldItem>
  );
}

function renderNumberInput(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请输入数字';
  const precision = getPropAsNumber(node, 'precision', ctx) || undefined;
  const min = getPropAsNumber(node, 'min', ctx) || undefined;
  const max = getPropAsNumber(node, 'max', ctx) || undefined;
  const step = getPropAsNumber(node, 'step', ctx) || undefined;
  const { value, setValue } = getFieldBinding(node, ctx);
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
        value={value as number}
        onChange={(v) => setValue(v)}
      />
    </FormFieldItem>
  );
}

function renderSelect(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请选择';
  const options = extractSelectOptions(node);
  const allowClear = getPropAsBool(node, 'allowClear', ctx);
  const { value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Select
        placeholder={placeholder}
        options={options}
        allowClear={allowClear}
        size="small"
        style={{ width: '100%' }}
        value={value as string}
        onChange={(v) => setValue(v)}
      />
    </FormFieldItem>
  );
}

function renderMultiSelect(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请选择';
  const options = extractSelectOptions(node);
  const allowClear = getPropAsBool(node, 'allowClear', ctx);
  const { value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Select
        mode="multiple"
        placeholder={placeholder}
        options={options}
        allowClear={allowClear}
        size="small"
        style={{ width: '100%' }}
        value={value as string[]}
        onChange={(v) => setValue(v)}
      />
    </FormFieldItem>
  );
}

function renderDatePicker(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请选择日期';
  const showTime = getPropAsBool(node, 'showTime', ctx);
  const format = getPropAsString(node, 'format', ctx) || undefined;
  const { value, setValue } = getFieldBinding(node, ctx);
  const dayjsVal = value ? dayjs(value as string | number | Date) : undefined;
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

function renderRadio(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const options = extractSelectOptions(node);
  const radioOptions = options.map((o) => ({ label: o.label, value: o.value }));
  const { value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Radio.Group
        options={radioOptions}
        size="small"
        value={value as string}
        onChange={(e) => setValue(e.target.value)}
      />
    </FormFieldItem>
  );
}

function renderCheckbox(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const label = getPropAsString(node, 'label', ctx) || node.name || '复选框';
  const { value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Checkbox checked={!!value} onChange={(e) => setValue(e.target.checked)}>
        {label}
      </Checkbox>
    </FormFieldItem>
  );
}

function renderSwitch(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const label = getPropAsString(node, 'label', ctx);
  const { value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Switch checked={!!value} onChange={(checked) => setValue(checked)} />
      {label ? <Text style={{ marginLeft: 8, fontSize: 13 }}>{label}</Text> : null}
    </FormFieldItem>
  );
}

function renderLookupPicker(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请选择关联记录';
  const multiple = getPropAsBool(node, 'multiple', ctx);
  const { value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Select
        mode={multiple ? 'multiple' : undefined}
        placeholder={placeholder}
        showSearch
        size="small"
        style={{ width: '100%' }}
        value={value as string | string[]}
        onChange={(v) => setValue(v)}
        notFoundContent="无匹配数据"
      />
    </FormFieldItem>
  );
}

function renderSubFormTable(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const columns = extractTableColumns(node);
  let dataSource: TableRow[] = [];
  const data = resolvePropValue(node.props.data ?? null, { vm: ctx.vm });
  if (Array.isArray(data)) dataSource = data as TableRow[];
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

function renderAttachmentUpload(node: ComponentNode, ctx: RenderContext): React.ReactNode {
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

function renderUserPicker(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请选择人员';
  const multiple = getPropAsBool(node, 'multiple', ctx);
  const { value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Select
        mode={multiple ? 'multiple' : undefined}
        placeholder={placeholder}
        showSearch
        size="small"
        style={{ width: '100%' }}
        value={value as string | string[]}
        onChange={(v) => setValue(v)}
        notFoundContent="无匹配人员"
      />
    </FormFieldItem>
  );
}

// ---------------------------------------------------------------------------
// 展示类渲染器
// ---------------------------------------------------------------------------

function renderButton(node: ComponentNode, ctx: RenderContext): React.ReactNode {
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

function renderStatistic(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const title = getPropAsString(node, 'title', ctx) || '统计';
  const value = getPropAsNumber(node, 'value', ctx);
  const prefix = getPropAsString(node, 'prefix', ctx) || undefined;
  const suffix = getPropAsString(node, 'suffix', ctx) || undefined;
  return <Statistic title={title} value={value} prefix={prefix} suffix={suffix} />;
}

/**
 * 图表渲染 — 基于 ECharts。
 *
 * 支持两种数据源：
 * 1. 数据集（datasourceType=dataset）：从 datasetsApi.queryRows 加载
 * 2. ViewModel 绑定（默认）：从 resolvePropValue 解析绑定数据
 */
function renderChart(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const title = getPropAsString(node, 'title', ctx) || '图表';
  const chartType = (getPropAsString(node, 'chartType', ctx) || 'bar') as ChartType;
  const categoryField = getPropAsString(node, 'categoryField', ctx) || undefined;
  const valueField = getPropAsString(node, 'valueField', ctx) || undefined;
  const aggregation = (getPropAsString(node, 'aggregation', ctx) || 'sum') as ChartAggregation;
  const datasourceType = getPropAsString(node, 'datasourceType', ctx);
  const datasourceId = getPropAsString(node, 'datasourceId', ctx);

  if (datasourceType === 'dataset' && datasourceId) {
    return (
      <DatasetChart
        datasetId={datasourceId}
        chartType={chartType}
        title={title}
        categoryField={categoryField}
        valueField={valueField}
        aggregation={aggregation}
      />
    );
  }

  // 默认：从 ViewModel 绑定解析数据
  const data = resolvePropValue(node.props.data ?? null, { vm: ctx.vm });
  const option = buildChartOption(chartType, title, categoryField, valueField, aggregation, data);

  return (
    <div style={{ padding: 8, background: '#fff', borderRadius: 6, minHeight: 200 }}>
      <ReactECharts option={option} style={{ height: 200 }} />
    </div>
  );
}

/**
 * 数据集图表 — 从数据集 API 加载数据并渲染 ECharts。
 */
function DatasetChart({
  datasetId,
  chartType,
  title,
  categoryField,
  valueField,
  aggregation,
}: {
  datasetId: string;
  chartType: ChartType;
  title: string;
  categoryField?: string;
  valueField?: string;
  aggregation: ChartAggregation;
}) {
  const { data: result, isLoading } = useQuery({
    queryKey: ['dataset-rows', datasetId],
    queryFn: () => datasetsApi.queryRows(datasetId, { page: 1, pageSize: 100 }),
  });

  if (isLoading) {
    return (
      <div
        style={{
          padding: 24,
          background: '#fff',
          borderRadius: 6,
          minHeight: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text type="secondary">加载中...</Text>
      </div>
    );
  }

  const rows = result?.items ?? [];
  const option = buildChartOption(chartType, title, categoryField, valueField, aggregation, rows);

  return (
    <div style={{ padding: 8, background: '#fff', borderRadius: 6, minHeight: 200 }}>
      <ReactECharts option={option} style={{ height: 200 }} />
    </div>
  );
}

function renderRichTextDisplay(node: ComponentNode, ctx: RenderContext): React.ReactNode {
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

function renderDivider(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const label = getPropAsString(node, 'label', ctx) || getPropAsString(node, 'text', ctx);
  const orientation = getPropAsString(node, 'orientation', ctx) || 'left';
  return (
    <Divider orientation={orientation as 'left' | 'center' | 'right'} style={{ margin: '8px 0' }}>
      {label || undefined}
    </Divider>
  );
}

function renderText(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const content = getPropAsString(node, 'content', ctx) || '文本内容';
  const level = getPropAsNumber(node, 'level', ctx);
  if (level >= 1 && level <= 5) {
    return <Title level={level as 1 | 2 | 3 | 4 | 5}>{content}</Title>;
  }
  return <Text>{content}</Text>;
}
