/**
 * 视图配置器 — 统一错误提示（从 ViewConfigurator.tsx 拆分，
 * AGENTS.md 单文件 400 行规范）。
 */

import { message } from 'antd';

/** 统一错误提示。 */
export function showError(err: unknown) {
  const axErr = err as {
    response?: { data?: { error?: { message?: string } }; message?: string };
    message?: string;
  };
  message.error(axErr.response?.data?.error?.message ?? axErr.message ?? '操作失败,请重试');
}
