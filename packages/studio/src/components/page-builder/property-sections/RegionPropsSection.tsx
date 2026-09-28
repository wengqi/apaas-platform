/**
 * 行政区划组件专属属性分组（region_cascader_single / region_cascader_multi）。
 *
 * 对齐飞书行政区划组件配置：展示层级（省/市/区县）+ 占位符。
 * 层级由 shared regionOptions(level) 消费，默认区县级。
 */

import { Input, Select } from 'antd';
import { usePageBuilderStore } from '../../../stores/pageBuilder.js';
import type { ComponentNode } from '../../../api/pages.js';
import { PropRow } from './PropRow.js';

const LEVEL_OPTIONS = [
  { label: '省级', value: 'province' },
  { label: '市级', value: 'city' },
  { label: '区县级', value: 'district' },
] as const;

export function RegionPropsSection({ node }: { node: ComponentNode }) {
  const updateComponentProps = usePageBuilderStore((s) => s.updateComponentProps);

  const levelRaw = node.props.level;
  const level =
    levelRaw === 'province' || levelRaw === 'city' || levelRaw === 'district'
      ? levelRaw
      : 'district';
  const placeholder = typeof node.props.placeholder === 'string' ? node.props.placeholder : '';

  return (
    <>
      <PropRow label="展示层级">
        <Select
          size="small"
          value={level}
          options={[...LEVEL_OPTIONS]}
          onChange={(v) => updateComponentProps(node.id, { level: v })}
          style={{ width: '100%' }}
        />
      </PropRow>
      <PropRow label="占位符">
        <Input
          size="small"
          value={placeholder}
          onChange={(e) => updateComponentProps(node.id, { placeholder: e.target.value })}
          placeholder="请选择省份/地区"
        />
      </PropRow>
    </>
  );
}
