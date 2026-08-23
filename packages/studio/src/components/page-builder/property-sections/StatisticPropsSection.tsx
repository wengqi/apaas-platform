/**
 * 统计数字/指标卡专属配置面板。
 *
 * 从 PropertyPanel.tsx 提取。配置标题、静态值、前缀/后缀、聚合方式、数据源。
 */

import { Input, Select } from 'antd';
import { useParams } from 'react-router-dom';
import type { ComponentNode } from '../../../api/pages.js';
import { useDatasourceFields } from './shared.js';
import { CHART_AGGREGATION_OPTIONS, FormField, SectionDivider } from './shared.js';

export function StatisticPropsSection({
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
  const hasAggregation = !!getStr('aggregation');

  const { fieldOptions, datasourceOptions } = useDatasourceFields(
    appId,
    datasourceType,
    datasourceId,
    hasAggregation,
  );

  return (
    <>
      <SectionDivider>基本配置</SectionDivider>
      <FormField label="标题">
        <Input
          value={getStr('title')}
          onChange={(e) => updateComponentProps(node.id, { title: e.target.value })}
          size="small"
          placeholder="统计标题"
        />
      </FormField>
      <FormField label="数值">
        <Input
          value={getStr('value')}
          onChange={(e) => updateComponentProps(node.id, { value: e.target.value })}
          size="small"
          placeholder="静态数值（未启用聚合时使用）"
          disabled={hasAggregation}
        />
      </FormField>
      <FormField label="前缀">
        <Input
          value={getStr('prefix')}
          onChange={(e) => updateComponentProps(node.id, { prefix: e.target.value })}
          size="small"
          placeholder="¥"
        />
      </FormField>
      <FormField label="后缀">
        <Input
          value={getStr('suffix')}
          onChange={(e) => updateComponentProps(node.id, { suffix: e.target.value })}
          size="small"
          placeholder="元"
        />
      </FormField>

      <SectionDivider>聚合配置（指标卡）</SectionDivider>
      <FormField label="聚合方式">
        <Select
          value={getStr('aggregation') || undefined}
          onChange={(v) =>
            updateComponentProps(node.id, {
              aggregation: v || '',
              datasourceId: v ? datasourceId : '',
            })
          }
          size="small"
          style={{ width: '100%' }}
          placeholder="不聚合（使用静态数值）"
          allowClear
          options={CHART_AGGREGATION_OPTIONS}
        />
      </FormField>
      {hasAggregation && (
        <>
          <FormField label="数据源类型">
            <Select
              value={datasourceType}
              onChange={(v) =>
                updateComponentProps(node.id, {
                  datasourceType: v,
                  datasourceId: '',
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
              onChange={(v) => updateComponentProps(node.id, { datasourceId: v, valueField: '' })}
              size="small"
              style={{ width: '100%' }}
              placeholder={datasourceType === 'object' ? '选择对象' : '选择数据集'}
              options={datasourceOptions}
              showSearch
              optionFilterProp="label"
            />
          </FormField>
          <FormField label="值字段">
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
        </>
      )}
    </>
  );
}
