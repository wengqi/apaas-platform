/**
 * 应用视图 — 列出应用下已发布页面，点击进入页面渲染。
 */

import { Card, Typography, Spin, Tag, List, Empty } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { appsApi } from '../api/apps';
import { pagesApi } from '../api/pages';

const { Title, Paragraph, Text } = Typography;

export default function AppView() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  const { data: app, isLoading: appLoading } = useQuery({
    queryKey: ['app', appId],
    queryFn: () => appsApi.get(appId!),
    enabled: !!appId,
  });

  const { data: pages, isLoading: pagesLoading } = useQuery({
    queryKey: ['app-pages', appId],
    queryFn: () => pagesApi.list(appId!),
    enabled: !!appId,
  });

  if (appLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const publishedPages = (pages ?? []).filter((p) => p.published);

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
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
      </Card>

      <Card title={<><FileTextOutlined /> 已发布页面</>}>
        {pagesLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : publishedPages.length === 0 ? (
          <Empty description="暂无已发布页面" />
        ) : (
          <List
            dataSource={publishedPages}
            renderItem={(page) => (
              <List.Item
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/app/${appId}/p/${page.apiName}`)}
              >
                <List.Item.Meta
                  title={page.name}
                  description={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      /{page.apiName} · {page.type}
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
}
