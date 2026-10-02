/**
 * 运行时页面渲染器 — 加载已发布页面 Schema，amis 整页渲染。
 *
 * 路由：/app/:appId/p/:slug
 * 流程：getBySlug → AmisRenderer（fetcher 带 token，data 注入 {appId, objectId}）
 *
 * 注：v1 自有渲染器（ComponentRenderer/RuntimeStore/ModalHost）已随 R1.7
 * 第二轮物理下线——页面唯一方言为 amis（ADR-0003 一切界面皆页面）。
 */

import { Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { pagesApi } from '../api/pages';
import AmisRenderer from '../runtime/AmisRenderer';
import AppNavMenu from '../runtime/AppNavMenu';

const { Text } = Typography;

export default function PageView() {
  const { appId, slug } = useParams<{ appId: string; slug: string }>();
  // R1.4：URL ?env=dev 切换环境（缺省 prod）
  const env = new URLSearchParams(window.location.search).get('env') ?? undefined;
  const {
    data: page,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['page', appId, slug, env ?? 'prod'],
    queryFn: () => pagesApi.getBySlug(appId!, slug!, env),
    enabled: !!appId && !!slug,
  });

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Text type="danger">
          {error ? `页面加载失败: ${(error as Error).message}` : '页面不存在或未发布'}
        </Text>
      </div>
    );
  }

  const schema = page.schema;
  if (!schema || Object.keys(schema).length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Text type="secondary">页面 Schema 为空</Text>
      </div>
    );
  }

  return (
    <>
      {/* 应用内常驻页签导航（多页应用切换无需返回应用视图） */}
      <AppNavMenu />
      {/* amis 方言整页渲染——data 域注入应用/对象上下文，
          取数/提交由 schema 里的平台相对 api.url 经 fetcher（带 token）直连 */}
      <AmisRenderer
        schema={schema as unknown as Record<string, unknown>}
        data={{ appId, objectId: page.objectId ?? null }}
      />
    </>
  );
}
