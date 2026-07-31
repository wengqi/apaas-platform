import { Card, Typography, Tag, Space } from 'antd';
import { SafetyOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

/**
 * 权限管理占位页 — Phase 4 填充。
 * 将实现角色定义、角色成员、权限点（功能/数据）与分配。
 */
export default function Permissions() {
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
              background: '#f9f0ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SafetyOutlined style={{ fontSize: 64, color: '#722ed1' }} />
          </div>

          <Title level={3} style={{ margin: 0 }}>
            权限管理
          </Title>

          <Paragraph
            type="secondary"
            style={{ marginBottom: 0, lineHeight: 1.8, textAlign: 'center' }}
          >
            五级权限体系（页面/记录/流程/数据模型/连接器）。RBAC + 组织架构 + 行级数据权限。
          </Paragraph>

          <Tag
            color="purple"
            style={{ fontSize: 13, padding: '4px 14px', borderRadius: 6, margin: 0 }}
          >
            Phase 4 待实现
          </Tag>
        </Space>
      </Card>
    </div>
  );
}
