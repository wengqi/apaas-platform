import { useState } from 'react';
import { Button, Form, Modal, Space, Typography, message } from 'antd';
import {
  AppstoreAddOutlined,
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qk, useAuthStore } from '@apaas/shared/stores';
import { appsApi, type AppSummary, type CreateAppRequest } from '../api/apps.js';
import AppGrid, { AppCard } from './app-list/AppCard.js';
import { type CreateFormValues } from './app-list/constants.js';
import { CreateAppModal, EditAppModal } from './app-list/AppFormModals.js';
import AppHeader from './app-list/AppHeader.js';

const { Title, Text } = Typography;

/**
 * 应用列表页 —— 登录后的首页。
 * 卡片网格展示租户内所有应用，支持创建应用。
 */
export default function AppList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<AppSummary | null>(null);
  const [form] = Form.useForm<CreateFormValues>();

  /** 加载应用列表。 */
  const { data: apps, isLoading } = useQuery({
    queryKey: qk.apps(),
    queryFn: () => appsApi.list(),
  });

  /** 创建应用。 */
  const createMutation = useMutation({
    mutationFn: (data: CreateAppRequest) => appsApi.create(data),
    onSuccess: (app) => {
      // A 旅程（2026-10-03）：创建后停留列表页,新手不知道下一步——直接进入新应用工作台
      message.success('应用创建成功');
      queryClient.invalidateQueries({ queryKey: qk.apps() });
      setCreateOpen(false);
      form.resetFields();
      if (app?.id) navigate(`/app/${app.id}/dashboard`);
    },
    onError: (err) => {
      const axErr = err as {
        response?: { data?: { error?: { message?: string } }; message?: string };
        message?: string;
      };
      message.error(axErr.response?.data?.error?.message ?? axErr.message ?? '创建失败，请重试');
    },
  });

  /** 删除应用。 */
  const deleteMutation = useMutation({
    mutationFn: (appId: string) => appsApi.delete(appId),
    onSuccess: () => {
      message.success('应用已删除');
      queryClient.invalidateQueries({ queryKey: qk.apps() });
    },
    onError: (err) => {
      const axErr = err as {
        response?: { data?: { message?: string; error?: { message?: string } } };
        message?: string;
      };
      const errMsg =
        axErr.response?.data?.message ??
        axErr.response?.data?.error?.message ??
        axErr.message ??
        '删除失败，请重试';
      message.error(errMsg, 5);
    },
  });

  /** 归档应用。 */
  const archiveMutation = useMutation({
    mutationFn: (appId: string) => appsApi.archive(appId),
    onSuccess: () => {
      message.success('应用已归档');
      queryClient.invalidateQueries({ queryKey: qk.apps() });
    },
    onError: (err) => {
      const axErr = err as {
        response?: { data?: { message?: string; error?: { message?: string } } };
        message?: string;
      };
      const errMsg =
        axErr.response?.data?.message ??
        axErr.response?.data?.error?.message ??
        axErr.message ??
        '归档失败，请重试';
      message.error(errMsg, 5);
    },
  });

  /** 编辑应用（更新元数据：名称/描述/图标/主题色）。 */
  const updateMutation = useMutation({
    mutationFn: ({ appId, data }: { appId: string; data: Partial<CreateAppRequest> }) =>
      appsApi.update(appId, data),
    onSuccess: () => {
      message.success('应用信息已更新');
      queryClient.invalidateQueries({ queryKey: qk.apps() });
      setEditingApp(null);
      form.resetFields();
    },
    onError: (err) => {
      const axErr = err as {
        response?: { data?: { message?: string; error?: { message?: string } } };
        message?: string;
      };
      const errMsg =
        axErr.response?.data?.message ??
        axErr.response?.data?.error?.message ??
        axErr.message ??
        '更新失败，请重试';
      message.error(errMsg, 5);
    },
  });

  /** 卡片更多操作菜单 — 按状态显示不同操作。 */
  const cardMenuItems = (app: AppSummary): MenuProps['items'] => {
    const items: MenuProps['items'] = [];
    items.push({
      key: 'edit',
      icon: <EditOutlined />,
      label: '编辑应用',
    });
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
    if (info.key === 'edit') {
      setEditingApp(app);
      form.setFieldsValue({
        apiName: app.apiName,
        name: app.name,
        description: app.description,
        icon: app.icon,
        color: app.color,
      });
    } else if (info.key === 'delete') {
      Modal.confirm({
        title: '删除应用',
        content:
          app.status === 'ARCHIVED'
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

  /** 提交编辑表单。 */
  const handleEdit = async () => {
    if (!editingApp) return;
    try {
      const values = await form.validateFields();
      updateMutation.mutate({
        appId: editingApp.id,
        data: {
          name: values.name,
          description: values.description,
          icon: values.icon,
          color: values.color,
        },
      });
    } catch {
      /* 校验错误已由 Form 展示 */
    }
  };

  /** 点击应用卡片跳转工作台。 */
  const openApp = (app: AppSummary) => {
    navigate(`/app/${app.id}/dashboard`);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <AppHeader
        isPlatformAdmin={Boolean(user?.isPlatformAdmin)}
        isTenantAdmin={Boolean(user?.roles?.some((r) => r.code === 'TENANT_ADMIN'))}
        userName={user?.name ?? user?.email ?? '用户'}
        userAvatar={user?.avatar ?? undefined}
        onNavigate={navigate}
        onLogout={() => {
          logout();
          navigate('/login', { replace: true });
        }}
      />

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
              onClick={() => queryClient.invalidateQueries({ queryKey: qk.apps() })}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<AppstoreAddOutlined />}
              onClick={() => {
                form.resetFields();
                setCreateOpen(true);
              }}
            >
              创建应用
            </Button>
          </Space>
        </Space>

        {/* 应用卡片网格（骨架/空状态/卡片布局见 app-list/AppCard.tsx） */}
        <AppGrid
          apps={apps}
          isLoading={isLoading}
          onCreate={() => {
            form.resetFields();
            setCreateOpen(true);
          }}
          renderCard={(app) => (
            <AppCard
              app={app}
              menuItems={cardMenuItems(app)}
              onMenuClick={(info) => handleCardMenuClick(app, info)}
              onOpen={() => openApp(app)}
            />
          )}
        />
      </div>

      {/* ── 创建 / 编辑应用弹窗（见 app-list/AppFormModals.tsx） ── */}
      <CreateAppModal
        open={createOpen}
        form={form}
        confirmLoading={createMutation.isPending}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
      />
      <EditAppModal
        app={editingApp}
        form={form}
        confirmLoading={updateMutation.isPending}
        onCancel={() => {
          setEditingApp(null);
          form.resetFields();
        }}
        onOk={handleEdit}
      />
    </div>
  );
}
