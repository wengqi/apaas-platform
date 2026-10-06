/**
 * 任务中心 — 流程待办/已办任务列表 + 审批处理（含表单数据展示）。
 */

import { useState } from 'react';
import { Card, Typography, Table, Modal, Tabs, Spin, message } from 'antd';
import { CheckSquareOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi, type ProcessTask } from '../api/tasks.js';
import { buildColumns } from './task-center/columns.js';
import { normalizeItems } from './task-center/utils.js';
import { TaskDetailTabs } from './task-center/TaskDetailTabs.js';
import { TaskModalFooter } from './task-center/TaskModalFooter.js';
import ApprovalPageRenderer from '../runtime/ApprovalPageRenderer.js';

const { Title, Paragraph } = Typography;

export default function TaskCenter() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [selectedTask, setSelectedTask] = useState<ProcessTask | null>(null);
  const [comment, setComment] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  // 待办列表
  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['tasks', 'pending'],
    queryFn: () => tasksApi.list({ status: 'pending', page: 1, pageSize: 50 }),
  });

  // 已办列表
  const { data: completedData, isLoading: completedLoading } = useQuery({
    queryKey: ['tasks', 'completed'],
    queryFn: () => tasksApi.list({ status: 'completed', page: 1, pageSize: 50 }),
  });

  // 任务详情（审批时加载完整信息含流程变量）
  // 注意 queryKey 必须与失效键一致：invalidateQueries(['tasks']) 会前缀匹配 ['tasks', ...]，
  // 旧实现用 ['task', id]（单数）导致详情缓存永不失效（审批后重开显示旧状态）
  const { data: taskDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['tasks', 'detail', selectedTask?.id],
    queryFn: () => tasksApi.get(selectedTask!.id),
    enabled: !!selectedTask?.id,
  });

  // 流程轨迹（任务详情弹窗中展示）
  const instanceId = taskDetail?.instance?.id;
  const { data: traceData, isLoading: traceLoading } = useQuery({
    queryKey: ['trace', instanceId],
    queryFn: () => tasksApi.getTrace(instanceId!),
    enabled: !!instanceId,
  });

  const completeMutation = useMutation({
    mutationFn: ({ taskId, decision }: { taskId: string; decision: string }) =>
      tasksApi.complete(taskId, { decision, comment }),
    onSuccess: () => {
      message.success('任务已处理');
      setModalOpen(false);
      setComment('');
      setSelectedTask(null);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err: unknown) => {
      message.error(`处理失败: ${(err as Error).message}`);
    },
  });

  const openTaskModal = (task: ProcessTask) => {
    setSelectedTask(task);
    setComment('');
    setModalOpen(true);
  };

  const handleComplete = (decision: string) => {
    if (!selectedTask) return;
    completeMutation.mutate({ taskId: selectedTask.id, decision });
  };

  // 提取流程变量中的表单数据
  const variables = taskDetail?.instance?.variables;
  const triggerContext = taskDetail?.instance?.triggerContext;
  const formData = variables
    ? Object.entries(variables).filter(([key]) => key !== 'global' && !key.startsWith('_'))
    : [];
  // #15：申请内容优先渲染触发上下文的 inputs（记录字段摊平），
  // 用对象字段标签（apiName→label）替代裸 key；无 inputs 时回退上下文摘要。
  const fieldLabels = taskDetail?.inputFieldLabels ?? {};
  const rawInputs = triggerContext?.['inputs'] as Record<string, unknown> | undefined;
  const triggerData: Array<[string, unknown]> = rawInputs
    ? Object.entries(rawInputs)
        .filter(([key]) => !key.startsWith('_') && key !== 'id')
        .map(([key, value]) => [fieldLabels[key] ?? key, value])
    : triggerContext
      ? Object.entries(triggerContext)
          .filter(
            ([key]) =>
              key !== 'global' && !key.startsWith('_') && key !== 'inputs' && key !== 'record',
          )
          .map(([key, value]) => [fieldLabels[key] ?? key, value])
      : [];

  const columns = buildColumns(activeTab, openTaskModal);

  // API 返回 data 为数组（非分页对象），统一转为 items 数组
  const pendingItems = normalizeItems(pendingData);
  const completedItems = normalizeItems(completedData);
  const currentData = activeTab === 'pending' ? pendingItems : completedItems;
  const currentLoading = activeTab === 'pending' ? pendingLoading : completedLoading;

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Title level={4}>
          <CheckSquareOutlined /> 任务中心
        </Title>
        <Paragraph type="secondary">流程待办任务 — 当前用户的待审批/已处理任务列表</Paragraph>
      </Card>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'pending' | 'completed')}
          items={[
            {
              key: 'pending',
              label: `待办 (${pendingItems.length})`,
              children: (
                <Table<ProcessTask>
                  columns={columns}
                  dataSource={currentData}
                  rowKey="id"
                  loading={currentLoading}
                  pagination={false}
                  locale={{ emptyText: '暂无待办任务' }}
                />
              ),
            },
            {
              key: 'completed',
              label: `已办 (${completedItems.length})`,
              children: (
                <Table<ProcessTask>
                  columns={columns}
                  dataSource={currentData}
                  rowKey="id"
                  loading={currentLoading}
                  pagination={false}
                  locale={{ emptyText: '暂无已办任务' }}
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={activeTab === 'pending' ? '处理审批任务' : '任务详情'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width={640}
        footer={
          <TaskModalFooter
            activeTab={activeTab}
            isPending={completeMutation.isPending}
            onClose={() => setModalOpen(false)}
            onComplete={handleComplete}
            allowReject={taskDetail?.allowReject !== false && taskDetail?.rejectConfigured === true}
            rejectReason={
              taskDetail?.rejectConfigured === false
                ? '该节点未配置驳回跳转：流程图无驳回路径时，运行时不提供驳回操作'
                : undefined
            }
          />
        }
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : (
          selectedTask &&
          taskDetail && (
            <>
              {/* R1.3：审批节点绑定了页面 → 渲染页面（amis 方言，可含表单/关联信息）；
                  数据域 = 流程变量 + 触发上下文 + taskId，页面内 api 可用 ${taskId}。
                  业务用户旅程 R3（2026-10-06）：触发上下文的 inputs（记录字段摊平）
                  再拍平到顶层——绑定提交表单的静态控件按字段名取数，
                  否则控件全部显示"-"（inputs 嵌套在 triggerContext.inputs 里取不到） */}
              {taskDetail.boundPageId && activeTab === 'pending' ? (
                <div style={{ marginBottom: 16 }}>
                  <ApprovalPageRenderer
                    pageId={taskDetail.boundPageId}
                    appId={taskDetail.appId}
                    env={taskDetail.runtimeEnv}
                    data={{
                      taskId: taskDetail.id,
                      ...(taskDetail.instance?.variables ?? {}),
                      ...(taskDetail.instance?.triggerContext ?? {}),
                      ...((taskDetail.instance?.triggerContext as Record<string, unknown> | null)?.[
                        'inputs'
                      ] as Record<string, unknown> | undefined),
                    }}
                  />
                </div>
              ) : null}
              <TaskDetailTabs
                taskDetail={taskDetail}
                triggerData={taskDetail.boundPageId ? [] : triggerData}
                formData={taskDetail.boundPageId ? [] : formData}
                activeTab={activeTab}
                comment={comment}
                onCommentChange={setComment}
                traceData={traceData ?? null}
                traceLoading={traceLoading}
                recordCreatorName={taskDetail.recordCreatorName}
              />
            </>
          )
        )}
      </Modal>
    </div>
  );
}
