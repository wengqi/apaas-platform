import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Result } from 'antd';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 全局错误边界（评审 P2-2）。
 *
 * 此前任一渲染异常（如 schema 结构异常）会让整棵 React 树卸载 → 纯白屏，
 * 用户与排障者都拿不到任何信息。边界捕获后展示可操作的错误页并保留
 * 刷新入口，同时把错误打到控制台便于定位。
 */
export default class GlobalErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[GlobalErrorBoundary] 渲染异常:', error, info.componentStack);
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
          <Button key="home" onClick={() => window.location.assign('/apps')}>
            返回应用列表
          </Button>,
        ]}
      />
    );
  }
}
