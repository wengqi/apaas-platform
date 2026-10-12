/**
 * EmbedBridge 单测 — hello-first 握手 / origin 白名单 / 出站缓冲 / rpc 回执。
 *
 * jsdom 保真度限制（实测探针）：window.postMessage 发出的事件 origin 为空串、
 * source 不等于 window——桥的两大入站防线在 jsdom 下无法经真实管线触发。
 * 因此入站用合成 MessageEvent（显式 origin/source，等价浏览器真实值）驱动；
 * 出站走真实 postMessage（jsdom 可派发，采集器只读 data 不受影响）。
 * 真实浏览器双向管线由 /embed-demo 宿主模拟器浏览器走查覆盖。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EMBED_MSG_AUTH,
  EMBED_MSG_CONTEXT,
  EMBED_MSG_HELLO,
  EMBED_MSG_NAVIGATE,
  EMBED_MSG_PAGE_EVENT,
  EMBED_MSG_QUERY_DATA,
  EMBED_MSG_READY,
  makeEmbedFrame,
  type EmbedFrame,
} from '@apaas/shared/embed';
import {
  EmbedBridge,
  getActiveEmbedBridge,
  setActiveEmbedBridge,
  type EmbedBridgeHandlers,
} from './embedBridge';

const ORIGIN = window.location.origin;
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

/** 构造来自宿主的真实形状消息事件（origin/source 由显式指定，绕过 jsdom 限制）。 */
function fromParent(frame: EmbedFrame, origin: string = ORIGIN): MessageEvent {
  return new MessageEvent('message', { origin, source: window, data: frame });
}

/** 宿主侧协议消息采集器（只读 data，过滤宿主自己发出的 hello）。 */
function collectOutbound(): { frames: EmbedFrame[]; dispose: () => void } {
  const frames: EmbedFrame[] = [];
  const listener = (e: MessageEvent): void => {
    const d = e.data as { v?: unknown; type?: unknown } | null;
    if (
      d !== null &&
      typeof d === 'object' &&
      typeof d.v === 'number' &&
      typeof d.type === 'string' &&
      d.type !== EMBED_MSG_HELLO
    ) {
      frames.push(d as EmbedFrame);
    }
  };
  window.addEventListener('message', listener);
  return { frames, dispose: () => window.removeEventListener('message', listener) };
}

function createHandlers(): EmbedBridgeHandlers {
  return {
    onHello: vi.fn(),
    onAuth: vi.fn(),
    onContext: vi.fn(),
    onNavigate: vi.fn(),
    onQueryData: vi.fn(),
  };
}

describe('EmbedBridge', () => {
  let handlers: EmbedBridgeHandlers;
  let bridge: EmbedBridge;

  beforeEach(() => {
    handlers = createHandlers();
    bridge = new EmbedBridge({ allowedOrigins: [ORIGIN], handlers });
    bridge.start();
  });

  afterEach(() => {
    bridge.stop();
    setActiveEmbedBridge(null);
  });

  it('hello-first：未握手前出站静默缓冲，合法 hello 后一次性放行', async () => {
    const { frames, dispose } = collectOutbound();
    bridge.sendReady({ appId: 'a1', slug: 's1', name: '页一', env: 'prod', authenticated: false });
    expect(frames).toHaveLength(0); // 未握手：不广播

    window.dispatchEvent(fromParent(makeEmbedFrame(EMBED_MSG_HELLO, { origin: ORIGIN })));
    await tick();

    expect(handlers.onHello).toHaveBeenCalledTimes(1);
    expect(frames.map((f) => f.type)).toEqual([EMBED_MSG_READY]); // 缓冲出站放行
    expect(frames[0]?.payload).toMatchObject({ appId: 'a1', slug: 's1' });
    dispose();
  });

  it('白名单外的 origin 发来的 hello 被静默丢弃（不握手不出站）', async () => {
    const { frames, dispose } = collectOutbound();
    window.dispatchEvent(fromParent(makeEmbedFrame(EMBED_MSG_HELLO, { origin: ORIGIN })));
    await tick();
    expect(handlers.onHello).toHaveBeenCalledTimes(1); // 同源在白名单内，正常握手
    expect(frames).toHaveLength(0);

    window.dispatchEvent(
      fromParent(
        makeEmbedFrame(EMBED_MSG_HELLO, { origin: 'https://evil.example' }),
        'https://evil.example',
      ),
    );
    await tick();
    expect(handlers.onHello).toHaveBeenCalledTimes(1); // 仍为 1：异源未握手
    dispose();
  });

  it('hello 自报 origin 与实际发送方不符视为伪造，不握手', async () => {
    const { frames, dispose } = collectOutbound();
    window.dispatchEvent(
      fromParent(makeEmbedFrame(EMBED_MSG_HELLO, { origin: 'https://spoofed.example' })),
    );
    await tick();
    expect(handlers.onHello).not.toHaveBeenCalled();

    bridge.sendReady({ appId: 'a1', slug: 's1', name: '页一', env: 'prod', authenticated: true });
    expect(frames).toHaveLength(0); // 未握手，出站仍缓冲
    dispose();
  });

  it('握手后 auth/context/navigate/query-data 路由到对应回调', async () => {
    window.dispatchEvent(fromParent(makeEmbedFrame(EMBED_MSG_HELLO, { origin: ORIGIN })));
    await tick();

    window.dispatchEvent(fromParent(makeEmbedFrame(EMBED_MSG_AUTH, { token: 't2' })));
    window.dispatchEvent(fromParent(makeEmbedFrame(EMBED_MSG_CONTEXT, { env: 'dev' })));
    window.dispatchEvent(fromParent(makeEmbedFrame(EMBED_MSG_NAVIGATE, { slug: 's2' })));
    window.dispatchEvent(fromParent(makeEmbedFrame(EMBED_MSG_QUERY_DATA, {}, 'msg-42')));
    await tick();

    expect(handlers.onAuth).toHaveBeenCalledWith({ token: 't2' });
    expect(handlers.onContext).toHaveBeenCalledWith({ env: 'dev' });
    expect(handlers.onNavigate).toHaveBeenCalledWith({ slug: 's2' });
    expect(handlers.onQueryData).toHaveBeenCalledWith('msg-42');
  });

  it('握手后的重复 hello 幂等生效（token 轮换场景）', async () => {
    window.dispatchEvent(fromParent(makeEmbedFrame(EMBED_MSG_HELLO, { origin: ORIGIN })));
    await tick();
    window.dispatchEvent(
      fromParent(makeEmbedFrame(EMBED_MSG_HELLO, { origin: ORIGIN, token: 't-rotated' })),
    );
    await tick();
    expect(handlers.onHello).toHaveBeenCalledTimes(2);
    expect(handlers.onHello).toHaveBeenLastCalledWith({ origin: ORIGIN, token: 't-rotated' });
  });

  it('sendQueryDataResult 携带原 msgId 回执宿主', async () => {
    const { frames, dispose } = collectOutbound();
    window.dispatchEvent(fromParent(makeEmbedFrame(EMBED_MSG_HELLO, { origin: ORIGIN })));
    await tick();

    bridge.sendQueryDataResult('rpc-1', { ok: true, source: 'page', data: { x: 1 } });
    await tick();
    const result = frames.find((f) => f.type === 'apaas:query-data:result');
    expect(result?.msgId).toBe('rpc-1');
    expect(result?.payload).toMatchObject({ ok: true, source: 'page' });
    dispose();
  });

  it('stop 后停止收发；活跃桥单例可设置与清除', () => {
    expect(getActiveEmbedBridge()).toBeNull();
    setActiveEmbedBridge(bridge);
    expect(getActiveEmbedBridge()).toBe(bridge);
    bridge.stop();
    setActiveEmbedBridge(null);
    expect(getActiveEmbedBridge()).toBeNull();

    const { frames, dispose } = collectOutbound();
    bridge.sendPageEvent({ name: 'after-stop' });
    expect(frames).toHaveLength(0);
    expect(handlers.onQueryData).not.toHaveBeenCalled();
    dispose();
    expect(EMBED_MSG_PAGE_EVENT).toBe('apaas:page-event');
    expect(EMBED_MSG_READY).toBe('apaas:ready');
  });
});
