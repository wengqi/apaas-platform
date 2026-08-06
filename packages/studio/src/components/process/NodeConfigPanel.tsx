/**
 * 节点配置面板(右栏) —— 对齐 DESIGN-process.md §3.5。
 *
 * 选中节点后,按节点 type 动态渲染配置表单(基于 AntD Form + configs/*)。
 * 通用项:节点标题;类型专属项:按 type 渲染对应配置表单。
 */

import { useMemo } from 'react';
import { Button, Divider, Empty, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { WorkflowNode, WorkflowSchema } from '@apaas/shared';
import { getNodeMeta } from '../../constants/process.js';

import TriggerConfigForm from './configs/TriggerConfigForm.js';
import ObjectOperationConfigForm from './configs/ObjectOperationConfigForm.js';
import ConditionConfigForm from './configs/ConditionConfigForm.js';
import UserTaskConfigForm from './configs/UserTaskConfigForm.js';
import NotificationConfigForm from './configs/NotificationConfigForm.js';
import HttpRequestConfigForm from './configs/HttpRequestConfigForm.js';
import AssignConfigForm from './configs/AssignConfigForm.js';
import DelayConfigForm from './configs/DelayConfigForm.js';
import EndConfigForm from './configs/EndConfigForm.js';

const { Text: _Text, Title } = Typography;

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
  /** 流程中所有节点(驳回目标选择用) */
  nodeOptions?: { label: string; value: string }[];
  /** 流程 Schema（条件表达式变量解析用） */
  schema?: WorkflowSchema;
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
  nodeOptions = [],
  schema,
  onNodeDataChange,
  onDeleteNode,
}: NodeConfigPanelProps) {
  const meta = useMemo(() => (node ? getNodeMeta(node.type) : null), [node]);

  if (!node || !meta) {
    return (
      <div style={{ padding: '8px 16px' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选中一个节点以配置" />
      </div>
    );
  }

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
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
    >
      {/* 表单区 */}
      <div style={{ padding: '8px 16px' }}>
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
          style={{ marginTop: 4, marginBottom: 12 }}
        >
          {(node.data?.title as string) ?? meta.label}
        </Title>

        <Divider style={{ margin: '8px 0 12px' }} />

        {/* 类型专属配置 */}
        {renderConfigForm(node.type, nodeData, handleConfigChange, readonly, {
          objectOptions,
          formOptions,
          templateOptions,
          nodeOptions,
          schema,
          currentNodeId: node.id,
        })}
      </div>

      {/* 底部操作 */}
      {!readonly && (
        <div
          style={{
            padding: '4px 16px 8px',
            borderTop: '1px solid #f0f2f5',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            size="small"
            // 直接删除,不弹确认框(flowgram 画布 overlay 拦截 DOM 事件,
            // 导致 Popconfirm/Modal.confirm/window.confirm 均无法触发)
            onClick={() => onDeleteNode?.(node.id)}
          >
            删除节点
          </Button>
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
    nodeOptions: { label: string; value: string }[];
    schema?: WorkflowSchema;
    currentNodeId?: string;
  },
) {
  switch (type) {
    case 'trigger':
      return (
        <TriggerConfigForm
          data={data as never}
          onChange={onChange as never}
          disabled={readonly}
          objectOptions={options.objectOptions}
        />
      );
    case 'objectOperation':
      return (
        <ObjectOperationConfigForm
          data={data as never}
          onChange={onChange as never}
          disabled={readonly}
          objectOptions={options.objectOptions}
        />
      );
    case 'condition':
      return (
        <ConditionConfigForm
          data={data as never}
          onChange={onChange as never}
          disabled={readonly}
          schema={options.schema}
          currentNodeId={options.currentNodeId}
        />
      );
    case 'userTask':
      return (
        <UserTaskConfigForm
          data={data as never}
          onChange={onChange as never}
          disabled={readonly}
          formOptions={options.formOptions}
          nodeOptions={options.nodeOptions}
        />
      );
    case 'notification':
      return (
        <NotificationConfigForm
          data={data as never}
          onChange={onChange as never}
          disabled={readonly}
          templateOptions={options.templateOptions}
        />
      );
    case 'httpRequest':
      return (
        <HttpRequestConfigForm
          data={data as never}
          onChange={onChange as never}
          disabled={readonly}
        />
      );
    case 'assign':
      return (
        <AssignConfigForm data={data as never} onChange={onChange as never} disabled={readonly} />
      );
    case 'delay':
      return (
        <DelayConfigForm data={data as never} onChange={onChange as never} disabled={readonly} />
      );
    case 'end':
      return (
        <EndConfigForm data={data as never} onChange={onChange as never} disabled={readonly} />
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
