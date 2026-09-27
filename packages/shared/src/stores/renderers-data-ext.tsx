/**
 * 数据展示扩展渲染器 — 页面模块对齐批次C5：
 * filter（筛选）/ sort（排序）/ audit_list（操作日志）/
 * tree_list_single（树形单选）/ tree_list_multi（树形多选）。
 *
 * 筛选/排序/树形均通过 ctx.setVariable 把选择写回视图模型变量，
 * 与绑定了同一变量的数据组件（表格/列表）联动。
 */

import type { ReactNode } from 'react';
import { Input, Radio, Select, Space, Timeline, Tree } from 'antd';
import dayjs from 'dayjs';
import type { ComponentNode } from './types.js';
import type { RenderContext } from './renderer-helpers.js';
import { extractSelectOptions, getPropAsString } from './renderer-helpers.js';

const placeholderStyle: React.CSSProperties = {
  padding: 8,
  color: 'rgba(0,0,0,0.35)',
  fontSize: 13,
  background: '#fafbfc',
  border: '1px dashed #eef0f4',
  borderRadius: 6,
};

export function renderFilter(node: ComponentNode, ctx: RenderContext): ReactNode {
  const target = getPropAsString(node, 'targetVariable', ctx) || 'keyword';
  const placeholder = getPropAsString(node, 'placeholder', ctx) || '搜索…';
  if (ctx.mode === 'edit') {
    return <div style={placeholderStyle}>筛选（写入变量 vm.{target}）</div>;
  }
  return (
    <Input.Search
      placeholder={placeholder}
      allowClear
      size="small"
      enterButton
      onSearch={(value) => ctx.runtime.setVariable(target, value)}
      style={{ padding: 4 }}
    />
  );
}

export function renderSort(node: ComponentNode, ctx: RenderContext): ReactNode {
  const target = getPropAsString(node, 'targetVariable', ctx) || 'sort';
  const options = extractSelectOptions(node);
  if (ctx.mode === 'edit') {
    return <div style={placeholderStyle}>排序（写入变量 vm.{target}）</div>;
  }
  return (
    <Space size={8} style={{ padding: 4 }} wrap>
      <Select
        size="small"
        style={{ minWidth: 120 }}
        placeholder="排序字段"
        options={options.map((o) => ({ label: o.label, value: o.value }))}
        onChange={(field) => ctx.runtime.setVariable(`${target}Field`, field)}
      />
      <Radio.Group
        size="small"
        defaultValue="asc"
        onChange={(e) => ctx.runtime.setVariable(`${target}Order`, e.target.value)}
        options={[
          { label: '升序', value: 'asc' },
          { label: '降序', value: 'desc' },
        ]}
        optionType="button"
      />
    </Space>
  );
}

export function renderAuditList(node: ComponentNode, ctx: RenderContext): ReactNode {
  const raw = getPropAsString(node, 'data', ctx);
  let rows: { time?: string; user?: string; action?: string }[] = [];
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) {
      rows = parsed.filter(
        (r): r is { time?: string; user?: string; action?: string } => !!r && typeof r === 'object',
      );
    }
  } catch {
    rows = [];
  }
  if (rows.length === 0) {
    return <div style={placeholderStyle}>操作日志（绑定数组：time/user/action）</div>;
  }
  return (
    <div style={{ padding: 8 }}>
      <Timeline
        items={rows.map((r) => ({
          children: (
            <span style={{ fontSize: 13 }}>
              {r.time ? `${dayjs(r.time).format('MM-DD HH:mm')} · ` : ''}
              {r.user ? `${r.user} ` : ''}
              {r.action ?? ''}
            </span>
          ),
        }))}
      />
    </div>
  );
}

/** options（label/value）→ antd Tree treeData。 */
function toTreeData(options: { label: string; value: string }[]): { title: string; key: string }[] {
  return options.map((o) => ({ title: o.label, key: o.value }));
}

export function renderTreeListSingle(node: ComponentNode, ctx: RenderContext): ReactNode {
  const target = getPropAsString(node, 'targetVariable', ctx) || 'treeSelected';
  const treeData = toTreeData(extractSelectOptions(node));
  if (ctx.mode === 'edit') {
    return <div style={placeholderStyle}>树形单选（选中写入变量 vm.{target}）</div>;
  }
  return (
    <Tree
      treeData={treeData}
      height={240}
      onSelect={(keys) => ctx.runtime.setVariable(target, keys[0] ?? null)}
      style={{ padding: 4 }}
    />
  );
}

export function renderTreeListMulti(node: ComponentNode, ctx: RenderContext): ReactNode {
  const target = getPropAsString(node, 'targetVariable', ctx) || 'treeChecked';
  const treeData = toTreeData(extractSelectOptions(node));
  if (ctx.mode === 'edit') {
    return <div style={placeholderStyle}>树形多选（勾选写入变量 vm.{target}）</div>;
  }
  return (
    <Tree
      treeData={treeData}
      checkable
      height={240}
      onCheck={(keys) => ctx.runtime.setVariable(target, keys)}
      style={{ padding: 4 }}
    />
  );
}
