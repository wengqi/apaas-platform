/**
 * 属性面板飞书式分组组件：分组标题（PropGroup）+ 标签左/控件右行（PropRow）。
 *
 * 对齐飞书 aPaaS 右侧面板：单列滚动、分组标题、行内 label 左对齐 + 控件右对齐。
 */

import type { CSSProperties, ReactNode } from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

/** 分组标题（如「内容」「校验」「交互」「尺寸」「样式」）。 */
export function PropGroup({
  title,
  domId,
  extra,
  children,
}: {
  title: string;
  domId?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div id={domId} style={{ padding: '12px 16px 4px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: 600, color: 'rgba(0,0,0,0.88)' }}>{title}</Text>
        {extra}
      </div>
      {children}
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 36,
  padding: '2px 0',
};

const labelStyle: CSSProperties = {
  width: 92,
  flexShrink: 0,
  fontSize: 13,
  color: 'rgba(0,0,0,0.65)',
};

/** 一行属性：label 左对齐（92px），控件占满剩余宽度。 */
export function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={rowStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** 分组内缩进行（对应飞书「校验」下的次级行）。 */
export function PropSubRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ ...rowStyle, paddingLeft: 12 }}>
      <div style={{ ...labelStyle, fontSize: 12 }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
