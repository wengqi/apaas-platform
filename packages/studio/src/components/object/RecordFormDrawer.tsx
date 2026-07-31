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

  /** 仅可编辑的业务字段(排除只读类型)。 */
  const editableFields = fields.filter((f) => !isReadonlyType(f.type));

  /** 新增记录。 */
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => objectsApi.records.create(object.id, data),
    onSuccess: () => {
      message.success('记录已创建');
      queryClient.invalidateQueries({ queryKey: ['object', object.id, 'records'] });
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
      queryClient.invalidateQueries({ queryKey: ['object', object.id, 'records'] });
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
        {fields.map((field) => (
          <FieldFormItem key={field.id} field={field} />
        ))}
        {fields.length === 0 && (
          <Text type="secondary">该对象暂无字段</Text>
        )}
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
      <Icon style={{ fontSize: 14, color: '#1677ff' }} />
      <span>{field.label}</span>
      {field.required && <span style={{ color: '#ff4d4f' }}>*</span>}
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
      rules={field.required && !readonly ? [{ required: true, message: `请输入${field.label}` }] : []}
    >
      <FieldControl field={field} disabled={readonly} />
    </Form.Item>
  );
}

/** 按字段类型渲染表单控件。 */
function FieldControl({
  field,
  disabled,
}: {
  field: Field;
  disabled: boolean;
}) {
  const type = field.type;

  if (disabled) {
    // 只读字段:展示为禁用 Input
    return <Input disabled placeholder="系统自动生成" />;
  }

  switch (type) {
    case 'long_text':
    case 'rich_text':
      return <Input.TextArea rows={3} placeholder={`请输入${field.label}`} />;
    case 'number':
    case 'percent':
      return <InputNumber style={{ width: '100%' }} placeholder={`请输入${field.label}`} />;
    case 'currency':
      return <InputNumber style={{ width: '100%' }} placeholder={`请输入${field.label}`} addonAfter={field.config.currency?.code ?? 'CNY'} />;
    case 'single_select': {
      const options = (field.config.options ?? []).filter((o) => !!o.label);
      return (
        <Select
          allowClear
          placeholder={`请选择${field.label}`}
          options={options.map((o) => ({
            value: o.label,
            label: o.label,
          }))}
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
            value: o.label,
            label: o.label,
          }))}
        />
      );
    }
    case 'date':
      return <DatePicker style={{ width: '100%' }} placeholder={`请选择${field.label}`} />;
    case 'date_time':
      return <DatePicker showTime style={{ width: '100%' }} placeholder={`请选择${field.label}`} />;
    case 'checkbox':
      return <Switch />;
    default:
      return <Input placeholder={`请输入${field.label}`} />;
  }
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
