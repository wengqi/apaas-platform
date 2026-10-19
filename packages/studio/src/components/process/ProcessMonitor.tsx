/**
 * 流程监控 —— 对齐 DESIGN-process.md §8。
 *
 * 三部分:
 *  - 运行实例列表(流程名/状态/触发者/开始时间/耗时)
 *  - 实例详情:节点执行状态(简化画布只读 + 状态颜色标记)
 *  - 人工任务列表(待审批/已审批) + 任务处理面板(审批/驳回/转办)
 *
 * 表格列 / 实例列表 Tab / 实例详情 / 任务处理面板已拆分至 ./process-monitor/。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { useMemo, useState } from 'react';
import { apiErrorMessage } from '../../api/client.js';
import { Empty, Modal, Skeleton, Table, Tabs, message } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { processesApi, type UserTask } from '../../api/processes.js';
import { useUserNameMap } from '../../utils/user-display.js';
import { buildInstanceColumns, buildTaskColumns } from './process-monitor/columns.js';
import InstanceDetail from './process-monitor/InstanceDetail.js';
import InstanceListTab from './process-monitor/InstanceListTab.js';
import TaskProcessPanel from './process-monitor/TaskProcessPanel.js';
import ProcessAnalytics from './ProcessAnalytics.js';

export default function ProcessMonitor() {
  const { appId } = useParams<{ appId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const processId = searchParams.get('processId') ?? undefined;
  const [activeTab, setActiveTab] = useState<'instances' | 'tasks' | 'analytics'>('instances');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<string | undefined>(undefined);
  const [taskTab, setTaskTab] = useState<'pending' | 'completed'>('pending');
  const [taskModal, setTaskModal] = useState<UserTask | null>(null);

  const queryClient = useQueryClient();

  // 双视角评审（2026-10-04）R10：触发者/发起人显示姓名而非裸 cuid
  const userNameMap = useUserNameMap();

  /** 流程列表(用于筛选下拉 + 名称映射)。 */
  const { data: processes } = useQuery({
    queryKey: ['processes', appId],
    queryFn: () => processesApi.list(appId as string),
    enabled: !!appId,
  });

  const processNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of processes ?? []) {
      m.set(p.id, p.name);
    }
    return m;
  }, [processes]);

  /** 实例列表(轮询运行中实例)。 */
  const { data: instances, isLoading } = useQuery({
    queryKey: ['process-instances', processId, stateFilter],
    queryFn: () =>
      processesApi.listInstances(appId as string, processId as string, {
        state: stateFilter as never,
      }),
    enabled: !!processId,
    refetchInterval: 5000,
  });

  /** 任务列表。 */
  const { data: tasks } = useQuery({
    queryKey: ['process-tasks', taskTab, processId],
    queryFn: () =>
      processesApi.listTasks({
        status: taskTab,
        processDefId: processId,
      }),
    enabled: activeTab === 'tasks' && !!processId,
  });

  /** 实例详情。
   *  交互评审（2026-10-04）修复：查询失败（如 403 仅发起人/参与人可见）此前
   *  会让弹窗永久空白——instanceReport 为 undefined 时 Modal 内容区什么都没有。 */
  const {
    data: instanceReport,
    error: instanceError,
    isFetching: instanceLoading,
  } = useQuery({
    queryKey: ['process-instance', selectedInstanceId],
    queryFn: () => processesApi.getInstance(selectedInstanceId as string),
    enabled: !!selectedInstanceId,
    refetchInterval: 5000,
    retry: 1,
  });

  /** 完成任务 mutation。 */
  const completeTaskMutation = useMutation({
    mutationFn: (params: { taskId: string; decision: 'approve' | 'reject'; comment?: string }) =>
      processesApi.completeTask(params.taskId, params.decision, params.comment),
    onSuccess: () => {
      message.success('任务已处理');
      setTaskModal(null);
      void queryClient.invalidateQueries({ queryKey: ['process-tasks'] });
    },
    onError: (err) => message.error(apiErrorMessage(err, '处理失败')),
  });

  /** 转办任务 mutation。 */
  const delegateMutation = useMutation({
    mutationFn: (params: { taskId: string; delegatedTo: string }) =>
      processesApi.delegateTask(params.taskId, params.delegatedTo),
    onSuccess: () => {
      message.success('任务已转办');
      setTaskModal(null);
      void queryClient.invalidateQueries({ queryKey: ['process-tasks'] });
    },
    onError: (err) => message.error(apiErrorMessage(err, '转办失败')),
  });

  /** 终止实例 mutation。 */
  const cancelInstanceMutation = useMutation({
    mutationFn: (instanceId: string) => processesApi.cancelInstance(instanceId),
    onSuccess: () => {
      message.success('已终止');
      void queryClient.invalidateQueries({ queryKey: ['process-instances'] });
    },
    onError: (err) => message.error(apiErrorMessage(err, '终止失败')),
  });

  const instanceColumns = buildInstanceColumns({
    processNameMap,
    userNameMap,
    onSelectInstance: setSelectedInstanceId,
    onHandleTask: () => {
      setActiveTab('tasks');
      setTaskTab('pending');
    },
    onCancelInstance: (id) => cancelInstanceMutation.mutate(id),
  });

  const taskColumns = buildTaskColumns({
    processNameMap,
    userNameMap,
    taskTab,
    onProcessTask: setTaskModal,
  });

  return (
    <div
      style={{
        height: 'calc(100vh - 56px)',
        display: 'flex',
        flexDirection: 'column',
        background: T.colorBgLayout,
      }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as 'instances' | 'tasks' | 'analytics')}
        style={{ padding: '0 24px', background: T.colorWhite }}
        items={[
          {
            key: 'instances',
            label: '运行实例',
            children: (
              <InstanceListTab
                instances={instances ?? []}
                isLoading={isLoading}
                columns={instanceColumns}
                stateFilter={stateFilter}
                setStateFilter={setStateFilter}
                processes={processes ?? []}
                processId={processId}
                onProcessChange={(v) => setSearchParams(v ? { processId: v } : {})}
              />
            ),
          },
          {
            key: 'tasks',
            label: '人工任务',
            children: (
              <Tabs
                activeKey={taskTab}
                onChange={(k) => setTaskTab(k as 'pending' | 'completed')}
                items={[
                  {
                    key: 'pending',
                    label: `待审批 (${tasks?.length ?? 0})`,
                    children: (
                      <Table
                        size="middle"
                        rowKey="id"
                        columns={taskColumns}
                        dataSource={tasks ?? []}
                        pagination={{ pageSize: 10 }}
                      />
                    ),
                  },
                  {
                    key: 'completed',
                    label: '已审批',
                    children: (
                      <Table
                        size="middle"
                        rowKey="id"
                        columns={taskColumns}
                        dataSource={tasks ?? []}
                        pagination={{ pageSize: 10 }}
                      />
                    ),
                  },
                ]}
              />
            ),
          },
          {
            key: 'analytics',
            label: '效率分析',
            children: appId ? <ProcessAnalytics appId={appId} /> : null,
          },
        ]}
      />

      {/* 实例详情 Modal */}
      <Modal
        title="实例详情"
        open={!!selectedInstanceId}
        onCancel={() => setSelectedInstanceId(null)}
        footer={null}
        width={900}
      >
        {instanceError ? (
          <Empty
            description={apiErrorMessage(instanceError, '无法加载实例详情')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : instanceReport ? (
          <InstanceDetail
            report={instanceReport}
            processName={processNameMap.get(instanceReport.instance.processDefId)}
          />
        ) : (
          <Skeleton active paragraph={{ rows: 6 }} loading={instanceLoading} />
        )}
      </Modal>

      {/* 任务处理面板 */}
      <TaskProcessPanel
        task={taskModal}
        onClose={() => setTaskModal(null)}
        onComplete={(decision, comment) =>
          taskModal &&
          completeTaskMutation.mutate({
            taskId: taskModal.id,
            decision,
            comment,
          })
        }
        onDelegate={(userId) =>
          taskModal &&
          delegateMutation.mutate({
            taskId: taskModal.id,
            delegatedTo: userId,
          })
        }
      />
    </div>
  );
}
