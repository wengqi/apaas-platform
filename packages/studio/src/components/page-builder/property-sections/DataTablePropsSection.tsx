/**
 * 数据表格专属配置面板 — 视图类型 + 看板/画廊/日历字段映射。
 *
 * 数据表格支持 4 种视图渲染（对齐飞书记录视图类型）：
 * table（默认表格）/ kanban（看板，按分组字段分列）/ gallery（画廊卡片）/ calendar（日历）。
 * 字段映射项按所选视图类型动态显示。
 */

import { Input, Select } from 'antd';
import type { ComponentNode } from '../../../api/pages.js';
import { FormField, SectionDivider } from './shared.js';

const VIEW_TYPE_OPTIONS = [
  { value: 'table', label: '表格（默认）' },
  { value: 'kanban', label: '看板' },
  { value: 'gallery', label: '画廊' },
  { value: 'calendar', label: '日历' },
];

export function DataTablePropsSection({
  node,
  getStr,
  updateComponentProps,
}: {
  node: ComponentNode;
  getStr: (key: string) => string;
  updateComponentProps: (id: string, props: Record<string, unknown>) => void;
}) {
  const viewType = getStr('viewType') || 'table';

  return (
    <>
      <SectionDivider>视图类型</SectionDivider>
      <FormField label="渲染方式">
        <Select
          value={viewType}
          options={VIEW_TYPE_OPTIONS}
          size="small"
          style={{ width: '100%' }}
          onChange={(v) => updateComponentProps(node.id, { viewType: v })}
        />
      </FormField>

      {viewType === 'kanban' && (
        <>
          <FormField label="分组字段（列）">
            <Input
              value={getStr('groupByField')}
              onChange={(e) => updateComponentProps(node.id, { groupByField: e.target.value })}
              size="small"
              placeholder="记录字段 apiName，如 status"
            />
          </FormField>
          <FormField label="卡片标题字段">
            <Input
              value={getStr('titleField')}
              onChange={(e) => updateComponentProps(node.id, { titleField: e.target.value })}
              size="small"
              placeholder="如 asset_name"
            />
          </FormField>
          <FormField label="卡片描述字段">
            <Input
              value={getStr('descField')}
              onChange={(e) => updateComponentProps(node.id, { descField: e.target.value })}
              size="small"
              placeholder="可选"
            />
          </FormField>
        </>
      )}

      {viewType === 'gallery' && (
        <>
          <FormField label="标题字段">
            <Input
              value={getStr('titleField')}
              onChange={(e) => updateComponentProps(node.id, { titleField: e.target.value })}
              size="small"
              placeholder="如 asset_name"
            />
          </FormField>
          <FormField label="描述字段">
            <Input
              value={getStr('descField')}
              onChange={(e) => updateComponentProps(node.id, { descField: e.target.value })}
              size="small"
              placeholder="可选"
            />
          </FormField>
          <FormField label="封面图片字段">
            <Input
              value={getStr('imageField')}
              onChange={(e) => updateComponentProps(node.id, { imageField: e.target.value })}
              size="small"
              placeholder="图片 URL 字段 apiName，可选"
            />
          </FormField>
        </>
      )}

      {viewType === 'calendar' && (
        <>
          <FormField label="日期字段">
            <Input
              value={getStr('dateField')}
              onChange={(e) => updateComponentProps(node.id, { dateField: e.target.value })}
              size="small"
              placeholder="日期字段 apiName，如 purchase_date"
            />
          </FormField>
          <FormField label="事件标题字段">
            <Input
              value={getStr('titleField')}
              onChange={(e) => updateComponentProps(node.id, { titleField: e.target.value })}
              size="small"
              placeholder="如 asset_name"
            />
          </FormField>
        </>
      )}
    </>
  );
}
