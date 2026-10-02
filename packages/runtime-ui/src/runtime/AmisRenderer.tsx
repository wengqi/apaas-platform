/**
 * AmisRenderer — amis schema 渲染器（页面唯一方言，ADR-0003）。
 *
 * 定位：渲染 amis 方言的页面 schema（审批页面/普通页面统一，一切界面皆页面）。
 * v1 自有渲染器已物理下线，本组件是运行时页面唯一渲染路径。
 *
 * 集成红线（spike 实证，见 docs/knowledge-base/SPIKE-AMIS-ADOPTION-2026-09-30.md）：
 * - mobx 必须锁 4.x（本包 package.json 已锁 4.15.7 + mobx-react-lite 2.2.2），
 *   升级即崩 "multiple versions of MobX active"
 * - 本组件不得置于 React StrictMode 下（双挂载撕毁 amis MST RootStore）
 * - 主题注册：import 'amis-ui/lib/themes/antd'（无扩展名，exports 走 ./lib/* 通配）
 */

import { useMemo, useRef } from 'react';
import { render } from 'amis';
import type { RenderOptions } from 'amis-core';
import 'amis/lib/themes/antd.css';
import 'amis-ui/lib/themes/antd';
import 'amis-ui/lib/locale/zh-CN';

/** amis fetcher 的响应适配：amis 期望 { status, msg, data } 包裹。 */
export interface AmisRendererProps {
  /** amis 方言页面 schema（type: 'page'） */
  schema: Record<string, unknown>;
  /** 页面初始数据域（如审批上下文：record、taskId、流程变量） */
  data?: Record<string, unknown>;
  /** amis 动作/请求走平台网关：附带认证与 401 处理的 fetcher */
  fetcher?: FetcherLike;
  /** 渲染完成通知（可选） */
  onReady?: () => void;
}

export type FetcherLike = (api: Record<string, unknown>) => Promise<{
  /** amis fetcher 官方约定：ok 必须显式给出——Chart 等直连 env.fetcher 的组件
   * 不经 amis-core 的 status 推导（缺 ok 一律视为失败，实测图表全空白）。 */
  ok: boolean;
  status: number;
  msg?: string;
  data?: unknown;
}>;

/** 平台 API 响应 { ok, data } / { ok:false, error } → amis { ok, status, msg, data } 适配。 */
export function adaptApiResponse(res: {
  data?: { ok?: boolean; data?: unknown; error?: { code: number; message?: string } };
  status?: number;
}): { ok: boolean; status: number; msg?: string; data?: unknown } {
  const body = res.data;
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
 * 列表响应规范化（R1.7）：平台 records API 返回 { items, total } 且字段值嵌在
 * data JSONB 中；amis crud 期望 { items: 扁平行, count }。检测到该形状时统一
 * 摊平并映射 total→count，schema 无需再写 responseAdaptor。
 */
export function normalizeListResponse(data: unknown): unknown {
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
        const flat = r.data;
        return flat !== null && typeof flat === 'object' && !Array.isArray(flat)
          ? { id: r.id, ...(flat as Record<string, unknown>) }
          : r;
      }),
    };
  }
  return data;
}

/** amis fetcher 选项（RenderOptions.fetcher 签名以运行时 JS 为准，类型面桥接）。 */
function wrapFetcher(fn: FetcherLike): RenderOptions['fetcher'] {
  return (async (config: unknown) =>
    fn(config as Record<string, unknown>)) as RenderOptions['fetcher'];
}

/** 默认 fetcher：走 runtime-ui 的 axios 实例（自动带 token/baseURL）。 */
function createDefaultFetcher(): FetcherLike {
  // 延迟引入避免循环依赖（api/client 引用 zustand 等）
  return async (api: Record<string, unknown>) => {
    const { default: apiClient } = await import('../api/client.js');
    const method = String(api['method'] ?? 'get').toLowerCase();
    const url = String(api['url'] ?? '');
    const payload = api['data'] as Record<string, unknown> | undefined;
    try {
      if (method === 'get' || method === 'delete') {
        return adaptApiResponse(await apiClient.request({ method, url, params: payload }));
      }
      return adaptApiResponse(await apiClient.request({ method, url, data: payload }));
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: { message?: string } } } };
      return {
        ok: false,
        status: e.response?.status ?? 1,
        msg: e.response?.data?.error?.message ?? (err as Error).message,
      };
    }
  };
}

/**
 * amis 渲染组件。
 *
 * 注意： amis 内部大量使用 findDOMNode 与 MST，父级不要包 React.StrictMode。
 */
export default function AmisRenderer({ schema, data, fetcher, onReady }: AmisRendererProps) {
  const readyRef = useRef(false);
  const options = useMemo(
    () => ({
      theme: 'antd',
      locale: 'zh-CN',
      fetcher: wrapFetcher(fetcher ?? createDefaultFetcher()),
    }),
    [fetcher],
  );

  return (
    <div
      className="amis-renderer"
      ref={() => {
        if (!readyRef.current) {
          readyRef.current = true;
          onReady?.();
        }
      }}
    >
      {render(schema as { type: string } & Record<string, unknown>, data ?? {}, options)}
    </div>
  );
}
