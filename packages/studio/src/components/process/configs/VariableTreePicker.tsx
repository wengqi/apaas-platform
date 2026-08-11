/**
 * 树形变量选择器 — 飞书 aPaaS 风格。
 *
 * 分组展示可用变量：
 * - 系统默认：流程名、操作发起人、流程执行 ID
 * - 传入流程的数据：触发器/开始节点的输出变量
 * - 触发后的数据：上游节点的输出变量
 * - 流程变量：assign/object_operation 节点的变量
 *
 * 支持搜索过滤。
 */

import { useMemo, useState } from 'react';
import { Input, Tree, Typography, Empty } from 'antd';
import type { TreeDataNode } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { VariableOption, VariableGroup } from './variable-resolver.js';

const { Text } = Typography;

/** 分组显示配置 */
const GROUP_LABELS: Record<VariableGroup, string> = {
  system: '系统默认',
  trigger: '传入流程的数据',
  node_output: '触发后的数据',
  process_var: '流程变量',
};

/** 分组排序 */
const GROUP_ORDER: VariableGroup[] = ['system', 'trigger', 'node_output', 'process_var'];

export interface VariableTreePickerProps {
  /** 可用变量列表 */
  variables: VariableOption[];
  /** 选中变量回调 */
  onSelect: (variable: VariableOption) => void;
  /** 占位提示 */
  placeholder?: string;
}

export default function VariableTreePicker({
  variables,
  onSelect,
  placeholder = '搜索变量名称',
}: VariableTreePickerProps) {
  const [search, setSearch] = useState('');

  /** 按分组组织变量为树形数据 */
  const treeData = useMemo(() => {
    // 过滤搜索
    const filtered = search.trim()
      ? variables.filter(
          (v) =>
            v.label.toLowerCase().includes(search.toLowerCase()) ||
            v.value.toLowerCase().includes(search.toLowerCase()),
        )
      : variables;

    // 按分组组织
    const grouped = new Map<VariableGroup, VariableOption[]>();
    for (const v of filtered) {
      const group = v.group ?? 'node_output';
      const list = grouped.get(group) ?? [];
      list.push(v);
      grouped.set(group, list);
    }

    // 构建 TreeDataNode
    const nodes: TreeDataNode[] = [];
    for (const group of GROUP_ORDER) {
      const vars = grouped.get(group);
      if (!vars || vars.length === 0) continue;

      nodes.push({
        key: `group-${group}`,
        title: GROUP_LABELS[group],
        selectable: false,
        children: vars.map((v) => ({
          key: v.value,
          title: (
            <span>
              <Text style={{ fontSize: 12 }}>{v.label}</Text>
              {v.sourceNode && (
                <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                  — {v.sourceNode}
                </Text>
              )}
            </span>
          ),
          isLeaf: true,
        })),
      });
    }

    return nodes;
  }, [variables, search]);

  const handleSelect = (keys: React.Key[]): void => {
    if (keys.length === 0) return;
    const key = keys[0] as string;
    // 查找对应变量
    const variable = variables.find((v) => v.value === key);
    if (variable) onSelect(variable);
  };

  return (
    <div style={{ width: '100%' }}>
      <Input
        size="small"
        placeholder={placeholder}
        prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.25)' }} />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        allowClear
        style={{ marginBottom: 8 }}
      />
      {treeData.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="无可用变量"
          style={{ margin: '8px 0' }}
        />
      ) : (
        <Tree
          treeData={treeData}
          onSelect={handleSelect}
          defaultExpandAll
          style={{ fontSize: 12, maxHeight: 300, overflow: 'auto' }}
        />
      )}
    </div>
  );
}
