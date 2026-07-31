/**
 * 权限管理页 — Phase 4。
 *
 * Tab 容器,分 3 个 Tab:角色管理 / 组织架构 / 用户管理。
 * 对齐飞书 aPaaS 权限管理界面。
 */

import { useState } from 'react';
import { Tabs } from 'antd';
import { TeamOutlined, ApartmentOutlined, UserOutlined } from '@ant-design/icons';
import RoleManager from '../components/permission/RoleManager.js';
import OrgManager from '../components/permission/OrgManager.js';
import UserManager from '../components/permission/UserManager.js';

export default function Permissions() {
  const [activeTab, setActiveTab] = useState('roles');

  return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column', background: '#f5f7fa' }}>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        style={{ paddingLeft: 16, background: '#fff', borderBottom: '1px solid #eef0f4', flexShrink: 0 }}
        items={[
          {
            key: 'roles',
            label: (
              <span>
                <TeamOutlined /> 角色管理
              </span>
            ),
            children: <RoleManager />,
          },
          {
            key: 'orgs',
            label: (
              <span>
                <ApartmentOutlined /> 组织架构
              </span>
            ),
            children: <OrgManager />,
          },
          {
            key: 'users',
            label: (
              <span>
                <UserOutlined /> 用户管理
              </span>
            ),
            children: <UserManager />,
          },
        ]}
      />
    </div>
  );
}
