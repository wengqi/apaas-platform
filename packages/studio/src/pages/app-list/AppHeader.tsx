/**
 * 应用列表页 — 顶部导航栏（素蓝顶栏导航版，2026-10-13）。
 *
 * 布局：品牌（方孔a + aPaaS Studio）+ 租户级导航（开发中心恒显；
 * 用户管理/组织架构/审计日志/观测中心/权限调试按管理员角色显隐；
 * 租户管理仅平台超管）+ 右侧用户下拉。
 * 原「平台管理」下拉退役——治理/运维入口升级为一级导航（用户裁决）。
 */

import { TOKENS as T, brandLogoMarkSvg } from '@apaas/shared/design';
import { Avatar, Button, Dropdown, Space, Typography } from 'antd';
import { GlobalOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useLocation } from 'react-router-dom';

const { Text } = Typography;

interface AppHeaderProps {
  isPlatformAdmin: boolean;
  isTenantAdmin: boolean;
  userName: string;
  userAvatar?: string | undefined;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

/** 顶栏导航项（租户级）。 */
interface NavItem {
  key: string;
  label: string;
  /** 可见角色：默认全员 */
  roles?: ('platform' | 'tenant')[];
}

const NAV_ITEMS: NavItem[] = [
  { key: '/apps', label: '开发中心' },
  { key: '/platform/users', label: '用户管理', roles: ['platform', 'tenant'] },
  { key: '/platform/orgs', label: '组织架构', roles: ['platform', 'tenant'] },
  { key: '/platform/audit-logs', label: '审计日志', roles: ['platform', 'tenant'] },
  { key: '/platform/observability', label: '观测中心', roles: ['platform', 'tenant'] },
  { key: '/platform/permission-debug', label: '权限调试', roles: ['platform', 'tenant'] },
  { key: '/platform/tenants', label: '租户管理', roles: ['platform'] },
];

/** 应用列表页顶部导航。 */
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

  const visibleNav = NAV_ITEMS.filter(
    (item) =>
      !item.roles ||
      (isPlatformAdmin && item.roles.includes('platform')) ||
      (isTenantAdmin && item.roles.includes('tenant')),
  );

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
          const active = location.pathname === item.key;
          return (
            <Button
              key={item.key}
              type="text"
              onClick={() => onNavigate(item.key)}
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
