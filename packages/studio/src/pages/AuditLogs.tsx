/**
 * 审计日志页面 — 租户级，展示权限操作审计记录。
 *
 * 支持按操作类型、资源类型、用户 ID 筛选，分页查询。
 * 顶栏导航由 TenantLayout 常显，页面只负责内容区。
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Table, Tag, Input, Select, Space, Button, Descriptions, Alert } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { auditLogsApi, type AuditLogItem } from '../api/audit-logs.js';
import { apiErrorMessage } from '../api/client.js';
import { AUDIT_CATEGORY_OPTIONS } from '../constants/audit-category.js';
import { displayName, useUserNameMap } from '../utils/user-display.js';
import AuditCategoryTag from '../components/shared/AuditCategoryTag.js';
import PageHeader from '../components/shared/PageHeader.js';
import PageContainer from '../components/shared/PageContainer.js';

const DEFAULT_PAGE_SIZE = 20;

const ACTION_COLORS: Record<string, string> = {
  PERMISSION_DENIED: 'red',
  PERMISSION_CHECK: 'default',
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'orange',
};

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [actionFilter, setActionFilter] = useState<string | undefined>();
  const [resourceFilter, setResourceFilter] = useState<string | undefined>();
  const [userIdFilter, setUserIdFilter] = useState<string | undefined>();
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  // 双视角评审（2026-10-04）R10：用户列显示姓名而非裸 cuid
  const userNameMap = useUserNameMap();

  const { data, isLoading, error, isError, refetch } = useQuery({
    queryKey: [
      'audit-logs',
      page,
      pageSize,
      actionFilter,
      resourceFilter,
      userIdFilter,
      categoryFilter,
    ],
    queryFn: () =>
      auditLogsApi.query({
        page,
        pageSize,
        action: actionFilter,
        resource: resourceFilter,
        userId: userIdFilter,
        category: categoryFilter,
      }),
  });

  const columns = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '分类',
      dataIndex: 'action',
      key: 'category',
      width: 110,
      render: (v: string) => <AuditCategoryTag action={v} />,
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 160,
      render: (v: string) => <Tag color={ACTION_COLORS[v] ?? 'default'}>{v}</Tag>,
    },
    {
      title: '资源类型',
      dataIndex: 'resource',
      key: 'resource',
      width: 120,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: '资源 ID',
      dataIndex: 'resourceId',
      key: 'resourceId',
      width: 200,
      render: (v: string | null) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v ?? '—'}</span>
      ),
    },
    {
      title: '操作人',
      dataIndex: 'userId',
      key: 'userId',
      width: 200,
      render: (v: string) => (
        <span title={v} style={{ fontSize: 12 }}>
          {displayName(userNameMap, v)}
        </span>
      ),
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      key: 'ip',
      width: 140,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: '详情',
      dataIndex: 'detail',
      key: 'detail',
      render: (v: unknown) => {
        if (!v) return '—';
        return (
          <pre style={{ margin: 0, fontSize: 12, maxWidth: 300, overflow: 'auto' }}>
            {JSON.stringify(v, null, 2)}
          </pre>
        );
      },
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="审计日志"
        description="权限与业务操作审计记录，支持按分类、操作类型、资源类型与用户筛选。"
      />

      <div>
        <Card style={{ marginBottom: 16 }}>
          <Space wrap size={12}>
            <Select
              allowClear
              placeholder="全部分类"
              style={{ width: 160 }}
              value={categoryFilter}
              onChange={(v) => {
                setCategoryFilter(v);
                setPage(1);
              }}
              options={AUDIT_CATEGORY_OPTIONS}
            />
            <Select
              allowClear
              placeholder="操作类型"
              style={{ width: 180 }}
              value={actionFilter}
              onChange={(v) => {
                setActionFilter(v);
                setPage(1);
              }}
              options={[
                { value: 'PERMISSION_CHECK', label: '权限检查' },
                { value: 'PERMISSION_DENIED', label: '权限拒绝' },
                { value: 'CREATE', label: '创建' },
                { value: 'UPDATE', label: '更新' },
                { value: 'DELETE', label: '删除' },
              ]}
            />
            <Select
              allowClear
              placeholder="资源类型"
              style={{ width: 180 }}
              value={resourceFilter}
              onChange={(v) => {
                setResourceFilter(v);
                setPage(1);
              }}
              options={[
                { value: 'OBJECT', label: '对象' },
                { value: 'PAGE', label: '页面' },
                { value: 'PROCESS', label: '流程' },
                { value: 'ROLE', label: '角色' },
                { value: 'CONNECTOR', label: '连接器' },
                { value: 'CLOUD_FUNCTION', label: '云函数' },
              ]}
            />
            <Input
              allowClear
              placeholder="用户 ID"
              style={{ width: 240 }}
              value={userIdFilter ?? ''}
              onChange={(e) => {
                setUserIdFilter(e.target.value || undefined);
                setPage(1);
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              刷新
            </Button>
          </Space>
        </Card>

        <Card>
          {/* 双视角评审（2026-10-04）：403 等查询失败此前被渲染成空表（静默空态）——显式错误态 */}
          {isError && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message="审计日志加载失败"
              description={apiErrorMessage(error, '无权访问或服务不可用')}
              action={
                <Button size="small" onClick={() => refetch()}>
                  重试
                </Button>
              }
            />
          )}
          <Table<AuditLogItem>
            loading={isLoading}
            columns={columns}
            dataSource={isError ? [] : (data?.items ?? [])}
            rowKey="id"
            pagination={{
              current: data?.page ?? 1,
              pageSize: data?.pageSize ?? DEFAULT_PAGE_SIZE,
              total: data?.total ?? 0,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
            expandable={{
              expandedRowRender: (record) => (
                <Descriptions size="small" column={1} bordered>
                  <Descriptions.Item label="详情">
                    <pre style={{ margin: 0, fontSize: 12 }}>
                      {JSON.stringify(record.detail, null, 2)}
                    </pre>
                  </Descriptions.Item>
                </Descriptions>
              ),
              rowExpandable: (record) => !!record.detail,
            }}
          />
        </Card>
      </div>
    </PageContainer>
  );
}
