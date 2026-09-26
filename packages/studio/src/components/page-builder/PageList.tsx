import { useMemo, useState } from 'react';
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
  Typography,
  message,
} from 'antd';
import {
  PlusOutlined,
  UnorderedListOutlined,
  ProfileOutlined,
  FormOutlined,
  DashboardOutlined,
  LayoutOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { pagesApi, type PageMeta, type PageType } from '../../api/pages.js';
import { objectsApi } from '../../api/objects.js';
import { createDefaultSchema } from '../../stores/pageBuilder.js';
import { PAGE_TYPE_OPTIONS } from '../../constants/pageComponents.js';
import { generatePageTemplate, pageTypeRequiresObject } from './templates.js';

const { Text, Title } = Typography;

/** 页面类型 → 图标映射。 */
const PAGE_TYPE_ICONS: Record<string, typeof LayoutOutlined> = {
  list_page: UnorderedListOutlined,
  detail_page: ProfileOutlined,
  form_page: FormOutlined,
  dashboard: DashboardOutlined,
  custom: LayoutOutlined,
};

/** 页面类型 → 中文标签。 */
const PAGE_TYPE_LABELS: Record<string, string> = {
  list_page: '列表页',
  detail_page: '详情页',
  form_page: '表单页',
  dashboard: '仪表盘',
  custom: '自定义',
};

/** 创建页面表单值。 */
interface CreatePageFormValues {
  name: string;
  slug: string;
  type: PageType;
  objectId?: string;
}

interface PageListProps {
  appId?: string;
}

/**
 * 页面列表。
 * 展示当前应用下所有页面,支持搜索、新建,点击进入搭建器。
 * appId 优先取 props,其次取路由参数。
 */
export default function PageList({ appId: propAppId }: PageListProps = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams<{ appId: string }>();
  const appId = propAppId ?? params.appId;
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<CreatePageFormValues>();

  /** 加载页面列表。 */
  const { data: pages, isLoading } = useQuery({
    queryKey: qk.appPages(appId!),
    queryFn: () => pagesApi.list(appId as string),
    enabled: !!appId,
  });

  /** 按关键字过滤。 */
  const filtered = useMemo(() => {
    if (!pages) return [];
    const kw = keyword.trim().toLowerCase();
    if (!kw) return pages;
    return pages.filter(
      (p) => p.name.toLowerCase().includes(kw) || p.apiName.toLowerCase().includes(kw),
    );
  }, [pages, keyword]);

  /** 创建页面(根据类型 + 对象自动生成模板)。 */
  const createMutation = useMutation({
    mutationFn: async (data: CreatePageFormValues) => {
      // 列表/详情/表单页:拉取对象字段,生成模板;其他:空白 Schema
      let schema = createDefaultSchema(data.type);
      if (data.objectId && pageTypeRequiresObject(data.type)) {
        const objectMeta = await objectsApi.get(data.objectId);
        schema = generatePageTemplate(data.type, objectMeta);
      }
      return pagesApi.create(appId as string, {
        name: data.name,
        apiName: data.slug,
        type: data.type,
        objectId: data.objectId,
        schema,
      });
    },
    onSuccess: (page) => {
      message.success('页面创建成功');
      queryClient.invalidateQueries({ queryKey: qk.appPages(appId!) });
      setCreateOpen(false);
      form.resetFields();
      navigate(`/app/${appId}/pages/${page.id}`);
    },
    onError: (err) => {
      const axErr = err as {
        response?: { data?: { error?: { message?: string } }; message?: string };
        message?: string;
      };
      message.error(axErr.response?.data?.error?.message ?? axErr.message ?? '创建失败,请重试');
    },
  });

  /** 删除页面。 */
  const deleteMutation = useMutation({
    mutationFn: (pageId: string) => pagesApi.delete(pageId),
    onSuccess: () => {
      message.success('页面已删除');
      queryClient.invalidateQueries({ queryKey: qk.appPages(appId!) });
    },
    onError: (err) => {
      const axErr = err as {
        response?: { data?: { error?: { message?: string } }; message?: string };
        message?: string;
      };
      message.error(axErr.response?.data?.error?.message ?? axErr.message ?? '删除失败,请重试');
    },
  });

  /** 提交创建表单。 */
  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      createMutation.mutate(values);
    } catch {
      /* 校验错误已由 Form 展示 */
    }
  };

  return (
    <div>
      {/* 标题行 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          页面
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建页面
        </Button>
      </div>

      {/* 搜索框 */}
      <div style={{ marginBottom: 12 }}>
        <Input.Search
          placeholder="搜索页面名称或 API 名"
          allowClear
          size="middle"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ width: 300 }}
        />
      </div>

      {/* 页面列表 */}
      {isLoading ? (
        <div style={{ padding: 16 }}>
          <Skeleton active avatar paragraph={{ rows: 1 }} />
          <Skeleton active avatar paragraph={{ rows: 1 }} style={{ marginTop: 16 }} />
        </div>
      ) : filtered.length === 0 ? (
        <Empty
          description={keyword ? '未找到匹配页面' : '还没有页面'}
          style={{ padding: '60px 0' }}
        >
          {!keyword && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              创建第一个页面
            </Button>
          )}
        </Empty>
      ) : (
        <List
          dataSource={filtered}
          renderItem={(page) => (
            <PageListItem
              page={page}
              onClick={() => navigate(`/app/${appId}/pages/${page.id}`)}
              onDelete={() => deleteMutation.mutate(page.id)}
              deleting={deleteMutation.isPending}
            />
          )}
        />
      )}

      {/* 创建页面弹窗 */}
      <CreatePageModal
        open={createOpen}
        form={form}
        appId={appId}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={createMutation.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 页面列表项
// ---------------------------------------------------------------------------

function PageListItem({
  page,
  onClick,
  onDelete,
  deleting,
}: {
  page: PageMeta;
  onClick: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const Icon = PAGE_TYPE_ICONS[page.type] ?? LayoutOutlined;
  const typeLabel = PAGE_TYPE_LABELS[page.type] ?? page.type;

  return (
    <List.Item
      style={{
        padding: '12px 0',
        cursor: 'pointer',
        borderBottom: '1px solid #f0f2f5',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = '#fafbfc';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
        {/* 图标块 */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #1677ff, #1677ffdd)',
            color: '#fff',
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon />
        </div>

        {/* 名称 + slug */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space size={8} align="center">
            <Text strong style={{ fontSize: 14 }}>
              {page.name}
            </Text>
            <Tag style={{ margin: 0, fontSize: 11 }}>{typeLabel}</Tag>
            {page.published ? (
              <Tag color="success" style={{ margin: 0, fontSize: 11 }}>
                已发布
              </Tag>
            ) : (
              <Tag color="default" style={{ margin: 0, fontSize: 11 }}>
                草稿
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
            {page.apiName}
          </div>
        </div>

        {/* 操作 */}
        <Popconfirm
          title="删除页面"
          description={`确定删除页面「${page.name}」吗?删除后不可恢复。`}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
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
          />
        </Popconfirm>
      </div>
    </List.Item>
  );
}

// ---------------------------------------------------------------------------
// 创建页面弹窗
// ---------------------------------------------------------------------------

function CreatePageModal({
  open,
  form,
  appId,
  onCancel,
  onOk,
  confirmLoading,
}: {
  open: boolean;
  form: ReturnType<typeof Form.useForm<CreatePageFormValues>>[0];
  appId?: string;
  onCancel: () => void;
  onOk: () => void;
  confirmLoading: boolean;
}) {
  /** 加载对象列表(供关联对象选择)。 */
  const { data: objects } = useQuery({
    queryKey: qk.appObjects(appId!),
    queryFn: () => objectsApi.list(appId as string),
    enabled: open && !!appId,
  });

  const objectOptions = (objects ?? []).map((obj) => ({
    label: obj.name,
    value: obj.id,
  }));

  /** 监听页面类型变化,决定关联对象是否必填。 */
  const pageType = Form.useWatch('type', form);
  const requiresObject = pageTypeRequiresObject(pageType ?? 'custom');

  return (
    <Modal
      title="新建页面"
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={confirmLoading}
      okText="创建"
      cancelText="取消"
      destroyOnHidden
    >
      <Form<CreatePageFormValues>
        form={form}
        layout="vertical"
        initialValues={{ type: 'custom' as PageType }}
        preserve={false}
      >
        <Form.Item
          label="页面名称"
          name="name"
          rules={[{ required: true, message: '请输入页面名称' }]}
        >
          <Input placeholder="客户列表页" />
        </Form.Item>
        <Form.Item
          label="API 名称"
          name="slug"
          tooltip="小写下划线,应用内唯一,如 customer_list"
          rules={[
            { required: true, message: '请输入 API 名称' },
            {
              pattern: /^[a-z][a-z0-9_]*$/,
              message: '仅支持小写字母、数字、下划线,且以字母开头',
            },
          ]}
        >
          <Input placeholder="customer_list" style={{ fontFamily: 'monospace' }} />
        </Form.Item>
        <Form.Item label="页面类型" name="type" rules={[{ required: true }]}>
          <Select options={PAGE_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item
          label="关联对象"
          name="objectId"
          tooltip={
            requiresObject
              ? '列表/详情/表单页需要关联一个对象,将自动生成模板'
              : '自定义页可不关联对象'
          }
          rules={requiresObject ? [{ required: true, message: '该页面类型需要关联对象' }] : []}
        >
          <Select
            showSearch
            allowClear
            placeholder={requiresObject ? '选择对象(必选)' : '选择对象(可选)'}
            optionFilterProp="label"
            options={objectOptions}
            notFoundContent={objects ? '暂无对象' : '加载中...'}
          />
        </Form.Item>
        {requiresObject && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            将基于所选对象的字段自动生成页面模板,可在搭建器中进一步编辑。
          </Text>
        )}
      </Form>
    </Modal>
  );
}
