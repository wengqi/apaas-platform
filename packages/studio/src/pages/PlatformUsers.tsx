/**
 * 平台级 — 用户管理（租户级，不属于某个应用）。
 * 顶栏导航由 TenantLayout 常显，页面只负责内容区。
 */

import { Card } from 'antd';
import UserManager from '../components/permission/UserManager.js';
import PageHeader from '../components/shared/PageHeader.js';
import PageContainer from '../components/shared/PageContainer.js';

export default function PlatformUsers() {
  return (
    <PageContainer>
      <PageHeader
        title="用户管理"
        description="管理租户内的所有用户 — 创建用户、分配角色、绑定组织。"
      />
      <Card>
        <UserManager />
      </Card>
    </PageContainer>
  );
}
