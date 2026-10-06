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
import { message } from 'antd';
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

/**
 * 数据域合并（盲审类缺陷根治）：运行时数据域（流程变量/触发上下文/页面上下文）
 * 必须同时出现在两条通道——schema 顶层 data（page 域，amis 内部优先级最高）
 * 与 render 第二参（根域，弹窗场景实测可能丢失）。双通道都注入后，无论 amis
 * 内部取哪一路，字段都可见；schema 自带 data 作为默认值垫底，运行时数据覆盖。
 * 纯函数，不修改入参。
 */
export function mergeSchemaData(
  schema: Record<string, unknown>,
  data?: Record<string, unknown>,
): Record<string, unknown> {
  if (!data || Object.keys(data).length === 0) return schema;
  const defaults = schema['data'];
  const base =
    defaults !== null && typeof defaults === 'object' && !Array.isArray(defaults)
      ? (defaults as Record<string, unknown>)
      : {};
  return { ...schema, data: { ...base, ...data } };
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
    let url = String(api['url'] ?? '');
    // #21 契约统一：axios baseURL='/api'，页面 url 应写 /objects/... 相对路径；
    // AI 按"平台相对路径"直觉写 /api/v1/... 时会拼成 /api/api/v1/...——这里剥掉
    // 重复前缀（兼容两种写法，种子页面/验收应用不受影响）
    url = url.replace(/^\/api(?:\/v1)?(?=\/)/, '');
    const payload = api['data'] as Record<string, unknown> | undefined;
    try {
      if (method === 'get') {
        return adaptApiResponse(await apiClient.request({ method, url, params: payload }));
      }
      const result = adaptApiResponse(
        await apiClient.request({
          method,
          url,
          data: payload,
          params: method === 'delete' ? payload : undefined,
        }),
      );
      // 写操作成功提示（H1b 兜底）：amis 裸 render() 的 notify 链路未接 UI
      // （实测 form 提交成功无任何 toast）——在 fetcher 层对 POST/PUT/DELETE
      // 成功直接弹 AntD message,不依赖 env.notify。
      if (result.ok) {
        const apiMsgs = api['messages'] as { success?: string } | undefined;
        message.success(apiMsgs?.success ?? '操作成功');
      }
      return result;
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: { message?: string } } } };
      // H1b 对称修复（#20）：HTTP 异常（404/500 等）不能静默——amis 裸 render()
      // 无 notify 链路，失败必须弹 toast，否则页面空数据用户无从得知
      // （QA D-010：GET 取数失败此前静默；401 交给登录态处理避免未登录刷屏）
      const msg = e.response?.data?.error?.message ?? (err as Error).message;
      if (e.response?.status !== 401) {
        message.error(msg ? `操作失败：${msg}` : '操作失败');
      }
      return {
        ok: false,
        status: e.response?.status ?? 1,
        msg,
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
  const mergedSchema = useMemo(() => mergeSchemaData(schema, data), [schema, data]);

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
      {render(mergedSchema as { type: string } & Record<string, unknown>, data ?? {}, options)}
    </div>
  );
}
