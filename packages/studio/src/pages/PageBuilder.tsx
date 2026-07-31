import { Card, Typography, Tag, Space } from 'antd';
import { LayoutOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

/**
 * 页面搭建器占位页 — Phase 2 填充。
 * 将基于 dnd-kit 实现可视化拖拽搭建页面。
 */
export default function PageBuilder() {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
      }}
    >
      <Card
        style={{
          maxWidth: 480,
          width: '100%',
          borderRadius: 16,
          border: '1px solid #eef0f4',
          boxShadow: '0 8px 24px rgba(0,0,0,0.04)',
        }}
        styles={{ body: { padding: '56px 40px' } }}
      >
        <Space direction="vertical" size={24} align="center" style={{ width: '100%' }}>
          {/* 图标块 */}
          <div
            style={{
              width: 112,
              height: 112,
              borderRadius: 28,
              background: '#f6ffed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LayoutOutlined style={{ fontSize: 64, color: '#52c41a' }} />
          </div>

          <Title level={3} style={{ margin: 0 }}>
            页面搭建器
          </Title>

          <Paragraph
            type="secondary"
            style={{ marginBottom: 0, lineHeight: 1.8, textAlign: 'center' }}
          >
            可视化拖拽搭建页面。组件树 + 视图模型 + 表达式绑定，所见即所得。
          </Paragraph>

          <Tag
            color="green"
            style={{ fontSize: 13, padding: '4px 14px', borderRadius: 6, margin: 0 }}
          >
            Phase 2 待实现
          </Tag>
        </Space>
      </Card>
    </div>
  );
}
