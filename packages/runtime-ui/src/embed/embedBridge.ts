/**
 * EmbedBridge — iframe 侧协议桥（embed protocol 的平台端实现）。
 *
 * hello-first 握手：生产 nginx 设了 Referrer-Policy: no-referrer，iframe 无法从
 * document.referrer 推得宿主 origin，因此在收到宿主第一条 apaas:hello 之前保持
 * 静默（出站消息进 outbox 缓冲），从 hello 的 event.origin 学到宿主 origin 作为
 * 此后所有出站的 targetOrigin——iframe 永不向未知 origin 广播。
 *
 * 安全规则：
 * - 入站：event.origin 必须在白名单（宿主白名单 ∪ 同源）；event.source 必须
 *   是 window.parent；hello 自报 origin 与 event.origin 不符视为伪造丢弃。
 * - 出站：一律显式 targetOrigin（= 握手确立的宿主 origin），禁止 '*'。
 * - 未识别类型静默忽略（向前兼容）。
 */

import {
  EMBED_MSG_AUTH,
  EMBED_MSG_AUTH_EXPIRED,
  EMBED_MSG_CONTEXT,
  EMBED_MSG_HELLO,
  EMBED_MSG_HEIGHT_CHANGE,
  EMBED_MSG_NAVIGATE,
  EMBED_MSG_PAGE_EVENT,
  EMBED_MSG_QUERY_DATA,
  EMBED_MSG_QUERY_DATA_RESULT,
  EMBED_MSG_READY,
  EMBED_MSG_ROUTE_CHANGE,
  type EmbedAuthExpiredPayload,
  type EmbedAuthPayload,
  type EmbedContextPayload,
  type EmbedFrame,
  type EmbedHelloPayload,
  type EmbedHeightChangePayload,
  type EmbedNavigatePayload,
  type EmbedPageEventPayload,
  type EmbedQueryDataResultPayload,
  type EmbedReadyPayload,
  type EmbedRouteChangePayload,
  isEmbedFrame,
  makeEmbedFrame,
} from '@apaas/shared/embed';

/** 握手前出站缓冲上限（hello 在 iframe load 后毫秒级到达，正常远小于此值）。 */
const MAX_OUTBOX_FRAMES = 32;

/** iframe 侧业务回调（EmbedPage 装配，桥只管协议不管渲染）。 */
export interface EmbedBridgeHandlers {
  onHello: (payload: EmbedHelloPayload) => void;
  onAuth: (payload: EmbedAuthPayload) => void;
  onContext: (payload: EmbedContextPayload) => void;
  onNavigate: (payload: EmbedNavigatePayload) => void;
  /** query-data 请求到达（msgId 必回执，由 EmbedPage 组装结果后 sendQueryDataResult） */
  onQueryData: (msgId?: string) => void;
}

export interface EmbedBridgeOptions {
  /** 入站白名单 origin（调用方需并入同源 origin） */
  allowedOrigins: string[];
  handlers: EmbedBridgeHandlers;
}

export class EmbedBridge {
  private readonly options: EmbedBridgeOptions;
  private parentOrigin: string | null = null;
  private outbox: EmbedFrame[] = [];
  private started = false;

  constructor(options: EmbedBridgeOptions) {
    this.options = options;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener('message', this.handleMessage);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener('message', this.handleMessage);
    this.parentOrigin = null;
    this.outbox = [];
  }

  // ------------------------------------------------------------------
  // 出站（iframe → 宿主）
  // ------------------------------------------------------------------

  sendReady(payload: EmbedReadyPayload): void {
    this.send(makeEmbedFrame(EMBED_MSG_READY, payload));
  }

  sendAuthExpired(payload?: EmbedAuthExpiredPayload): void {
    this.send(makeEmbedFrame(EMBED_MSG_AUTH_EXPIRED, payload));
  }

  sendRouteChange(payload: EmbedRouteChangePayload): void {
    this.send(makeEmbedFrame(EMBED_MSG_ROUTE_CHANGE, payload));
  }

  sendPageEvent(payload: EmbedPageEventPayload): void {
    this.send(makeEmbedFrame(EMBED_MSG_PAGE_EVENT, payload));
  }

  sendHeightChange(payload: EmbedHeightChangePayload): void {
    this.send(makeEmbedFrame(EMBED_MSG_HEIGHT_CHANGE, payload));
  }

  sendQueryDataResult(msgId: string | undefined, payload: EmbedQueryDataResultPayload): void {
    this.send(makeEmbedFrame(EMBED_MSG_QUERY_DATA_RESULT, payload, msgId));
  }

  private send(frame: EmbedFrame): void {
    if (!this.parentOrigin) {
      if (this.outbox.length < MAX_OUTBOX_FRAMES) this.outbox.push(frame);
      return; // 未握手：缓冲（超限丢弃最旧以外的，ready 类关键消息不受影响——见 flush）
    }
    window.parent.postMessage(frame, this.parentOrigin);
  }

  private flushOutbox(): void {
    if (!this.parentOrigin) return;
    for (const frame of this.outbox) window.parent.postMessage(frame, this.parentOrigin);
    this.outbox = [];
  }

  // ------------------------------------------------------------------
  // 入站（宿主 → iframe）
  // ------------------------------------------------------------------

  private handleMessage = (event: MessageEvent): void => {
    if (event.source !== window.parent) return;
    if (!this.options.allowedOrigins.includes(event.origin)) return; // 非白名单：静默丢弃
    const frame = parseInbound(event.data);
    if (!frame) return;

    if (!this.parentOrigin) {
      // 握手只认 hello，且自报 origin 必须与实际发送方一致（伪造防御）
      if (frame.type !== EMBED_MSG_HELLO) return;
      const payload = frame.payload as EmbedHelloPayload | undefined;
      if (!payload || typeof payload.origin !== 'string' || payload.origin !== event.origin) {
        return;
      }
      this.parentOrigin = event.origin;
      this.options.handlers.onHello(payload);
      this.flushOutbox();
      return;
    }

    switch (frame.type) {
      case EMBED_MSG_HELLO:
        // 重复 hello 允许（宿主刷新令牌/重连场景），token 经 onHello 幂等写回
        this.options.handlers.onHello(frame.payload as EmbedHelloPayload);
        break;
      case EMBED_MSG_AUTH:
        this.options.handlers.onAuth((frame.payload ?? { token: '' }) as EmbedAuthPayload);
        break;
      case EMBED_MSG_CONTEXT:
        this.options.handlers.onContext((frame.payload ?? {}) as EmbedContextPayload);
        break;
      case EMBED_MSG_NAVIGATE:
        this.options.handlers.onNavigate((frame.payload ?? { slug: '' }) as EmbedNavigatePayload);
        break;
      case EMBED_MSG_QUERY_DATA:
        this.options.handlers.onQueryData(frame.msgId);
        break;
      case EMBED_MSG_READY:
      case EMBED_MSG_AUTH_EXPIRED:
      case EMBED_MSG_ROUTE_CHANGE:
      case EMBED_MSG_PAGE_EVENT:
      case EMBED_MSG_HEIGHT_CHANGE:
      case EMBED_MSG_QUERY_DATA_RESULT:
      default:
        break; // 出站方向的消息出现在入站侧 / 未识别类型：静默
    }
  };
}

/** 入站解析（isEmbedFrame 守卫 + 类型白名单在 shared 协议层完成）。 */
function parseInbound(data: unknown): EmbedFrame | null {
  return isEmbedFrame(data) ? (data as EmbedFrame) : null;
}

// ----------------------------------------------------------------------
// 活跃桥单例（embedEvent 自定义动作出站口）
// ----------------------------------------------------------------------

let activeBridge: EmbedBridge | null = null;

export function setActiveEmbedBridge(bridge: EmbedBridge | null): void {
  activeBridge = bridge;
}

export function getActiveEmbedBridge(): EmbedBridge | null {
  return activeBridge;
}
