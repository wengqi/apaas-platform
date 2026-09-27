/**
 * 自定义规则渲染组件 — 操作符定义（从 CustomRule.tsx 拆分，
 * AGENTS.md 单文件 400 行规范）。
 *
 * 操作符定义 — 按字段类型分组（飞书风格）
 */

export interface OperatorDef {
  /** RAQB 操作符 key */
  key: string;
  /** 显示标签 */
  label: string;
  /** 是否为单目操作符（无右值，如 为空/不为空） */
  unary?: boolean;
  /** 是否为多值操作符（如 属于/不属于） */
  multiValue?: boolean;
}

/** 按字段类型映射可用操作符（使用 RAQB 内置操作符 key） */
export const OPERATORS_BY_TYPE: Record<string, OperatorDef[]> = {
  text: [
    { key: 'equal', label: '等于' },
    { key: 'not_equal', label: '不等于' },
    { key: 'like', label: '包含' },
    { key: 'not_like', label: '不包含' },
    { key: 'is_empty', label: '为空', unary: true },
    { key: 'is_not_empty', label: '不为空', unary: true },
  ],
  number: [
    { key: 'equal', label: '等于' },
    { key: 'not_equal', label: '不等于' },
    { key: 'less', label: '小于' },
    { key: 'less_or_equal', label: '小于等于' },
    { key: 'greater', label: '大于' },
    { key: 'greater_or_equal', label: '大于等于' },
    { key: 'is_empty', label: '为空', unary: true },
    { key: 'is_not_empty', label: '不为空', unary: true },
  ],
  boolean: [
    { key: 'equal', label: '等于' },
    { key: 'not_equal', label: '不等于' },
  ],
  date: [
    { key: 'equal', label: '等于' },
    { key: 'not_equal', label: '不等于' },
    { key: 'less', label: '早于' },
    { key: 'less_or_equal', label: '早于等于' },
    { key: 'greater', label: '晚于' },
    { key: 'greater_or_equal', label: '晚于等于' },
    { key: 'is_empty', label: '为空', unary: true },
    { key: 'is_not_empty', label: '不为空', unary: true },
  ],
};

/** 获取字段类型对应的操作符列表 */
export function getOperatorsForType(fieldType: string): OperatorDef[] {
  return OPERATORS_BY_TYPE[fieldType] ?? OPERATORS_BY_TYPE['text']!;
}
