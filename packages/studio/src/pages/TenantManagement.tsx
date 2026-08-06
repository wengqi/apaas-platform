import { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Tag,
  Space,
  Typography,
  Dropdown,
  App,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  PlusOutlined,
  ThunderboltFilled,
  GlobalOutlined,
  MoreOutlined,
  UserOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantsApi, type TenantSummary } from '../api/tenants.js';

const { Title, Text } = Typography;

/**
 * 租户管理页 — 仅平台超管可访问。
 * 管理所有租户：创建、查看、挂起/激活、分配管理员。
 */
export default function TenantManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [createForm] = Form.useForm();
  const [createOpen, setCreateOpen] = useState(false);

  /** 查询租户列表。 */
  const { data: tenants, isLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: async () => {
      const res = await tenantsApi.list();
      return res.data.data ?? [];
    },
  });

  /** 创建租户。 */
  const createMutation = useMutation({
    mutationFn: async (values: { name: string; slug: string; description?: string }) => {
      return tenantsApi.create(values);
    },
    onSuccess: () => {
      message.success('租户创建成功，已自动初始化内置角色');
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setCreateOpen(false);
      setTimeout(() => createForm.resetFields(), 100);
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { message?: string } }; message?: string };
      message.error(axErr.response?.data?.message ?? '创建失败');
    },
  });

  /** 提交创建表单。 */
  const handleCreate = () => {
    createForm
      .validateFields()
      .then((values) => {
        createMutation.mutate(values);
      })
      .catch(() => {
        /* 校验错误已由 Form 展示 */
      });
  };

  /** 挂起租户。 */
  const suspendMutation = useMutation({
    mutationFn: (id: string) => tenantsApi.suspend(id),
    onSuccess: () => {
      message.success('租户已挂起');
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { message?: string } }; message?: string };
      message.error(axErr.response?.data?.message ?? '操作失败');
    },
  });

  /** 激活租户。 */
  const activateMutation = useMutation({
    mutationFn: (id: string) => tenantsApi.activate(id),
    onSuccess: () => {
      message.success('租户已激活');
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
    onError: (err: unknown) => {
      const axErr = err as { response?: { data?: { message?: string } }; message?: string };
      message.error(axErr.response?.data?.message ?? '操作失败');
    },
  });

  /** 状态标签。 */
  const statusTag = (status: string) => {
    const map: Record<string, { color: string; text: string }> = {
      ACTIVE: { color: 'green', text: '运行中' },
      SUSPENDED: { color: 'orange', text: '已挂起' },
      ARCHIVED: { color: 'default', text: '已归档' },
    };
    const cfg = map[status] ?? { color: 'default', text: status };
    return <Tag color={cfg.color}>{cfg.text}</Tag>;
  };

  /** 行操作菜单。 */
  const getActionItems = (tenant: TenantSummary): MenuProps['items'] => {
    const items: NonNullable<MenuProps['items']> = [
      {
        key: 'detail',
        label: '查看详情',
        onClick: () => navigate(`/platform/tenants/${tenant.id}`),
      },
    ];
    if (tenant.status === 'ACTIVE') {
      items.push({
        key: 'suspend',
        label: '挂起租户',
        danger: true,
        onClick: () => {
          Modal.confirm({
            title: '挂起租户',
            content: `确定要挂起租户「${tenant.name}」吗？挂起后该租户用户将无法登录。`,
            okText: '确认挂起',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => suspendMutation.mutate(tenant.id),
          });
        },
      });
    } else if (tenant.status === 'SUSPENDED') {
      items.push({
        key: 'activate',
        label: '激活租户',
        onClick: () => activateMutation.mutate(tenant.id),
      });
    }
    return items;
  };

  const columns = [
    {
      title: '租户名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: TenantSummary) => (
        <Space>
          <Text strong>{name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            / {record.slug}
          </Text>
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      render: (v: string | null) => v ?? '—',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => statusTag(status),
    },
    {
      title: '用户数',
      dataIndex: 'userCount',
      key: 'userCount',
      render: (v: number) => (
        <Space>
          <UserOutlined />
          {v}
        </Space>
      ),
    },
    {
      title: '应用数',
      dataIndex: 'appCount',
      key: 'appCount',
      render: (v: number) => (
        <Space>
          <AppstoreOutlined />
          {v}
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => new Date(v).toLocaleDateString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: TenantSummary) => (
        <Dropdown menu={{ items: getActionItems(record) }} placement="bottomRight">
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
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
          <Space size={8}>
            <ThunderboltFilled style={{ fontSize: 20, color: '#1677ff' }} />
            <Text strong style={{ fontSize: 16 }}>
              aPaaS Studio
            </Text>
          </Space>
          <Text type="secondary" style={{ fontSize: 13 }}>
            <GlobalOutlined /> 平台管理
          </Text>
        </Space>
        <Button
          type="text"
          onClick={() => {
            localStorage.removeItem('apaas:token');
            localStorage.removeItem('apaas:user');
            navigate('/login', { replace: true });
          }}
        >
          退出登录
        </Button>
      </div>

      {/* ── 内容区 ── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px' }}>
        <Card style={{ marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>
            <GlobalOutlined /> 租户管理
          </Title>
          <Text type="secondary">
            管理平台上的所有租户。创建租户时自动初始化内置角色（TENANT_ADMIN / BUILDER /
            END_USER）及权限规则。
          </Text>
        </Card>

        <Card>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <Title level={5} style={{ margin: 0 }}>
              租户列表
            </Title>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              创建租户
            </Button>
          </div>
          <Table
            columns={columns}
            dataSource={tenants}
            rowKey="id"
            loading={isLoading}
            pagination={{ pageSize: 20 }}
          />
        </Card>
      </div>

      {/* ── 创建租户弹窗 ── */}
      <Modal
        title="创建租户"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setCreateOpen(false)}>
            取消
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={createMutation.isPending}
            onClick={handleCreate}
          >
            创建
          </Button>,
        ]}
      >
        <Form form={createForm} layout="vertical" preserve={false}>
          <Form.Item
            label="租户名称"
            name="name"
            rules={[{ required: true, message: '请输入租户名称' }]}
          >
            <Input placeholder="如：某某科技有限公司" />
          </Form.Item>
          <Form.Item
            label="租户标识"
            name="slug"
            rules={[
              { required: true, message: '请输入租户标识' },
              { pattern: /^[a-z0-9-]+$/, message: '仅允许小写字母、数字、连字符' },
            ]}
          >
            <Input placeholder="如：acme-corp（用于登录路径 /t/acme-corp/login）" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="可选，租户用途说明" />
          </Form.Item>
        </Form>
        <div style={{ marginTop: 8, padding: '8px 12px', background: '#f6f8fa', borderRadius: 6 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            创建后将自动初始化 TENANT_ADMIN / BUILDER / END_USER 三个内置角色及 23 条权限规则。
            创建后请在租户详情中分配租户管理员。
          </Text>
        </div>
      </Modal>
    </div>
  );
}
