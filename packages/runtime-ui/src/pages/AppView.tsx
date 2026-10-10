/**
 * 应用视图 — 已发布页面门户（QA 交互评审 2026-10-03：
 * 从 slug 技术列表改为页面卡片，业务用户按名称与类型识别入口）。
 * R6：新增"流程发起"区——MANUAL 流程绑定发起页面后，业务用户一键进入发起。
 */

import { Button, Card, Typography, Spin, Tag, Empty } from 'antd';
import {
  FileTextOutlined,
  FormOutlined,
  TableOutlined,
  ProfileOutlined,
  BarChartOutlined,
  AppstoreOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { useParams, useNavigate } from 'react-router-dom';
import { appsApi } from '../api/apps';
import { pagesApi } from '../api/pages';
import { processesApi } from '../api/processes';

const { Title, Paragraph, Text } = Typography;

/** 页面类型 → 中文名与图标（门户卡片识别要素）。 */
const PAGE_TYPE_META: Record<string, { label: string; color: string }> = {
  form_page: { label: '表单页', color: 'blue' },
  list_page: { label: '列表页', color: 'cyan' },
  detail_page: { label: '详情页', color: 'geekblue' },
  dashboard: { label: '仪表盘', color: 'purple' },
  custom: { label: '自定义', color: 'default' },
};

export default function AppView() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  const { data: app, isLoading: appLoading } = useQuery({
    queryKey: qk.app(appId!),
    queryFn: () => appsApi.get(appId!),
    enabled: !!appId,
  });

  const { data: pages, isLoading: pagesLoading } = useQuery({
    queryKey: qk.appPages(appId!),
    queryFn: () => pagesApi.list(appId!),
    enabled: !!appId,
  });

  // 流程发起（R6 方案一）：MANUAL 流程绑定发起页面后，提供一键进入发起的入口
  const { data: processes } = useQuery({
    queryKey: ['app-processes', appId!],
    queryFn: () => processesApi.list(appId!),
    enabled: !!appId,
  });

  /** 可发起流程：已发布 + MANUAL 触发 + start 节点绑定了发起页面 */
  const launchableProcesses = (processes ?? []).filter((p) => {
    if (p.triggerType !== 'MANUAL' || p.status !== 'PUBLISHED') return false;
    const start = p.workflowSchema?.nodes?.find((n) => n.type === 'start');
    return typeof start?.data?.['startPageId'] === 'string';
  });

  /** startPageId → 页面 slug（发起按钮跳转页面而非技术 ID） */
  const launchTarget = (processId: string): { name: string; slug: string } | null => {
    const proc = launchableProcesses.find((p) => p.id === processId);
    if (!proc) return null;
    const start = proc.workflowSchema?.nodes?.find((n) => n.type === 'start');
    const startPageId = start?.data?.['startPageId'] as string | undefined;
    const page = (pages ?? []).find((p) => p.id === startPageId);
    return page ? { name: proc.name, slug: page.slug } : null;
  };

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
              {app.stats
                ? `${app.stats.objects} 对象 · ${app.stats.pages} 页面 · ${app.stats.processes} 流程`
                : app.apiName}
            </Text>
          </div>
        )}
      </Card>

      {launchableProcesses.length > 0 && (
        <Card
          title={
            <>
              <RocketOutlined /> 流程发起
            </>
          }
          style={{ marginBottom: 16 }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {launchableProcesses.map((proc) => {
              const target = launchTarget(proc.id);
              return (
                <Button
                  key={proc.id}
                  type="primary"
                  icon={<RocketOutlined />}
                  disabled={!target}
                  onClick={() => {
                    if (!target) return;
                    navigate(`/app/${appId}/p/${target.slug}`);
                  }}
                >
                  发起{proc.name}
                </Button>
              );
            })}
          </div>
        </Card>
      )}

      <Card
        title={
          <>
            <FileTextOutlined /> 已发布页面
          </>
        }
      >
        {pagesLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : publishedPages.length === 0 ? (
          <Empty description="暂无已发布页面" />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {publishedPages.map((page) => {
              const meta = PAGE_TYPE_META[page.type] ?? { label: page.type, color: 'default' };
              return (
                <Card
                  key={page.id}
                  hoverable
                  size="small"
                  style={{ borderRadius: 10 }}
                  onClick={() => navigate(`/app/${appId}/p/${page.slug}`)}
                >
                  <div style={{ fontSize: 24, marginBottom: 8 }}>
                    {meta.label === '表单页' ? (
                      <FormOutlined />
                    ) : meta.label === '列表页' ? (
                      <TableOutlined />
                    ) : meta.label === '详情页' ? (
                      <ProfileOutlined />
                    ) : meta.label === '仪表盘' ? (
                      <BarChartOutlined />
                    ) : (
                      <AppstoreOutlined />
                    )}
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{page.name}</div>
                  <Tag color={meta.color}>{meta.label}</Tag>
                </Card>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
