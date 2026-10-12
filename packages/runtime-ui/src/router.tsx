import { lazy, Suspense } from 'react';
import { Spin } from 'antd';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useIsAuthenticated } from '@apaas/shared/stores';
import RuntimeLayout from './layouts/RuntimeLayout';
import Login from './pages/Login';
import Home from './pages/Home';

// 页面内容路由懒加载：AmisRenderer→amis SDK 体积 ~3MB，此前经
// router→PageView/TaskCenter→AmisRenderer 静态导入链全量打进 entry，
// 连登录页都要下载。壳路由（Login/Home/RuntimeLayout）保持 eager。
const AppView = lazy(() => import('./pages/AppView'));
const PageView = lazy(() => import('./pages/PageView'));
const TaskCenter = lazy(() => import('./pages/TaskCenter'));
const EmbedPage = lazy(() => import('./embed/EmbedPage'));

/** 懒加载路由的加载占位（Spin 居中）。 */
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

/** 路由守卫:未登录重定向到 /login。 */
function ProtectedRoute() {
  const isAuthenticated = useIsAuthenticated();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/t/:slug/login" element={<Login />} />
        {/* iframe 嵌入干净页面：无外壳无登录重定向（认证走 hash/hello，401 出站宿主），
            不受 ProtectedRoute 管辖。宿主接入控制台在 studio「嵌入集成」页（方案一，
            2026-10-12），此前的 /embed-demo 模拟器已随之退役。 */}
        <Route path="/embed/app/:appId/p/:slug" element={<EmbedPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<RuntimeLayout />}>
            <Route path="/home" element={<Home />} />
            <Route path="/app/:appId" element={<AppView />} />
            <Route path="/app/:appId/p/:slug" element={<PageView />} />
            <Route path="/tasks" element={<TaskCenter />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Suspense>
  );
}
