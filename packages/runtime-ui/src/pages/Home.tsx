import { Button, Card, Row, Col, Typography, Spin, Empty } from 'antd';
import { AppstoreOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { qk, useAuthStore } from '@apaas/shared/stores';
import { useNavigate } from 'react-router-dom';
import { appsApi, type AppSummary } from '../api/apps';

const { Title, Paragraph, Text } = Typography;

/** GET /apps 对 400 的响应体形状（平台管理员无租户上下文）。 */
interface AppsErrorShape {
  response?: { status?: number; data?: { error?: { message?: string } } };
}

export default function Home() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const {
    data: apps,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.apps(),
    queryFn: appsApi.list,
  });

  // 评审整改：运行时只展示已发布(PUBLISHED)应用，草稿/已归档应用不可访问。
  // （2026-10-10 起服务端 ?runtime=1 已做同等过滤 + 权限归纳，此处保留为兜底）
  const visibleApps = (apps ?? []).filter((a: AppSummary) => a.status === 'PUBLISHED');

  // 平台超管无租户上下文：登录页已分流，但 hash token / 共享 store 仍可能进入——
  // /apps 返回 400（非 401，不触发登出），此前静默变空列表，须显式提示
  const isPlatformAdmin = user?.isPlatformAdmin ?? false;
  const errBody = (error as AppsErrorShape | null)?.response;
  const noTenantContext =
    isPlatformAdmin ||
    (errBody?.status === 400 && /平台管理员/.test(errBody?.data?.error?.message ?? ''));

  return (
    <Card>
      <Title level={4}>
        <AppstoreOutlined /> 我的应用
      </Title>
      <Paragraph type="secondary">选择一个应用开始使用</Paragraph>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : noTenantContext ? (
        <Empty description="平台管理员无租户上下文，请以租户账号登录运行时">
          <Button
            type="primary"
            onClick={() => {
              logout();
              navigate('/login', { replace: true });
            }}
          >
            返回登录
          </Button>
        </Empty>
      ) : error ? (
        <Empty description="应用列表加载失败，请稍后重试">
          <Button onClick={() => void refetch()}>重试</Button>
        </Empty>
      ) : visibleApps.length === 0 ? (
        <Empty description="暂无可用应用" />
      ) : (
        <Row gutter={[16, 16]}>
          {visibleApps.map((app: AppSummary) => (
            <Col key={app.id} xs={24} sm={12} md={8} lg={6}>
              <Card hoverable onClick={() => navigate(`/app/${app.id}`)} style={{ height: '100%' }}>
                <Card.Meta
                  avatar={<span style={{ fontSize: 32 }}>{app.icon || '📦'}</span>}
                  title={app.name}
                  description={
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {app.description || app.apiName}
                      </Text>
                      <div style={{ marginTop: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {app.stats?.objects ?? 0} 对象 · {app.stats?.pages ?? 0} 页面 ·{' '}
                          {app.stats?.processes ?? 0} 流程
                        </Text>
                      </div>
                    </div>
                  }
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </Card>
  );
}
