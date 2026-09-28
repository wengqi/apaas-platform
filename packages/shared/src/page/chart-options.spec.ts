/**
 * 图表扩展类型单测（批次C4）— buildChartOptionFromAggregated 新增图表分支。
 */

import { describe, expect, it } from 'vitest';
import { buildChartOptionFromAggregated } from './chart-options.js';
import type { ChartType } from './index.js';

const POINTS = [
  { category: '甲', value: 10 },
  { category: '乙', value: 20 },
  { category: '丙', value: 30 },
];

const EXT_TYPES: ChartType[] = [
  'area',
  'scatter',
  'bar_horizontal',
  'radar',
  'waterfall',
  'wordcloud',
  'combo',
];

describe('buildChartOptionFromAggregated — 批次C4 扩展图表', () => {
  it.each(EXT_TYPES)('%s 生成含 series 的 option', (chartType) => {
    const option = buildChartOptionFromAggregated(chartType, '标题', POINTS);
    const series = option.series as unknown[];
    expect(Array.isArray(series)).toBe(true);
    expect(series.length).toBeGreaterThan(0);
    expect(option.title).toBeTruthy();
  });

  it('面积图 = line + areaStyle', () => {
    const option = buildChartOptionFromAggregated('area', '', POINTS);
    const series = option.series as Array<{ type: string; areaStyle?: unknown }>;
    expect(series[0]?.type).toBe('line');
    expect(series[0]?.areaStyle).toBeDefined();
  });

  it('条形图为横向（value 轴在 x）', () => {
    const option = buildChartOptionFromAggregated('bar_horizontal', '', POINTS);
    expect((option.xAxis as { type: string }).type).toBe('value');
    expect((option.yAxis as { type: string }).type).toBe('category');
  });

  it('瀑布图生成透明基座 + 值 两层堆叠', () => {
    const option = buildChartOptionFromAggregated('waterfall', '', POINTS);
    const series = option.series as Array<{ stack?: string; itemStyle?: { color?: string } }>;
    expect(series).toHaveLength(2);
    expect(series[0]?.stack).toBe('wf');
    expect(series[0]?.itemStyle?.color).toBe('transparent');
  });

  it('组合图含 bar + line 两个系列', () => {
    const option = buildChartOptionFromAggregated('combo', '', POINTS);
    const series = option.series as Array<{ type: string }>;
    expect(series.map((s) => s.type)).toEqual(['bar', 'line']);
  });

  it('雷达图生成 indicator（数量=数据点数）', () => {
    const option = buildChartOptionFromAggregated('radar', '', POINTS);
    const radar = option.radar as { indicator: { name: string }[] };
    expect(radar.indicator).toHaveLength(3);
  });
});
