import { useMemo } from 'react';
import { Layout, Menu, theme, Dropdown, Space, Avatar, Button, Skeleton, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  DatabaseOutlined,
  LayoutOutlined,
  ApartmentOutlined,
  SafetyOutlined,
  LogoutOutlined,
  UserOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth.js';
import { appsApi } from '../api/apps.js';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

/**
 * Studio 三栏布局(应用上下文)。
 * 左侧导航为应用内菜单(工作台/对象/页面/流程/权限)，
 * 顶栏左侧为「返回应用列表」，右侧为用户菜单。
 * appId 来自路由参数，并通过 React Query 获取当前应用信息显示在侧边栏顶部。
 */
export default function StudioLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { appId } = useParams<{ appId: string }>();
  const { user, logout } = useAuthStore();
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  /** 获取当前应用信息(侧边栏顶部展示名称+图标)。 */
  const { data: app, isLoading: appLoading } = useQuery({
    queryKey: ['app', appId],
    queryFn: () => appsApi.get(appId as string),
    enabled: !!appId,
  });

  /** 应用内导航菜单项(链接含 appId)。 */
  const menuItems: MenuProps['items'] = useMemo(
    () => [
      { key: 'dashboard', icon: <DashboardOutlined />, label: '工作台' },
      { key: 'objects', icon: <DatabaseOutlined />, label: '对象' },
      { key: 'pages', icon: <LayoutOutlined />, label: '页面' },
      { key: 'processes', icon: <ApartmentOutlined />, label: '流程' },
      { key: 'permissions', icon: <SafetyOutlined />, label: '权限' },
    ],
    [],
  );

  /** 当前选中菜单项:取 /app/:appId 之后的第二段。 */
  const selectedKey = useMemo(() => {
    const seg = location.pathname.split('/')[3] ?? 'dashboard';
    return seg;
  }, [location.pathname]);

  /**
   * 是否全屏模式(页面搭建器需要三栏撑满,不套白色卡片层)。
   * 匹配 /app/:appId/pages/:pageId 路径。
   */
  const isFullBleed = useMemo(() => {
    const segments = location.pathname.split('/');
    // /app/:appId/pages/:pageId → segments[3] === 'pages' 且 segments[4] 存在
    return segments[3] === 'pages' && !!segments[4];
  }, [location.pathname]);

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => {
        logout();
        navigate('/login', { replace: true });
      },
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        breakpoint="lg"
        collapsible
        width={220}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        {/* 侧边栏顶部：当前应用名称 + 图标 */}
        <div
          style={{
            height: 56,
            margin: '12px 12px 8px',
            padding: '0 12px',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 8,
          }}
        >
          {appLoading ? (
            <Skeleton
              active
              avatar={{ size: 28 }}
              paragraph={{ rows: 1, width: 80 }}
              title={false}
            />
          ) : (
            <>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: `linear-gradient(135deg, ${app?.color ?? '#1677ff'}, ${app?.color ?? '#1677ff'}dd)`,
                  color: '#fff',
                  fontSize: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {app?.icon ?? '📦'}
              </div>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {app?.name ?? 'aPaaS Studio'}
              </span>
            </>
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(`/app/${appId}/${key}`)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout style={{ marginLeft: 220 }}>
        <Header
          style={{
            padding: '0 24px',
            background: colorBgContainer,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            height: 56,
            lineHeight: '56px',
            borderBottom: '1px solid #eef0f4',
            boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/apps')}
            style={{ fontSize: 13 }}
          >
            返回应用列表
          </Button>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar
                size="small"
                icon={<UserOutlined />}
                src={user?.avatar ?? undefined}
              />
              <Text style={{ fontSize: 14 }}>
                {user?.name ?? user?.email ?? '未登录'}
              </Text>
            </Space>
          </Dropdown>
        </Header>
        <Content
          style={{
            margin: 0,
            padding: isFullBleed ? 0 : 24,
            background: '#f5f7fa',
            minHeight: 'calc(100vh - 56px)',
          }}
        >
          {isFullBleed ? (
            <Outlet />
          ) : (
            <div
              style={{
                padding: 28,
                minHeight: 360,
                background: colorBgContainer,
                borderRadius: 12,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <Outlet />
            </div>
          )}
        </Content>
      </Layout>
    </Layout>
  );
}
