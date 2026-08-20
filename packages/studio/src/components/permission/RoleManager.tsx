/**
 * 角色管理 — 左角色列表 + 右角色详情(成员+权限规则)。
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Empty,
  Input,
  List,
  Modal,
  Space,
  Tag,
  Typography,
  message,
  Popconfirm,
  Form,
} from 'antd';
import { PlusOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import { rolesApi, type Role, type CreateRoleRequest } from '../../api/permissions.js';
import PermissionRuleEditor from './PermissionRuleEditor.js';

const { Text, Title } = Typography;

export default function RoleManager() {
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<CreateRoleRequest>();

  const { data: roles, isLoading } = useQuery({
    queryKey: ['permission-roles'],
    queryFn: () => rolesApi.list(),
  });

  const selectedRole = roles?.find((r) => r.id === selectedRoleId) ?? roles?.[0] ?? null;

  const createMutation = useMutation({
    mutationFn: (data: CreateRoleRequest) => rolesApi.create(data),
    onSuccess: () => {
      message.success('角色创建成功');
      setCreateOpen(false);
      form.resetFields();
      void queryClient.invalidateQueries({ queryKey: ['permission-roles'] });
    },
    onError: () => message.error('创建失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => rolesApi.delete(id),
    onSuccess: () => {
      message.success('已删除');
      setSelectedRoleId(null);
      void queryClient.invalidateQueries({ queryKey: ['permission-roles'] });
    },
    onError: () => message.error('删除失败'),
  });

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: 16, gap: 16 }}>
      {/* 左栏:角色列表 */}
      <div
        style={{
          width: 300,
          flexShrink: 0,
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #eef0f4',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #eef0f4',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Title level={5} style={{ margin: 0 }}>
            角色
          </Title>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            新建
          </Button>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: 16 }}>
              <Text type="secondary">加载中...</Text>
            </div>
          ) : !roles || roles.length === 0 ? (
            <Empty style={{ marginTop: 40 }} description="暂无角色" />
          ) : (
            <List
              dataSource={roles}
              renderItem={(role) => (
                <List.Item
                  style={{
                    padding: '10px 16px',
                    cursor: 'pointer',
                    background: selectedRole?.id === role.id ? '#f0f5ff' : 'transparent',
                    borderLeft:
                      selectedRole?.id === role.id ? '3px solid #1677ff' : '3px solid transparent',
                  }}
                  onClick={() => setSelectedRoleId(role.id)}
                >
                  <div style={{ width: '100%' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Text strong>{role.name}</Text>
                      {role.isBuiltIn && (
                        <Tag color="blue" style={{ fontSize: 11 }}>
                          内置
                        </Tag>
                      )}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {role.code}
                    </Text>
                  </div>
                </List.Item>
              )}
            />
          )}
        </div>
      </div>

      {/* 右栏:角色详情 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {selectedRole ? (
          <RoleDetail role={selectedRole} onDelete={() => deleteMutation.mutate(selectedRole.id)} />
        ) : (
          <Card
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Empty description="选择一个角色查看详情" />
          </Card>
        )}
      </div>

      {/* 创建角色弹窗 */}
      <Modal
        title="新建角色"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(data) => createMutation.mutate(data)}>
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="如:审批人" />
          </Form.Item>
          <Form.Item
            name="code"
            label="角色编码"
            rules={[{ required: true, message: '请输入角色编码' }]}
          >
            <Input placeholder="如:APPROVER (大写字母+下划线)" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="角色职责说明" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 角色详情
// ---------------------------------------------------------------------------

function RoleDetail({ role, onDelete }: { role: Role; onDelete: () => void }) {
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const { data: users } = useQuery({
    queryKey: ['role-users', role.id],
    queryFn: () => rolesApi.getUsers(role.id),
    enabled: !!role.id,
  });
  const { data: rules } = useQuery({
    queryKey: ['role-rules', role.id],
    queryFn: () => rolesApi.getRules(role.id),
    enabled: !!role.id,
  });

  return (
    <Card
      style={{ height: '100%' }}
      title={
        <Space>
          <span>{role.name}</span>
          <Tag>{role.code}</Tag>
          {role.isBuiltIn && <Tag color="blue">内置</Tag>}
        </Space>
      }
      extra={
        <Space>
          <Button size="small" icon={<SettingOutlined />} onClick={() => setRuleEditorOpen(true)}>
            编辑规则
          </Button>
          {!role.isBuiltIn && (
            <Popconfirm title="确定删除此角色?" onConfirm={onDelete}>
              <Button danger size="small" icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      }
    >
      <div style={{ marginBottom: 24 }}>
        <Title level={5}>成员 ({users?.length ?? 0})</Title>
        {users && users.length > 0 ? (
          <Space wrap>
            {users.map((u) => (
              <Tag key={u.id} style={{ padding: '4px 12px' }}>
                {u.name} ({u.email})
              </Tag>
            ))}
          </Space>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无成员" />
        )}
      </div>

      <div>
        <Title level={5}>权限规则 ({rules?.length ?? 0})</Title>
        {rules && rules.length > 0 ? (
          <List
            size="small"
            dataSource={rules}
            renderItem={(rule) => (
              <List.Item>
                <Space>
                  <Tag color={rule.effect === 'DENY' ? 'red' : 'green'}>{rule.effect}</Tag>
                  <Tag color="purple">{rule.type}</Tag>
                  <Tag>{rule.action}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {rule.targetId === '*' ? '所有对象' : rule.targetId}
                  </Text>
                  {rule.condition && (
                    <Tag color="orange" style={{ fontSize: 11 }}>
                      行级条件
                    </Tag>
                  )}
                </Space>
              </List.Item>
            )}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无权限规则" />
        )}
      </div>

      <PermissionRuleEditor
        open={ruleEditorOpen}
        role={role}
        onClose={() => setRuleEditorOpen(false)}
      />
    </Card>
  );
}
