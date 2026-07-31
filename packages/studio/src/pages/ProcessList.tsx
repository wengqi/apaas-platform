/**
 * 流程列表页 —— 对齐 DESIGN-process.md §2。
 *
 * 工具栏(搜索/状态筛选/新建) + 流程卡片网格(名称/触发器/状态/版本/模式)。
 * 点击卡片进入编辑器(/processes/:processId)。
 */

import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Row,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  PlusOutlined,
  ApartmentOutlined,
  EditOutlined,
  EyeOutlined,
  MoreOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  processesApi,
  createEmptyWorkflowSchema,
  createEmptyBpmnXml,
  type ProcessDef,
} from '../api/processes.js';
import {
  getProcessStatusMeta,
  getTriggerMeta,
  EDITOR_MODE_META,
  PROCESS_STATUS_META,
  TRIGGER_OPTIONS,
  type EditorMode,
} from '../constants/process.js';

const { Text, Title } = Typography;

interface CreateProcessFormValues {
  name: string;
  processKey: string;
  editorMode: EditorMode;
  triggerType?: string;
}

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
      const matchKw = !kw || p.name.toLowerCase().includes(kw) || p.processKey.toLowerCase().includes(kw);
      const matchStatus = !statusFilter || p.status === statusFilter;
      return matchKw && matchStatus;
    });
  }, [processes, keyword, statusFilter]);

  /** 创建流程。 */
  const createMutation = useMutation({
    mutationFn: (data: CreateProcessFormValues) => {
      const editorMode = data.editorMode;
      return processesApi.create(appId as string, {
        name: data.name,
        apiName: data.processKey,
        editorMode,
        triggerType: data.triggerType as never,
        workflowSchema: editorMode === 'simplified' ? createEmptyWorkflowSchema() : undefined,
        bpmnXml: editorMode === 'standard' ? createEmptyBpmnXml(data.processKey) : undefined,
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
    onError: () => message.error('删除失败'),
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
          image={<ApartmentOutlined style={{ fontSize: 64, color: '#1677ff' }} />}
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

// ---------------------------------------------------------------------------
// 流程卡片
// ---------------------------------------------------------------------------

function ProcessCard({
  process,
  onEdit,
  onMonitor,
  onDelete,
  deleting,
}: {
  process: ProcessDef;
  onEdit: () => void;
  onMonitor: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const triggerMeta = getTriggerMeta(process.triggerType as string | undefined);
  const statusMeta = getProcessStatusMeta(process.status);
  const modeMeta = EDITOR_MODE_META[process.editorMode === 'standard' ? 'standard' : 'simplified'];
  const TriggerIcon = triggerMeta.icon;

  return (
    <Card
      hoverable
      style={{
        borderRadius: 12,
        border: '1px solid #eef0f4',
        transition: 'all 0.2s ease',
      }}
      styles={{ body: { padding: 20 } }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.04)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
      }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {/* 头部:图标 + 名称 + 状态 + 版本 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: `linear-gradient(135deg, ${triggerMeta.color}, ${triggerMeta.color}dd)`,
              color: '#fff',
              fontSize: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <TriggerIcon />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Space size={6} align="center">
              <Text strong style={{ fontSize: 15 }}>
                {process.name}
              </Text>
              <Tag color={statusMeta.tagColor} style={{ margin: 0 }}>
                {statusMeta.label}
              </Tag>
            </Space>
            <div
              style={{
                fontSize: 12,
                color: 'rgba(0,0,0,0.45)',
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {process.processKey} · v{process.version}
            </div>
          </div>
        </div>

        {/* 触发器 + 模式 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Space size={4}>
            <TriggerIcon style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              触发器: {triggerMeta.label}
            </Text>
          </Space>
          <Space size={4}>
            <Tag color={modeMeta.tagColor} style={{ margin: 0, fontSize: 11 }}>
              {modeMeta.label}模式
            </Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              更新于 {dayjs(process.updatedAt).format('MM-DD HH:mm')}
            </Text>
          </Space>
        </div>

        {/* 操作行 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f0f2f5', paddingTop: 8 }}>
          <Space size={4}>
            <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit}>
              编辑
            </Button>
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={onMonitor}>
              监控
            </Button>
          </Space>
          <Dropdown
            menu={{
              items: [
                { key: 'export-schema', label: '导出 Schema', icon: <ApartmentOutlined /> },
                { key: 'export-bpmn', label: '导出 BPMN', icon: <ApartmentOutlined /> },
                { type: 'divider' as const },
                { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true },
              ],
              onClick: ({ key }) => {
                if (key === 'delete') {
                  // 由 Popconfirm 处理
                }
              },
            }}
          >
            <Popconfirm
              title="删除流程"
              description="删除后流程定义与历史实例将不可恢复"
              okButtonProps={{ danger: true }}
              onConfirm={onDelete}
            >
              <Button type="text" size="small" icon={<MoreOutlined />} loading={deleting} />
            </Popconfirm>
          </Dropdown>
        </div>
      </Space>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 新建流程弹窗
// ---------------------------------------------------------------------------

function CreateProcessModal({
  open,
  form,
  onCancel,
  onOk,
  confirmLoading,
}: {
  open: boolean;
  form: ReturnType<typeof Form.useForm<CreateProcessFormValues>>[0];
  onCancel: () => void;
  onOk: () => void;
  confirmLoading: boolean;
}) {
  /** 名称变化时自动生成 API 名(简易:中文无法转拼音,提示手填)。 */
  const name = Form.useWatch('name', form);

  return (
    <Modal
      title="新建流程"
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={confirmLoading}
      okText="创建并编辑"
      cancelText="取消"
      width={520}
      destroyOnHidden
    >
      <Form<CreateProcessFormValues>
        form={form}
        layout="vertical"
        initialValues={{ editorMode: 'simplified' as EditorMode }}
        preserve={false}
      >
        <Form.Item
          label="流程名称"
          name="name"
          rules={[
            { required: true, message: '请输入流程名称' },
            { max: 40, message: '最多 40 字' },
          ]}
        >
          <Input placeholder="客户审批流" />
        </Form.Item>
        <Form.Item
          label="API 名称"
          name="processKey"
          tooltip="小写下划线,应用内唯一,如 customer_approval"
          rules={[
            { required: true, message: '请输入 API 名称' },
            {
              pattern: /^[a-z][a-z0-9_]*$/,
              message: '仅支持小写字母、数字、下划线,且以字母开头',
            },
          ]}
        >
          <Input placeholder="customer_approval" style={{ fontFamily: 'monospace' }} />
        </Form.Item>
        <Form.Item label="编辑模式" name="editorMode" rules={[{ required: true }]}>
          <Radio.Group>
            <Space direction="vertical">
              <Radio value="simplified">
                <Space>
                  <Text strong>简化模式</Text>
                  <Tag color="blue" style={{ margin: 0 }}>推荐</Tag>
                </Space>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  飞书式业务节点,适合业务人员
                </Text>
              </Radio>
              <Radio value="standard">
                <Text strong>标准模式</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  完整 BPMN 2.0,适合流程专家
                </Text>
              </Radio>
            </Space>
          </Radio.Group>
        </Form.Item>
        <Form.Item label="触发器类型(可选)" name="triggerType">
          <Select
            allowClear
            placeholder="创建后再配置"
            options={TRIGGER_OPTIONS}
          />
        </Form.Item>
      </Form>
      {name && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          提示:API 名称需手填,创建后锁定。
        </Text>
      )}
    </Modal>
  );
}
