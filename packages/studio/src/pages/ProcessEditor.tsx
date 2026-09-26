/**
 * 流程编辑器容器(三栏 + 工具栏)。
 *
 * 路由:/app/:appId/processes/:processId
 * 渲染流程编辑器(SimplifiedEditor,基于 flowgram.ai Free Layout)。
 * 顶部工具栏:返回/流程名/撤销重做/预览/保存/发布。
 * 全屏三栏,撑满 calc(100vh - 56px)(StudioLayout Header)。
 */

import { useEffect, useRef, useState, Component, type ReactNode } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
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
  ArrowLeftOutlined,
  EyeOutlined,
  SaveOutlined,
  SendOutlined,
  UndoOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { processesApi, type ProcessDef, type WorkflowSchema } from '../api/processes.js';
import { objectsApi } from '../api/objects.js';
import { pagesApi } from '../api/pages.js';
import { useProcessEditorStore } from '../stores/processEditor.js';
import { getProcessStatusMeta, getTriggerMeta, TRIGGER_OPTIONS } from '../constants/process.js';
import SimplifiedEditor from '../components/process/SimplifiedEditor.js';

const { Title } = Typography;

export default function ProcessEditor() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { appId, processId } = useParams<{ appId: string; processId: string }>();

  const store = useProcessEditorStore();
  const loadedRef = useRef<string | null>(null);

  /** flowgram 撤销/重做 API(由 SimplifiedEditor 内部 HistoryBridge 暴露)。 */
  const [historyApi, setHistoryApi] = useState<{
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
  } | null>(null);

  /** 加载流程详情。 */
  const { data: processDef, isLoading } = useQuery({
    queryKey: ['process', processId],
    queryFn: () => processesApi.get(processId as string),
    enabled: !!processId,
    retry: 1,
  });

  /** 加载对象列表(配置面板用)。 */
  const { data: objects } = useQuery({
    queryKey: qk.appObjects(appId!),
    queryFn: () => objectsApi.list(appId as string),
    enabled: !!appId,
  });

  const objectOptions = (objects ?? []).map((o) => ({ label: o.name || o.label, value: o.id }));

  /** 加载页面列表(任务表单选择用)。 */
  const { data: pages } = useQuery({
    queryKey: qk.appPages(appId!),
    queryFn: () => pagesApi.list(appId as string),
    enabled: !!appId,
  });

  const formOptions = (pages ?? []).map((p) => ({ label: p.name, value: p.id }));

  /** 加载已发布流程列表（子流程节点选择用，排除自身防自引用）。 */
  const { data: publishedProcesses } = useQuery({
    queryKey: ['processes', appId],
    queryFn: () => processesApi.list(appId as string),
    enabled: !!appId,
  });
  const processOptions = (publishedProcesses ?? [])
    .filter((p) => p.status === 'PUBLISHED' && p.id !== processId)
    .map((p) => ({ label: p.name || p.apiName, value: p.apiName }));

  /** 流程加载成功 → 写入 store(仅当 processId 变化时)。 */
  useEffect(() => {
    if (processDef && processDef.id !== loadedRef.current) {
      // 先重置 store，清除上一个流程的残留状态
      store.reset();
      loadedRef.current = processDef.id;
      store.loadProcess(processDef);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processDef]);

  /** 评审整改：触发器配置弹窗开关 */
  const [triggerOpen, setTriggerOpen] = useState(false);

  /** store 是否已加载当前流程。 */
  const storeLoaded = store.processDef?.id === processId;

  /** 是否只读(已发布)。 */
  const isReadonly = processDef?.status === 'PUBLISHED';

  /** 保存草稿。 */
  const saveMutation = useMutation({
    mutationFn: (data: { workflowSchema?: WorkflowSchema }) =>
      processesApi.update(processId as string, data as never),
    onSuccess: () => {
      message.success('已保存');
      store.markSaved();
      void queryClient.invalidateQueries({ queryKey: ['process', processId] });
    },
    onError: () => message.error('保存失败'),
  });

  /** 发布。 */
  const publishMutation = useMutation({
    mutationFn: () => processesApi.publish(processId as string),
    onSuccess: () => {
      message.success('已发布,生成新版本');
      void queryClient.invalidateQueries({ queryKey: ['process', processId] });
    },
    onError: () => message.error('发布失败'),
  });

  /** Schema 变化(仅更新内存状态,不自动保存)。 */
  const handleSchemaChange = (schema: WorkflowSchema) => {
    if (!storeLoaded) return;
    // FlowGram 导出可能丢失 edges，如果新 schema edges 为空但当前有 edges，保留原 edges
    let finalSchema = schema;
    if (!schema.edges || schema.edges.length === 0) {
      const currentSchema = store.schema ?? processDef?.workflowSchema;
      if (currentSchema?.edges && currentSchema.edges.length > 0) {
        finalSchema = { ...schema, edges: currentSchema.edges };
      }
    }
    // 评审 P1-1：打开已保存流程时，挂载期 reconcile 的首次导出若与已保存
    // 基线内容一致，则不置脏（此前"打开即脏"+撤销栈被污染）
    if (!store.dirty) {
      const baseline = JSON.stringify(processDef?.workflowSchema ?? null);
      if (JSON.stringify(finalSchema) === baseline) {
        store.markSaved();
        return;
      }
    }
    store.setSchema(finalSchema, { skipHistory: true });
  };

  /** 浏览器关闭/刷新时提示未保存。 */
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (store.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [store.dirty]);

  /** 手动保存。 */
  const handleSave = () => {
    if (store.schema) {
      saveMutation.mutate({ workflowSchema: store.schema });
    }
  };

  /** 返回流程列表（有未保存更改时提示）。 */
  const handleBack = () => {
    if (store.dirty) {
      Modal.confirm({
        title: '未保存的更改',
        content: '当前流程有未保存的更改，确定要离开吗？',
        okText: '离开',
        cancelText: '继续编辑',
        onOk: () => navigate(`/app/${appId}/processes`),
      });
    } else {
      navigate(`/app/${appId}/processes`);
    }
  };

  if (isLoading || !storeLoaded) {
    return (
      <div style={{ padding: 24 }}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (!processDef) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Typography.Text type="secondary">流程未找到</Typography.Text>
      </div>
    );
  }

  return (
    <div
      style={{
        height: 'calc(100vh - 56px)',
        display: 'flex',
        flexDirection: 'column',
        background: '#f5f7fa',
      }}
    >
      {/* 工具栏 */}
      <ProcessEditorToolbar
        processDef={processDef}
        readonly={isReadonly}
        dirty={store.dirty}
        onBack={handleBack}
        onSave={handleSave}
        onPublish={() => publishMutation.mutate()}
        saving={saveMutation.isPending}
        publishing={publishMutation.isPending}
        canUndo={historyApi?.canUndo ?? false}
        canRedo={historyApi?.canRedo ?? false}
        onUndo={() => historyApi?.undo()}
        onRedo={() => historyApi?.redo()}
        onConfigureTrigger={() => setTriggerOpen(true)}
      />
      <TriggerConfigModal
        open={triggerOpen}
        processDef={processDef}
        onClose={() => setTriggerOpen(false)}
        onSaved={() => {
          setTriggerOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['process', processId] });
        }}
      />
      {/* 编辑器主体 — key={processId} 确保切换流程时组件重新挂载 */}
      <EditorErrorBoundary key={processId}>
        <SimplifiedEditor
          key={processId}
          initialSchema={store.schema ?? processDef.workflowSchema}
          readonly={isReadonly}
          onSchemaChange={handleSchemaChange}
          objectOptions={objectOptions}
          formOptions={formOptions}
          processOptions={processOptions}
          onHistoryReady={setHistoryApi}
        />
      </EditorErrorBoundary>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 编辑器工具栏
// ---------------------------------------------------------------------------

interface ProcessEditorToolbarProps {
  processDef: ProcessDef;
  readonly: boolean;
  dirty: boolean;
  onBack: () => void;
  onSave: () => void;
  onPublish: () => void;
  saving: boolean;
  publishing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** 评审整改：触发器配置入口（此前创建后无法配置触发器） */
  onConfigureTrigger: () => void;
}

function ProcessEditorToolbar({
  processDef,
  readonly,
  dirty,
  onBack,
  onSave,
  onPublish,
  saving,
  publishing,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onConfigureTrigger,
}: ProcessEditorToolbarProps) {
  const statusMeta = getProcessStatusMeta(processDef.status);
  const triggerMeta = getTriggerMeta(processDef.triggerType as string | undefined);
  const TriggerIcon = triggerMeta.icon;

  return (
    <div
      style={{
        height: 48,
        padding: '0 16px',
        background: '#fff',
        borderBottom: '1px solid #eef0f4',
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* 左侧:返回 + 流程名 */}
      <Space size={12}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} />
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${triggerMeta.color}, ${triggerMeta.color}dd)`,
            color: '#fff',
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TriggerIcon style={{ fontSize: 16 }} />
        </div>
        <Space size={6} align="center">
          <Title level={5} style={{ margin: 0 }}>
            {processDef.name}
          </Title>
          <Tag color={statusMeta.tagColor}>{statusMeta.label}</Tag>
          <Tooltip title="配置触发器">
            <Tag color="blue" style={{ cursor: 'pointer', margin: 0 }} onClick={onConfigureTrigger}>
              {triggerMeta.label}
            </Tag>
          </Tooltip>
          {dirty && <Tag color="orange">未保存</Tag>}
        </Space>
      </Space>

      {/* 右侧:撤销/重做 + 预览 + 保存 + 发布 */}
      <Space size={8}>
        {!readonly && (
          <>
            <Button
              type="text"
              icon={<UndoOutlined />}
              size="small"
              disabled={!canUndo}
              onClick={onUndo}
            />
            <Button
              type="text"
              icon={<RedoOutlined />}
              size="small"
              disabled={!canRedo}
              onClick={onRedo}
            />
          </>
        )}
        <Button icon={<EyeOutlined />} size="small">
          预览
        </Button>
        {!readonly && (
          <Button icon={<SaveOutlined />} size="small" loading={saving} onClick={onSave}>
            保存
          </Button>
        )}
        {!readonly && (
          <Popconfirm
            title="发布流程"
            description="发布后将生成新版本,已发布版本不可编辑"
            okButtonProps={{ danger: false }}
            onConfirm={onPublish}
          >
            <Button type="primary" icon={<SendOutlined />} size="small" loading={publishing}>
              发布
            </Button>
          </Popconfirm>
        )}
      </Space>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error Boundary — 捕获编辑器渲染崩溃
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class EditorErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: unknown) {
    console.error('[ProcessEditor] 渲染崩溃:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            style={{
              padding: 48,
              textAlign: 'center',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Typography.Title level={5} type="danger">
              编辑器渲染失败
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ maxWidth: 400 }}>
              {this.state.error?.message ?? '未知错误'}
            </Typography.Paragraph>
            <Button
              type="primary"
              size="small"
              onClick={() => this.setState({ hasError: false, error: undefined })}
            >
              重试
            </Button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// 触发器配置弹窗（评审整改：此前"创建后再配置"没有配置界面）
// ---------------------------------------------------------------------------

function TriggerConfigModal({
  open,
  processDef,
  onClose,
  onSaved,
}: {
  open: boolean;
  processDef: ProcessDef;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm<{ triggerType: string; cron?: string }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        triggerType: processDef.triggerType ?? 'MANUAL',
        cron: processDef.cron ?? undefined,
      });
    }
  }, [open, processDef, form]);

  const triggerType = Form.useWatch('triggerType', form);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await processesApi.update(processDef.id, {
        triggerType: values.triggerType,
        ...(values.triggerType === 'SCHEDULED' ? { cron: values.cron } : {}),
      } as never);
      message.success('触发器已更新；已发布流程将回退为草稿，请重新发布');
      onSaved();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        return; // 校验错误由 Form 展示
      }
      message.error('触发器更新失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="触发器配置"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="triggerType" label="触发类型" rules={[{ required: true }]}>
          <Select options={TRIGGER_OPTIONS} />
        </Form.Item>
        {triggerType === 'SCHEDULED' && (
          <Form.Item
            name="cron"
            label="Cron 表达式"
            rules={[{ required: true, message: '请输入 Cron 表达式' }]}
            tooltip="五段式，如 0 9 * * 1-5 表示工作日 9 点"
          >
            <Input placeholder="0 9 * * 1-5" />
          </Form.Item>
        )}
      </Form>
      <Alert
        type="info"
        showIcon
        message="修改触发器后流程会回退为草稿状态，需重新发布才会生效。"
      />
    </Modal>
  );
}
