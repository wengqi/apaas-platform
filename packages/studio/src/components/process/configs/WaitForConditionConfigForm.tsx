/**
 * 等待条件节点配置表单。
 *
 * condition 存 JsonLogic JSON（与条件分支同一套规则体系，前端由查询构建器导出）。
 * 引擎按 pollIntervalMs 轮询重查（BullMQ 延迟任务），超时后走 timeout 出边或实例失败。
 */

import { Input, InputNumber, Typography } from 'antd';

const { Text, Paragraph } = Typography;

export interface WaitForConditionConfigFormProps {
  data: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  disabled?: boolean;
}

export default function WaitForConditionConfigForm({
  data,
  onChange,
  disabled,
}: WaitForConditionConfigFormProps) {
  const conditionRaw = data['condition'];
  const conditionText =
    typeof conditionRaw === 'string'
      ? conditionRaw
      : conditionRaw
        ? JSON.stringify(conditionRaw)
        : '';
  const pollIntervalMs = data['pollIntervalMs'] as number | undefined;
  const timeoutMs = data['timeoutMs'] as number | undefined;

  const handleConditionText = (value: string) => {
    if (!value.trim()) {
      onChange({ condition: undefined });
      return;
    }
    try {
      onChange({ condition: JSON.parse(value) });
    } catch {
      // 非法 JSON：暂存原始文本，引擎端校验报错
      onChange({ condition: value });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          等待条件（JsonLogic JSON）
        </Text>
        <Input.TextArea
          value={conditionText}
          disabled={disabled}
          rows={3}
          placeholder={'{"==": [{"var":"record.status"}, "DONE"]}'}
          onChange={(e) => handleConditionText(e.target.value)}
          style={{ marginTop: 4 }}
        />
        <Paragraph type="secondary" style={{ fontSize: 11, marginTop: 4, marginBottom: 0 }}>
          条件满足后继续执行；超时后走 label 为 timeout 的出边（未配置则实例失败）。
        </Paragraph>
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          检查间隔（ms）
        </Text>
        <InputNumber
          value={pollIntervalMs}
          min={1000}
          disabled={disabled}
          placeholder="默认 60000"
          style={{ width: '100%', marginTop: 4 }}
          onChange={(v) => onChange({ pollIntervalMs: v ?? undefined })}
        />
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          超时（ms）
        </Text>
        <InputNumber
          value={timeoutMs}
          min={1000}
          disabled={disabled}
          placeholder="默认 86400000（24 小时）"
          style={{ width: '100%', marginTop: 4 }}
          onChange={(v) => onChange({ timeoutMs: v ?? undefined })}
        />
      </div>
    </div>
  );
}
