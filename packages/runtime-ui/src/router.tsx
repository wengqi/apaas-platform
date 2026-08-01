import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './stores/auth';
import RuntimeLayout from './layouts/RuntimeLayout';
import Login from './pages/Login';
import Home from './pages/Home';
import AppView from './pages/AppView';
import PageView from './pages/PageView';
import TaskCenter from './pages/TaskCenter';

/** 路由守卫:未登录重定向到 /login。 */
function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
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
