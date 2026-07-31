import { useState } from 'react';
import {
  Button,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { objectsApi, type CreateViewRequest, type ViewInfo, type ViewType } from '../../api/objects.js';

const { Text } = Typography;

/** 视图类型 → 中文标签。 */
const VIEW_TYPE_LABEL: Record<ViewType, string> = {
  list: '列表',
  detail: '详情',
  form: '表单',
  kanban: '看板',
  calendar: '日历',
  gallery: '画廊',
};

interface ViewListPanelProps {
  objectId: string;
}

/** 创建视图表单值。 */
interface CreateViewFormValues {
  name: string;
  type: ViewType;
  isDefault?: boolean;
}

/**
 * 视图列表(简单列表 + 新建视图)。
 * Phase 1 仅展示视图条目与新建,配置器留待后续。
 */
export default function ViewListPanel({ objectId }: ViewListPanelProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<CreateViewFormValues>();

  /** 加载视图列表。 */
  const { data: views, isLoading } = useQuery({
    queryKey: ['object', objectId, 'views'],
    queryFn: () => objectsApi.listViews(objectId),
  });

  /** 创建视图。 */
  const createMutation = useMutation({
    mutationFn: (data: CreateViewRequest) => objectsApi.createView(objectId, data),
    onSuccess: () => {
      message.success('视图创建成功');
      queryClient.invalidateQueries({ queryKey: ['object', objectId, 'views'] });
      setCreateOpen(false);
      form.resetFields();
    },
    onError: (err) => showError(err),
  });

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      createMutation.mutate({
        name: values.name,
        type: values.type,
        isDefault: values.isDefault,
      });
    } catch {
      /* 校验错误已由 Form 展示 */
    }
  };

  return (
    <div>
      {/* 工具栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Text type="secondary" style={{ fontSize: 13 }}>
          {views ? `共 ${views.length} 个视图` : ''}
        </Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建视图
        </Button>
      </div>

      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : !views || views.length === 0 ? (
        <Empty description="还没有视图" style={{ padding: '60px 0' }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            创建第一个视图
          </Button>
        </Empty>
      ) : (
        <List
          bordered
          dataSource={views}
          renderItem={(view) => (
            <List.Item>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space size={10}>
                  <Text strong>{view.name}</Text>
                  <Tag color="blue" style={{ margin: 0 }}>
                    {VIEW_TYPE_LABEL[view.type] ?? view.type}
                  </Tag>
                  {view.isDefault && (
                    <Tag color="green" style={{ margin: 0 }}>
                      默认
                    </Tag>
                  )}
                </Space>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  更新于 {formatTime(view.updatedAt)}
                </Text>
              </Space>
            </List.Item>
          )}
        />
      )}

      {/* 新建视图弹窗 */}
      <Modal
        title="新建视图"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={createMutation.isPending}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form<CreateViewFormValues>
          form={form}
          layout="vertical"
          initialValues={{ type: 'list', isDefault: false }}
          preserve={false}
        >
          <Form.Item
            label="视图名称"
            name="name"
            rules={[{ required: true, message: '请输入视图名称' }]}
          >
            <Input placeholder="如:全部客户" />
          </Form.Item>
          <Form.Item label="视图类型" name="type" rules={[{ required: true }]}>
            <Select
              options={(Object.keys(VIEW_TYPE_LABEL) as ViewType[]).map((t) => ({
                value: t,
                label: VIEW_TYPE_LABEL[t],
              }))}
            />
          </Form.Item>
          <Form.Item name="isDefault" valuePropName="checked" label="设为默认视图">
            <Select
              options={[
                { value: false, label: '否' },
                { value: true, label: '是' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

/** 简易时间格式化(显示「刚刚 / N 分钟前 / N 小时前 / 日期」)。 */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 统一错误提示。 */
function showError(err: unknown) {
  const axErr = err as {
    response?: { data?: { error?: { message?: string } }; message?: string };
    message?: string;
  };
  message.error(axErr.response?.data?.error?.message ?? axErr.message ?? '操作失败,请重试');
}
