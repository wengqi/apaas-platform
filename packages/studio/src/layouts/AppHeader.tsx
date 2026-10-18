/**
 * 租户级工作台 — 持久顶栏导航（素蓝，2026-10-18 由 pages/app-list 迁入布局层）。
 *
 * 由 TenantLayout 渲染，开发中心与 /platform/* 治理页共用——导航在任何租户级
 * 页面常显，选中项随路由点亮（前缀匹配，租户详情等二级路由保持父项选中）。
 * 布局：品牌（方孔a + aPaaS Studio）+ 租户级导航 + 右侧用户下拉。
 * 可见性模型见 ./app-header-nav.ts（超管=平台控制台，仅见租户管理）。
 */

import { TOKENS as T, brandLogoMarkSvg } from '@apaas/shared/design';
import { Avatar, Button, Dropdown, Space, Typography } from 'antd';
import { GlobalOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useLocation } from 'react-router-dom';
import { NAV_ITEMS, isNavActive, visibleNavItems } from './app-header-nav.js';

const { Text } = Typography;

interface AppHeaderProps {
  isPlatformAdmin: boolean;
  isTenantAdmin: boolean;
  userName: string;
  userAvatar?: string | undefined;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

/** 租户级工作台持久顶栏。 */
export default function AppHeader({
  isPlatformAdmin,
  isTenantAdmin,
  userName,
  userAvatar,
  onNavigate,
  onLogout,
}: AppHeaderProps) {
  const location = useLocation();

  const userMenuItems: MenuProps['items'] = [
    ...(isPlatformAdmin
      ? [
          {
            key: 'tenants',
            icon: <GlobalOutlined />,
            label: '租户管理',
            onClick: () => onNavigate('/platform/tenants'),
          },
        ]
      : []),
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: onLogout,
    },
  ];

  const visibleNav = visibleNavItems(NAV_ITEMS, isPlatformAdmin, isTenantAdmin);

  return (
    <div
      style={{
        height: 60,
        background: T.colorBgContainer,
        borderBottom: `1px solid ${T.colorBorderSecondary}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <Space size={12} style={{ cursor: 'pointer' }} onClick={() => onNavigate('/apps')}>
        <span
          aria-hidden
          dangerouslySetInnerHTML={{ __html: brandLogoMarkSvg(28) }}
          style={{ display: 'inline-flex' }}
        />
        <Text strong style={{ fontSize: 15.5, letterSpacing: '-0.01em' }}>
          aPaaS{' '}
          <Text type="secondary" style={{ fontWeight: 500 }}>
            Studio
          </Text>
        </Text>
      </Space>
      <nav style={{ display: 'flex', gap: 4, marginLeft: 22 }} aria-label="租户级导航">
        {visibleNav.map((item) => {
          const active = isNavActive(location.pathname, item.key);
          return (
            <Button
              key={item.key}
              type="text"
              onClick={() => onNavigate(item.key)}
              aria-current={active ? 'page' : undefined}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: active ? 600 : 500,
                color: active ? T.colorPrimary : T.colorTextSecondary,
                background: active ? T.colorPrimaryBg : 'transparent',
              }}
            >
              {item.label}
            </Button>
          );
        })}
      </nav>
      <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
        <button type="button" className="studio-header-user-btn" style={{ marginLeft: 'auto' }}>
          <Avatar size="small" icon={<UserOutlined />} src={userAvatar} />
          <Text style={{ fontSize: 13, color: T.colorTextSecondary }}>{userName}</Text>
        </button>
      </Dropdown>
    </div>
  );
}
