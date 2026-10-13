import { Avatar, Dropdown, Layout, Space, Typography, Button, Select, theme } from 'antd';
import { LogoutOutlined, UserOutlined, HomeOutlined, CheckSquareOutlined } from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@apaas/shared/stores';
import { LAYOUT, TOKENS as T, brandLogoMarkSvg } from '@apaas/shared/design';
import NotificationBell from '../components/NotificationBell';
import { useIsMobile } from '../hooks/useIsMobile';

const { Header, Content } = Layout;
const { Text } = Typography;

/**
 * 运行时布局 — 顶部导航栏(应用名 + 导航 + 用户菜单) + 内容区(Outlet)。
 * 移动端（<768px）：导航收起为纯图标、内容边距压缩（Phase 2.9 响应式适配）。
 *
 * 视觉世界（2026-10-12 评审 P1）：与 studio 对齐为浅色头部——此前的深顶栏
 * 是 AntD 文档示例默认色，与 studio 白顶栏构成"两家公司"观感；
 * 几何（56px/分隔线）消费 @apaas/shared/design 的 LAYOUT token。
 */
export default function RuntimeLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const {
    token: { colorBgContainer, colorBorderSecondary },
  } = theme.useToken();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const navBtnStyle = (path: string): React.CSSProperties => ({
    color: location.pathname.startsWith(path) ? T.colorPrimary : 'rgba(0,0,0,0.65)',
    background: location.pathname.startsWith(path) ? 'rgba(22,119,255,0.08)' : 'transparent',
    border: 'none',
  });

  return (
    <Layout style={{ minHeight: '100vh', background: LAYOUT.contentBg }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '0 12px' : '0 24px',
          height: LAYOUT.headerHeight,
          lineHeight: 1,
          background: colorBgContainer,
          borderBottom: `1px solid ${colorBorderSecondary}`,
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <Space size={isMobile ? 'small' : 'large'} align="center">
          <Space size={10} align="center">
            <span
              aria-hidden
              dangerouslySetInnerHTML={{ __html: brandLogoMarkSvg(28) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                alignSelf: 'stretch',
                flexShrink: 0,
              }}
            />
            <Text
              style={{
                fontSize: isMobile ? 14.5 : 15.5,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: 'rgba(0,0,0,0.88)',
              }}
            >
              aPaaS{' '}
              <Text type="secondary" style={{ fontWeight: 500, fontSize: isMobile ? 13.5 : 14.5 }}>
                Runtime
              </Text>
            </Text>
          </Space>
          <Space size="small">
            <Button
              type="text"
              icon={<HomeOutlined />}
              style={navBtnStyle('/home')}
              onClick={() => navigate('/home')}
            >
              {!isMobile && '我的应用'}
            </Button>
            <Button
              type="text"
              icon={<CheckSquareOutlined />}
              style={navBtnStyle('/tasks')}
              onClick={() => navigate('/tasks')}
            >
              {!isMobile && '任务中心'}
            </Button>
          </Space>
        </Space>
        <Space size="middle" align="center">
          {/* R1.4：环境切换（写入 URL ?env=，缺省 prod） */}
          <Select
            size="small"
            value={new URLSearchParams(window.location.search).get('env') ?? 'prod'}
            style={{ width: 92 }}
            onChange={(key: string) => {
              const params = new URLSearchParams(window.location.search);
              if (key === 'prod') params.delete('env');
              else params.set('env', key);
              navigate({ pathname: location.pathname, search: params.toString() });
            }}
            options={[
              { value: 'prod', label: '生产环境' },
              { value: 'dev', label: '开发环境' },
            ]}
          />
          <NotificationBell />
          <Dropdown
            placement="bottomRight"
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                },
              ],
              onClick: (info) => {
                if (info.key === 'logout') {
                  handleLogout();
                }
              },
            }}
          >
            {/* a11y（2026-10-12 审计）：原生 button 触发替代 Space（div）——
                此前不可聚焦，键盘用户无法打开用户菜单（无法登出）。
                hover/focus 态走 CSS（.runtime-header-user-btn，浅色头变体） */}
            <button type="button" className="runtime-header-user-btn">
              <Avatar size="small" icon={<UserOutlined />} />
              {!isMobile && <span>{user?.name ?? '未登录'}</span>}
            </button>
          </Dropdown>
        </Space>
      </Header>
      <Content style={{ padding: isMobile ? 12 : 24 }}>
        <Outlet />
      </Content>
    </Layout>
  );
}
