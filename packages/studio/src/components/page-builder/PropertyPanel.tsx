/**
 * 属性面板（右栏）— 主入口。
 *
 * 未选中组件时显示页面属性；选中时显示组件属性 Tabs（基础/样式/数据绑定/事件）。
 * 各子面板已拆分到 property-sections/ 目录。
 */

import { useMemo } from 'react';
import { Button, Empty, Input, Space, Switch, Tabs, Tag, Typography } from 'antd';
import { LayoutOutlined, DatabaseOutlined } from '@ant-design/icons';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import { getComponentMeta } from '../../constants/pageComponents.js';
import type { ComponentNode } from '../../api/pages.js';
import { EventsTab } from './EventsTab.js';
import { PagePropertyForm } from './property-sections/PagePropertyForm.js';
import { StylePropsTab } from './property-sections/StylePropsTab.js';
import { DataBindingTab } from './property-sections/DataBindingTab.js';
import { ChartPropsSection } from './property-sections/ChartPropsSection.js';
import { StatisticPropsSection } from './property-sections/StatisticPropsSection.js';
import { DashboardGridPropsSection } from './property-sections/DashboardGridPropsSection.js';
import { DataTablePropsSection } from './property-sections/DataTablePropsSection.js';
import { FormField, panelStyle, headerStyle } from './property-sections/shared.js';

const { Text, Title } = Typography;

/** 在组件树中按 ID 递归查找节点。 */
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

/** 属性面板主组件。 */
export default function PropertyPanel() {
  const schema = usePageBuilderStore((s) => s.schema);
  const selectedNodeId = usePageBuilderStore((s) => s.selectedNodeId);
  const currentPage = usePageBuilderStore((s) => s.currentPage);
  const updatePageMeta = usePageBuilderStore((s) => s.updatePageMeta);

  const selectedNode = useMemo(() => {
    if (!schema || !selectedNodeId) return undefined;
    return findNodeInTree(schema.root, selectedNodeId);
  }, [schema, selectedNodeId]);

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
              slug={currentPage.apiName}
              type={currentPage.type}
              onNameChange={(v) => updatePageMeta({ name: v })}
              onSlugChange={(v) => updatePageMeta({ apiName: v })}
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

  return <ComponentPropertyPanel node={selectedNode} />;
}

/** 组件属性面板 — 头部信息 + Tabs（基础/样式/数据绑定/事件）。 */
function ComponentPropertyPanel({ node }: { node: ComponentNode }) {
  const meta = getComponentMeta(node.type);
  const Icon = meta.icon;
  const setVmPanelOpen = usePageBuilderStore((s) => s.setVmPanelOpen);

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <Space size={8} align="center">
          <Icon style={{ fontSize: 16, color: '#1677ff' }} />
          <Text strong style={{ fontSize: 14 }}>
            {node.name || meta.label}
          </Text>
          <Tag style={{ margin: 0, fontSize: 11, lineHeight: '18px' }} color="default">
            {node.type}
          </Tag>
        </Space>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
            {node.id}
          </Text>
          <Button
            type="text"
            size="small"
            icon={<DatabaseOutlined />}
            onClick={() => setVmPanelOpen(true)}
          />
        </div>
      </div>

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
              children: <DataBindingTab node={node} />,
            },
            {
              key: 'events',
              label: '事件',
              children: <EventsTab node={node} />,
            },
          ]}
        />
      </div>
    </div>
  );
}

/** 基础属性 Tab — 组件 ID/名称/可见性/class + 类型专属配置。 */
function BasicPropsTab({ node }: { node: ComponentNode }) {
  const updateNode = usePageBuilderStore((s) => s.updateNode);
  const updateComponentProps = usePageBuilderStore((s) => s.updateComponentProps);

  const isHidden = node.hidden === true;
  const className = typeof node.props.className === 'string' ? node.props.className : '';

  const getStr = (key: string): string =>
    typeof node.props[key] === 'string' ? (node.props[key] as string) : '';

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
          onChange={(e) => updateComponentProps(node.id, { className: e.target.value })}
          size="small"
          placeholder="highlight-card"
        />
      </FormField>

      {node.type === 'chart' && (
        <ChartPropsSection
          node={node}
          getStr={getStr}
          updateComponentProps={updateComponentProps}
        />
      )}

      {node.type === 'data_table' && (
        <DataTablePropsSection
          node={node}
          getStr={getStr}
          updateComponentProps={updateComponentProps}
        />
      )}

      {node.type === 'statistic' && (
        <StatisticPropsSection
          node={node}
          getStr={getStr}
          updateComponentProps={updateComponentProps}
        />
      )}

      {node.type === 'dashboard_grid' && (
        <DashboardGridPropsSection node={node} updateComponentProps={updateComponentProps} />
      )}
    </div>
  );
}
