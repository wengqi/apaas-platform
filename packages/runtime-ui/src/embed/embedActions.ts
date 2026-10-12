/**
 * embedEvent 自定义 amis 动作 — page-event 出站的唯一通道（2026-10-12 用户裁决②：
 * 只桥 dispatchEvent 自定义事件显式转发，不外泄 amis 内部事件）。
 *
 * schema 用法（页面作者/AI 在 onEvent 中声明）：
 * ```json
 * {
 *   "onEvent": {
 *     "myCustomEvent": {
 *       "actions": [
 *         { "actionType": "embedEvent", "args": { "name": "order-submitted", "data": {"id": "${id}"} } }
 *       ]
 *     }
 *   }
 * }
 * ```
 * embed 模式下事件经协议 `apaas:page-event` 出站给宿主；非 embed 模式无活跃桥，
 * 动作静默（注册不报错，普通运行时零影响）。
 */

import { registerAction } from 'amis-core';
import type { ListenerAction } from 'amis-core';
import { getActiveEmbedBridge } from './embedBridge';

/** 平台自定义动作类型（已入 G3 KNOWN_ACTION_TYPES 白名单）。 */
export const EMBED_EVENT_ACTION_TYPE = 'embedEvent';

let registered = false;

/** 模块级注册一次（registerAction 为 amis 全局动作表）。 */
export function registerEmbedEventAction(): void {
  if (registered) return;
  registered = true;
  registerAction(EMBED_EVENT_ACTION_TYPE, {
    run: async (action: ListenerAction) => {
      const bridge = getActiveEmbedBridge();
      if (!bridge) return; // 非 embed 模式：无出站目标，静默
      const args = (action.args ?? {}) as { name?: unknown; data?: unknown };
      bridge.sendPageEvent({
        name: typeof args.name === 'string' ? args.name : '',
        data: args.data,
      });
    },
  });
}
