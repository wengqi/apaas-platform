/**
 * 宿主侧嵌入客户端（零依赖 vanilla TS）——宿主系统（任意前端框架）用本 SDK
 * 把平台运行时页面以 iframe 形式嵌入并按 embed protocol 通信。
 *
 * 用法：
 * ```ts
 * const embed = createApaasEmbed({
 *   container: document.getElementById('box')!,
 *   src: 'https://apaas.example.com/embed/app/app_x/p/expense_form',
 *   token: 'eyJ...',                       // 宿主后端签发/转交的用户 JWT
 * });
 * embed.on('ready', (p) => console.log(p.slug));
 * embed.on('page-event', ({ name, data }) => ...);  // 业务事件出站
 * await embed.queryData();                 // 拉取页面数据域
 * embed.navigate('approval_list');         // 宿主自建导航驱动切页
 * ```
 */

import {
  EMBED_MSG_AUTH,
  EMBED_MSG_CONTEXT,
  EMBED_MSG_HELLO,
  EMBED_MSG_NAVIGATE,
  EMBED_MSG_QUERY_DATA,
  EMBED_MSG_QUERY_DATA_RESULT,
  type EmbedAuthPayload,
  type EmbedAuthExpiredPayload,
  type EmbedContextPayload,
  type EmbedFrame,
  type EmbedHeightChangePayload,
  type EmbedHelloPayload,
  type EmbedNavigatePayload,
  type EmbedPageEventPayload,
  type EmbedQueryDataResultPayload,
  type EmbedReadyPayload,
  type EmbedRouteChangePayload,
  makeEmbedFrame,
  parseEmbedFrame,
} from './protocol.js';

/** 握手默认超时（毫秒）。 */
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 15000;
/** rpc 默认超时（毫秒）。 */
const DEFAULT_RPC_TIMEOUT_MS = 10000;

export interface EmbedClientOptions {
  /** 挂载 iframe 的容器元素 */
  container: HTMLElement;
  /** 平台 embed 页面地址（/embed/app/:appId/p/:slug，可带 ?env=） */
  src: string;
  /** 用户 JWT（经 hello 注入 iframe；也可改用 src 拼 #token= 让 iframe 自引导） */
  token?: string;
  /** iframe 允许的 origin；缺省从 src 推导 */
  allowedOrigin?: string;
  /** 环境切换（缺省 prod；也可写在 src 的 ?env=） */
  env?: string;
  /** 初始页面输入数据（并入页面 data 域） */
  context?: Record<string, unknown>;
  /** 握手超时（毫秒） */
  handshakeTimeoutMs?: number;
  /** iframe sandbox 属性（建议宿主显式设置 allow-scripts allow-forms allow-same-origin allow-popups） */
  sandbox?: string;
}

/** iframe → 宿主 出站事件表。 */
export interface EmbedEventMap {
  ready: EmbedReadyPayload;
  'auth-expired': EmbedAuthExpiredPayload | undefined;
  'route-change': EmbedRouteChangePayload;
  'page-event': EmbedPageEventPayload;
  'height-change': EmbedHeightChangePayload;
  error: { code: 'handshake-timeout'; message: string };
}

export type EmbedEventType = keyof EmbedEventMap;
type Handler<T> = (payload: T) => void;

/** 待决 rpc 项。 */
interface PendingRpc {
  resolve: (p: EmbedQueryDataResultPayload) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface ApaasEmbedClient {
  /** 订阅 iframe 出站事件；返回取消函数。 */
  on<K extends EmbedEventType>(type: K, handler: Handler<EmbedEventMap[K]>): () => void;
  /** 会话中途轮换 token。 */
  setToken(token: string): void;
  /** 更新环境 / 全量替换页面输入数据域。 */
  setContext(payload: EmbedContextPayload): void;
  /** 驱动 iframe 切换到同应用另一页面。 */
  navigate(slug: string): void;
  /** 拉取当前页面数据域（rpc）。 */
  queryData(timeoutMs?: number): Promise<EmbedQueryDataResultPayload>;
  /** 移除 iframe 与监听（幂等）。 */
  destroy(): void;
  /** iframe DOM 元素（宿主自设尺寸/样式用）。 */
  readonly iframe: HTMLIFrameElement;
}

/** 从 URL 推导 origin（非法 URL 返回空串，由校验兜底拦截）。 */
function originOf(url: string): string {
  try {
    return new URL(url, window.location.href).origin;
  } catch {
    return '';
  }
}

/** msgId 生成：randomUUID 优先，回退计数器。 */
let msgIdSeq = 0;
function nextMsgId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  msgIdSeq += 1;
  return `msg-${Date.now()}-${msgIdSeq}`;
}

export function createApaasEmbed(options: EmbedClientOptions): ApaasEmbedClient {
  const {
    container,
    src,
    token,
    env,
    context,
    sandbox,
    handshakeTimeoutMs = DEFAULT_HANDSHAKE_TIMEOUT_MS,
  } = options;

  const iframeOrigin = options.allowedOrigin ?? originOf(src);
  if (!iframeOrigin) throw new Error(`createApaasEmbed: 无法从 src 推导 origin（${src}）`);

  const handlers = new Map<EmbedEventType, Set<Handler<never>>>();
  const pending = new Map<string, PendingRpc>();
  let destroyed = false;
  /** 握手确认（收到 iframe 任何回帧）。确认前协议帧进 outbox 暂存，
   *  避免 post 进尚未就绪/即将被替换的 iframe 文档（初始 about:blank）而丢失。 */
  let helloAcked = false;
  const outbox: EmbedFrame[] = [];

  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = '0';
  if (sandbox) iframe.setAttribute('sandbox', sandbox);
  container.appendChild(iframe);

  function emit<K extends EmbedEventType>(type: K, payload: EmbedEventMap[K]): void {
    for (const h of handlers.get(type) ?? []) (h as Handler<EmbedEventMap[K]>)(payload);
  }

  function postToIframe(frame: EmbedFrame): void {
    if (destroyed) return;
    if (!helloAcked) {
      outbox.push(frame);
      return;
    }
    iframe.contentWindow?.postMessage(frame, iframeOrigin);
  }

  function flushOutbox(): void {
    if (!iframe.contentWindow) return;
    for (const frame of outbox) iframe.contentWindow.postMessage(frame, iframeOrigin);
    outbox.length = 0;
  }

  function rejectPending(reason: string): void {
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    pending.clear();
  }

  const onMessage = (event: MessageEvent): void => {
    if (destroyed) return;
    if (event.origin !== iframeOrigin || event.source !== iframe.contentWindow) return;
    const frame = parseEmbedFrame(event.data);
    if (!frame) return; // 规则 3：非协议消息静默
    ackHello();
    switch (frame.type) {
      case EMBED_MSG_QUERY_DATA_RESULT: {
        const id = frame.msgId;
        if (!id) return;
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        clearTimeout(p.timer);
        p.resolve(
          (frame.payload ?? {
            ok: false,
            source: 'context',
            error: '空回执',
          }) as EmbedQueryDataResultPayload,
        );
        return;
      }
      case 'apaas:ready':
        clearTimeout(handshakeTimer); // 握手完成，撤销超时
        emit('ready', (frame.payload ?? {}) as EmbedReadyPayload);
        return;
      case 'apaas:auth-expired':
        emit('auth-expired', frame.payload as EmbedAuthExpiredPayload | undefined);
        return;
      case 'apaas:route-change':
        emit('route-change', (frame.payload ?? { appId: '', slug: '' }) as EmbedRouteChangePayload);
        return;
      case 'apaas:page-event':
        emit('page-event', (frame.payload ?? { name: '' }) as EmbedPageEventPayload);
        return;
      case 'apaas:height-change':
        emit('height-change', (frame.payload ?? { height: 0 }) as EmbedHeightChangePayload);
        return;
      default:
        return; // 未识别类型静默忽略
    }
  };
  window.addEventListener('message', onMessage);

  // hello-first 握手（带 ack 重试）：src 同步设置时 iframe 的 load 事件对应初始
  // about:blank 文档（2026-10-12 走查实测，Chrome），hello 会落进随即被替换的文档
  // 而丢失——因此 load 时发一次 + 自续 setTimeout 重发，收到 iframe 任何回帧即停，
  // 上限即握手超时。注：这是有界连接握手重试（等价 WebSocket 重连语义，ack 即停、
  // 非状态同步轮询），no-polling 原则禁的是 setInterval 式持续状态轮询，见
  // docs/knowledge-base/CODING-PRINCIPLE-NO-POLLING-2026-08-16.md 的例外口径。
  const HELLO_RETRY_INTERVAL_MS = 500;
  let helloTimer: ReturnType<typeof setTimeout> | null = null;
  const sendHello = (): void => {
    if (destroyed || helloAcked || !iframe.contentWindow) return;
    const hello: EmbedHelloPayload = { origin: window.location.origin };
    if (token) hello.token = token;
    if (env) hello.env = env;
    if (context) hello.context = context;
    iframe.contentWindow.postMessage(makeEmbedFrame(EMBED_MSG_HELLO, hello), iframeOrigin);
    helloTimer = setTimeout(sendHello, HELLO_RETRY_INTERVAL_MS);
  };
  const ackHello = (): void => {
    if (helloAcked) return;
    helloAcked = true;
    if (helloTimer) clearTimeout(helloTimer);
    helloTimer = null;
    flushOutbox();
  };
  iframe.addEventListener('load', sendHello);
  sendHello();

  const handshakeTimer = setTimeout(() => {
    if (destroyed) return;
    emit('error', {
      code: 'handshake-timeout',
      message: `嵌入握手超时（${handshakeTimeoutMs}ms 内未收到 apaas:ready）——请检查 iframe 地址与平台 embed 白名单配置`,
    });
  }, handshakeTimeoutMs);

  return {
    iframe,
    on(type, handler) {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler as Handler<never>);
      return () => set?.delete(handler as Handler<never>);
    },
    setToken(newToken: string) {
      postToIframe(makeEmbedFrame<EmbedAuthPayload>(EMBED_MSG_AUTH, { token: newToken }));
    },
    setContext(payload: EmbedContextPayload) {
      postToIframe(makeEmbedFrame<EmbedContextPayload>(EMBED_MSG_CONTEXT, payload));
    },
    navigate(slug: string) {
      postToIframe(makeEmbedFrame<EmbedNavigatePayload>(EMBED_MSG_NAVIGATE, { slug }));
    },
    queryData(timeoutMs = DEFAULT_RPC_TIMEOUT_MS) {
      return new Promise<EmbedQueryDataResultPayload>((resolve, reject) => {
        if (destroyed) {
          reject(new Error('embed client 已销毁'));
          return;
        }
        const msgId = nextMsgId();
        const timer = setTimeout(() => {
          pending.delete(msgId);
          reject(new Error(`query-data 超时（${timeoutMs}ms）`));
        }, timeoutMs);
        pending.set(msgId, { resolve, reject, timer });
        postToIframe(makeEmbedFrame(EMBED_MSG_QUERY_DATA, {}, msgId));
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(handshakeTimer);
      if (helloTimer) clearTimeout(helloTimer);
      rejectPending('embed client 已销毁');
      window.removeEventListener('message', onMessage);
      iframe.remove();
    },
  };
}
