/**
 * 页面列表 —— 列表项与创建弹窗已拆分至 ./page-list/
 * （AGENTS.md 单文件 400 行规范）。
 */

import { useMemo, useState } from 'react';
import { Button, Empty, Form, Input, List, Skeleton, Typography, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { pagesApi } from '../../api/pages.js';
import { PageListItem } from './page-list/PageListItem.js';
import { CreatePageModal, type CreatePageFormValues } from './page-list/CreatePageModal.js';

const { Title } = Typography;

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

  /** 创建页面（R1.7 第二轮：统一产出 amis 空页 scaffold，v1 模板已退役）。 */
  const createMutation = useMutation({
    mutationFn: async (data: CreatePageFormValues) => {
      // 能力口径 = amis 原生：页面内容在 amis-editor 画布中搭建，
      // 不再预生成 v1 模板（v1 渲染轨已下线，模板产出不可渲染）
      const schema: Record<string, unknown> = {
        type: 'page',
        title: data.name,
        body: [],
      };
      return pagesApi.create(appId as string, {
        name: data.name,
        apiName: data.slug,
        type: data.type,
        objectId: data.objectId,
        schema: schema as never,
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
