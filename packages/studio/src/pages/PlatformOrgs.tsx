/**
 * 平台级 — 组织架构管理（租户级，不属于某个应用）。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { Card, Typography, Button, Space } from 'antd';
import { ApartmentOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import OrgManager from '../components/permission/OrgManager.js';

const { Title, Paragraph } = Typography;

export default function PlatformOrgs() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', background: T.colorBgLayout }}>
      {/* 顶部导航栏 */}
      <div
        style={{
          height: 56,
          background: T.colorWhite,
          borderBottom: `1px solid ${T.colorBorderSecondary}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <Space size={16}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/apps')}>
            返回应用
          </Button>
          <Title level={4} style={{ margin: 0 }}>
            <ApartmentOutlined /> 组织架构
          </Title>
        </Space>
      </div>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px' }}>
        <Card style={{ marginBottom: 16 }}>
          <Paragraph type="secondary">
            管理租户内的组织树 — 部门、团队、岗位的创建与成员管理。
          </Paragraph>
        </Card>
        <Card>
          <OrgManager />
        </Card>
      </div>
    </div>
  );
}
