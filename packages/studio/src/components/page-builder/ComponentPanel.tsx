import { useMemo, useState } from 'react';
import { Button, Collapse, Input, Typography } from 'antd';
import { DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { useDraggable } from '@dnd-kit/core';
import { DESIGNER_GROUPS, COMPONENT_META } from '../../constants/pageComponents.js';
import { useCompositesStore } from '../../stores/page-builder/composites.js';
import type { ComponentNode, ComponentType } from '../../api/pages.js';

const { Text } = Typography;

/** 拖拽数据:从组件面板拖出。 */
export interface PanelDragData {
  source: 'panel';
  componentType: ComponentType;
}

/** 拖拽数据:从自定义（复合组件）面板拖出的子树。 */
export interface CompositePanelDragData {
  source: 'panel-composite';
  node: ComponentNode;
}

/**
 * 组件面板（左栏「组件」页签内容）。
 * 对齐飞书 aPaaS：搜索框 + 可折叠分组 + 4 列图标卡片（浅灰图标底 + 名称）。
 */
export default function ComponentPanel() {
  const [keyword, setKeyword] = useState('');
  const [subTab, setSubTab] = useState<'base' | 'custom'>('base');
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
      {/* 面板子页签（基础物料 / 自定义复合组件，对齐飞书「基础/自定义」） */}
      <div style={{ padding: '0 12px 6px', flexShrink: 0, display: 'flex', gap: 8 }}>
        <SubTabButton label="基础" active={subTab === 'base'} onClick={() => setSubTab('base')} />
        <SubTabButton
          label="自定义"
          active={subTab === 'custom'}
          onClick={() => setSubTab('custom')}
        />
      </div>
      {subTab === 'base' ? (
        <>
          {/* 搜索框 */}
          <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
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
        </>
      ) : (
        <CompositeList />
      )}
    </div>
  );
}

/** 子页签按钮。 */
function SubTabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type={active ? 'primary' : 'default'}
      size="small"
      onClick={onClick}
      style={{ flex: 1 }}
    >
      {label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// 自定义（复合组件）面板
// ---------------------------------------------------------------------------

/** 复合组件列表：拖拽复用 + 删除。 */
function CompositeList() {
  const composites = useCompositesStore((s) => s.composites);
  const removeComposite = useCompositesStore((s) => s.removeComposite);

  if (composites.length === 0) {
    return (
      <div style={{ padding: '16px 12px' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          暂无复合组件。选中画布中的组件后，在右侧属性面板点击「保存为复合组件」，即可在此拖拽复用。
        </Text>
      </div>
    );
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {composites.map((comp) => (
        <CompositeItem
          key={comp.id}
          id={comp.id}
          name={comp.name}
          node={comp.node}
          onRemove={removeComposite}
        />
      ))}
    </div>
  );
}

/** 复合组件拖拽项。 */
function CompositeItem({
  id,
  name,
  node,
  onRemove,
}: {
  id: string;
  name: string;
  node: ComponentNode;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `panel-composite-${id}`,
    data: {
      source: 'panel-composite',
      node,
    } as import('./ComponentPanel.js').CompositePanelDragData,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        padding: '6px 8px',
        margin: '0 4px 4px',
        border: '1px solid #e5e6eb',
        borderRadius: 6,
        background: isDragging ? '#e1eaff' : '#fff',
        cursor: 'grab',
        touchAction: 'none',
      }}
    >
      <Text
        style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {name}
      </Text>
      <Button
        type="text"
        size="small"
        icon={<DeleteOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(id);
        }}
      />
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
