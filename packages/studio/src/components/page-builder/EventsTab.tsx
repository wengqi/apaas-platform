/**
 * 事件配置 Tab — 可视化配置组件事件 → 动作链。
 *
 * 数据结构：事件配置存储在 node.props[eventName] 中，
 * 格式为 { __action: ActionConfig } 或 ActionConfig[]（动作链）。
 * ComponentRenderer 的 extractActions() 在运行时读取并执行。
 *
 * 支持 12 种 ActionType，重点支持 trigger_process（流程绑定页面）。
 */

import { useState, useEffect } from 'react';
import {
  Button,
  Select,
  Space,
  Empty,
  Typography,
  Divider,
  Input,
  Popconfirm,
  Tag,
  Card,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import { processesApi } from '../../api/processes.js';
import type { ProcessDef } from '../../api/processes.js';
import type { ComponentNode, ActionConfig, ActionType } from '../../api/pages.js';

const { Text } = Typography;

/** 组件类型 → 可用事件列表。 */
const COMPONENT_EVENTS: Partial<Record<string, string[]>> = {
  button: ['onClick'],
  form: ['onSubmit', 'onReset'],
  data_table: ['onRowClick'],
  page: ['onLoad'],
};

/** 动作类型 → 中文标签 + 描述。 */
const ACTION_TYPE_OPTIONS: { value: ActionType; label: string; desc: string }[] = [
  { value: 'trigger_process', label: '触发流程', desc: '启动一个流程实例' },
  { value: 'navigate', label: '页面跳转', desc: '跳转到指定页面或 URL' },
  { value: 'open_modal', label: '打开弹窗', desc: '打开一个弹窗组件' },
  { value: 'close_modal', label: '关闭弹窗', desc: '关闭当前弹窗' },
  { value: 'confirm', label: '弹出确认框', desc: '弹出确认对话框' },
  { value: 'toast', label: '弹出提示', desc: '显示一条提示消息' },
  { value: 'set_variable', label: '设置变量', desc: '设置视图模型变量的值' },
  { value: 'query_records', label: '查询记录', desc: '查询对象记录并填充到变量' },
  { value: 'create_record', label: '新增记录', desc: '创建一条新记录' },
  { value: 'update_record', label: '更新记录', desc: '更新一条记录' },
  { value: 'delete_record', label: '删除记录', desc: '删除一条记录' },
  { value: 'call_api', label: '调用 API', desc: '调用自定义 API' },
];

/**
 * 从 node.props 中读取指定事件的动作链。
 */
function readActions(node: ComponentNode, eventName: string): ActionConfig[] {
  const prop = node.props[eventName];
  if (!prop) return [];
  if (Array.isArray(prop)) {
    return prop.flatMap((p) => {
      if (p && typeof p === 'object' && '__action' in p) {
        return [(p as { __action: ActionConfig }).__action];
      }
      return [];
    });
  }
  if (prop && typeof prop === 'object' && '__action' in prop) {
    return [(prop as { __action: ActionConfig }).__action];
  }
  return [];
}

/**
 * 将动作链写回 node.props[eventName]。
 * 单个动作 → { __action: ActionConfig }
 * 多个动作 → ActionConfig[]（每个元素为 { __action: ActionConfig }）
 */
function writeActions(
  updateComponentProps: (id: string, props: Record<string, unknown>) => void,
  nodeId: string,
  eventName: string,
  actions: ActionConfig[],
) {
  if (actions.length === 0) {
    updateComponentProps(nodeId, { [eventName]: undefined });
    return;
  }
  if (actions.length === 1) {
    updateComponentProps(nodeId, { [eventName]: { __action: actions[0] } });
    return;
  }
  // 多个动作 → 数组
  const propValue = actions.map((a) => ({ __action: a }));
  updateComponentProps(nodeId, { [eventName]: propValue });
}

/** 动作参数配置表单。 */
function ActionParamsEditor({
  action,
  onChange,
  appId,
}: {
  action: ActionConfig;
  onChange: (params: Record<string, unknown>) => void;
  appId?: string;
}) {
  const [processes, setProcesses] = useState<ProcessDef[]>([]);

  // trigger_process 需要加载流程列表
  useEffect(() => {
    if (action.type === 'trigger_process' && appId) {
      processesApi
        .list(appId)
        .then(setProcesses)
        .catch(() => {});
    }
  }, [action.type, appId]);

  const params = action.params ?? {};

  switch (action.type) {
    case 'trigger_process':
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Text type="secondary" style={{ fontSize: 12 }}>
            选择流程
          </Text>
          <Select
            style={{ width: '100%' }}
            placeholder="选择要触发的流程"
            value={(params.processId as string) ?? undefined}
            onChange={(v) => onChange({ ...params, processId: v })}
            options={processes.map((p) => ({
              value: p.id,
              label: `${p.name} (${p.processKey})`,
            }))}
          />
          <Text type="secondary" style={{ fontSize: 11 }}>
            点击按钮时将启动该流程，页面表单数据自动作为流程变量传入。
          </Text>
        </Space>
      );

    case 'navigate':
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Text type="secondary" style={{ fontSize: 12 }}>
            跳转路径
          </Text>
          <Input
            placeholder="/app/xxx/page-slug 或 https://..."
            value={(params.path as string) ?? ''}
            onChange={(e) => onChange({ ...params, path: e.target.value })}
          />
        </Space>
      );

    case 'toast':
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Text type="secondary" style={{ fontSize: 12 }}>
            提示消息
          </Text>
          <Input
            placeholder="显示给用户的消息"
            value={(params.message as string) ?? ''}
            onChange={(e) => onChange({ ...params, message: e.target.value })}
          />
          <Select
            size="small"
            style={{ width: '100%' }}
            value={(params.type as string) ?? 'success'}
            onChange={(v) => onChange({ ...params, type: v })}
            options={[
              { value: 'success', label: '成功' },
              { value: 'warning', label: '警告' },
              { value: 'error', label: '错误' },
              { value: 'info', label: '信息' },
            ]}
          />
        </Space>
      );

    case 'confirm':
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Text type="secondary" style={{ fontSize: 12 }}>
            确认提示
          </Text>
          <Input
            placeholder="确定要执行此操作吗？"
            value={(params.message as string) ?? ''}
            onChange={(e) => onChange({ ...params, message: e.target.value })}
          />
        </Space>
      );

    case 'set_variable':
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Text type="secondary" style={{ fontSize: 12 }}>
            变量路径
          </Text>
          <Input
            placeholder="vm.fieldName 或 vm.list.0.name"
            value={(params.variable as string) ?? ''}
            onChange={(e) => onChange({ ...params, variable: e.target.value })}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            值
          </Text>
          <Input
            placeholder="要设置的值"
            value={(params.value as string) ?? ''}
            onChange={(e) => onChange({ ...params, value: e.target.value })}
          />
        </Space>
      );

    case 'open_modal':
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Text type="secondary" style={{ fontSize: 12 }}>
            弹窗组件 ID
          </Text>
          <Input
            placeholder="输入弹窗组件的节点 ID"
            value={(params.modalId as string) ?? ''}
            onChange={(e) => onChange({ ...params, modalId: e.target.value })}
          />
        </Space>
      );

    default:
      return (
        <Text type="secondary" style={{ fontSize: 11 }}>
          此动作类型无需额外参数配置。
        </Text>
      );
  }
}

/** 事件配置 Tab 主组件。 */
export function EventsTab({ node }: { node: ComponentNode }) {
  const updateComponentProps = usePageBuilderStore((s) => s.updateComponentProps);
  const currentPage = usePageBuilderStore((s) => s.currentPage);
  const appId = currentPage?.appId;

  const availableEvents = COMPONENT_EVENTS[node.type] ?? [];

  if (availableEvents.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Text type="secondary" style={{ fontSize: 12 }}>
            此组件类型（{node.type}）不支持事件配置
          </Text>
        }
      />
    );
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {availableEvents.map((eventName) => (
        <EventEditor
          key={eventName}
          node={node}
          eventName={eventName}
          appId={appId}
          updateComponentProps={updateComponentProps}
        />
      ))}
    </Space>
  );
}

/** 单个事件的动作链编辑器。 */
function EventEditor({
  node,
  eventName,
  appId,
  updateComponentProps,
}: {
  node: ComponentNode;
  eventName: string;
  appId?: string;
  updateComponentProps: (id: string, props: Record<string, unknown>) => void;
}) {
  const actions = readActions(node, eventName);

  const updateActions = (newActions: ActionConfig[]) => {
    writeActions(updateComponentProps, node.id, eventName, newActions);
  };

  const addAction = () => {
    updateActions([...actions, { type: 'trigger_process', params: {} }]);
  };

  const removeAction = (index: number) => {
    updateActions(actions.filter((_, i) => i !== index));
  };

  const moveAction = (index: number, direction: 'up' | 'down') => {
    const newActions = [...actions];
    if (direction === 'up' && index > 0) {
      const tmp = newActions[index]!;
      newActions[index] = newActions[index - 1]!;
      newActions[index - 1] = tmp;
    } else if (direction === 'down' && index < newActions.length - 1) {
      const tmp = newActions[index]!;
      newActions[index] = newActions[index + 1]!;
      newActions[index + 1] = tmp;
    }
    updateActions(newActions);
  };

  const updateAction = (index: number, updated: ActionConfig) => {
    const newActions = [...actions];
    newActions[index] = updated;
    updateActions(newActions);
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          <ThunderboltOutlined />
          <Text strong>{eventName}</Text>
          {actions.length > 0 && <Tag color="blue">{actions.length} 个动作</Tag>}
        </Space>
      }
      extra={
        <Button type="link" size="small" icon={<PlusOutlined />} onClick={addAction}>
          添加动作
        </Button>
      }
    >
      {actions.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          点击「添加动作」配置 {eventName} 事件触发后执行的动作
        </Text>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          {actions.map((action, index) => (
            <Card
              key={index}
              size="small"
              style={{ background: '#fafbfc' }}
              title={
                <Space size="small">
                  <Tag color="default">{index + 1}</Tag>
                  <Select
                    size="small"
                    style={{ width: 140 }}
                    value={action.type}
                    onChange={(v: ActionType) => updateAction(index, { type: v, params: {} })}
                    options={ACTION_TYPE_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                    }))}
                  />
                </Space>
              }
              extra={
                <Space size="small">
                  <Button
                    type="text"
                    size="small"
                    icon={<ArrowUpOutlined />}
                    disabled={index === 0}
                    onClick={() => moveAction(index, 'up')}
                  />
                  <Button
                    type="text"
                    size="small"
                    icon={<ArrowDownOutlined />}
                    disabled={index === actions.length - 1}
                    onClick={() => moveAction(index, 'down')}
                  />
                  <Popconfirm title="确定删除此动作？" onConfirm={() => removeAction(index)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              }
            >
              <ActionParamsEditor
                action={action}
                appId={appId}
                onChange={(params) =>
                  updateAction(index, {
                    type: action.type,
                    params: params as Record<string, never>,
                  })
                }
              />
            </Card>
          ))}
          <Divider style={{ margin: '4px 0' }} />
          <Text type="secondary" style={{ fontSize: 11 }}>
            动作将按顺序串行执行。上方动作完成后才会执行下一个。
          </Text>
        </Space>
      )}
    </Card>
  );
}
