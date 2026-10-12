/**
 * 字段表格 — 列定义（从 FieldTable.tsx 拆分，AGENTS.md 单文件 400 行规范）。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { Button, Popconfirm, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Field } from '../../../api/objects.js';
import { getFieldTypeMeta, type FieldType } from '../../../constants/fieldTypes.js';
import { FieldTypeTag } from '../FieldTypePicker.js';
import { DragHandle } from './SortableRow.js';

const { Text } = Typography;

/** 列定义所需的外部回调（主组件提供）。 */
export interface FieldColumnsDeps {
  /** 打开配置抽屉(编辑)。 */
  onEdit: (field: Field) => void;
  /** 必填开关切换。 */
  onRequiredChange: (field: Field, checked: boolean) => void;
  /** 删除字段。 */
  onDelete: (fieldId: string) => void;
}

/** 构建字段列表表格的列定义。 */
export function buildFieldColumns({
  onEdit,
  onRequiredChange,
  onDelete,
}: FieldColumnsDeps): ColumnsType<Field> {
  return [
    {
      key: 'drag',
      title: '',
      width: 40,
      align: 'center',
      render: (_, record) => (record.isSystem ? null : <DragHandle />),
    },
    {
      title: '字段名',
      dataIndex: 'label',
      width: 240,
      render: (_, record) => {
        const meta = getFieldTypeMeta(record.type);
        const Icon = meta.icon;
        return (
          <Space size={8}>
            <Icon style={{ fontSize: 16, color: T.colorPrimary }} />
            <Text strong>{record.label}</Text>
            {record.isSystem && (
              <Tag color="default" style={{ margin: 0, fontSize: 11, lineHeight: '18px' }}>
                系统
              </Tag>
            )}
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
          onChange={(checked) => onRequiredChange(record, checked)}
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
              onClick={() => onEdit(record)}
            />
          </Tooltip>
          {!record.isSystem && (
            <Popconfirm
              title="删除字段"
              description={`确定删除字段「${record.label}」吗?删除后数据将不可恢复。`}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => onDelete(record.id)}
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
}
