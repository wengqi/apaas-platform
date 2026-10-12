/**
 * EmbedPage — iframe 嵌入专用干净页面（/embed/app/:appId/p/:slug）。
 *
 * 只渲染构建态设计的 page 本体：无 RuntimeLayout 页头、无 AppNavMenu 页签
 * （2026-10-12 用户裁决①，导航职责归宿主）、无内容边距；认证经 URL hash
 * （#token=，既有通道）或 apaas:hello 消息注入，401 不跳登录页而是出站
 * apaas:auth-expired 由宿主接管。
 *
 * 协议见 @apaas/shared/embed（hello-first 握手，iframe 静默至首条 hello）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@apaas/shared/stores';
import type { EmbedHelloPayload, EmbedQueryDataResultPayload } from '@apaas/shared/embed';
import { pagesApi } from '../api/pages';
import { isEmbedAuthExpiredEventName, setEmbedMode } from '../api/client';
import AmisRenderer from '../runtime/AmisRenderer';
import { EmbedBridge, setActiveEmbedBridge } from './embedBridge';
import { registerEmbedEventAction } from './embedActions';

const { Text } = Typography;

/** 页面根节点作用域名（注入 schema.name，query-data 经 getComponentByName 读取）。 */
const EMBED_PAGE_SCOPE_NAME = 'embedPage';

/** amis scoped 组件的只读取形状（页面数据域快照）。 */
interface EmbedScopedLike {
  getComponentByName?: (
    name: string,
  ) => { props?: { store?: { data?: unknown }; data?: unknown } } | undefined;
}

/** 入站白名单：同源 + VITE_EMBED_ALLOWED_ORIGINS（逗号分隔宿主 origin）。 */
function resolveAllowedOrigins(): string[] {
  const origins = new Set<string>([window.location.origin]);
  const extra = import.meta.env.VITE_EMBED_ALLOWED_ORIGINS;
  if (typeof extra === 'string') {
    for (const part of extra.split(',')) {
      const origin = part.trim();
      if (origin) origins.add(origin);
    }
  }
  return [...origins];
}

/** MST/代理对象安全摊平（postMessage 结构化克隆不收 proxy，失败返回 null）。 */
function toPlainJson(value: unknown): Record<string, unknown> | null {
  try {
    const plain = JSON.parse(JSON.stringify(value)) as unknown;
    return plain !== null && typeof plain === 'object' && !Array.isArray(plain)
      ? (plain as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export default function EmbedPage() {
  const { appId, slug } = useParams<{ appId: string; slug: string }>();
  const navigate = useNavigate();
  // 环境：URL ?env= 为初始值，apaas:hello/context 可在线切换
  const [envOverride, setEnvOverride] = useState<string | null>(null);
  const [contextData, setContextData] = useState<Record<string, unknown> | undefined>(undefined);
  const hasToken = useAuthStore((s) => s.token !== null);
  const scopedRef = useRef<EmbedScopedLike | null>(null);
  const bridgeRef = useRef<EmbedBridge | null>(null);
  const routeChangeArmedRef = useRef(false);

  const env = envOverride ?? new URLSearchParams(window.location.search).get('env') ?? 'prod';

  // 桥回调经 ref 读最新值（避免 stale closure）
  const envRef = useRef(env);
  envRef.current = env;
  const appIdRef = useRef(appId);
  appIdRef.current = appId;
  const contextDataRef = useRef(contextData);
  contextDataRef.current = contextData;

  const {
    data: page,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['embed-page', appId, slug, env, hasToken],
    queryFn: () => pagesApi.getBySlug(appId!, slug!, env),
    enabled: !!appId && !!slug,
  });

  // schema 根节点注入确定作用域名（已有 name 不覆盖）
  const schema = useMemo(() => {
    if (!page?.schema) return null;
    const s = { ...(page.schema as Record<string, unknown>) };
    if (typeof s['name'] !== 'string' || !s['name']) s['name'] = EMBED_PAGE_SCOPE_NAME;
    return s;
  }, [page]);

  const objectId = page?.objectId ?? null;
  const objectIdRef = useRef(objectId);
  objectIdRef.current = objectId;

  const pageData = useMemo(
    () => ({ appId, objectId, ...(contextData ?? {}) }),
    [appId, objectId, contextData],
  );

  /** query-data：页面作用域快照优先，注入域兜底（来源显式标注）。 */
  const resolveQueryData = useCallback((): EmbedQueryDataResultPayload => {
    const base = {
      appId: appIdRef.current,
      objectId: objectIdRef.current,
      ...(contextDataRef.current ?? {}),
    };
    try {
      const comp = scopedRef.current?.getComponentByName?.(EMBED_PAGE_SCOPE_NAME);
      const raw = comp?.props?.store?.data ?? comp?.props?.data;
      const plain = toPlainJson(raw);
      if (plain) return { ok: true, source: 'page', data: { ...base, ...plain } };
    } catch {
      // 作用域不可达（渲染中/已卸载）：走注入域兜底
    }
    return { ok: true, source: 'context', data: base };
  }, []);

  // 桥生命周期必须跨页内导航保持（重建即丢握手态，2026-10-12 走查实测）：
  // navigate 等身份可能随路由变化的值一律经 ref 间接引用，装配 effect 依赖恒为空
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const resolveQueryDataRef = useRef(resolveQueryData);
  resolveQueryDataRef.current = resolveQueryData;

  // 桥生命周期（挂载一次；handlers 经 ref 读最新值）
  useEffect(() => {
    registerEmbedEventAction();
    setEmbedMode(true);
    const bridge = new EmbedBridge({
      allowedOrigins: resolveAllowedOrigins(),
      handlers: {
        onHello: (p: EmbedHelloPayload) => {
          if (p.token) useAuthStore.getState().setToken(p.token);
          if (p.env && p.env !== envRef.current) setEnvOverride(p.env);
          if (p.context) setContextData(p.context);
        },
        onAuth: (p) => {
          if (p.token) useAuthStore.getState().setToken(p.token);
        },
        onContext: (p) => {
          if (p.env && p.env !== envRef.current) setEnvOverride(p.env);
          if (p.context) setContextData(p.context); // 全量替换语义
        },
        onNavigate: (p) => {
          if (!p.slug || !appIdRef.current) return;
          const params = new URLSearchParams();
          if (envRef.current && envRef.current !== 'prod') params.set('env', envRef.current);
          const qs = params.toString();
          navigateRef.current(`/embed/app/${appIdRef.current}/p/${p.slug}${qs ? `?${qs}` : ''}`);
        },
        onQueryData: (msgId) => {
          bridgeRef.current?.sendQueryDataResult(msgId, resolveQueryDataRef.current());
        },
      },
    });
    bridgeRef.current = bridge;
    setActiveEmbedBridge(bridge);
    bridge.start();

    const onAuthExpired = (e: Event): void => {
      if (!isEmbedAuthExpiredEventName(e.type)) return;
      const detail = (e as CustomEvent<{ url?: string }>).detail;
      bridge.sendAuthExpired({ url: detail?.url });
    };
    window.addEventListener('apaas:embed:auth-expired', onAuthExpired);
    return () => {
      window.removeEventListener('apaas:embed:auth-expired', onAuthExpired);
      bridge.stop();
      setActiveEmbedBridge(null);
      setEmbedMode(false);
    };
    // 依赖恒为空：所有可变值经 ref 读取（见上方 navigateRef/resolveQueryDataRef）
  }, []);

  // ready：页面 schema 就绪即出站（token 尚未到位也发——authenticated=false，
  // 宿主可据此补发 hello/auth；token 到位后 queryKey 变化重取并再次 ready）
  useEffect(() => {
    if (!page || !appId || !slug) return;
    bridgeRef.current?.sendReady({
      appId,
      slug,
      name: page.name,
      env,
      authenticated: hasToken,
    });
  }, [page, appId, slug, env, hasToken]);

  // route-change：首次挂载不发（ready 已携带初始 slug），此后每次页内切换出站
  useEffect(() => {
    if (!appId || !slug) return;
    if (!routeChangeArmedRef.current) {
      routeChangeArmedRef.current = true;
      return;
    }
    bridgeRef.current?.sendRouteChange({ appId, slug });
  }, [appId, slug]);

  // 高度变化：ResizeObserver 事件驱动（禁轮询），宿主可做 iframe 自适应高度
  useEffect(() => {
    let last = 0;
    const ro = new ResizeObserver(() => {
      const height = Math.round(document.documentElement.scrollHeight);
      if (height > 0 && height !== last) {
        last = height;
        bridgeRef.current?.sendHeightChange({ height });
      }
    });
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  const handleScope = useCallback((scoped: unknown) => {
    scopedRef.current = (scoped as EmbedScopedLike) ?? null;
  }, []);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !page) {
    const status = (error as { response?: { status?: number } } | null)?.response?.status;
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Text type="danger" style={{ display: 'block', marginBottom: 8 }}>
          {status === 404
            ? '页面不存在或未发布'
            : status === 401
              ? '等待宿主提供有效凭据'
              : `页面加载失败: ${(error as Error)?.message ?? ''}`}
        </Text>
        {status !== undefined && status !== 401 && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            请确认应用已发布且页面包含在当前环境的发布版本中
          </Text>
        )}
      </div>
    );
  }

  if (!schema) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Text type="secondary">页面 Schema 为空</Text>
      </div>
    );
  }

  return <AmisRenderer schema={schema} data={pageData} scopeRef={handleScope} />;
}
