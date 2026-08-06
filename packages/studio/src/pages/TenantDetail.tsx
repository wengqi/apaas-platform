import { useState } from 'react';
import {
  Card,
  Tabs,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Tag,
  Space,
  Typography,
  Descriptions,
  App,
} from 'antd';
import {
  ArrowLeftOutlined,
  ThunderboltFilled,
  GlobalOutlined,
  UserAddOutlined,
  UserOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantsApi } from '../api/tenants.js';

const { Title: _Title, Text } = Typography;

/**
 * 租户详情页 — 平台超管查看租户信息、用户列表、应用列表，分配管理员。
 */
export default function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [adminForm] = Form.useForm();
  const [adminOpen, setAdminOpen] = useState(false);

  /** 查询租户详情。 */
  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant', id],
    queryFn: async () => {
      const res = await tenantsApi.get(id!);
      return res.data.data;
    },
    enabled: !!id,
  });

  /** 查询租户内用户。 */
  const { data: users } = useQuery({
    queryKey: ['tenant-users', id],
    queryFn: async () => {
      const res = await tenantsApi.getUsers(id!);
      return res.data.data ?? [];
    },
    enabled: !!id,
  });

  /** 查询租户内应用。 */
  const { data: apps } = useQuery({
    queryKey: ['tenant-apps', id],
    queryFn: async () => {
      const res = await tenantsApi.getApps(id!);
      return res.data.data ?? [];
    },
    enabled: !!id,
  });

  /** 分配管理员。 */
  const assignAdminMutation = useMutation({
    mutationFn: async (values: { email: string; name: string; password: string }) => {
      return tenantsApi.assignAdmin(id!, values);
    },
    onSuccess: () => {
      message.success('管理员创建成功');
      queryClient.invalidateQueries({ queryKey: ['tenant-users', id] });
      queryClient.invalidateQueries({ queryKey: ['tenant', id] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setAdminOpen(false);
      setTimeout(() => adminForm.resetFields(), 100);
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { message?: string } }; message?: string };
      message.error(axErr.response?.data?.message ?? '创建失败');
    },
  });

  /** 提交分配管理员表单。 */
  const handleAssignAdmin = () => {
    adminForm
      .validateFields()
      .then((values) => {
        assignAdminMutation.mutate(values);
      })
      .catch(() => {
        /* 校验错误已由 Form 展示 */
      });
  };

  /** 状态标签。 */
  const statusTag = (status?: string) => {
    if (!status) return null;
    const map: Record<string, { color: string; text: string }> = {
      ACTIVE: { color: 'green', text: '运行中' },
      SUSPENDED: { color: 'orange', text: '已挂起' },
      ARCHIVED: { color: 'default', text: '已归档' },
    };
    const cfg = map[status] ?? { color: 'default', text: status };
    return <Tag color={cfg.color}>{cfg.text}</Tag>;
  };

  const userColumns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    {
      title: '角色',
      dataIndex: 'roles',
      key: 'roles',
      render: (roles: { code: string; name: string }[]) =>
        roles?.map((r) => (
          <Tag key={r.code} color="blue">
            {r.name}
          </Tag>
        )) ?? '—',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => (
        <Tag color={s === 'ACTIVE' ? 'green' : 'red'}>{s === 'ACTIVE' ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => new Date(v).toLocaleDateString('zh-CN'),
    },
  ];

  const appColumns = [
    { title: '应用名称', dataIndex: 'name', key: 'name' },
    { title: 'API名称', dataIndex: 'apiName', key: 'apiName' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => {
        const map: Record<string, { color: string; text: string }> = {
          DRAFT: { color: 'default', text: '草稿' },
          PUBLISHED: { color: 'green', text: '已发布' },
          ARCHIVED: { color: 'orange', text: '已归档' },
        };
        const cfg = map[s] ?? { color: 'default', text: s };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    { title: '版本', dataIndex: 'version', key: 'version' },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => new Date(v).toLocaleDateString('zh-CN'),
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      {/* ── 顶部导航栏 ── */}
      <div
        style={{
          height: 56,
          background: '#fff',
          borderBottom: '1px solid #eef0f4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}
      >
        <Space size={16}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/platform/tenants')}
          >
            返回租户列表
          </Button>
          <Space size={8}>
            <ThunderboltFilled style={{ fontSize: 20, color: '#1677ff' }} />
            <Text strong style={{ fontSize: 16 }}>
              租户详情
            </Text>
          </Space>
        </Space>
      </div>

      {/* ── 内容区 ── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px' }}>
        {/* 基本信息 */}
        <Card style={{ marginBottom: 16 }} loading={isLoading}>
          {tenant && (
            <Descriptions
              title={
                <Space>
                  <GlobalOutlined />
                  <span>{tenant.name}</span>
                  {statusTag(tenant.status)}
                </Space>
              }
              column={3}
            >
              <Descriptions.Item label="租户标识">{tenant.slug}</Descriptions.Item>
              <Descriptions.Item label="描述">{tenant.description ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {new Date(tenant.createdAt).toLocaleString('zh-CN')}
              </Descriptions.Item>
              <Descriptions.Item label="用户数">
                <Space>
                  <UserOutlined />
                  {tenant.userCount}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="应用数">
                <Space>
                  <AppstoreOutlined />
                  {tenant.appCount}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="角色数">{tenant.roleCount}</Descriptions.Item>
            </Descriptions>
          )}
        </Card>

        {/* Tab：用户列表 / 应用列表 */}
        <Card>
          <Tabs
            defaultActiveKey="users"
            items={[
              {
                key: 'users',
                label: (
                  <span>
                    <UserOutlined /> 用户列表 ({users?.length ?? 0})
                  </span>
                ),
                children: (
                  <>
                    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        type="primary"
                        icon={<UserAddOutlined />}
                        onClick={() => setAdminOpen(true)}
                      >
                        分配管理员
                      </Button>
                    </div>
                    <Table
                      columns={userColumns}
                      dataSource={users}
                      rowKey="id"
                      pagination={{ pageSize: 20 }}
                      size="small"
                    />
                  </>
                ),
              },
              {
                key: 'apps',
                label: (
                  <span>
                    <AppstoreOutlined /> 应用列表 ({apps?.length ?? 0})
                  </span>
                ),
                children: (
                  <Table
                    columns={appColumns}
                    dataSource={apps}
                    rowKey="id"
                    pagination={{ pageSize: 20 }}
                    size="small"
                  />
                ),
              },
            ]}
          />
        </Card>
      </div>

      {/* ── 分配管理员弹窗 ── */}
      <Modal
        title="分配租户管理员"
        open={adminOpen}
        onCancel={() => setAdminOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setAdminOpen(false)}>
            取消
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={assignAdminMutation.isPending}
            onClick={handleAssignAdmin}
          >
            创建
          </Button>,
        ]}
      >
        <Form form={adminForm} layout="vertical" preserve={false}>
          <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="如：张三" />
          </Form.Item>
          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input placeholder="admin@example.com" />
          </Form.Item>
          <Form.Item
            label="初始密码"
            name="password"
            rules={[
              { required: true, message: '请输入初始密码' },
              { min: 6, message: '密码至少 6 位' },
            ]}
          >
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
        </Form>
        <div style={{ marginTop: 8, padding: '8px 12px', background: '#f6f8fa', borderRadius: 6 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            创建的用户将自动分配 TENANT_ADMIN 角色，拥有该租户的管理权限。
          </Text>
        </div>
      </Modal>
    </div>
  );
}
