/**
 * 应用列表页 — 应用卡片与网格（素蓝横排头版，2026-10-13）。
 *
 * 卡片结构：头部行（素蓝字母瓷片 + 名称 + apiName + ⋯）→ 描述（两行钳制）→
 * 元数据行（状态点 · 版本 · 资源统计）。AppGrid：加载骨架 / 空状态 / 网格。
 */

import { Button, Card, Col, Dropdown, Empty, Row, Skeleton, Typography } from 'antd';
import { AppstoreAddOutlined, MoreOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { appTileBackground, TOKENS as T } from '@apaas/shared/design';
import type { AppSummary } from '../../api/apps.js';
import { STATUS_LABEL } from './constants.js';

const { Paragraph, Text } = Typography;

interface AppCardProps {
  app: AppSummary;
  /** 现有分组名（卡片 ⋯ 菜单「移动到分组」弹窗使用） */
  groupNames?: string[];
  menuItems: MenuProps['items'];
  onMenuClick: (info: { key: string }) => void;
  onOpen: () => void;
}

/** 单张应用卡片（横排头，同高由网格 stretch 保证）。 */
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
        border: `1px solid ${T.colorBorderSecondary}`,
        boxShadow: 'none',
      }}
      styles={{ body: { padding: 20, display: 'flex', flexDirection: 'column', height: '100%' } }}
    >
      {/* 头部行：瓷片 + 名称/apiName + ⋯ */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: appTileBackground(app.color),
            color: T.colorWhite,
            fontSize: 16,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {(app.name || '应').slice(0, 1)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong style={{ fontSize: 15, display: 'block' }} ellipsis>
            {app.name}
          </Text>
          {/* studio 是开发者界面：apiName 是有用的开发者标识，保留（评审 P0 的
              apiName 去化只在 runtime Home/AppView 做） */}
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
            style={{ flexShrink: 0, color: T.colorTextTertiary }}
          />
        </Dropdown>
      </div>

      {/* 描述 */}
      <Paragraph
        type="secondary"
        ellipsis={{ rows: 2 }}
        style={{
          marginTop: 12,
          marginBottom: 0,
          fontSize: 12.5,
          lineHeight: 1.65,
          minHeight: 41,
        }}
      >
        {app.description || '暂无描述'}
      </Paragraph>

      {/* 元数据行：状态 · 版本 · 资源统计（钉底保证同排等高下缘对齐） */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: 12,
          borderTop: `1px solid ${T.colorSplit}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: T.colorTextTertiary,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: app.status === 'PUBLISHED' ? T.colorPrimary : T.colorDotIdle,
            flexShrink: 0,
          }}
        />
        <span style={{ color: T.colorTextSecondary }}>
          {STATUS_LABEL[app.status] ?? app.status}
        </span>
        <span>v{app.version}</span>
        <span style={{ marginLeft: 'auto' }}>
          {app.stats.objects} 对象 · {app.stats.pages} 页面 · {app.stats.processes} 流程
        </span>
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
      <Row gutter={[16, 16]}>
        {[1, 2, 3, 4].map((i) => (
          <Col key={i} xs={24} md={12}>
            <Card style={{ borderRadius: 12 }}>
              <Skeleton active avatar paragraph={{ rows: 2 }} />
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
    <Row gutter={[16, 16]}>
      {apps.map((app) => (
        <Col key={app.id} xs={24} md={12}>
          {renderCard(app)}
        </Col>
      ))}
    </Row>
  );
}
