import { createRoot } from 'react-dom/client';
import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient, initAuthFromHash } from '@apaas/shared/stores';
import App from './App';
import './index.css';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import GlobalErrorBoundary from './components/GlobalErrorBoundary.js';

// 从 URL hash 读取 token（SSO / 测试场景）
initAuthFromHash();

const queryClient = createQueryClient();

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

// 注意：不得包 React.StrictMode —— amis SDK 内部使用 mobx-state-tree，
// StrictMode 双挂载会撕毁其 RootStore（R1.7 页面层切 amis 后整页受影响，
// 集成红线见 docs/knowledge-base/SPIKE-AMIS-ADOPTION-2026-09-30.md）
createRoot(rootEl).render(
  <ConfigProvider locale={zhCN}>
    <AntApp>
      <GlobalErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </GlobalErrorBoundary>
    </AntApp>
  </ConfigProvider>,
);
