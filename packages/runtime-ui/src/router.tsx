import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useIsAuthenticated } from '@apaas/shared/stores';
import RuntimeLayout from './layouts/RuntimeLayout';
import Login from './pages/Login';
import Home from './pages/Home';
import AppView from './pages/AppView';
import PageView from './pages/PageView';
import TaskCenter from './pages/TaskCenter';
import EmbedPage from './embed/EmbedPage';
import EmbedDemo from './embed/EmbedDemo';

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
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/t/:slug/login" element={<Login />} />
      {/* iframe 嵌入干净页面：无外壳无登录重定向（认证走 hash/hello，401 出站宿主），
          不受 ProtectedRoute 管辖 */}
      <Route path="/embed/app/:appId/p/:slug" element={<EmbedPage />} />
      {/* 宿主系统模拟器（联调/走查用）：以真实宿主 SDK 嵌入上面的干净页面 */}
      <Route path="/embed-demo" element={<EmbedDemo />} />
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
  );
}
