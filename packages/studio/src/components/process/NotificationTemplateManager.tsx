/**
 * 通知模版管理 —— 对齐 DESIGN-process.md §7。
 *
 * 三部分:
 *  - 模版列表(名称/渠道/变量数/更新时间)
 *  - 模版编辑器(Drawer):名称/渠道/标题模版/正文模版/变量定义
 *  - 模版预览(填入示例值→渲染预览)
 */

import { useMemo, useState } from 'react';
import { apiErrorMessage } from '../../api/client.js';
import {
  Button,
  Card,
  Col,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  processesApi,
  type NotificationTemplate,
  type NotificationTemplateVariable,
} from '../../api/processes.js';
import {
  NOTIFICATION_CHANNEL_META,
  NOTIFICATION_CHANNEL_OPTIONS,
  type NotificationChannel,
} from '../../constants/process.js';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

export default function NotificationTemplateManager() {
  const { appId } = useParams<{ appId: string }>();
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [form] = Form.useForm();

  /** 模版列表。 */
  const { data: templates, isLoading } = useQuery({
    queryKey: ['notification-templates', appId],
    queryFn: () => processesApi.listTemplates(appId as string),
    enabled: !!appId,
  });

  /** 创建 mutation。 */
  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof processesApi.createTemplate>[1]) =>
      processesApi.createTemplate(appId as string, data),
    onSuccess: () => {
      message.success('模版已创建');
      void queryClient.invalidateQueries({ queryKey: ['notification-templates', appId] });
      setDrawerOpen(false);
    },
    onError: (err) => message.error(apiErrorMessage(err, '创建失败')),
  });

  /** 更新 mutation。 */
  const updateMutation = useMutation({
    mutationFn: (params: { id: string; data: Parameters<typeof processesApi.updateTemplate>[1] }) =>
      processesApi.updateTemplate(params.id, params.data),
    onSuccess: () => {
      message.success('模版已保存');
      void queryClient.invalidateQueries({ queryKey: ['notification-templates', appId] });
      setDrawerOpen(false);
    },
    onError: (err) => message.error(apiErrorMessage(err, '保存失败')),
  });

  /** 删除 mutation。 */
  const deleteMutation = useMutation({
    mutationFn: (id: string) => processesApi.deleteTemplate(id),
    onSuccess: () => {
      message.success('模版已删除');
      void queryClient.invalidateQueries({ queryKey: ['notification-templates', appId] });
    },
    onError: (err) => message.error(apiErrorMessage(err, '删除失败')),
  });

  /** 打开新建。 */
  const handleCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    form.setFieldsValue({
      channel: 'EMAIL',
      variables: [{ name: '', description: '', sampleValue: '' }],
    });
    setDrawerOpen(true);
  };

  /** 打开编辑。 */
  const handleEdit = (template: NotificationTemplate) => {
    setEditingTemplate(template);
    form.setFieldsValue({
      name: template.name,
      channel: template.channel,
      titleTemplate: template.titleTemplate,
      bodyTemplate: template.bodyTemplate,
      variables: template.variables.length
        ? template.variables
        : [{ name: '', description: '', sampleValue: '' }],
    });
    setDrawerOpen(true);
  };

  /** 保存(新建/编辑)。 */
  const handleSave = () => {
    void form.validateFields().then((values) => {
      const payload = {
        name: values.name as string,
        channel: values.channel as NotificationChannel,
        titleTemplate: values.titleTemplate as string,
        bodyTemplate: values.bodyTemplate as string,
        variables: (values.variables as NotificationTemplateVariable[]).filter((v) => v.name),
      };
      if (editingTemplate) {
        updateMutation.mutate({ id: editingTemplate.id, data: payload });
      } else {
        createMutation.mutate(payload);
      }
    });
  };

  const columns: ColumnsType<NotificationTemplate> = [
    {
      title: '模版名称',
      dataIndex: 'name',
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: '渠道',
      dataIndex: 'channel',
      render: (v: string) => {
        const meta = NOTIFICATION_CHANNEL_META[v as NotificationChannel];
        return <Tag color={meta?.tagColor ?? 'default'}>{meta?.label ?? v}</Tag>;
      },
    },
    {
      title: '变量数',
      dataIndex: 'variables',
      render: (v: NotificationTemplateVariable[]) => v?.length ?? 0,
    },
    {
      title: '更新于',
      dataIndex: 'updatedAt',
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => handleEdit(r)}>
            编辑
          </Button>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'delete',
                  label: '删除',
                  icon: <DeleteOutlined />,
                  danger: true,
                },
              ],
              onClick: ({ key }) => {
                if (key === 'delete') {
                  deleteMutation.mutate(r.id);
                }
              },
            }}
          >
            <Button size="small" type="text" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        style={{ borderRadius: 12, border: '1px solid #eef0f4' }}
        styles={{ body: { padding: 20 } }}
      >
        <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }}>
          <Title level={5} style={{ margin: 0 }}>
            通知模版
          </Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新建模版
          </Button>
        </Space>
        <Table
          size="middle"
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={templates ?? []}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <Empty description="暂无通知模版" /> }}
        />
      </Card>

      <Drawer
        title={editingTemplate ? `编辑模版 — ${editingTemplate.name}` : '新建模版'}
        placement="right"
        width={560}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button
              type="primary"
              onClick={handleSave}
              loading={createMutation.isPending || updateMutation.isPending}
            >
              保存
            </Button>
          </Space>
        }
      >
        <TemplateEditorForm form={form} />
      </Drawer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 模版编辑器表单(含变量定义 + 预览)
// ---------------------------------------------------------------------------

interface TemplateFormValues {
  name?: string;
  channel?: NotificationChannel;
  titleTemplate?: string;
  bodyTemplate?: string;
  variables?: NotificationTemplateVariable[];
}

function TemplateEditorForm({ form }: { form: ReturnType<typeof Form.useForm>[0] }) {
  const values = Form.useWatch([], form) as TemplateFormValues | undefined;

  /** 实时预览:用变量示例值替换 ${var}。 */
  const preview = useMemo(() => {
    const title = (values?.titleTemplate as string) ?? '';
    const content = (values?.bodyTemplate as string) ?? '';
    const variables = (values?.variables as NotificationTemplateVariable[]) ?? [];
    const render = (tmpl: string) =>
      tmpl.replace(/\$\{(\w+)\.(\w+)\}|\$\{(\w+)\}/g, (_m, g1, g2, g3) => {
        const name = g1 ?? g3;
        const varDef = variables.find((v) => v.name === name);
        if (varDef) return varDef.sampleValue || '';
        return _m;
      });
    return {
      title: render(title),
      content: render(content),
    };
  }, [values]);

  /** 插入变量到标题。 */
  const insertVariable = (field: 'titleTemplate' | 'bodyTemplate', varName: string) => {
    const current = (form.getFieldValue(field) as string) ?? '';
    form.setFieldValue(field, `${current}\${${varName}}`);
  };

  const variables = (values?.variables as NotificationTemplateVariable[]) ?? [];

  return (
    <Form form={form} layout="vertical">
      <Form.Item
        label="模版名称"
        name="name"
        rules={[{ required: true, message: '请输入模版名称' }]}
      >
        <Input placeholder="审批结果通知" />
      </Form.Item>
      <Form.Item label="渠道" name="channel" rules={[{ required: true }]}>
        <Select options={NOTIFICATION_CHANNEL_OPTIONS} />
      </Form.Item>

      <Title level={5} style={{ marginTop: 16 }}>
        标题模版
      </Title>
      <Form.Item name="titleTemplate">
        <Input
          placeholder="${record.name} 审批${result}"
          addonAfter={
            variables.length > 0 ? (
              <Dropdown
                menu={{
                  items: variables
                    .filter((v) => v.name)
                    .map((v) => ({ key: v.name, label: v.name })),
                  onClick: ({ key }) => insertVariable('titleTemplate', key),
                }}
              >
                <span style={{ cursor: 'pointer' }}>插入变量 ▾</span>
              </Dropdown>
            ) : (
              <span style={{ color: 'rgba(0,0,0,0.25)' }}>无变量</span>
            )
          }
        />
      </Form.Item>

      <Title level={5}>正文模版</Title>
      <Form.Item name="bodyTemplate">
        <TextArea
          rows={6}
          placeholder={'尊敬的 ${recipient.name}:\n\n您提交的 ${record.name} 已审批${result}。'}
        />
      </Form.Item>
      {variables.length > 0 && (
        <Button
          size="small"
          type="link"
          onClick={() => {
            const first = variables.find((v) => v.name);
            if (first) insertVariable('bodyTemplate', first.name);
          }}
        >
          插入变量
        </Button>
      )}

      <Title level={5} style={{ marginTop: 16 }}>
        变量定义
      </Title>
      <Form.List name="variables">
        {(fields, { add, remove }) => (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {fields.map((field) => (
              <Row gutter={8} key={field.key} align="middle">
                <Col span={8}>
                  <Form.Item name={[field.name, 'name']} noStyle>
                    <Input size="small" placeholder="变量名" style={{ fontFamily: 'monospace' }} />
                  </Form.Item>
                </Col>
                <Col span={7}>
                  <Form.Item name={[field.name, 'description']} noStyle>
                    <Input size="small" placeholder="说明" />
                  </Form.Item>
                </Col>
                <Col span={7}>
                  <Form.Item name={[field.name, 'sampleValue']} noStyle>
                    <Input size="small" placeholder="示例值" />
                  </Form.Item>
                </Col>
                <Col span={2}>
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => remove(field.name)}
                  />
                </Col>
              </Row>
            ))}
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => add()} block>
              添加变量
            </Button>
          </Space>
        )}
      </Form.List>

      <Title level={5} style={{ marginTop: 16 }}>
        预览
      </Title>
      <Card size="small" style={{ background: '#fafbfc' }}>
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Text strong>标题: {preview.title || '(空)'}</Text>
          <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            正文: {preview.content || '(空)'}
          </Paragraph>
        </Space>
      </Card>
    </Form>
  );
}
