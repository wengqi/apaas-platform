import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@apaas/shared/stores';
import App from './App';
import GlobalErrorBoundary from './components/shared/GlobalErrorBoundary.js';
import './index.css';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import 'reactflow/dist/style.css';

const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <GlobalErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </GlobalErrorBoundary>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
