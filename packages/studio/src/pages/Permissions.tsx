/**
 * 应用内 — 角色权限管理（应用级）。
 *
 * 组织架构和用户管理已移至平台级路由：
 *   /platform/orgs   — 组织架构（租户级）
 *   /platform/users  — 用户管理（租户级）
 *
 * 本页面仅保留角色管理 + 权限规则（应用级权限配置）。
 */

import { Card, Typography } from 'antd';
import { SafetyOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import RoleManager from '../components/permission/RoleManager.js';

const { Title, Paragraph } = Typography;

export default function Permissions() {
  const { appId } = useParams<{ appId: string }>();
  return (
    <div
      style={{ height: 'calc(100vh - 56px)', overflow: 'auto', background: '#f5f7fa', padding: 24 }}
    >
      <Card style={{ marginBottom: 16 }}>
        <Title level={4}>
          <SafetyOutlined /> 角色权限
        </Title>
        <Paragraph type="secondary">
          管理本应用的角色与权限规则 — 角色定义用户权限边界，权限规则控制对具体资源的访问。
        </Paragraph>
      </Card>
      <Card>
        <RoleManager appId={appId} />
      </Card>
    </div>
  );
}
