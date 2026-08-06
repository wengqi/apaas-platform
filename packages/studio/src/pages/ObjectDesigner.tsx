import { Typography } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import { Outlet, useParams } from 'react-router-dom';
import ObjectListPanel from '../components/object/ObjectListPanel.js';

/**
 * 对象设计器(列表页容器)。
 * 左栏:对象列表(ObjectListPanel);右栏:对象详情(ObjectDetail)或空状态,通过嵌套路由 Outlet 渲染。
 * 选中对象后 URL 同步为 /app/:appId/objects/:objectId。
 */
export default function ObjectDesigner() {
  const { appId } = useParams<{ appId: string }>();

  if (!appId) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        height: 'calc(100vh - 160px)',
        minHeight: 480,
      }}
    >
      <ObjectListPanel appId={appId} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          background: '#fff',
          border: '1px solid #eef0f4',
          borderRadius: 12,
          padding: 24,
          overflow: 'auto',
        }}
      >
        <Outlet />
      </div>
    </div>
  );
}

/** 右栏空状态(未选中对象)。 */
export function ObjectEmptyState() {
  return (
    <div
      style={{
        height: '100%',
        minHeight: 400,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}
    >
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
      <Typography.Title level={4} style={{ margin: 0 }}>
        选择一个对象开始
      </Typography.Title>
      <Typography.Text type="secondary">从左侧选择对象,或新建对象来定义业务实体</Typography.Text>
    </div>
  );
}
