import { useEffect, useState } from 'react';
import { Button, Drawer, Form, Input, Space, Switch, Typography, message } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import {
  objectsApi,
  type CreateFieldRequest,
  type Field,
  type SelectOption,
  type UpdateFieldRequest,
} from '../../api/objects.js';
import { getFieldTypeMeta, type FieldType } from '../../constants/fieldTypes.js';
import TypeSpecificConfig from './field-config/TypeSpecificConfig.js';
import DefaultValueItem from './field-config/DefaultValueItem.js';
import FieldTypeBadge from './field-config/FieldTypeBadge.js';
import {
  buildConfig,
  computeInitialValues,
  showError,
  type FieldFormValues,
} from './field-config/utils.js';

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
    queryKey: qk.appObjects(appId),
    queryFn: () => objectsApi.list(appId),
    enabled: !!appId && currentType === 'lookup',
  });

  /** 新增字段。 */
  const addFieldMutation = useMutation({
    mutationFn: (data: CreateFieldRequest) => objectsApi.addField(objectId, data),
    onSuccess: () => {
      message.success('字段已添加');
      queryClient.invalidateQueries({ queryKey: qk.object(objectId) });
      // QA 交互评审（2026-10-03）：同步失效对象列表，左栏「N字段」统计即时刷新
      if (appId) queryClient.invalidateQueries({ queryKey: qk.appObjects(appId) });
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
      queryClient.invalidateQueries({ queryKey: qk.object(objectId) });
      if (appId) queryClient.invalidateQueries({ queryKey: qk.appObjects(appId) });
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
          objectId={objectId}
        />
      </Form>
    </Drawer>
  );
}

/** 按字段类型渲染专属配置区块。 */

// ---------------------------------------------------------------------------
// 初始值计算 & 配置构建
// ---------------------------------------------------------------------------

/** 计算表单初始值。 */

/** 根据表单值构建 FieldConfig。 */

/** 统一错误提示。 */
