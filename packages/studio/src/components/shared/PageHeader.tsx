/**
 * 页面级页头 — 租户级治理页面统一的标题区（2026-10-18）。
 *
 * 全局导航上收到 AppHeader 后，各治理页自带的「返回应用」头部退役；本组件
 * 只负责内容区顶部的页面上下文：标题 + 一行描述，可选返回（二级页）与右侧动作。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { Button, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface PageHeaderProps {
  title: string;
  /** 标题下方的一行说明（可省略）。 */
  description?: string;
  /** 二级页（如租户详情）返回上级的回调；提供时在标题左侧渲染返回按钮。 */
  onBack?: () => void;
  /** 标题行右侧动作区（如主操作按钮）。 */
  extra?: React.ReactNode;
}

/** 治理页面统一页头。 */
export default function PageHeader({ title, description, onBack, extra }: PageHeaderProps) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onBack ? (
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            aria-label="返回上一级"
            style={{ marginRight: 4, color: T.colorTextSecondary }}
          />
        ) : null}
        <Title level={4} style={{ margin: 0 }}>
          {title}
        </Title>
        {extra ? <div style={{ marginLeft: 'auto' }}>{extra}</div> : null}
      </div>
      {description ? (
        <Text
          type="secondary"
          style={{ fontSize: 13, display: 'block', marginTop: 4, maxWidth: 720 }}
        >
          {description}
        </Text>
      ) : null}
    </div>
  );
}
