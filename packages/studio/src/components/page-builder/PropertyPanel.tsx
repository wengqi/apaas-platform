/**
 * 属性面板（右栏）— 飞书式单列滚动分组。
 *
 * 对齐飞书 aPaaS：头部为组件层级面包屑 + 组件 ID；正文为分组区段
 * （专属配置 → 表单生成器/内容/校验/交互/尺寸 → 事件 → 数据绑定 → 样式），
 * 取代旧的 基础/样式/数据绑定/事件 四 Tab。未选中时显示页面属性。
 */

import { useMemo, useState } from 'react';
import { Button, Empty, Input, Modal, Space, Typography, message } from 'antd';
import { LayoutOutlined, SaveOutlined } from '@ant-design/icons';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import { useCompositesStore } from '../../stores/page-builder/composites.js';
import { getComponentMeta } from '../../constants/pageComponents.js';
import type { ComponentNode } from '../../api/pages.js';
import { EventsTab } from './EventsTab.js';
import { PagePropertyForm } from './property-sections/PagePropertyForm.js';
import { StylePropsTab } from './property-sections/StylePropsTab.js';
import { DataBindingTab } from './property-sections/DataBindingTab.js';
import { ChartPropsSection } from './property-sections/ChartPropsSection.js';
import { RegionPropsSection } from './property-sections/RegionPropsSection.js';
import { StatisticPropsSection } from './property-sections/StatisticPropsSection.js';
import { DashboardGridPropsSection } from './property-sections/DashboardGridPropsSection.js';
import { DataTablePropsSection } from './property-sections/DataTablePropsSection.js';
import { panelStyle } from './property-sections/shared.js';
import { PropGroup, PropRow } from './property-sections/PropRow.js';
import {
  FieldContentSection,
  FieldInteractionSection,
  FieldSizeSection,
  FieldValidateSection,
  isFormFieldType,
} from './property-sections/FieldPropsSections.js';
import FormGeneratorModal from './form-generator/FormGeneratorModal.js';

const { Text } = Typography;

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

/** 从根到目标的路径（面包屑用）。 */
function findPath(
  node: ComponentNode,
  id: string,
  trail: ComponentNode[] = [],
): ComponentNode[] | null {
  const next = [...trail, node];
  if (node.id === id) return next;
  for (const child of node.children ?? []) {
    const found = findPath(child, id, next);
    if (found) return found;
  }
  return null;
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

  const path = useMemo(() => {
    if (!schema || !selectedNodeId) return null;
    return findPath(schema.root, selectedNodeId);
  }, [schema, selectedNodeId]);

  if (!selectedNode) {
    return (
      <div style={panelStyle}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #f2f3f5' }}>
          <Text strong style={{ fontSize: 14 }}>
            页面属性
          </Text>
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
                    background: '#e1eaff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <LayoutOutlined style={{ fontSize: 32, color: '#1456f0' }} />
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

  return <ComponentPropertyPanel node={selectedNode} path={path ?? [selectedNode]} />;
}

// ---------------------------------------------------------------------------
// 组件属性面板（面包屑 + 分组区段）
// ---------------------------------------------------------------------------

function ComponentPropertyPanel({ node, path }: { node: ComponentNode; path: ComponentNode[] }) {
  const [saveCompOpen, setSaveCompOpen] = useState(false);
  const [compName, setCompName] = useState('');
  const saveComposite = useCompositesStore((s) => s.saveComposite);
  const updateComponentProps = usePageBuilderStore((s) => s.updateComponentProps);
  const formGeneratorOpen = usePageBuilderStore((s) => s.formGeneratorNodeId === node.id);
  const setFormGeneratorNodeId = usePageBuilderStore((s) => s.setFormGeneratorNodeId);
  const isField = isFormFieldType(node.type);
  const isForm = node.type === 'form';
  const objectId = typeof node.props.objectId === 'string' ? node.props.objectId : undefined;
  const getStr = (key: string): string =>
    typeof node.props[key] === 'string' ? (node.props[key] as string) : '';

  return (
    <div style={panelStyle}>
      {/* 面包屑（对应飞书组件层级路径） */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #f2f3f5',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          overflow: 'hidden',
        }}
      >
        {path.map((item, idx) => {
          const itemMeta = getComponentMeta(item.type);
          const isLast = idx === path.length - 1;
          return (
            <Space key={item.id} size={4} style={{ flexShrink: 0 }}>
              {idx > 0 && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  ›
                </Text>
              )}
              <Text
                style={{
                  fontSize: 13,
                  maxWidth: 96,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontWeight: isLast ? 600 : 400,
                  color: isLast ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.55)',
                }}
              >
                {item.name || itemMeta.label}
              </Text>
            </Space>
          );
        })}
        <Button
          type="text"
          size="small"
          icon={<SaveOutlined />}
          title="保存为复合组件"
          onClick={() => setSaveCompOpen(true)}
          style={{ marginLeft: 'auto', flexShrink: 0 }}
        />
        <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace', flexShrink: 0 }}>
          {node.id}
        </Text>
      </div>

      {/* 分组区段（单列滚动） */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {/* 类型专属配置 */}
        {node.type === 'chart' && (
          <PropGroup title="图表配置">
            <ChartPropsSection
              node={node}
              getStr={getStr}
              updateComponentProps={updateComponentProps}
            />
          </PropGroup>
        )}
        {node.type === 'data_table' && (
          <PropGroup title="表格配置">
            <DataTablePropsSection
              node={node}
              getStr={getStr}
              updateComponentProps={updateComponentProps}
            />
          </PropGroup>
        )}
        {node.type === 'statistic' && (
          <PropGroup title="指标卡配置">
            <StatisticPropsSection
              node={node}
              getStr={getStr}
              updateComponentProps={updateComponentProps}
            />
          </PropGroup>
        )}
        {node.type === 'dashboard_grid' && (
          <PropGroup title="仪表盘网格">
            <DashboardGridPropsSection node={node} updateComponentProps={updateComponentProps} />
          </PropGroup>
        )}
        {(node.type === 'region_cascader_single' || node.type === 'region_cascader_multi') && (
          <PropGroup title="行政区划配置">
            <RegionPropsSection node={node} />
          </PropGroup>
        )}

        {/* 表单容器：表单生成器入口 + 布局 */}
        {isForm && (
          <PropGroup title="表单生成器">
            <PropRow label="来源对象">
              <Button
                size="small"
                onClick={() => setFormGeneratorNodeId(node.id)}
                style={{ width: '100%', textAlign: 'left' }}
              >
                {objectId ? '已关联对象 · 重新生成' : '从对象字段生成'}
              </Button>
            </PropRow>
            <PropRow label="每行列数">
              <SegmentedColumns node={node} />
            </PropRow>
          </PropGroup>
        )}

        {/* 表单字段专属分组 */}
        {isField && (
          <>
            <FieldContentSection node={node} />
            <FieldValidateSection node={node} />
            <FieldInteractionSection node={node} />
            <FieldSizeSection node={node} />
          </>
        )}

        {/* 事件 */}
        <PropGroup title="事件" domId="prop-events">
          <EventsTab node={node} />
        </PropGroup>

        {/* 数据绑定 */}
        <PropGroup title="数据绑定">
          <DataBindingTab node={node} />
        </PropGroup>

        {/* 样式 */}
        <PropGroup title="样式">
          <StylePropsTab node={node} />
        </PropGroup>
      </div>

      {/* 保存为复合组件（对齐飞书「自定义」物料） */}
      <Modal
        title="保存为复合组件"
        open={saveCompOpen}
        onCancel={() => setSaveCompOpen(false)}
        onOk={() => {
          const name = compName.trim();
          if (!name) {
            message.warning('请输入复合组件名称');
            return;
          }
          saveComposite(name, node);
          setCompName('');
          setSaveCompOpen(false);
          message.success(`复合组件「${name}」已保存，可在左栏「自定义」中拖拽复用`);
        }}
      >
        <Input
          placeholder="复合组件名称"
          value={compName}
          onChange={(e) => setCompName(e.target.value)}
        />
      </Modal>

      {isForm && (
        <FormGeneratorModal
          open={formGeneratorOpen}
          onClose={() => setFormGeneratorNodeId(null)}
          formNodeId={node.id}
          initialObjectId={objectId}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 表单每行列数（columns：1-3）
// ---------------------------------------------------------------------------

function SegmentedColumns({ node }: { node: ComponentNode }) {
  const updateComponentProps = usePageBuilderStore((s) => s.updateComponentProps);
  const current = typeof node.props.columns === 'number' ? node.props.columns : 1;

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3].map((n) => (
        <Button
          key={n}
          size="small"
          type={current === n ? 'primary' : 'default'}
          onClick={() => updateComponentProps(node.id, { columns: n })}
          style={{ flex: 1 }}
        >
          {n} 列
        </Button>
      ))}
    </div>
  );
}
