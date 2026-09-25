/**
 * 子流程调用节点配置表单。
 *
 * subProcessKey 为同应用内已发布流程的 apiName（引擎按 apiName 查最新已发布版本）；
 * 也可直接填 subProcessDefId。默认同步等待子流程完成。
 */

import { Input, Select, Switch, Typography } from 'antd';

const { Text } = Typography;

export interface SubProcessConfigFormProps {
  data: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  disabled?: boolean;
  processOptions: { label: string; value: string }[];
}

export default function SubProcessConfigForm({
  data,
  onChange,
  disabled,
  processOptions,
}: SubProcessConfigFormProps) {
  const subProcessKey = (data['subProcessKey'] as string) ?? '';
  const subProcessDefId = (data['subProcessDefId'] as string) ?? '';
  const sync = data['sync'] !== false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          子流程（同应用已发布）
        </Text>
        <Select
          value={subProcessKey || undefined}
          disabled={disabled}
          showSearch
          allowClear
          placeholder="选择已发布流程"
          options={processOptions}
          style={{ width: '100%', marginTop: 4 }}
          onChange={(v) => onChange({ subProcessKey: v })}
        />
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          或直接指定流程 API 名称
        </Text>
        <Input
          value={subProcessKey}
          disabled={disabled}
          placeholder="如 asset_borrow_approval"
          onChange={(e) => onChange({ subProcessKey: e.target.value })}
          style={{ marginTop: 4 }}
        />
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          或直接指定流程定义 ID
        </Text>
        <Input
          value={subProcessDefId}
          disabled={disabled}
          placeholder="processDef ID（可选）"
          onChange={(e) => onChange({ subProcessDefId: e.target.value })}
          style={{ marginTop: 4 }}
        />
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          同步等待子流程完成
        </Text>
        <div style={{ marginTop: 4 }}>
          <Switch checked={sync} disabled={disabled} onChange={(v) => onChange({ sync: v })} />
          <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
            关闭则启动后立即继续（不等待）
          </Text>
        </div>
      </div>
    </div>
  );
}
