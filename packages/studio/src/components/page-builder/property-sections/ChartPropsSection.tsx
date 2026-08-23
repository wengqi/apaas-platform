/**
 * 图表组件专属配置面板。
 *
 * 从 PropertyPanel.tsx 提取。配置图表类型、数据源、字段映射、聚合方式、时间分桶。
 */

import { Input, Select } from 'antd';
import { useParams } from 'react-router-dom';
import type { ComponentNode } from '../../../api/pages.js';
import { useDatasourceFields } from './shared.js';
import {
  CHART_TYPE_OPTIONS,
  CHART_AGGREGATION_OPTIONS,
  TIME_GRANULARITY_OPTIONS,
  FormField,
  SectionDivider,
} from './shared.js';

export function ChartPropsSection({
  node,
  getStr,
  updateComponentProps,
}: {
  node: ComponentNode;
  getStr: (key: string) => string;
  updateComponentProps: (id: string, props: Record<string, unknown>) => void;
}) {
  const { appId } = useParams<{ appId: string }>();
  const datasourceType = getStr('datasourceType') || 'object';
  const datasourceId = getStr('datasourceId');

  const { fieldOptions, datasourceOptions } = useDatasourceFields(
    appId,
    datasourceType,
    datasourceId,
  );

  return (
    <>
      <SectionDivider>图表配置</SectionDivider>
      <FormField label="图表类型">
        <Select
          value={getStr('chartType') || 'bar'}
          onChange={(v) => updateComponentProps(node.id, { chartType: v })}
          size="small"
          style={{ width: '100%' }}
          options={CHART_TYPE_OPTIONS}
        />
      </FormField>
      <FormField label="图表标题">
        <Input
          value={getStr('title')}
          onChange={(e) => updateComponentProps(node.id, { title: e.target.value })}
          size="small"
          placeholder="图表标题"
        />
      </FormField>

      <SectionDivider>数据源</SectionDivider>
      <FormField label="数据源类型">
        <Select
          value={datasourceType}
          onChange={(v) =>
            updateComponentProps(node.id, {
              datasourceType: v,
              datasourceId: '',
              categoryField: '',
              valueField: '',
            })
          }
          size="small"
          style={{ width: '100%' }}
          options={[
            { value: 'object', label: '对象' },
            { value: 'dataset', label: '数据集' },
          ]}
        />
      </FormField>
      <FormField label={datasourceType === 'object' ? '选择对象' : '选择数据集'}>
        <Select
          value={datasourceId || undefined}
          onChange={(v) =>
            updateComponentProps(node.id, {
              datasourceId: v,
              categoryField: '',
              valueField: '',
            })
          }
          size="small"
          style={{ width: '100%' }}
          placeholder={datasourceType === 'object' ? '选择对象' : '选择数据集'}
          options={datasourceOptions}
          showSearch
          optionFilterProp="label"
        />
      </FormField>

      <SectionDivider>字段映射</SectionDivider>
      <FormField label="分类字段（X 轴 / 标签）">
        <Select
          value={getStr('categoryField') || undefined}
          onChange={(v) => updateComponentProps(node.id, { categoryField: v })}
          size="small"
          style={{ width: '100%' }}
          placeholder={fieldOptions.length ? '选择字段' : '请先选择数据源'}
          options={fieldOptions}
          showSearch
          optionFilterProp="label"
          disabled={fieldOptions.length === 0}
        />
      </FormField>
      <FormField label="值字段（Y 轴 / 数值）">
        <Select
          value={getStr('valueField') || undefined}
          onChange={(v) => updateComponentProps(node.id, { valueField: v })}
          size="small"
          style={{ width: '100%' }}
          placeholder={fieldOptions.length ? '选择字段' : '请先选择数据源'}
          options={fieldOptions}
          showSearch
          optionFilterProp="label"
          disabled={fieldOptions.length === 0}
        />
      </FormField>
      <FormField label="聚合方式">
        <Select
          value={getStr('aggregation') || 'sum'}
          onChange={(v) => updateComponentProps(node.id, { aggregation: v })}
          size="small"
          style={{ width: '100%' }}
          options={CHART_AGGREGATION_OPTIONS}
        />
      </FormField>
      <FormField label="时间分桶">
        <Select
          value={getStr('timeGranularity') || undefined}
          onChange={(v) => updateComponentProps(node.id, { timeGranularity: v || '' })}
          size="small"
          style={{ width: '100%' }}
          placeholder="不启用（按原始值分组）"
          allowClear
          options={TIME_GRANULARITY_OPTIONS}
        />
      </FormField>
    </>
  );
}
