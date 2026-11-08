/**
 * 触发器节点配置表单 —— 对齐 DESIGN-process.md §6.1。
 */

import { Divider, Form, Input, Select, Typography } from 'antd';
import { TRIGGER_OPTIONS } from '../../../constants/process.js';

const { Text } = Typography;

export interface TriggerConfigData {
  triggerType?: string;
  objectId?: string;
  cron?: string;
  /** 触发条件（functional-03）：JsonLogic JSON 字符串（引擎对触发记录数据求值，满足才触发） */
  condition?: string;
  title?: string;
  /** 发起页面绑定（R6 方案一）——与 user_task.pageId 对称：该流程从此页面发起 */
  startPageId?: string;
}

export interface TriggerConfigFormProps {
  data: TriggerConfigData;
  onChange: (data: TriggerConfigData) => void;
  disabled?: boolean;
  /** 对象候选(appId 下对象列表) */
  objectOptions?: { label: string; value: string }[];
  /** 页面候选(appId 下页面列表，发起页面下拉) */
  pageOptions?: { label: string; value: string }[];
}

const CRON_PRESETS = [
  { label: '每天 9 点', value: '0 0 9 * * ?' },
  { label: '每小时', value: '0 0 * * * ?' },
  { label: '每分钟', value: '0 * * * * ?' },
  { label: '每周一 9 点', value: '0 0 9 * * ? MON' },
];

export default function TriggerConfigForm({
  data,
  onChange,
  disabled = false,
  objectOptions = [],
  pageOptions = [],
}: TriggerConfigFormProps) {
  const update = (patch: Partial<TriggerConfigData>) => onChange({ ...data, ...patch });
  const isRecordEvent =
    data.triggerType === 'RECORD_CREATED' ||
    data.triggerType === 'RECORD_UPDATED' ||
    data.triggerType === 'RECORD_DELETED';
  const isSchedule = data.triggerType === 'SCHEDULED';
  const isManual = data.triggerType === 'MANUAL';
  // 发起页面对 RECORD_* 与 MANUAL 有意义（SCHEDULED/API 由系统触发，无人工发起页）
  const showStartPage = isRecordEvent || isManual;

  return (
    <Form layout="vertical" size="small" disabled={disabled} component="div">
      <Divider orientation="left" plain style={{ marginTop: 0 }}>
        触发器配置
      </Divider>
      <Form.Item label="触发类型" required>
        <Select
          value={data.triggerType}
          onChange={(v) => update({ triggerType: v })}
          options={TRIGGER_OPTIONS}
          placeholder="选择触发类型"
        />
      </Form.Item>
      {isRecordEvent && (
        <>
          <Form.Item label="关联对象" required>
            <Select
              showSearch
              value={data.objectId || undefined}
              onChange={(v) => update({ objectId: v })}
              options={objectOptions}
              placeholder="选择触发关联的对象"
            />
          </Form.Item>
          {/* functional-03：event Radio 摘除——引擎按 triggerType（创建/更新/删除三类
              触发类型）匹配事件，event 全链零消费且能制造矛盾配置；存量 data.event 无害保留 */}
          <Form.Item label="触发条件(可选)">
            <Input.TextArea
              value={data.condition}
              onChange={(e) => update({ condition: e.target.value })}
              placeholder='JsonLogic 表达式，满足才触发，如 {"==":[{"var":"amount"},1000]}'
              rows={2}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              对触发记录的字段求值（var 填字段
              apiName），仅支持平台操作符子集；非法表达式无法保存发布
            </Text>
          </Form.Item>
        </>
      )}
      {showStartPage && (
        <Form.Item label="发起页面(可选)">
          <Select
            showSearch
            value={data.startPageId || undefined}
            onChange={(v) => update({ startPageId: v })}
            options={pageOptions}
            allowClear
            placeholder="选择该流程的发起页面（与审批页绑定对称）"
          />
        </Form.Item>
      )}
      {isManual && (
        <Form.Item label="手动发起">
          <Text type="secondary" style={{ fontSize: 12 }}>
            发布后运行时应用页会出现「发起」按钮，打开发起页面填写并提交
          </Text>
        </Form.Item>
      )}
      {isSchedule && (
        <Form.Item label="Cron 表达式" required>
          <Input
            value={data.cron}
            onChange={(e) => update({ cron: e.target.value })}
            placeholder="0 0 9 * * ?"
            addonAfter={
              <Select
                size="small"
                style={{ width: 110 }}
                placeholder="预设"
                onChange={(v) => update({ cron: v })}
                options={CRON_PRESETS}
                variant="borderless"
              />
            }
          />
        </Form.Item>
      )}
    </Form>
  );
}
