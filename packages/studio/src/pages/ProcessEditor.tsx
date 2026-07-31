/**
 * 流程编辑器容器(三栏 + 工具栏 + 模式切换)。
 *
 * 路由:/app/:appId/processes/:processId
 * 根据 ProcessDef.editorMode 渲染简化模式(SimplifiedEditor)或标准模式(StandardEditor)。
 * 顶部工具栏:返回/流程名/模式切换/撤销重做/保存/发布。
 * 全屏三栏,撑满 calc(100vh - 56px)(StudioLayout Header)。
 */

import { useEffect, useRef, useState } from 'react';
import { Button, Popconfirm, Skeleton, Space, Tag, Typography, message } from 'antd';
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
import {
  processesApi,
  type ProcessDef,
  type WorkflowSchema,
} from '../api/processes.js';
import { objectsApi } from '../api/objects.js';
import { useProcessEditorStore } from '../stores/processEditor.js';
import { getProcessStatusMeta, getTriggerMeta } from '../constants/process.js';
import SimplifiedEditor from '../components/process/SimplifiedEditor.js';
import StandardEditor from '../components/process/StandardEditor.js';
import ModeSwitcher from '../components/process/ModeSwitcher.js';

const { Title } = Typography;

export default function ProcessEditor() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { appId, processId } = useParams<{ appId: string; processId: string }>();

  const store = useProcessEditorStore();
  const loadedRef = useRef<string | null>(null);

  /** 加载流程详情。 */
  const { data: processDef, isLoading } = useQuery({
    queryKey: ['process', processId],
    queryFn: () => processesApi.get(processId as string),
    enabled: !!processId,
    retry: 1,
  });

  /** 加载对象列表(配置面板用)。 */
  const { data: objects } = useQuery({
    queryKey: ['objects', appId],
    queryFn: () => objectsApi.list(appId as string),
    enabled: !!appId,
  });

  const objectOptions = (objects ?? []).map((o) => ({ label: o.name || o.label, value: o.id }));

  /** 流程加载成功 → 写入 store(仅当 processId 变化时)。 */
  useEffect(() => {
    if (processDef && processDef.id !== loadedRef.current) {
      loadedRef.current = processDef.id;
      store.loadProcess(processDef);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processDef]);

  /** 是否只读(已发布或 store 标记只读)。 */
  const isReadonly = store.readonly || processDef?.status === 'published';

  /** 保存草稿。 */
  const saveMutation = useMutation({
    mutationFn: (data: { workflowSchema?: WorkflowSchema; bpmnXml?: string; editorMode?: string }) =>
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

  /** Schema 变化(防抖保存,只读模式不保存)。 */
  const handleSchemaChange = (schema: WorkflowSchema) => {
    store.setSchema(schema, { skipHistory: true });
    if (isReadonly) return; // 只读模式不触发保存
    // 防抖保存
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveMutation.mutate({ workflowSchema: schema });
    }, 1000);
  };
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** BPMN 变化。 */
  const handleBpmnChange = (bpmnXml: string) => {
    store.setBpmnXml(bpmnXml);
    if (isReadonly) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveMutation.mutate({ bpmnXml });
    }, 1000);
  };

  /** 模式切换。 */
  const handleModeSwitch = (mode: 'simplified' | 'standard') => {
    store.switchMode(mode);
    // 持久化 editorMode
    saveMutation.mutate({ editorMode: mode });
  };

  /** 手动保存。 */
  const handleSave = () => {
    if (store.editorMode === 'simplified' && store.schema) {
      saveMutation.mutate({ workflowSchema: store.schema });
    } else if (store.editorMode === 'standard' && store.bpmnXml) {
      saveMutation.mutate({ bpmnXml: store.bpmnXml });
    }
  };

  if (isLoading && !store.processDef) {
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

  const statusMeta = getProcessStatusMeta(processDef.status);

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
        editorMode={store.editorMode}
        readonly={isReadonly}
        dirty={store.dirty}
        onBack={() => navigate(`/app/${appId}/processes`)}
        onModeSwitch={handleModeSwitch}
        onSave={handleSave}
        onPublish={() => publishMutation.mutate()}
        saving={saveMutation.isPending}
        publishing={publishMutation.isPending}
      />
      {/* 编辑器主体 */}
      {store.editorMode === 'simplified' ? (
        <SimplifiedEditor
          initialSchema={store.schema ?? processDef.workflowSchema}
          readonly={isReadonly}
          onSchemaChange={handleSchemaChange}
          objectOptions={objectOptions}
        />
      ) : (
        <StandardEditor
          initialBpmnXml={store.bpmnXml ?? processDef.bpmnXml}
          initialSchema={store.schema ?? undefined}
          onBpmnChange={handleBpmnChange}
          onSchemaChange={handleSchemaChange}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 编辑器工具栏
// ---------------------------------------------------------------------------

interface ProcessEditorToolbarProps {
  processDef: ProcessDef;
  editorMode: 'simplified' | 'standard';
  readonly: boolean;
  dirty: boolean;
  onBack: () => void;
  onModeSwitch: (mode: 'simplified' | 'standard') => void;
  onSave: () => void;
  onPublish: () => void;
  saving: boolean;
  publishing: boolean;
}

function ProcessEditorToolbar({
  processDef,
  editorMode,
  readonly,
  dirty,
  onBack,
  onModeSwitch,
  onSave,
  onPublish,
  saving,
  publishing,
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
          {dirty && <Tag color="orange">未保存</Tag>}
        </Space>
      </Space>

      {/* 中间:模式切换 */}
      <Space size={8}>
        {!readonly && (
          <ModeSwitcher
            mode={editorMode}
            onSwitch={(mode) => onModeSwitch(mode)}
            disabled={readonly}
          />
        )}
        {readonly && <Tag color="default">只读</Tag>}
      </Space>

      {/* 右侧:撤销/重做 + 预览 + 保存 + 发布 */}
      <Space size={8}>
        {!readonly && editorMode === 'simplified' && (
          <>
            <Button type="text" icon={<UndoOutlined />} size="small" />
            <Button type="text" icon={<RedoOutlined />} size="small" />
          </>
        )}
        <Button icon={<EyeOutlined />} size="small">
          预览
        </Button>
        {!readonly && (
          <Button
            icon={<SaveOutlined />}
            size="small"
            loading={saving}
            onClick={onSave}
          >
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
