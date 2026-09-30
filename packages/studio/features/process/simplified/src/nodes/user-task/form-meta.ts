export const UserTaskFormMeta = {
  render: () => ({
    type: 'group',
    properties: { title: '审批任务配置' },
    fields: [
      {
        type: 'select',
        key: 'approvalMode',
        label: '审批模式',
        default: 'single',
        options: [
          { label: '单人审批', value: 'single' },
          { label: '会签（全部同意才通过）', value: 'countersign' },
          { label: '或签（任一人决策即生效）', value: 'or_sign' },
          { label: '依次审批（按顺序逐人）', value: 'sequential' },
        ],
        // 引擎消费 snake_case 值（UserTaskConfig.approvalMode）
      },
      {
        type: 'text',
        key: 'assignee',
        label: '受理人用户 ID',
        placeholder: '单人审批模式的受理人 ID',
        // 会签/或签/依次模式忽略此字段，使用 approveUsers
      },
      {
        type: 'json',
        key: 'approveUsers',
        label: '审批人列表（多人模式）',
        placeholder: '["user_id_1", "user_id_2"] — 会签/或签/依次模式的审批人 ID 数组',
      },
      {
        type: 'json',
        key: 'candidateGroups',
        label: '候选组（角色 ID 数组）',
        placeholder: '["role-1", "role-2"] — 候选组成员均可处理该任务',
      },
      {
        type: 'text',
        key: 'pageId',
        label: '审批页面 ID',
        placeholder: '绑定页面（一切界面皆页面：可含表单或关联信息），留空用默认审批 UI',
      },
      {
        type: 'text',
        key: 'rejectToNodeId',
        label: '驳回跳转节点 ID',
        placeholder: '驳回时 token 跳回的目标节点（可选）',
      },
    ],
  }),
};
