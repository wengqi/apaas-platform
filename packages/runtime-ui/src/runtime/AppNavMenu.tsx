/**
 * 应用内常驻导航菜单 — 展示当前应用全部已发布页面，当前页高亮。
 *
 * 对齐飞书 aPaaS 运行态交互：多页应用在页面顶部有常驻页签导航，
 * 用户无需返回应用视图即可切换页面（此前只能经 AppView 页面列表中转）。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { Menu } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { useNavigate, useParams } from 'react-router-dom';
import { pagesApi } from '../api/pages';

export default function AppNavMenu() {
  const { appId, slug } = useParams<{ appId: string; slug: string }>();
  const navigate = useNavigate();

  const { data: pages } = useQuery({
    queryKey: qk.appPages(appId!),
    queryFn: () => pagesApi.list(appId!),
    enabled: !!appId,
  });

  const publishedPages = (pages ?? []).filter((p) => p.published);
  if (publishedPages.length === 0) return null;

  return (
    <Menu
      mode="horizontal"
      selectedKeys={slug ? [slug] : []}
      items={publishedPages.map((p) => ({ key: p.slug, label: p.name }))}
      onClick={({ key }) => navigate(`/app/${appId}/p/${key}`)}
      style={{ borderBottom: `1px solid ${T.colorSplit}` }}
    />
  );
}
