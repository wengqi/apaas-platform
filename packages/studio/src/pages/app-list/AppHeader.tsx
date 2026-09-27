/**
 * 应用列表页 — 顶部导航栏（从 AppList.tsx 拆分，AGENTS.md 单文件 400 行规范）。
 *
 * 品牌区 +「平台管理」入口（仅平台超管/租户管理员可见）+ 用户下拉菜单。
 */

import { Avatar, Button, Dropdown, Space, Typography } from 'antd';
import {
  ApartmentOutlined,
  AuditOutlined,
  GlobalOutlined,
  LogoutOutlined,
  ThunderboltFilled,
  UserOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';

const { Text } = Typography;

interface AppHeaderProps {
  isPlatformAdmin: boolean;
  isTenantAdmin: boolean;
  userName: string;
  userAvatar?: string | undefined;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

/** 应用列表页顶部导航。 */
export default function AppHeader({
  isPlatformAdmin,
  isTenantAdmin,
  userName,
  userAvatar,
  onNavigate,
  onLogout,
}: AppHeaderProps) {
  /** 平台管理入口菜单项 — 按角色显示。 */
  const adminMenuItems: MenuProps['items'] = [
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
    ...(isTenantAdmin
      ? [
          {
            key: 'users',
            icon: <UserOutlined />,
            label: '用户管理',
            onClick: () => onNavigate('/platform/users'),
          },
          {
            key: 'orgs',
            icon: <ApartmentOutlined />,
            label: '组织架构',
            onClick: () => onNavigate('/platform/orgs'),
          },
          {
            key: 'audit-logs',
            icon: <AuditOutlined />,
            label: '审计日志',
            onClick: () => onNavigate('/platform/audit-logs'),
          },
        ]
      : []),
  ];

  /** 用户下拉菜单项。 */
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
    ...(isTenantAdmin
      ? [
          {
            key: 'users',
            icon: <UserOutlined />,
            label: '用户管理',
            onClick: () => onNavigate('/platform/users'),
          },
          {
            key: 'orgs',
            icon: <ApartmentOutlined />,
            label: '组织架构',
            onClick: () => onNavigate('/platform/orgs'),
          },
          {
            key: 'audit-logs',
            icon: <AuditOutlined />,
            label: '审计日志',
            onClick: () => onNavigate('/platform/audit-logs'),
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

  return (
    <div
      style={{
        height: 56,
        background: '#fff',
        borderBottom: '1px solid #eef0f4',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}
    >
      <Space size={16}>
        <Space size={8}>
          <ThunderboltFilled style={{ fontSize: 20, color: '#1677ff' }} />
          <Text strong style={{ fontSize: 16 }}>
            aPaaS Studio
          </Text>
        </Space>
        {/* 管理入口 — 仅平台超管或租户管理员可见 */}
        {(isPlatformAdmin || isTenantAdmin) && (
          <Dropdown menu={{ items: adminMenuItems }} placement="bottomLeft">
            <Button type="text" style={{ fontSize: 14 }}>
              平台管理
            </Button>
          </Dropdown>
        )}
      </Space>
      <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
        <Space style={{ cursor: 'pointer' }}>
          <Avatar size="small" icon={<UserOutlined />} src={userAvatar} />
          <Text style={{ fontSize: 14 }}>{userName}</Text>
        </Space>
      </Dropdown>
    </div>
  );
}
