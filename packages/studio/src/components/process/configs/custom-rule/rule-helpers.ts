/**
 * 自定义规则渲染组件 — 辅助函数（从 CustomRule.tsx 拆分，
 * AGENTS.md 单文件 400 行规范）。
 */

import type { ItemBuilderProps } from '@react-awesome-query-builder/antd';
import type { Config, Field } from '@react-awesome-query-builder/antd';
import { getOperatorsForType, type OperatorDef } from './operators.js';

// ---------------------------------------------------------------------------
// 值类型定义
// ---------------------------------------------------------------------------

export const VALUE_SRC_OPTIONS = [
  { label: '引用', value: 'field' },
  { label: '公式', value: 'expr' },
  { label: '指定值', value: 'value' },
];

// ---------------------------------------------------------------------------
// 辅助：从 config.fields 获取字段选项列表
// ---------------------------------------------------------------------------

export function getFieldOptions(config: Config): { label: string; value: string; type: string }[] {
  const fields = config.fields as Record<string, Field>;
  return Object.entries(fields)
    .filter(([key]) => !key.startsWith('__'))
    .map(([key, field]) => ({
      label: field.label ?? key,
      value: key,
      type: (field as { type?: string }).type ?? 'text',
    }));
}

// ---------------------------------------------------------------------------
// 辅助：获取字段可用的操作符列表
// ---------------------------------------------------------------------------

export function getOperatorOptions(config: Config, fieldName: string | undefined): OperatorDef[] {
  if (!fieldName) return [];
  const fieldConfig = (config.fields as Record<string, Field>)[fieldName];
  if (!fieldConfig) return [];
  const fieldType = (fieldConfig as { type?: string }).type ?? 'text';
  return getOperatorsForType(fieldType);
}

// ---------------------------------------------------------------------------
// 辅助：获取当前选中的字段名
// ---------------------------------------------------------------------------

export function getSelectedField(props: ItemBuilderProps): string | undefined {
  const field = props.properties?.get('field');
  if (!field) return undefined;
  if (Array.isArray(field)) return field[field.length - 1] as string;
  return typeof field === 'string' ? field : undefined;
}

export function getSelectedOperator(props: ItemBuilderProps): string | undefined {
  const op = props.properties?.get('operator');
  return typeof op === 'string' ? op : undefined;
}

export function getSelectedValue(props: ItemBuilderProps): string {
  const value = props.properties?.get('value');
  if (!value) return '';
  const first = value.get?.(0);
  if (first === undefined || first === null) return '';
  return String(first);
}

export function getSelectedValueSrc(props: ItemBuilderProps): string {
  const valueSrc = props.properties?.get('valueSrc');
  if (!valueSrc) return 'value';
  const first = valueSrc.get?.(0);
  return typeof first === 'string' ? first : 'value';
}
