/**
 * 左侧面板 — 页面列表 + 页签（组件 / 大纲树）。
 *
 * 对齐飞书 aPaaS v3 设计器：左栏上部为页面列表（可展开收起），
 * 下部为「组件 | 大纲树」页签区。状态数据/代码页签不在本期范围。
 */

import { useMemo, useState } from 'react';
import { Empty, Skeleton, Typography } from 'antd';
import {
  AppstoreOutlined,
  CaretRightOutlined,
  CodeOutlined,
  DatabaseOutlined,
  DownOutlined,
  PartitionOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { qk } from '@apaas/shared/stores';
import { pagesApi } from '../../api/pages.js';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import ComponentPanel from './ComponentPanel.js';
import OutlineTree from './OutlineTree.js';
import StateDataTab from './StateDataTab.js';
import CodeTab from './CodeTab.js';

const { Text } = Typography;

const PANEL_WIDTH = 280;

/** 左侧面板主组件。 */
export default function LeftPanel() {
  const [tab, setTab] = useState<'components' | 'outline' | 'state' | 'code'>('components');

  return (
    <div
      style={{
        width: PANEL_WIDTH,
        flexShrink: 0,
        height: '100%',
        background: '#fff',
        borderRight: '1px solid #e5e6eb',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <PageListSection />
      {/* 页签（飞书式：文字页签 + 选中加粗下划线） */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 12px',
          borderTop: '1px solid #f2f3f5',
          borderBottom: '1px solid #f2f3f5',
        }}
      >
        <TabButton
          label="组件"
          icon={<AppstoreOutlined />}
          active={tab === 'components'}
          onClick={() => setTab('components')}
        />
        <TabButton
          label="大纲树"
          icon={<PartitionOutlined />}
          active={tab === 'outline'}
          onClick={() => setTab('outline')}
        />
        <TabButton
          label="状态数据"
          icon={<DatabaseOutlined />}
          active={tab === 'state'}
          onClick={() => setTab('state')}
        />
        <TabButton
          label="代码"
          icon={<CodeOutlined />}
          active={tab === 'code'}
          onClick={() => setTab('code')}
        />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {tab === 'components' && <ComponentPanel />}
        {tab === 'outline' && <OutlineTree />}
        {tab === 'state' && <StateDataTab />}
        {tab === 'code' && <CodeTab />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 页面列表（可折叠）
// ---------------------------------------------------------------------------

function PageListSection() {
  const { appId, pageId } = useParams<{ appId: string; pageId: string }>();
  const [collapsed, setCollapsed] = useState(false);

  const { data: pages, isLoading } = useQuery({
    queryKey: qk.appPages(appId!),
    queryFn: () => pagesApi.list(appId!),
    enabled: !!appId,
  });

  const currentPage = usePageBuilderStore((s) => s.currentPage);
  const title = currentPage?.name ?? pages?.find((p) => p.id === pageId)?.name ?? '页面';

  return (
    <div style={{ flexShrink: 0, padding: '10px 12px 6px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setCollapsed((v) => !v)}
      >
        {collapsed ? (
          <CaretRightOutlined style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }} />
        ) : (
          <DownOutlined style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }} />
        )}
        <Text strong style={{ fontSize: 13 }}>
          {title}
        </Text>
      </div>
      {!collapsed && (
        <div style={{ marginTop: 6 }}>
          {isLoading ? (
            <Skeleton.Node active style={{ width: '100%', height: 24 }} />
          ) : (
            <PageListItems />
          )}
        </div>
      )}
    </div>
  );
}

/** 页面清单（当前页面高亮）。 */
function PageListItems() {
  const { appId, pageId } = useParams<{ appId: string; pageId: string }>();
  const { data: pages } = useQuery({
    queryKey: qk.appPages(appId!),
    queryFn: () => pagesApi.list(appId!),
    enabled: !!appId,
  });

  const items = useMemo(() => pages ?? [], [pages]);

  if (items.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="暂无页面"
        style={{ margin: '12px 0' }}
      />
    );
  }

  return (
    <div>
      {items.map((p) => {
        const active = p.id === pageId;
        return (
          <div
            key={p.id}
            style={{
              height: 28,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 8px',
              borderRadius: 4,
              background: active ? '#e1eaff' : 'transparent',
              cursor: 'default',
            }}
          >
            <Text
              style={{
                fontSize: 13,
                color: active ? '#1456f0' : 'rgba(0,0,0,0.88)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {p.name}
            </Text>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 页签按钮
// ---------------------------------------------------------------------------

function TabButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        padding: '8px 0',
        fontSize: 12,
        whiteSpace: 'nowrap',
        fontWeight: active ? 600 : 400,
        color: active ? '#1456f0' : 'rgba(0,0,0,0.65)',
        borderBottom: `2px solid ${active ? '#1456f0' : 'transparent'}`,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {icon}
      {label}
    </div>
  );
}
