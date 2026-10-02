/**
 * 运行时页面渲染器 — 加载已发布页面 Schema，递归渲染组件树。
 *
 * 路由：/app/:appId/p/:slug
 * 流程：getBySlug → RuntimeStoreProvider → ComponentRenderer 递归渲染
 */

import { Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { isAmisPage } from '@apaas/shared';
import { pagesApi } from '../api/pages';
import AmisRenderer from '../runtime/AmisRenderer';
import { RuntimeStoreProvider } from '../runtime/RuntimeStore';
import ComponentRenderer from '../runtime/ComponentRenderer';
import ModalHost from '../runtime/ModalHost';
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

  // R1.7：amis 方言（v2）整页渲染——data 域注入应用/对象上下文，
  // 取数/提交由 schema 里的平台相对 api.url 经 fetcher（带 token）直连
  if (isAmisPage(schema)) {
    return (
      <>
        <AppNavMenu />
        <AmisRenderer
          schema={schema as unknown as Record<string, unknown>}
          data={{ appId, objectId: page.objectId ?? null }}
        />
      </>
    );
  }

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
      {/* 应用内常驻页签导航（多页应用切换无需返回应用视图） */}
      <AppNavMenu />
      <ComponentRenderer node={schema.root} root={schema.root} isRoot />
      {/* 弹窗宿主 — 消费 open_modal/close_modal 动作写入的 vm.modalVisible */}
      <ModalHost appId={appId!} />
    </RuntimeStoreProvider>
  );
}
