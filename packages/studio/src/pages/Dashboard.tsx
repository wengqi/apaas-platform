import { Navigate } from 'react-router-dom';

/**
 * 旧版工作台首页 —— 已由 AppList(应用列表)取代。
 * 保留为重定向,兼容可能残留的 /dashboard 导航。
 */
export default function Dashboard() {
  return <Navigate to="/apps" replace />;
}
