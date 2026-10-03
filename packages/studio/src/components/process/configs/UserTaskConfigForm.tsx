/**
 * 人工任务节点配置表单 —— 对齐 DESIGN-process.md §6.4。
 *
 * QA 交互评审（2026-10-03）：指定审批人从「手输用户 ID」改为成员搜索选择器
 * （对齐飞书 aPaaS/钉钉审批的成员选择交互）——搭建者不应被要求知道内部用户 ID。
 * 会签/或签/依次模式暴露 approveUsers 多选（引擎 UserTaskExecutor 消费的数组字段，
 * 此前面板未提供，只能靠 API 写入）。
 */

import { Divider, Form, Input, InputNumber, Select, Switch } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { usersApi } from '../../../api/permissions.js';

export interface UserTaskConfigData {
  taskName?: string;
  assigneeType?: string;
  assignee?: string;
  /** 会签/或签/依次模式的审批人集合（引擎 approveUsers 数组） */
  approveUsers?: string[];
  /** 展示用缓存：所选审批人姓名（节点摘要显示姓名而非 ID） */
  assigneeName?: string;
  assigneeNames?: string[];
  approvalMode?: string;
  formKey?: string;
  dueDate?: number;
  dueUnit?: string;
  title?: string;
  allowReject?: boolean;
  rejectToNodeId?: string;
  // --- 抄送配置 ---
  ccEnabled?: boolean;
  ccAssigneeType?: string;
  ccRecipients?: string[];
  ccTrigger?: string;
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

// 评审整改：导出枚举选项，供节点副标题(nodeMetadata)复用做中文标签映射，避免映射表两处维护
export const ASSIGNEE_TYPE_OPTIONS = [
  { label: '指定用户', value: 'USER' },
  { label: '指定角色', value: 'ROLE' },
  { label: '指定组织', value: 'ORG' },
  { label: '上级主管', value: 'SUPERVISOR' },
  { label: '表单字段', value: 'FORM_FIELD' },
];

export const APPROVAL_MODE_OPTIONS = [
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

const CC_ASSIGNEE_TYPE_OPTIONS = [
  { label: '指定用户', value: 'USER' },
  { label: '指定角色', value: 'ROLE' },
  { label: '指定组织', value: 'ORG' },
];

const CC_TRIGGER_OPTIONS = [
  { label: '审批通过时', value: 'onApprove' },
  { label: '审批驳回时', value: 'onReject' },
  { label: '完成时（通过或驳回）', value: 'onComplete' },
];

export default function UserTaskConfigForm({
  data,
  onChange,
  disabled = false,
  formOptions = [],
  nodeOptions = [],
}: UserTaskConfigFormProps) {
  const update = (patch: Partial<UserTaskConfigData>) => onChange({ ...data, ...patch });

  // 成员选择器数据源（React Query 缓存全局共享，多节点配置不重复请求）
  const { data: users } = useQuery({ queryKey: qk.users(), queryFn: () => usersApi.list() });
  const userOptions = (users ?? []).map((u) => ({
    label: `${u.name} (${u.email})`,
    value: u.id,
  }));
  const userNameById = new Map((users ?? []).map((u) => [u.id, u.name]));

  const assigneeType = data.assigneeType || 'ROLE';
  const showAssignee = assigneeType !== 'SUPERVISOR';
  // 会签/或签/依次 = 多人审批 → 引擎 approveUsers 数组路径；单人 → assignee 单值
  const isMultiApprover =
    assigneeType === 'USER' &&
    ['COUNTERSIGN', 'OR_SIGN', 'SEQUENTIAL'].includes(data.approvalMode ?? '');

  const assigneeLabel =
    assigneeType === 'USER'
      ? isMultiApprover
        ? '审批人（可多选）'
        : '审批人'
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
      {showAssignee && assigneeType === 'USER' && isMultiApprover && (
        <Form.Item label={assigneeLabel} required>
          <Select
            mode="multiple"
            showSearch
            optionFilterProp="label"
            value={data.approveUsers ?? []}
            onChange={(ids: string[]) =>
              update({
                approveUsers: ids,
                assigneeNames: ids.map((id) => userNameById.get(id) ?? id),
              })
            }
            options={userOptions}
            placeholder="搜索姓名或邮箱选择审批人"
          />
        </Form.Item>
      )}
      {showAssignee && !(assigneeType === 'USER' && isMultiApprover) && (
        <Form.Item label={assigneeLabel} required>
          {assigneeType === 'USER' ? (
            <Select
              showSearch
              optionFilterProp="label"
              value={data.assignee}
              onChange={(id: string) =>
                update({ assignee: id, assigneeName: userNameById.get(id) ?? id })
              }
              options={userOptions}
              placeholder="搜索姓名或邮箱选择审批人"
              allowClear
            />
          ) : (
            <Input
              value={data.assignee}
              onChange={(e) => update({ assignee: e.target.value })}
              placeholder={assigneeType === 'ROLE' ? 'ADMIN' : '输入编码'}
            />
          )}
        </Form.Item>
      )}
      <Form.Item label="审批模式" required>
        <Select
          value={data.approvalMode}
          onChange={(v) => {
            // 单人↔多人切换时迁移已选审批人（assignee ↔ approveUsers），不清空用户输入
            const patch: Partial<UserTaskConfigData> = { approvalMode: v };
            if (assigneeType === 'USER') {
              const toMulti = ['COUNTERSIGN', 'OR_SIGN', 'SEQUENTIAL'].includes(v);
              if (toMulti && data.assignee) {
                patch.approveUsers = [data.assignee, ...(data.approveUsers ?? [])];
                patch.assigneeNames = [
                  data.assigneeName ?? data.assignee,
                  ...(data.assigneeNames ?? []),
                ];
                patch.assignee = undefined;
                patch.assigneeName = undefined;
              } else if (!toMulti && data.approveUsers?.length) {
                patch.assignee = data.approveUsers[0];
                patch.assigneeName = data.assigneeNames?.[0] ?? data.approveUsers[0];
                patch.approveUsers = undefined;
                patch.assigneeNames = undefined;
              }
            }
            update(patch);
          }}
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
      <Divider orientation="left" plain>
        驳回配置
      </Divider>
      <Form.Item label="允许驳回">
        <Select
          value={data.allowReject ? 'true' : 'false'}
          onChange={(v) =>
            update({
              allowReject: v === 'true',
              rejectToNodeId: v === 'true' ? data.rejectToNodeId : undefined,
            })
          }
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
      <Divider orientation="left" plain>
        抄送配置
      </Divider>
      <Form.Item label="启用抄送">
        <Switch
          checked={data.ccEnabled ?? false}
          onChange={(checked) => update({ ccEnabled: checked })}
        />
      </Form.Item>
      {data.ccEnabled && (
        <>
          <Form.Item label="抄送人类型" required>
            <Select
              value={data.ccAssigneeType || 'USER'}
              onChange={(v) => update({ ccAssigneeType: v })}
              options={CC_ASSIGNEE_TYPE_OPTIONS}
            />
          </Form.Item>
          <Form.Item label="抄送目标 ID" required>
            <Select
              mode="tags"
              value={data.ccRecipients ?? []}
              onChange={(v) => update({ ccRecipients: v })}
              placeholder={
                data.ccAssigneeType === 'ROLE'
                  ? '输入角色 ID（回车添加）'
                  : data.ccAssigneeType === 'ORG'
                    ? '输入组织 ID（回车添加）'
                    : '输入用户 ID（回车添加）'
              }
              tokenSeparators={[',']}
            />
          </Form.Item>
          <Form.Item label="触发时机" required>
            <Select
              value={data.ccTrigger || 'onApprove'}
              onChange={(v) => update({ ccTrigger: v })}
              options={CC_TRIGGER_OPTIONS}
            />
          </Form.Item>
        </>
      )}
    </Form>
  );
}
