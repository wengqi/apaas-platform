/**
 * 应用列表页 — 应用卡片与网格（从 AppList.tsx 拆分，AGENTS.md 单文件 400 行规范）。
 *
 * AppCard：单张应用卡片（图标/名称/更多操作/描述/状态版本/资源统计）。
 * AppGrid：加载骨架、空状态与卡片网格布局。
 */

import { Button, Card, Col, Dropdown, Empty, Row, Skeleton, Space, Tag, Typography } from 'antd';
import {
  ApartmentOutlined,
  AppstoreAddOutlined,
  DatabaseOutlined,
  LayoutOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { appTileBackground, appTileShadow, TOKENS as T } from '@apaas/shared/design';
import type { AppSummary } from '../../api/apps.js';
import { STATUS_COLOR, STATUS_LABEL } from './constants.js';

const { Paragraph, Text } = Typography;

interface AppCardProps {
  app: AppSummary;
  menuItems: MenuProps['items'];
  onMenuClick: (info: { key: string }) => void;
  onOpen: () => void;
}

/** 单张应用卡片。 */
export function AppCard({ app, menuItems, onMenuClick, onOpen }: AppCardProps) {
  /** 键盘可达（a11y 2026-10-12 审计）：卡片承载整卡点击导航，Enter/Space 等效触发。 */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    <Card
      hoverable
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        height: '100%',
        borderRadius: 12,
        overflow: 'hidden',
        transition: 'all 0.3s ease',
        border: `1px solid ${T.colorBorderSecondary}`,
      }}
      styles={{ body: { padding: 20 } }}
    >
      {/* 图标 + 名称 + 更多操作 */}
      <Space align="start" style={{ width: '100%' }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            background: appTileBackground(app.color),
            color: T.colorWhite,
            fontSize: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: appTileShadow(app.color),
          }}
          aria-hidden
        >
          {app.icon ?? '📦'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong style={{ fontSize: 16, display: 'block' }} ellipsis>
            {app.name}
          </Text>
          {/* studio 是开发者界面：apiName 是有用的开发者标识，保留（runtime 侧才是
              业务用户，评审 P0 的 apiName 去化只在 runtime Home/AppView 做） */}
          <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
            {app.apiName}
          </Text>
        </div>
        <Dropdown
          menu={{
            items: menuItems,
            onClick: (info) => {
              info.domEvent?.stopPropagation();
              onMenuClick(info);
            },
          }}
          placement="bottomRight"
          trigger={['click']}
        >
          <Button
            type="text"
            size="small"
            icon={<MoreOutlined />}
            onClick={(e) => e.stopPropagation()}
            aria-label={`应用「${app.name}」更多操作`}
            style={{ flexShrink: 0, color: 'rgba(0,0,0,0.65)' }}
          />
        </Dropdown>
      </Space>

      {/* 描述 */}
      <Paragraph
        type="secondary"
        ellipsis={{ rows: 2 }}
        style={{ marginTop: 14, marginBottom: 14, minHeight: 44, fontSize: 13, lineHeight: 1.6 }}
      >
        {app.description || '暂无描述'}
      </Paragraph>

      {/* 状态 + 版本 */}
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Tag color={STATUS_COLOR[app.status] ?? 'default'} style={{ margin: 0, fontSize: 12 }}>
          {STATUS_LABEL[app.status] ?? app.status}
        </Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          v{app.version}
        </Text>
      </Space>

      {/* 资源统计（对比度治理：原三级灰 3.4:1 不达 AA，升为二级文字 7:1） */}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.colorSplit}` }}>
        <Space size="middle" style={{ fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>
          <Space size={4}>
            <DatabaseOutlined style={{ color: T.colorPrimary }} />
            <span>{app.stats.objects} 对象</span>
          </Space>
          <Space size={4}>
            <LayoutOutlined style={{ color: T.colorSuccess }} />
            <span>{app.stats.pages} 页面</span>
          </Space>
          <Space size={4}>
            <ApartmentOutlined style={{ color: T.colorWarning }} />
            <span>{app.stats.processes} 流程</span>
          </Space>
        </Space>
      </div>
    </Card>
  );
}

interface AppGridProps {
  apps: AppSummary[] | undefined;
  isLoading: boolean;
  onCreate: () => void;
  renderCard: (app: AppSummary) => React.ReactNode;
}

/** 应用卡片网格（含加载骨架与空状态）。 */
export default function AppGrid({ apps, isLoading, onCreate, renderCard }: AppGridProps) {
  if (isLoading) {
    return (
      <Row gutter={[20, 20]}>
        {[1, 2, 3, 4].map((i) => (
          <Col key={i} xs={24} sm={12} md={8} lg={6}>
            <Card style={{ borderRadius: 12 }}>
              <Skeleton active avatar paragraph={{ rows: 3 }} />
            </Card>
          </Col>
        ))}
      </Row>
    );
  }

  if (!apps || apps.length === 0) {
    return (
      <Card
        style={{
          borderRadius: 12,
          border: `2px dashed ${T.colorBorderSecondary}`,
          background: T.colorWhite,
        }}
      >
        <Empty description="还没有应用" style={{ padding: '60px 0' }}>
          <Button type="primary" size="large" icon={<AppstoreAddOutlined />} onClick={onCreate}>
            创建第一个应用
          </Button>
        </Empty>
      </Card>
    );
  }

  return (
    <Row gutter={[20, 20]}>
      {apps.map((app) => (
        <Col key={app.id} xs={24} sm={12} md={8} lg={6}>
          {renderCard(app)}
        </Col>
      ))}
    </Row>
  );
}
