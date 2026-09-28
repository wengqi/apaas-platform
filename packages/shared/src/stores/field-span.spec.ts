/**
 * 表单字段有效跨度单测 — E2-2 并排布局的纯函数口径。
 */

import { describe, expect, it } from 'vitest';
import { effectiveFieldSpan } from './field-span.js';

describe('effectiveFieldSpan', () => {
  it('无显式 span 且容器 1 列 → 整行 12', () => {
    expect(effectiveFieldSpan({ props: {} }, 1)).toBe(12);
  });

  it('容器 2 列 → 6；容器 3 列 → 4', () => {
    expect(effectiveFieldSpan({ props: {} }, 2)).toBe(6);
    expect(effectiveFieldSpan({ props: {} }, 3)).toBe(4);
  });

  it('显式 span 优先于容器列数', () => {
    expect(effectiveFieldSpan({ props: { span: 4 } }, 2)).toBe(4);
    expect(effectiveFieldSpan({ props: { span: 12 } }, 3)).toBe(12);
  });

  it('非法 span（0/13/取整后越界/非数字）回退列数折算', () => {
    expect(effectiveFieldSpan({ props: { span: 0 } }, 2)).toBe(6);
    expect(effectiveFieldSpan({ props: { span: 13 } }, 2)).toBe(6);
    expect(effectiveFieldSpan({ props: { span: 0.5 } }, 3)).toBe(4);
    expect(effectiveFieldSpan({ props: { span: '6' } }, 2)).toBe(6);
  });

  it('非法列数（1/4/undefined 视为 1）不折算', () => {
    expect(effectiveFieldSpan({ props: {} }, 4)).toBe(12);
    expect(effectiveFieldSpan({ props: { columns: 2 } }, 1)).toBe(12);
  });

  it('显式合法小数 span 向下取整', () => {
    expect(effectiveFieldSpan({ props: { span: 6.9 } }, 1)).toBe(6);
  });
});
