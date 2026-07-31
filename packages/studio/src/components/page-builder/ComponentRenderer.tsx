import { useState } from 'react';
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
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import { getComponentMeta } from '../../constants/pageComponents.js';
import type {
  ComponentNode,
  ComponentType,
  PropValue,
  ViewModel,
} from '../../api/pages.js';

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

  const ctx: RenderContext = {
    mode,
    viewModel: schema?.viewModel ?? { variables: {} },
    selectedNodeId,
    onSelect: (id: string) => selectNode(id),
    onAction: () => {
      /* 搭建态不执行事件动作 */
    },
  };

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

/** 安全获取字符串属性值。 */
function getPropAsString(node: ComponentNode, key: string): string {
  const value = node.props[key];
  if (typeof value === 'string') return value;
  return '';
}

/** 安全获取数字属性值。 */
function getPropAsNumber(node: ComponentNode, key: string): number {
  const value = node.props[key];
  if (typeof value === 'number') return value;
  return 0;
}

/** 安全获取布尔属性值。 */
function getPropAsBool(node: ComponentNode, key: string): boolean {
  const value = node.props[key];
  if (typeof value === 'boolean') return value;
  return false;
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

/** 从 fields prop 提取详情卡片字段配置。 */
function extractDetailFields(node: ComponentNode): DescriptionsProps['items'] {
  const raw = node.props.fields;
  if (!Array.isArray(raw)) return [];
  return raw.map((field, i) => {
    const obj = asPropObject(field);
    const label = obj && typeof obj.label === 'string' ? obj.label : `字段${i + 1}`;
    const key = obj && typeof obj.fieldId === 'string' ? obj.fieldId : String(i);
    return { key, label, children: '—' as React.ReactNode };
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
  children,
}: {
  node: ComponentNode;
  children: React.ReactNode;
}) {
  const label = getPropAsString(node, 'label') || node.name || '';
  const required = getPropAsBool(node, 'required');
  const disabled = getPropAsBool(node, 'disabled') || getPropAsBool(node, 'readonly');
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
  return (
    <div style={{ minHeight: 60, padding: 8 }}>
      {renderContainerChildren(node, ctx, renderChild)}
    </div>
  );
}

function renderSection(node: ComponentNode, ctx: RenderContext, renderChild: RenderChild): React.ReactNode {
  const title = getPropAsString(node, 'title');
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
    label: getPropAsString(child, 'title') || child.name || `标签 ${i + 1}`,
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
  const gutter = getPropAsNumber(node, 'gutter') || 8;
  const children = node.children ?? [];
  const cols = children.map((child) => {
    const span = getPropAsNumber(child, 'span') || 12;
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

function renderDataTable(node: ComponentNode): React.ReactNode {
  const columns = extractTableColumns(node);
  const pagination = getPropAsBool(node, 'pagination');
  const pageSize = getPropAsNumber(node, 'pageSize') || 20;
  return (
    <Table<TableRow>
      size="small"
      columns={columns}
      dataSource={[]}
      rowKey="__rowKey"
      pagination={
        pagination ? { pageSize, showSizeChanger: false } : false
      }
      locale={{ emptyText: '暂无数据(编辑模式不加载)' }}
    />
  );
}

function renderDetailCard(node: ComponentNode): React.ReactNode {
  const items = extractDetailFields(node);
  const columns = getPropAsNumber(node, 'columns') || 2;
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
  const placeholderData = ctx.mode === 'edit' ? [1, 2, 3] : [];
  return (
    <List
      size="small"
      dataSource={placeholderData}
      renderItem={(item) => <List.Item>列表项 {item}</List.Item>}
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

function renderTextInput(node: ComponentNode): React.ReactNode {
  const placeholder = getPropAsString(node, 'placeholder') || '请输入';
  const maxLength = getPropAsNumber(node, 'maxLength') || undefined;
  return (
    <FormFieldItem node={node}>
      <Input placeholder={placeholder} maxLength={maxLength || undefined} size="small" />
    </FormFieldItem>
  );
}

function renderTextArea(node: ComponentNode): React.ReactNode {
  const placeholder = getPropAsString(node, 'placeholder') || '请输入';
  const rows = getPropAsNumber(node, 'rows') || 4;
  const showCount = getPropAsBool(node, 'showCount');
  return (
    <FormFieldItem node={node}>
      <Input.TextArea
        placeholder={placeholder}
        rows={rows}
        showCount={showCount}
        size="small"
      />
    </FormFieldItem>
  );
}

function renderNumberInput(node: ComponentNode): React.ReactNode {
  const placeholder = getPropAsString(node, 'placeholder') || '请输入数字';
  const precision = getPropAsNumber(node, 'precision') || undefined;
  const min = getPropAsNumber(node, 'min') || undefined;
  const max = getPropAsNumber(node, 'max') || undefined;
  const step = getPropAsNumber(node, 'step') || undefined;
  return (
    <FormFieldItem node={node}>
      <InputNumber
        placeholder={placeholder}
        precision={precision || undefined}
        min={min || undefined}
        max={max || undefined}
        step={step || undefined}
        size="small"
        style={{ width: '100%' }}
      />
    </FormFieldItem>
  );
}

function renderSelect(node: ComponentNode): React.ReactNode {
  const placeholder = getPropAsString(node, 'placeholder') || '请选择';
  const options = extractSelectOptions(node);
  const allowClear = getPropAsBool(node, 'allowClear');
  return (
    <FormFieldItem node={node}>
      <Select
        placeholder={placeholder}
        options={options}
        allowClear={allowClear}
        size="small"
        style={{ width: '100%' }}
      />
    </FormFieldItem>
  );
}

function renderMultiSelect(node: ComponentNode): React.ReactNode {
  const placeholder = getPropAsString(node, 'placeholder') || '请选择';
  const options = extractSelectOptions(node);
  const allowClear = getPropAsBool(node, 'allowClear');
  return (
    <FormFieldItem node={node}>
      <Select
        mode="multiple"
        placeholder={placeholder}
        options={options}
        allowClear={allowClear}
        size="small"
        style={{ width: '100%' }}
      />
    </FormFieldItem>
  );
}

function renderDatePicker(node: ComponentNode): React.ReactNode {
  const placeholder = getPropAsString(node, 'placeholder') || '请选择日期';
  const showTime = getPropAsBool(node, 'showTime');
  const format = getPropAsString(node, 'format') || undefined;
  return (
    <FormFieldItem node={node}>
      <DatePicker
        placeholder={placeholder}
        showTime={showTime || undefined}
        format={format}
        size="small"
        style={{ width: '100%' }}
      />
    </FormFieldItem>
  );
}

function renderRadio(node: ComponentNode): React.ReactNode {
  const options = extractSelectOptions(node);
  const radioOptions = options.map((o) => ({ label: o.label, value: o.value }));
  return (
    <FormFieldItem node={node}>
      <Radio.Group options={radioOptions} size="small" />
    </FormFieldItem>
  );
}

function renderCheckbox(node: ComponentNode): React.ReactNode {
  const label = getPropAsString(node, 'label') || node.name || '复选框';
  return (
    <FormFieldItem node={node}>
      <Checkbox>{label}</Checkbox>
    </FormFieldItem>
  );
}

function renderSwitch(node: ComponentNode): React.ReactNode {
  const label = getPropAsString(node, 'label');
  return (
    <FormFieldItem node={node}>
      <Switch />
      {label ? <Text style={{ marginLeft: 8, fontSize: 13 }}>{label}</Text> : null}
    </FormFieldItem>
  );
}

function renderLookupPicker(node: ComponentNode): React.ReactNode {
  const placeholder = getPropAsString(node, 'placeholder') || '请选择关联记录';
  const multiple = getPropAsBool(node, 'multiple');
  return (
    <FormFieldItem node={node}>
      <Select
        mode={multiple ? 'multiple' : undefined}
        placeholder={placeholder}
        showSearch
        size="small"
        style={{ width: '100%' }}
        notFoundContent="编辑模式不加载远程数据"
      />
    </FormFieldItem>
  );
}

function renderSubFormTable(node: ComponentNode): React.ReactNode {
  const columns = extractTableColumns(node);
  return (
    <FormFieldItem node={node}>
      <Table<TableRow>
        size="small"
        columns={columns}
        dataSource={[]}
        rowKey="__rowKey"
        pagination={false}
        locale={{ emptyText: '暂无子表记录' }}
      />
    </FormFieldItem>
  );
}

function renderAttachmentUpload(node: ComponentNode): React.ReactNode {
  const maxCount = getPropAsNumber(node, 'maxCount') || undefined;
  return (
    <FormFieldItem node={node}>
      <Upload maxCount={maxCount || undefined} listType="text">
        <Button icon={<UploadOutlined />} size="small">
          上传附件
        </Button>
      </Upload>
    </FormFieldItem>
  );
}

function renderUserPicker(node: ComponentNode): React.ReactNode {
  const placeholder = getPropAsString(node, 'placeholder') || '请选择人员';
  const multiple = getPropAsBool(node, 'multiple');
  return (
    <FormFieldItem node={node}>
      <Select
        mode={multiple ? 'multiple' : undefined}
        placeholder={placeholder}
        showSearch
        size="small"
        style={{ width: '100%' }}
        notFoundContent="编辑模式不加载人员数据"
      />
    </FormFieldItem>
  );
}

// ---------------------------------------------------------------------------
// 展示类渲染器
// ---------------------------------------------------------------------------

function renderButton(node: ComponentNode): React.ReactNode {
  const text = getPropAsString(node, 'text') || getPropAsString(node, 'label') || '按钮';
  const type = getPropAsString(node, 'type') || 'default';
  const danger = getPropAsBool(node, 'danger');
  return (
    <Button
      type={type as 'primary' | 'default' | 'dashed' | 'link' | 'text'}
      danger={danger || undefined}
      size="small"
    >
      {text}
    </Button>
  );
}

function renderStatistic(node: ComponentNode): React.ReactNode {
  const title = getPropAsString(node, 'title') || '统计';
  const value = getPropAsNumber(node, 'value');
  const prefix = getPropAsString(node, 'prefix') || undefined;
  const suffix = getPropAsString(node, 'suffix') || undefined;
  return <Statistic title={title} value={value} prefix={prefix} suffix={suffix} />;
}

function renderChart(node: ComponentNode): React.ReactNode {
  const title = getPropAsString(node, 'title') || '图表';
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

function renderRichTextDisplay(node: ComponentNode): React.ReactNode {
  const content = getPropAsString(node, 'content');
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

function renderDivider(node: ComponentNode): React.ReactNode {
  const label = getPropAsString(node, 'label') || getPropAsString(node, 'text');
  const orientation = getPropAsString(node, 'orientation') || 'left';
  return (
    <Divider orientation={orientation as 'left' | 'center' | 'right'} style={{ margin: '8px 0' }}>
      {label || undefined}
    </Divider>
  );
}

function renderText(node: ComponentNode): React.ReactNode {
  const content = getPropAsString(node, 'content') || '文本内容';
  const level = getPropAsNumber(node, 'level');
  if (level >= 1 && level <= 5) {
    return <Title level={level as 1 | 2 | 3 | 4 | 5}>{content}</Title>;
  }
  return <Text>{content}</Text>;
}

// ---------------------------------------------------------------------------
// 辅助:根据 ComponentType 获取图标(供 PageBuilder DragOverlay 使用)
// ---------------------------------------------------------------------------

/** 获取组件类型的图标组件。 */
export function getComponentIcon(type: ComponentType) {
  return getComponentMeta(type).icon;
}
