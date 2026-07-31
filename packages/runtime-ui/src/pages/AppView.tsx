import { Card, Typography, Spin, Tag } from 'antd';
import { DesktopOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { appsApi } from '../api/apps';

const { Title, Paragraph, Text } = Typography;

export default function AppView() {
  const { appId } = useParams();
  const { data: app, isLoading } = useQuery({
    queryKey: ['app', appId],
    queryFn: () => appsApi.get(appId!),
    enabled: !!appId,
  });

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Card>
      <Title level={4}>
        <span style={{ fontSize: 28, marginRight: 8 }}>{app?.icon || '📦'}</span>
        {app?.name ?? '应用视图'}
      </Title>
      <Paragraph type="secondary">
        {app?.description || app?.apiName || `应用 ID: ${appId ?? '未知'}`}
      </Paragraph>
      {app && (
        <div style={{ marginBottom: 16 }}>
          <Tag color={app.status === 'PUBLISHED' ? 'green' : 'default'}>
            {app.status === 'PUBLISHED' ? '已发布' : '开发中'}
          </Tag>
          <Tag>v{app.version}</Tag>
          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            {app.stats.objects} 对象 · {app.stats.pages} 页面 · {app.stats.processes} 流程
          </Text>
        </div>
      )}
      <Card type="inner" title={<><DesktopOutlined /> 运行时页面</>}>
        <Text type="warning">
          Phase 2+ 待实现：动态页面渲染引擎（读取应用页面 Schema，递归渲染组件树）
        </Text>
      </Card>
    </Card>
  );
}
