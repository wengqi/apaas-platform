/**
 * 视图模型变量类型元数据与初始值解析 —— 从 components/page-builder/ViewModelPanel.tsx
 * 拆分（AGENTS.md 单文件 400 行规范）。
 */

import type { PropValue, VariableType } from '../../../api/pages.js';

// ---------------------------------------------------------------------------
// 变量类型元数据
// ---------------------------------------------------------------------------

export const VARIABLE_TYPE_META: Record<VariableType, { label: string; color: string }> = {
  record: { label: '单条记录', color: 'blue' },
  record_list: { label: '记录列表', color: 'geekblue' },
  scalar: { label: '标量', color: 'purple' },
  object: { label: '对象', color: 'cyan' },
  array: { label: '数组', color: 'orange' },
};

export const VARIABLE_TYPE_OPTIONS: { label: string; value: VariableType }[] = [
  { label: '标量 (string/number/boolean)', value: 'scalar' },
  { label: '单条记录 (record)', value: 'record' },
  { label: '记录列表 (record_list)', value: 'record_list' },
  { label: '对象 (object)', value: 'object' },
  { label: '数组 (array)', value: 'array' },
];

/** 变量是否支持数据源配置。 */
export function hasDatasource(type: VariableType): boolean {
  return type === 'record' || type === 'record_list';
}

// ---------------------------------------------------------------------------
// 初始值解析 / 格式化
// ---------------------------------------------------------------------------

/** 将文本解析为初始值(按变量类型)。 */
export function parseInitialValue(text: string, type: VariableType): PropValue {
  if (type === 'scalar') {
    const trimmed = text.trim();
    if (trimmed === '') return null;
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    const num = Number(trimmed);
    if (!Number.isNaN(num)) return num;
    return trimmed;
  }
  // object / array: 尝试 JSON 解析
  try {
    return JSON.parse(text) as PropValue;
  } catch {
    return text;
  }
}

/** 将初始值格式化为文本。 */
export function formatInitialValue(value: PropValue | undefined, type: VariableType): string {
  if (value === undefined || value === null) return '';
  if (type === 'object' || type === 'array') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
