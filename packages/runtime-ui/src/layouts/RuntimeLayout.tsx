import { Avatar, Dropdown, Layout, Space, Typography, Button, Select } from 'antd';
import { LogoutOutlined, UserOutlined, HomeOutlined, CheckSquareOutlined } from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@apaas/shared/stores';
import NotificationBell from '../components/NotificationBell';
import { useIsMobile } from '../hooks/useIsMobile';

const { Header, Content } = Layout;
const { Title } = Typography;

/**
 * 运行时布局 — 顶部导航栏(应用名 + 导航 + 用户菜单) + 内容区(Outlet)。
 * 移动端（<768px）：导航收起为纯图标、内容边距压缩（Phase 2.9 响应式适配）。
 */
export default function RuntimeLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const navBtnStyle = (path: string): React.CSSProperties => ({
    color:
      location.pathname === path || (path === '/home' && location.pathname === '/home')
        ? '#fff'
        : 'rgba(255,255,255,0.65)',
    background: location.pathname.startsWith(path) ? 'rgba(255,255,255,0.15)' : 'transparent',
    border: 'none',
  });

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '0 12px' : '0 24px',
          background: '#001529',
        }}
      >
        <Space size={isMobile ? 'small' : 'large'} align="center">
          <Title level={isMobile ? 5 : 4} style={{ color: '#fff', margin: 0 }}>
            aPaaS Runtime
          </Title>
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
            <Space style={{ cursor: 'pointer', color: '#fff' }} align="center">
              <Avatar icon={<UserOutlined />} />
              {!isMobile && <span>{user?.name ?? '未登录'}</span>}
            </Space>
          </Dropdown>
        </Space>
      </Header>
      <Content style={{ padding: isMobile ? 12 : 24 }}>
        <Outlet />
      </Content>
    </Layout>
  );
}
