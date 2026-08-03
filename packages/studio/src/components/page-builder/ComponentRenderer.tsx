import { useEffect, useState } from 'react';
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
  Popconfirm,
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
import { CopyOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { useDroppable } from '@dnd-kit/core';
import dayjs from 'dayjs';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import { getComponentMeta } from '../../constants/pageComponents.js';
import type {
  ActionConfig,
  ComponentNode,
  ComponentType,
  PropValue,
  ViewModel,
} from '../../api/pages.js';
import type { Dayjs } from 'dayjs';
import { resolvePropValue, getByPath } from './expression-engine.js';
import { useRuntimeCtx, type RuntimeContext } from './RuntimeStore.js';

const { Text, Title } = Typography;

/** 表格行记录类型。 */
type TableRow = Record<string, unknown>;

/** 拖拽数据:画布放置区。 */
export interface DropzoneData {
  source: 'dropzone';
  parentId: string;
}

// ---------------------------------------------------------------------------
// 渲染上下文
// ---------------------------------------------------------------------------

/** 组件渲染上下文,传递模式 / 视图模型 / 选择 / 事件回调。 */
export interface RenderContext {
  mode: 'edit' | 'preview';
  viewModel: ViewModel;
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
  onAction: (nodeId: string, eventName: string) => void;
  /** 运行时上下文(预览模式数据/事件;编辑模式为 no-op)。 */
  runtime: RuntimeContext;
  /** 运行时 vm 值(预览模式;编辑模式为空对象)。 */
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

/** 在组件树中按 ID 查找节点(递归)。 */
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

/** 从事件属性值提取动作链(ActionConfig[] / ActionConfig / { __action })。 */
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

/** 预览模式判定节点是否隐藏(hidden 可为布尔或 { __bind })。 */
function shouldHide(node: ComponentNode, vm: Record<string, unknown>): boolean {
  const h = node.hidden;
  if (h === undefined || h === false) return false;
  if (h === true) return true;
  return !!resolvePropValue(h, { vm });
}

// ---------------------------------------------------------------------------
// 顶层:根据模式分流(编辑 / 预览)
// ---------------------------------------------------------------------------

interface ComponentRendererProps {
  node: ComponentNode;
  isRoot?: boolean;
}

/**
 * 组件节点递归渲染器。
 * - 编辑模式:包裹选中边框 + 悬停工具条 + 放置区
 * - 预览模式:纯渲染,无编辑 UI
 */
export default function ComponentRenderer({ node, isRoot }: ComponentRendererProps) {
  const mode = usePageBuilderStore((s) => s.mode);
  const schema = usePageBuilderStore((s) => s.schema);
  const selectedNodeId = usePageBuilderStore((s) => s.selectedNodeId);
  const selectNode = usePageBuilderStore((s) => s.selectNode);
  const runtime = useRuntimeCtx();

  const ctx: RenderContext = {
    mode,
    viewModel: schema?.viewModel ?? { variables: {} },
    selectedNodeId,
    onSelect: (id: string) => selectNode(id),
    onAction: (nodeId: string, eventName: string) => {
      if (mode !== 'preview') return;
      const schemaState = usePageBuilderStore.getState().schema;
      if (!schemaState) return;
      const target = findNodeById(schemaState.root, nodeId);
      if (!target) return;
      const actions = extractActions(target.props[eventName]);
      if (actions.length > 0) {
        void runtime.executeActions(actions);
      }
    },
    runtime,
    vm: mode === 'preview' ? runtime.vm : {},
  };

  // 预览模式:隐藏表达式求值为真则不渲染
  if (mode === 'preview' && shouldHide(node, runtime.vm)) {
    return null;
  }

  if (mode === 'preview') {
    return <PreviewNode node={node} isRoot={isRoot} ctx={ctx} />;
  }
  return <EditNode node={node} isRoot={isRoot} ctx={ctx} />;
}

// ---------------------------------------------------------------------------
// 编辑模式渲染
// ---------------------------------------------------------------------------

interface NodeProps {
  node: ComponentNode;
  isRoot?: boolean;
  ctx: RenderContext;
}

/** 编辑模式:节点包裹层(选中 + 悬停 + 内容)。 */
function EditNode({ node, isRoot, ctx }: NodeProps) {
  const selectNode = usePageBuilderStore((s) => s.selectNode);
  const removeComponent = usePageBuilderStore((s) => s.removeComponent);
  const duplicateNode = usePageBuilderStore((s) => s.duplicateNode);
  const [hovered, setHovered] = useState(false);

  const meta = getComponentMeta(node.type);
  const isSelected = ctx.selectedNodeId === node.id;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectNode(node.id);
  };

  // 边框样式:选中 > 悬停 > 默认
  let borderColor = 'transparent';
  let boxShadow = 'none';
  if (isSelected) {
    borderColor = '#1677ff';
    boxShadow = '0 0 0 2px rgba(22,119,255,0.1)';
  } else if (hovered) {
    borderColor = '#91caff';
  }

  const renderChild: RenderChild = (child) => (
    <ComponentRenderer key={child.id} node={child} />
  );

  const content = RENDERERS[node.type](node, ctx, renderChild);

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        border: `2px solid ${borderColor}`,
        borderRadius: 6,
        margin: isRoot ? 0 : '4px 0',
        boxShadow,
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {/* 悬停工具条(非根节点) */}
      {!isRoot && (hovered || isSelected) && (
        <div
          style={{
            position: 'absolute',
            top: -28,
            left: -2,
            height: 28,
            background: '#1677ff',
            borderRadius: '6px 6px 0 0',
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            zIndex: 10,
            whiteSpace: 'nowrap',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12 }}>
            {node.name || meta.label}
          </Text>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined style={{ color: '#fff', fontSize: 13 }} />}
            onClick={(e) => {
              e.stopPropagation();
              duplicateNode(node.id);
            }}
            style={{ minHeight: 20, padding: '0 4px' }}
          />
          <Popconfirm
            title="删除组件"
            description={`确定删除「${node.name || meta.label}」吗?`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={(e) => {
              e?.stopPropagation();
              removeComponent(node.id);
            }}
            onCancel={(e) => e?.stopPropagation()}
          >
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined style={{ color: '#fff', fontSize: 13 }} />}
              onClick={(e) => e.stopPropagation()}
              style={{ minHeight: 20, padding: '0 4px' }}
            />
          </Popconfirm>
        </div>
      )}

      {content}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 预览模式渲染(无编辑 UI,无 dnd-kit hooks)
// ---------------------------------------------------------------------------

/** 预览模式:纯渲染。 */
function PreviewNode({ node, ctx }: NodeProps) {
  const renderChild: RenderChild = (child) => (
    <ComponentRenderer key={child.id} node={child} />
  );
  return RENDERERS[node.type](node, ctx, renderChild);
}

// ---------------------------------------------------------------------------
// 可放置区域(编辑模式容器子节点区)
// ---------------------------------------------------------------------------

/** 容器子节点放置区:空状态提示 or 递归渲染子节点。 */
function DroppableArea({
  parentId,
  isEmpty,
  children,
}: {
  parentId: string;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `dropzone-${parentId}`,
    data: { source: 'dropzone', parentId } as DropzoneData,
  });

  if (isEmpty) {
    return (
      <div
        ref={setNodeRef}
        style={{
          minHeight: 80,
          border: `2px dashed ${isOver ? '#1677ff' : '#d9d9d9'}`,
          borderRadius: 6,
          background: isOver ? '#e6f4ff' : '#fafbfc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease',
        }}
      >
        <Text type="secondary" style={{ fontSize: 13 }}>
          拖拽组件到此处
        </Text>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver ? '#e6f4ff' : 'transparent',
        borderRadius: 4,
        transition: 'background 0.15s ease',
        minHeight: 40,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 属性读取辅助
// ---------------------------------------------------------------------------

/** 读取属性原始值(编辑模式)或解析后值(预览模式解析绑定/表达式)。 */
function getProp(node: ComponentNode, key: string, ctx?: RenderContext): unknown {
  const raw = node.props[key] ?? null;
  if (ctx && ctx.mode === 'preview') {
    return resolvePropValue(raw, { vm: ctx.vm });
  }
  return raw;
}

/** 安全获取字符串属性值(预览模式解析绑定/表达式)。 */
function getPropAsString(node: ComponentNode, key: string, ctx?: RenderContext): string {
  const v = getProp(node, key, ctx);
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

/** 安全获取数字属性值(预览模式解析绑定/表达式)。 */
function getPropAsNumber(node: ComponentNode, key: string, ctx?: RenderContext): number {
  const v = getProp(node, key, ctx);
  return typeof v === 'number' ? v : 0;
}

/** 安全获取布尔属性值(预览模式解析绑定/表达式)。 */
function getPropAsBool(node: ComponentNode, key: string, ctx?: RenderContext): boolean {
  const v = getProp(node, key, ctx);
  return typeof v === 'boolean' ? v : false;
}

/** 从 value 属性推断写回路径(优先 __bind,回退 vm.record.<apiName>)。 */
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

/** 表单字段双向绑定:读取 value + 构造 onChange 写回 vm。 */
function getFieldBinding(node: ComponentNode, ctx: RenderContext): {
  isPreview: boolean;
  value: unknown;
  setValue: (v: unknown) => void;
} {
  const isPreview = ctx.mode === 'preview';
  const bindPath = isPreview ? getFieldBindPath(node) : null;
  const value = isPreview
    ? (bindPath ? getByPath(ctx.vm, bindPath.startsWith('vm.') ? bindPath.slice(3) : bindPath) : getProp(node, 'value', ctx))
    : undefined;
  const setValue = (v: unknown) => {
    if (bindPath) ctx.runtime.setVariable(bindPath, v);
  };
  return { isPreview, value, setValue };
}

/** 将 PropValue 对象提取为 Record。 */
function asPropObject(value: PropValue | undefined): Record<string, PropValue> | null {
  if (value && typeof value === 'object' && !Array.isArray(value) && !('__bind' in value) && !('__expr' in value) && !('__action' in value)) {
    return value as Record<string, PropValue>;
  }
  return null;
}

/** 从 columns prop 提取 AntD 表格列配置。 */
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

/** 从 fields prop 提取详情卡片字段配置(预览模式从 record 取值)。 */
function extractDetailFields(
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
    let child: React.ReactNode = '—';
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
function extractSelectOptions(node: ComponentNode): { label: string; value: string }[] {
  const raw = node.props.options;
  if (!Array.isArray(raw)) return [];
  return raw.map((opt) => {
    const obj = asPropObject(opt);
    if (!obj) return { label: '', value: '' };
    const label = typeof obj.label === 'string' ? obj.label : '';
    const value =
      typeof obj.value === 'string'
        ? obj.value
        : typeof obj.id === 'string'
          ? obj.id
          : '';
    return { label, value };
  });
}

/** 渲染容器子节点(编辑模式包裹放置区)。 */
function renderContainerChildren(
  node: ComponentNode,
  ctx: RenderContext,
  renderChild: RenderChild,
): React.ReactNode {
  const children = node.children ?? [];
  if (ctx.mode === 'edit') {
    return (
      <DroppableArea parentId={node.id} isEmpty={children.length === 0}>
        {children.map(renderChild)}
      </DroppableArea>
    );
  }
  return <>{children.map(renderChild)}</>;
}

// ---------------------------------------------------------------------------
// 表单字段包裹(Form.Item + 标签 + 必填)
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
    <Form.Item
      label={label || undefined}
      required={required}
      style={{ marginBottom: 16 }}
    >
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

function renderPage(node: ComponentNode, ctx: RenderContext, renderChild: RenderChild): React.ReactNode {
  // 预览模式触发 onLoad 事件动作(页面加载完成)
  useEffect(() => {
    if (ctx.mode === 'preview') ctx.onAction(node.id, 'onLoad');
  }, [ctx, node.id]);
  return (
    <div style={{ minHeight: 60, padding: 8 }}>
      {renderContainerChildren(node, ctx, renderChild)}
    </div>
  );
}

function renderSection(node: ComponentNode, ctx: RenderContext, renderChild: RenderChild): React.ReactNode {
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

function renderTabs(node: ComponentNode, ctx: RenderContext, renderChild: RenderChild): React.ReactNode {
  const children = node.children ?? [];
  const items = children.map((child, i) => ({
    key: child.id,
    label: getPropAsString(child, 'title', ctx) || child.name || `标签 ${i + 1}`,
    children: renderChild(child),
  }));
  const tabs = <Tabs items={items} size="small" />;
  if (ctx.mode === 'edit' && children.length === 0) {
    return (
      <DroppableArea parentId={node.id} isEmpty>
        {tabs}
      </DroppableArea>
    );
  }
  return tabs;
}

function renderGrid(node: ComponentNode, ctx: RenderContext, renderChild: RenderChild): React.ReactNode {
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
  if (ctx.mode === 'edit') {
    return (
      <DroppableArea parentId={node.id} isEmpty={children.length === 0}>
        {row}
      </DroppableArea>
    );
  }
  return row;
}

function renderGridColumn(node: ComponentNode, ctx: RenderContext, renderChild: RenderChild): React.ReactNode {
  return renderContainerChildren(node, ctx, renderChild);
}

// ---------------------------------------------------------------------------
// 数据类渲染器
// ---------------------------------------------------------------------------

function renderDataTable(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const columns = extractTableColumns(node);
  const pagination = getPropAsBool(node, 'pagination', ctx);
  const pageSize = getPropAsNumber(node, 'pageSize', ctx) || 20;

  let dataSource: TableRow[] = [];
  if (ctx.mode === 'preview') {
    const data = resolvePropValue(node.props.data ?? null, { vm: ctx.vm });
    if (Array.isArray(data)) {
      dataSource = data as TableRow[];
    } else if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).records)) {
      dataSource = (data as Record<string, unknown>).records as TableRow[];
    }
  }

  return (
    <Table<TableRow>
      size="small"
      columns={columns}
      dataSource={dataSource}
      rowKey="id"
      pagination={
        pagination ? { pageSize, showSizeChanger: false } : false
      }
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

function renderDetailCard(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const record =
    ctx.mode === 'preview'
      ? (resolvePropValue(node.props.record ?? null, { vm: ctx.vm }) as Record<string, unknown> | undefined)
      : undefined;
  const items = extractDetailFields(node, record ?? {}, ctx);
  const columns = getPropAsNumber(node, 'columns', ctx) || 2;
  return (
    <Descriptions
      size="small"
      column={columns}
      bordered
      items={items}
    />
  );
}

function renderList(node: ComponentNode, ctx: RenderContext): React.ReactNode {
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

function renderForm(node: ComponentNode, ctx: RenderContext, renderChild: RenderChild): React.ReactNode {
  const layout = getPropAsString(node, 'layout') || 'vertical';
  return (
    <Form layout={layout as 'vertical' | 'horizontal'} component={false}>
      {renderContainerChildren(node, ctx, renderChild)}
    </Form>
  );
}

function renderTextInput(node: ComponentNode, ctx: RenderContext): React.ReactNode {
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

function renderTextArea(node: ComponentNode, ctx: RenderContext): React.ReactNode {
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

function renderNumberInput(node: ComponentNode, ctx: RenderContext): React.ReactNode {
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

function renderSelect(node: ComponentNode, ctx: RenderContext): React.ReactNode {
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

function renderMultiSelect(node: ComponentNode, ctx: RenderContext): React.ReactNode {
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

function renderDatePicker(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '请选择日期';
  const showTime = getPropAsBool(node, 'showTime', ctx);
  const format = getPropAsString(node, 'format', ctx) || undefined;
  const { isPreview, value, setValue } = getFieldBinding(node, ctx);
  const dayjsVal =
    isPreview && value ? dayjs(value as string | number | Date) : undefined;
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

function renderCheckbox(node: ComponentNode, ctx: RenderContext): React.ReactNode {
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

function renderSwitch(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const label = getPropAsString(node, 'label', ctx);
  const { isPreview, value, setValue } = getFieldBinding(node, ctx);
  return (
    <FormFieldItem node={node} ctx={ctx}>
      <Switch
        checked={isPreview ? !!value : undefined}
        onChange={(checked) => setValue(checked)}
      />
      {label ? <Text style={{ marginLeft: 8, fontSize: 13 }}>{label}</Text> : null}
    </FormFieldItem>
  );
}

function renderLookupPicker(node: ComponentNode, ctx: RenderContext): React.ReactNode {
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

function renderSubFormTable(node: ComponentNode, ctx: RenderContext): React.ReactNode {
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

function renderButton(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const text =
    getPropAsString(node, 'text', ctx) || getPropAsString(node, 'label', ctx) || '按钮';
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

function renderChart(node: ComponentNode, ctx: RenderContext): React.ReactNode {
  const title = getPropAsString(node, 'title', ctx) || '图表';
  const meta = getComponentMeta(node.type);
  const Icon = meta.icon;
  return (
    <div
      style={{
        padding: 24,
        background: '#fafbfc',
        border: '1px dashed #eef0f4',
        borderRadius: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 120,
        gap: 8,
      }}
    >
      <Icon style={{ fontSize: 32, color: '#bfbfbf' }} />
      <Text type="secondary" style={{ fontSize: 13 }}>
        {title}(图表引擎后续迭代)
      </Text>
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
