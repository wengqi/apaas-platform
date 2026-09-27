/**
 * 状态数据页签纯函数单元测试 — 变量分组 / 组件状态摘要 / 值格式化。
 */

import { describe, expect, it } from 'vitest';
import { propKeyCount, splitVariables, stringifyValue } from './state-data.js';
import type { ComponentNode, VariableDef } from '../api/pages.js';

function def(partial: Partial<VariableDef>): VariableDef {
  return { type: 'scalar', ...partial };
}

describe('状态数据 — splitVariables', () => {
  it('带 datasource 的变量归入数据请求，其余归入自定义变量', () => {
    const { dataRequests, custom } = splitVariables({
      list: def({ type: 'record_list', datasource: { objectId: 'obj1', autoQuery: true } }),
      record: def({ type: 'record', datasource: { objectId: 'obj1', autoQuery: false } }),
      keyword: def({ type: 'scalar', initialValue: '' }),
      flags: def({ type: 'array' }),
    });
    expect(dataRequests.map(([n]) => n)).toEqual(['list', 'record']);
    expect(custom.map(([n]) => n)).toEqual(['keyword', 'flags']);
  });

  it('空变量表返回两组空数组', () => {
    const { dataRequests, custom } = splitVariables({});
    expect(dataRequests).toHaveLength(0);
    expect(custom).toHaveLength(0);
  });
});

describe('状态数据 — 组件状态摘要', () => {
  it('propKeyCount 统计 props 键数', () => {
    const node = {
      id: 'a',
      type: 'text',
      props: { content: 'x', className: 'y' },
    } as unknown as ComponentNode;
    expect(propKeyCount(node)).toBe(2);
  });

  it('无 props 时为 0', () => {
    const node = { id: 'a', type: 'text', props: {} } as unknown as ComponentNode;
    expect(propKeyCount(node)).toBe(0);
  });
});

describe('状态数据 — stringifyValue', () => {
  it('字符串带引号', () => {
    expect(stringifyValue('hi')).toBe('"hi"');
  });

  it('null / undefined / 布尔 / 数字', () => {
    expect(stringifyValue(null)).toBe('null');
    expect(stringifyValue(undefined)).toBe('undefined');
    expect(stringifyValue(true)).toBe('true');
    expect(stringifyValue(3)).toBe('3');
  });

  it('对象 JSON 序列化', () => {
    expect(stringifyValue({ a: 1 })).toBe('{"a":1}');
  });
});
