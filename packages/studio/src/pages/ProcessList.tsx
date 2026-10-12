/**
 * 流程列表页 —— 对齐 DESIGN-process.md §2。
 *
 * 工具栏(搜索/状态筛选/新建) + 流程卡片网格(名称/触发器/状态/版本)。
 * 点击卡片进入编辑器(/processes/:processId)。
 *
 * 卡片与新建弹窗已拆分至 ./process-list/（AGENTS.md 单文件 400 行规范）。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { useMemo, useState } from 'react';
import { apiErrorMessage } from '../api/client.js';
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Row,
  Select,
  Skeleton,
  Space,
  Typography,
  message,
} from 'antd';
import { PlusOutlined, ApartmentOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { processesApi, createEmptyWorkflowSchema, type ProcessDef } from '../api/processes.js';
import { PROCESS_STATUS_META, type TriggerType } from '../constants/process.js';
import { ProcessCard } from './process-list/ProcessCard.js';
import {
  CreateProcessModal,
  type CreateProcessFormValues,
} from './process-list/CreateProcessModal.js';

const { Title } = Typography;

export default function ProcessList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { appId } = useParams<{ appId: string }>();
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<CreateProcessFormValues>();

  /** 流程列表。 */
  const { data: processes, isLoading } = useQuery({
    queryKey: ['processes', appId],
    queryFn: () => processesApi.list(appId as string),
    enabled: !!appId,
  });

  /** 按关键字 + 状态过滤。 */
  const filtered = useMemo(() => {
    if (!processes) return [];
    const kw = keyword.trim().toLowerCase();
    return processes.filter((p) => {
      const matchKw =
        !kw || p.name.toLowerCase().includes(kw) || p.processKey.toLowerCase().includes(kw);
      const matchStatus = !statusFilter || p.status === statusFilter;
      return matchKw && matchStatus;
    });
  }, [processes, keyword, statusFilter]);

  /** 创建流程。 */
  const createMutation = useMutation({
    mutationFn: (data: CreateProcessFormValues) => {
      return processesApi.create(appId as string, {
        name: data.name,
        apiName: data.processKey,
        triggerType: data.triggerType as TriggerType | undefined,
        workflowSchema: createEmptyWorkflowSchema(),
      });
    },
    onSuccess: (proc) => {
      message.success('流程创建成功');
      void queryClient.invalidateQueries({ queryKey: ['processes', appId] });
      setCreateOpen(false);
      form.resetFields();
      navigate(`/app/${appId}/processes/${proc.id}`);
    },
    onError: (err) => {
      const axErr = err as {
        response?: { data?: { error?: { message?: string } }; message?: string };
        message?: string;
      };
      message.error(axErr.response?.data?.error?.message ?? axErr.message ?? '创建失败,请重试');
    },
  });

  /** 删除流程。 */
  const deleteMutation = useMutation({
    mutationFn: (processId: string) => processesApi.delete(processId),
    onSuccess: () => {
      message.success('流程已删除');
      void queryClient.invalidateQueries({ queryKey: ['processes', appId] });
    },
    onError: (err) => message.error(apiErrorMessage(err, '删除失败')),
  });

  /** 评审整改：手动触发流程此前无任何 UI 启动入口（后端 start 端点无消费方）。 */
  const startMutation = useMutation({
    mutationFn: (proc: ProcessDef) =>
      processesApi.start(proc.id, { processKey: proc.apiName, variables: {} }),
    onSuccess: (instance) => {
      message.success(`流程已启动（实例 ${instance.id.slice(0, 8)}…）`);
      void queryClient.invalidateQueries({ queryKey: ['processes', appId] });
    },
    onError: (err) => {
      const axErr = err as {
        response?: { data?: { error?: { message?: string } }; message?: string };
        message?: string;
      };
      message.error(axErr.response?.data?.error?.message ?? axErr.message ?? '启动失败，请重试');
    },
  });

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
          流程
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建流程
        </Button>
      </div>

      {/* 搜索 + 状态筛选 */}
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="搜索流程名"
          allowClear
          size="middle"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ width: 240 }}
        />
        <Select
          placeholder="状态"
          allowClear
          style={{ width: 120 }}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v)}
          options={Object.entries(PROCESS_STATUS_META).map(([k, v]) => ({
            label: v.label,
            value: k,
          }))}
        />
      </Space>

      {/* 卡片网格 */}
      {isLoading ? (
        <Row gutter={[16, 16]}>
          {[1, 2, 3, 4].map((i) => (
            <Col xs={24} sm={12} lg={8} xl={6} key={i}>
              <Card style={{ borderRadius: 12 }}>
                <Skeleton active avatar paragraph={{ rows: 2 }} />
              </Card>
            </Col>
          ))}
        </Row>
      ) : filtered.length === 0 ? (
        <Empty
          image={<ApartmentOutlined style={{ fontSize: 64, color: T.colorPrimary }} />}
          description={keyword ? '未找到匹配的流程' : '还没有流程'}
          style={{ padding: '60px 0' }}
        >
          {!keyword && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建第一个流程
            </Button>
          )}
        </Empty>
      ) : (
        <Row gutter={[16, 16]}>
          {filtered.map((proc) => (
            <Col xs={24} sm={12} lg={8} xl={6} key={proc.id}>
              <ProcessCard
                process={proc}
                onEdit={() => navigate(`/app/${appId}/processes/${proc.id}`)}
                onMonitor={() => navigate(`/app/${appId}/processes/monitor?processId=${proc.id}`)}
                onDelete={() => deleteMutation.mutate(proc.id)}
                onStart={() => startMutation.mutate(proc)}
                starting={startMutation.isPending}
                deleting={deleteMutation.isPending}
              />
            </Col>
          ))}
        </Row>
      )}

      {/* 新建流程弹窗 */}
      <CreateProcessModal
        open={createOpen}
        form={form}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={createMutation.isPending}
      />
    </div>
  );
}
