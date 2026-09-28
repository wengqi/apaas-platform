import { useEffect, useState } from 'react';
import {
  Button,
  Input,
  Modal,
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
  SettingOutlined,
  ReloadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  GlobalOutlined,
  CodeOutlined,
  HistoryOutlined,
  DesktopOutlined,
  TabletOutlined,
  MobileOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { qk } from '@apaas/shared/stores';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import { pagesApi } from '../../api/pages.js';
import { PAGE_TYPE_OPTIONS } from '../../constants/pageComponents.js';
import { GlobalCodeModal, I18nModal } from './builder-toolbar/BuilderToolbarModals.js';
import { HistoryDrawer } from './HistoryDrawer.js';

const { Text } = Typography;

/** 画布缩放边界与步长（对齐飞书「自动（96%）」）。 */
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

/**
 * 设计器顶栏 — 对齐飞书 aPaaS：返回 + 页面名/状态（左）·
 * 缩放/撤销重做/设置/刷新页面（中）· 预览/保存/发布（右）。
 */
export default function BuilderToolbar() {
  const navigate = useNavigate();
  const { appId, pageId } = useParams<{ appId: string; pageId: string }>();
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const currentPage = usePageBuilderStore((s) => s.currentPage);
  const mode = usePageBuilderStore((s) => s.mode);
  // 评审 P2-5：脏状态派生（schema/元数据 vs 已保存快照）。
  // 订阅 schema 与 savedSnapshot 以便二者变化时重算/重渲染。
  usePageBuilderStore((s) => s.schema);
  usePageBuilderStore((s) => s.savedSnapshot);
  const isDirty = usePageBuilderStore((s) => s.isDirty());
  const canUndo = usePageBuilderStore((s) => s.past.length > 0);
  const canRedo = usePageBuilderStore((s) => s.future.length > 0);
  const updatePageMeta = usePageBuilderStore((s) => s.updatePageMeta);
  const undo = usePageBuilderStore((s) => s.undo);
  const redo = usePageBuilderStore((s) => s.redo);
  const setMode = usePageBuilderStore((s) => s.setMode);
  const loadPage = usePageBuilderStore((s) => s.loadPage);
  const canvasZoom = usePageBuilderStore((s) => s.canvasZoom);
  const setCanvasZoom = usePageBuilderStore((s) => s.setCanvasZoom);
  const canvasWidth = usePageBuilderStore((s) => s.canvasWidth);
  const setCanvasWidth = usePageBuilderStore((s) => s.setCanvasWidth);
  const [i18nOpen, setI18nOpen] = useState(false);
  const [globalCodeOpen, setGlobalCodeOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

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
      usePageBuilderStore.getState().markSaved();
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
      usePageBuilderStore.getState().markSaved();
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

  /** 评审 P2-5：离开前确认未保存修改（此前静默丢失编辑）。 */
  const handleBack = () => {
    const go = () => navigate(`/app/${appId}/pages`);
    if (!isDirty) {
      go();
      return;
    }
    Modal.confirm({
      title: '存在未保存的修改',
      content: '离开后当前页面编辑将丢失，是否继续？',
      okText: '放弃修改并离开',
      cancelText: '留在本页',
      okButtonProps: { danger: true },
      onOk: go,
    });
  };

  /** 刷新页面：放弃本地修改并从服务端重载（脏状态需确认）。 */
  const handleReload = () => {
    const doReload = () => {
      if (!pageId) return;
      void queryClient
        .fetchQuery({ queryKey: qk.page(pageId), queryFn: () => pagesApi.get(pageId) })
        .then((fresh) => {
          loadPage(fresh);
          message.success('已从服务端重新加载');
        })
        .catch(() => message.error('重新加载失败'));
    };
    if (!isDirty) {
      doReload();
      return;
    }
    Modal.confirm({
      title: '存在未保存的修改',
      content: '刷新页面将放弃本地未保存的修改，是否继续？',
      okText: '放弃并刷新',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: doReload,
    });
  };

  // 评审 P2-5：浏览器关闭/刷新拦截
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (usePageBuilderStore.getState().isDirty()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  return (
    <div
      style={{
        height: 48,
        flexShrink: 0,
        background: '#fff',
        borderBottom: '1px solid #e5e6eb',
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
      {/* 左侧:返回 + 页面名 + 状态 */}
      <Space size={8} align="center" style={{ flex: 1, minWidth: 0 }}>
        <Button
          type="text"
          size="small"
          icon={<ArrowLeftOutlined />}
          onClick={handleBack}
          title="返回页面列表"
        />
        <Text strong style={{ fontSize: 14, maxWidth: 200 }} ellipsis>
          {currentPage?.name ?? '未命名页面'}
        </Text>
        {currentPage?.published ? (
          <Tag color="success" style={{ margin: 0, fontSize: 11 }}>
            已发布
          </Tag>
        ) : null}
        <Text type="secondary" style={{ fontSize: 12 }}>
          {isDirty ? '未保存' : '已保存'}
        </Text>
      </Space>

      {/* 中部:缩放（对应飞书「自动（96%）」）+ 撤销重做 + 设置 + 刷新 */}
      <Space size={4} align="center">
        <Segmented
          size="small"
          value={canvasWidth === null ? 'desktop' : String(canvasWidth)}
          onChange={(v) => setCanvasWidth(v === 'desktop' ? null : Number(v))}
          options={[
            {
              label: (
                <Tooltip title="桌面 960">
                  <DesktopOutlined />
                </Tooltip>
              ),
              value: 'desktop',
            },
            {
              label: (
                <Tooltip title="平板 768">
                  <TabletOutlined />
                </Tooltip>
              ),
              value: '768',
            },
            {
              label: (
                <Tooltip title="手机 375">
                  <MobileOutlined />
                </Tooltip>
              ),
              value: '375',
            },
          ]}
        />
        <div style={{ width: 1, height: 18, background: '#e5e6eb', margin: '0 6px' }} />
        <Tooltip title="缩小画布">
          <Button
            type="text"
            size="small"
            icon={<ZoomOutOutlined />}
            disabled={canvasZoom <= MIN_ZOOM}
            onClick={() => setCanvasZoom(Math.max(MIN_ZOOM, canvasZoom - ZOOM_STEP))}
          />
        </Tooltip>
        <Tooltip title="缩放（点两侧按钮调整）">
          <Text type="secondary" style={{ fontSize: 12, minWidth: 40, textAlign: 'center' }}>
            {Math.round(canvasZoom * 100)}%
          </Text>
        </Tooltip>
        <Tooltip title="放大画布">
          <Button
            type="text"
            size="small"
            icon={<ZoomInOutlined />}
            disabled={canvasZoom >= MAX_ZOOM}
            onClick={() => setCanvasZoom(Math.min(MAX_ZOOM, canvasZoom + ZOOM_STEP))}
          />
        </Tooltip>
        <div style={{ width: 1, height: 18, background: '#e5e6eb', margin: '0 6px' }} />
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
        <Button
          type="text"
          size="small"
          icon={<SettingOutlined />}
          onClick={() => setSettingsOpen(true)}
        >
          设置
        </Button>
        <Tooltip title="放弃本地修改并从服务端重新加载">
          <Button type="text" size="small" icon={<ReloadOutlined />} onClick={handleReload}>
            刷新页面
          </Button>
        </Tooltip>
        <Button
          type="text"
          size="small"
          icon={<GlobalOutlined />}
          onClick={() => setI18nOpen(true)}
        >
          多语
        </Button>
        <Button
          type="text"
          size="small"
          icon={<CodeOutlined />}
          onClick={() => setGlobalCodeOpen(true)}
        >
          全局代码
        </Button>
      </Space>

      <I18nModal open={i18nOpen} onClose={() => setI18nOpen(false)} />
      <GlobalCodeModal open={globalCodeOpen} onClose={() => setGlobalCodeOpen(false)} />
      {pageId && (
        <HistoryDrawer pageId={pageId} open={historyOpen} onClose={() => setHistoryOpen(false)} />
      )}

      {/* 右侧:编辑预览 + 历史 + 保存 + 发布 */}
      <Space size={8} align="center" style={{ flex: 1, justifyContent: 'flex-end' }}>
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
        <Tooltip title="历史保存点">
          <Button
            icon={<HistoryOutlined />}
            size="small"
            disabled={mode !== 'edit'}
            onClick={() => setHistoryOpen(true)}
          >
            历史
          </Button>
        </Tooltip>
        <Button
          icon={<SaveOutlined />}
          size="small"
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
          <Button
            type="primary"
            size="small"
            icon={<RocketOutlined />}
            loading={publishMutation.isPending}
          >
            发布
          </Button>
        </Popconfirm>
      </Space>

      {/* 页面设置弹窗（对应飞书「设置」） */}
      <PageSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/** 页面设置弹窗：名称 / ID(apiName) / 类型。 */
function PageSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const currentPage = usePageBuilderStore((s) => s.currentPage);
  const updatePageMeta = usePageBuilderStore((s) => s.updatePageMeta);

  if (!currentPage) return null;

  return (
    <Modal
      title="页面设置"
      open={open}
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          完成
        </Button>
      }
      width={480}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Text style={{ fontSize: 13 }}>页面名称</Text>
          <Input
            value={currentPage.name}
            onChange={(e) => updatePageMeta({ name: e.target.value })}
            placeholder="请输入页面名称"
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Text style={{ fontSize: 13 }}>API 名称（ID）</Text>
          <Input
            value={currentPage.apiName}
            onChange={(e) => updatePageMeta({ apiName: e.target.value })}
            placeholder="页面 URL 地址拼接用"
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            ID 用于页面 URL 地址的拼接与权限判断。
          </Text>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Text style={{ fontSize: 13 }}>页面类型</Text>
          <Select
            value={currentPage.type}
            onChange={(v) => updatePageMeta({ type: v })}
            options={PAGE_TYPE_OPTIONS}
            style={{ width: 200 }}
          />
        </label>
      </div>
    </Modal>
  );
}
