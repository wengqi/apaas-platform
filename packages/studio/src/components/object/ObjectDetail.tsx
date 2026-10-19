import { Skeleton, Space, Tabs, Tag, Tooltip, Typography, message } from 'antd';
import { appTileBackground, TOKENS as T } from '@apaas/shared/design';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { useParams } from 'react-router-dom';
import { objectsApi, type UpdateObjectRequest } from '../../api/objects.js';
import FieldTable from './FieldTable.js';
import ViewListPanel from './ViewListPanel.js';
import RecordList from './RecordList.js';

const { Title, Paragraph, Text } = Typography;

/**
 * 对象详情(右栏)。
 * 头部展示对象基本信息(名称 / 描述可内联编辑),Tabs 切换字段 / 视图。
 */
export default function ObjectDetail() {
  const { appId, objectId } = useParams<{ appId: string; objectId: string }>();
  const queryClient = useQueryClient();

  /** 加载对象详情(含字段)。 */
  const { data: object, isLoading } = useQuery({
    queryKey: qk.object(objectId!),
    queryFn: () => objectsApi.get(appId as string, objectId as string),
    enabled: !!objectId,
  });

  /** 更新对象(内联编辑)。 */
  const updateMutation = useMutation({
    mutationFn: (data: UpdateObjectRequest) =>
      objectsApi.update(appId as string, objectId as string, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.object(objectId!) });
      queryClient.invalidateQueries({ queryKey: qk.appObjects(appId!) });
    },
    onError: (err) => showError(err),
  });

  if (isLoading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if (!object || !appId) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Text type="secondary">对象不存在或无权访问。</Text>
      </div>
    );
  }

  /** 名称内联保存。 */
  const handleLabelChange = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === object.label) return;
    updateMutation.mutate({ name: trimmed });
  };

  /** 描述内联保存。 */
  const handleDescChange = (value: string) => {
    if (value === (object.description ?? '')) return;
    updateMutation.mutate({ description: value });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 对象头部 */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* 图标块 */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: appTileBackground(),
            color: T.colorWhite,
            fontSize: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 4px 12px rgba(22,119,255,0.25)',
          }}
        >
          {object.icon ?? '📦'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Space size={10} align="center" wrap>
            <Title
              level={4}
              style={{ margin: 0 }}
              editable={{
                onChange: handleLabelChange,
                tooltip: '点击编辑名称',
                triggerType: ['text'],
              }}
            >
              {object.label}
            </Title>
            <Tooltip title="API 名创建后不可修改">
              <Text
                code
                style={{ fontSize: 13, fontFamily: 'monospace', color: 'rgba(0,0,0,0.45)' }}
              >
                {object.apiName}
              </Text>
            </Tooltip>
            <Tag color={object.isSystem ? 'default' : 'blue'} style={{ margin: 0 }}>
              {object.isSystem ? '系统' : '自定义'}
            </Tag>
          </Space>

          <Paragraph
            type="secondary"
            style={{ marginTop: 6, marginBottom: 0 }}
            editable={{
              onChange: handleDescChange,
              tooltip: '点击编辑描述',
            }}
          >
            {object.description || '点击添加描述'}
          </Paragraph>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        defaultActiveKey="fields"
        style={{ marginTop: 20, flex: 1, minHeight: 0 }}
        items={[
          {
            key: 'fields',
            label: '字段',
            children: <FieldTable key={object.id} object={object} appId={appId} />,
          },
          {
            key: 'views',
            label: '视图',
            children: <ViewListPanel objectId={object.id} fields={object.fields} />,
          },
          {
            key: 'records',
            label: '数据',
            children: <RecordList key={object.id} object={object} />,
          },
        ]}
      />
    </div>
  );
}

/** 统一错误提示。 */
function showError(err: unknown) {
  const axErr = err as {
    response?: { data?: { error?: { message?: string } }; message?: string };
    message?: string;
  };
  message.error(axErr.response?.data?.error?.message ?? axErr.message ?? '操作失败,请重试');
}
