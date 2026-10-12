/**
 * 视图配置器 — 分组标题（从 ViewConfigurator.tsx 拆分，
 * AGENTS.md 单文件 400 行规范）。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { Space, Typography } from 'antd';

const { Title } = Typography;

export function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <Space size={8} style={{ marginBottom: 12 }}>
      <span style={{ color: T.colorPrimary }}>{icon}</span>
      <Title level={5} style={{ margin: 0 }}>
        {title}
      </Title>
    </Space>
  );
}
