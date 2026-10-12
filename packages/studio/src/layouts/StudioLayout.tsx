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
  Badge,
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
  FileSearchOutlined,
  FileDoneOutlined,
  CloudServerOutlined,
  KeyOutlined,
  CodeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { qk, useAuthStore } from '@apaas/shared/stores';
import { appsApi } from '../api/apps.js';
import { reviewsApi } from '../api/reviews.js';
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

  /** 待审提交单数（审核中心入口徽标，R1.2）。 */
  const { data: pendingReviews } = useQuery({
    queryKey: qk.reviews(appId!, 'PENDING'),
    queryFn: () => reviewsApi.list(appId!, { status: 'PENDING' }),
    enabled: !!appId,
  });
  const pendingCount = pendingReviews?.length ?? 0;

  /** 应用内导航菜单项(链接含 appId)。 */
  const menuItems: MenuProps['items'] = useMemo(
    () => [
      { key: 'dashboard', icon: <DashboardOutlined />, label: '工作台' },
      { key: 'objects', icon: <DatabaseOutlined />, label: '对象' },
      { key: 'pages', icon: <LayoutOutlined />, label: '页面' },
      { key: 'datasets', icon: <FundProjectionScreenOutlined />, label: '数据集' },
      { key: 'processes', icon: <ApartmentOutlined />, label: '流程' },
      { key: 'processes/notifications', icon: <BellOutlined />, label: '通知模板' },
      {
        key: 'reviews',
        icon: <FileDoneOutlined />,
        // 用户实测（2026-10-03）：label 不能包在 Badge 里——span.ant-badge 不继承
        // 暗色菜单字体色（该项显纯白，其他项 rgba(255,255,255,0.65)）。改为
        // 纯文本 + 有待审时旁挂独立计数徽标（无子元素 Badge 不影响文字色）。
        label:
          pendingCount > 0 ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              审核中心
              <Badge count={pendingCount} size="small" />
            </span>
          ) : (
            '审核中心'
          ),
      },
      { key: 'permissions', icon: <SafetyOutlined />, label: '权限' },
      { key: 'connectors', icon: <ApiOutlined />, label: '连接器' },
      { key: 'cloud-functions', icon: <CloudOutlined />, label: '云函数' },
      { key: 'environments', icon: <CloudServerOutlined />, label: '环境管理' },
      { key: 'api-keys', icon: <KeyOutlined />, label: 'API 密钥' },
      { key: 'embed', icon: <CodeOutlined />, label: '嵌入集成' },
      { key: 'audit-logs', icon: <FileSearchOutlined />, label: '审计日志' },
    ],
    [pendingCount],
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
      {/* 上部统一顶栏：应用标题（原 Sider 头部）与工具操作合并（QA 2026-10-06） */}
      <Header
        style={{
          padding: '0 16px',
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
        <Space size={12}>
          {appLoading ? (
            <Skeleton
              active
              avatar={{ size: 28 }}
              paragraph={{ rows: 1, width: 120 }}
              title={false}
            />
          ) : (
            <Space
              size={8}
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/app/${appId}/dashboard`)}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: `linear-gradient(135deg, ${app?.color ?? '#1677ff'}, ${app?.color ?? '#1677ff'}dd)`,
                  color: '#fff',
                  fontSize: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {app?.icon ?? '📦'}
              </div>
              <Text strong style={{ fontSize: 15 }}>
                {app?.name ?? 'aPaaS Studio'}
              </Text>
            </Space>
          )}
          <div style={{ width: 1, height: 22, background: '#e5e7eb' }} />
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/apps')}
            style={{ fontSize: 13 }}
          >
            返回应用列表
          </Button>
        </Space>
        <Space>
          <Button icon={<CheckCircleOutlined />} onClick={() => setCheckDrawerOpen(true)}>
            检查
          </Button>
          <Button icon={<HistoryOutlined />} onClick={() => navigate(`/app/${appId}/versions`)}>
            版本历史
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
      {/* 下部左右分栏：左侧菜单（宽度最小化）+ 右侧主内容 */}
      <Layout style={{ flex: 1, minHeight: 0 }}>
        <Sider
          breakpoint="lg"
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={150}
          theme="light"
          trigger={null}
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            // 浅色主题（QA 2026-10-06：与右侧主内容区协调，弃深色侧栏）
            background: '#f7f9fc',
            borderRight: '1px solid #ebedf0',
          }}
        >
          <Menu
            theme="light"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={({ key }) => navigate(`/app/${appId}/${key}`)}
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              borderRight: 0,
              background: 'transparent',
            }}
          />
          {/* 自绘折叠控制（QA 2026-10-06：替换默认 48px 白条 trigger——
              贴靠页面底部固定（菜单滚动时按钮始终在底部可见），轻投影保持悬浮感） */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '10px 12px 8px',
              borderTop: '1px solid #ebedf0',
            }}
          >
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? '展开菜单' : '收起菜单'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: collapsed ? 32 : 110,
                height: 28,
                border: '1px solid #e5e7eb',
                borderRadius: 14,
                background: '#fff',
                color: 'rgba(0,0,0,0.65)',
                fontSize: 12,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e6f4ff';
                e.currentTarget.style.borderColor = '#91caff';
                e.currentTarget.style.color = '#1677ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#fff';
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.color = 'rgba(0,0,0,0.65)';
              }}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              {!collapsed && <span>收起菜单</span>}
            </button>
          </div>
        </Sider>
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
