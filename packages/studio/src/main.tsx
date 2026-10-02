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

// 红线：不得包 React.StrictMode —— 搭建器画布 amis-editor 基于 mobx-state-tree，
// 双挂载撕毁 RootStore（dev 模式必现崩溃），与 runtime-ui AmisRenderer 同源
// （docs/knowledge-base/SPIKE-AMIS-ADOPTION-2026-09-30.md）。
ReactDOM.createRoot(document.getElementById('root')!).render(
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
