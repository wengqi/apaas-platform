/**
 * 循环节点配置表单。
 *
 * 配置遍历集合（变量引用路径）与最大迭代次数。
 * 集合在引擎端解析：优先 inputsValues.collection（四态引用），回退 data.collection 常量。
 * 体内节点以 {{loop_x.output.item}} 引用当前元素。
 */

import { Input, InputNumber, Typography } from 'antd';

const { Text } = Typography;

export interface LoopConfigFormProps {
  data: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  disabled?: boolean;
}

export default function LoopConfigForm({ data, onChange, disabled }: LoopConfigFormProps) {
  const collection = (data['collection'] as string) ?? '';
  const maxIterations = data['maxIterations'] as number | undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          遍历集合（变量引用路径）
        </Text>
        <Input
          value={collection}
          disabled={disabled}
          placeholder="如 object_query_0.output.records"
          onChange={(e) => onChange({ collection: e.target.value })}
          style={{ marginTop: 4 }}
        />
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
          引用上游查询节点的记录列表，循环节点输出 item（当前元素）/ index / total。
        </Text>
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          最大迭代次数
        </Text>
        <InputNumber
          value={maxIterations}
          min={1}
          max={1000}
          disabled={disabled}
          placeholder="默认 1000"
          style={{ width: '100%', marginTop: 4 }}
          onChange={(v) => onChange({ maxIterations: v ?? undefined })}
        />
      </div>
    </div>
  );
}
