import { TOKENS as T } from '@apaas/shared/design';
import { useEffect } from 'react';
import {
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Typography,
  message,
} from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import dayjs from 'dayjs';
import { objectsApi, type Field, type RecordItem } from '../../api/objects.js';
import { getFieldTypeMeta } from '../../constants/fieldTypes.js';

const { Text } = Typography;

interface RecordFormDrawerProps {
  open: boolean;
  mode: 'create' | 'edit';
  object: { id: string; label: string };
  fields: Field[];
  /** 编辑时的记录数据 */
  record?: RecordItem | undefined;
  onClose: () => void;
}

/** 表单值:field apiName → 值(动态键,AntD Form 需宽松索引签名)。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecordFormValues = Record<string, any>;

/**
 * 记录表单抽屉(新增 / 编辑)。
 * 根据对象字段动态生成表单项,按字段类型渲染对应控件。
 * AutoNumber / Formula 字段只读(系统自动生成)。
 */
export default function RecordFormDrawer({
  open,
  mode,
  object,
  fields,
  record,
  onClose,
}: RecordFormDrawerProps) {
  const queryClient = useQueryClient();
  const [form] = Form.useForm<RecordFormValues>();

  const isEdit = mode === 'edit';

  /**
   * 表单可见字段：排除 isSystem 系统字段。
   * 评审整改：created_by/created_at/updated_by/updated_at 等系统字段由后端自动维护，
   * 不应出现在新增/编辑表单中让用户手填。
   */
  const visibleFields = fields.filter((f) => !f.isSystem);

  /** 仅可编辑的业务字段(排除系统字段与只读类型)。 */
  const editableFields = fields.filter((f) => !f.isSystem && !isReadonlyType(f.type));

  /** 新增记录。 */
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => objectsApi.records.create(object.id, data),
    onSuccess: () => {
      message.success('记录已创建');
      queryClient.invalidateQueries({ queryKey: qk.objectRecords(object.id) });
      onClose();
    },
    onError: (err) => showError(err),
  });

  /** 更新记录。 */
  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => {
      if (!record) throw new Error('记录不存在');
      return objectsApi.records.update(record.id, data);
    },
    onSuccess: () => {
      message.success('记录已更新');
      queryClient.invalidateQueries({ queryKey: qk.objectRecords(object.id) });
      onClose();
    },
    onError: (err) => showError(err),
  });

  /** 打开时初始化表单。 */
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (isEdit && record) {
      const values: RecordFormValues = {};
      for (const f of fields) {
        const raw = record.data[f.apiName];
        values[f.apiName] = toFormValue(f, raw);
      }
      form.setFieldsValue(values);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record?.id, mode]);

  const handleSave = async () => {
    let values: RecordFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return; // 校验错误由 Form 展示
    }
    // 将表单值转换为存储值(日期 Dayjs → ISO 字符串等)
    const data: Record<string, unknown> = {};
    for (const f of editableFields) {
      if (values[f.apiName] !== undefined) {
        data[f.apiName] = toStoredValue(f, values[f.apiName]);
      }
    }
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const submitting = createMutation.isPending || updateMutation.isPending;
  const title = `${isEdit ? '编辑' : '新增'}${object.label}`;

  return (
    <Drawer
      title={title}
      open={open}
      onClose={onClose}
      width={520}
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
        {/* 评审整改：渲染 visibleFields 而非全量 fields，系统字段不进入表单 */}
        {visibleFields.map((field) => (
          <FieldFormItem key={field.id} field={field} />
        ))}
        {visibleFields.length === 0 && <Text type="secondary">该对象暂无字段</Text>}
      </Form>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// 单个字段表单项
// ---------------------------------------------------------------------------

function FieldFormItem({ field }: { field: Field }) {
  const meta = getFieldTypeMeta(field.type);
  const Icon = meta.icon;
  const readonly = isReadonlyType(field.type);

  const label = (
    <Space size={6}>
      <Icon style={{ fontSize: 14, color: T.colorPrimary }} />
      <span>{field.label}</span>
      {field.required && <span style={{ color: T.colorError }}>*</span>}
      {readonly && (
        <Text type="secondary" style={{ fontSize: 11, fontWeight: 'normal' }}>
          (系统自动)
        </Text>
      )}
    </Space>
  );

  return (
    <Form.Item
      label={label}
      name={field.apiName}
      rules={
        field.required && !readonly ? [{ required: true, message: `请输入${field.label}` }] : []
      }
    >
      <FieldControl field={field} disabled={readonly} />
    </Form.Item>
  );
}

/**
 * 按字段类型渲染表单控件。
 * Form.Item 会向直接子组件注入 value/onChange（受控绑定）——必须接收并透传给
 * 实际的 AntD 控件，否则输入值不会进入 form store，必填校验永远失败。
 */
function FieldControl({
  field,
  disabled,
  value,
  onChange,
}: {
  field: Field;
  disabled: boolean;
  value?: unknown;
  onChange?: (v: unknown) => void;
}) {
  const type = field.type;

  if (disabled) {
    // 只读字段:展示为禁用 Input(仅需 value 展示,无需 onChange)
    return (
      <Input
        disabled
        placeholder="系统自动生成"
        value={typeof value === 'string' ? value : undefined}
      />
    );
  }

  switch (type) {
    case 'long_text':
    case 'rich_text':
      return (
        <Input.TextArea
          rows={3}
          placeholder={`请输入${field.label}`}
          value={typeof value === 'string' ? value : undefined}
          onChange={(e) => onChange?.(e.target.value)}
        />
      );
    case 'number':
    case 'percent':
      return (
        <InputNumber
          style={{ width: '100%' }}
          placeholder={`请输入${field.label}`}
          value={typeof value === 'number' ? value : undefined}
          onChange={(v) => onChange?.(v ?? null)}
        />
      );
    case 'currency':
      return (
        <InputNumber
          style={{ width: '100%' }}
          placeholder={`请输入${field.label}`}
          addonAfter={field.config.currency?.code ?? 'CNY'}
          value={typeof value === 'number' ? value : undefined}
          onChange={(v) => onChange?.(v ?? null)}
        />
      );
    case 'single_select': {
      const options = (field.config.options ?? []).filter((o) => !!o.label);
      return (
        <Select
          allowClear
          placeholder={`请选择${field.label}`}
          // 评审整改：存 value（未配置时回退 label），界面显示 label——
          // 使流程条件/集成依据稳定编码而非展示文案
          options={options.map((o) => ({
            value: optionsStored(o),
            label: o.label,
          }))}
          value={typeof value === 'string' ? value : undefined}
          onChange={(v) => onChange?.(v)}
        />
      );
    }
    case 'multi_select': {
      const options = (field.config.options ?? []).filter((o) => !!o.label);
      return (
        <Select
          mode="multiple"
          allowClear
          placeholder={`请选择${field.label}`}
          options={options.map((o) => ({
            value: optionsStored(o),
            label: o.label,
          }))}
          value={Array.isArray(value) ? (value as string[]) : undefined}
          onChange={(v) => onChange?.(v)}
        />
      );
    }
    case 'date':
      return (
        <DatePicker
          style={{ width: '100%' }}
          placeholder={`请选择${field.label}`}
          value={isDayjs(value) ? value : undefined}
          onChange={(d) => onChange?.(d)}
        />
      );
    case 'date_time':
      return (
        <DatePicker
          showTime
          style={{ width: '100%' }}
          placeholder={`请选择${field.label}`}
          value={isDayjs(value) ? value : undefined}
          onChange={(d) => onChange?.(d)}
        />
      );
    case 'checkbox':
      return <Switch checked={value === true} onChange={(v) => onChange?.(v)} />;
    default:
      return (
        <Input
          placeholder={`请输入${field.label}`}
          value={typeof value === 'string' ? value : undefined}
          onChange={(e) => onChange?.(e.target.value)}
        />
      );
  }
}

/** 评审整改：选项存储值（value 优先，未配置回退 label）。 */
function optionsStored(option: { label: string; value?: string }): string {
  return option.value ?? option.label;
}

/** narrows an unknown form value to a Dayjs instance (DatePicker 受控值). */
function isDayjs(v: unknown): v is dayjs.Dayjs {
  return (
    typeof v === 'object' &&
    v !== null &&
    'isValid' in v &&
    typeof (v as dayjs.Dayjs).isValid === 'function'
  );
}

// ---------------------------------------------------------------------------
// 值转换工具
// ---------------------------------------------------------------------------

/** 只读类型(系统自动生成,不可编辑)。 */
function isReadonlyType(type: Field['type']): boolean {
  return type === 'auto_number' || type === 'formula' || type === 'rollup';
}

/** 存储值 → 表单值(日期字符串 → Dayjs)。 */
function toFormValue(field: Field, raw: unknown): unknown {
  if (raw === undefined || raw === null) return undefined;
  if (field.type === 'date' || field.type === 'date_time') {
    const d = dayjs(raw as string);
    return d.isValid() ? d : undefined;
  }
  if (field.type === 'checkbox') {
    return raw === true || raw === 'true';
  }
  return raw;
}

/** 表单值 → 存储值(Dayjs → ISO 字符串)。 */
function toStoredValue(field: Field, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (field.type === 'date' || field.type === 'date_time') {
    // Dayjs 对象 → ISO 字符串
    if (typeof value === 'object' && value !== null && 'toISOString' in value) {
      return (value as dayjs.Dayjs).toISOString();
    }
    return value;
  }
  return value;
}

/** 统一错误提示。 */
function showError(err: unknown) {
  const axErr = err as {
    response?: { data?: { error?: { message?: string } }; message?: string };
    message?: string;
  };
  message.error(axErr.response?.data?.error?.message ?? axErr.message ?? '操作失败,请重试');
}
