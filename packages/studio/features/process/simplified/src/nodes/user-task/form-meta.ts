export const UserTaskFormMeta = {
  render: () => ({
    type: 'group',
    properties: { title: '审批任务配置' },
    fields: [
      {
        type: 'select',
        key: 'assigneeType',
        label: '审批人类型',
        options: [
          { label: '指定用户', value: 'USER' },
          { label: '指定角色', value: 'ROLE' },
          { label: '指定组织', value: 'ORG' },
          { label: '上级主管', value: 'SUPERVISOR' },
          { label: '表单字段', value: 'FORM_FIELD' },
        ],
      },
      {
        type: 'text',
        key: 'assigneeId',
        label: '审批人/角色ID',
        placeholder: '输入审批人 ID 或角色编码',
      },
      {
        type: 'select',
        key: 'approvalMode',
        label: '审批模式',
        options: [
          { label: '单人审批', value: 'SINGLE' },
          { label: '会签（全部同意）', value: 'COUNTERSIGN' },
          { label: '或签（任一同意）', value: 'OR_SIGN' },
        ],
      },
      {
        type: 'json',
        key: 'taskForm',
        label: '任务表单',
        placeholder: '审批人需要填写的表单（可选）',
      },
    ],
  }),
};
