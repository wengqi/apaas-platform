/**
 * 平台级 — 组织架构管理（租户级，不属于某个应用）。
 * 顶栏导航由 TenantLayout 常显，页面只负责内容区。
 */

import { Card } from 'antd';
import OrgManager from '../components/permission/OrgManager.js';
import PageHeader from '../components/shared/PageHeader.js';
import PageContainer from '../components/shared/PageContainer.js';

export default function PlatformOrgs() {
  return (
    <PageContainer>
      <PageHeader
        title="组织架构"
        description="管理租户内的组织树 — 部门、团队、岗位的创建与成员管理。"
      />
      <Card>
        <OrgManager />
      </Card>
    </PageContainer>
  );
}
