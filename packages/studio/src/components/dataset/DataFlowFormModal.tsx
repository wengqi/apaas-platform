/**
 * 数据流创建/编辑表单 — 步骤式配置。
 *
 * 步骤：基本信息 → 数据源 → 关联（可选）→ 筛选（可选）→ 分组汇总（可选）→ 输出字段
 */

import { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Button, Space, Typography, Divider, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { objectsApi } from '../../api/objects.js';
import {
  dataFlowsApi,
  type DataFlow,
  type DataFlowConfig,
  type CreateDataFlowRequest,
} from '../../api/datasets.js';

const { Text } = Typography;

const AGG_FUNCTIONS = [
  { value: 'sum', label: '求和' },
  { value: 'count', label: '计数' },
  { value: 'avg', label: '平均值' },
  { value: 'max', label: '最大值' },
  { value: 'min', label: '最小值' },
];

const FIELD_TYPES = [
  { value: 'string', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
];

const JOIN_TYPES = [
  { value: 'left', label: '左关联（LEFT JOIN）' },
  { value: 'inner', label: '内关联（INNER JOIN）' },
];

interface Props {
  open: boolean;
  editingFlow?: DataFlow | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DataFlowFormModal({ open, editingFlow, onClose, onSuccess }: Props) {
  const { appId } = useParams<{ appId: string }>();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [hasAggregation, setHasAggregation] = useState(false);
  const [hasJoin, setHasJoin] = useState(false);
  const [hasFilter, setHasFilter] = useState(false);

  const { data: objects } = useQuery({
    queryKey: ['app-objects', appId],
    queryFn: () => objectsApi.list(appId!),
    enabled: !!appId,
  });

  useEffect(() => {
    if (editingFlow) {
      form.setFieldsValue({
        apiName: editingFlow.apiName,
        name: editingFlow.name,
        description: editingFlow.description,
        sources: editingFlow.config.sources,
        join: editingFlow.config.join,
        filter: editingFlow.config.filter
          ? typeof editingFlow.config.filter === 'string'
            ? editingFlow.config.filter
            : JSON.stringify(editingFlow.config.filter, null, 2)
          : '',
        aggregation: editingFlow.config.aggregation,
        outputFields: editingFlow.config.outputFields,
      });
      setHasAggregation(!!editingFlow.config.aggregation);
      setHasJoin(!!editingFlow.config.join);
      setHasFilter(!!editingFlow.config.filter);
    } else {
      form.resetFields();
      setHasAggregation(false);
      setHasJoin(false);
      setHasFilter(false);
    }
  }, [editingFlow, form, open]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      let parsedFilter: object | null = null;
      if (hasFilter && values.filter) {
        try {
          parsedFilter = JSON.parse(values.filter);
        } catch {
          message.error('筛选条件不是有效的 JSON');
          setLoading(false);
          return;
        }
      }

      const config: DataFlowConfig = {
        sources: values.sources || [],
        join: hasJoin ? values.join : undefined,
        filter: hasFilter ? parsedFilter : null,
        aggregation: hasAggregation ? values.aggregation : undefined,
        outputFields: values.outputFields || [],
      };

      if (editingFlow) {
        await dataFlowsApi.update(editingFlow.id, {
          name: values.name,
          description: values.description,
          config,
        });
        message.success('数据流已更新');
      } else {
        const data: CreateDataFlowRequest = {
          apiName: values.apiName,
          name: values.name,
          description: values.description,
          config,
        };
        await dataFlowsApi.create(appId!, data);
        message.success('数据流创建成功');
      }
      onSuccess();
      onClose();
    } catch {
      /* 校验错误由 Form 展示 */
    } finally {
      setLoading(false);
    }
  };

  const objectOptions = (objects ?? []).map((o) => ({ value: o.id, label: o.label ?? o.name }));
  const sourceAliases = (form.getFieldValue('sources') as Array<{ alias?: string }>) ?? [];
  const aliasOptions = sourceAliases
    .filter((s) => s.alias)
    .map((s) => ({ value: s.alias!, label: s.alias! }));

  return (
    <Modal
      title={editingFlow ? '编辑数据流' : '创建数据流'}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      width={720}
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Divider orientation="left" plain>
          基本信息
        </Divider>
        <Form.Item
          label="API 名称"
          name="apiName"
          rules={[
            { required: true, message: '请输入 API 名称' },
            { pattern: /^[a-z][a-z0-9_]*$/, message: '小写字母、数字、下划线' },
          ]}
        >
          <Input placeholder="asset_summary" disabled={!!editingFlow} />
        </Form.Item>
        <Form.Item
          label="显示名称"
          name="name"
          rules={[{ required: true, message: '请输入显示名称' }]}
        >
          <Input placeholder="资产汇总" />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input placeholder="数据流用途说明（可选）" />
        </Form.Item>

        <Divider orientation="left" plain>
          数据源
        </Divider>
        <Form.List name="sources">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name }) => (
                <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Form.Item
                    name={[name, 'objectId']}
                    noStyle
                    rules={[{ required: true, message: '选择对象' }]}
                  >
                    <Select style={{ width: 180 }} placeholder="选择对象" options={objectOptions} />
                  </Form.Item>
                  <Form.Item
                    name={[name, 'alias']}
                    noStyle
                    rules={[{ required: true, message: '输入别名' }]}
                  >
                    <Input style={{ width: 120 }} placeholder="别名（如 orders）" />
                  </Form.Item>
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => remove(name)}
                  />
                </Space>
              ))}
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add()}>
                添加数据源
              </Button>
            </>
          )}
        </Form.List>

        <Divider orientation="left" plain>
          关联（可选）
        </Divider>
        <Form.Item>
          <Button type={hasJoin ? 'primary' : 'default'} onClick={() => setHasJoin(!hasJoin)}>
            {hasJoin ? '已启用关联' : '启用关联（JOIN）'}
          </Button>
        </Form.Item>

        {hasJoin && (
          <>
            <Text type="secondary" style={{ fontSize: 12 }}>
              配置两个数据源之间的关联关系。关联后，右表字段会以 {`${'}{rightAlias}_{field}'}`}{' '}
              格式合并到结果中。
            </Text>
            <Space style={{ display: 'flex', marginBottom: 8 }} wrap>
              <Form.Item name={['join', 'leftAlias']} noStyle rules={[{ required: hasJoin }]}>
                <Select style={{ width: 140 }} placeholder="左表别名" options={aliasOptions} />
              </Form.Item>
              <Form.Item name={['join', 'rightAlias']} noStyle rules={[{ required: hasJoin }]}>
                <Select style={{ width: 140 }} placeholder="右表别名" options={aliasOptions} />
              </Form.Item>
              <Form.Item name={['join', 'type']} noStyle rules={[{ required: hasJoin }]}>
                <Select style={{ width: 180 }} placeholder="关联类型" options={JOIN_TYPES} />
              </Form.Item>
            </Space>
            <Space style={{ display: 'flex', marginBottom: 8 }} wrap>
              <Form.Item name={['join', 'leftField']} noStyle rules={[{ required: hasJoin }]}>
                <Input style={{ width: 160 }} placeholder="左表关联字段（如 customer_id）" />
              </Form.Item>
              <Form.Item name={['join', 'rightField']} noStyle rules={[{ required: hasJoin }]}>
                <Input style={{ width: 160 }} placeholder="右表关联字段（如 id）" />
              </Form.Item>
            </Space>
          </>
        )}

        <Divider orientation="left" plain>
          筛选（可选）
        </Divider>
        <Form.Item>
          <Button type={hasFilter ? 'primary' : 'default'} onClick={() => setHasFilter(!hasFilter)}>
            {hasFilter ? '已启用筛选' : '启用筛选'}
          </Button>
        </Form.Item>

        {hasFilter && (
          <Form.Item
            label="筛选条件（JsonLogic JSON）"
            name="filter"
            extra={'例如：{">": [{"var":"amount"}, 1000]} 表示 amount > 1000'}
          >
            <Input.TextArea
              rows={4}
              placeholder='{"and":[{"==":[{"var":"status"},"active"]},{">":[{"var":"amount"},1000]}]}'
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Form.Item>
        )}

        <Divider orientation="left" plain>
          分组汇总（可选）
        </Divider>
        <Form.Item>
          <Space>
            <Button
              type={hasAggregation ? 'primary' : 'default'}
              onClick={() => setHasAggregation(!hasAggregation)}
            >
              {hasAggregation ? '已启用分组汇总' : '启用分组汇总'}
            </Button>
          </Space>
        </Form.Item>

        {hasAggregation && (
          <>
            <Form.Item label="分组字段（逗号分隔）" name={['aggregation', 'groupBy']}>
              <Input placeholder="status, category" />
            </Form.Item>
            <Text type="secondary" style={{ fontSize: 12 }}>
              聚合指标
            </Text>
            <Form.List name={['aggregation', 'metrics']}>
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name }) => (
                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                      <Form.Item name={[name, 'field']} noStyle rules={[{ required: true }]}>
                        <Input style={{ width: 120 }} placeholder="字段名" />
                      </Form.Item>
                      <Form.Item name={[name, 'function']} noStyle rules={[{ required: true }]}>
                        <Select style={{ width: 100 }} placeholder="函数" options={AGG_FUNCTIONS} />
                      </Form.Item>
                      <Form.Item name={[name, 'alias']} noStyle rules={[{ required: true }]}>
                        <Input style={{ width: 120 }} placeholder="输出列名" />
                      </Form.Item>
                      <Form.Item name={[name, 'label']} noStyle>
                        <Input style={{ width: 100 }} placeholder="显示名" />
                      </Form.Item>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(name)}
                      />
                    </Space>
                  ))}
                  <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add()}>
                    添加指标
                  </Button>
                </>
              )}
            </Form.List>
          </>
        )}

        <Divider orientation="left" plain>
          输出字段
        </Divider>
        <Form.List name="outputFields">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name }) => (
                <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Form.Item name={[name, 'source']} noStyle rules={[{ required: true }]}>
                    <Input style={{ width: 150 }} placeholder="源字段（如 status）" />
                  </Form.Item>
                  <Form.Item name={[name, 'alias']} noStyle rules={[{ required: true }]}>
                    <Input style={{ width: 120 }} placeholder="输出列名" />
                  </Form.Item>
                  <Form.Item name={[name, 'label']} noStyle>
                    <Input style={{ width: 100 }} placeholder="显示名" />
                  </Form.Item>
                  <Form.Item name={[name, 'type']} noStyle>
                    <Select style={{ width: 90 }} placeholder="类型" options={FIELD_TYPES} />
                  </Form.Item>
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => remove(name)}
                  />
                </Space>
              ))}
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add()}>
                添加输出字段
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}
