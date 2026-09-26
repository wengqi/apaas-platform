/**
 * 事件配置 Tab — 单个事件的动作链编辑器（从 EventsTab.tsx 拆分，
 * AGENTS.md 单文件 400 行规范）。
 */

import { Button, Select, Space, Divider, Typography, Popconfirm, Tag, Card } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ComponentNode, ActionConfig, ActionType } from '../../../api/pages.js';
import { ACTION_TYPE_OPTIONS } from './constants.js';
import { readActions, writeActions } from './actionProps.js';
import { ActionParamsEditor } from './ActionParamsEditor.js';

const { Text } = Typography;

/** 单个事件的动作链编辑器。 */
export function EventEditor({
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
