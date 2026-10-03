/**
 * schema-serializer — fieldMapping → inputsValues 转换（对象/批量操作）。
 *
 * 背景（A 旅程实测缺陷 #10）：编辑器 FieldMapper 产出 data.fieldMapping，
 * 而引擎执行器只消费 data.inputsValues（ctx.inputs 由其解析），二者从未打通，
 * UI 配置的更新节点运行时报"对象更新节点缺少 recordId"。
 */
import { describe, expect, it } from 'vitest';
import { flowToWorkflowSchema, workflowToFlowSchema } from './schema-serializer.js';
import type { FlowDocumentJSON } from './typings.js';

const docWithObjectOp: FlowDocumentJSON = {
  nodes: [
    { id: 'start_0', type: 'start', data: { title: '开始' } },
    {
      id: 'objectOperation_1',
      type: 'objectOperation',
      data: {
        title: '状态回写',
        operation: 'update',
        objectId: 'obj_repair',
        fieldMapping: {
          recordId: '${recordId}',
          status: '已完成',
          summary: '工单 ${recordId} 已处理',
        },
      },
    },
    { id: 'end_0', type: 'end', data: { title: '结束' } },
  ],
};

describe('flowToWorkflowSchema fieldMapping → inputsValues', () => {
  it('对象操作节点的 fieldMapping 转换为四态 inputsValues', () => {
    const schema = flowToWorkflowSchema(docWithObjectOp);
    const op = schema.nodes.find((n) => n.id === 'objectOperation_1');
    expect(op?.type).toBe('object_operation');
    const inputsValues = op?.data?.['inputsValues'] as Record<
      string,
      { type: string; content: unknown }
    >;
    // 单变量 ${recordId} → ref 路径数组
    expect(inputsValues['recordId']).toEqual({ type: 'ref', content: ['recordId'] });
    // 纯文本 → constant
    expect(inputsValues['status']).toEqual({ type: 'constant', content: '已完成' });
    // 含插值 → template
    expect(inputsValues['summary']).toEqual({
      type: 'template',
      content: '工单 ${recordId} 已处理',
    });
    // fieldMapping 保留（编辑器回显往返）
    expect(op?.data?.['fieldMapping']).toEqual(docWithObjectOp.nodes[1]?.data?.fieldMapping);
  });

  it('类型名序列化为引擎 snake_case 且合并保留既有 inputsValues 键', () => {
    const doc = {
      nodes: [
        {
          id: 'op_1',
          type: 'objectOperation',
          data: {
            title: 'x',
            fieldMapping: { status: 'A' },
            inputsValues: {
              recordId: { type: 'ref', content: ['recordId'] },
              status: { type: 'constant', content: 'B' },
            },
          },
        },
      ],
    } as unknown as FlowDocumentJSON;
    const schema = flowToWorkflowSchema(doc);
    const op = schema.nodes[0];
    expect(op?.type).toBe('object_operation');
    expect(op?.data?.['inputsValues']).toEqual({
      // fieldMapping 覆盖的键以 UI 编辑为准，未覆盖的 ref 键合并保留
      recordId: { type: 'ref', content: ['recordId'] },
      status: { type: 'constant', content: 'A' },
    });
  });

  it('批量操作节点同样转换，非对象操作节点不受影响', () => {
    const doc = {
      nodes: [
        { id: 'b_1', type: 'batchOperation', data: { title: 'b', fieldMapping: { a: '1' } } },
        { id: 'n_1', type: 'notification', data: { title: 'n', fieldMapping: { a: '1' } } },
      ],
    } as unknown as FlowDocumentJSON;
    const schema = flowToWorkflowSchema(doc);
    const batch = schema.nodes.find((n) => n.id === 'b_1');
    const notif = schema.nodes.find((n) => n.id === 'n_1');
    expect((batch?.data?.['inputsValues'] as Record<string, unknown>)['a']).toEqual({
      type: 'constant',
      content: '1',
    });
    expect(notif?.data?.['inputsValues']).toBeUndefined();
  });

  it('往返（workflow→flow→workflow）保留 fieldMapping 与 inputsValues', () => {
    const schema1 = flowToWorkflowSchema(docWithObjectOp);
    const round = flowToWorkflowSchema(workflowToFlowSchema(schema1));
    const op1 = schema1.nodes.find((n) => n.id === 'objectOperation_1');
    const op2 = round.nodes.find((n) => n.id === 'objectOperation_1');
    expect(op2?.data?.['inputsValues']).toEqual(op1?.data?.['inputsValues']);
    expect(op2?.data?.['fieldMapping']).toEqual(op1?.data?.['fieldMapping']);
  });
});
