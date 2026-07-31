/**
 * 初始流程数据 — 一个"创建记录触发通知"的示例流程。
 * 对齐飞书 aPaaS 典型审批流场景。
 */

import type { FlowDocumentJSON } from './typings.js';

export const initialData: FlowDocumentJSON = {
  nodes: [
    {
      id: 'start_0',
      type: 'start',
      blocks: [],
      data: {
        title: '开始',
        outputs: {
          type: 'object',
          properties: {
            recordId: {
              type: 'string',
              description: '触发记录 ID',
            },
          },
        },
      },
    },
    {
      id: 'trigger_0',
      type: 'trigger',
      data: {
        title: '触发器',
        triggerType: 'RECORD_CREATED',
        objectId: '',
      },
    },
    {
      id: 'userTask_0',
      type: 'userTask',
      data: {
        title: '审批',
        assigneeType: 'ROLE',
        assigneeId: 'ADMIN',
        approvalMode: 'SINGLE',
      },
    },
    {
      id: 'notification_0',
      type: 'notification',
      data: {
        title: '发送通知',
        channel: 'IN_APP',
        recipient: '',
        subject: '审批已完成',
      },
    },
    {
      id: 'end_0',
      type: 'end',
      data: {
        title: '结束',
      },
    },
  ],
  edges: [
    { sourceNodeID: 'start_0', targetNodeID: 'trigger_0' },
    { sourceNodeID: 'trigger_0', targetNodeID: 'userTask_0' },
    { sourceNodeID: 'userTask_0', targetNodeID: 'notification_0' },
    { sourceNodeID: 'notification_0', targetNodeID: 'end_0' },
  ],
};
