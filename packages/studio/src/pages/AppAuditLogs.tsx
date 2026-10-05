/**
 * 应用级审计日志页面（ROADMAP 9.9）。
 *
 * 展示当前应用内的审计记录（RECORD_CREATE/UPDATE/DELETE、APP_PUBLISH、
 * PROCESS_PUBLISH、应用内权限检查等），支持按操作类型/资源类型/用户 ID 筛选。
 *
 * 与平台级 /platform/audit-logs 的区别：固定 appId 维度，供应用管理者自查。
 */

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { ReloadOutlined, FileSearchOutlined } from '@ant-design/icons';
import { auditLogsApi, type AuditLogItem } from '../api/audit-logs.js';
import { apiErrorMessage } from '../api/client.js';
import { AUDIT_CATEGORY_OPTIONS } from '../constants/audit-category.js';
import AuditCategoryTag from '../components/shared/AuditCategoryTag.js';

const { Title, Text } = Typography;
const DEFAULT_PAGE_SIZE = 20;

const ACTION_COLORS: Record<string, string> = {
  PERMISSION_DENIED: 'red',
  PERMISSION_CHECK: 'default',
  RECORD_CREATE: 'green',
  RECORD_UPDATE: 'blue',
  RECORD_DELETE: 'orange',
  APP_PUBLISH: 'purple',
  PROCESS_PUBLISH: 'geekblue',
};

const ACTION_OPTIONS = [
  { value: 'RECORD_CREATE', label: '记录创建' },
  { value: 'RECORD_UPDATE', label: '记录更新' },
  { value: 'RECORD_DELETE', label: '记录删除' },
  { value: 'APP_PUBLISH', label: '应用发布' },
  { value: 'PROCESS_PUBLISH', label: '流程发布' },
  { value: 'PERMISSION_CHECK', label: '权限校验' },
  { value: 'PERMISSION_DENIED', label: '权限拒绝' },
];

const RESOURCE_OPTIONS = [
  { value: 'RECORD', label: '记录' },
  { value: 'APPLICATION', label: '应用' },
  { value: 'PROCESS', label: '流程' },
  { value: 'PAGE', label: '页面' },
  { value: 'DATA_MODEL', label: '数据模型' },
];

export default function AppAuditLogs() {
  const { appId } = useParams<{ appId: string }>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [actionFilter, setActionFilter] = useState<string | undefined>();
  const [resourceFilter, setResourceFilter] = useState<string | undefined>();
  const [userIdFilter, setUserIdFilter] = useState<string | undefined>();
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();

  const { data, isLoading, isFetching, error, isError, refetch } = useQuery({
    queryKey: [
      'app-audit-logs',
      appId,
      page,
      pageSize,
      actionFilter,
      resourceFilter,
      userIdFilter,
      categoryFilter,
    ],
    queryFn: () =>
      auditLogsApi.query({
        appId: appId!,
        page,
        pageSize,
        action: actionFilter,
        resource: resourceFilter,
        userId: userIdFilter,
        category: categoryFilter,
      }),
    enabled: !!appId,
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
      width: 170,
      render: (v: string) => <Tag color={ACTION_COLORS[v] ?? 'default'}>{v}</Tag>,
    },
    {
      title: '资源类型',
      dataIndex: 'resource',
      key: 'resource',
      width: 110,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: '资源 ID',
      dataIndex: 'resourceId',
      key: 'resourceId',
      width: 220,
      render: (v: string | null) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v ?? '—'}</Text>
      ),
    },
    {
      title: '用户 ID',
      dataIndex: 'userId',
      key: 'userId',
      width: 220,
      render: (v: string) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text>,
    },
    {
      title: '详情',
      dataIndex: 'detail',
      key: 'detail',
      render: (v: unknown) =>
        v ? (
          <pre style={{ margin: 0, fontSize: 12, maxWidth: 320, overflow: 'auto' }}>
            {JSON.stringify(v, null, 2)}
          </pre>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <Card>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space align="center" size={10}>
          <FileSearchOutlined />
          <Title level={5} style={{ margin: 0 }}>
            审计日志
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            本应用内的记录变更、发布与权限事件（最多保留最近 {pageSize} 条/页）
          </Text>
        </Space>

        <Space wrap size={8}>
          <Select
            placeholder="全部分类"
            allowClear
            style={{ width: 150 }}
            options={AUDIT_CATEGORY_OPTIONS}
            value={categoryFilter}
            onChange={(v) => {
              setCategoryFilter(v);
              setPage(1);
            }}
          />
          <Select
            placeholder="操作类型"
            allowClear
            style={{ width: 160 }}
            options={ACTION_OPTIONS}
            value={actionFilter}
            onChange={(v) => {
              setActionFilter(v);
              setPage(1);
            }}
          />
          <Select
            placeholder="资源类型"
            allowClear
            style={{ width: 140 }}
            options={RESOURCE_OPTIONS}
            value={resourceFilter}
            onChange={(v) => {
              setResourceFilter(v);
              setPage(1);
            }}
          />
          <Input
            placeholder="用户 ID"
            allowClear
            style={{ width: 220 }}
            onPressEnter={(e) => {
              setUserIdFilter((e.target as HTMLInputElement).value || undefined);
              setPage(1);
            }}
            onBlur={(e) => setUserIdFilter(e.target.value || undefined)}
          />
          <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => void refetch()}>
            刷新
          </Button>
        </Space>

        {/* 双视角评审（2026-10-04）：查询失败（如无权限 403）此前被渲染成空表——显式错误态 */}
        {isError && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="审计日志加载失败"
            description={apiErrorMessage(error, '无权访问或服务不可用')}
            action={
              <Button size="small" onClick={() => void refetch()}>
                重试
              </Button>
            }
          />
        )}
        <Table<AuditLogItem>
          size="small"
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={isError ? [] : (data?.items ?? [])}
          pagination={{
            current: page,
            pageSize,
            total: data?.total ?? 0,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Space>
    </Card>
  );
}
