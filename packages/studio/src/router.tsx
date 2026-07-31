import { Navigate, Route, Routes } from 'react-router-dom';
import StudioLayout from './layouts/StudioLayout.js';
import Login from './pages/Login.js';
import AppList from './pages/AppList.js';
import AppDashboard from './pages/AppDashboard.js';
import ObjectDesigner, { ObjectEmptyState } from './pages/ObjectDesigner.js';
import ObjectDetail from './components/object/ObjectDetail.js';
import PageBuilder from './pages/PageBuilder.js';
import PageList from './components/page-builder/PageList.js';
import ProcessList from './pages/ProcessList.js';
import ProcessEditor from './pages/ProcessEditor.js';
import ProcessMonitor from './components/process/ProcessMonitor.js';
import Permissions from './pages/Permissions.js';
import { useAuthStore } from './stores/auth.js';

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
 * 路由表 (react-router-dom v6)。
 *
 * 引入「应用」上下文层级：租户 → 应用 → 对象/页面/流程/权限。
 * - /login                          登录页(公开)
 * - /                               重定向到 /apps
 * - /apps                           应用列表(受保护，全屏首页)
 * - /app/:appId                     重定向到 /app/:appId/dashboard
 *   - /app/:appId/dashboard         应用工作台(受保护，StudioLayout 内)
 *   - /app/:appId/objects           对象设计器 (Phase 1)
 *     - /app/:appId/objects/        右栏空状态
 *     - /app/:appId/objects/:objectId  对象详情(字段/视图)
 *   - /app/:appId/pages             页面列表 (Phase 2)
 *     - /app/:appId/pages/          页面列表
 *     - /app/:appId/pages/:pageId   页面搭建器
 *   - /app/:appId/processes         流程列表 (Phase 3)
 *     - /app/:appId/processes/monitor       流程监控(实例列表 + 详情)
 *     - /app/:appId/processes/:processId    流程编辑器(简化/标准模式,全屏)
 *   - /app/:appId/permissions       权限管理占位 (Phase 4)
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* 应用列表 —— 全屏首页，无侧边栏 */}
      <Route
        path="/apps"
        element={
          <ProtectedRoute>
            <AppList />
          </ProtectedRoute>
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
        <Route path="processes" element={<ProcessList />} />
        <Route path="processes/monitor" element={<ProcessMonitor />} />
        <Route path="processes/:processId" element={<ProcessEditor />} />
        <Route path="permissions" element={<Permissions />} />
      </Route>

      {/* 根路径与未匹配路由重定向 */}
      <Route path="/" element={<Navigate to="/apps" replace />} />
      <Route path="*" element={<Navigate to="/apps" replace />} />
    </Routes>
  );
}
