/**
 * 流程编辑器容器(三栏 + 工具栏)。
 *
 * 路由:/app/:appId/processes/:processId
 * 渲染流程编辑器(SimplifiedEditor,基于 flowgram.ai Free Layout)。
 * 顶部工具栏:返回/流程名/撤销重做/预览/保存/发布。
 * 全屏三栏,撑满 calc(100vh - 56px)(StudioLayout Header)。
 *
 * 工具栏 / ErrorBoundary / 触发器配置弹窗已拆分至 ./process-editor/。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Skeleton, Typography, message } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { processesApi, type WorkflowSchema } from '../api/processes.js';
import { objectsApi } from '../api/objects.js';
import { pagesApi } from '../api/pages.js';
import { useProcessEditorStore } from '../stores/processEditor.js';
import SimplifiedEditor from '../components/process/SimplifiedEditor.js';
import ProcessEditorToolbar from './process-editor/ProcessEditorToolbar.js';
import EditorErrorBoundary from './process-editor/EditorErrorBoundary.js';
import TriggerConfigModal from './process-editor/TriggerConfigModal.js';

export { default as EditorErrorBoundary } from './process-editor/EditorErrorBoundary.js';

export default function ProcessEditor() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { appId, processId } = useParams<{ appId: string; processId: string }>();

  const store = useProcessEditorStore();
  const loadedRef = useRef<string | null>(null);
  /** 编辑器 initialData：挂载期捕获一次。编辑器已按 processId key 重挂载，
   *  store.schema 的后续更新不得回灌 initialData——否则形成
   *  编辑器→onSchemaChange→store→props→编辑器 的反馈环（画布永不收敛）。 */
  const initialSchemaRef = useRef<WorkflowSchema | undefined>(undefined);

  /** flowgram 撤销/重做 API(由 SimplifiedEditor 内部 HistoryBridge 暴露)。
   *  API 对象每次上报都是新引用，只能入 ref；重渲染经由布尔 state 驱动——
   *  值不变时返回 prev 使 setState 退出，保证上报循环有界（不会饿死画布）。 */
  const historyApiRef = useRef<{
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
  } | null>(null);
  const [historyFlags, setHistoryFlags] = useState({ canUndo: false, canRedo: false });
  const handleHistoryReady = useCallback(
    (api: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }) => {
      historyApiRef.current = api;
      setHistoryFlags((prev) =>
        prev.canUndo === api.canUndo && prev.canRedo === api.canRedo
          ? prev
          : { canUndo: api.canUndo, canRedo: api.canRedo },
      );
    },
    [],
  );

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
      initialSchemaRef.current = processDef.workflowSchema;
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
        canUndo={historyFlags.canUndo}
        canRedo={historyFlags.canRedo}
        onUndo={() => historyApiRef.current?.undo()}
        onRedo={() => historyApiRef.current?.redo()}
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
          initialSchema={initialSchemaRef.current ?? processDef.workflowSchema}
          readonly={isReadonly}
          onSchemaChange={handleSchemaChange}
          objectOptions={objectOptions}
          formOptions={formOptions}
          processOptions={processOptions}
          onHistoryReady={handleHistoryReady}
        />
      </EditorErrorBoundary>
    </div>
  );
}
