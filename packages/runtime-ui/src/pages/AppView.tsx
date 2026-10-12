/**
 * 应用视图 — 已发布页面门户（QA 交互评审 2026-10-03：
 * 从 slug 技术列表改为页面卡片，业务用户按名称与类型识别入口）。
 * R6：新增"流程发起"区——MANUAL 流程绑定发起页面后，业务用户一键进入发起。
 */

import { useEffect } from 'react';
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
import {
  RUNTIME_PAGE_TYPE_META,
  appTileBackground,
  appTileShadow,
  TOKENS as T,
} from '@apaas/shared/design';
import { useParams, useNavigate } from 'react-router-dom';
import { appsApi } from '../api/apps';
import { pagesApi } from '../api/pages';
import { processesApi } from '../api/processes';

const { Title, Paragraph, Text } = Typography;

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

  // 唯一已发布页面直落（评审 P2）：只有一个业务页时门户页是多余的一跳，
  // 直接进入该页；多页时保留门户（此时门户有真实的选择价值）。
  // 注意：hooks 必须在任何提前 return 之前调用
  const publishedPages = (pages ?? []).filter((p) => p.published);
  const isSinglePagePortal = !pagesLoading && publishedPages.length === 1;

  useEffect(() => {
    if (isSinglePagePortal) {
      navigate(`/app/${appId}/p/${publishedPages[0]!.slug}`, { replace: true });
    }
  }, [isSinglePagePortal, publishedPages, appId, navigate]);

  if (appLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (isSinglePagePortal) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin />
      </div>
    );
  }

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Title level={4} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* 渐变瓷片（评审 P1）：与 studio/Home 同一应用图标语言 */}
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: appTileBackground(app?.color),
              color: T.colorWhite,
              fontSize: 20,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: appTileShadow(app?.color),
              flexShrink: 0,
            }}
            aria-hidden
          >
            {app?.icon || '📦'}
          </span>
          {app?.name ?? '应用视图'}
        </Title>
        <Paragraph type="secondary">{app?.description || '暂无描述'}</Paragraph>
        {app && (
          <div style={{ marginBottom: 16 }}>
            <Tag color={app.status === 'PUBLISHED' ? 'green' : 'default'}>
              {app.status === 'PUBLISHED' ? '已发布' : '开发中'}
            </Tag>
            <Tag>v{app.version}</Tag>
            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
              {app.stats
                ? `${app.stats.objects} 对象 · ${app.stats.pages} 页面 · ${app.stats.processes} 流程`
                : ''}
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
              const meta = RUNTIME_PAGE_TYPE_META[page.type] ?? {
                label: page.type,
                color: 'default',
              };
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
