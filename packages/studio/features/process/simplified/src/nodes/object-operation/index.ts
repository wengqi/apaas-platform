import type { FlowNodeRegistry } from '../../typings.js';
import { ObjectOperationFormMeta } from './form-meta.js';

/**
 * 对象操作节点 — 对 aPaaS 对象记录执行 CRUD。
 * 操作类型：CREATE / UPDATE / DELETE / QUERY / UPSERT
 */
export const ObjectOperationNodeRegistry: FlowNodeRegistry = {
  type: 'objectOperation',
  meta: {},
  info: {
    icon: '📋',
    description: '对对象记录执行创建、更新、删除或查询操作。',
  },
  formMeta: ObjectOperationFormMeta,
};
