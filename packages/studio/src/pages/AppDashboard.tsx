import { Card, Col, Row, Skeleton, Space, Statistic, Tag, Typography } from 'antd';
import {
  DatabaseOutlined,
  LayoutOutlined,
  ApartmentOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { appTileBackground, TOKENS as T } from '@apaas/shared/design';
import { appsApi } from '../api/apps.js';
import { pagesApi } from '../api/pages.js';
import { STATUS_COLOR, STATUS_LABEL } from './app-list/constants.js';

const { Title, Paragraph, Text } = Typography;

/** 继续搭建展示的最近页面数（评审 P2：dashboard 下半屏空白 + 无"接着干"入口）。 */
const RECENT_PAGES_COUNT = 3;

/**
 * 应用内工作台 —— 进入应用后的首页。
 * 显示当前应用的资源统计与快捷入口。
 */
export default function AppDashboard() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  const { data: app, isLoading } = useQuery({
    queryKey: qk.app(appId!),
    queryFn: () => appsApi.get(appId as string),
    enabled: !!appId,
  });

  // 最近编辑的页面（评审 P2：dashboard 半屏空白且无"接着干"入口）
  const { data: pages } = useQuery({
    queryKey: qk.appPages(appId!),
    queryFn: () => pagesApi.list(appId as string),
    enabled: !!appId,
  });
  const recentPages = [...(pages ?? [])]
    .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
    .slice(0, RECENT_PAGES_COUNT);

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

  /** 快捷入口卡片配置（标题与落点一致：点击进列表页，不冒充"创建"）。 */
  const shortcuts = [
    {
      key: 'object',
      title: '对象建模',
      desc: '定义业务对象、字段与关系',
      icon: <DatabaseOutlined style={{ fontSize: 28, color: T.colorPrimary }} />,
      bgColor: T.colorPrimaryBg,
      path: 'objects',
    },
    {
      key: 'page',
      title: '页面搭建',
      desc: '可视化拖拽搭建页面',
      icon: <LayoutOutlined style={{ fontSize: 28, color: T.colorSuccess }} />,
      bgColor: T.colorSuccessBg,
      path: 'pages',
    },
    {
      key: 'process',
      title: '流程编排',
      desc: '编排业务自动化流程',
      icon: <ApartmentOutlined style={{ fontSize: 28, color: T.colorWarning }} />,
      bgColor: T.colorWarningBg,
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
            background: appTileBackground(app.color),
            color: T.colorWhite,
            fontSize: 26,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {(app.name || '应').slice(0, 1)}
        </div>
        <div>
          <Title level={3} style={{ margin: 0, lineHeight: 1.2 }}>
            {app.name}
          </Title>
          <Space size={8} style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {app.apiName}
            </Text>
            <Tag color={STATUS_COLOR[app.status] ?? 'default'} style={{ margin: 0, fontSize: 12 }}>
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
          <Card style={{ borderRadius: 10, border: 'none', background: T.colorFillQuaternary }}>
            <Statistic
              title="对象"
              value={stats.objects}
              prefix={<DatabaseOutlined style={{ color: T.colorPrimary }} />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ borderRadius: 10, border: 'none', background: T.colorFillQuaternary }}>
            <Statistic
              title="页面"
              value={stats.pages}
              prefix={<LayoutOutlined style={{ color: T.colorSuccess }} />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ borderRadius: 10, border: 'none', background: T.colorFillQuaternary }}>
            <Statistic
              title="流程"
              value={stats.processes}
              prefix={<ApartmentOutlined style={{ color: T.colorWarning }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* ── 继续搭建（评审 P2）：最近编辑的页面一键回到搭建器 ── */}
      {recentPages.length > 0 && (
        <>
          <Title level={5} style={{ marginBottom: 16 }}>
            继续搭建
          </Title>
          <Row gutter={16} style={{ marginBottom: 32 }}>
            {recentPages.map((p) => (
              <Col key={p.id} xs={24} sm={8}>
                <Card
                  hoverable
                  size="small"
                  style={{ borderRadius: 10, border: `1px solid ${T.colorBorderSecondary}` }}
                  onClick={() => navigate(`/app/${appId}/pages/${p.id}`)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <LayoutOutlined
                      style={{ fontSize: 18, color: T.colorSuccess, flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong ellipsis style={{ display: 'block', fontSize: 13 }}>
                        {p.name}
                      </Text>
                      <Text
                        type="secondary"
                        style={{ fontSize: 11 }}
                      >{`更新于 ${new Date(p.updatedAt).toLocaleDateString('zh-CN')}`}</Text>
                    </div>
                    <ArrowRightOutlined style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }} />
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </>
      )}

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
                border: `1px solid ${T.colorBorderSecondary}`,
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
                <ArrowRightOutlined style={{ color: T.colorTextQuaternary }} />
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
