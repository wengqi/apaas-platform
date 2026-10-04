/**
 * 用户管理 — 用户列表 + 创建/编辑用户。
 */

import { useState } from 'react';
import { apiErrorMessage } from '../../api/client.js';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
  Form,
  Select,
  Popconfirm,
} from 'antd';
import { PlusOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import {
  usersApi,
  rolesApi,
  orgsApi,
  type UserInfo,
  type CreateUserRequest,
} from '../../api/permissions.js';

const { Text, Title: _Title } = Typography;

export default function UserManager() {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<CreateUserRequest>();

  const { data: users, isLoading } = useQuery({
    queryKey: ['permission-users', keyword],
    queryFn: () => usersApi.list(keyword ? { keyword } : undefined),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateUserRequest) => usersApi.create(data),
    onSuccess: () => {
      message.success('用户创建成功');
      setCreateOpen(false);
      form.resetFields();
      void queryClient.invalidateQueries({ queryKey: ['permission-users'] });
    },
    onError: (err) => message.error(apiErrorMessage(err, '创建失败')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      message.success('已删除');
      void queryClient.invalidateQueries({ queryKey: ['permission-users'] });
    },
    onError: (err) => message.error(apiErrorMessage(err, '删除失败')),
  });

  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '角色',
      key: 'roles',
      render: (_: unknown, record: UserInfo) => (
        <Space wrap>
          {record.roles?.map((r) => (
            <Tag key={r.id} color="blue">
              {r.name}
            </Tag>
          )) || <Text type="secondary">无</Text>}
        </Space>
      ),
    },
    {
      title: '组织',
      key: 'orgs',
      render: (_: unknown, record: UserInfo) => (
        <Space wrap>
          {record.orgMemberships?.map((m: { org: { name: string } }) => (
            <Tag key={m.org.name}>{m.org.name}</Tag>
          )) || <Text type="secondary">无</Text>}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'ACTIVE' ? 'green' : 'default'}>
          {status === 'ACTIVE' ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: UserInfo) => (
        <Popconfirm title="确定删除此用户?" onConfirm={() => deleteMutation.mutate(record.id)}>
          <Button danger size="small" icon={<DeleteOutlined />}>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ flex: 1, minHeight: 0, padding: 16 }}>
      <Card
        style={{ height: '100%' }}
        title={
          <Space>
            <Input
              placeholder="搜索用户名/邮箱"
              prefix={<SearchOutlined />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: 240 }}
              allowClear
            />
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建用户
          </Button>
        }
      >
        <Table
          dataSource={users}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: <Empty description="暂无用户" /> }}
        />
      </Card>

      {/* 创建用户弹窗 */}
      <CreateUserModal
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        form={form}
        onSubmit={(data) => createMutation.mutate(data)}
        loading={createMutation.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 创建用户弹窗
// ---------------------------------------------------------------------------

function CreateUserModal({
  open,
  onCancel,
  form,
  onSubmit,
  loading,
}: {
  open: boolean;
  onCancel: () => void;
  form: ReturnType<typeof Form.useForm<CreateUserRequest>>[0];
  onSubmit: (data: CreateUserRequest) => void;
  loading: boolean;
}) {
  const { data: roles } = useQuery({
    queryKey: ['permission-roles'],
    queryFn: () => rolesApi.list(),
  });
  const { data: orgTree } = useQuery({
    queryKey: ['permission-orgs'],
    queryFn: () => orgsApi.getTree(),
  });

  // 扁平化组织树
  const orgOptions: { label: string; value: string }[] = [];
  const flattenOrgs = (nodes: { id: string; name: string; children?: unknown[] }[]) => {
    for (const n of nodes) {
      orgOptions.push({ label: n.name, value: n.id });
      if (n.children) flattenOrgs(n.children as never);
    }
  };
  if (orgTree) flattenOrgs(orgTree as never);

  return (
    <Modal
      title="新建用户"
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      confirmLoading={loading}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
          <Input placeholder="如:张三" />
        </Form.Item>
        <Form.Item
          name="email"
          label="邮箱"
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '邮箱格式不正确' },
          ]}
        >
          <Input placeholder="如:zhangsan@example.com" />
        </Form.Item>
        <Form.Item
          name="password"
          label="密码"
          rules={[
            { required: true, message: '请输入密码' },
            { min: 6, message: '密码至少6位' },
          ]}
        >
          <Input.Password placeholder="至少6位" />
        </Form.Item>
        <Form.Item name="roleIds" label="角色">
          <Select
            mode="multiple"
            placeholder="选择角色"
            options={roles?.map((r) => ({ label: r.name, value: r.id }))}
          />
        </Form.Item>
        <Form.Item name="orgIds" label="组织">
          <Select mode="multiple" placeholder="选择组织" options={orgOptions} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
