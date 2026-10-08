/**
 * 页面搭建器预览态 fetcher — 预览模式下的 amis 数据请求适配。
 *
 * 与 runtime-ui AmisRenderer 的 fetcher 语义同源（adaptApiResponse/
 * normalizeListResponse/前缀剥离/成功失败 toast 均为同构实现；跨包暂不
 * 抽 shared，待两处稳定后统一上提）。差异点：401 时不跳登录（预览宿主
 * 是 studio，登录态失效由 studio 全局处理），仅弹提示。
 *
 * 编辑器设计态不发请求；仅预览态（Editor preview）经 amisEnv.fetcher
 * 走真实平台 API——预览=真实数据与真实提交行为。
 */

import { message } from 'antd';
import client from '../../api/client.js';
import type { ApiResponse } from '../../api/client.js';

export interface PreviewFetcherResult {
  ok: boolean;
  status: number;
  msg?: string;
  data?: unknown;
}

/** 平台 API 响应 { ok, data } / { ok:false, error } → amis { ok, status, msg, data }。 */
function adaptApiResponse(res: {
  data?: ApiResponse<unknown>;
  status?: number;
}): PreviewFetcherResult {
  const body = res.data as
    { ok?: boolean; data?: unknown; error?: { code?: number; message?: string } } | undefined;
  if (body && typeof body === 'object' && 'ok' in body) {
    if (body.ok) return { ok: true, status: 0, data: normalizeListResponse(body.data) };
    return {
      ok: false,
      status: body.error?.code ?? 1,
      msg: body.error?.message ?? '请求失败',
    };
  }
  const status = res.status === 200 ? 0 : (res.status ?? 1);
  return { ok: status === 0, status, msg: status === 0 ? undefined : '请求失败', data: body };
}

/**
 * 列表响应规范化：平台 records API 返回 { items, total } 且字段值嵌在 data
 * JSONB 中；amis crud 期望 { items: 扁平行, count }（与 runtime-ui 同源实现）。
 */
function normalizeListResponse(data: unknown): unknown {
  if (
    data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Array.isArray((data as { items?: unknown }).items) &&
    typeof (data as { total?: unknown }).total !== 'undefined'
  ) {
    const { items, total, ...rest } = data as {
      items: Array<Record<string, unknown>>;
      total: number;
    };
    return {
      ...rest,
      count: total,
      items: items.map((r) => {
        const flat = (r as { data?: unknown }).data;
        return flat !== null && typeof flat === 'object' && !Array.isArray(flat)
          ? { id: (r as { id?: unknown }).id, ...(flat as Record<string, unknown>) }
          : r;
      }),
    };
  }
  return data;
}

/** 预览态 fetcher：走 studio axios 实例（自动带 token），成功/失败显式 toast。 */
export async function previewFetcher(api: Record<string, unknown>): Promise<PreviewFetcherResult> {
  const method = String(api['method'] ?? 'get').toLowerCase();
  let url = String(api['url'] ?? '');
  // 与 runtime-ui 同源：axios baseURL='/api'，剥掉页面 url 重复的 /api[/v1] 前缀
  url = url.replace(/^\/api(?:\/v1)?(?=\/)/, '');
  const payload = api['data'] as Record<string, unknown> | undefined;
  try {
    if (method === 'get') {
      return adaptApiResponse(await client.request({ method, url, params: payload }));
    }
    const result = adaptApiResponse(
      await client.request({
        method,
        url,
        data: payload,
        params: method === 'delete' ? payload : undefined,
      }),
    );
    // 写操作成功提示：编辑器预览态的 notify 链路不接 UI，fetcher 层兜底
    if (result.ok) {
      const apiMsgs = api['messages'] as { success?: string } | undefined;
      message.success(apiMsgs?.success ?? '操作成功');
    }
    return result;
  } catch (err: unknown) {
    const e = err as { response?: { status?: number; data?: { error?: { message?: string } } } };
    const msg = e.response?.data?.error?.message ?? (err as Error).message;
    if (e.response?.status !== 401) {
      message.error(msg ? `操作失败：${msg}` : '操作失败');
    }
    return { ok: false, status: e.response?.status ?? 1, msg };
  }
}
