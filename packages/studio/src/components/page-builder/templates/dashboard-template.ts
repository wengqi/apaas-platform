/**
 * 从 components/page-builder/templates.ts 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 仪表盘模板工厂。
 */

import type { ComponentNode, PageSchema } from '../../../api/pages.js';
import { makeNode } from './helpers.js';

/**
 * 生成仪表盘页面模板 — 预置可拖拽网格布局 + 统计数字 + 3 个图表。
 *
 * 搭建者在创建仪表盘页时自动获得一个可编辑的起始布局，
 * 使用 DashboardGrid（react-grid-layout）支持拖拽排版和 resize。
 */
export function generateDashboardTemplate(): PageSchema {
  const statNode = makeNode('statistic', '总数', {
    title: '总数',
    value: 0,
  });
  const chart1 = makeNode('chart', '数据分布', {
    chartType: 'bar',
    title: '数据分布',
    datasourceType: 'object',
    datasourceId: '',
    categoryField: '',
    valueField: '',
    aggregation: 'count',
  });
  const chart2 = makeNode('chart', '趋势图', {
    chartType: 'line',
    title: '趋势图',
    datasourceType: 'object',
    datasourceId: '',
    categoryField: '',
    valueField: '',
    aggregation: 'sum',
  });
  const chart3 = makeNode('chart', '占比分布', {
    chartType: 'pie',
    title: '占比分布',
    datasourceType: 'object',
    datasourceId: '',
    categoryField: '',
    valueField: '',
    aggregation: 'count',
  });

  const dashboardGrid = makeNode(
    'dashboard_grid',
    '仪表盘网格',
    {
      cols: 12,
      rowHeight: 30,
      layout: [
        { i: statNode.id, x: 0, y: 0, w: 4, h: 4 },
        { i: chart1.id, x: 4, y: 0, w: 8, h: 8 },
        { i: chart2.id, x: 0, y: 4, w: 6, h: 8 },
        { i: chart3.id, x: 6, y: 4, w: 6, h: 8 },
      ],
    },
    [statNode, chart1, chart2, chart3],
  );

  const root: ComponentNode = makeNode('page', '仪表盘', {}, [dashboardGrid]);

  return {
    version: '1',
    pageType: 'dashboard',
    viewModel: { variables: {} },
    root,
  };
}
