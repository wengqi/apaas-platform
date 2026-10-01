/**
 * ${env.KEY} 解析单测（R1.4）。
 */

import { describe, it, expect } from 'vitest';
import { substituteEnvRefs, collectEnvRefPaths } from './env-substitution.js';

describe('substituteEnvRefs', () => {
  it('字符串中的 ${env.KEY} 被值替换（含混合文本）', () => {
    const r = substituteEnvRefs(
      { a: 'http://${env.HOST}:${env.PORT}/api' },
      { HOST: 'example.com', PORT: '8080' },
    );
    expect(r.value).toEqual({ a: 'http://example.com:8080/api' });
    expect(r.warnings).toEqual([]);
  });

  it('未定义 Key 保留原样并进 warnings（去重）', () => {
    const r = substituteEnvRefs({ a: '${env.MISSING}', b: ['${env.MISSING}', 'x'] }, {});
    expect((r.value as { a: string }).a).toBe('${env.MISSING}');
    expect(r.warnings).toEqual(['env.MISSING']);
  });

  it('深嵌套对象/数组新建返回，不改入参', () => {
    const input = { deep: { list: [{ v: '${env.K}' }] } };
    const snapshot = JSON.stringify(input);
    const r = substituteEnvRefs(input, { K: 'v1' });
    expect(JSON.stringify(input)).toBe(snapshot);
    expect((r.value as { deep: { list: Array<{ v: string }> } }).deep.list[0]!.v).toBe('v1');
  });

  it('非字符串标量与无引用字符串原样返回', () => {
    const r = substituteEnvRefs({ n: 42, b: true, s: 'plain', z: null }, {});
    expect(r.value).toEqual({ n: 42, b: true, s: 'plain', z: null });
    expect(r.warnings).toEqual([]);
  });
});

describe('collectEnvRefPaths（G1 引用清单）', () => {
  it('列出全部引用及其 JSON 位置', () => {
    const refs = collectEnvRefPaths({
      schema: {
        body: [{ api: { url: '${env.BASE}/list' } }],
        title: '固定值',
        threshold: '${env.LIMIT}',
      },
    });
    expect(refs).toEqual(['$.schema.body[0].api.url → env.BASE', '$.schema.threshold → env.LIMIT']);
  });

  it('无引用返回空数组', () => {
    expect(collectEnvRefPaths({ a: { b: 'plain' } })).toEqual([]);
  });
});
