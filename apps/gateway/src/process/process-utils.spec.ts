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

    it('求值失败返回 false', () => {
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

    it('流程启动时的顶层输入变量扁平化到作用域', () => {
      // buildEvalScope 应将顶层标量值（如 amount: 2000）纳入作用域
      const variables = {
        amount: 2000,
        status: 'urgent',
      };
      const rule = { '>': [{ var: 'amount' }, 1000] };
      expect(evaluateCondition(rule, variables)).toBe(true);

      const rule2 = { '==': [{ var: 'status' }, 'urgent'] };
      expect(evaluateCondition(rule2, variables)).toBe(true);

      const variables2 = { amount: 500, status: 'normal' };
      expect(evaluateCondition(rule, variables2)).toBe(false);
      expect(evaluateCondition(rule2, variables2)).toBe(false);
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

  // -------------------------------------------------------------------------
  // 条件分支路由 — edge label 匹配 + 多分支优先级
  // -------------------------------------------------------------------------

  describe('条件分支路由', () => {
    it('is_empty 操作符 — 字段不存在时为 true', () => {
      const rule = { '!': { var: 'missingField' } };
      expect(evaluateCondition(rule, { global: {} })).toBe(true);
    });

    it('is_empty 操作符 — 字段存在时为 false', () => {
      const rule = { '!': { var: 'amount' } };
      expect(evaluateCondition(rule, { global: { amount: 1000 } })).toBe(false);
    });

    it('is_not_empty 操作符 — 字段存在时为 true', () => {
      const rule = { '!!': { var: 'amount' } };
      expect(evaluateCondition(rule, { global: { amount: 1000 } })).toBe(true);
    });

    it('is_not_empty 操作符 — 字段不存在时为 false', () => {
      const rule = { '!!': { var: 'missingField' } };
      expect(evaluateCondition(rule, { global: {} })).toBe(false);
    });

    it('in 操作符 — 属于列表', () => {
      const rule = { in: [{ var: 'status' }, ['urgent', 'high']] };
      expect(evaluateCondition(rule, { global: { status: 'urgent' } })).toBe(true);
      expect(evaluateCondition(rule, { global: { status: 'normal' } })).toBe(false);
    });

    it('not_in 操作符 — 不属于列表', () => {
      const rule = { '!': { in: [{ var: 'status' }, ['urgent', 'high']] } };
      expect(evaluateCondition(rule, { global: { status: 'normal' } })).toBe(true);
      expect(evaluateCondition(rule, { global: { status: 'urgent' } })).toBe(false);
    });

    it('OR 组合 — 任一满足', () => {
      const rule = {
        or: [{ '>': [{ var: 'amount' }, 1000] }, { '==': [{ var: 'status' }, 'urgent'] }],
      };
      expect(evaluateCondition(rule, { global: { amount: 500, status: 'urgent' } })).toBe(true);
      expect(evaluateCondition(rule, { global: { amount: 2000, status: 'normal' } })).toBe(true);
      expect(evaluateCondition(rule, { global: { amount: 500, status: 'normal' } })).toBe(false);
    });

    it('嵌套 AND/OR 组合', () => {
      const rule = {
        and: [
          { '>': [{ var: 'amount' }, 100] },
          {
            or: [{ '==': [{ var: 'status' }, 'urgent'] }, { '==': [{ var: 'level' }, 'high'] }],
          },
        ],
      };
      expect(
        evaluateCondition(rule, { global: { amount: 500, status: 'urgent', level: 'low' } }),
      ).toBe(true);
      expect(
        evaluateCondition(rule, { global: { amount: 500, status: 'normal', level: 'high' } }),
      ).toBe(true);
      expect(
        evaluateCondition(rule, { global: { amount: 50, status: 'urgent', level: 'low' } }),
      ).toBe(false);
      expect(
        evaluateCondition(rule, { global: { amount: 500, status: 'normal', level: 'low' } }),
      ).toBe(false);
    });

    it('not 操作符 — 逻辑取反', () => {
      const rule = { '!': { '>': [{ var: 'amount' }, 1000] } };
      expect(evaluateCondition(rule, { global: { amount: 500 } })).toBe(true);
      expect(evaluateCondition(rule, { global: { amount: 2000 } })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 条件分支 — 全操作符覆盖测试
  // -------------------------------------------------------------------------

  describe('条件分支 — 全操作符覆盖', () => {
    const scope = {
      global: { amount: 1500, status: 'urgent', count: 3, active: true, name: 'hello world' },
    };

    it('等于 == — 字符串', () => {
      expect(evaluateCondition({ '==': [{ var: 'status' }, 'urgent'] }, scope)).toBe(true);
      expect(evaluateCondition({ '==': [{ var: 'status' }, 'normal'] }, scope)).toBe(false);
    });

    it('等于 == — 数字', () => {
      expect(evaluateCondition({ '==': [{ var: 'count' }, 3] }, scope)).toBe(true);
      expect(evaluateCondition({ '==': [{ var: 'count' }, 5] }, scope)).toBe(false);
    });

    it('等于 == — 布尔', () => {
      expect(evaluateCondition({ '==': [{ var: 'active' }, true] }, scope)).toBe(true);
      expect(evaluateCondition({ '==': [{ var: 'active' }, false] }, scope)).toBe(false);
    });

    it('不等于 !=', () => {
      expect(evaluateCondition({ '!=': [{ var: 'status' }, 'normal'] }, scope)).toBe(true);
      expect(evaluateCondition({ '!=': [{ var: 'status' }, 'urgent'] }, scope)).toBe(false);
    });

    it('大于 >', () => {
      expect(evaluateCondition({ '>': [{ var: 'amount' }, 1000] }, scope)).toBe(true);
      expect(evaluateCondition({ '>': [{ var: 'amount' }, 2000] }, scope)).toBe(false);
    });

    it('大于等于 >=', () => {
      expect(evaluateCondition({ '>=': [{ var: 'amount' }, 1500] }, scope)).toBe(true);
      expect(evaluateCondition({ '>=': [{ var: 'amount' }, 1501] }, scope)).toBe(false);
    });

    it('小于 <', () => {
      expect(evaluateCondition({ '<': [{ var: 'amount' }, 2000] }, scope)).toBe(true);
      expect(evaluateCondition({ '<': [{ var: 'amount' }, 1500] }, scope)).toBe(false);
    });

    it('小于等于 <=', () => {
      expect(evaluateCondition({ '<=': [{ var: 'amount' }, 1500] }, scope)).toBe(true);
      expect(evaluateCondition({ '<=': [{ var: 'amount' }, 1499] }, scope)).toBe(false);
    });

    it('包含 contains — 字符串子串', () => {
      expect(evaluateCondition({ in: ['hello', { var: 'name' }] }, scope)).toBe(true);
      expect(evaluateCondition({ in: ['goodbye', { var: 'name' }] }, scope)).toBe(false);
    });

    it('不包含 notContains', () => {
      expect(evaluateCondition({ '!': { in: ['goodbye', { var: 'name' }] } }, scope)).toBe(true);
      expect(evaluateCondition({ '!': { in: ['hello', { var: 'name' }] } }, scope)).toBe(false);
    });

    it('属于 in — 值在列表中', () => {
      expect(
        evaluateCondition({ in: [{ var: 'status' }, ['urgent', 'high', 'critical']] }, scope),
      ).toBe(true);
      expect(evaluateCondition({ in: [{ var: 'status' }, ['normal', 'low']] }, scope)).toBe(false);
    });

    it('不属于 notIn', () => {
      expect(
        evaluateCondition({ '!': { in: [{ var: 'status' }, ['normal', 'low']] } }, scope),
      ).toBe(true);
      expect(
        evaluateCondition({ '!': { in: [{ var: 'status' }, ['urgent', 'high']] } }, scope),
      ).toBe(false);
    });

    it('为空 is_empty — 空字符串', () => {
      expect(evaluateCondition({ '!': { var: 'missingField' } }, scope)).toBe(true);
      expect(evaluateCondition({ '!': { var: 'amount' } }, scope)).toBe(false);
    });

    it('不为空 is_not_empty', () => {
      expect(evaluateCondition({ '!!': { var: 'amount' } }, scope)).toBe(true);
      expect(evaluateCondition({ '!!': { var: 'missingField' } }, scope)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 条件分支 — 变量作用域测试
  // -------------------------------------------------------------------------

  describe('条件分支 — 变量作用域', () => {
    it('全局变量可通过 global 命名空间访问', () => {
      const rule = { '>': [{ var: 'amount' }, 1000] };
      expect(evaluateCondition(rule, { global: { amount: 2000 } })).toBe(true);
    });

    it('节点输出变量可通过 nodeId.output 扁平化访问', () => {
      const rule = { '==': [{ var: 'decision' }, 'APPROVED'] };
      const scope = {
        global: {},
        task_0: { output: { decision: 'APPROVED', comment: 'ok' } },
      };
      expect(evaluateCondition(rule, scope)).toBe(true);
    });

    it('流程启动时的顶层输入变量直接可访问', () => {
      const rule = { '>': [{ var: 'amount' }, 1000] };
      expect(evaluateCondition(rule, { amount: 2000, status: 'urgent' })).toBe(true);
      expect(evaluateCondition(rule, { amount: 500, status: 'normal' })).toBe(false);
    });

    it('全局变量优先于节点输出变量', () => {
      // global.amount = 100, node.amount = 5000 → scope.amount 应为 100（全局优先）
      const rule = { '>': [{ var: 'amount' }, 1000] };
      const scope = {
        global: { amount: 100 },
        node_0: { output: { amount: 5000 } },
      };
      expect(evaluateCondition(rule, scope)).toBe(false); // 100 > 1000 = false
    });

    it('多节点输出变量合并到作用域', () => {
      const rule = {
        and: [{ '==': [{ var: 'decision' }, 'APPROVED'] }, { '>': [{ var: 'amount' }, 1000] }],
      };
      const scope = {
        global: {},
        task_0: { output: { decision: 'APPROVED' } },
        trigger_0: { output: { amount: 2000 } },
      };
      expect(evaluateCondition(rule, scope)).toBe(true);
    });

    it('空作用域中任何条件返回 false（除 else）', () => {
      expect(evaluateCondition({ '>': [{ var: 'x' }, 1] }, { global: {} })).toBe(false);
      expect(evaluateCondition({ '==': [{ var: 'x' }, 'test'] }, { global: {} })).toBe(false);
      // else 分支（空规则）始终返回 true
      expect(evaluateCondition(null, { global: {} })).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 条件分支 — 多分支优先级场景
  // -------------------------------------------------------------------------

  describe('条件分支 — 多分支优先级', () => {
    // 模拟 ConditionExecutor 的分支选择逻辑
    interface ConditionBranch {
      label: string;
      condition?: object | null;
    }

    /** 模拟 ConditionExecutor.execute 的分支选择逻辑 */
    function selectBranch(
      branches: ConditionBranch[],
      variables: Record<string, unknown>,
    ): string | undefined {
      let chosenLabel: string | undefined;
      for (const branch of branches) {
        if (!branch.condition) {
          if (!chosenLabel) chosenLabel = branch.label;
          continue;
        }
        if (evaluateCondition(branch.condition, variables)) {
          chosenLabel = branch.label;
          break;
        }
      }
      return chosenLabel;
    }

    it('首个满足条件的分支被选中（优先级）', () => {
      const branches: ConditionBranch[] = [
        { label: '大于5000', condition: { '>': [{ var: 'amount' }, 5000] } },
        { label: '大于1000', condition: { '>': [{ var: 'amount' }, 1000] } },
        { label: '默认', condition: null },
      ];
      // amount=2000 → "大于5000" 不满足, "大于1000" 满足
      expect(selectBranch(branches, { global: { amount: 2000 } })).toBe('大于1000');
      // amount=6000 → "大于5000" 满足（首个满足）
      expect(selectBranch(branches, { global: { amount: 6000 } })).toBe('大于5000');
    });

    it('无匹配时走默认分支', () => {
      const branches: ConditionBranch[] = [
        { label: '大于1000', condition: { '>': [{ var: 'amount' }, 1000] } },
        { label: '默认', condition: null },
      ];
      expect(selectBranch(branches, { global: { amount: 500 } })).toBe('默认');
    });

    it('无匹配且无默认分支时返回 undefined', () => {
      const branches: ConditionBranch[] = [
        { label: '大于1000', condition: { '>': [{ var: 'amount' }, 1000] } },
      ];
      expect(selectBranch(branches, { global: { amount: 500 } })).toBeUndefined();
    });

    it('AND 条件组合的分支', () => {
      const branches: ConditionBranch[] = [
        {
          label: '紧急且大于1000',
          condition: {
            and: [{ '==': [{ var: 'status' }, 'urgent'] }, { '>': [{ var: 'amount' }, 1000] }],
          },
        },
        { label: '默认', condition: null },
      ];
      expect(selectBranch(branches, { global: { status: 'urgent', amount: 2000 } })).toBe(
        '紧急且大于1000',
      );
      expect(selectBranch(branches, { global: { status: 'urgent', amount: 500 } })).toBe('默认');
      expect(selectBranch(branches, { global: { status: 'normal', amount: 2000 } })).toBe('默认');
    });

    it('OR 条件组合的分支', () => {
      const branches: ConditionBranch[] = [
        {
          label: '紧急或大于1000',
          condition: {
            or: [{ '==': [{ var: 'status' }, 'urgent'] }, { '>': [{ var: 'amount' }, 1000] }],
          },
        },
        { label: '默认', condition: null },
      ];
      expect(selectBranch(branches, { global: { status: 'urgent', amount: 100 } })).toBe(
        '紧急或大于1000',
      );
      expect(selectBranch(branches, { global: { status: 'normal', amount: 2000 } })).toBe(
        '紧急或大于1000',
      );
      expect(selectBranch(branches, { global: { status: 'normal', amount: 500 } })).toBe('默认');
    });

    it('嵌套 AND/OR 条件组合的分支', () => {
      const branches: ConditionBranch[] = [
        {
          label: '复杂条件',
          condition: {
            and: [
              { '>': [{ var: 'amount' }, 100] },
              {
                or: [{ '==': [{ var: 'status' }, 'urgent'] }, { '==': [{ var: 'level' }, 'high'] }],
              },
            ],
          },
        },
        { label: '默认', condition: null },
      ];
      // amount=500, status=urgent → 满足
      expect(
        selectBranch(branches, { global: { amount: 500, status: 'urgent', level: 'low' } }),
      ).toBe('复杂条件');
      // amount=500, status=normal, level=high → 满足
      expect(
        selectBranch(branches, { global: { amount: 500, status: 'normal', level: 'high' } }),
      ).toBe('复杂条件');
      // amount=50 → 不满足（amount <= 100）
      expect(
        selectBranch(branches, { global: { amount: 50, status: 'urgent', level: 'low' } }),
      ).toBe('默认');
      // amount=500 但 status/level 都不匹配 → 不满足
      expect(
        selectBranch(branches, { global: { amount: 500, status: 'normal', level: 'low' } }),
      ).toBe('默认');
    });
  });
});
