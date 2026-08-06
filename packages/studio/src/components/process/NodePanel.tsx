/**
 * 节点面板(左栏) —— 对齐 DESIGN-process.md §3.3。
 *
 * 搜索框 + 分类折叠面板 + 节点项(可拖拽到画布)。
 * 节点项通过 HTML5 drag 携带节点 type,中栏画布(flowgram)接收拖放创建节点。
 */

import { useMemo, useState } from 'react';
import { Collapse, Empty, Input, Row, Col, Typography, Tooltip } from 'antd';
import { NODE_GROUPS, NODE_COMING_SOON, getNodeMeta } from '../../constants/process.js';

const { Text } = Typography;

export interface NodePanelProps {
  /** 只读模式(禁用拖拽) */
  readonly?: boolean;
  /** 拖拽创建节点回调(供父组件桥接 flowgram) */
  onCreateNode?: (nodeType: string) => void;
}

export default function NodePanel({ readonly = false, onCreateNode }: NodePanelProps) {
  const [keyword, setKeyword] = useState('');

  /** 按关键字过滤节点。 */
  const filteredGroups = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return NODE_GROUPS;
    return NODE_GROUPS.map((group) => ({
      ...group,
      types: group.types.filter((type) => {
        const meta = getNodeMeta(type);
        return (
          meta.label.toLowerCase().includes(kw) ||
          type.toLowerCase().includes(kw) ||
          meta.description.toLowerCase().includes(kw)
        );
      }),
    })).filter((group) => group.types.length > 0);
  }, [keyword]);

  /** 搜索时展开所有分类。 */
  const activeKeys = keyword
    ? filteredGroups.map((g) => g.category)
    : NODE_GROUPS.map((g) => g.category);

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        height: '100%',
        background: '#fff',
        borderRight: '1px solid #eef0f4',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 16px 8px', flexShrink: 0 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          节点
        </Typography.Title>
      </div>

      <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
        <Input.Search
          placeholder="搜索节点"
          allowClear
          size="small"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 12px' }}>
        {filteredGroups.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="未找到匹配的节点"
            style={{ marginTop: 40 }}
          />
        ) : (
          <Collapse
            ghost
            size="small"
            activeKey={activeKeys}
            items={filteredGroups.map((group) => ({
              key: group.category,
              label: (
                <Text strong style={{ fontSize: 13 }}>
                  {group.title}
                </Text>
              ),
              children: (
                <Row gutter={[8, 8]}>
                  {group.types.map((type) => (
                    <Col span={8} key={type}>
                      <NodeItem type={type} readonly={readonly} onCreateNode={onCreateNode} />
                    </Col>
                  ))}
                </Row>
              ),
            }))}
          />
        )}

        {/* 扩展节点(即将支持,灰态) */}
        <Collapse
          ghost
          size="small"
          style={{ marginTop: 4 }}
          items={[
            {
              key: 'coming-soon',
              label: (
                <Text type="secondary" style={{ fontSize: 13 }}>
                  即将支持
                </Text>
              ),
              children: (
                <Row gutter={[8, 8]}>
                  {NODE_COMING_SOON.map((node) => (
                    <Col span={8} key={node.type}>
                      <Tooltip title="即将支持">
                        <div
                          style={{
                            width: '100%',
                            height: 64,
                            border: '1px dashed #eef0f4',
                            borderRadius: 8,
                            background: '#fafbfc',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: 0.4,
                            cursor: 'not-allowed',
                          }}
                        >
                          <Text style={{ fontSize: 12, textAlign: 'center', padding: '0 4px' }}>
                            {node.label}
                          </Text>
                        </div>
                      </Tooltip>
                    </Col>
                  ))}
                </Row>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 节点项(拖拽源)
// ---------------------------------------------------------------------------

interface NodeItemProps {
  type: string;
  readonly?: boolean;
  onCreateNode?: (nodeType: string) => void;
}

function NodeItem({ type, readonly, onCreateNode }: NodeItemProps) {
  const meta = getNodeMeta(type);
  const Icon = meta.icon;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('application/x-apaas-node-type', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleClick = () => {
    if (!readonly) onCreateNode?.(type);
  };

  return (
    <div
      draggable={!readonly}
      onDragStart={handleDragStart}
      onClick={handleClick}
      style={{
        width: '100%',
        height: 64,
        border: '1px solid #eef0f4',
        borderRadius: 8,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: readonly ? 'default' : 'grab',
        transition: 'all 0.2s ease',
        touchAction: 'none',
      }}
      onMouseEnter={(e) => {
        if (!readonly) {
          e.currentTarget.style.borderColor = '#1677ff';
          e.currentTarget.style.background = '#e6f4ff';
        }
      }}
      onMouseLeave={(e) => {
        if (!readonly) {
          e.currentTarget.style.borderColor = '#eef0f4';
          e.currentTarget.style.background = '#fff';
        }
      }}
      title={meta.description}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)`,
          color: '#fff',
          fontSize: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon style={{ fontSize: 16 }} />
      </div>
      <Text style={{ fontSize: 12, marginTop: 4 }}>{meta.label}</Text>
    </div>
  );
}
