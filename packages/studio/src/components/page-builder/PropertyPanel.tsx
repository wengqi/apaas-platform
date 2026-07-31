import { useMemo } from 'react';
import {
  ColorPicker,
  Empty,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { LayoutOutlined } from '@ant-design/icons';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import {
  getComponentMeta,
  PAGE_TYPE_OPTIONS,
} from '../../constants/pageComponents.js';
import type { ComponentNode, PageType } from '../../api/pages.js';

const { Text, Title } = Typography;

// ---------------------------------------------------------------------------
// 树查找辅助(局部,避免从 store 导出内部函数)
// ---------------------------------------------------------------------------

function findNodeInTree(node: ComponentNode, id: string): ComponentNode | undefined {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeInTree(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 样式辅助
// ---------------------------------------------------------------------------

/** 安全读取节点的 style 对象。 */
function getNodeStyle(node: ComponentNode): Record<string, unknown> {
  const raw = node.props.style;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function getStyleNumber(style: Record<string, unknown>, key: string): number | undefined {
  const val = style[key];
  return typeof val === 'number' ? val : undefined;
}

function getStyleString(style: Record<string, unknown>, key: string): string | undefined {
  const val = style[key];
  return typeof val === 'string' ? val : undefined;
}

// ---------------------------------------------------------------------------
// 属性面板主体
// ---------------------------------------------------------------------------

/**
 * 属性面板(右栏)。
 * - 未选中:显示页面属性(名称/API名/类型)
 * - 选中组件:Tabs(基础属性/样式/数据绑定/事件)
 */
export default function PropertyPanel() {
  const schema = usePageBuilderStore((s) => s.schema);
  const selectedNodeId = usePageBuilderStore((s) => s.selectedNodeId);
  const currentPage = usePageBuilderStore((s) => s.currentPage);
  const updatePageMeta = usePageBuilderStore((s) => s.updatePageMeta);

  /** 当前选中的节点(从 schema 树中查找)。 */
  const selectedNode = useMemo(() => {
    if (!schema || !selectedNodeId) return undefined;
    return findNodeInTree(schema.root, selectedNodeId);
  }, [schema, selectedNodeId]);

  // 未选中:页面属性
  if (!selectedNode) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <Title level={5} style={{ margin: 0 }}>
            页面属性
          </Title>
        </div>
        <div style={{ padding: 16 }}>
          {currentPage ? (
            <PagePropertyForm
              name={currentPage.name}
              slug={currentPage.slug}
              type={currentPage.type}
              onNameChange={(v) => updatePageMeta({ name: v })}
              onSlugChange={(v) => updatePageMeta({ slug: v })}
              onTypeChange={(v) => updatePageMeta({ type: v })}
            />
          ) : (
            <Empty
              image={
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    background: '#e6f4ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <LayoutOutlined style={{ fontSize: 32, color: '#1677ff' }} />
                </div>
              }
              description="选中一个组件以编辑属性"
              style={{ padding: '60px 0' }}
            />
          )}
        </div>
      </div>
    );
  }

  // 选中:组件属性
  return <ComponentPropertyPanel node={selectedNode} />;
}

// ---------------------------------------------------------------------------
// 页面属性表单
// ---------------------------------------------------------------------------

interface PagePropertyFormProps {
  name: string;
  slug: string;
  type: PageType;
  onNameChange: (v: string) => void;
  onSlugChange: (v: string) => void;
  onTypeChange: (v: PageType) => void;
}

function PagePropertyForm({
  name,
  slug,
  type,
  onNameChange,
  onSlugChange,
  onTypeChange,
}: PagePropertyFormProps) {
  return (
    <div>
      <FormField label="页面名称">
        <Input value={name} onChange={(e) => onNameChange(e.target.value)} size="small" />
      </FormField>
      <FormField label="API 名称">
        <Input
          value={slug}
          onChange={(e) => onSlugChange(e.target.value)}
          size="small"
          style={{ fontFamily: 'monospace' }}
        />
      </FormField>
      <FormField label="页面类型">
        <Select
          value={type}
          onChange={(v) => onTypeChange(v as PageType)}
          size="small"
          style={{ width: '100%' }}
          options={PAGE_TYPE_OPTIONS}
        />
      </FormField>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 组件属性面板
// ---------------------------------------------------------------------------

function ComponentPropertyPanel({ node }: { node: ComponentNode }) {
  const meta = getComponentMeta(node.type);
  const Icon = meta.icon;

  return (
    <div style={panelStyle}>
      {/* 选中组件头 */}
      <div style={headerStyle}>
        <Space size={8} align="center">
          <Icon style={{ fontSize: 16, color: '#1677ff' }} />
          <Text strong style={{ fontSize: 14 }}>
            {node.name || meta.label}
          </Text>
          <Tag
            style={{ margin: 0, fontSize: 11, lineHeight: '18px' }}
            color="default"
          >
            {node.type}
          </Tag>
        </Space>
        <div>
          <Text
            type="secondary"
            style={{ fontSize: 12, fontFamily: 'monospace' }}
          >
            {node.id}
          </Text>
        </div>
      </div>

      {/* 属性 Tabs */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Tabs
          size="small"
          style={{ padding: '0 16px' }}
          items={[
            {
              key: 'basic',
              label: '基础属性',
              children: <BasicPropsTab node={node} />,
            },
            {
              key: 'style',
              label: '样式',
              children: <StylePropsTab node={node} />,
            },
            {
              key: 'binding',
              label: '数据绑定',
              children: <PlaceholderTab text="数据绑定功能将在后续版本支持" />,
            },
            {
              key: 'events',
              label: '事件',
              children: <PlaceholderTab text="事件配置功能将在后续版本支持" />,
            },
          ]}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 基础属性 Tab
// ---------------------------------------------------------------------------

function BasicPropsTab({ node }: { node: ComponentNode }) {
  const updateNode = usePageBuilderStore((s) => s.updateNode);
  const updateComponentProps = usePageBuilderStore((s) => s.updateComponentProps);

  const isHidden = node.hidden === true;
  const className = typeof node.props.className === 'string' ? node.props.className : '';

  return (
    <div>
      <FormField label="组件 ID">
        <Text
          style={{
            fontSize: 13,
            fontFamily: 'monospace',
            display: 'block',
            padding: '4px 0',
          }}
          type="secondary"
        >
          {node.id}
        </Text>
      </FormField>
      <FormField label="组件名称">
        <Input
          value={node.name ?? ''}
          onChange={(e) => updateNode(node.id, { name: e.target.value })}
          size="small"
          placeholder="组件名称"
        />
      </FormField>
      <FormField label="可见性">
        <Space size={8} align="center">
          <Switch
            size="small"
            checked={!isHidden}
            onChange={(checked) => updateNode(node.id, { hidden: !checked })}
          />
          <Text type="secondary" style={{ fontSize: 13 }}>
            {isHidden ? '隐藏' : '显示'}
          </Text>
        </Space>
      </FormField>
      <FormField label="自定义 class">
        <Input
          value={className}
          onChange={(e) =>
            updateComponentProps(node.id, { className: e.target.value })
          }
          size="small"
          placeholder="highlight-card"
        />
      </FormField>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 样式 Tab
// ---------------------------------------------------------------------------

function StylePropsTab({ node }: { node: ComponentNode }) {
  const updateComponentProps = usePageBuilderStore((s) => s.updateComponentProps);
  const style = getNodeStyle(node);

  /** 更新单个样式属性。 */
  const updateStyle = (updates: Record<string, unknown>) => {
    updateComponentProps(node.id, { style: { ...style, ...updates } });
  };

  const borderStyleOptions = [
    { label: '无', value: 'none' },
    { label: '实线', value: 'solid' },
    { label: '虚线', value: 'dashed' },
    { label: '点线', value: 'dotted' },
  ];

  return (
    <div>
      {/* 尺寸 */}
      <SectionDivider>尺寸</SectionDivider>
      <div style={{ display: 'flex', gap: 12 }}>
        <FormField label="宽度" compact>
          <InputNumber
            value={getStyleNumber(style, 'width')}
            onChange={(v) => updateStyle({ width: v ?? undefined })}
            size="small"
            addonAfter="px"
            style={{ width: '100%' }}
            placeholder="自适应"
          />
        </FormField>
        <FormField label="高度" compact>
          <InputNumber
            value={getStyleNumber(style, 'height')}
            onChange={(v) => updateStyle({ height: v ?? undefined })}
            size="small"
            addonAfter="px"
            style={{ width: '100%' }}
            placeholder="自适应"
          />
        </FormField>
      </div>

      {/* 间距 — 外边距 */}
      <SectionDivider>外边距 (margin)</SectionDivider>
      <SpacingEditor prefix="margin" style={style} onChange={updateStyle} />

      {/* 间距 — 内边距 */}
      <SectionDivider>内边距 (padding)</SectionDivider>
      <SpacingEditor prefix="padding" style={style} onChange={updateStyle} />

      {/* 边框 */}
      <SectionDivider>边框</SectionDivider>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <FormField label="样式" compact>
          <Select
            value={getStyleString(style, 'borderStyle') ?? 'none'}
            onChange={(v) => updateStyle({ borderStyle: v })}
            size="small"
            style={{ width: 90 }}
            options={borderStyleOptions}
          />
        </FormField>
        <FormField label="宽度" compact>
          <InputNumber
            value={getStyleNumber(style, 'borderWidth')}
            onChange={(v) => updateStyle({ borderWidth: v ?? undefined })}
            size="small"
            addonAfter="px"
            style={{ width: 100 }}
            min={0}
          />
        </FormField>
        <FormField label="颜色" compact>
          <ColorPicker
            value={getStyleString(style, 'borderColor') ?? '#eef0f4'}
            showText
            size="small"
            onChange={(color) => updateStyle({ borderColor: color.toHexString() })}
          />
        </FormField>
      </div>
      <FormField label="圆角">
        <InputNumber
          value={getStyleNumber(style, 'borderRadius')}
          onChange={(v) => updateStyle({ borderRadius: v ?? undefined })}
          size="small"
          addonAfter="px"
          style={{ width: 120 }}
          min={0}
        />
      </FormField>

      {/* 背景 */}
      <SectionDivider>背景</SectionDivider>
      <FormField label="背景颜色">
        <ColorPicker
          value={getStyleString(style, 'background') ?? '#ffffff'}
          showText
          size="small"
          onChange={(color) => updateStyle({ background: color.toHexString() })}
        />
      </FormField>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 占位 Tab
// ---------------------------------------------------------------------------

function PlaceholderTab({ text }: { text: string }) {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center' }}>
      <Text type="secondary" style={{ fontSize: 13 }}>
        {text}
      </Text>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 通用子组件
// ---------------------------------------------------------------------------

const panelStyle: React.CSSProperties = {
  width: 360,
  flexShrink: 0,
  height: '100%',
  background: '#fff',
  borderLeft: '1px solid #eef0f4',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #eef0f4',
  flexShrink: 0,
};

/** 表单字段:标签 + 控件。 */
function FormField({
  label,
  children,
  compact,
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: 13,
          color: 'rgba(0,0,0,0.88)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/** 分区标题。 */
function SectionDivider({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        color: 'rgba(0,0,0,0.45)',
        margin: '16px 0 8px',
        paddingBottom: 4,
        borderBottom: '1px solid #f0f2f5',
      }}
    >
      {children}
    </div>
  );
}

/** 四向间距编辑器(上/右/下/左)。prefix 为 'margin' 或 'padding'。 */
function SpacingEditor({
  prefix,
  style,
  onChange,
}: {
  prefix: string;
  style: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
}) {
  const items = [
    { label: '上', suffix: 'Top' },
    { label: '右', suffix: 'Right' },
    { label: '下', suffix: 'Bottom' },
    { label: '左', suffix: 'Left' },
  ];

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {items.map((item) => {
        const fullKey = `${prefix}${item.suffix}`;
        return (
          <div key={fullKey} style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginBottom: 2 }}>
              {item.label}
            </div>
            <InputNumber
              value={getStyleNumber(style, fullKey)}
              onChange={(v) => onChange({ [fullKey]: v ?? undefined })}
              size="small"
              style={{ width: '100%' }}
              placeholder="0"
            />
          </div>
        );
      })}
    </div>
  );
}
