import { useMemo, useState } from 'react';
import { Collapse, Input, Row, Col, Typography } from 'antd';
import { useDraggable } from '@dnd-kit/core';
import { COMPONENT_GROUPS, COMPONENT_META } from '../../constants/pageComponents.js';
import type { ComponentType } from '../../api/pages.js';

const { Text } = Typography;

/** 拖拽数据:从组件面板拖出。 */
export interface PanelDragData {
  source: 'panel';
  componentType: ComponentType;
}

/**
 * 组件面板(左栏)。
 * 搜索框 + 分类折叠面板(容器/数据/表单/展示)。
 * 每个组件项可拖拽(dnd-kit useDraggable),拖到画布触发新增。
 */
export default function ComponentPanel() {
  const [keyword, setKeyword] = useState('');
  const [activeKeys, setActiveKeys] = useState<string[]>(['container', 'data']);

  /** 按关键字过滤组件(匹配 label),保留有匹配项的分类。 */
  const filteredGroups = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return COMPONENT_GROUPS;
    return COMPONENT_GROUPS.map((group) => ({
      ...group,
      types: group.types.filter((type) => {
        const meta = COMPONENT_META[type];
        return (
          meta.label.toLowerCase().includes(kw) ||
          type.toLowerCase().includes(kw)
        );
      }),
    })).filter((group) => group.types.length > 0);
  }, [keyword]);

  /** 搜索时展开所有分类,否则用用户手动展开状态。 */
  const effectiveActiveKeys = keyword
    ? filteredGroups.map((g) => g.category)
    : activeKeys;

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
      {/* 标题 */}
      <div
        style={{
          padding: '14px 16px 8px',
          flexShrink: 0,
        }}
      >
        <Typography.Title level={5} style={{ margin: 0 }}>
          组件
        </Typography.Title>
      </div>

      {/* 搜索框 */}
      <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
        <Input.Search
          placeholder="搜索组件"
          allowClear
          size="small"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {/* 分类折叠面板 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 12px' }}>
        {filteredGroups.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              未找到匹配的组件
            </Text>
          </div>
        ) : (
          <Collapse
            ghost
            size="small"
            activeKey={effectiveActiveKeys}
            onChange={(keys) => setActiveKeys(keys as string[])}
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
                      <ComponentItem type={type} />
                    </Col>
                  ))}
                </Row>
              ),
            }))}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 组件项(拖拽源)
// ---------------------------------------------------------------------------

interface ComponentItemProps {
  type: ComponentType;
}

/** 单个组件项:图标 + 名称,可拖拽(dnd-kit useDraggable)。 */
function ComponentItem({ type }: ComponentItemProps) {
  const meta = COMPONENT_META[type];
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `panel-${type}`,
    data: { source: 'panel', componentType: type } as PanelDragData,
  });

  const Icon = meta.icon;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
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
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        transition: 'all 0.2s ease',
        touchAction: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isDragging) {
          e.currentTarget.style.borderColor = '#1677ff';
          e.currentTarget.style.background = '#e6f4ff';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#eef0f4';
        e.currentTarget.style.background = '#fff';
      }}
      title={meta.description}
    >
      <Icon style={{ fontSize: 22, color: '#1677ff' }} />
      <Text style={{ fontSize: 12, marginTop: 4 }}>
        {meta.label}
      </Text>
    </div>
  );
}
