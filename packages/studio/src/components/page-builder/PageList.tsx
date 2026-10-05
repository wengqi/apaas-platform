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
import { processesApi } from '../../api/processes.js';
import { PageListItem } from './page-list/PageListItem.js';
import { CreatePageModal, type CreatePageFormValues } from './page-list/CreatePageModal.js';
import {
  buildPageTemplate,
  collectWritebackFields,
  supportsTemplate,
} from '../../utils/page-template.js';
import { objectsApi } from '../../api/objects.js';

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

  /** 创建页面（QA 交互评审 2026-10-03：表单/列表页基于关联对象字段自动生成
   * amis 模板，兑现 CreatePageModal 的承诺；其余类型保持空白 scaffold，
   * 模板进入画布后仍可自由编辑——能力口径 = amis 原生）。 */
  const createMutation = useMutation({
    mutationFn: async (data: CreatePageFormValues) => {
      let schema: Record<string, unknown> = { type: 'page', title: data.name, body: [] };
      let obj: Awaited<ReturnType<typeof objectsApi.get>> | null = null;
      // 双视角评审（2026-10-04）：提交表单不得包含流程回写字段（如审批状态），
      // 否则申请人可自选"已批准"直接提交。生成前从应用全部流程 schema 提取回写字段。
      let excludeFields: string[] = [];
      if (data.type === 'form_page' && data.objectId && appId) {
        try {
          const processes = await processesApi.list(appId);
          const schemas = await Promise.all(
            processes.map((p) =>
              processesApi
                .get(p.id)
                .then((d) => d.workflowSchema)
                .catch(() => undefined),
            ),
          );
          excludeFields = collectWritebackFields(schemas);
        } catch {
          // 流程读取失败不阻塞建页——模板仍生成，回写字段过滤尽力而为
        }
      }
      if (data.objectId && supportsTemplate(data.type)) {
        obj = await objectsApi.get(data.objectId);
        schema = buildPageTemplate(data.type, obj, data.name, { excludeFields });
        if (excludeFields.length > 0 && data.type === 'form_page') {
          const labelOf = (apiName: string) =>
            obj?.fields?.find((f) => f.apiName === apiName)?.label ?? apiName;
          message.info(`已从表单排除流程回写字段：${excludeFields.map(labelOf).join('、')}`);
        }
      }
      const page = await pagesApi.create(appId as string, {
        name: data.name,
        apiName: data.slug,
        type: data.type,
        objectId: data.objectId,
        schema: schema as never,
      });
      // 成对生成台账页（交互评审 2026-10-04 P0：反馈环三断之三——申请人进度视图）。
      // 表单页默认配台账列表页，提交人不再"提交后石沉大海"。
      if (data.type === 'form_page' && data.withLedger !== false && data.objectId && obj) {
        const ledgerName = `${obj.name}台账`;
        try {
          await pagesApi.create(appId as string, {
            name: ledgerName,
            apiName: `${data.slug}_ledger`,
            type: 'list_page',
            objectId: data.objectId,
            schema: buildPageTemplate('list_page', obj, ledgerName) as never,
          });
          message.success(`已同步生成台账页「${ledgerName}」`);
        } catch {
          // 主页面已建成，台账失败不回滚——显式提示手动补救
          message.warning('台账页创建失败，可稍后在页面列表手动创建');
        }
      }
      return page;
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
