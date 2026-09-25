/**
 * 视图渲染器 — 看板（kanban）/ 画廊（gallery）/ 日历（calendar）。
 *
 * 对齐飞书 aPaaS 记录视图类型：此前 data_table 仅支持表格渲染，
 * 视图类型 5/6（kanban/calendar/gallery）无法渲染。
 * 由 renderDataTable 按 props.viewType 分派（table 保持原路径）。
 *
 * 数据来源与表格一致：props.data 表达式绑定（vm.record_list.records）。
 * 编辑模式（mode==='edit'）仅渲染占位骨架。
 */

import type { ReactNode } from 'react';
import { Calendar, Card, Col, Empty, Row, Tag, Typography } from 'antd';
import type { ComponentNode } from './types.js';
import type { RenderContext, TableRow } from './renderer-helpers.js';
import { getPropAsString } from './renderer-helpers.js';
import { resolvePropValue } from './expression-engine.js';

const { Text, Paragraph } = Typography;

/** 从表格数据绑定中提取行数组（与 renderDataTable 一致的数据解析）。 */
export function extractRows(node: ComponentNode, ctx: RenderContext): TableRow[] {
  if (ctx.mode !== 'preview') return [];
  const data = resolvePropValue(node.props.data ?? null, { vm: ctx.vm });
  if (Array.isArray(data)) return data as TableRow[];
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as Record<string, unknown>).records)
  ) {
    return (data as Record<string, unknown>).records as TableRow[];
  }
  return [];
}

/** 取行字段显示值（null/undefined 显示为空）。 */
function cellValue(row: TableRow, field: string): string {
  if (!field) return '';
  const value = row[field];
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

// ---------------------------------------------------------------------------
// 看板视图 — 按分组字段纵向分列
// ---------------------------------------------------------------------------

export function renderKanbanView(node: ComponentNode, ctx: RenderContext): ReactNode {
  const groupField = getPropAsString(node, 'groupByField', ctx);
  const titleField = getPropAsString(node, 'titleField', ctx);
  const descField = getPropAsString(node, 'descField', ctx);

  if (ctx.mode === 'edit') {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="看板(编辑模式不加载)" />;
  }

  const rows = extractRows(node, ctx);
  if (rows.length === 0)
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />;

  // 分组：未配置分组字段时全部进入"未分组"单列
  const columns = new Map<string, TableRow[]>();
  for (const row of rows) {
    const key = groupField ? cellValue(row, groupField) || '未分组' : '未分组';
    const bucket = columns.get(key);
    if (bucket) bucket.push(row);
    else columns.set(key, [row]);
  }

  return (
    <Row gutter={12} wrap={false} style={{ overflowX: 'auto', paddingBottom: 8 }}>
      {[...columns.entries()].map(([group, groupRows]) => (
        <Col key={group} flex="260px" style={{ flexShrink: 0 }}>
          <div style={{ background: '#f5f7fa', borderRadius: 8, padding: 8 }}>
            <Text strong style={{ fontSize: 13 }}>
              {group}
            </Text>
            <Tag style={{ marginLeft: 8 }}>{groupRows.length}</Tag>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {groupRows.map((row) => (
                <Card
                  key={String(row['id'])}
                  size="small"
                  style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}
                >
                  {titleField && (
                    <Text strong style={{ display: 'block', marginBottom: descField ? 4 : 0 }}>
                      {cellValue(row, titleField)}
                    </Text>
                  )}
                  {descField && (
                    <Paragraph
                      type="secondary"
                      style={{ fontSize: 12, margin: 0 }}
                      ellipsis={{ rows: 2 }}
                    >
                      {cellValue(row, descField)}
                    </Paragraph>
                  )}
                </Card>
              ))}
            </div>
          </div>
        </Col>
      ))}
    </Row>
  );
}

// ---------------------------------------------------------------------------
// 画廊视图 — 卡片网格（支持图片封面）
// ---------------------------------------------------------------------------

export function renderGalleryView(node: ComponentNode, ctx: RenderContext): ReactNode {
  const titleField = getPropAsString(node, 'titleField', ctx);
  const descField = getPropAsString(node, 'descField', ctx);
  const imageField = getPropAsString(node, 'imageField', ctx);

  if (ctx.mode === 'edit') {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="画廊(编辑模式不加载)" />;
  }

  const rows = extractRows(node, ctx);
  if (rows.length === 0)
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />;

  return (
    <Row gutter={[12, 12]}>
      {rows.map((row) => {
        const image = imageField ? cellValue(row, imageField) : '';
        return (
          <Col key={String(row['id'])} xs={12} sm={8} md={6} lg={6}>
            <Card
              size="small"
              hoverable
              cover={
                image ? (
                  <img
                    src={image}
                    alt=""
                    style={{ height: 120, objectFit: 'cover' }}
                    referrerPolicy="no-referrer"
                  />
                ) : undefined
              }
            >
              {titleField && (
                <Text strong style={{ display: 'block', marginBottom: descField ? 4 : 0 }}>
                  {cellValue(row, titleField)}
                </Text>
              )}
              {descField && (
                <Paragraph
                  type="secondary"
                  style={{ fontSize: 12, margin: 0 }}
                  ellipsis={{ rows: 2 }}
                >
                  {cellValue(row, descField)}
                </Paragraph>
              )}
            </Card>
          </Col>
        );
      })}
    </Row>
  );
}

// ---------------------------------------------------------------------------
// 日历视图 — 按日期字段排布事件
// ---------------------------------------------------------------------------

export function renderCalendarView(node: ComponentNode, ctx: RenderContext): ReactNode {
  const dateField = getPropAsString(node, 'dateField', ctx);
  const titleField = getPropAsString(node, 'titleField', ctx);

  if (ctx.mode === 'edit') {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="日历(编辑模式不加载)" />;
  }

  const rows = extractRows(node, ctx);

  /** 按日期（yyyy-MM-dd）索引事件列表。 */
  const eventsByDate = new Map<string, TableRow[]>();
  for (const row of rows) {
    const raw = dateField ? cellValue(row, dateField) : '';
    const day = raw.slice(0, 10);
    if (!day || Number.isNaN(new Date(day).getTime())) continue;
    const bucket = eventsByDate.get(day);
    if (bucket) bucket.push(row);
    else eventsByDate.set(day, [row]);
  }

  return (
    <Calendar
      cellRender={(date) => {
        const key = date.format('YYYY-MM-DD');
        const dayEvents = eventsByDate.get(key);
        if (!dayEvents || dayEvents.length === 0) return null;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {dayEvents.slice(0, 3).map((row) => (
              <Tag key={String(row['id'])} color="blue" style={{ fontSize: 11, margin: 0 }}>
                {titleField ? cellValue(row, titleField) : `#${String(row['id']).slice(-4)}`}
              </Tag>
            ))}
            {dayEvents.length > 3 && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                +{dayEvents.length - 3}
              </Text>
            )}
          </div>
        );
      }}
    />
  );
}
