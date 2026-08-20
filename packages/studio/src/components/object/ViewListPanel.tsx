import { useState } from 'react';
import {
  Button,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  PlusOutlined,
  SettingOutlined,
  DeleteOutlined,
  FilterOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  objectsApi,
  type CreateViewRequest,
  type Field,
  type ViewConfig,
  type ViewInfo,
  type ViewType,
} from '../../api/objects.js';
import ViewConfigurator from './ViewConfigurator.js';

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
  /** 对象字段列表(视图配置器需要) */
  fields: Field[];
}

/** 创建视图表单值。 */
interface CreateViewFormValues {
  name: string;
  type: ViewType;
  isDefault?: boolean;
}

/**
 * 视图列表 + 新建视图 + 视图配置。
 * 每个视图项展示类型标签与筛选/排序摘要,支持配置(打开 ViewConfigurator)与删除。
 */
export default function ViewListPanel({ objectId, fields }: ViewListPanelProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [configView, setConfigView] = useState<ViewInfo | undefined>(undefined);
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

  /** 删除视图。 */
  const deleteMutation = useMutation({
    mutationFn: (viewId: string) => objectsApi.deleteView(viewId),
    onSuccess: () => {
      message.success('视图已删除');
      queryClient.invalidateQueries({ queryKey: ['object', objectId, 'views'] });
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
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
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
                  <Space size={4}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {formatTime(view.updatedAt)}
                    </Text>
                    <Tooltip title="配置">
                      <Button
                        type="text"
                        size="small"
                        icon={<SettingOutlined />}
                        onClick={() => setConfigView(view)}
                      />
                    </Tooltip>
                    <Popconfirm
                      title="删除视图"
                      description={`确定删除视图「${view.name}」吗?`}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => deleteMutation.mutate(view.id)}
                    >
                      <Tooltip title="删除">
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                      </Tooltip>
                    </Popconfirm>
                  </Space>
                </Space>
                {/* 配置摘要 */}
                <ViewConfigSummary config={view.config as ViewConfig | undefined} />
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

      {/* 视图配置器 */}
      <ViewConfigurator
        open={!!configView}
        view={configView}
        fields={fields}
        onClose={() => setConfigView(undefined)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 视图配置摘要
// ---------------------------------------------------------------------------

/** 展示视图的筛选/排序/字段配置摘要(行内小标签)。 */
function ViewConfigSummary({ config }: { config: ViewConfig | undefined }) {
  if (!config) {
    return (
      <Text type="secondary" style={{ fontSize: 12 }}>
        未配置
      </Text>
    );
  }

  const parts: React.ReactNode[] = [];

  // 筛选摘要
  const hasFilters = config.filters && Object.keys(config.filters).length > 0;
  if (hasFilters) {
    parts.push(
      <Tag key="filter" icon={<FilterOutlined />} color="blue" style={{ margin: 0, fontSize: 11 }}>
        已配置筛选
      </Tag>,
    );
  }

  // 排序摘要
  const sortCount = config.sorts?.length ?? 0;
  if (sortCount > 0) {
    parts.push(
      <Tag
        key="sort"
        icon={<SortAscendingOutlined />}
        color="geekblue"
        style={{ margin: 0, fontSize: 11 }}
      >
        {sortCount} 个排序
      </Tag>,
    );
  }

  // 字段显隐摘要
  const fieldCount = config.fields?.length ?? 0;
  if (fieldCount > 0) {
    parts.push(
      <Tag key="fields" color="purple" style={{ margin: 0, fontSize: 11 }}>
        显示 {fieldCount} 字段
      </Tag>,
    );
  }

  if (parts.length === 0) {
    return (
      <Text type="secondary" style={{ fontSize: 12 }}>
        未配置
      </Text>
    );
  }

  return <Space size={6}>{parts}</Space>;
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
