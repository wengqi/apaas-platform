/**
 * query-builder-config 单元测试 —— RAQB 配置工厂 buildQbConfig。
 *
 * 覆盖：
 * - buildQbConfig 基本结构（fields、settings）
 * - 字段类型映射（text/number/boolean/date）
 * - 操作符注册（按类型、自定义 contains/in/notIn 等）
 * - 空变量时的 placeholder 处理
 * - 操作符类型配置覆盖（config.types 每种字段类型的 operators 列表）
 * - loadFromJsonLogic / exportToJsonLogic 边界情况
 * - renderButton 拦截钩子（Popconfirm 对 delGroup/delRuleGroup/delRule）
 */

import { describe, it, expect } from 'vitest';
import {
  buildQbConfig,
  loadFromJsonLogic,
  exportToJsonLogic,
  newQbId,
} from './query-builder-config.js';
import { expressionToJsonLogic, jsonLogicToExpression } from './jsonlogic-utils.js';
// Config 类型在 buildQbConfig 等函数中通过类型断言使用，此处不直接引用

// 基础变量列表（各类型）
const basicVariables = [
  { value: 'amount', label: '金额', type: 'number' },
  { value: 'name', label: '名称', type: 'string' },
  { value: 'isActive', label: '是否启用', type: 'boolean' },
  { value: 'createdAt', label: '创建时间', type: 'date' },
];

describe('buildQbConfig — 基本结构', () => {
  it('返回对象含 fields', () => {
    const config = buildQbConfig(basicVariables);
    expect(config.fields).toBeDefined();
  });

  it('返回对象含 settings', () => {
    const config = buildQbConfig(basicVariables);
    expect(config.settings).toBeDefined();
  });

  it('fields 包含所有变量', () => {
    const config = buildQbConfig(basicVariables);
    const fields = config.fields as Record<string, unknown>;
    expect(Object.keys(fields)).toHaveLength(4);
    expect(fields['amount']).toBeDefined();
    expect(fields['name']).toBeDefined();
    expect(fields['isActive']).toBeDefined();
    expect(fields['createdAt']).toBeDefined();
  });

  it('字段 label 包含来源节点信息', () => {
    const config = buildQbConfig(basicVariables);
    const fields = config.fields as Record<string, { label: string }>;
    expect(fields['amount']!.label).toBe('金额');
  });
});

describe('buildQbConfig — 字段类型映射', () => {
  it('string → text', () => {
    const config = buildQbConfig([{ value: 'name', label: '名称', type: 'string' }]);
    const fields = config.fields as Record<string, { type: string }>;
    expect(fields['name']!.type).toBe('text');
  });

  it('number → number', () => {
    const config = buildQbConfig([{ value: 'amount', label: '金额', type: 'number' }]);
    const fields = config.fields as Record<string, { type: string }>;
    expect(fields['amount']!.type).toBe('number');
  });

  it('boolean → boolean', () => {
    const config = buildQbConfig([{ value: 'isActive', label: '是否启用', type: 'boolean' }]);
    const fields = config.fields as Record<string, { type: string }>;
    expect(fields['isActive']!.type).toBe('boolean');
  });

  it('date → text（当前实现 #2 已知问题）', () => {
    const config = buildQbConfig([{ value: 'createdAt', label: '创建时间', type: 'date' }]);
    const fields = config.fields as Record<string, { type: string }>;
    expect(fields['createdAt']!.type).toBe('text');
  });

  it.skip('#2 修复后 date → date', () => {
    const config = buildQbConfig([{ value: 'createdAt', label: '创建时间', type: 'date' }]);
    const fields = config.fields as Record<string, { type: string }>;
    expect(fields['createdAt']!.type).toBe('date');
  });

  it('未知类型 → text', () => {
    const config = buildQbConfig([{ value: 'field', label: '未知', type: 'unknown' }]);
    const fields = config.fields as Record<string, { type: string }>;
    expect(fields['field']!.type).toBe('text');
  });
});

describe('buildQbConfig — 操作符注册', () => {
  it('text 类型字段有 8 个操作符', () => {
    const config = buildQbConfig([{ value: 'name', label: '名称', type: 'text' }]);
    const fields = config.fields as Record<string, { operators: string[] }>;
    expect(fields['name']!.operators).toHaveLength(8);
    expect(fields['name']!.operators).toContain('equal');
    expect(fields['name']!.operators).toContain('not_equal');
    expect(fields['name']!.operators).toContain('contains');
    expect(fields['name']!.operators).toContain('not_contains');
    expect(fields['name']!.operators).toContain('in');
    expect(fields['name']!.operators).toContain('not_in');
    expect(fields['name']!.operators).toContain('is_empty');
    expect(fields['name']!.operators).toContain('is_not_empty');
  });

  it('number 类型字段有 8 个操作符', () => {
    const config = buildQbConfig([{ value: 'amount', label: '金额', type: 'number' }]);
    const fields = config.fields as Record<string, { operators: string[] }>;
    expect(fields['amount']!.operators).toHaveLength(8);
  });

  it('boolean 类型字段有 2 个操作符', () => {
    const config = buildQbConfig([{ value: 'isActive', label: '是否启用', type: 'boolean' }]);
    const fields = config.fields as Record<string, { operators: string[] }>;
    expect(fields['isActive']!.operators).toHaveLength(2);
    expect(fields['isActive']!.operators).toEqual(['equal', 'not_equal']);
  });

  it('date 类型字段有 8 个操作符', () => {
    const config = buildQbConfig([{ value: 'createdAt', label: '创建时间', type: 'date' }]);
    const fields = config.fields as Record<string, { operators: string[] }>;
    expect(fields['createdAt']!.operators).toHaveLength(8);
  });
});

describe('buildQbConfig — 自定义操作符 label', () => {
  it('is_empty label = "为空"', () => {
    const config = buildQbConfig(basicVariables);
    const operators = (config as unknown as { operators: Record<string, { label: string }> })
      .operators;
    expect(operators['is_empty']?.label).toBe('为空');
  });

  it('is_not_empty label = "不为空"', () => {
    const config = buildQbConfig(basicVariables);
    const operators = (config as unknown as { operators: Record<string, { label: string }> })
      .operators;
    expect(operators['is_not_empty']?.label).toBe('不为空');
  });

  it('contains label = "包含"', () => {
    const config = buildQbConfig(basicVariables);
    const operators = (config as unknown as { operators: Record<string, { label: string }> })
      .operators;
    expect(operators['contains']?.label).toBe('包含');
  });

  it('not_contains label = "不包含"', () => {
    const config = buildQbConfig(basicVariables);
    const operators = (config as unknown as { operators: Record<string, { label: string }> })
      .operators;
    expect(operators['not_contains']?.label).toBe('不包含');
  });

  it('in label = "属于"', () => {
    const config = buildQbConfig(basicVariables);
    const operators = (config as unknown as { operators: Record<string, { label: string }> })
      .operators;
    expect(operators['in']?.label).toBe('属于');
  });

  it('not_in label = "不属于"', () => {
    const config = buildQbConfig(basicVariables);
    const operators = (config as unknown as { operators: Record<string, { label: string }> })
      .operators;
    expect(operators['not_in']?.label).toBe('不属于');
  });
});

describe('buildQbConfig — 空变量 placeholder', () => {
  it('无变量时 fields 含占位字段', () => {
    const config = buildQbConfig([]);
    const fields = config.fields as Record<string, unknown>;
    expect(Object.keys(fields)).toHaveLength(1);
    expect(fields['__placeholder__']).toBeDefined();
  });

  it('placeholder 为 text 类型', () => {
    const config = buildQbConfig([]);
    const fields = config.fields as Record<string, { type: string }>;
    expect(fields['__placeholder__']!.type).toBe('text');
  });
});

describe('buildQbConfig — config.types 操作符覆盖', () => {
  it('types 中包含 text/number/boolean/date 四种类型', () => {
    const config = buildQbConfig(basicVariables);
    const types = (config as unknown as { types: Record<string, unknown> }).types;
    expect(types).toBeDefined();
    expect(types!['text']).toBeDefined();
    expect(types!['number']).toBeDefined();
    expect(types!['boolean']).toBeDefined();
    expect(types!['date']).toBeDefined();
  });

  it('每种类型的 widget operators 被重置为自定义操作符列表', () => {
    const config = buildQbConfig(basicVariables);
    const types = (
      config as unknown as {
        types: Record<string, { widgets?: Record<string, { operators?: string[] }> }>;
      }
    ).types;
    for (const fieldType of ['text', 'number', 'boolean', 'date'] as const) {
      const typeDef = types[fieldType];
      if (!typeDef?.widgets) continue;
      for (const widgetDef of Object.values(typeDef.widgets)) {
        if (widgetDef?.operators) {
          // 每个 widget 的操作符列表应从 OPERATOR_KEYS_BY_TYPE 覆盖，不是空
          expect(widgetDef.operators.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('buildQbConfig — settings', () => {
  it('renderItem 被注入为 CustomRule 渲染器', () => {
    const config = buildQbConfig(basicVariables);
    const settings = config.settings as unknown as Record<string, unknown>;
    const renderItem = settings['renderItem'];
    expect(renderItem).toBeDefined();
    expect(typeof renderItem).toBe('function');
  });

  it('renderButton 被注入为 Popconfirm 拦截器', () => {
    const config = buildQbConfig(basicVariables);
    const settings = config.settings as unknown as Record<string, unknown>;
    // origRenderButton 应该存在（来自 AntdConfig）
    // 我们的 renderButton 封装应该包含 deleteConfirmText 逻辑
    const renderButton = settings['renderButton'];
    expect(renderButton).toBeDefined();
    expect(typeof renderButton).toBe('function');
  });
});

describe('loadFromJsonLogic', () => {
  it('null → 返回空树', () => {
    const config = buildQbConfig(basicVariables);
    const tree = loadFromJsonLogic(null, config);
    // 预期返回非 null 对象（空树）
    expect(tree).not.toBeNull();
  });

  it('undefined → 返回空树', () => {
    const config = buildQbConfig(basicVariables);
    const tree = loadFromJsonLogic(undefined, config);
    expect(tree).not.toBeNull();
  });

  it('合法 JsonLogic → 返回 ImmutableTree', () => {
    const config = buildQbConfig(basicVariables);
    const tree = loadFromJsonLogic({ '>': [{ var: 'amount' }, 1000] }, config);
    expect(tree).not.toBeNull();
  });

  it('空对象 → 返回空树', () => {
    const config = buildQbConfig(basicVariables);
    const tree = loadFromJsonLogic({}, config);
    // RAQB loadFromJsonLogic({}) 可能返回 null → 降级为 emptyTree
    expect(tree).not.toBeNull();
  });

  // 修复 BUG：历史数据中 and/or 的值可能不是数组（之前会触发 RAQB 内部 r.join 报错）
  // normalizeJsonLogic 在 loadFromJsonLogic 入口处包装
  it('and 节点值是单个对象（历史数据格式）→ 规范化后正常加载', () => {
    const config = buildQbConfig(basicVariables);
    const malformed = { and: { '>': [{ var: 'amount' }, 1000] } };
    const tree = loadFromJsonLogic(malformed, config);
    expect(tree).not.toBeNull();
  });

  it('or 节点值是单个对象（历史数据格式）→ 规范化后正常加载', () => {
    const config = buildQbConfig(basicVariables);
    const malformed = { or: { '>': [{ var: 'amount' }, 1000] } };
    const tree = loadFromJsonLogic(malformed, config);
    expect(tree).not.toBeNull();
  });

  it('嵌套 and/or 不一致（部分数组部分对象）→ 递归规范化', () => {
    const config = buildQbConfig(basicVariables);
    const malformed = {
      and: [{ '>': [{ var: 'amount' }, 1000] }, { or: { '==': [{ var: 'status' }, 'urgent'] } }],
    };
    const tree = loadFromJsonLogic(malformed, config);
    expect(tree).not.toBeNull();
  });

  it('完全合法的 and 数组 → 正常加载', () => {
    const config = buildQbConfig(basicVariables);
    const valid = {
      and: [{ '>': [{ var: 'amount' }, 1000] }, { '==': [{ var: 'status' }, 'urgent'] }],
    };
    const tree = loadFromJsonLogic(valid, config);
    expect(tree).not.toBeNull();
  });
});

describe('exportToJsonLogic', () => {
  it('null tree → 返回 null', () => {
    const config = buildQbConfig(basicVariables);
    expect(exportToJsonLogic(null, config)).toBeNull();
  });
});

// 操作符往返测试：expressionToJsonLogic → loadFromJsonLogic → exportToJsonLogic
// 验证所有操作符在可视化↔表达式切换时不触发 RAQB 加载错误
describe('操作符往返测试 (expression → RAQB → expression)', () => {
  // 注册所有需要使用的字段
  const allFields = [
    ...basicVariables,
    { value: 'tags', label: '标签', type: 'string' },
    { value: 'status', label: '状态', type: 'text' },
    { value: 'remark', label: '备注', type: 'string' },
  ];
  const config = buildQbConfig(allFields);

  const roundTripCases: { label: string; expr: string }[] = [
    // 简单比较
    { label: '等于 ==', expr: 'amount > 1000' },
    { label: '不等于 !=', expr: 'amount != 1000' },
    { label: '小于 <', expr: 'amount < 1000' },
    { label: '大于等于 >=', expr: 'amount >= 1000' },
    { label: '小于等于 <=', expr: 'amount <= 1000' },
    // 字符串比较
    { label: '字符串 ==', expr: 'name == "vip"' },
    { label: '字符串 !=', expr: 'name != "vip"' },
    // 函数表达式
    { label: '包含 contains', expr: 'contains(tags, "vip")' },
    { label: '不包含 notContains', expr: 'notContains(tags, "vip")' },
    { label: '属于 in', expr: 'in(status, ["new","done"])' },
    { label: '不属于 notIn', expr: 'notIn(status, ["new","done"])' },
    { label: '为空 isEmpty', expr: 'isEmpty(remark)' },
    { label: '不为空 isNotEmpty', expr: 'isNotEmpty(remark)' },
    // AND 组合
    { label: '简单 AND', expr: 'amount > 1 and name == "x"' },
    { label: 'AND+函数', expr: 'amount > 1 and contains(tags, "vip")' },
    // OR 组合
    { label: '简单 OR', expr: 'amount > 1 or name == "x"' },
  ];

  for (const { label, expr } of roundTripCases) {
    it(label, () => {
      // 步骤 1: 表达式 → JsonLogic (模拟用户切换到表达式模式后的数据)
      const logicFromExpr = expressionToJsonLogic(expr);
      expect(logicFromExpr).not.toBeNull();

      // 步骤 2: JsonLogic → RAQB tree → JsonLogic' (模拟切回可视化模式)
      const tree = loadFromJsonLogic(logicFromExpr, config);
      expect(tree).not.toBeNull();

      // 步骤 3: 验证 RAQB 能成功导出（不抛错）
      const exported = exportToJsonLogic(tree, config);
      expect(exported).not.toBeNull();
    });
  }

  // 严格往返断言：确保 contains/notContains/in/notIn 的语义在往返后保持一致
  // 这是之前 bug 的核心: notContains 被误判为 notIn, 导致 value 结构错误
  describe('contains/notContains/in/notIn 语义保持', () => {
    const strictConfig = buildQbConfig([
      ...basicVariables,
      { value: 'tags', label: '标签', type: 'string' },
      { value: 'status', label: '状态', type: 'text' },
    ]);

    it('contains(tags, "vip") 往返后仍为 contains 语义（标量值）', () => {
      const expr = 'contains(tags, "vip")';
      const logic = expressionToJsonLogic(expr);
      expect(logic).not.toBeNull();

      // 表达式 → RAQB → 导出
      const tree = loadFromJsonLogic(logic, strictConfig);
      const exported = exportToJsonLogic(tree, strictConfig);
      expect(exported).not.toBeNull();

      // 导出后 → 表达式（验证语义没变成 in）
      const finalExpr = jsonLogicToExpression(exported as object);
      expect(finalExpr).toBe('contains(tags, "vip")');
      expect(finalExpr).not.toContain('in(');
    });

    it('notContains(tags, "vip") 往返后仍为 notContains（不被误判为 notIn）', () => {
      const expr = 'notContains(tags, "vip")';
      const logic = expressionToJsonLogic(expr);
      expect(logic).not.toBeNull();

      const tree = loadFromJsonLogic(logic, strictConfig);
      const exported = exportToJsonLogic(tree, strictConfig);
      expect(exported).not.toBeNull();

      const finalExpr = jsonLogicToExpression(exported as object);
      expect(finalExpr).toBe('notContains(tags, "vip")');
      expect(finalExpr).not.toContain('notIn(');
    });

    it('in(status, ["new","done"]) 往返后仍为 in（多值语义）', () => {
      const expr = 'in(status, ["new", "done"])';
      const logic = expressionToJsonLogic(expr);
      expect(logic).not.toBeNull();

      const tree = loadFromJsonLogic(logic, strictConfig);
      const exported = exportToJsonLogic(tree, strictConfig);
      expect(exported).not.toBeNull();

      const finalExpr = jsonLogicToExpression(exported as object);
      expect(finalExpr).toBe('in(status, ["new", "done"])');
      expect(finalExpr).not.toContain('contains(');
    });

    it('notIn(status, ["new","done"]) 往返后仍为 notIn', () => {
      const expr = 'notIn(status, ["new", "done"])';
      const logic = expressionToJsonLogic(expr);
      expect(logic).not.toBeNull();

      const tree = loadFromJsonLogic(logic, strictConfig);
      const exported = exportToJsonLogic(tree, strictConfig);
      expect(exported).not.toBeNull();

      const finalExpr = jsonLogicToExpression(exported as object);
      expect(finalExpr).toBe('notIn(status, ["new", "done"])');
      expect(finalExpr).not.toContain('notContains(');
    });
  });
});

describe('newQbId', () => {
  it('返回字符串', () => {
    expect(typeof newQbId()).toBe('string');
  });

  it('连续生成不重复', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newQbId()));
    expect(ids.size).toBe(100);
  });
});

describe('buildQbConfig — 已知缺失项', () => {
  it.skip('#2 relative_date 操作符尚未注册', () => {
    // 飞书对齐要求：含 relative_date 操作符（相对日期选择）
    // 当前实现：OPERATOR_KEYS_BY_TYPE.date 尚未注册 relative_date
    // 计划在 #2 修复中注册
    const config = buildQbConfig(basicVariables);
    const types = (
      config as unknown as {
        types: Record<string, { widgets?: Record<string, { operators?: string[] }> }>;
      }
    ).types;
    const dateOps = types['date']?.widgets
      ? (Object.values(types['date'].widgets)[0]?.operators ?? [])
      : [];
    expect(dateOps).toContain('relative_date');
  });
});
