/**
 * 事件配置 Tab — 动作参数配置表单（从 EventsTab.tsx 拆分，AGENTS.md 单文件 400 行规范）。
 */

import { useState, useEffect } from 'react';
import { Select, Space, Typography, Input } from 'antd';
import { processesApi } from '../../../api/processes.js';
import type { ProcessDef } from '../../../api/processes.js';
import type { ActionConfig } from '../../../api/pages.js';

const { Text } = Typography;

/** 动作参数配置表单。 */
export function ActionParamsEditor({
  action,
  onChange,
  appId,
}: {
  action: ActionConfig;
  onChange: (params: Record<string, unknown>) => void;
  appId?: string;
}) {
  const [processes, setProcesses] = useState<ProcessDef[]>([]);

  // trigger_process 需要加载流程列表
  useEffect(() => {
    if (action.type === 'trigger_process' && appId) {
      processesApi
        .list(appId)
        .then(setProcesses)
        .catch(() => {});
    }
  }, [action.type, appId]);

  const params = action.params ?? {};

  switch (action.type) {
    case 'trigger_process':
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Text type="secondary" style={{ fontSize: 12 }}>
            选择流程
          </Text>
          <Select
            style={{ width: '100%' }}
            placeholder="选择要触发的流程"
            value={(params.processId as string) ?? undefined}
            onChange={(v) => onChange({ ...params, processId: v })}
            options={processes.map((p) => ({
              value: p.id,
              label: `${p.name} (${p.processKey})`,
            }))}
          />
          <Text type="secondary" style={{ fontSize: 11 }}>
            点击按钮时将启动该流程，页面表单数据自动作为流程变量传入。
          </Text>
        </Space>
      );

    case 'navigate':
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Text type="secondary" style={{ fontSize: 12 }}>
            跳转路径
          </Text>
          <Input
            placeholder="/app/xxx/page-slug 或 https://..."
            value={(params.path as string) ?? ''}
            onChange={(e) => onChange({ ...params, path: e.target.value })}
          />
        </Space>
      );

    case 'toast':
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Text type="secondary" style={{ fontSize: 12 }}>
            提示消息
          </Text>
          <Input
            placeholder="显示给用户的消息"
            value={(params.message as string) ?? ''}
            onChange={(e) => onChange({ ...params, message: e.target.value })}
          />
          <Select
            size="small"
            style={{ width: '100%' }}
            value={(params.type as string) ?? 'success'}
            onChange={(v) => onChange({ ...params, type: v })}
            options={[
              { value: 'success', label: '成功' },
              { value: 'warning', label: '警告' },
              { value: 'error', label: '错误' },
              { value: 'info', label: '信息' },
            ]}
          />
        </Space>
      );

    case 'confirm':
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Text type="secondary" style={{ fontSize: 12 }}>
            确认提示
          </Text>
          <Input
            placeholder="确定要执行此操作吗？"
            value={(params.message as string) ?? ''}
            onChange={(e) => onChange({ ...params, message: e.target.value })}
          />
        </Space>
      );

    case 'set_variable':
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Text type="secondary" style={{ fontSize: 12 }}>
            变量路径
          </Text>
          <Input
            placeholder="vm.fieldName 或 vm.list.0.name"
            value={(params.variable as string) ?? ''}
            onChange={(e) => onChange({ ...params, variable: e.target.value })}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            值
          </Text>
          <Input
            placeholder="要设置的值"
            value={(params.value as string) ?? ''}
            onChange={(e) => onChange({ ...params, value: e.target.value })}
          />
        </Space>
      );

    case 'open_modal':
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Text type="secondary" style={{ fontSize: 12 }}>
            弹窗组件 ID
          </Text>
          <Input
            placeholder="输入弹窗组件的节点 ID"
            value={(params.modalId as string) ?? ''}
            onChange={(e) => onChange({ ...params, modalId: e.target.value })}
          />
        </Space>
      );

    case 'run_script':
      return (
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Text type="secondary" style={{ fontSize: 12 }}>
            脚本代码（ctx 注入：vm / setVariable / objectId）
          </Text>
          <Input.TextArea
            rows={6}
            placeholder={
              "// 示例：根据金额设置等级\nif ((ctx.vm.order?.amount ?? 0) > 1000) {\n  ctx.setVariable('vm.level', 'VIP');\n}"
            }
            value={(params.code as string) ?? ''}
            onChange={(e) => onChange({ ...params, code: e.target.value })}
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
          <Text type="secondary" style={{ fontSize: 11 }}>
            脚本在终端用户浏览器中执行；写变量必须经 ctx.setVariable（vm 为只读快照）。
          </Text>
        </Space>
      );

    default:
      return (
        <Text type="secondary" style={{ fontSize: 11 }}>
          此动作类型无需额外参数配置。
        </Text>
      );
  }
}
