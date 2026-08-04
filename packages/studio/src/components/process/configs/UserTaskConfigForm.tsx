/**
 * 人工任务节点配置表单 —— 对齐 DESIGN-process.md §6.4。
 */

import { Divider, Form, Input, InputNumber, Select } from 'antd';

export interface UserTaskConfigData {
  taskName?: string;
  assigneeType?: string;
  assignee?: string;
  approvalMode?: string;
  formKey?: string;
  dueDate?: number;
  dueUnit?: string;
  title?: string;
  allowReject?: boolean;
  rejectToNodeId?: string;
}

export interface UserTaskConfigFormProps {
  data: UserTaskConfigData;
  onChange: (data: UserTaskConfigData) => void;
  disabled?: boolean;
  /** 表单候选(应用内 form_page) */
  formOptions?: { label: string; value: string }[];
  /** 流程中可选的驳回目标节点 */
  nodeOptions?: { label: string; value: string }[];
}

const ASSIGNEE_TYPE_OPTIONS = [
  { label: '指定用户', value: 'USER' },
  { label: '指定角色', value: 'ROLE' },
  { label: '指定组织', value: 'ORG' },
  { label: '上级主管', value: 'SUPERVISOR' },
  { label: '表单字段', value: 'FORM_FIELD' },
];

const APPROVAL_MODE_OPTIONS = [
  { label: '单人审批', value: 'SINGLE' },
  { label: '会签(全部同意)', value: 'COUNTERSIGN' },
  { label: '或签(任一同意)', value: 'OR_SIGN' },
];

const DUE_UNIT_OPTIONS = [
  { label: '秒', value: 'SECONDS' },
  { label: '分钟', value: 'MINUTES' },
  { label: '小时', value: 'HOURS' },
  { label: '天', value: 'DAYS' },
];

export default function UserTaskConfigForm({
  data,
  onChange,
  disabled = false,
  formOptions = [],
  nodeOptions = [],
}: UserTaskConfigFormProps) {
  const update = (patch: Partial<UserTaskConfigData>) =>
    onChange({ ...data, ...patch });

  const assigneeType = data.assigneeType || 'ROLE';
  const showAssignee = assigneeType !== 'SUPERVISOR';

  const assigneeLabel =
    assigneeType === 'USER'
      ? '审批用户 ID'
      : assigneeType === 'ROLE'
        ? '审批角色编码'
        : assigneeType === 'ORG'
          ? '组织编码'
          : '表单字段名';

  return (
    <Form layout="vertical" size="small" disabled={disabled} component="div">
      <Divider orientation="left" plain style={{ marginTop: 0 }}>
        审批任务配置
      </Divider>
      <Form.Item label="任务名称" required>
        <Input
          value={data.taskName}
          onChange={(e) => update({ taskName: e.target.value })}
          placeholder="合同审批"
        />
      </Form.Item>
      <Form.Item label="审批人类型" required>
        <Select
          value={data.assigneeType}
          onChange={(v) => update({ assigneeType: v })}
          options={ASSIGNEE_TYPE_OPTIONS}
        />
      </Form.Item>
      {showAssignee && (
        <Form.Item label={assigneeLabel} required>
          <Input
            value={data.assignee}
            onChange={(e) => update({ assignee: e.target.value })}
            placeholder={assigneeType === 'ROLE' ? 'ADMIN' : '输入编码'}
          />
        </Form.Item>
      )}
      <Form.Item label="审批模式" required>
        <Select
          value={data.approvalMode}
          onChange={(v) => update({ approvalMode: v })}
          options={APPROVAL_MODE_OPTIONS}
        />
      </Form.Item>
      <Form.Item label="任务表单(可选)">
        <Select
          value={data.formKey}
          onChange={(v) => update({ formKey: v })}
          options={formOptions}
          allowClear
          placeholder="选择审批表单"
        />
      </Form.Item>
      <Form.Item label="截止时间(可选)">
        <Input.Group compact>
          <InputNumber
            min={1}
            value={data.dueDate}
            onChange={(v) => update({ dueDate: v ?? undefined })}
            placeholder="48"
            style={{ width: '60%' }}
          />
          <Select
            value={data.dueUnit || 'HOURS'}
            onChange={(v) => update({ dueUnit: v })}
            options={DUE_UNIT_OPTIONS}
            style={{ width: '40%' }}
          />
        </Input.Group>
      </Form.Item>
      <Divider orientation="left" plain>驳回配置</Divider>
      <Form.Item label="允许驳回">
        <Select
          value={data.allowReject ? 'true' : 'false'}
          onChange={(v) => update({ allowReject: v === 'true', rejectToNodeId: v === 'true' ? data.rejectToNodeId : undefined })}
          options={[
            { label: '不允许', value: 'false' },
            { label: '允许驳回', value: 'true' },
          ]}
        />
      </Form.Item>
      {data.allowReject && (
        <Form.Item label="驳回目标节点" required>
          <Select
            value={data.rejectToNodeId}
            onChange={(v) => update({ rejectToNodeId: v })}
            options={nodeOptions}
            allowClear
            placeholder="选择驳回后跳回的节点"
          />
        </Form.Item>
      )}
    </Form>
  );
}
