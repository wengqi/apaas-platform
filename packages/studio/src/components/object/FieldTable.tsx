import { useMemo, useState } from 'react';
import {
  Button,
  Empty,
  Input,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { objectsApi, type Field, type ObjectWithFields } from '../../api/objects.js';
import { getFieldTypeMeta, type FieldType } from '../../constants/fieldTypes.js';
import FieldTypePicker, { FieldTypeTag } from './FieldTypePicker.js';
import FieldConfigDrawer from './FieldConfigDrawer.js';

const { Text } = Typography;

interface FieldTableProps {
  object: ObjectWithFields;
  appId: string;
}

/**
 * 字段列表表格。
 * 展示字段名 / API 名 / 类型 / 必填开关 / 操作。
 * 添加字段 → 字段类型选择器 → 字段配置抽屉;编辑 → 直接打开抽屉;删除 → 二次确认。
 */
export default function FieldTable({ object, appId }: FieldTableProps) {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [drawerFieldType, setDrawerFieldType] = useState<FieldType | undefined>(undefined);
  const [drawerField, setDrawerField] = useState<Field | undefined>(undefined);

  /** 系统字段置顶,其余保持原序;再按关键字过滤。 */
  const fields = useMemo(() => {
    const sorted = [...object.fields].sort((a, b) => {
      if (a.isSystem && !b.isSystem) return -1;
      if (!a.isSystem && b.isSystem) return 1;
      return 0;
    });
    const kw = keyword.trim().toLowerCase();
    if (!kw) return sorted;
    return sorted.filter(
      (f) => f.label.toLowerCase().includes(kw) || f.apiName.toLowerCase().includes(kw),
    );
  }, [object.fields, keyword]);

  /** 删除字段。 */
  const deleteFieldMutation = useMutation({
    mutationFn: (fieldId: string) => objectsApi.deleteField(object.id, fieldId),
    onSuccess: () => {
      message.success('字段已删除');
      queryClient.invalidateQueries({ queryKey: ['object', object.id] });
    },
    onError: (err) => showError(err),
  });

  /** 内联更新字段(必填开关等)。 */
  const updateFieldMutation = useMutation({
    mutationFn: ({ fieldId, data }: { fieldId: string; data: { required?: boolean } }) =>
      objectsApi.updateField(object.id, fieldId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['object', object.id] });
    },
    onError: (err) => {
      showError(err);
      // 失败回滚:刷新以恢复真实状态
      queryClient.invalidateQueries({ queryKey: ['object', object.id] });
    },
  });

  /** 打开类型选择器(添加字段)。 */
  const handleAddClick = () => {
    setDrawerMode('create');
    setDrawerField(undefined);
    setPickerOpen(true);
  };

  /** 选定类型后打开配置抽屉(新增)。 */
  const handlePickType = (type: FieldType) => {
    setPickerOpen(false);
    setDrawerFieldType(type);
    setDrawerMode('create');
    setDrawerField(undefined);
    setDrawerOpen(true);
  };

  /** 打开配置抽屉(编辑)。 */
  const handleEdit = (field: Field) => {
    setDrawerFieldType(field.type);
    setDrawerField(field);
    setDrawerMode('edit');
    setDrawerOpen(true);
  };

  /** 必填开关切换。 */
  const handleRequiredChange = (field: Field, checked: boolean) => {
    updateFieldMutation.mutate({ fieldId: field.id, data: { required: checked } });
  };

  const columns: ColumnsType<Field> = [
    {
      title: '字段名',
      dataIndex: 'label',
      width: 240,
      render: (_, record) => {
        const meta = getFieldTypeMeta(record.type);
        const Icon = meta.icon;
        return (
          <Space size={8}>
            <Icon style={{ fontSize: 16, color: '#1677ff' }} />
            <Text strong>{record.label}</Text>
            {record.required && (
              <Text type="danger" style={{ fontSize: 14 }}>
                *
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: 'API 名',
      dataIndex: 'apiName',
      width: 200,
      render: (apiName: string) => (
        <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 13 }}>
          {apiName}
        </Text>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 140,
      render: (type: FieldType) => <FieldTypeTag type={type} />,
    },
    {
      title: '必填',
      dataIndex: 'required',
      width: 80,
      render: (_, record) => (
        <Switch
          size="small"
          checked={record.required}
          disabled={record.isSystem}
          onChange={(checked) => handleRequiredChange(record, checked)}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="编辑">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          {!record.isSystem && (
            <Popconfirm
              title="删除字段"
              description={`确定删除字段「${record.label}」吗?删除后数据将不可恢复。`}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => deleteFieldMutation.mutate(record.id)}
            >
              <Tooltip title="删除">
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const systemCount = object.fields.filter((f) => f.isSystem).length;

  return (
    <div>
      {/* 工具栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Text type="secondary" style={{ fontSize: 13 }}>
          共 {object.fields.length} 个字段{systemCount > 0 ? `(含 ${systemCount} 个系统字段)` : ''}
        </Text>
        <Space>
          <Input
            allowClear
            size="small"
            placeholder="搜索字段名"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 200 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddClick}>
            添加字段
          </Button>
        </Space>
      </div>

      {/* 字段表格 */}
      {fields.length === 0 ? (
        <Empty description={keyword ? '未找到匹配字段' : '还没有字段'} style={{ padding: '60px 0' }}>
          {!keyword && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddClick}>
              添加第一个字段
            </Button>
          )}
        </Empty>
      ) : (
        <Table<Field>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={fields}
          pagination={false}
          bordered={false}
          rowClassName={(record) => (record.isSystem ? 'apaas-system-field-row' : '')}
          onRow={(record) => ({
            onDoubleClick: () => handleEdit(record),
          })}
        />
      )}

      {/* 字段类型选择器 */}
      <FieldTypePicker
        open={pickerOpen}
        onSelect={handlePickType}
        onCancel={() => setPickerOpen(false)}
      />

      {/* 字段配置抽屉 */}
      <FieldConfigDrawer
        open={drawerOpen}
        mode={drawerMode}
        fieldType={drawerFieldType}
        field={drawerField}
        objectId={object.id}
        appId={appId}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}

/** 统一错误提示。 */
function showError(err: unknown) {
  const axErr = err as {
    response?: { data?: { error?: { message?: string } }; message?: string };
    message?: string;
  };
  message.error(axErr.response?.data?.error?.message ?? axErr.message ?? '操作失败,请重试');
}
