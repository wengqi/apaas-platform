/**
 * 租户级工作台布局 — 开发中心与 /platform/* 治理页共用（2026-10-18）。
 *
 * AppHeader 顶栏导航提升到此层常显：点击导航项后顶栏不再被页面自带头部替换，
 * 选中项随路由点亮。治理页面只负责内容区（统一用 PageHeader 提供页面上下文）。
 * 用户域分离（同日裁决）：仅 END_USER/应用级角色的运行时业务用户不进入搭建器，
 * 落 RuntimePortalNotice 引导前往运行时门户（判定 SSOT=@apaas/shared hasStudioAccess）。
 */

import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@apaas/shared/stores';
import { hasStudioAccess } from '@apaas/shared';
import { TOKENS as T } from '@apaas/shared/design';
import AppHeader from './AppHeader.js';
import RuntimePortalNotice from './RuntimePortalNotice.js';

/** 租户级布局：持久顶栏 + 子路由内容（无搭建器权限的用户落运行时引导）。 */
export default function TenantLayout() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // 运行时业务用户（未授予 TENANT_ADMIN/BUILDER）不进入搭建器
  if (
    user &&
    !hasStudioAccess(
      Boolean(user.isPlatformAdmin),
      (user.roles ?? []).map((r) => r.code),
    )
  ) {
    return <RuntimePortalNotice userName={user.name ?? user.email ?? '用户'} onLogout={onLogout} />;
  }

  return (
    <div style={{ minHeight: '100vh', background: T.colorBgLayout }}>
      <AppHeader
        isPlatformAdmin={Boolean(user?.isPlatformAdmin)}
        isTenantAdmin={Boolean(user?.roles?.some((r) => r.code === 'TENANT_ADMIN'))}
        userName={user?.name ?? user?.email ?? '用户'}
        userAvatar={user?.avatar ?? undefined}
        onNavigate={navigate}
        onLogout={onLogout}
      />
      <Outlet />
    </div>
  );
}
