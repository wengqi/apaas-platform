import { Card, Typography, Tag, Space } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

/**
 * 对象设计器占位页 — Phase 1 填充。
 * 将用于定义业务对象、字段、关系与视图。
 */
export default function ObjectDesigner() {
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
              background: '#e6f4ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <DatabaseOutlined style={{ fontSize: 64, color: '#1677ff' }} />
          </div>

          <Title level={3} style={{ margin: 0 }}>
            对象设计器
          </Title>

          <Paragraph
            type="secondary"
            style={{ marginBottom: 0, lineHeight: 1.8, textAlign: 'center' }}
          >
            定义业务对象、字段类型、关联关系与视图。支持文本、数字、日期、关联、公式等字段类型。
          </Paragraph>

          <Tag
            color="blue"
            style={{ fontSize: 13, padding: '4px 14px', borderRadius: 6, margin: 0 }}
          >
            Phase 1 待实现
          </Tag>
        </Space>
      </Card>
    </div>
  );
}
