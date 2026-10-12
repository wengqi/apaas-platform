/**
 * embed SDK 产物契约单测 —— 双格式生成/关键导出/node 装载探针。
 * 逻辑与 CLI 共用（buildEmbedSdk/assertArtifacts），保证测试路径=构建路径。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildEmbedSdk, assertArtifacts } from './build-embed-sdk.mjs';

describe('embed SDK 产物契约', () => {
  it('双格式产物生成且通过冒烟断言（关键导出在位）', async () => {
    const artifacts = await buildEmbedSdk();
    expect(() => assertArtifacts(artifacts)).not.toThrow();
  });

  it('IIFE 全局探针：node 可装载，暴露 createApaasEmbed 与协议常量', async () => {
    const { iifePath } = await buildEmbedSdk();
    const code = readFileSync(iifePath, 'utf8');
    const ns = new Function(`${code}; return ApaasEmbed;`)();
    expect(typeof ns.createApaasEmbed).toBe('function');
    expect(ns.EMBED_PROTOCOL_VERSION).toBe(1);
    expect(typeof ns.parseEmbedFrame).toBe('function');
  });

  it('ESM 产物保留协议版本导出（版本协商 SSOT）', async () => {
    const { esmPath } = await buildEmbedSdk();
    const esm = readFileSync(esmPath, 'utf8');
    expect(esm).toContain('EMBED_PROTOCOL_VERSION');
    expect(esm).toContain('embed protocol v1'); // banner 携带版本
  });
});
