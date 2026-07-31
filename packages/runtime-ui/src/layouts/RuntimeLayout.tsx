import { Avatar, Dropdown, Layout, Space, Typography } from 'antd';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';

const { Header, Content } = Layout;
const { Title } = Typography;

/**
 * 运行时布局 — 顶部导航栏(应用名 + 用户菜单) + 内容区(Outlet)。
 * 与 Studio 的区别:Runtime UI 面向终端用户,简洁、无搭建工具栏/设计器。
 */
export default function RuntimeLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          background: '#001529',
        }}
      >
        <Title level={4} style={{ color: '#fff', margin: 0 }}>
          aPaaS Runtime
        </Title>
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
            <span>{user?.name ?? '未登录'}</span>
          </Space>
        </Dropdown>
      </Header>
      <Content style={{ padding: 24 }}>
        <Outlet />
      </Content>
    </Layout>
  );
}
