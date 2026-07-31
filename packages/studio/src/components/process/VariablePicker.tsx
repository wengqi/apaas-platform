/**
 * 变量路径选择 (TreeSelect) —— 对齐 DESIGN-process.md §6.9。
 *
 * 候选 = 流程变量 + 触发记录字段 + 上游节点输出。
 * 产出 IFlowValue.ref 的 content: string[](变量路径数组)。
 */

import { useMemo } from 'react';
import { TreeSelect } from 'antd';

export interface VariableOption {
  value: string;
  label: string;
  children?: VariableOption[];
}

export interface VariablePickerProps {
  /** 当前选中的路径数组 */
  value?: string[];
  /** 变化回调 */
  onChange?: (path: string[]) => void;
  /** 变量候选树 */
  options?: VariableOption[];
  /** 占位提示 */
  placeholder?: string;
  /** 禁用 */
  disabled?: boolean;
}

/** 默认变量候选(流程通用变量)。 */
export const DEFAULT_VARIABLE_OPTIONS: VariableOption[] = [
  {
    value: 'trigger',
    label: '触发器',
    children: [
      { value: 'record', label: '触发记录', children: [
        { value: 'id', label: '记录 ID' },
        { value: 'name', label: '记录名称' },
        { value: 'createdAt', label: '创建时间' },
      ] },
      { value: 'user', label: '触发用户', children: [
        { value: 'id', label: '用户 ID' },
        { value: 'name', label: '用户姓名' },
      ] },
    ],
  },
  {
    value: 'start',
    label: '流程输入',
    children: [
      { value: 'recordId', label: '记录 ID' },
    ],
  },
  {
    value: 'global',
    label: '全局变量',
    children: [
      { value: 'approver', label: '审批人', children: [
        { value: 'name', label: '姓名' },
      ] },
      { value: 'approvedAt', label: '审批时间' },
      { value: 'result', label: '审批结果' },
    ],
  },
];

/**
 * 将 string[] 路径转为 TreeSelect 的 value 字符串(用 . 连接)。
 */
function pathToString(path: string[]): string {
  return path.join('.');
}

/**
 * 将 TreeSelect value 字符串转回 string[] 路径。
 */
function stringToPath(str: string): string[] {
  return str.split('.');
}

export function VariablePicker({
  value = [],
  onChange,
  options = DEFAULT_VARIABLE_OPTIONS,
  placeholder = '选择变量',
  disabled = false,
}: VariablePickerProps) {
  /** 展平 options 为 TreeSelect treeData 格式。 */
  const treeData = useMemo(() => toTreeData(options), [options]);

  const currentValue = value.length ? pathToString(value) : undefined;

  return (
    <TreeSelect
      treeData={treeData}
      value={currentValue}
      onChange={(val: string) => onChange?.(stringToPath(val))}
      placeholder={placeholder}
      disabled={disabled}
      showSearch
      treeDefaultExpandAll
      style={{ width: '100%' }}
      size="small"
      allowClear
    />
  );
}

function toTreeData(
  options: VariableOption[],
): { value: string; title: string; children?: unknown[] }[] {
  return options.map((opt) => {
    const node: { value: string; title: string; children?: unknown[] } = {
      value: opt.value,
      title: opt.label,
    };
    if (opt.children && opt.children.length) {
      node.children = toTreeData(opt.children);
    }
    return node;
  });
}

export default VariablePicker;
