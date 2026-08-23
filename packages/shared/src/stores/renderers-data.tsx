/**
 * 数据类渲染器 — data_table / detail_card / list。
 *
 * 从 component-renderer.tsx 拆分，实现逻辑不变。
 * 类型与辅助函数从 renderer-helpers.tsx 导入，避免循环依赖。
 */

import type { ReactNode } from 'react';
import { Descriptions, List, Table } from 'antd';
import type { ComponentNode } from './types.js';
import { resolvePropValue } from './expression-engine.js';
import type { RenderContext, TableRow } from './renderer-helpers.js';
import {
  getPropAsBool,
  getPropAsNumber,
  extractTableColumns,
  extractDetailFields,
} from './renderer-helpers.js';

// ---------------------------------------------------------------------------
// 数据类渲染器
// ---------------------------------------------------------------------------

export function renderDataTable(node: ComponentNode, ctx: RenderContext): ReactNode {
  const columns = extractTableColumns(node);
  const pagination = getPropAsBool(node, 'pagination', ctx);
  const pageSize = getPropAsNumber(node, 'pageSize', ctx) || 20;

  let dataSource: TableRow[] = [];
  if (ctx.mode === 'preview') {
    const data = resolvePropValue(node.props.data ?? null, { vm: ctx.vm });
    if (Array.isArray(data)) {
      dataSource = data as TableRow[];
    } else if (
      data &&
      typeof data === 'object' &&
      Array.isArray((data as Record<string, unknown>).records)
    ) {
      dataSource = (data as Record<string, unknown>).records as TableRow[];
    }
  }

  return (
    <Table<TableRow>
      size="small"
      columns={columns}
      dataSource={dataSource}
      rowKey="id"
      pagination={pagination ? { pageSize, showSizeChanger: false } : false}
      locale={{ emptyText: ctx.mode === 'edit' ? '暂无数据(编辑模式不加载)' : '暂无数据' }}
      onRow={(record) => ({
        onClick: () => {
          if (ctx.mode === 'preview') ctx.onAction(node.id, 'onRowClick');
          return record;
        },
      })}
    />
  );
}

export function renderDetailCard(node: ComponentNode, ctx: RenderContext): ReactNode {
  const record =
    ctx.mode === 'preview'
      ? (resolvePropValue(node.props.record ?? null, { vm: ctx.vm }) as
          Record<string, unknown> | undefined)
      : undefined;
  const items = extractDetailFields(node, record ?? {}, ctx);
  const columns = getPropAsNumber(node, 'columns', ctx) || 2;
  return <Descriptions size="small" column={columns} bordered items={items} />;
}

export function renderList(node: ComponentNode, ctx: RenderContext): ReactNode {
  let data: unknown[] = [];
  if (ctx.mode === 'edit') {
    data = [1, 2, 3];
  } else {
    const v = resolvePropValue(node.props.data ?? null, { vm: ctx.vm });
    if (Array.isArray(v)) data = v;
    else if (v && typeof v === 'object' && Array.isArray((v as Record<string, unknown>).records))
      data = (v as Record<string, unknown>).records as unknown[];
  }
  return (
    <List
      size="small"
      dataSource={data as TableRow[]}
      renderItem={(item) => {
        if (ctx.mode === 'preview' && item && typeof item === 'object') {
          const r = item as Record<string, unknown>;
          return <List.Item>{String(r.name ?? r.id ?? JSON.stringify(r))}</List.Item>;
        }
        return <List.Item>列表项 {String(item)}</List.Item>;
      }}
      locale={{ emptyText: '暂无数据' }}
    />
  );
}
