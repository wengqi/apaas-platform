/**
 * 节点配置面板 — 根据选中节点类型显示不同配置表单。
 *
 * 复用 DataFlowFormModal 中的表单字段逻辑，但以独立面板形式呈现。
 */

import { useEffect } from 'react';
import { Form, Input, Select, Button, Divider, Space, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type {
  DataFlowConfig,
  JoinConfig,
  AggregationConfig,
  OutputFieldConfig,
} from '../../api/datasets.js';
import type { ObjectInfo } from '../../api/objects.js';

const { Text } = Typography;

const JOIN_TYPES = [
  { value: 'left', label: '左关联 (LEFT JOIN)' },
  { value: 'inner', label: '内关联 (INNER JOIN)' },
];

const AGGREGATE_FUNCTIONS = [
  { value: 'sum', label: '求和 (SUM)' },
  { value: 'count', label: '计数 (COUNT)' },
  { value: 'avg', label: '平均值 (AVG)' },
  { value: 'max', label: '最大值 (MAX)' },
  { value: 'min', label: '最小值 (MIN)' },
];

const OUTPUT_TYPES = [
  { value: 'string', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
];

export type SelectedNode =
  | { type: 'dataSource'; index: number }
  | { type: 'join' }
  | { type: 'filter' }
  | { type: 'aggregation' }
  | { type: 'output' }
  | null;

interface NodeConfigPanelProps {
  selected: SelectedNode;
  config: DataFlowConfig;
  objects: ObjectInfo[];
  onChange: (config: DataFlowConfig) => void;
  onClose: () => void;
}

export default function NodeConfigPanel({
  selected,
  config,
  objects,
  onChange,
  onClose,
}: NodeConfigPanelProps) {
  const [form] = Form.useForm();

  // 选中节点变化时同步表单值
  useEffect(() => {
    if (!selected) return;
    if (selected.type === 'dataSource') {
      const src = config.sources[selected.index];
      if (src) form.setFieldsValue(src);
    } else if (selected.type === 'join') {
      form.setFieldsValue(config.join ?? { type: 'left' });
    } else if (selected.type === 'filter') {
      form.setFieldsValue({
        filter: config.filter ? JSON.stringify(config.filter, null, 2) : '',
      });
    } else if (selected.type === 'aggregation') {
      const agg = config.aggregation;
      form.setFieldsValue({
        groupBy: agg?.groupBy?.join(', ') ?? '',
        metrics: agg?.metrics ?? [],
      });
    } else if (selected.type === 'output') {
      form.setFieldsValue({ outputFields: config.outputFields ?? [] });
    }
  }, [selected, config, form]);

  if (!selected) {
    return (
      <div className="dataflow-config-panel" style={{ padding: 16 }}>
        <Text type="secondary">点击节点查看配置</Text>
      </div>
    );
  }

  const objectOptions = objects.map((o) => ({
    value: o.id,
    label: o.label || o.name || o.apiName,
  }));

  const aliasOptions = config.sources.map((s) => ({
    value: s.alias,
    label: s.alias,
  }));

  /** 更新数据源。 */
  const updateSource = (index: number, values: Record<string, unknown>) => {
    const sources = [...config.sources];
    const current = sources[index];
    if (current) {
      sources[index] = {
        objectId: typeof values.objectId === 'string' ? values.objectId : current.objectId,
        alias: typeof values.alias === 'string' ? values.alias : current.alias,
      };
    }
    onChange({ ...config, sources });
  };

  /** 更新 join。 */
  const updateJoin = (values: Partial<JoinConfig>) => {
    onChange({
      ...config,
      join: {
        ...(config.join ?? {
          leftAlias: '',
          rightAlias: '',
          type: 'left',
          leftField: '',
          rightField: '',
        }),
        ...values,
      },
    });
  };

  /** 更新 filter。 */
  const updateFilter = (filterText: string) => {
    try {
      const parsed = filterText.trim() ? JSON.parse(filterText) : null;
      onChange({ ...config, filter: parsed });
    } catch {
      // JSON 解析失败时不更新，等用户修正
    }
  };

  /** 更新 aggregation。 */
  const updateAggregation = (values: Partial<AggregationConfig>) => {
    const current = config.aggregation ?? { groupBy: [], metrics: [] };
    onChange({ ...config, aggregation: { ...current, ...values } });
  };

  /** 更新 outputFields。 */
  const updateOutputFields = (fields: OutputFieldConfig[]) => {
    onChange({ ...config, outputFields: fields });
  };

  const panelTitle = {
    dataSource: '数据源配置',
    join: '关联配置',
    filter: '筛选配置',
    aggregation: '分组汇总配置',
    output: '输出字段配置',
  }[selected.type];

  return (
    <div className="dataflow-config-panel">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <Text strong>{panelTitle}</Text>
        <Button type="text" size="small" onClick={onClose}>
          ✕
        </Button>
      </div>

      <div style={{ padding: 16 }}>
        {selected.type === 'dataSource' && (
          <Form
            form={form}
            layout="vertical"
            size="small"
            onValuesChange={(_, all) => updateSource(selected.index, all)}
          >
            <Form.Item name="objectId" label="数据对象" rules={[{ required: true }]}>
              <Select options={objectOptions} placeholder="选择对象" />
            </Form.Item>
            <Form.Item name="alias" label="别名" rules={[{ required: true }]}>
              <Input placeholder="如 orders" />
            </Form.Item>
          </Form>
        )}

        {selected.type === 'join' && (
          <Form
            form={form}
            layout="vertical"
            size="small"
            onValuesChange={(_, all) => updateJoin(all)}
          >
            <Form.Item name="leftAlias" label="左表" rules={[{ required: true }]}>
              <Select options={aliasOptions} placeholder="选择左表" />
            </Form.Item>
            <Form.Item name="rightAlias" label="右表" rules={[{ required: true }]}>
              <Select options={aliasOptions} placeholder="选择右表" />
            </Form.Item>
            <Form.Item name="type" label="关联类型">
              <Select options={JOIN_TYPES} />
            </Form.Item>
            <Form.Item name="leftField" label="左表字段">
              <Input placeholder="如 customer_id" />
            </Form.Item>
            <Form.Item name="rightField" label="右表字段">
              <Input placeholder="如 id" />
            </Form.Item>
          </Form>
        )}

        {selected.type === 'filter' && (
          <Form form={form} layout="vertical" size="small">
            <Form.Item name="filter" label="筛选条件 (JsonLogic JSON)">
              <Input.TextArea
                rows={8}
                placeholder='{"and":[{"==":[{"var":"status"},"active"]}]}'
                onChange={(e) => updateFilter(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </Form.Item>
            <Text type="secondary" style={{ fontSize: 12 }}>
              使用 JsonLogic 格式编辑筛选条件
            </Text>
          </Form>
        )}

        {selected.type === 'aggregation' && (
          <Form
            form={form}
            layout="vertical"
            size="small"
            onValuesChange={(_, all) => {
              const groupBy =
                typeof all.groupBy === 'string'
                  ? all.groupBy
                      .split(',')
                      .map((s: string) => s.trim())
                      .filter(Boolean)
                  : [];
              updateAggregation({ groupBy, metrics: all.metrics ?? [] });
            }}
          >
            <Form.Item name="groupBy" label="分组字段（逗号分隔）">
              <Input placeholder="如 status, category" />
            </Form.Item>
            <Divider style={{ margin: '8px 0' }}>聚合指标</Divider>
            <Form.List name="metrics">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name }) => (
                    <Space
                      key={key}
                      direction="vertical"
                      style={{ width: '100%', marginBottom: 8 }}
                    >
                      <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name={[name, 'field']} noStyle>
                          <Input placeholder="字段" style={{ width: '35%' }} />
                        </Form.Item>
                        <Form.Item name={[name, 'function']} noStyle>
                          <Select options={AGGREGATE_FUNCTIONS} style={{ width: '35%' }} />
                        </Form.Item>
                        <Form.Item name={[name, 'alias']} noStyle>
                          <Input placeholder="别名" style={{ width: '20%' }} />
                        </Form.Item>
                        <Button
                          icon={<DeleteOutlined />}
                          onClick={() => remove(name)}
                          danger
                          size="small"
                        />
                      </Space.Compact>
                    </Space>
                  ))}
                  <Button type="dashed" size="small" block onClick={() => add({})}>
                    + 添加指标
                  </Button>
                </>
              )}
            </Form.List>
          </Form>
        )}

        {selected.type === 'output' && (
          <Form
            form={form}
            layout="vertical"
            size="small"
            onValuesChange={(_, all) => updateOutputFields(all.outputFields ?? [])}
          >
            <Form.List name="outputFields">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name }) => (
                    <Space
                      key={key}
                      direction="vertical"
                      style={{ width: '100%', marginBottom: 8 }}
                    >
                      <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name={[name, 'source']} noStyle>
                          <Input placeholder="源字段" style={{ width: '30%' }} />
                        </Form.Item>
                        <Form.Item name={[name, 'alias']} noStyle>
                          <Input placeholder="别名" style={{ width: '25%' }} />
                        </Form.Item>
                        <Form.Item name={[name, 'label']} noStyle>
                          <Input placeholder="标签" style={{ width: '25%' }} />
                        </Form.Item>
                        <Form.Item name={[name, 'type']} noStyle>
                          <Select options={OUTPUT_TYPES} style={{ width: '15%' }} />
                        </Form.Item>
                        <Button
                          icon={<DeleteOutlined />}
                          onClick={() => remove(name)}
                          danger
                          size="small"
                        />
                      </Space.Compact>
                    </Space>
                  ))}
                  <Button type="dashed" size="small" block onClick={() => add({ type: 'string' })}>
                    + 添加输出字段
                  </Button>
                </>
              )}
            </Form.List>
          </Form>
        )}
      </div>
    </div>
  );
}
