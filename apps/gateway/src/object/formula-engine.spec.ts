import { describe, it, expect } from 'vitest';
import { FormulaEngine } from './formula-engine.js';
import { FieldType, type Field } from '@apaas/shared';

describe('FormulaEngine', () => {
  const engine = new FormulaEngine();

  describe('compute — 算术运算', () => {
    it('加法', () => {
      expect(engine.compute('{{price + tax}}', { price: 100, tax: 8 })).toBe(108);
    });

    it('乘法', () => {
      expect(engine.compute('{{price * quantity}}', { price: 50, quantity: 3 })).toBe(150);
    });

    it('除法', () => {
      expect(engine.compute('{{total / count}}', { total: 100, count: 4 })).toBe(25);
    });

    it('混合运算优先级', () => {
      expect(engine.compute('{{a + b * c}}', { a: 1, b: 2, c: 3 })).toBe(7);
    });
  });

  describe('compute — 比较与逻辑运算', () => {
    it('大于比较', () => {
      expect(engine.compute('{{amount > 1000}}', { amount: 5000 })).toBe(true);
    });

    it('等于比较', () => {
      expect(engine.compute('{{status == "active"}}', { status: 'active' })).toBe(true);
    });

    it('逻辑与 (&&)', () => {
      expect(engine.compute('{{a > 1 && b < 2}}', { a: 5, b: 1 })).toBe(true);
    });

    it('逻辑或 (||)', () => {
      expect(engine.compute('{{a > 10 || b < 2}}', { a: 1, b: 1 })).toBe(true);
    });
  });

  describe('compute — 字符串拼接', () => {
    it('两个字面量拼接', () => {
      expect(engine.compute('{{"Hello" + " " + "World"}}', {})).toBe('Hello World');
    });

    it('变量与字面量拼接', () => {
      expect(
        engine.compute('{{firstName + " " + lastName}}', {
          firstName: 'John',
          lastName: 'Doe',
        }),
      ).toBe('John Doe');
    });
  });

  describe('compute — 平台函数', () => {
    it('ROUND 四舍五入', () => {
      expect(engine.compute('{{ROUND(amount, 2)}}', { amount: 3.14159 })).toBe(3.14);
    });

    it('ROUND 默认 0 位', () => {
      expect(engine.compute('{{ROUND(amount)}}', { amount: 3.7 })).toBe(4);
    });

    it('IF 条件为真', () => {
      expect(engine.compute('{{IF(score >= 60, "及格", "不及格")}}', { score: 85 })).toBe('及格');
    });

    it('IF 条件为假', () => {
      expect(engine.compute('{{IF(score >= 60, "及格", "不及格")}}', { score: 50 })).toBe('不及格');
    });

    it('CONCAT 拼接多个值', () => {
      expect(engine.compute('{{CONCAT(a, b, c)}}', { a: 'foo', b: 'bar', c: 'baz' })).toBe(
        'foobarbaz',
      );
    });

    it('UPPER 转大写', () => {
      expect(engine.compute('{{UPPER(name)}}', { name: 'hello' })).toBe('HELLO');
    });

    it('LOWER 转小写', () => {
      expect(engine.compute('{{LOWER(name)}}', { name: 'WORLD' })).toBe('world');
    });
  });

  describe('compute — 边界情况', () => {
    it('空公式返回 null', () => {
      expect(engine.compute('', { a: 1 })).toBeNull();
      expect(engine.compute('{{}}', { a: 1 })).toBeNull();
    });

    it('无效语法返回 null', () => {
      expect(engine.compute('{{a +}}', { a: 1 })).toBeNull();
    });

    it('未定义变量返回 null', () => {
      expect(engine.compute('{{undefinedVar + 1}}', {})).toBeNull();
    });

    it('裸表达式（无 {{}} 包裹）也能工作', () => {
      expect(engine.compute('price * quantity', { price: 10, quantity: 5 })).toBe(50);
    });
  });

  describe('computeRecordFields — 链式公式', () => {
    it('计算单个 Formula 字段', () => {
      const fields: Field[] = [
        {
          id: 'f1',
          apiName: 'total',
          name: '总价',
          type: FieldType.Formula,
          config: { formula: { expression: '{{price * quantity}}', returnType: 'number' } },
        } as unknown as Field,
      ];
      const result = engine.computeRecordFields(fields, { price: 100, quantity: 3 });
      expect(result.total).toBe(300);
    });

    it('链式公式：后公式引用前公式结果', () => {
      const fields: Field[] = [
        {
          id: 'f1',
          apiName: 'subtotal',
          name: '小计',
          type: FieldType.Formula,
          config: { formula: { expression: '{{price * quantity}}', returnType: 'number' } },
        } as unknown as Field,
        {
          id: 'f2',
          apiName: 'grandTotal',
          name: '总计',
          type: FieldType.Formula,
          config: { formula: { expression: '{{subtotal + tax}}', returnType: 'number' } },
        } as unknown as Field,
      ];
      const result = engine.computeRecordFields(fields, { price: 50, quantity: 2, tax: 10 });
      expect(result.subtotal).toBe(100);
      expect(result.grandTotal).toBe(110);
    });

    it('跳过非 Formula 类型字段', () => {
      const fields: Field[] = [
        {
          id: 'f1',
          apiName: 'name',
          name: '名称',
          type: FieldType.Text,
          config: {},
        } as unknown as Field,
        {
          id: 'f2',
          apiName: 'total',
          name: '总价',
          type: FieldType.Formula,
          config: { formula: { expression: '{{price * 2}}', returnType: 'number' } },
        } as unknown as Field,
      ];
      const result = engine.computeRecordFields(fields, { price: 100 });
      expect(result).not.toHaveProperty('name');
      expect(result.total).toBe(200);
    });

    it('无表达式的 Formula 字段被跳过', () => {
      const fields: Field[] = [
        {
          id: 'f1',
          apiName: 'empty',
          name: '空公式',
          type: FieldType.Formula,
          config: { formula: {} },
        } as unknown as Field,
      ];
      const result = engine.computeRecordFields(fields, { a: 1 });
      expect(result).not.toHaveProperty('empty');
    });
  });
});
