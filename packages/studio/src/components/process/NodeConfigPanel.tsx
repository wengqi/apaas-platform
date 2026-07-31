/**
 * 节点配置面板(右栏) —— 对齐 DESIGN-process.md §3.5。
 *
 * 选中节点后,按节点 type 动态渲染配置表单(基于 AntD Form + configs/*)。
 * 通用项:节点标题;类型专属项:按 type 渲染对应配置表单。
 */

import { useMemo } from 'react';
import { Button, Empty, Popconfirm, Space, Tag, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { WorkflowNode } from '@apaas/shared';
import { getNodeMeta } from '../../constants/process.js';
import { useProcessEditorStore } from '../../stores/processEditor.js';

import TriggerConfigForm from './configs/TriggerConfigForm.js';
import ObjectOperationConfigForm from './configs/ObjectOperationConfigForm.js';
import ConditionConfigForm from './configs/ConditionConfigForm.js';
import UserTaskConfigForm from './configs/UserTaskConfigForm.js';
import NotificationConfigForm from './configs/NotificationConfigForm.js';
import HttpRequestConfigForm from './configs/HttpRequestConfigForm.js';
import AssignConfigForm from './configs/AssignConfigForm.js';
import DelayConfigForm from './configs/DelayConfigForm.js';
import EndConfigForm from './configs/EndConfigForm.js';

const { Text, Title } = Typography;

export interface NodeConfigPanelProps {
  /** 选中节点(由父组件传入;若为 null 显示空状态) */
  node: WorkflowNode | null;
  /** 只读模式 */
  readonly?: boolean;
  /** 对象候选(对象操作/触发器用) */
  objectOptions?: { label: string; value: string }[];
  /** 表单候选(人工任务用) */
  formOptions?: { label: string; value: string }[];
  /** 通知模版候选 */
  templateOptions?: { label: string; value: string }[];
  /** 节点 data 变更回调 */
  onNodeDataChange?: (nodeId: string, data: Record<string, unknown>) => void;
  /** 删除节点回调 */
  onDeleteNode?: (nodeId: string) => void;
}

export default function NodeConfigPanel({
  node,
  readonly = false,
  objectOptions = [],
  formOptions = [],
  templateOptions = [],
  onNodeDataChange,
  onDeleteNode,
}: NodeConfigPanelProps) {
  const meta = useMemo(
    () => (node ? getNodeMeta(node.type) : null),
    [node],
  );

  if (!node || !meta) {
    return (
      <div
        style={{
          width: 360,
          flexShrink: 0,
          height: '100%',
          background: '#fff',
          borderLeft: '1px solid #eef0f4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="选中一个节点以配置"
        />
      </div>
    );
  }

  const Icon = meta.icon;
  const nodeData = (node.data ?? {}) as Record<string, unknown>;

  /** 通用:节点标题变更。 */
  const handleTitleChange = (title: string) => {
    onNodeDataChange?.(node.id, { ...nodeData, title });
  };

  /** 类型专属配置变更(合并到 nodeData)。 */
  const handleConfigChange = (config: Record<string, unknown>) => {
    onNodeDataChange?.(node.id, { ...nodeData, ...config });
  };

  return (
    <div
      style={{
        width: 360,
        flexShrink: 0,
        height: '100%',
        background: '#fff',
        borderLeft: '1px solid #eef0f4',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 选中节点头 */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #eef0f4',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          flexShrink: 0,
        }}
      >
        <Space align="center" size={8}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)`,
              color: '#fff',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon style={{ fontSize: 16 }} />
          </div>
          <Text strong style={{ fontSize: 14 }}>
            {node.data?.title ?? meta.label}
          </Text>
          {readonly && <Tag color="default">只读</Tag>}
        </Space>
        <Text code style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
          {node.id}
        </Text>
      </div>

      {/* 表单区 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* 通用:节点标题 */}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          节点标题
        </Typography.Text>
        <Title
          level={5}
          editable={
            readonly
              ? undefined
              : {
                  onChange: handleTitleChange,
                  tooltip: '点击编辑节点标题',
                }
          }
          style={{ marginTop: 4, marginBottom: 16 }}
        >
          {(node.data?.title as string) ?? meta.label}
        </Title>

        {/* 类型专属配置 */}
        {renderConfigForm(node.type, nodeData, handleConfigChange, readonly, {
          objectOptions,
          formOptions,
          templateOptions,
        })}
      </div>

      {/* 底部操作 */}
      {!readonly && (
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid #eef0f4',
            display: 'flex',
            justifyContent: 'flex-end',
            flexShrink: 0,
          }}
        >
          <Popconfirm
            title="删除节点"
            description="确定删除此节点吗?"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDeleteNode?.(node.id)}
          >
            <Button type="text" danger icon={<DeleteOutlined />} size="small">
              删除节点
            </Button>
          </Popconfirm>
        </div>
      )}
    </div>
  );
}

/** 根据节点 type 渲染对应配置表单。 */
function renderConfigForm(
  type: string,
  data: Record<string, unknown>,
  onChange: (config: Record<string, unknown>) => void,
  readonly: boolean,
  options: {
    objectOptions: { label: string; value: string }[];
    formOptions: { label: string; value: string }[];
    templateOptions: { label: string; value: string }[];
  },
) {
  switch (type) {
    case 'trigger':
      return (
        <TriggerConfigForm
          data={data as never}
          onChange={onChange}
          disabled={readonly}
          objectOptions={options.objectOptions}
        />
      );
    case 'objectOperation':
      return (
        <ObjectOperationConfigForm
          data={data as never}
          onChange={onChange}
          disabled={readonly}
          objectOptions={options.objectOptions}
        />
      );
    case 'condition':
      return (
        <ConditionConfigForm
          data={data as never}
          onChange={onChange}
          disabled={readonly}
        />
      );
    case 'userTask':
      return (
        <UserTaskConfigForm
          data={data as never}
          onChange={onChange}
          disabled={readonly}
          formOptions={options.formOptions}
        />
      );
    case 'notification':
      return (
        <NotificationConfigForm
          data={data as never}
          onChange={onChange}
          disabled={readonly}
          templateOptions={options.templateOptions}
        />
      );
    case 'httpRequest':
      return (
        <HttpRequestConfigForm
          data={data as never}
          onChange={onChange}
          disabled={readonly}
        />
      );
    case 'assign':
      return (
        <AssignConfigForm
          data={data as never}
          onChange={onChange}
          disabled={readonly}
        />
      );
    case 'delay':
      return (
        <DelayConfigForm
          data={data as never}
          onChange={onChange}
          disabled={readonly}
        />
      );
    case 'end':
      return (
        <EndConfigForm
          data={data as never}
          onChange={onChange}
          disabled={readonly}
        />
      );
    case 'start':
      return (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          开始节点定义流程输入参数,无需额外配置。
        </Typography.Text>
      );
    default:
      return (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          该节点类型暂不支持可视化配置。
        </Typography.Text>
      );
  }
}

/** 便捷 hook:从 store 取选中节点。 */
export function useSelectedNode(): WorkflowNode | null {
  const schema = useProcessEditorStore((s) => s.schema);
  const selectedNodeId = useProcessEditorStore((s) => s.selectedNodeId);
  if (!schema || !selectedNodeId) return null;
  return schema.nodes.find((n) => n.id === selectedNodeId) ?? null;
}
