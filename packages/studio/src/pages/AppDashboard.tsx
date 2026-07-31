import { Card, Col, Row, Skeleton, Space, Statistic, Tag, Typography } from 'antd';
import {
  DatabaseOutlined,
  LayoutOutlined,
  ApartmentOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { appsApi } from '../api/apps.js';

const { Title, Paragraph, Text } = Typography;

/** 应用状态 → Tag 颜色映射。 */
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  PUBLISHED: 'green',
  ARCHIVED: 'red',
};

/** 应用状态 → 中文标签。 */
const STATUS_LABEL: Record<string, string> = {
  DRAFT: '开发中',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
};

/**
 * 应用内工作台 —— 进入应用后的首页。
 * 显示当前应用的资源统计与快捷入口。
 */
export default function AppDashboard() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  const { data: app, isLoading } = useQuery({
    queryKey: ['app', appId],
    queryFn: () => appsApi.get(appId as string),
    enabled: !!appId,
  });

  if (isLoading) {
    return <Skeleton active paragraph={{ rows: 6 }} />;
  }

  if (!app) {
    return (
      <Card>
        <Text type="secondary">应用不存在或无权访问。</Text>
      </Card>
    );
  }

  // app 可能是 AppSummary(含 stats) 或 Application(不含 stats)，安全取值
  const stats = 'stats' in app ? app.stats : { objects: 0, pages: 0, processes: 0 };

  /** 快捷入口卡片配置。 */
  const shortcuts = [
    {
      key: 'object',
      title: '创建对象',
      desc: '定义业务对象、字段与关系',
      icon: <DatabaseOutlined style={{ fontSize: 28, color: '#1677ff' }} />,
      bgColor: '#e6f4ff',
      path: 'objects',
    },
    {
      key: 'page',
      title: '创建页面',
      desc: '可视化拖拽搭建页面',
      icon: <LayoutOutlined style={{ fontSize: 28, color: '#52c41a' }} />,
      bgColor: '#f6ffed',
      path: 'pages',
    },
    {
      key: 'process',
      title: '创建流程',
      desc: '编排业务自动化流程',
      icon: <ApartmentOutlined style={{ fontSize: 28, color: '#fa8c16' }} />,
      bgColor: '#fff7e6',
      path: 'processes',
    },
  ];

  return (
    <div>
      {/* ── 应用信息头 ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${app.color ?? '#1677ff'}, ${app.color ?? '#1677ff'}dd)`,
            color: '#fff',
            fontSize: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: `0 6px 16px ${(app.color ?? '#1677ff')}30`,
          }}
        >
          {app.icon ?? '📦'}
        </div>
        <div>
          <Title level={3} style={{ margin: 0, lineHeight: 1.2 }}>
            {app.name}
          </Title>
          <Space size={8} style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {app.apiName}
            </Text>
            <Tag
              color={STATUS_COLOR[app.status] ?? 'default'}
              style={{ margin: 0, fontSize: 12 }}
            >
              {STATUS_LABEL[app.status] ?? app.status}
            </Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              v{app.version}
            </Text>
          </Space>
        </div>
      </div>
      <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 28 }}>
        {app.description || '暂无描述'}
      </Paragraph>

      {/* ── 资源统计 ── */}
      <Row gutter={16} style={{ marginBottom: 32 }}>
        <Col span={8}>
          <Card
            style={{ borderRadius: 10, border: 'none', background: '#fafbfc' }}
          >
            <Statistic
              title="对象"
              value={stats.objects}
              prefix={<DatabaseOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card
            style={{ borderRadius: 10, border: 'none', background: '#fafbfc' }}
          >
            <Statistic
              title="页面"
              value={stats.pages}
              prefix={<LayoutOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card
            style={{ borderRadius: 10, border: 'none', background: '#fafbfc' }}
          >
            <Statistic
              title="流程"
              value={stats.processes}
              prefix={<ApartmentOutlined style={{ color: '#fa8c16' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* ── 快捷入口 ── */}
      <Title level={5} style={{ marginBottom: 16 }}>
        快捷入口
      </Title>
      <Row gutter={16}>
        {shortcuts.map((s) => (
          <Col key={s.key} xs={24} sm={8}>
            <Card
              hoverable
              onClick={() => navigate(`/app/${appId}/${s.path}`)}
              style={{
                borderRadius: 10,
                border: '1px solid #eef0f4',
                transition: 'all 0.3s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 10,
                    background: s.bgColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {s.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <Text strong style={{ fontSize: 15 }}>
                    {s.title}
                  </Text>
                  <Paragraph
                    type="secondary"
                    style={{ fontSize: 12, marginBottom: 0, marginTop: 2 }}
                  >
                    {s.desc}
                  </Paragraph>
                </div>
                <ArrowRightOutlined style={{ color: '#bfbfbf' }} />
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
