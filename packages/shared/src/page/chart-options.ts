/**
 * 图表 ECharts option 构建工具 — Studio 预览和 Runtime 共用。
 *
 * 从绑定数据（记录数组）和图表配置构建 ECharts option 对象。
 */

import type { ChartType, ChartAggregation } from './index.js';

/** 图表数据记录（任意键值对）。 */
type ChartRecord = Record<string, unknown>;

/** ECharts option 类型（松散定义，避免直接依赖 echarts 类型包）。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EChartsOption = Record<string, any>;

/** Mock 数据（编辑模式预览用）。 */
const MOCK_DATA: ChartRecord[] = [
  { category: 'A', value: 120 },
  { category: 'B', value: 200 },
  { category: 'C', value: 150 },
  { category: 'D', value: 80 },
  { category: 'E', value: 70 },
];

/**
 * 聚合数据：按 categoryField 分组，对 valueField 执行聚合运算。
 */
function aggregate(
  records: ChartRecord[],
  categoryField: string,
  valueField: string,
  aggregation: ChartAggregation,
): { category: string; value: number }[] {
  const groups = new Map<string, number[]>();
  for (const r of records) {
    const cat = String(r[categoryField] ?? '未知');
    const val = Number(r[valueField] ?? 0);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(val);
  }

  return Array.from(groups.entries()).map(([category, values]) => {
    let value: number;
    switch (aggregation) {
      case 'count':
        value = values.length;
        break;
      case 'avg':
        value = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'max':
        value = Math.max(...values);
        break;
      case 'min':
        value = Math.min(...values);
        break;
      case 'sum':
      default:
        value = values.reduce((a, b) => a + b, 0);
        break;
    }
    return { category, value: Math.round(value * 100) / 100 };
  });
}

/**
 * 从绑定数据中提取记录数组。
 * 兼容 raw array 和 { records: [...] } 两种格式。
 */
function extractRecords(data: unknown): ChartRecord[] {
  if (Array.isArray(data)) return data as ChartRecord[];
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as Record<string, unknown>).records)
  ) {
    return (data as Record<string, unknown>).records as ChartRecord[];
  }
  return [];
}

/**
 * 构建 ECharts option。
 *
 * @param chartType 图表类型
 * @param title 标题
 * @param categoryField 分类字段名
 * @param valueField 值字段名
 * @param aggregation 聚合方式
 * @param data 绑定数据（记录数组或 { records: [...] }）。为 null 时使用 mock 数据。
 */
export function buildChartOption(
  chartType: ChartType,
  title: string,
  categoryField: string | undefined,
  valueField: string | undefined,
  aggregation: ChartAggregation | undefined,
  data: unknown,
): EChartsOption {
  const records = data ? extractRecords(data) : MOCK_DATA;
  const catField = categoryField ?? 'category';
  const valField = valueField ?? 'value';
  const agg = aggregation ?? 'sum';

  const aggregated = aggregate(records, catField, valField, agg);
  return buildChartOptionFromAggregated(chartType, title, aggregated);
}

/**
 * 从已聚合的数据点构建 ECharts option。
 *
 * 用于后端聚合结果（ChartDataResult.data）直接构建图表，
 * 跳过客户端 aggregate 步骤。
 *
 * @param chartType 图表类型
 * @param title 标题
 * @param aggregated 已聚合的数据点数组
 */
export function buildChartOptionFromAggregated(
  chartType: ChartType,
  title: string,
  aggregated: Array<{ category: string; value: number }>,
): EChartsOption {
  const categories = aggregated.map((d) => d.category);
  const values = aggregated.map((d) => d.value);

  const baseTitle = title
    ? { text: title, left: 'center', textStyle: { fontSize: 14 } }
    : undefined;
  const tooltip = { trigger: chartType === 'pie' ? 'item' : 'axis' } as const;

  switch (chartType) {
    case 'pie':
      return {
        title: baseTitle,
        tooltip,
        series: [
          {
            type: 'pie',
            radius: '60%',
            data: aggregated.map((d) => ({ name: d.category, value: d.value })),
          },
        ],
      };

    case 'funnel':
      return {
        title: baseTitle,
        tooltip,
        series: [
          {
            type: 'funnel',
            data: aggregated.map((d) => ({ name: d.category, value: d.value })),
          },
        ],
      };

    case 'line':
      return {
        title: baseTitle,
        tooltip,
        xAxis: { type: 'category', data: categories },
        yAxis: { type: 'value' },
        series: [{ type: 'line', data: values, smooth: true }],
      };

    case 'area':
      return {
        title: baseTitle,
        tooltip,
        xAxis: { type: 'category', data: categories },
        yAxis: { type: 'value' },
        series: [{ type: 'line', data: values, smooth: true, areaStyle: {} }],
      };

    case 'scatter':
      return {
        title: baseTitle,
        tooltip,
        xAxis: { type: 'category', data: categories },
        yAxis: { type: 'value' },
        series: [{ type: 'scatter', data: values, symbolSize: 12 }],
      };

    case 'bar_horizontal':
      return {
        title: baseTitle,
        tooltip,
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: categories },
        series: [{ type: 'bar', data: values }],
      };

    case 'radar': {
      const maxVal = Math.max(...values, 1);
      return {
        title: baseTitle,
        tooltip,
        radar: {
          indicator: categories.map((name) => ({
            name,
            max: Math.ceil(maxVal * 1.2),
          })),
        },
        series: [
          {
            type: 'radar',
            data: [{ value: values, name: title || 'radar' }],
          },
        ],
      } as never;
    }

    case 'waterfall': {
      // 经典透明基座堆叠瀑布：base[i] = 前序累计值
      const base: number[] = [];
      let running = 0;
      for (const v of values) {
        base.push(running);
        running += v;
      }
      return {
        title: baseTitle,
        tooltip,
        xAxis: { type: 'category', data: categories },
        yAxis: { type: 'value' },
        series: [
          { type: 'bar', stack: 'wf', data: base, itemStyle: { color: 'transparent' } },
          { type: 'bar', stack: 'wf', data: values },
        ],
      };
    }

    case 'wordcloud':
      // 无插件词云：以散点气泡模拟（字号/气泡大小按值缩放）
      return {
        title: baseTitle,
        tooltip,
        xAxis: { type: 'category', data: categories, axisLabel: { show: false } },
        yAxis: { type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
        series: [
          {
            type: 'scatter',
            data: values,
            symbolSize: (v: number) => Math.max(10, Math.min(48, v)),
            label: { show: true, formatter: (p: { name: string }) => p.name },
          },
        ],
      } as never;

    case 'combo':
      return {
        title: baseTitle,
        tooltip,
        xAxis: { type: 'category', data: categories },
        yAxis: { type: 'value' },
        series: [
          { type: 'bar', data: values, name: 'bar' },
          { type: 'line', data: values, smooth: true, name: 'line' },
        ],
      };

    case 'bar':
    default:
      return {
        title: baseTitle,
        tooltip,
        xAxis: { type: 'category', data: categories },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: values }],
      };
  }
}
