/**
 * 仪表盘网格专属配置面板。
 *
 * 从 PropertyPanel.tsx 提取。配置网格列数和行高。
 */

import { Divider, InputNumber, Typography } from 'antd';
import type { ComponentNode } from '../../../api/pages.js';
import { FormField } from './shared.js';

const { Text } = Typography;

export function DashboardGridPropsSection({
  node,
  updateComponentProps,
}: {
  node: ComponentNode;
  updateComponentProps: (id: string, props: Record<string, unknown>) => void;
}) {
  const cols = typeof node.props.cols === 'number' ? node.props.cols : 12;
  const rowHeight = typeof node.props.rowHeight === 'number' ? node.props.rowHeight : 30;

  return (
    <>
      <Divider style={{ margin: '8px 0' }} />
      <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
        网格配置
      </Text>
      <FormField label="列数">
        <InputNumber
          value={cols}
          min={1}
          max={24}
          size="small"
          style={{ width: '100%' }}
          onChange={(v) => updateComponentProps(node.id, { cols: v ?? 12 })}
        />
      </FormField>
      <FormField label="行高 (px)">
        <InputNumber
          value={rowHeight}
          min={10}
          max={120}
          size="small"
          style={{ width: '100%' }}
          onChange={(v) => updateComponentProps(node.id, { rowHeight: v ?? 30 })}
        />
      </FormField>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
        拖拽网格中的组件可调整位置和大小
      </Text>
    </>
  );
}
