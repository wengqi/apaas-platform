/**
 * 从 pages/ProcessEditor.tsx 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * Error Boundary — 捕获编辑器渲染崩溃。
 */

import { Component, type ReactNode } from 'react';
import { Button, Typography } from 'antd';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export default class EditorErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: unknown) {
    console.error('[ProcessEditor] 渲染崩溃:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            style={{
              padding: 48,
              textAlign: 'center',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Typography.Title level={5} type="danger">
              编辑器渲染失败
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ maxWidth: 400 }}>
              {this.state.error?.message ?? '未知错误'}
            </Typography.Paragraph>
            <Button
              type="primary"
              size="small"
              onClick={() => this.setState({ hasError: false, error: undefined })}
            >
              重试
            </Button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
