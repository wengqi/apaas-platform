/**
 * 属性面板共享组件、常量、样式辅助与数据源 hook。
 *
 * 从 PropertyPanel.tsx 提取，供各 property-section 子文件复用。
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { InputNumber, Typography } from 'antd';
import type { ComponentNode } from '../../../api/pages.js';
import { objectsApi } from '../../../api/objects.js';
import { datasetsApi } from '../../../api/datasets.js';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

export const CHART_TYPE_OPTIONS = [
  { value: 'bar', label: '柱状图' },
  { value: 'line', label: '折线图' },
  { value: 'pie', label: '饼图' },
  { value: 'funnel', label: '漏斗图' },
];

export const CHART_AGGREGATION_OPTIONS = [
  { value: 'sum', label: '求和' },
  { value: 'count', label: '计数' },
  { value: 'avg', label: '平均值' },
  { value: 'max', label: '最大值' },
  { value: 'min', label: '最小值' },
];

export const TIME_GRANULARITY_OPTIONS = [
  { value: 'day', label: '按天' },
  { value: 'week', label: '按周' },
  { value: 'month', label: '按月' },
];

// ---------------------------------------------------------------------------
// 通用子组件
// ---------------------------------------------------------------------------

/** 表单字段：标签 + 控件。 */
export function FormField({
  label,
  children,
  compact,
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div style={{ marginBottom: compact ? 12 : 16 }}>
      <div
        style={{
          fontSize: 13,
          color: 'rgba(0,0,0,0.88)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/** 分区标题。 */
export function SectionDivider({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        color: 'rgba(0,0,0,0.45)',
        margin: '16px 0 8px',
        paddingBottom: 4,
        borderBottom: '1px solid #f0f2f5',
      }}
    >
      {children}
    </div>
  );
}

/** 占位 Tab。 */
export function PlaceholderTab({ text }: { text: string }) {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center' }}>
      <Text type="secondary" style={{ fontSize: 13 }}>
        {text}
      </Text>
    </div>
  );
}

/** 四向间距编辑器（上/右/下/左）。prefix 为 'margin' 或 'padding'。 */
export function SpacingEditor({
  prefix,
  style,
  onChange,
}: {
  prefix: string;
  style: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
}) {
  const items = [
    { label: '上', suffix: 'Top' },
    { label: '右', suffix: 'Right' },
    { label: '下', suffix: 'Bottom' },
    { label: '左', suffix: 'Left' },
  ];

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {items.map((item) => {
        const fullKey = `${prefix}${item.suffix}`;
        return (
          <div key={fullKey} style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginBottom: 2 }}>
              {item.label}
            </div>
            <InputNumber
              value={getStyleNumber(style, fullKey)}
              onChange={(v) => onChange({ [fullKey]: v ?? undefined })}
              size="small"
              style={{ width: '100%' }}
              placeholder="0"
            />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 样式辅助
// ---------------------------------------------------------------------------

export const panelStyle: React.CSSProperties = {
  width: 360,
  flexShrink: 0,
  height: '100%',
  background: '#fff',
  borderLeft: '1px solid #eef0f4',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

export const headerStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #eef0f4',
  flexShrink: 0,
};

/** 安全读取节点的 style 对象。 */
export function getNodeStyle(node: ComponentNode): Record<string, unknown> {
  const raw = node.props.style;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export function getStyleNumber(style: Record<string, unknown>, key: string): number | undefined {
  const val = style[key];
  return typeof val === 'number' ? val : undefined;
}

export function getStyleString(style: Record<string, unknown>, key: string): string | undefined {
  const val = style[key];
  return typeof val === 'string' ? val : undefined;
}

// ---------------------------------------------------------------------------
// 数据源 hook（ChartPropsSection 和 StatisticPropsSection 共用）
// ---------------------------------------------------------------------------

/** 字段选项类型。 */
export interface FieldOption {
  value: string;
  label: string;
}

/**
 * 加载数据源列表 + 选中数据源的字段/列定义。
 *
 * 用于图表/指标卡的数据源选择和字段映射。
 */
export function useDatasourceFields(
  appId: string | undefined,
  datasourceType: string,
  datasourceId: string,
  enabled = true,
) {
  const { data: objects } = useQuery({
    queryKey: ['app-objects', appId],
    queryFn: () => objectsApi.list(appId!),
    enabled: !!appId && datasourceType === 'object' && enabled,
  });

  const { data: datasets } = useQuery({
    queryKey: ['datasets', appId],
    queryFn: () => datasetsApi.list(appId!),
    enabled: !!appId && datasourceType === 'dataset' && enabled,
  });

  const { data: selectedObject } = useQuery({
    queryKey: ['object', datasourceId],
    queryFn: () => objectsApi.get(datasourceId!),
    enabled: datasourceType === 'object' && !!datasourceId && enabled,
  });

  const { data: selectedDataset } = useQuery({
    queryKey: ['dataset', datasourceId],
    queryFn: () => datasetsApi.get(datasourceId!),
    enabled: datasourceType === 'dataset' && !!datasourceId && enabled,
  });

  const fieldOptions = useMemo<FieldOption[]>(() => {
    if (datasourceType === 'object' && selectedObject?.fields) {
      return selectedObject.fields.map((f) => ({
        value: f.apiName,
        label: `${f.label || f.apiName} (${f.apiName})`,
      }));
    }
    if (datasourceType === 'dataset' && selectedDataset?.columns) {
      return selectedDataset.columns.map((c) => ({
        value: c.apiName,
        label: `${c.label} (${c.apiName})`,
      }));
    }
    return [];
  }, [datasourceType, selectedObject, selectedDataset]);

  const datasourceOptions =
    datasourceType === 'object'
      ? (objects ?? []).map((o) => ({ value: o.id, label: o.label ?? o.name }))
      : (datasets ?? []).map((d) => ({ value: d.id, label: d.name }));

  return { fieldOptions, datasourceOptions };
}
