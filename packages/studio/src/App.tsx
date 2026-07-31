import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './router';

/**
 * 根组件：挂载 BrowserRouter 并渲染路由表。
 * AntD ConfigProvider 与 React Query Provider 在 main.tsx 中已包裹。
 */
export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
