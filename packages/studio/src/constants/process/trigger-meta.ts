/**
 * 从 constants/process.ts 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 触发器类型映射(流程卡片 + 工具栏图标块)。
 */

import { TOKENS as T, PRESET as P } from '@apaas/shared/design';
import {
  ThunderboltOutlined,
  DatabaseOutlined,
  ClockCircleOutlined,
  UserOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import type { IconType, TriggerType } from './types.js';

export interface TriggerMeta {
  type: TriggerType;
  label: string;
  icon: IconType;
  color: string;
}

export const TRIGGER_META: Record<TriggerType, TriggerMeta> = {
  RECORD_CREATED: {
    type: 'RECORD_CREATED',
    label: '记录创建触发',
    icon: DatabaseOutlined,
    color: T.colorPrimary,
  },
  RECORD_UPDATED: {
    type: 'RECORD_UPDATED',
    label: '记录更新触发',
    icon: DatabaseOutlined,
    color: T.colorPrimary,
  },
  RECORD_DELETED: {
    type: 'RECORD_DELETED',
    label: '记录删除触发',
    icon: DatabaseOutlined,
    color: T.colorPrimary,
  },
  SCHEDULED: {
    type: 'SCHEDULED',
    label: '定时触发',
    icon: ClockCircleOutlined,
    color: T.colorWarning,
  },
  MANUAL: {
    type: 'MANUAL',
    label: '手动触发',
    icon: UserOutlined,
    color: T.colorSuccess,
  },
  API: {
    type: 'API',
    label: 'API 触发',
    icon: ApiOutlined,
    color: `${P.geekblue6}`,
  },
  BUTTON_CLICK: {
    type: 'BUTTON_CLICK',
    label: '按钮点击触发',
    icon: ThunderboltOutlined,
    color: `${P.purple6}`,
  },
};

/** 触发器选项(用于 Select)。 */
export const TRIGGER_OPTIONS: { label: string; value: TriggerType }[] = (
  Object.values(TRIGGER_META) as TriggerMeta[]
).map((m) => ({ label: m.label, value: m.type }));

/** 安全获取触发器元数据。 */
export function getTriggerMeta(type?: string): TriggerMeta {
  if (type && type in TRIGGER_META) {
    return TRIGGER_META[type as TriggerType];
  }
  return {
    type: 'MANUAL',
    label: '手动触发',
    icon: UserOutlined,
    color: T.colorSuccess,
  };
}
