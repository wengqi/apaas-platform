import { useState } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Skeleton,
  Space,
  Tag,
  Typography,
  ColorPicker,
  Dropdown,
  Avatar,
  Popconfirm,
  message,
} from 'antd';
import {
  AppstoreAddOutlined,
  DatabaseOutlined,
  LayoutOutlined,
  ApartmentOutlined,
  ReloadOutlined,
  LogoutOutlined,
  UserOutlined,
  ThunderboltFilled,
  DeleteOutlined,
  MoreOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth.js';
import { appsApi, type AppSummary, type CreateAppRequest } from '../api/apps.js';

const { Title, Paragraph, Text } = Typography;

/** 应用状态 → Tag 颜色映射。 */
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  PUBLISHED: 'green',
  ARCHIVED: 'red',
};

/** 应用状态 → 中文标签。 */
const STATUS_LABEL: Record<string, string> = {
  DRAFT: '开发中',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
};

/** 创建应用表单值。 */
interface CreateFormValues {
  apiName?: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

/**
 * 应用列表页 —— 登录后的首页。
 * 卡片网格展示租户内所有应用，支持创建应用。
 */
export default function AppList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<CreateFormValues>();

  /** 加载应用列表。 */
  const { data: apps, isLoading } = useQuery({
    queryKey: ['apps'],
    queryFn: () => appsApi.list(),
  });

  /** 创建应用。 */
  const createMutation = useMutation({
    mutationFn: (data: CreateAppRequest) => appsApi.create(data),
    onSuccess: () => {
      message.success('应用创建成功');
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      setCreateOpen(false);
      form.resetFields();
    },
    onError: (err) => {
      const axErr = err as {
        response?: { data?: { error?: { message?: string } }; message?: string };
        message?: string;
      };
      message.error(
        axErr.response?.data?.error?.message ?? axErr.message ?? '创建失败，请重试',
      );
    },
  });

  /** 删除应用。 */
  const deleteMutation = useMutation({
    mutationFn: (appId: string) => appsApi.delete(appId),
    onSuccess: () => {
      message.success('应用已删除');
      queryClient.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: (err) => {
      const axErr = err as {
        response?: { data?: { error?: { message?: string } }; message?: string };
        message?: string;
      };
      message.error(
        axErr.response?.data?.error?.message ?? axErr.message ?? '删除失败，请重试',
      );
    },
  });

  /** 归档应用。 */
  const archiveMutation = useMutation({
    mutationFn: (appId: string) => appsApi.archive(appId),
    onSuccess: () => {
      message.success('应用已归档');
      queryClient.invalidateQueries({ queryKey: ['apps'] });
    },
    onError: (err) => {
      const axErr = err as {
        response?: { data?: { error?: { message?: string } }; message?: string };
        message?: string;
      };
      message.error(
        axErr.response?.data?.error?.message ?? axErr.message ?? '归档失败，请重试',
      );
    },
  });

  /** 卡片更多操作菜单 — 按状态显示不同操作。 */
  const cardMenuItems = (app: AppSummary): MenuProps['items'] => {
    const items: MenuProps['items'] = [];
    if (app.status === 'PUBLISHED') {
      items.push({
        key: 'archive',
        icon: <InboxOutlined />,
        label: '归档应用',
      });
    }
    if (app.status === 'DRAFT' || app.status === 'ARCHIVED') {
      items.push({
        key: 'delete',
        icon: <DeleteOutlined />,
        label: '删除应用',
        danger: true,
      });
    }
    return items;
  };

  /** 处理卡片菜单点击。 */
  const handleCardMenuClick = (app: AppSummary, info: { key: string }) => {
    if (info.key === 'delete') {
      Modal.confirm({
        title: '删除应用',
        content: app.status === 'ARCHIVED'
          ? `确定要彻底删除已归档应用「${app.name}」吗？删除后不可恢复，应用下的所有数据将一并删除。`
          : `确定要删除应用「${app.name}」吗？删除后不可恢复，应用下的所有对象、页面、流程数据将一并删除。`,
        okText: '确认删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => deleteMutation.mutate(app.id),
      });
    } else if (info.key === 'archive') {
      Modal.confirm({
        title: '归档应用',
        content: `确定要归档应用「${app.name}」吗？归档后运行时不再展示此应用，不可提交新申请。在途流程仍可正常完成。`,
        okText: '确认归档',
        cancelText: '取消',
        onOk: () => archiveMutation.mutate(app.id),
      });
    }
  };

  /** 提交创建表单。 */
  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      createMutation.mutate({
        apiName: values.apiName || undefined,
        name: values.name,
        description: values.description,
        icon: values.icon,
        color: values.color,
      });
    } catch {
      /* 校验错误已由 Form 展示 */
    }
  };

  /** 点击应用卡片跳转工作台。 */
  const openApp = (app: AppSummary) => {
    navigate(`/app/${app.id}/dashboard`);
  };

  /** 用户下拉菜单。 */
  const userMenuItems: MenuProps['items'] = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => {
        logout();
        navigate('/login', { replace: true });
      },
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
        <Space size={8}>
          <ThunderboltFilled style={{ fontSize: 20, color: '#1677ff' }} />
          <Text strong style={{ fontSize: 16 }}>
            aPaaS Studio
          </Text>
        </Space>
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
          <Space style={{ cursor: 'pointer' }}>
            <Avatar
              size="small"
              icon={<UserOutlined />}
              src={user?.avatar ?? undefined}
            />
            <Text style={{ fontSize: 14 }}>
              {user?.name ?? user?.email ?? '用户'}
            </Text>
          </Space>
        </Dropdown>
      </div>

      {/* ── 主内容区 ── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 32px' }}>
        {/* 页头 */}
        <div style={{ marginBottom: 32 }}>
          <Title level={3} style={{ marginBottom: 4 }}>
            我的应用
          </Title>
          <Text type="secondary" style={{ fontSize: 14 }}>
            选择一个应用开始搭建，或创建新应用
          </Text>
        </div>

        {/* 工具栏 */}
        <Space
          style={{
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: 20,
          }}
        >
          <Text type="secondary" style={{ fontSize: 13 }}>
            {apps ? `共 ${apps.length} 个应用` : ''}
          </Text>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => queryClient.invalidateQueries({ queryKey: ['apps'] })}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<AppstoreAddOutlined />}
              onClick={() => setCreateOpen(true)}
            >
              创建应用
            </Button>
          </Space>
        </Space>

        {/* 应用卡片网格 */}
        {isLoading ? (
          <Row gutter={[20, 20]}>
            {[1, 2, 3, 4].map((i) => (
              <Col key={i} xs={24} sm={12} md={8} lg={6}>
                <Card style={{ borderRadius: 12 }}>
                  <Skeleton active avatar paragraph={{ rows: 3 }} />
                </Card>
              </Col>
            ))}
          </Row>
        ) : !apps || apps.length === 0 ? (
          <Card
            style={{
              borderRadius: 12,
              border: '2px dashed #e0e4ea',
              background: '#fff',
            }}
          >
            <Empty
              description="还没有应用"
              style={{ padding: '60px 0' }}
            >
              <Button
                type="primary"
                size="large"
                icon={<AppstoreAddOutlined />}
                onClick={() => setCreateOpen(true)}
              >
                创建第一个应用
              </Button>
            </Empty>
          </Card>
        ) : (
          <Row gutter={[20, 20]}>
            {apps.map((app) => (
              <Col key={app.id} xs={24} sm={12} md={8} lg={6}>
                <Card
                  hoverable
                  onClick={() => openApp(app)}
                  style={{
                    height: '100%',
                    borderRadius: 12,
                    overflow: 'hidden',
                    transition: 'all 0.3s ease',
                    border: '1px solid #eef0f4',
                  }}
                  styles={{
                    body: { padding: 20 },
                  }}
                >
                  {/* 图标 + 名称 + 更多操作 */}
                  <Space align="start" style={{ width: '100%' }}>
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 12,
                        background: `linear-gradient(135deg, ${app.color ?? '#1677ff'}, ${app.color ?? '#1677ff'}dd)`,
                        color: '#fff',
                        fontSize: 26,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: `0 4px 12px ${(app.color ?? '#1677ff')}40`,
                      }}
                    >
                      {app.icon ?? '📦'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        strong
                        style={{ fontSize: 16, display: 'block' }}
                        ellipsis
                      >
                        {app.name}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                        {app.apiName}
                      </Text>
                    </div>
                    <Dropdown
                      menu={{
                        items: cardMenuItems(app),
                        onClick: (info) => {
                          info.domEvent?.stopPropagation();
                          handleCardMenuClick(app, info);
                        },
                      }}
                      placement="bottomRight"
                      trigger={['click']}
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<MoreOutlined />}
                        onClick={(e) => e.stopPropagation()}
                        style={{ flexShrink: 0, color: '#8c8c8c' }}
                      />
                    </Dropdown>
                  </Space>

                  {/* 描述 */}
                  <Paragraph
                    type="secondary"
                    ellipsis={{ rows: 2 }}
                    style={{
                      marginTop: 14,
                      marginBottom: 14,
                      minHeight: 44,
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                  >
                    {app.description || '暂无描述'}
                  </Paragraph>

                  {/* 状态 + 版本 */}
                  <Space
                    style={{
                      justifyContent: 'space-between',
                      width: '100%',
                    }}
                  >
                    <Tag
                      color={STATUS_COLOR[app.status] ?? 'default'}
                      style={{ margin: 0, fontSize: 12 }}
                    >
                      {STATUS_LABEL[app.status] ?? app.status}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      v{app.version}
                    </Text>
                  </Space>

                  {/* 资源统计 */}
                  <div
                    style={{
                      marginTop: 14,
                      paddingTop: 14,
                      borderTop: '1px solid #f0f2f5',
                    }}
                  >
                    <Space
                      size="middle"
                      style={{ fontSize: 12, color: '#8c8c8c' }}
                    >
                      <Space size={4}>
                        <DatabaseOutlined style={{ color: '#1677ff' }} />
                        <span>{app.stats.objects} 对象</span>
                      </Space>
                      <Space size={4}>
                        <LayoutOutlined style={{ color: '#52c41a' }} />
                        <span>{app.stats.pages} 页面</span>
                      </Space>
                      <Space size={4}>
                        <ApartmentOutlined style={{ color: '#fa8c16' }} />
                        <span>{app.stats.processes} 流程</span>
                      </Space>
                    </Space>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </div>

      {/* ── 创建应用弹窗 ── */}
      <Modal
        title="创建应用"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={createMutation.isPending}
        okText="创建"
        cancelText="取消"
        destroyOnClose
        modalRender={(node) => node}
      >
        <Form<CreateFormValues>
          form={form}
          layout="vertical"
          initialValues={{ icon: '📦', color: '#1677ff' }}
          preserve={false}
        >
          <Form.Item
            label="API 名称"
            name="apiName"
            tooltip="小写下划线，租户内唯一，如 asset_management。留空则自动生成。"
            rules={[
              {
                pattern: /^[a-z][a-z0-9_]*$/,
                message: '仅支持小写字母、数字、下划线，且以字母开头',
              },
            ]}
          >
            <Input placeholder="留空则自动生成" />
          </Form.Item>
          <Form.Item
            label="显示名称"
            name="name"
            rules={[{ required: true, message: '请输入显示名称' }]}
          >
            <Input placeholder="资产管理" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="应用简介（可选）" />
          </Form.Item>
          <Form.Item label="图标" name="icon" tooltip="输入一个 emoji 或文本">
            <Input placeholder="📦" maxLength={4} />
          </Form.Item>
          <Form.Item
            label="主题色"
            name="color"
            getValueProps={(value) => ({ value: value ?? undefined })}
            getValueFromEvent={(color) => color?.toHexString()}
          >
            <ColorPicker showText format="hex" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
