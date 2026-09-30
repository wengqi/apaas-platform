/**
 * 结束节点表单 — 配置流程输出（R1.3 流程出参）。
 *
 * 引擎契约：end 节点 output 写入 variables[end节点id].output，
 * 实例查询（getInstance）可见；纯流程应用（headless）经 API 读取该输出。
 */
export const EndFormMeta = {
  render: () => ({
    type: 'group',
    properties: { title: '结束节点 — 流程出参' },
    fields: [
      {
        type: 'json',
        key: 'inputsValues',
        label: '输出映射（键值对）',
        placeholder: '{"result": "approved", "finalAmount": 128000} — 值支持 ${ref/表达式}',
      },
    ],
  }),
};
