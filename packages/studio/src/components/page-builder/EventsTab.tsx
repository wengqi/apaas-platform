/**
 * 事件配置 Tab — 可视化配置组件事件 → 动作链。
 *
 * 数据结构：事件配置存储在 node.props[eventName] 中，
 * 格式为 { __action: ActionConfig } 或 ActionConfig[]（动作链）。
 * ComponentRenderer 的 extractActions() 在运行时读取并执行。
 *
 * 支持 12 种 ActionType，重点支持 trigger_process（流程绑定页面）。
 *
 * 子模块拆分见 ./events-tab/（AGENTS.md 单文件 400 行规范）：
 * - constants.ts：组件事件表 + 动作类型选项
 * - actionProps.ts：node.props 动作链读写
 * - ActionParamsEditor.tsx：动作参数表单
 * - EventEditor.tsx：单事件动作链编辑器
 */

import { Space, Empty, Typography } from 'antd';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import type { ComponentNode } from '../../api/pages.js';
import { COMPONENT_EVENTS } from './events-tab/constants.js';
import { EventEditor } from './events-tab/EventEditor.js';

const { Text } = Typography;

/** 事件配置 Tab 主组件。 */
export function EventsTab({ node }: { node: ComponentNode }) {
  const updateComponentProps = usePageBuilderStore((s) => s.updateComponentProps);
  const currentPage = usePageBuilderStore((s) => s.currentPage);
  const appId = currentPage?.appId;

  const availableEvents = COMPONENT_EVENTS[node.type] ?? [];

  if (availableEvents.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Text type="secondary" style={{ fontSize: 12 }}>
            此组件类型（{node.type}）不支持事件配置
          </Text>
        }
      />
    );
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {availableEvents.map((eventName) => (
        <EventEditor
          key={eventName}
          node={node}
          eventName={eventName}
          appId={appId}
          updateComponentProps={updateComponentProps}
        />
      ))}
    </Space>
  );
}
