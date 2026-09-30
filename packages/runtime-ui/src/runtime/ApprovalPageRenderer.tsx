/**
 * 审批页面渲染 — 任务中心弹窗内渲染 user_task 绑定的页面（amis 方言）。
 *
 * 口径（ADR-0003）：应用的一切界面都是页面，审批节点绑定的是页面
 * （可以是纯表单页，也可以是含表单+关联信息的任意页面）。
 * 任务状态变更（通过/驳回）由弹窗 footer 统一走 completeTask；
 * 页面内 form 的普通请求走平台 fetcher（认证/响应适配）。
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Spin, Typography } from 'antd';
import { pagesApi } from '../api/pages.js';
import AmisRenderer, { adaptApiResponse, type FetcherLike } from './AmisRenderer.js';

const { Text } = Typography;

interface ApprovalPageRendererProps {
  /** 审批节点绑定的页面 ID */
  pageId: string;
  /** 页面初始数据域：流程变量/触发记录/任务上下文（含 taskId） */
  data: Record<string, unknown>;
}

/** 从 amis page schema 中提取 form 相关性标记（含表单即 true）。 */
export function pageContainsForm(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') return false;
  const node = schema as { type?: string; body?: unknown[] };
  if (node.type === 'form') return true;
  if (!Array.isArray(node.body)) return false;
  return node.body.some((child) => pageContainsForm(child));
}

/** 平台 fetcher：页面内 api 请求走 axios 实例（自动带 token/baseURL/响应适配）。 */
function usePlatformFetcher(): FetcherLike {
  return useMemo(
    () => async (api) => {
      const { default: apiClient } = await import('../api/client.js');
      const method = String(api['method'] ?? 'get').toLowerCase();
      const url = String(api['url'] ?? '');
      const payload = api['data'] as Record<string, unknown> | undefined;
      try {
        const res =
          method === 'get' || method === 'delete'
            ? await apiClient.request({ method, url, params: payload })
            : await apiClient.request({ method, url, data: payload });
        return adaptApiResponse(res);
      } catch (err: unknown) {
        const e = err as {
          response?: { status?: number; data?: { error?: { message?: string } } };
        };
        return {
          status: e.response?.status ?? 1,
          msg: e.response?.data?.error?.message ?? (err as Error).message,
        };
      }
    },
    [],
  );
}

export default function ApprovalPageRenderer({ pageId, data }: ApprovalPageRendererProps) {
  const {
    data: page,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['approval-page', pageId],
    queryFn: () => pagesApi.get(pageId),
    enabled: !!pageId,
    staleTime: 60_000,
  });

  const fetcher = usePlatformFetcher();

  const pageData = useMemo(() => ({ ...data }), [data]);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 32 }}>
        <Spin />
      </div>
    );
  }

  if (error || !page) {
    return (
      <Alert
        type="warning"
        showIcon
        message="审批页面加载失败"
        description={<Text type="secondary">{(error as Error)?.message ?? '页面不存在'}</Text>}
      />
    );
  }

  const schema = page.schema as unknown as Record<string, unknown>;
  if (!schema || schema['type'] !== 'page') {
    return (
      <Alert
        type="info"
        showIcon
        message="该任务未配置审批页面"
        description={<Text type="secondary">请在流程设计器为审批节点绑定页面</Text>}
      />
    );
  }

  return <AmisRenderer schema={schema} data={pageData} fetcher={fetcher} />;
}
