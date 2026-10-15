/**
 * embed protocol 契约单测 — 信封守卫 / 版本兼容 / 双格式解析。
 */

import { describe, it, expect } from 'vitest';
import {
  EMBED_PROTOCOL_VERSION,
  EMBED_MESSAGE_TYPES,
  EMBED_MSG_HELLO,
  EMBED_MSG_READY,
  EMBED_MSG_PAGE_EVENT,
  makeEmbedFrame,
  isEmbedFrame,
  parseEmbedFrame,
} from './protocol.js';

describe('embed protocol 信封契约', () => {
  it('makeEmbedFrame 生成完整信封（v 版本 + ts + 可选 msgId/payload）', () => {
    const base = makeEmbedFrame(EMBED_MSG_READY);
    expect(base.v).toBe(EMBED_PROTOCOL_VERSION);
    expect(base.type).toBe('apaas:ready');
    expect(typeof base.ts).toBe('number');
    expect(base.msgId).toBeUndefined();
    expect(base.payload).toBeUndefined();

    const full = makeEmbedFrame(EMBED_MSG_PAGE_EVENT, { name: 'submitted' }, 'id-1');
    expect(full.msgId).toBe('id-1');
    expect(full.payload).toEqual({ name: 'submitted' });
  });

  it('isEmbedFrame：合法信封通过，形状缺失/未知类型/更高版本一律拒绝', () => {
    expect(isEmbedFrame(makeEmbedFrame(EMBED_MSG_HELLO, { origin: 'https://h.example' }))).toBe(
      true,
    );
    expect(isEmbedFrame(null)).toBe(false);
    expect(isEmbedFrame('str')).toBe(false);
    expect(isEmbedFrame({})).toBe(false);
    expect(isEmbedFrame({ v: 1, ts: 1 })).toBe(false); // 缺 type
    expect(isEmbedFrame({ v: 1, type: 'apaas:unknown-future', ts: 1 })).toBe(false); // 未知类型
    expect(isEmbedFrame({ v: EMBED_PROTOCOL_VERSION + 1, type: EMBED_MSG_READY, ts: 1 })).toBe(
      false,
    ); // 更高版本（协商失败）
  });

  it('parseEmbedFrame：对象与 JSON 字符串双兼容，垃圾输入返回 null', () => {
    const frame = makeEmbedFrame(EMBED_MSG_HELLO, { origin: 'https://h.example' });
    expect(parseEmbedFrame(frame)).toEqual(frame);
    expect(parseEmbedFrame(JSON.stringify(frame))).toEqual(frame);
    expect(parseEmbedFrame('not-json')).toBeNull();
    expect(parseEmbedFrame(JSON.stringify({ foo: 1 }))).toBeNull();
    expect(parseEmbedFrame(undefined)).toBeNull();
  });

  it('消息类型全集无重复且以 apaas: 前缀命名', () => {
    const set = new Set(EMBED_MESSAGE_TYPES);
    expect(set.size).toBe(EMBED_MESSAGE_TYPES.length);
    for (const t of EMBED_MESSAGE_TYPES) expect(t.startsWith('apaas:')).toBe(true);
  });
});
