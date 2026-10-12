/**
 * iframe 嵌入通信协议（embed protocol）— 平台运行时页面被宿主系统 iframe 集成时
 * 的内外消息契约。协议两端共享本模块：iframe 侧在 runtime-ui，宿主侧用
 * createApaasEmbed（本目录 host-client）。
 *
 * 握手机制（hello-first）：
 * - 生产 nginx 对平台设了 `Referrer-Policy: no-referrer`，iframe 无法从
 *   document.referrer 推得宿主 origin——因此 iframe 在收到宿主第一条
 *   `apaas:hello` 之前保持静默，从该消息的 event.origin 学到宿主 origin
 *   并作为此后所有出站消息的 targetOrigin。iframe 永不向未知 origin 广播。
 * - token 引导走 URL hash（`#token=xxx`，initAuthFromHash 既有通道，读后清理）；
 *   会话中途轮换走 `apaas:auth` 消息。
 *
 * 安全规则（协议级约定）：
 * 1. 入站一律校验 event.origin 白名单（iframe 侧：宿主白名单 ∪ 同源；
 *    宿主侧：iframe 的 origin）；出站一律显式 targetOrigin，禁止 '*'。
 * 2. 带 msgId 的消息必须回 `<type>:result` 携带同一 msgId。
 * 3. 未识别的 type 静默忽略（双方版本可异步升级）。
 */

/** 协议版本（不兼容变更时递增，双方据此协商）。 */
export const EMBED_PROTOCOL_VERSION = 1;

/** iframe → 宿主：页面 schema 加载完成（握手完成信号，每页一条）。 */
export const EMBED_MSG_READY = 'apaas:ready';
/** iframe → 宿主：认证过期（401）。iframe 内永不渲染登录页，宿主接管。 */
export const EMBED_MSG_AUTH_EXPIRED = 'apaas:auth-expired';
/** iframe → 宿主：页面内跳转（表单提交后跳详情等），宿主可同步自身菜单高亮。 */
export const EMBED_MSG_ROUTE_CHANGE = 'apaas:route-change';
/** iframe → 宿主：页面业务事件出站——仅桥 dispatchEvent 自定义事件经
 *  embedEvent 动作显式转发（2026-10-12 用户裁决②），不外泄 amis 内部事件。 */
export const EMBED_MSG_PAGE_EVENT = 'apaas:page-event';
/** iframe → 宿主：内容高度变化（宿主可做 iframe 自适应高度）。 */
export const EMBED_MSG_HEIGHT_CHANGE = 'apaas:height-change';
/** 宿主 → iframe：握手首消息（学 origin + 初始 token/context/env）。 */
export const EMBED_MSG_HELLO = 'apaas:hello';
/** 宿主 → iframe：token 注入/轮换。 */
export const EMBED_MSG_AUTH = 'apaas:auth';
/** 宿主 → iframe：环境切换 + 页面输入数据更新（并入渲染 data 域）。 */
export const EMBED_MSG_CONTEXT = 'apaas:context';
/** 宿主 → iframe：驱动页面切换（宿主自建导航的载体，AppNavMenu 已按裁决①去除）。 */
export const EMBED_MSG_NAVIGATE = 'apaas:navigate';
/** 双向 rpc：宿主拉取当前页面数据域（带 msgId，回 EMBED_MSG_QUERY_DATA_RESULT）。 */
export const EMBED_MSG_QUERY_DATA = 'apaas:query-data';
/** query-data 的回执类型。 */
export const EMBED_MSG_QUERY_DATA_RESULT = 'apaas:query-data:result';

/** 协议消息信封。 */
export interface EmbedFrame<T = unknown> {
  /** 协议版本 */
  v: number;
  type: string;
  /** rpc 关联 id（携带 msgId 的消息必须回执） */
  msgId?: string;
  payload?: T;
  ts: number;
}

/** apaas:hello 载荷（宿主 → iframe）。 */
export interface EmbedHelloPayload {
  /** 宿主页面 origin（供 iframe 侧交叉核对 event.origin，防御伪造消息） */
  origin: string;
  /** 初始 token（未走 URL hash 引导时由此注入） */
  token?: string;
  /** 初始环境（缺省 prod） */
  env?: string;
  /** 初始页面输入数据（并入渲染 data 域，页面 schema 可模板引用） */
  context?: Record<string, unknown>;
}

/** apaas:ready 载荷（iframe → 宿主）。 */
export interface EmbedReadyPayload {
  appId: string;
  slug: string;
  /** 页面名（已发布 bundle 中的 name） */
  name: string;
  env: string;
  /** 用户信息存在性（JWT 直传场景 user 可能为 null，只承诺 token 可用） */
  authenticated: boolean;
}

/** apaas:auth-expired 载荷（iframe → 宿主）。 */
export interface EmbedAuthExpiredPayload {
  /** 触发失效的请求路径（诊断用，无敏感信息） */
  url?: string;
}

/** apaas:route-change 载荷（iframe → 宿主）。 */
export interface EmbedRouteChangePayload {
  appId: string;
  slug: string;
}

/** apaas:page-event 载荷（iframe → 宿主）。 */
export interface EmbedPageEventPayload {
  /** 自定义事件名（schema 作者经 embedEvent 动作 args.name 声明） */
  name: string;
  /** 事件数据（embedEvent 动作 args.data，原样透传） */
  data?: unknown;
}

/** apaas:height-change 载荷（iframe → 宿主）。 */
export interface EmbedHeightChangePayload {
  /** 文档内容高度（px） */
  height: number;
}

/** apaas:auth 载荷（宿主 → iframe）。 */
export interface EmbedAuthPayload {
  token: string;
}

/** apaas:context 载荷（宿主 → iframe）。 */
export interface EmbedContextPayload {
  env?: string;
  /** 全量替换页面输入数据域（非增量 merge，语义简单可预期） */
  context?: Record<string, unknown>;
}

/** apaas:navigate 载荷（宿主 → iframe）。 */
export interface EmbedNavigatePayload {
  slug: string;
}

/** apaas:query-data 载荷（宿主 → iframe，请求方向为空对象）。 */
export type EmbedQueryDataRequest = Record<string, never>;

/** apaas:query-data:result 载荷（iframe → 宿主）。 */
export interface EmbedQueryDataResultPayload {
  ok: boolean;
  /** 页面数据域（page 作用域可解析时）或注入的上下文合并域（兜底） */
  data?: Record<string, unknown>;
  /** 数据来源：page=amis 页面作用域快照；context=注入域兜底（页面作用域不可达） */
  source: 'page' | 'context';
  error?: string;
}

/** 协议消息类型全集（类型安全用）。 */
export const EMBED_MESSAGE_TYPES = [
  EMBED_MSG_READY,
  EMBED_MSG_AUTH_EXPIRED,
  EMBED_MSG_ROUTE_CHANGE,
  EMBED_MSG_PAGE_EVENT,
  EMBED_MSG_HEIGHT_CHANGE,
  EMBED_MSG_HELLO,
  EMBED_MSG_AUTH,
  EMBED_MSG_CONTEXT,
  EMBED_MSG_NAVIGATE,
  EMBED_MSG_QUERY_DATA,
  EMBED_MSG_QUERY_DATA_RESULT,
] as const;

export type EmbedMessageType = (typeof EMBED_MESSAGE_TYPES)[number];

/** 构造协议信封（ts 自动生成）。 */
export function makeEmbedFrame<T>(
  type: EmbedMessageType,
  payload?: T,
  msgId?: string,
): EmbedFrame<T> {
  const frame: EmbedFrame<T> = { v: EMBED_PROTOCOL_VERSION, type, ts: Date.now() };
  if (msgId !== undefined) frame.msgId = msgId;
  if (payload !== undefined) frame.payload = payload;
  return frame;
}

/** 入站消息守卫：形状 + 类型白名单 + 版本兼容（规则 3：不识别则静默忽略）。 */
export function isEmbedFrame(value: unknown): value is EmbedFrame {
  if (value === null || typeof value !== 'object') return false;
  const f = value as Partial<EmbedFrame>;
  if (typeof f.v !== 'number' || f.v > EMBED_PROTOCOL_VERSION) return false;
  if (typeof f.type !== 'string') return false;
  return (EMBED_MESSAGE_TYPES as readonly string[]).includes(f.type);
}

/** 解析 MessageEvent.data 为协议信封（JSON 字符串与对象双兼容，非协议消息返回 null）。 */
export function parseEmbedFrame(data: unknown): EmbedFrame | null {
  if (typeof data === 'string') {
    try {
      const parsed: unknown = JSON.parse(data);
      return isEmbedFrame(parsed) ? (parsed as EmbedFrame) : null;
    } catch {
      return null;
    }
  }
  return isEmbedFrame(data) ? (data as EmbedFrame) : null;
}
