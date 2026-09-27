/**
 * 数据展示扩展渲染器 — 页面模块对齐批次C5：
 * filter（筛选）/ sort（排序）/ audit_list（操作日志）/
 * tree_list_single（树形单选）/ tree_list_multi（树形多选）。
 *
 * 筛选/排序/树形均通过 ctx.setVariable 把选择写回视图模型变量，
 * 与绑定了同一变量的数据组件（表格/列表）联动。
 */

import type { ReactNode } from 'react';
import { Avatar, Card, Input, Radio, Select, Space, Table, Tag, Timeline, Tree } from 'antd';
import type { TableProps } from 'antd';
import { UserOutlined } from '@ant-design/icons';
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

// ---------------------------------------------------------------------------
// 批次C6：个人中心 / 系统通知 / 任务详情 / 我的任务 / 审批管理
// （数据经 vm 绑定传入：props.data 为数组的 JSON 串，与 audit_list 同模式）
// ---------------------------------------------------------------------------

/** 解析 props.data 中的数组（JSON 串；预览态支持 __bind 解析后为 JSON 串）。 */
function parseRows(node: ComponentNode, ctx: RenderContext): Record<string, unknown>[] {
  const raw = getPropAsString(node, 'data', ctx);
  let parsed: unknown;
  try {
    parsed = raw ? (JSON.parse(raw) as unknown) : [];
  } catch {
    return [];
  }
  return Array.isArray(parsed)
    ? parsed.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    : [];
}

const statusTag = (status: unknown): ReactNode => {
  const s = String(status ?? '');
  const color =
    s.includes('拒绝') || s.includes('驳回')
      ? 'error'
      : s.includes('完成') || s.includes('通过') || s.includes('已办')
        ? 'success'
        : s.includes('待')
          ? 'processing'
          : 'default';
  return <Tag color={color}>{s || '--'}</Tag>;
};

/** 个人中心 — 头像 + 名称 + 描述卡片（均可绑定）。 */
export function renderProfileCenter(node: ComponentNode, ctx: RenderContext): ReactNode {
  const name = getPropAsString(node, 'userName', ctx) || '未登录用户';
  const description = getPropAsString(node, 'description', ctx) || '';
  return (
    <Card size="small" style={{ margin: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar size={44} icon={<UserOutlined />} style={{ background: '#1456f0' }} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{name}</div>
          {description && (
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)' }}>{description}</div>
          )}
        </div>
      </div>
    </Card>
  );
}

/** 系统通知 — 绑定数组（title/time）渲染通知列表。 */
export function renderNotificationList(node: ComponentNode, ctx: RenderContext): ReactNode {
  const rows = parseRows(node, ctx);
  if (rows.length === 0) {
    return <div style={placeholderStyle}>系统通知（绑定数组：title/time）</div>;
  }
  return (
    <div style={{ padding: 8 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #f7f8fa' }}>
          <div style={{ fontSize: 13 }}>{String(r.title ?? '')}</div>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>{String(r.time ?? '')}</div>
        </div>
      ))}
    </div>
  );
}

/** 任务详情 — 标题/状态/办理人/描述 字段卡（均可绑定）。 */
export function renderTaskDetail(node: ComponentNode, ctx: RenderContext): ReactNode {
  return (
    <Card
      size="small"
      title={getPropAsString(node, 'title', ctx) || '任务详情'}
      style={{ margin: 4 }}
    >
      <Space size={16} wrap>
        <span>状态：{statusTag(getPropAsString(node, 'status', ctx) || '待处理')}</span>
        <span>办理人：{getPropAsString(node, 'assignee', ctx) || '--'}</span>
      </Space>
      <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(0,0,0,0.75)' }}>
        {getPropAsString(node, 'description', ctx) || '--'}
      </div>
    </Card>
  );
}

/** 我的任务 — 绑定数组（title/status/time）渲染待办任务表。 */
export function renderMyTasks(node: ComponentNode, ctx: RenderContext): ReactNode {
  const rows = parseRows(node, ctx);
  const columns: TableProps<Record<string, unknown>>['columns'] =
    rows.length > 0
      ? Object.keys(rows[0] ?? {}).map((k) => ({
          title: k,
          dataIndex: k,
          key: k,
          render: (v: unknown) => (k === 'status' ? statusTag(v) : String(v ?? '')),
        }))
      : [];
  return (
    <Table<Record<string, unknown>>
      size="small"
      columns={columns}
      dataSource={rows.map((r, i) => ({ ...r, __key: i }))}
      rowKey="__key"
      pagination={false}
      locale={{ emptyText: '我的任务（绑定数组：title/status/time）' }}
      style={{ margin: 4 }}
    />
  );
}

/** 审批管理 — 绑定数组（name/applicant/status/time）渲染审批表。 */
export function renderApprovalAdmin(node: ComponentNode, ctx: RenderContext): ReactNode {
  return renderMyTasks(node, ctx);
}
