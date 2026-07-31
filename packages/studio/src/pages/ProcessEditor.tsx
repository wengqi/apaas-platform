import { Card, Typography, Tag, Space } from 'antd';
import { ApartmentOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

/**
 * 流程编辑器占位页 — Phase 3 填充。
 * 将实现双模式(简易 / 高级)同源流程编排。
 */
export default function ProcessEditor() {
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
              background: '#fff7e6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ApartmentOutlined style={{ fontSize: 64, color: '#fa8c16' }} />
          </div>

          <Title level={3} style={{ margin: 0 }}>
            流程编辑器
          </Title>

          <Paragraph
            type="secondary"
            style={{ marginBottom: 0, lineHeight: 1.8, textAlign: 'center' }}
          >
            双模式流程编排（简化模式 + 标准 BPMN）。同源 WorkflowSchema，双向自动互转。
          </Paragraph>

          <Tag
            color="orange"
            style={{ fontSize: 13, padding: '4px 14px', borderRadius: 6, margin: 0 }}
          >
            Phase 3 待实现
          </Tag>
        </Space>
      </Card>
    </div>
  );
}
