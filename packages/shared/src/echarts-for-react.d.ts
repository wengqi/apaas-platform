/**
 * echarts-for-react 类型声明 shim。
 *
 * echarts-for-react 的 .d.ts 在 moduleResolution: NodeNext 下无法正确解析
 * 默认导出（CJS 包无 exports/types 字段，TypeScript 将 default import 解析为
 * 模块命名空间而非 class）。此 shim 声明模块默认导出为 React 组件，
 * 与 studio / runtime-ui（moduleResolution: bundler）下的行为一致。
 */

declare module 'echarts-for-react' {
  import type { Component } from 'react';

  export interface EChartsReactProps {
    option: Record<string, unknown>;
    style?: React.CSSProperties;
    className?: string;
    notMerge?: boolean;
    lazyUpdate?: boolean;
    theme?: string;
    onChartReady?: (instance: unknown) => void;
    loadingOption?: Record<string, unknown>;
    showLoading?: boolean;
  }

  export default class ReactECharts extends Component<EChartsReactProps> {}
}
