/**
 * 字段配置 — 类型专属配置区块（从 FieldConfigDrawer.tsx 抽出）。
 *
 * 按字段类型渲染专属配置：选项管理（单选/多选）、关联对象（Lookup）、
 * 公式（Formula）、汇总（Rollup）、子表、附件等。
 */

import { Divider, Form, Input, InputNumber, Radio, Select, Switch, Typography } from 'antd';
import type { SelectOption } from '../../../api/objects.js';

const { Text } = Typography;
import type { FieldType } from '../../../constants/fieldTypes.js';
import RollupConfigForm from '../RollupConfigForm.js';
import OptionManager from './OptionManager.js';
import type { FieldFormValues } from './utils.js';

interface TypeSpecificConfigProps {
  type: FieldType;
  form: ReturnType<typeof Form.useForm<FieldFormValues>>[0];
  options: SelectOption[];
  setOptions: React.Dispatch<React.SetStateAction<SelectOption[]>>;
  objectList?: { id: string; label: string; apiName: string }[];
  /** 当前对象 ID（Rollup 关系字段候选需要） */
  objectId: string;
}

export default function TypeSpecificConfig({
  type,
  form: _form,
  options,
  setOptions,
  objectList,
  objectId,
}: TypeSpecificConfigProps) {
  let body: React.ReactNode = null;

  switch (type) {
    case 'text':
    case 'long_text':
    case 'rich_text':
      body = (
        <Form.Item label="最大长度" name="maxLength">
          <InputNumber min={1} max={10000} style={{ width: '100%' }} />
        </Form.Item>
      );
      break;
    case 'number':
    case 'percent':
      body = (
        <Form.Item
          label="小数位数"
          name="precision"
          tooltip={type === 'percent' ? '百分比的小数位数' : '数字的小数位数'}
        >
          <InputNumber min={0} max={10} style={{ width: '100%' }} />
        </Form.Item>
      );
      break;
    case 'currency':
      body = (
        <div style={{ display: 'flex', gap: 12 }}>
          <Form.Item label="小数位数" name="precision" style={{ marginBottom: 0, flex: 1 }}>
            <InputNumber min={0} max={10} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="货币" name="currencyCode" style={{ marginBottom: 0, flex: 1 }}>
            <Select
              options={[
                { value: 'CNY', label: 'CNY 人民币' },
                { value: 'USD', label: 'USD 美元' },
                { value: 'EUR', label: 'EUR 欧元' },
                { value: 'GBP', label: 'GBP 英镑' },
                { value: 'JPY', label: 'JPY 日元' },
                { value: 'HKD', label: 'HKD 港币' },
              ]}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </div>
      );
      break;
    case 'auto_number':
      body = (
        <Form.Item
          label="编号规则"
          name="autoNumberFormat"
          tooltip="{seq} 为自增序号占位符,如 ORD-{seq:0000} 生成 ORD-0001"
        >
          <Input placeholder="ORD-{seq:0000}" style={{ fontFamily: 'monospace' }} />
        </Form.Item>
      );
      break;
    case 'single_select':
    case 'multi_select':
      body = (
        <OptionManager
          options={options}
          setOptions={setOptions}
          multiple={type === 'multi_select'}
        />
      );
      break;
    case 'date':
      body = (
        <Form.Item label="显示格式" name="format">
          <Select
            options={[
              { value: 'yyyy-MM-dd', label: '2024-01-01' },
              { value: 'yyyy/MM/dd', label: '2024/01/01' },
              { value: 'MM-dd-yyyy', label: '01-01-2024' },
            ]}
          />
        </Form.Item>
      );
      break;
    case 'date_time':
      body = (
        <Form.Item label="显示格式" name="format">
          <Select
            options={[
              { value: 'yyyy-MM-dd HH:mm', label: '2024-01-01 14:30' },
              { value: 'yyyy-MM-dd HH:mm:ss', label: '2024-01-01 14:30:00' },
              { value: 'yyyy/MM/dd HH:mm', label: '2024/01/01 14:30' },
            ]}
          />
        </Form.Item>
      );
      break;
    case 'user':
      body = (
        <Form.Item name="multi" valuePropName="checked" label="允许多选">
          <Switch />
        </Form.Item>
      );
      break;
    case 'lookup':
      body = (
        <>
          <Form.Item
            label="目标对象"
            name="targetObjectId"
            rules={[{ required: true, message: '请选择目标对象' }]}
          >
            <Select
              placeholder="选择关联的对象"
              showSearch
              optionFilterProp="label"
              options={(objectList ?? []).map((o) => ({ value: o.id, label: o.label }))}
            />
          </Form.Item>
          <Form.Item label="关系类型" name="relationType">
            <Radio.Group>
              <Radio value="one_to_many">一对多</Radio>
              <Radio value="many_to_many">多对多</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            label="反向字段名"
            name="inverseFieldName"
            tooltip="在目标对象上显示的引用字段名(可选)"
          >
            <Input placeholder="如:所属客户" />
          </Form.Item>
        </>
      );
      break;
    case 'rollup':
      body = (
        <Form.Item label="汇总配置" name="rollup">
          <RollupConfigForm objectId={objectId} />
        </Form.Item>
      );
      break;
    default:
      body = (
        <Text type="secondary" style={{ fontSize: 12 }}>
          该类型暂无额外配置。
        </Text>
      );
      break;
  }

  return (
    <>
      <Divider orientation="left" plain style={{ marginTop: 8 }}>
        类型配置
      </Divider>
      {body}
    </>
  );
}
