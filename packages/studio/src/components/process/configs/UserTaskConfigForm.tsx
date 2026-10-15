/**
 * 人工任务节点配置表单 —— 对齐 DESIGN-process.md §6.4。
 *
 * QA 交互评审（2026-10-03）：指定审批人从「手输用户 ID」改为成员搜索选择器
 * （对齐飞书 aPaaS/钉钉审批的成员选择交互）——搭建者不应被要求知道内部用户 ID。
 * 会签/或签/依次模式暴露 approveUsers 多选（引擎 UserTaskExecutor 消费的数组字段，
 * 此前面板未提供，只能靠 API 写入）。
 *
 * A 旅程实测缺陷（2026-10-03 #12）：指定角色此前是「手输角色编码」自由文本，
 * 且写入引擎按用户 ID 解释的 assignee 字段——运行时报"人工任务无受理人"。
 * 改为角色下拉（值=角色 ID，引擎/任务中心的 candidateGroups 契约按角色 ID 匹配）。
 */

import { useState } from 'react';
import { Divider, Form, Input, InputNumber, Select, Switch, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { optionStoredValue } from '@apaas/shared';
import { rolesApi, usersApi, orgsApi, type OrgNode } from '../../../api/permissions.js';
import { objectsApi } from '../../../api/objects.js';

export interface UserTaskConfigData {
  taskName?: string;
  assigneeType?: string;
  assignee?: string;
  /** 指定角色模式的候选角色（引擎 candidateGroups，存角色 ID） */
  candidateGroups?: string[];
  /** 展示用缓存：所选角色名（节点摘要显示名称而非 ID） */
  roleName?: string;
  /** 展示用缓存：所选组织名（组织审批 ORG，节点摘要显示名称而非 ID） */
  orgName?: string;
  /** 会签/或签/依次模式的审批人集合（引擎 approveUsers 数组） */
  approveUsers?: string[];
  /** 展示用缓存：所选审批人姓名（节点摘要显示姓名而非 ID） */
  assigneeName?: string;
  assigneeNames?: string[];
  approvalMode?: string;
  /** 审批页绑定（R1.3"一切界面皆页面"）——契约字段名为 pageId，
   *  与引擎 getTask boundPageId / MCP 方言一致。曾误写 formKey 导致
   *  UI 搭建的流程审批页绑定静默失效（交互评审 2026-10-04 修复）。 */
  pageId?: string;
  dueDate?: number;
  dueUnit?: string;
  /** 超时动作（S1）：NOTIFY 催办 / AUTO_APPROVE 自动通过 / AUTO_REJECT 自动驳回 */
  timeoutAction?: string;
  title?: string;
  allowReject?: boolean;
  rejectToNodeId?: string;
  // --- 抄送配置 ---
  ccEnabled?: boolean;
  ccAssigneeType?: string;
  ccRecipients?: string[];
  ccTrigger?: string;
  // --- 审批结果回写（交互评审 2026-10-04 P0：反馈环三断之首） ---
  /** 节点决策定论后写入触发记录字段：引擎 completeTask 消费（记录触发场景） */
  writeback?: { field: string; approveValue: string; rejectValue?: string };
}

export interface UserTaskConfigFormProps {
  data: UserTaskConfigData;
  onChange: (data: UserTaskConfigData) => void;
  disabled?: boolean;
  /** 表单候选(应用内 form_page) */
  formOptions?: { label: string; value: string }[];
  /** 流程中可选的驳回目标节点 */
  nodeOptions?: { label: string; value: string }[];
  /** 应用对象候选（回写字段的来源对象） */
  objectOptions?: { label: string; value: string }[];
  /** 触发器节点绑定的对象（回写对象默认值——记录触发场景） */
  triggerObjectId?: string;
}

// 评审整改：导出枚举选项，供节点副标题(nodeMetadata)复用做中文标签映射，避免映射表两处维护
// INITIATOR（发起人审批，专题 R1-A1）：受理人=实例发起人，免填审批人
// SUPERVISOR 已摘除（专题 R2 裁决）：schema 无主管数据源，假入口比没有更糟；
// 待身份层补 User.managerId 后恢复
export const ASSIGNEE_TYPE_OPTIONS = [
  { label: '指定用户', value: 'USER' },
  { label: '发起人', value: 'INITIATOR' },
  { label: '指定角色', value: 'ROLE' },
  { label: '指定组织', value: 'ORG' },
  { label: '表单字段', value: 'FORM_FIELD' },
];

export const APPROVAL_MODE_OPTIONS = [
  { label: '单人审批', value: 'SINGLE' },
  { label: '会签(全部同意)', value: 'COUNTERSIGN' },
  { label: '或签(任一同意)', value: 'OR_SIGN' },
  // 依次审批（R1.3 引擎 sequential 模式）——引擎/completeTask 进度推进均已支持，
  // 双视角评审（2026-10-04）：此前 UI 从不暴露该选项，能力被面板埋没
  { label: '依次(按顺序逐个审批)', value: 'SEQUENTIAL' },
];

const DUE_UNIT_OPTIONS = [
  { label: '秒', value: 'SECONDS' },
  { label: '分钟', value: 'MINUTES' },
  { label: '小时', value: 'HOURS' },
  { label: '天', value: 'DAYS' },
];

// S1 审批超时边界：到点动作（截止时间到点且任务仍 PENDING 时由引擎执行）
const TIMEOUT_ACTION_OPTIONS = [
  { label: '催办（发站内信提醒受理人）', value: 'NOTIFY' },
  { label: '自动通过（以系统身份批准）', value: 'AUTO_APPROVE' },
  { label: '自动驳回（需已配置驳回跳转）', value: 'AUTO_REJECT' },
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
  objectOptions = [],
  triggerObjectId,
}: UserTaskConfigFormProps) {
  const update = (patch: Partial<UserTaskConfigData>) => onChange({ ...data, ...patch });

  // --- 审批结果回写：对象选择仅用于列出候选字段（引擎只消费 field 名，记录对象
  //     以触发记录为准），默认取触发器绑定的对象 ---
  const [wbObjectId, setWbObjectId] = useState<string | undefined>(
    triggerObjectId ?? objectOptions[0]?.value,
  );
  const { data: wbObject } = useQuery({
    queryKey: qk.object(wbObjectId!),
    queryFn: () => objectsApi.get(wbObjectId!),
    enabled: !!data.writeback && !!wbObjectId,
  });
  const wbFields = (wbObject?.fields ?? []).filter((f) => !f.isSystem);
  const wbField = wbFields.find((f) => f.apiName === data.writeback?.field);
  const wbSelectOptions =
    wbField?.config.type === 'single_select'
      ? (wbField.config.options ?? []).map((o) => ({
          label: o.label,
          value: optionStoredValue(o),
        }))
      : undefined;

  // 成员选择器数据源（React Query 缓存全局共享，多节点配置不重复请求）
  const { data: users } = useQuery({ queryKey: qk.users(), queryFn: () => usersApi.list() });
  const userOptions = (users ?? []).map((u) => ({
    label: `${u.name} (${u.email})`,
    value: u.id,
  }));
  const userNameById = new Map((users ?? []).map((u) => [u.id, u.name]));

  // 角色选择器数据源（与权限管理页共享缓存键）
  const { data: roles } = useQuery({
    queryKey: ['permission-roles'],
    queryFn: () => rolesApi.list(),
  });
  const roleOptions = (roles ?? []).map((r) => ({ label: `${r.name} (${r.code})`, value: r.id }));

  // 组织选择器数据源（组织审批 ORG：候选组存组织 ID，任务中心按「我的角色 ∪ 我的组织」匹配）
  const { data: orgTree } = useQuery({
    queryKey: ['permission-orgs'],
    queryFn: () => orgsApi.getTree(),
  });
  const flattenOrgs = (nodes: OrgNode[], prefix = ''): { label: string; value: string }[] =>
    (nodes ?? []).flatMap((n) => [
      { label: `${prefix}${n.name}`, value: n.id },
      ...flattenOrgs(n.children ?? [], `${prefix}${n.name} / `),
    ]);
  const orgOptions = flattenOrgs(orgTree ?? []);

  const assigneeType = data.assigneeType || 'ROLE';
  // 发起人（INITIATOR）引擎端动态解析，无需手填审批人
  const showAssignee = assigneeType !== 'INITIATOR';
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
        ? '审批角色'
        : assigneeType === 'ORG'
          ? '审批组织'
          : '审批人字段（触发记录字段名）';

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
          onChange={(v) => {
            const patch: Partial<UserTaskConfigData> = { assigneeType: v };
            // 类型切离"指定用户"时，多人审批模式（approveUsers 路径）无意义 → 回落单人
            if (
              v !== 'USER' &&
              ['COUNTERSIGN', 'OR_SIGN', 'SEQUENTIAL'].includes(data.approvalMode ?? '')
            ) {
              patch.approvalMode = 'SINGLE';
            }
            // 切换类型时清理旧类型的审批人字段，避免 schema 残留混合配置
            // （QA D-009：曾出现 USER + candidateGroups 并存的脏数据）。
            // assignee 为 USER 单人/ORG/FORM_FIELD 共用字段但语义不同
            // （用户ID/组织编码/字段名），切换即一并清理。
            patch.assignee = undefined;
            patch.assigneeName = undefined;
            patch.approveUsers = undefined;
            patch.assigneeNames = undefined;
            patch.candidateGroups = undefined;
            patch.roleName = undefined;
            patch.orgName = undefined;
            update(patch);
          }}
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
          ) : assigneeType === 'ROLE' ? (
            <Select
              showSearch
              optionFilterProp="label"
              value={data.candidateGroups?.[0]}
              onChange={(id: string) => {
                const role = roleOptions.find((r) => r.value === id);
                update({ candidateGroups: id ? [id] : [], roleName: role?.label });
              }}
              options={roleOptions}
              placeholder="选择审批角色"
              allowClear
            />
          ) : assigneeType === 'ORG' ? (
            <Select
              showSearch
              optionFilterProp="label"
              value={data.candidateGroups?.[0]}
              onChange={(id: string) => {
                const org = orgOptions.find((o) => o.value === id);
                update({ candidateGroups: id ? [id] : [], orgName: org?.label });
              }}
              options={orgOptions}
              placeholder="选择审批组织（组织成员均可办理）"
              allowClear
            />
          ) : (
            <Input
              value={data.assignee}
              onChange={(e) => update({ assignee: e.target.value })}
              placeholder="输入触发记录的字段 apiName（如 legal_reviewer）"
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
          // 多人审批模式只对"指定用户"有意义（approveUsers 数组路径）——
          // 角色/组织/表单字段类型选会签会在运行时报"approveUsers 为空"
          options={
            assigneeType === 'USER'
              ? APPROVAL_MODE_OPTIONS
              : APPROVAL_MODE_OPTIONS.filter((o) => o.value === 'SINGLE')
          }
        />
      </Form.Item>
      <Form.Item label="任务表单(可选)">
        <Select
          value={data.pageId}
          onChange={(v) => update({ pageId: v })}
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
      <Form.Item label="超时动作(可选)">
        <Select
          allowClear
          value={data.timeoutAction}
          onChange={(v) => update({ timeoutAction: v })}
          options={TIMEOUT_ACTION_OPTIONS}
          placeholder="截止时间到点且任务仍待处理时执行"
        />
      </Form.Item>
      <Divider orientation="left" plain>
        驳回配置
      </Divider>
      <Form.Item label="允许驳回">
        <Select
          // #16：默认允许（undefined→'true'）——审批语义默认应可驳回；
          // 显式 false 才是不允许（引擎 completeTask 同口径：仅 === false 拦截）
          value={data.allowReject === false ? 'false' : 'true'}
          onChange={(v) =>
            update({
              allowReject: v === 'true',
              rejectToNodeId: v === 'true' ? data.rejectToNodeId : undefined,
            })
          }
          options={[
            { label: '允许驳回', value: 'true' },
            { label: '不允许', value: 'false' },
          ]}
        />
      </Form.Item>
      {data.allowReject === true && (
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
        审批结果回写
      </Divider>
      <Form.Item label="审批后自动回写">
        <Switch
          checked={!!data.writeback}
          onChange={(checked) => {
            if (checked) {
              setWbObjectId(triggerObjectId ?? objectOptions[0]?.value);
              update({ writeback: { field: '', approveValue: '', rejectValue: '' } });
            } else {
              update({ writeback: undefined });
            }
          }}
        />
      </Form.Item>
      {data.writeback && (
        <>
          <Form.Item label="回写对象">
            <Select
              value={wbObjectId}
              onChange={(v) => setWbObjectId(v)}
              options={objectOptions}
              placeholder="选择触发记录所在对象"
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item label="回写字段" required>
            <Select
              value={data.writeback.field || undefined}
              onChange={(v) =>
                update({
                  writeback: { ...data.writeback!, field: v, approveValue: '', rejectValue: '' },
                })
              }
              options={wbFields.map((f) => ({
                label: `${f.label} (${f.apiName})`,
                value: f.apiName,
              }))}
              placeholder="选择要回写的字段（如审批状态）"
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item label="通过时写入" required>
            {wbSelectOptions ? (
              <Select
                value={data.writeback.approveValue || undefined}
                onChange={(v) => update({ writeback: { ...data.writeback!, approveValue: v } })}
                options={wbSelectOptions}
                placeholder="选择通过后的字段值"
              />
            ) : (
              <Input
                value={data.writeback.approveValue}
                onChange={(e) =>
                  update({ writeback: { ...data.writeback!, approveValue: e.target.value } })
                }
                placeholder="通过后写入的字段值"
              />
            )}
          </Form.Item>
          {data.allowReject !== false && (
            <Form.Item label="驳回时写入">
              {wbSelectOptions ? (
                <Select
                  value={data.writeback.rejectValue || undefined}
                  onChange={(v) => update({ writeback: { ...data.writeback!, rejectValue: v } })}
                  options={wbSelectOptions}
                  allowClear
                  placeholder="选择驳回后的字段值（可留空）"
                />
              ) : (
                <Input
                  value={data.writeback.rejectValue}
                  onChange={(e) =>
                    update({ writeback: { ...data.writeback!, rejectValue: e.target.value } })
                  }
                  placeholder="驳回后写入的字段值（可留空）"
                />
              )}
            </Form.Item>
          )}
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
            决策定论后写入触发记录（记录创建/更新触发场景）；非记录触发的流程自动跳过。
          </Typography.Text>
        </>
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
