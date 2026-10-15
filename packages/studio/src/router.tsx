import { lazy, Suspense } from 'react';
import { Spin } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';
import StudioLayout from './layouts/StudioLayout.js';
import Login from './pages/Login.js';
import DevCenterHome from './pages/app-home/DevCenterHome.js';
import AppDashboard from './pages/AppDashboard.js';
import ObjectDesigner, { ObjectEmptyState } from './pages/ObjectDesigner.js';
import ObjectDetail from './components/object/ObjectDetail.js';
import PageList from './components/page-builder/PageList.js';
import ProcessList from './pages/ProcessList.js';
import ProcessMonitor from './components/process/ProcessMonitor.js';
import NotificationTemplateManager from './components/process/NotificationTemplateManager.js';
import Permissions from './pages/Permissions.js';
import PublishWizard from './pages/PublishWizard.js';
import VersionHistory from './pages/VersionHistory.js';
import ConnectorList from './pages/ConnectorList.js';
import DatasetList from './pages/DatasetList.js';
import CloudFunctionList from './pages/CloudFunctionList.js';
import PlatformUsers from './pages/PlatformUsers.js';
import PlatformOrgs from './pages/PlatformOrgs.js';
import AuditLogs from './pages/AuditLogs.js';
import AppAuditLogs from './pages/AppAuditLogs.js';
import ObservabilityCenter from './pages/ObservabilityCenter.js';
import PermissionDebug from './pages/PermissionDebug.js';
import ReviewCenter from './pages/ReviewCenter.js';
import Environments from './pages/Environments.js';
import ApiKeys from './pages/ApiKeys.js';
import EmbedIntegration from './pages/EmbedIntegration.js';
import TenantManagement from './pages/TenantManagement.js';
import TenantDetail from './pages/TenantDetail.js';
import { useAuthStore } from '@apaas/shared/stores';

// 重型编辑器路由级懒加载：flowgram（流程画布）与 amis-editor（页面搭建）各自
// 占数 MB，此前全量打进 entry（入口 chunk ~4MB，所有非编辑器页面共同承担）。
// Semi CSS 也随 SimplifiedEditor 进入本 chunk（修复 index.html 直链生产 404）。
const PageBuilder = lazy(() => import('./pages/PageBuilder.js'));
const ProcessEditor = lazy(() => import('./pages/ProcessEditor.js'));

/** 懒加载路由的加载占位（Spin 居中，minHeight 兼容全屏编辑器布局）。 */
function RouteFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
      }}
    >
      <Spin size="large" />
    </div>
  );
}

/**
 * 路由守卫：未登录(无 token)时重定向到 /login。
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

/**
 * 平台超管守卫：仅 isPlatformAdmin=true 的用户可访问。
 * 用于租户管理路由。
 */
function PlatformAdminRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (!user?.isPlatformAdmin) {
    return <Navigate to="/apps" replace />;
  }
  return <>{children}</>;
}

/**
 * 租户管理员守卫：仅 TENANT_ADMIN 或平台超管可访问。
 * 用于用户管理、组织架构路由。
 */
function TenantAdminRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  // 平台超管 或 TENANT_ADMIN 角色
  const isTenantAdmin =
    user?.isPlatformAdmin || user?.roles?.some((r) => r.code === 'TENANT_ADMIN');
  if (!isTenantAdmin) {
    return <Navigate to="/apps" replace />;
  }
  return <>{children}</>;
}

/**
 * 路由表 (react-router-dom v6)。
 *
 * 层级：平台超管 → 租户管理 → 应用
 * - /login                          登录页(公开)
 * - /t/:slug/login                  带租户标识的登录页(预填 slug)
 * - /apps                           应用列表(租户用户首页)
 * - /platform/tenants               平台超管 — 租户管理
 * - /platform/tenants/:id           平台超管 — 租户详情
 * - /platform/users                 租户管理员 — 用户管理
 * - /platform/orgs                  租户管理员 — 组织架构
 * - /app/:appId                     应用内路由(StudioLayout)
 *   - /app/:appId/dashboard         应用工作台
 *   - /app/:appId/objects           对象设计器
 *   - /app/:appId/pages             页面列表/搭建器
 *   - /app/:appId/processes         流程列表/编辑器/监控
 *   - /app/:appId/permissions       应用级角色权限
 *   - /app/:appId/publish           发布向导
 *   - /app/:appId/versions          版本历史
 */
export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/t/:slug/login" element={<Login />} />

        {/* 应用列表 —— 全屏首页，无侧边栏 */}
        <Route
          path="/apps"
          element={
            <ProtectedRoute>
              <DevCenterHome />
            </ProtectedRoute>
          }
        />

        {/* 平台超管路由 — 租户管理 */}
        <Route
          path="/platform/tenants"
          element={
            <PlatformAdminRoute>
              <TenantManagement />
            </PlatformAdminRoute>
          }
        />
        <Route
          path="/platform/tenants/:id"
          element={
            <PlatformAdminRoute>
              <TenantDetail />
            </PlatformAdminRoute>
          }
        />

        {/* 租户管理员路由 — 用户管理 / 组织架构 */}
        <Route
          path="/platform/users"
          element={
            <TenantAdminRoute>
              <PlatformUsers />
            </TenantAdminRoute>
          }
        />
        <Route
          path="/platform/orgs"
          element={
            <TenantAdminRoute>
              <PlatformOrgs />
            </TenantAdminRoute>
          }
        />
        <Route
          path="/platform/audit-logs"
          element={
            <TenantAdminRoute>
              <AuditLogs />
            </TenantAdminRoute>
          }
        />
        <Route
          path="/platform/observability"
          element={
            <TenantAdminRoute>
              <ObservabilityCenter />
            </TenantAdminRoute>
          }
        />
        <Route
          path="/platform/permission-debug"
          element={
            <TenantAdminRoute>
              <PermissionDebug />
            </TenantAdminRoute>
          }
        />

        {/* 应用内路由 —— 共用 StudioLayout(侧边栏 + 顶栏) */}
        <Route
          path="/app/:appId"
          element={
            <ProtectedRoute>
              <StudioLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AppDashboard />} />
          <Route path="objects" element={<ObjectDesigner />}>
            <Route index element={<ObjectEmptyState />} />
            <Route path=":objectId" element={<ObjectDetail />} />
          </Route>
          <Route path="pages" element={<PageList />} />
          <Route path="pages/:pageId" element={<PageBuilder />} />
          <Route path="datasets" element={<DatasetList />} />
          <Route path="processes" element={<ProcessList />} />
          <Route path="processes/monitor" element={<ProcessMonitor />} />
          <Route path="processes/notifications" element={<NotificationTemplateManager />} />
          <Route path="processes/:processId" element={<ProcessEditor />} />
          <Route path="permissions" element={<Permissions />} />
          <Route path="connectors" element={<ConnectorList />} />
          <Route path="cloud-functions" element={<CloudFunctionList />} />
          <Route path="audit-logs" element={<AppAuditLogs />} />
          <Route path="reviews" element={<ReviewCenter />} />
          <Route path="publish" element={<PublishWizard />} />
          <Route path="versions" element={<VersionHistory />} />
          <Route path="environments" element={<Environments />} />
          <Route path="api-keys" element={<ApiKeys />} />
          <Route path="embed" element={<EmbedIntegration />} />
        </Route>

        {/* 根路径与未匹配路由重定向 */}
        <Route path="/" element={<Navigate to="/apps" replace />} />
        <Route path="*" element={<Navigate to="/apps" replace />} />
      </Routes>
    </Suspense>
  );
}
