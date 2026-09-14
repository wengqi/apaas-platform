/**
 * 运行时页面渲染器 — 加载已发布页面 Schema，递归渲染组件树。
 *
 * 路由：/app/:appId/p/:slug
 * 流程：getBySlug → RuntimeStoreProvider → ComponentRenderer 递归渲染
 */

import { Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { pagesApi } from '../api/pages';
import { RuntimeStoreProvider } from '../runtime/RuntimeStore';
import ComponentRenderer from '../runtime/ComponentRenderer';

const { Text } = Typography;

export default function PageView() {
  const { appId, slug } = useParams<{ appId: string; slug: string }>();
  const {
    data: page,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['page', appId, slug],
    queryFn: () => pagesApi.getBySlug(appId!, slug!),
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
  if (!schema?.root) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Text type="secondary">页面 Schema 为空</Text>
      </div>
    );
  }

  return (
    // key=page.id：页面间导航时强制重挂载，清空上一页的 vm/变量状态，
    // 并让 autoQuery 与 PageLoadEffect(onLoad) 在新页面重新触发
    <RuntimeStoreProvider key={page.id} viewModel={schema.viewModel} objectId={page.objectId}>
      <ComponentRenderer node={schema.root} root={schema.root} isRoot />
    </RuntimeStoreProvider>
  );
}
