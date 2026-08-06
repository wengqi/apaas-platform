import { describe, it, expect } from 'vitest';
import {
  evaluateCondition,
  resolveFlowValue,
  renderTemplateDotted,
  resolveInputs,
  writeNodeOutput,
} from './process-utils.js';

describe('process-utils', () => {
  describe('evaluateCondition', () => {
    it('空规则返回 true（else/default 分支）', () => {
      expect(evaluateCondition(null, {})).toBe(true);
      expect(evaluateCondition(undefined, {})).toBe(true);
      expect(evaluateCondition('', {})).toBe(true);
    });

    it('空 {{}} 字符串返回 true', () => {
      expect(evaluateCondition('{{}}', {})).toBe(true);
    });

    it('JsonLogic 对象 — 大于', () => {
      const rule = { '>': [{ var: 'amount' }, 1000] };
      expect(evaluateCondition(rule, { global: { amount: 5000 } })).toBe(true);
      expect(evaluateCondition(rule, { global: { amount: 500 } })).toBe(false);
    });

    it('JsonLogic 对象 — 等于', () => {
      const rule = { '==': [{ var: 'status' }, 'urgent'] };
      expect(evaluateCondition(rule, { global: { status: 'urgent' } })).toBe(true);
      expect(evaluateCondition(rule, { global: { status: 'normal' } })).toBe(false);
    });

    it('JsonLogic 对象 — AND 嵌套', () => {
      const rule = {
        and: [{ '>': [{ var: 'a' }, 1] }, { '<': [{ var: 'b' }, 2] }],
      };
      expect(evaluateCondition(rule, { global: { a: 5, b: 1 } })).toBe(true);
      expect(evaluateCondition(rule, { global: { a: 0, b: 1 } })).toBe(false);
    });

    it('expr-eval 字符串格式（向后兼容）', () => {
      expect(evaluateCondition('amount > 1000', { global: { amount: 2000 } })).toBe(true);
      expect(evaluateCondition('amount > 1000', { global: { amount: 500 } })).toBe(false);
    });

    it('求值失败返回 false', () => {
      expect(evaluateCondition('{{invalid syntax +}}', { global: {} })).toBe(false);
      expect(evaluateCondition({ unknownOp: [] }, { global: {} })).toBe(false);
    });

    it('节点输出变量扁平化到作用域', () => {
      // buildEvalScope 合并 node.output 的扁平字段
      const variables = {
        global: {},
        trigger_0: { output: { amount: 3000 } },
      };
      const rule = { '>': [{ var: 'amount' }, 1000] };
      expect(evaluateCondition(rule, variables)).toBe(true);
    });
  });

  describe('resolveFlowValue', () => {
    it('undefined 输入返回 undefined', () => {
      expect(resolveFlowValue(undefined, {})).toBeUndefined();
    });

    it('constant 四态 — 直接返回 content', () => {
      const fv = { type: 'constant' as const, content: 42 };
      expect(resolveFlowValue(fv, {})).toBe(42);
    });

    it('ref 四态 — 沿路径数组导航', () => {
      const fv = { type: 'ref' as const, content: ['trigger_0', 'output', 'recordId'] };
      const variables = { trigger_0: { output: { recordId: 'rec_123' } } };
      expect(resolveFlowValue(fv, variables)).toBe('rec_123');
    });

    it('ref 四态 — 路径不存在返回 undefined', () => {
      const fv = { type: 'ref' as const, content: ['missing', 'path'] };
      expect(resolveFlowValue(fv, { global: {} })).toBeUndefined();
    });

    it('expression 四态 — 求值表达式', () => {
      const fv = { type: 'expression' as const, content: 'price * 2' };
      const variables = { global: { price: 100 } };
      expect(resolveFlowValue(fv, variables)).toBe(200);
    });

    it('expression 四态 — 空表达式返回 undefined', () => {
      const fv = { type: 'expression' as const, content: '' };
      expect(resolveFlowValue(fv, { global: {} })).toBeUndefined();
    });

    it('template 四态 — 点分路径插值', () => {
      const fv = {
        type: 'template' as const,
        content: '订单 {{trigger_0.output.orderNo}} 已通过',
      };
      const variables = { trigger_0: { output: { orderNo: 'ORD-001' } } };
      expect(resolveFlowValue(fv, variables)).toBe('订单 ORD-001 已通过');
    });
  });

  describe('renderTemplateDotted', () => {
    it('单变量插值', () => {
      expect(renderTemplateDotted('Hello {{name}}', { name: 'World' })).toBe('Hello World');
    });

    it('点分路径插值', () => {
      const template = '订单号：{{trigger_0.output.orderNo}}';
      const variables = { trigger_0: { output: { orderNo: 'ORD-999' } } };
      expect(renderTemplateDotted(template, variables)).toBe('订单号：ORD-999');
    });

    it('缺失变量替换为空串', () => {
      expect(renderTemplateDotted('值：{{missing.path}}', {})).toBe('值：');
    });

    it('多变量混合插值', () => {
      const template = '{{a}} + {{b}} = {{c}}';
      const variables = { a: '1', b: '2', c: '3' };
      expect(renderTemplateDotted(template, variables)).toBe('1 + 2 = 3');
    });
  });

  describe('resolveInputs', () => {
    it('undefined 返回空对象', () => {
      expect(resolveInputs(undefined, {})).toEqual({});
    });

    it('批量解析四态值', () => {
      const inputs = {
        name: { type: 'constant' as const, content: 'test' },
        count: { type: 'constant' as const, content: 5 },
      };
      expect(resolveInputs(inputs, {})).toEqual({ name: 'test', count: 5 });
    });
  });

  describe('writeNodeOutput', () => {
    it('写入 [nodeId].output 结构', () => {
      const variables: Record<string, unknown> = {};
      writeNodeOutput(variables, 'node_1', { result: 'done' });
      expect(variables['node_1']).toEqual({ output: { result: 'done' } });
    });

    it('undefined output 不写入', () => {
      const variables: Record<string, unknown> = {};
      writeNodeOutput(variables, 'node_1', undefined);
      expect(variables['node_1']).toBeUndefined();
    });
  });
});
