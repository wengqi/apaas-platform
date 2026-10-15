/**
 * 任务中心 — 列表查询失败显式化（2026-10-10 修复）。
 * 此前查询失败（如权限被拒 403、网络错误）被 normalizeItems 静默吞成空表，
 * 用户看到的是"暂无任务"而非错误——权限缺口类故障因此被掩盖。
 * 修复后失败渲染错误告警 + 重试操作。
 */

import { Alert, Button } from 'antd';

interface ListErrorAlertProps {
  error: unknown;
  onRetry: () => void;
}

export function ListErrorAlert({ error, onRetry }: ListErrorAlertProps) {
  return (
    <Alert
      type="error"
      showIcon
      style={{ marginBottom: 12 }}
      message="列表加载失败"
      description={error instanceof Error ? error.message : String(error)}
      action={
        <Button size="small" danger onClick={onRetry}>
          重试
        </Button>
      }
    />
  );
}
