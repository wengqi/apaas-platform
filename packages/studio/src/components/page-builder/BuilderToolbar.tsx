import {
  Button,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  UndoOutlined,
  RedoOutlined,
  EyeOutlined,
  EditOutlined,
  SaveOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import { pagesApi } from '../../api/pages.js';
import { PAGE_TYPE_OPTIONS } from '../../constants/pageComponents.js';

const { Text } = Typography;

/**
 * 搭建器工具栏(顶部,吸顶)。
 * 返回 / 页面名称(内联编辑) / 页面类型 / 撤销重做 / 编辑预览切换 / 保存 / 发布。
 */
export default function BuilderToolbar() {
  const navigate = useNavigate();
  const { appId, pageId } = useParams<{ appId: string; pageId: string }>();
  const queryClient = useQueryClient();

  const currentPage = usePageBuilderStore((s) => s.currentPage);
  const mode = usePageBuilderStore((s) => s.mode);
  const canUndo = usePageBuilderStore((s) => s.past.length > 0);
  const canRedo = usePageBuilderStore((s) => s.future.length > 0);
  const updatePageMeta = usePageBuilderStore((s) => s.updatePageMeta);
  const undo = usePageBuilderStore((s) => s.undo);
  const redo = usePageBuilderStore((s) => s.redo);
  const setMode = usePageBuilderStore((s) => s.setMode);

  /** 保存页面(Schema + 元数据)。 */
  const saveMutation = useMutation({
    mutationFn: () => {
      const state = usePageBuilderStore.getState();
      if (!state.currentPage || !state.schema) {
        throw new Error('页面数据未加载');
      }
      return pagesApi.update(state.currentPage.id, {
        name: state.currentPage.name,
        schema: state.schema,
      });
    },
    onSuccess: (updatedPage) => {
      message.success('保存成功');
      if (pageId) {
        queryClient.setQueryData(['page', pageId], updatedPage);
      }
    },
    onError: (err) => {
      const axErr = err as {
        response?: { data?: { error?: { message?: string } }; message?: string };
        message?: string;
      };
      message.error(axErr.response?.data?.error?.message ?? axErr.message ?? '保存失败,请重试');
    },
  });

  /** 发布页面(先保存再发布)。 */
  const publishMutation = useMutation({
    mutationFn: async () => {
      const state = usePageBuilderStore.getState();
      if (!state.currentPage || !state.schema) {
        throw new Error('页面数据未加载');
      }
      const pageIdVal = state.currentPage.id;
      await pagesApi.update(pageIdVal, {
        name: state.currentPage.name,
        schema: state.schema,
      });
      return pagesApi.publish(pageIdVal);
    },
    onSuccess: (publishedPage) => {
      message.success('发布成功');
      updatePageMeta({ published: true });
      if (pageId) {
        queryClient.setQueryData(['page', pageId], publishedPage);
      }
    },
    onError: (err) => {
      const axErr = err as {
        response?: { data?: { error?: { message?: string } }; message?: string };
        message?: string;
      };
      message.error(axErr.response?.data?.error?.message ?? axErr.message ?? '发布失败,请重试');
    },
  });

  return (
    <div
      style={{
        height: 48,
        flexShrink: 0,
        background: '#fff',
        borderBottom: '1px solid #eef0f4',
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      {/* 左侧:返回 + 页面名 + 类型 */}
      <Space size={12} align="center">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(`/app/${appId}/pages`)}
          style={{ fontSize: 13 }}
        >
          返回
        </Button>
        <Text strong style={{ fontSize: 15, maxWidth: 200 }} ellipsis>
          {currentPage?.name ?? '未命名页面'}
        </Text>
        {currentPage?.published && (
          <Tag color="success" style={{ margin: 0, fontSize: 11 }}>
            已发布
          </Tag>
        )}
        <Select
          size="small"
          value={currentPage?.type}
          onChange={(v) => updatePageMeta({ type: v })}
          style={{ width: 110 }}
          options={PAGE_TYPE_OPTIONS}
        />
      </Space>

      {/* 右侧:撤销重做 + 编辑预览 + 保存 + 发布 */}
      <Space size={8} align="center">
        <Tooltip title="撤销">
          <Button
            type="text"
            size="small"
            icon={<UndoOutlined />}
            disabled={!canUndo}
            onClick={undo}
          />
        </Tooltip>
        <Tooltip title="重做">
          <Button
            type="text"
            size="small"
            icon={<RedoOutlined />}
            disabled={!canRedo}
            onClick={redo}
          />
        </Tooltip>

        <Segmented
          size="small"
          value={mode}
          onChange={(v) => {
            // 切换模式:
            // - 切到 preview:Canvas 以 mode 为 key 重新挂载 RuntimeStoreProvider,
            //   自动初始化 vm 并触发 autoQuery 数据加载。
            // - 切回 edit:Provider 卸载,运行时状态随之清理。
            setMode(v as 'edit' | 'preview');
          }}
          options={[
            { label: '编辑', value: 'edit', icon: <EditOutlined /> },
            { label: '预览', value: 'preview', icon: <EyeOutlined /> },
          ]}
        />

        <Button
          icon={<SaveOutlined />}
          loading={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          保存
        </Button>

        <Popconfirm
          title="发布页面"
          description="发布后用户即可访问此页面,确定发布吗?"
          okText="发布"
          cancelText="取消"
          onConfirm={() => publishMutation.mutate()}
        >
          <Button type="primary" icon={<RocketOutlined />} loading={publishMutation.isPending}>
            发布
          </Button>
        </Popconfirm>
      </Space>
    </div>
  );
}
