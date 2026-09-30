/**
 * 开始节点表单 — 配置流程输入参数（R1.3 流程出入参）。
 *
 * 引擎契约：inputsValues 为 IFlowValue 四态（constant/ref/expression/template），
 * resolveInputs 解析后作为 start 节点 output，下游以 ref 引用。
 * 简化配置：直接写常量 JSON 对象（模板字符串 `${...}` 亦被 template 态支持）。
 */
export const StartFormMeta = {
  render: () => ({
    type: 'group',
    properties: {
      title: '开始节点 — 流程入参',
    },
    fields: [
      {
        type: 'json',
        key: 'inputsValues',
        label: '输入参数（键值对）',
        placeholder: '{"amount": 100000, "applicant": "张三"} — 值支持 ${表达式} 模板',
      },
    ],
  }),
};
