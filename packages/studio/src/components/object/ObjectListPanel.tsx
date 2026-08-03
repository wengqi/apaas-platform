import { useMemo, useState } from 'react';
import {
  Button,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Skeleton,
  Space,
  Tag,
  Typography,
  Popconfirm,
  message,
} from 'antd';
import { PlusOutlined, DatabaseOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { objectsApi, type CreateObjectRequest, type ObjectInfo } from '../../api/objects.js';

const { Text } = Typography;

/** 创建对象表单值。 */
interface CreateObjectFormValues {
  apiName: string;
  label: string;
  description?: string;
  icon?: string;
}

interface ObjectListPanelProps {
  appId: string;
}

/**
 * 对象列表(左栏)。
 * 展示当前应用下所有对象,支持搜索、新建对象,点击选中后路由同步。
 */
export default function ObjectListPanel({ appId }: ObjectListPanelProps) {
  const navigate = useNavigate();
  const { objectId } = useParams<{ objectId: string }>();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<CreateObjectFormValues>();

  /** 加载对象列表。 */
  const { data: objects, isLoading } = useQuery({
    queryKey: ['objects', appId],
    queryFn: () => objectsApi.list(appId),
  });

  /** 按关键字过滤(匹配名称或 API 名)。 */
  const filtered = useMemo(() => {
    if (!objects) return [];
    const kw = keyword.trim().toLowerCase();
    if (!kw) return objects;
    return objects.filter(
      (o) =>
        o.label.toLowerCase().includes(kw) || o.apiName.toLowerCase().includes(kw),
    );
  }, [objects, keyword]);

  /** 创建对象。 */
  const createMutation = useMutation({
    mutationFn: (data: CreateObjectRequest) => objectsApi.create(appId, data),
    onSuccess: (obj) => {
      message.success('对象创建成功');
      queryClient.invalidateQueries({ queryKey: ['objects', appId] });
      setCreateOpen(false);
      form.resetFields();
      // 创建后自动选中并进入详情
      navigate(`/app/${appId}/objects/${obj.id}`);
    },
    onError: (err) => {
      const axErr = err as {
        response?: { data?: { error?: { message?: string } }; message?: string };
        message?: string;
      };
      message.error(
        axErr.response?.data?.error?.message ?? axErr.message ?? '创建失败,请重试',
      );
    },
  });

  /** 提交创建表单。 */
  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      createMutation.mutate({
        apiName: values.apiName,
        label: values.label,
        description: values.description,
        icon: values.icon,
      });
    } catch {
      /* 校验错误已由 Form 展示 */
    }
  };

  /** 删除对象。 */
  const deleteMutation = useMutation({
    mutationFn: (objectId: string) => objectsApi.delete(objectId),
    onSuccess: () => {
      message.success('对象已删除');
      queryClient.invalidateQueries({ queryKey: ['objects', appId] });
      // 如果删除的是当前选中的对象，返回对象列表
      if (objectId) {
        navigate(`/app/${appId}/objects`, { replace: true });
      }
    },
    onError: (err) => {
      const axErr = err as {
        response?: { data?: { message?: string; error?: { message?: string } } };
        message?: string;
      };
      message.error(
        axErr.response?.data?.message ?? axErr.response?.data?.error?.message ?? axErr.message ?? '删除失败',
      );
    },
  });

  return (
    <div
      style={{
        width: 264,
        flexShrink: 0,
        background: '#fff',
        border: '1px solid #eef0f4',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 标题行 */}
      <div
        style={{
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f2f5',
        }}
      >
        <Typography.Title level={5} style={{ margin: 0 }}>
          对象
        </Typography.Title>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setCreateOpen(true)}
        >
          新建对象
        </Button>
      </div>

      {/* 搜索框 */}
      <div style={{ padding: '8px 16px 8px' }}>
        <Input.Search
          placeholder="搜索对象"
          allowClear
          size="small"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      {/* 列表 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: 16 }}>
            <Skeleton active avatar paragraph={{ rows: 1 }} />
            <Skeleton active avatar paragraph={{ rows: 1 }} style={{ marginTop: 16 }} />
          </div>
        ) : filtered.length === 0 ? (
          <Empty
            description={keyword ? '未找到匹配对象' : '还没有对象'}
            style={{ padding: '40px 0' }}
          >
            {!keyword && (
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => setCreateOpen(true)}
              >
                创建第一个对象
              </Button>
            )}
          </Empty>
        ) : (
          <List
            dataSource={filtered}
            renderItem={(obj) => (
              <ObjectListItem
                obj={obj}
                selected={obj.id === objectId}
                onClick={() => navigate(`/app/${appId}/objects/${obj.id}`)}
                onDelete={() => deleteMutation.mutate(obj.id)}
                deleting={deleteMutation.isPending}
              />
            )}
          />
        )}
      </div>

      {/* 创建对象弹窗 */}
      <Modal
        title="新建对象"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={createMutation.isPending}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form<CreateObjectFormValues>
          form={form}
          layout="vertical"
          initialValues={{ icon: '📦' }}
          preserve={false}
        >
          <Form.Item
            label="显示名称"
            name="label"
            rules={[{ required: true, message: '请输入显示名称' }]}
          >
            <Input placeholder="客户" />
          </Form.Item>
          <Form.Item
            label="API 名称"
            name="apiName"
            tooltip="小写下划线,应用内唯一,如 customer"
            rules={[
              { required: true, message: '请输入 API 名称' },
              {
                pattern: /^[a-z][a-z0-9_]*$/,
                message: '仅支持小写字母、数字、下划线,且以字母开头',
              },
            ]}
          >
            <Input placeholder="customer" style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="对象简介(可选)" />
          </Form.Item>
          <Form.Item label="图标" name="icon" tooltip="输入一个 emoji 或文本">
            <Input placeholder="📦" maxLength={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

/** 单个对象列表项。 */
function ObjectListItem({
  obj,
  selected,
  onClick,
  onDelete,
  deleting,
}: {
  obj: ObjectInfo;
  selected: boolean;
  onClick: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 14px',
        cursor: 'pointer',
        borderBottom: '1px solid #f5f6f8',
        background: selected ? '#e6f4ff' : undefined,
        borderLeft: selected ? '3px solid #1677ff' : '3px solid transparent',
        transition: 'background 0.2s ease',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = '#fafbfc';
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* 对象图标块 */}
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #1677ff, #1677ffdd)',
            color: '#fff',
            fontSize: 15,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {obj.icon ?? <DatabaseOutlined />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space size={6} align="center" style={{ width: '100%' }}>
            <Text strong ellipsis style={{ fontSize: 14, maxWidth: 120 }}>
              {obj.label}
            </Text>
            {obj.isSystem && (
              <Tag color="default" style={{ margin: 0, fontSize: 11, lineHeight: '18px' }}>
                系统
              </Tag>
            )}
          </Space>
          <div
            style={{
              fontSize: 12,
              color: 'rgba(0,0,0,0.45)',
              fontFamily: 'monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {obj.apiName}
          </div>
        </div>
        {obj.fieldCount !== undefined && (
          <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
            {obj.fieldCount}字段
          </Text>
        )}
        {/* 删除按钮 — 系统对象不显示 */}
        {!obj.isSystem && (
          <Popconfirm
            title="删除对象"
            description={`确定要删除对象「${obj.label}」吗？删除后不可恢复，对象下的所有字段和数据将一并删除。`}
            okText="确认删除"
            okType="danger"
            cancelText="取消"
            onConfirm={(e) => {
              e?.stopPropagation();
              onDelete();
            }}
            onCancel={(e) => e?.stopPropagation()}
          >
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={deleting}
              onClick={(e) => e.stopPropagation()}
              style={{ flexShrink: 0, opacity: 0.6 }}
            />
          </Popconfirm>
        )}
      </div>
    </div>
  );
}
