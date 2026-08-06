import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  ColorPicker,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Switch,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  objectsApi,
  type CreateFieldRequest,
  type Field,
  type FieldConfig,
  type SelectOption,
  type UpdateFieldRequest,
} from '../../api/objects.js';
import { getFieldTypeMeta, type FieldType } from '../../constants/fieldTypes.js';

const { Text } = Typography;

/** 选项预设色板。 */
const PRESET_COLORS = [
  '#1677ff',
  '#52c41a',
  '#fa8c16',
  '#ff4d4f',
  '#722ed1',
  '#13c2c2',
  '#eb2f96',
  '#faad14',
];

/** 生成临时 ID(前端选项管理用,后端会重新分配)。 */
function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 字段配置表单值(扁平化,便于动态表单)。 */
interface FieldFormValues {
  label: string;
  apiName: string;
  required: boolean;
  unique: boolean;
  searchable: boolean;
  description?: string;
  defaultValue?: string | number | boolean;
  maxLength?: number;
  precision?: number;
  currencyCode?: string;
  autoNumberFormat?: string;
  format?: string;
  multi?: boolean;
  targetObjectId?: string;
  relationType?: string;
  inverseFieldName?: string;
}

interface FieldConfigDrawerProps {
  open: boolean;
  /** 'create' 新增 / 'edit' 编辑 */
  mode: 'create' | 'edit';
  /** 新增时选定的字段类型 */
  fieldType?: FieldType;
  /** 编辑时的字段数据 */
  field?: Field;
  objectId: string;
  /** 应用 ID(Lookup 目标对象选择需要) */
  appId: string;
  onClose: () => void;
}

/**
 * 字段配置抽屉(Drawer)。
 * 通用配置 + 按类型动态渲染的类型专属配置。
 * 新增字段调用 addField,编辑字段调用 updateField。
 */
export default function FieldConfigDrawer({
  open,
  mode,
  fieldType,
  field,
  objectId,
  appId,
  onClose,
}: FieldConfigDrawerProps) {
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FieldFormValues>();
  const [options, setOptions] = useState<SelectOption[]>([]);

  /** 当前字段类型(新增取 fieldType,编辑取 field.type)。 */
  const currentType: FieldType | undefined = mode === 'edit' ? field?.type : fieldType;
  const isEdit = mode === 'edit';
  const isSystem = isEdit && field?.isSystem === true;

  /** Lookup 目标对象候选(同应用对象列表)。 */
  const { data: objectList } = useQuery({
    queryKey: ['objects', appId],
    queryFn: () => objectsApi.list(appId),
    enabled: !!appId && currentType === 'lookup',
  });

  /** 新增字段。 */
  const addFieldMutation = useMutation({
    mutationFn: (data: CreateFieldRequest) => objectsApi.addField(objectId, data),
    onSuccess: () => {
      message.success('字段已添加');
      queryClient.invalidateQueries({ queryKey: ['object', objectId] });
      onClose();
    },
    onError: (err) => showError(err),
  });

  /** 更新字段。 */
  const updateFieldMutation = useMutation({
    mutationFn: (data: UpdateFieldRequest) => {
      if (!field) throw new Error('字段不存在');
      return objectsApi.updateField(objectId, field.id, data);
    },
    onSuccess: () => {
      message.success('字段已更新');
      queryClient.invalidateQueries({ queryKey: ['object', objectId] });
      onClose();
    },
    onError: (err) => showError(err),
  });

  /** 抽屉打开时初始化表单与选项。 */
  useEffect(() => {
    if (!open || !currentType) return;
    const initial = computeInitialValues(currentType, field);
    form.resetFields();
    form.setFieldsValue(initial);
    // 选项管理器(单选/多选)
    if (currentType === 'single_select' || currentType === 'multi_select') {
      const cfgOptions = field?.config?.options;
      setOptions(
        cfgOptions && cfgOptions.length > 0
          ? cfgOptions.map((o) => ({ ...o }))
          : [{ id: genId(), label: '', color: PRESET_COLORS[0], isDefault: false }],
      );
    } else {
      setOptions([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentType, field?.id]);

  /** 保存。 */
  const handleSave = async () => {
    if (!currentType) return;
    let values: FieldFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return; // 校验错误由 Form 展示
    }
    const config = buildConfig(currentType, values, options);
    const payload = {
      apiName: values.apiName,
      label: values.label,
      config,
      required: values.required,
      unique: values.unique,
      searchable: values.searchable,
      description: values.description,
      defaultValue: values.defaultValue,
    };
    if (isEdit) {
      updateFieldMutation.mutate(payload);
    } else {
      addFieldMutation.mutate({ ...payload, type: currentType });
    }
  };

  if (!currentType) {
    return (
      <Drawer open={open} onClose={onClose} width={480}>
        <Text type="secondary">未指定字段类型</Text>
      </Drawer>
    );
  }

  const meta = getFieldTypeMeta(currentType);
  const submitting = addFieldMutation.isPending || updateFieldMutation.isPending;
  const title = `${isEdit ? '编辑' : '添加'}字段 — ${meta.label}`;

  return (
    <Drawer
      title={title}
      open={open}
      onClose={onClose}
      width={480}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={submitting} onClick={handleSave}>
            保存
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" preserve={false}>
        {/* 字段类型(只读展示) */}
        <Form.Item label="字段类型">
          <Space>
            <FieldTypeBadge type={currentType} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {isEdit ? '类型创建后不可修改' : meta.description}
            </Text>
          </Space>
        </Form.Item>

        <Form.Item
          label="显示名称"
          name="label"
          rules={[
            { required: true, message: '请输入显示名称' },
            { max: 40, message: '不超过 40 个字符' },
          ]}
        >
          <Input placeholder="如:客户名称" disabled={isSystem} />
        </Form.Item>

        <Form.Item
          label="API 名称"
          name="apiName"
          tooltip="小写下划线,应用内唯一,创建后不可修改"
          rules={[
            { required: true, message: '请输入 API 名称' },
            {
              pattern: /^[a-z][a-z0-9_]*$/,
              message: '仅支持小写字母、数字、下划线,且以字母开头',
            },
          ]}
        >
          <Input
            placeholder="customer_name"
            style={{ fontFamily: 'monospace' }}
            disabled={isEdit}
          />
        </Form.Item>

        <Form.Item label="描述" name="description">
          <Input.TextArea rows={2} placeholder="字段说明(可选)" />
        </Form.Item>

        {/* 通用开关 */}
        <Space size={24} style={{ marginBottom: 8 }}>
          <Form.Item
            name="required"
            valuePropName="checked"
            label="必填"
            style={{ marginBottom: 0 }}
          >
            <Switch size="small" disabled={isSystem} />
          </Form.Item>
          <Form.Item name="unique" valuePropName="checked" label="唯一" style={{ marginBottom: 0 }}>
            <Switch size="small" disabled={isSystem} />
          </Form.Item>
          <Form.Item
            name="searchable"
            valuePropName="checked"
            label="可搜索"
            style={{ marginBottom: 0 }}
          >
            <Switch size="small" />
          </Form.Item>
        </Space>

        {/* 默认值(按类型适配) */}
        <DefaultValueItem type={currentType} options={options} isSystem={isSystem} />

        {/* 类型专属配置 */}
        <TypeSpecificConfig
          type={currentType}
          form={form}
          options={options}
          setOptions={setOptions}
          objectList={objectList}
        />
      </Form>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// 类型专属配置
// ---------------------------------------------------------------------------

interface TypeSpecificConfigProps {
  type: FieldType;
  form: ReturnType<typeof Form.useForm<FieldFormValues>>[0];
  options: SelectOption[];
  setOptions: React.Dispatch<React.SetStateAction<SelectOption[]>>;
  objectList?: { id: string; label: string; apiName: string }[];
}

/** 按字段类型渲染专属配置区块。 */
function TypeSpecificConfig({
  type,
  form: _form,
  options,
  setOptions,
  objectList,
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

// ---------------------------------------------------------------------------
// 默认值控件(按类型适配)
// ---------------------------------------------------------------------------

function DefaultValueItem({
  type,
  options,
  isSystem,
}: {
  type: FieldType;
  options: SelectOption[];
  isSystem: boolean;
}) {
  // 仅对简单类型渲染默认值输入
  const textLike: FieldType[] = ['text', 'long_text', 'rich_text', 'auto_number'];
  const numberLike: FieldType[] = ['number', 'currency', 'percent'];

  if (type === 'checkbox') {
    return (
      <Form.Item name="defaultValue" valuePropName="checked" label="默认值">
        <Switch disabled={isSystem} />
      </Form.Item>
    );
  }
  if (type === 'single_select') {
    return (
      <Form.Item name="defaultValue" label="默认值">
        <Select
          allowClear
          placeholder="选择默认选项"
          disabled={isSystem}
          options={options
            .filter((o) => !!o.label)
            .map((o) => ({ value: o.label, label: o.label }))}
        />
      </Form.Item>
    );
  }
  if (textLike.includes(type)) {
    return (
      <Form.Item name="defaultValue" label="默认值">
        <Input placeholder="默认值(可选)" disabled={isSystem} />
      </Form.Item>
    );
  }
  if (numberLike.includes(type)) {
    return (
      <Form.Item name="defaultValue" label="默认值">
        <InputNumber style={{ width: '100%' }} placeholder="默认值(可选)" disabled={isSystem} />
      </Form.Item>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// 选项管理器(单选 / 多选)
// ---------------------------------------------------------------------------

function OptionManager({
  options,
  setOptions,
  multiple,
}: {
  options: SelectOption[];
  setOptions: React.Dispatch<React.SetStateAction<SelectOption[]>>;
  multiple: boolean;
}) {
  /** 更新单个选项。 */
  const updateOption = (id: string, patch: Partial<SelectOption>) => {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  /** 删除选项。 */
  const removeOption = (id: string) => {
    setOptions((prev) => prev.filter((o) => o.id !== id));
  };

  /** 添加选项。 */
  const addOption = () => {
    setOptions((prev) => [
      ...prev,
      {
        id: genId(),
        label: '',
        color: PRESET_COLORS[prev.length % PRESET_COLORS.length],
        isDefault: false,
      },
    ]);
  };

  /** 设置默认(单选互斥)。 */
  const setDefault = (id: string, checked: boolean) => {
    if (multiple) {
      updateOption(id, { isDefault: checked });
    } else {
      // 单选:仅一项可为默认
      setOptions((prev) =>
        prev.map((o) => (o.id === id ? { ...o, isDefault: checked } : { ...o, isDefault: false })),
      );
    }
  };

  return (
    <Form.Item label="选项配置">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map((opt) => (
          <div
            key={opt.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              background: '#fafbfc',
              borderRadius: 8,
            }}
          >
            {/* 颜色选择 */}
            <ColorPicker
              size="small"
              value={opt.color ?? PRESET_COLORS[0]}
              onChange={(color) => updateOption(opt.id, { color: color.toHexString() })}
              presets={[{ label: '预设', colors: PRESET_COLORS }]}
            />
            {/* 标签 */}
            <Input
              value={opt.label}
              onChange={(e) => updateOption(opt.id, { label: e.target.value })}
              placeholder="选项名称"
              size="small"
              style={{ flex: 1 }}
            />
            {/* 默认 */}
            <Tooltip title={multiple ? '设为默认' : '设为默认(单选互斥)'}>
              <Checkbox
                checked={!!opt.isDefault}
                onChange={(e) => setDefault(opt.id, e.target.checked)}
              >
                <span style={{ fontSize: 12 }}>默认</span>
              </Checkbox>
            </Tooltip>
            {/* 删除 */}
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeOption(opt.id)}
            />
          </div>
        ))}
        <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addOption} block>
          添加选项
        </Button>
      </div>
    </Form.Item>
  );
}

// ---------------------------------------------------------------------------
// 字段类型徽章(抽屉内只读展示)
// ---------------------------------------------------------------------------

function FieldTypeBadge({ type }: { type: FieldType }) {
  const meta = getFieldTypeMeta(type);
  const Icon = meta.icon;
  return (
    <Space size={6}>
      <Icon style={{ color: '#1677ff' }} />
      <Text strong>{meta.label}</Text>
    </Space>
  );
}

// ---------------------------------------------------------------------------
// 初始值计算 & 配置构建
// ---------------------------------------------------------------------------

/** 计算表单初始值。 */
function computeInitialValues(type: FieldType, field?: Field): FieldFormValues {
  if (field) {
    const cfg = field.config ?? { type };
    const base: FieldFormValues = {
      label: field.label,
      apiName: field.apiName,
      required: field.required,
      unique: field.unique,
      searchable: field.searchable,
      description: field.description,
      defaultValue: field.defaultValue as string | number | boolean | undefined,
    };
    switch (type) {
      case 'text':
      case 'long_text':
      case 'rich_text':
        base.maxLength = cfg.maxLength;
        break;
      case 'number':
      case 'percent':
        base.precision = cfg.number?.precision;
        break;
      case 'currency':
        base.precision = cfg.currency?.precision;
        base.currencyCode = cfg.currency?.code;
        break;
      case 'auto_number':
        base.autoNumberFormat = cfg.autoNumber?.format;
        break;
      case 'date':
      case 'date_time':
        base.format = cfg.format;
        break;
      case 'user':
        base.multi = cfg.multi;
        break;
      case 'lookup':
        base.targetObjectId = cfg.lookup?.targetObjectId;
        base.relationType = cfg.lookup?.relationType;
        base.inverseFieldName = cfg.lookup?.inverseFieldName;
        break;
    }
    return base;
  }
  // 新增默认值
  const defaults: FieldFormValues = {
    label: '',
    apiName: '',
    required: false,
    unique: false,
    searchable: false,
  };
  switch (type) {
    case 'text':
      defaults.maxLength = 255;
      break;
    case 'long_text':
    case 'rich_text':
      defaults.maxLength = 2000;
      break;
    case 'number':
      defaults.precision = 0;
      break;
    case 'percent':
      defaults.precision = 2;
      break;
    case 'currency':
      defaults.precision = 2;
      defaults.currencyCode = 'CNY';
      break;
    case 'auto_number':
      defaults.autoNumberFormat = '{seq:0000}';
      break;
    case 'date':
      defaults.format = 'yyyy-MM-dd';
      break;
    case 'date_time':
      defaults.format = 'yyyy-MM-dd HH:mm';
      break;
    case 'lookup':
      defaults.relationType = 'one_to_many';
      break;
  }
  return defaults;
}

/** 根据表单值构建 FieldConfig。 */
function buildConfig(type: FieldType, v: FieldFormValues, options: SelectOption[]): FieldConfig {
  const config: FieldConfig = { type };
  switch (type) {
    case 'text':
    case 'long_text':
    case 'rich_text':
      config.maxLength = v.maxLength;
      break;
    case 'number':
    case 'percent':
      config.number = { precision: v.precision ?? 0 };
      break;
    case 'currency':
      config.currency = { precision: v.precision ?? 0, code: v.currencyCode ?? 'CNY' };
      break;
    case 'auto_number':
      config.autoNumber = { format: v.autoNumberFormat ?? '{seq:0000}' };
      break;
    case 'single_select':
    case 'multi_select':
      config.options = options.filter((o) => !!o.label).map((o) => ({ ...o }));
      break;
    case 'date':
    case 'date_time':
      config.format = v.format;
      break;
    case 'user':
      config.multi = v.multi;
      break;
    case 'lookup':
      config.lookup = {
        targetObjectId: v.targetObjectId ?? '',
        relationType: v.relationType ?? 'one_to_many',
        inverseFieldName: v.inverseFieldName,
      };
      break;
  }
  return config;
}

/** 统一错误提示。 */
function showError(err: unknown) {
  const axErr = err as {
    response?: { data?: { error?: { message?: string } }; message?: string };
    message?: string;
  };
  message.error(axErr.response?.data?.error?.message ?? axErr.message ?? '操作失败,请重试');
}
