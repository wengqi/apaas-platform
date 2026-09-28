/**
 * 大纲树（左栏「大纲树」页签）— 对齐飞书 aPaaS：可搜索的组件层级树，
 * 点击节点选中（与画布联动）。
 */

import { useMemo, useState } from 'react';
import { Input, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import { getComponentMeta } from '../../constants/pageComponents.js';
import type { ComponentNode } from '../../api/pages.js';

const { Text } = Typography;

interface TreeNodeData {
  node: ComponentNode;
  label: string;
  children: TreeNodeData[];
}

/** 组件树 → 展示树（带过滤；命中节点保留其祖先链）。 */
function buildTree(node: ComponentNode, kw: string): TreeNodeData | null {
  const meta = getComponentMeta(node.type);
  const label = node.name || meta.label;
  const children = (node.children ?? [])
    .map((child) => buildTree(child, kw))
    .filter((t): t is TreeNodeData => t !== null);

  const selfMatch = kw === '' || label.toLowerCase().includes(kw);
  if (!selfMatch && children.length === 0) return null;

  return { node, label, children };
}

/** 渲染一层树节点（缩进列表，全展开）。 */
function TreeLevel({
  items,
  depth,
  selectedId,
  onSelect,
}: {
  items: TreeNodeData[];
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {items.map((item) => {
        const isSelected = item.node.id === selectedId;
        return (
          <div key={item.node.id}>
            <div
              onClick={() => onSelect(item.node.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: 28,
                paddingLeft: 12 + depth * 16,
                paddingRight: 8,
                margin: '1px 0',
                borderRadius: 4,
                cursor: 'pointer',
                background: isSelected ? '#e1eaff' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.background = '#f2f3f5';
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.background = 'transparent';
              }}
            >
              <NodeLabel item={item} />
            </div>
            <TreeLevel
              items={item.children}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          </div>
        );
      })}
    </>
  );
}

function NodeLabel({ item }: { item: TreeNodeData }) {
  const meta = getComponentMeta(item.node.type);
  const Icon = meta.icon;
  return (
    <>
      <Icon style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', flexShrink: 0 }} />
      <Text
        style={{
          fontSize: 13,
          color: 'rgba(0,0,0,0.88)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {item.label}
      </Text>
      <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto', flexShrink: 0 }}>
        {item.node.type}
      </Text>
    </>
  );
}

/** 大纲树主组件。 */
export default function OutlineTree() {
  const schema = usePageBuilderStore((s) => s.schema);
  const selectedNodeId = usePageBuilderStore((s) => s.selectedNodeId);
  const selectNode = usePageBuilderStore((s) => s.selectNode);
  const [keyword, setKeyword] = useState('');

  const tree = useMemo(() => {
    if (!schema) return null;
    const kw = keyword.trim().toLowerCase();
    return buildTree(schema.root, kw);
  }, [schema, keyword]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '8px 12px', flexShrink: 0 }}>
        <Input
          size="small"
          placeholder="搜索"
          prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.35)', fontSize: 12 }} />}
          allowClear
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px', minHeight: 0 }}>
        {tree ? (
          <TreeLevel items={[tree]} depth={0} selectedId={selectedNodeId} onSelect={selectNode} />
        ) : (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              页面加载中
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}
