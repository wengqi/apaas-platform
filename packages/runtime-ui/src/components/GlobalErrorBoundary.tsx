import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Result } from 'antd';
import { useAuthStore } from '@apaas/shared/stores';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** 页面报错上报端点（P1 观测事件 PAGE_ERROR 类别的浏览器侧来源）。 */
const PAGE_ERROR_ENDPOINT = '/api/v1/observability/page-errors';
/** 上报超时（keepalive 小请求，超时即放弃——观测不反噬兜底体验）。 */
const REPORT_TIMEOUT_MS = 3000;

/**
 * 上报渲染异常到观测事件（fire-and-forget）。
 * 独立 fetch 直连而非 axios 实例：错误边界场景下依赖越少越可靠；
 * 携带登录 token 以便网关归租户；失败静默（兜底页已经展示了错误）。
 */
function reportPageError(error: Error, info: ErrorInfo): void {
  try {
    const token = useAuthStore.getState().token;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS);
    void fetch(PAGE_ERROR_ENDPOINT, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message: error.message.slice(0, 500),
        stack: (error.stack ?? '').slice(0, 4000),
        componentStack: (info.componentStack ?? '').slice(0, 2000),
        href: window.location.href.slice(0, 500),
      }),
      signal: controller.signal,
    })
      .catch(() => undefined)
      .finally(() => clearTimeout(timer));
  } catch {
    // 上报本身不允许再抛异常——错误边界内抛异常会二次崩树
  }
}

/**
 * 全局错误边界（评审 P2-2）。
 *
 * 此前任一渲染异常（如 schema 结构异常）会让整棵 React 树卸载 → 纯白屏，
 * 用户与排障者都拿不到任何信息。边界捕获后展示可操作的错误页并保留
 * 刷新入口，同时把错误打到控制台便于定位；P1 运维治理起上报
 * PAGE_ERROR 观测事件（管理员在观测中心可见，traceId 与审计串联）。
 */
export default class GlobalErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[GlobalErrorBoundary] 渲染异常:', error, info.componentStack);
    reportPageError(error, info);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <Result
        status="error"
        title="页面渲染出错了"
        subTitle={this.state.error.message || '未知错误'}
        extra={[
          <Button key="reload" type="primary" onClick={() => window.location.reload()}>
            刷新页面
          </Button>,
          <Button key="home" onClick={() => window.location.assign('/home')}>
            返回应用列表
          </Button>,
        ]}
      />
    );
  }
}
