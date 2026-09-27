import { useMemo, useState } from 'react';
import { Collapse, Input, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useDraggable } from '@dnd-kit/core';
import { DESIGNER_GROUPS, COMPONENT_META } from '../../constants/pageComponents.js';
import type { ComponentType } from '../../api/pages.js';

const { Text } = Typography;

/** 拖拽数据:从组件面板拖出。 */
export interface PanelDragData {
  source: 'panel';
  componentType: ComponentType;
}

/**
 * 组件面板（左栏「组件」页签内容）。
 * 对齐飞书 aPaaS：搜索框 + 可折叠分组 + 4 列图标卡片（浅灰图标底 + 名称）。
 */
export default function ComponentPanel() {
  const [keyword, setKeyword] = useState('');
  const [activeKeys, setActiveKeys] = useState<string[]>(() => DESIGNER_GROUPS.map((g) => g.title));

  /** 按关键字过滤组件(匹配 label),保留有匹配项的分组。 */
  const filteredGroups = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return DESIGNER_GROUPS;
    return DESIGNER_GROUPS.map((group) => ({
      ...group,
      types: group.types.filter((type) => {
        const meta = COMPONENT_META[type];
        return meta.label.toLowerCase().includes(kw) || type.toLowerCase().includes(kw);
      }),
    })).filter((group) => group.types.length > 0);
  }, [keyword]);

  /** 搜索时展开所有分组,否则用用户手动展开状态。 */
  const effectiveActiveKeys = keyword ? filteredGroups.map((g) => g.title) : activeKeys;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* 搜索框 */}
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

      {/* 分组折叠面板 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 12px', minHeight: 0 }}>
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
              key: group.title,
              label: (
                <Text style={{ fontSize: 13, fontWeight: 600, color: 'rgba(0,0,0,0.88)' }}>
                  {group.title}
                </Text>
              ),
              children: (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 8,
                  }}
                >
                  {group.types.map((type) => (
                    <ComponentItem
                      key={`${group.title}-${type}`}
                      dragId={`${group.title}-${type}`}
                      type={type}
                    />
                  ))}
                </div>
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
  /** dnd-kit 唯一拖拽 id(同一组件可在多个分组出现) */
  dragId: string;
}

/**
 * 单个组件项:浅灰圆角图标块 + 名称(飞书物料卡样式),可拖拽(dnd-kit useDraggable)。
 */
function ComponentItem({ type, dragId }: ComponentItemProps) {
  const meta = COMPONENT_META[type];
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `panel-${dragId}`,
    data: { source: 'panel', componentType: type } as PanelDragData,
  });

  const Icon = meta.icon;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '8px 2px 6px',
        borderRadius: 8,
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        transition: 'background 0.15s ease',
        touchAction: 'none',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#f2f3f5';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
      title={meta.description}
    >
      <div
        style={{
          width: 44,
          height: 36,
          borderRadius: 6,
          background: '#f2f3f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon style={{ fontSize: 18, color: '#5a5c5f' }} />
      </div>
      <Text
        style={{
          fontSize: 12,
          color: 'rgba(0,0,0,0.88)',
          lineHeight: '18px',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {meta.label}
      </Text>
    </div>
  );
}
