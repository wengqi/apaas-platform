import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient, initAuthFromHash } from '@apaas/shared/stores';
import App from './App';
import './index.css';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// 从 URL hash 读取 token（SSO / 测试场景）
initAuthFromHash();

const queryClient = createQueryClient();

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);
