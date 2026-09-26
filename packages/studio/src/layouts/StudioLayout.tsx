import { useMemo, useState } from 'react';
import {
  Layout,
  Menu,
  theme,
  Dropdown,
  Space,
  Avatar,
  Button,
  Skeleton,
  Typography,
  Drawer,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  DatabaseOutlined,
  LayoutOutlined,
  ApartmentOutlined,
  SafetyOutlined,
  BellOutlined,
  LogoutOutlined,
  UserOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  HistoryOutlined,
  GlobalOutlined,
  ApiOutlined,
  FundProjectionScreenOutlined,
  CloudOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { qk, useAuthStore } from '@apaas/shared/stores';
import { appsApi } from '../api/apps.js';
import CheckPanel from '../components/publish/CheckPanel.js';

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
  const [checkDrawerOpen, setCheckDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  /** 获取当前应用信息(侧边栏顶部展示名称+图标)。 */
  const { data: app, isLoading: appLoading } = useQuery({
    queryKey: qk.app(appId!),
    queryFn: () => appsApi.get(appId as string),
    enabled: !!appId,
  });

  /** 应用内导航菜单项(链接含 appId)。 */
  const menuItems: MenuProps['items'] = useMemo(
    () => [
      { key: 'dashboard', icon: <DashboardOutlined />, label: '工作台' },
      { key: 'objects', icon: <DatabaseOutlined />, label: '对象' },
      { key: 'pages', icon: <LayoutOutlined />, label: '页面' },
      { key: 'datasets', icon: <FundProjectionScreenOutlined />, label: '数据集' },
      { key: 'processes', icon: <ApartmentOutlined />, label: '流程' },
      { key: 'processes/notifications', icon: <BellOutlined />, label: '通知模板' },
      { key: 'permissions', icon: <SafetyOutlined />, label: '权限' },
      { key: 'connectors', icon: <ApiOutlined />, label: '连接器' },
      { key: 'cloud-functions', icon: <CloudOutlined />, label: '云函数' },
    ],
    [],
  );

  /** 当前选中菜单项:取 /app/:appId 之后的路径段(支持二级路径如 processes/notifications)。 */
  const selectedKey = useMemo(() => {
    const segments = location.pathname.split('/');
    const seg3 = segments[3] ?? 'dashboard';
    const seg4 = segments[4];
    // processes/notifications 单独高亮
    if (seg3 === 'processes' && seg4 === 'notifications') return 'processes/notifications';
    if (seg3 === 'processes' && seg4 === 'monitor') return 'processes';
    return seg3;
  }, [location.pathname]);

  /**
   * 是否全屏模式(页面搭建器 / 流程编辑器 / 流程监控需要三栏撑满,不套白色卡片层)。
   * 匹配:
   *   /app/:appId/pages/:pageId          → 页面搭建器
   *   /app/:appId/processes/:processId   → 流程编辑器(简化/标准)
   *   /app/:appId/processes/monitor      → 流程监控
   */
  const isFullBleed = useMemo(() => {
    const segments = location.pathname.split('/');
    // segments[0]='' segments[1]='app' segments[2]=appId segments[3]=模块 segments[4]=子路径
    return (
      (segments[3] === 'pages' && !!segments[4]) || (segments[3] === 'processes' && !!segments[4])
    );
  }, [location.pathname]);

  const userMenuItems: MenuProps['items'] = [
    // 平台超管显示返回租户管理
    ...(user?.isPlatformAdmin
      ? [
          {
            key: 'tenants',
            icon: <GlobalOutlined />,
            label: '租户管理',
            onClick: () => navigate('/platform/tenants'),
          },
        ]
      : []),
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
        collapsed={collapsed}
        onCollapse={setCollapsed}
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
      <Layout style={{ marginLeft: collapsed ? 80 : 220 }}>
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
          <Space>
            <Button icon={<CheckCircleOutlined />} onClick={() => setCheckDrawerOpen(true)}>
              检查
            </Button>
            <Button icon={<HistoryOutlined />} onClick={() => navigate(`/app/${appId}/versions`)}>
              发布历史
            </Button>
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              onClick={() => navigate(`/app/${appId}/publish`)}
            >
              发布
            </Button>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar size="small" icon={<UserOutlined />} src={user?.avatar ?? undefined} />
                <Text style={{ fontSize: 14 }}>{user?.name ?? user?.email ?? '未登录'}</Text>
              </Space>
            </Dropdown>
          </Space>
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
      <Drawer
        title="预检"
        open={checkDrawerOpen}
        onClose={() => setCheckDrawerOpen(false)}
        width={420}
      >
        {appId && <CheckPanel appId={appId} />}
      </Drawer>
    </Layout>
  );
}
