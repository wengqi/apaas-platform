/**
 * 样式属性 Tab — 尺寸、间距、边框、背景配置。
 *
 * 从 PropertyPanel.tsx 提取。
 */

import { ColorPicker, InputNumber, Select } from 'antd';
import { usePageBuilderStore } from '../../../stores/pageBuilder.js';
import type { ComponentNode } from '../../../api/pages.js';
import {
  FormField,
  SectionDivider,
  SpacingEditor,
  getNodeStyle,
  getStyleNumber,
  getStyleString,
} from './shared.js';

export function StylePropsTab({ node }: { node: ComponentNode }) {
  const updateComponentProps = usePageBuilderStore((s) => s.updateComponentProps);
  const style = getNodeStyle(node);

  const updateStyle = (updates: Record<string, unknown>) => {
    updateComponentProps(node.id, { style: { ...style, ...updates } });
  };

  const borderStyleOptions = [
    { label: '无', value: 'none' },
    { label: '实线', value: 'solid' },
    { label: '虚线', value: 'dashed' },
    { label: '点线', value: 'dotted' },
  ];

  return (
    <div>
      {/* 尺寸 */}
      <SectionDivider>尺寸</SectionDivider>
      <div style={{ display: 'flex', gap: 12 }}>
        <FormField label="宽度" compact>
          <InputNumber
            value={getStyleNumber(style, 'width')}
            onChange={(v) => updateStyle({ width: v ?? undefined })}
            size="small"
            addonAfter="px"
            style={{ width: '100%' }}
            placeholder="自适应"
          />
        </FormField>
        <FormField label="高度" compact>
          <InputNumber
            value={getStyleNumber(style, 'height')}
            onChange={(v) => updateStyle({ height: v ?? undefined })}
            size="small"
            addonAfter="px"
            style={{ width: '100%' }}
            placeholder="自适应"
          />
        </FormField>
      </div>

      {/* 间距 — 外边距 */}
      <SectionDivider>外边距 (margin)</SectionDivider>
      <SpacingEditor prefix="margin" style={style} onChange={updateStyle} />

      {/* 间距 — 内边距 */}
      <SectionDivider>内边距 (padding)</SectionDivider>
      <SpacingEditor prefix="padding" style={style} onChange={updateStyle} />

      {/* 边框 */}
      <SectionDivider>边框</SectionDivider>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <FormField label="样式" compact>
          <Select
            value={getStyleString(style, 'borderStyle') ?? 'none'}
            onChange={(v) => updateStyle({ borderStyle: v })}
            size="small"
            style={{ width: 90 }}
            options={borderStyleOptions}
          />
        </FormField>
        <FormField label="宽度" compact>
          <InputNumber
            value={getStyleNumber(style, 'borderWidth')}
            onChange={(v) => updateStyle({ borderWidth: v ?? undefined })}
            size="small"
            addonAfter="px"
            style={{ width: 100 }}
            min={0}
          />
        </FormField>
        <FormField label="颜色" compact>
          <ColorPicker
            value={getStyleString(style, 'borderColor') ?? '#eef0f4'}
            showText
            size="small"
            onChange={(color) => updateStyle({ borderColor: color.toHexString() })}
          />
        </FormField>
      </div>
      <FormField label="圆角">
        <InputNumber
          value={getStyleNumber(style, 'borderRadius')}
          onChange={(v) => updateStyle({ borderRadius: v ?? undefined })}
          size="small"
          addonAfter="px"
          style={{ width: 120 }}
          min={0}
        />
      </FormField>

      {/* 背景 */}
      <SectionDivider>背景</SectionDivider>
      <FormField label="背景颜色">
        <ColorPicker
          value={getStyleString(style, 'background') ?? '#ffffff'}
          showText
          size="small"
          onChange={(color) => updateStyle({ background: color.toHexString() })}
        />
      </FormField>
    </div>
  );
}
