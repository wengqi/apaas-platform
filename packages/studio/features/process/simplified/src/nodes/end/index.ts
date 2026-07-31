import type { FlowNodeRegistry } from '../../typings.js';
import { EndFormMeta } from './form-meta.js';

export const EndNodeRegistry: FlowNodeRegistry = {
  type: 'end',
  meta: {
    deleteDisable: false,
    isEnd: true,
  },
  info: {
    icon: '🔚',
    description: '流程结束节点。',
  },
  formMeta: EndFormMeta,
};
