import { createContext, useContext, useMemo, useState } from 'react';
import {
  Button,
  Empty,
  Input,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  HolderOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
 * 展示字段名 / API 名 / 类型 / 必填开关 / 操作,支持拖拽排序。
 * 添加字段 → 字段类型选择器 → 字段配置抽屉;编辑 → 直接打开抽屉;删除 → 二次确认。
 *
 * 排序:系统字段置顶(不可拖拽),自定义字段可拖拽调整顺序。
 * 拖拽完成后乐观更新缓存,并逐个调用 updateField 持久化 order。
 */
export default function FieldTable({ object, appId }: FieldTableProps) {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [drawerFieldType, setDrawerFieldType] = useState<FieldType | undefined>(undefined);
  const [drawerField, setDrawerField] = useState<Field | undefined>(undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  /**
   * 系统字段置顶,其余按 order(无值则按原始数组索引)排序;再按关键字过滤。
   * order 不存在时回退到数组下标,保持后端返回的原序。
   */
  const fields = useMemo(() => {
    const withOrder = object.fields.map((f, idx) => ({
      field: f,
      order: f.order ?? idx,
    }));
    withOrder.sort((a, b) => {
      if (a.field.isSystem && !b.field.isSystem) return -1;
      if (!a.field.isSystem && b.field.isSystem) return 1;
      return a.order - b.order;
    });
    const sorted = withOrder.map((w) => w.field);
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

  /**
   * 拖拽结束:在自定义字段范围内重排,乐观更新缓存并持久化 order。
   * 系统字段不可拖拽,跨系统/自定义边界拖拽忽略。
   */
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeField = object.fields.find((f) => f.id === activeId);
    const overField = object.fields.find((f) => f.id === overId);
    if (!activeField || !overField) return;
    // 系统字段边界保护
    if (activeField.isSystem || overField.isSystem) return;

    // 基于当前排好的展示列表做 arrayMove
    const ids = fields.map((f) => f.id);
    const oldIndex = ids.indexOf(activeId);
    const newIndex = ids.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return;
    const reorderedIds = arrayMove(ids, oldIndex, newIndex);

    // 为自定义字段分配新的 order(系统字段保持原 order)
    const newOrderMap = new Map<string, number>();
    let customOrder = 0;
    for (const id of reorderedIds) {
      const f = object.fields.find((fi) => fi.id === id);
      if (f?.isSystem) {
        newOrderMap.set(id, f.order ?? 0);
      } else {
        newOrderMap.set(id, customOrder);
        customOrder += 1;
      }
    }

    // 乐观更新缓存
    const queryKey = ['object', object.id];
    queryClient.setQueryData<ObjectWithFields>(queryKey, (old) => {
      if (!old) return old;
      return {
        ...old,
        fields: old.fields.map((f) => ({
          ...f,
          order: newOrderMap.get(f.id) ?? f.order,
        })),
      };
    });

    // 逐个持久化变更的 order(仅自定义字段)
    const changed = object.fields.filter(
      (f) => !f.isSystem && newOrderMap.get(f.id) !== f.order,
    );
    try {
      for (const f of changed) {
        const newOrder = newOrderMap.get(f.id);
        await objectsApi.updateField(object.id, f.id, { order: newOrder });
      }
    } catch (err) {
      showError(err);
      // 失败回滚:刷新以恢复真实状态
      queryClient.invalidateQueries({ queryKey });
    }
  };

  const columns: ColumnsType<Field> = [
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
            <Icon style={{ fontSize: 16, color: '#1677ff' }} />
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
          <span style={{ marginLeft: 8, color: 'rgba(0,0,0,0.35)' }}>拖拽 ⠿ 调整顺序</span>
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

      {/* 字段表格(可拖拽排序) */}
      {fields.length === 0 ? (
        <Empty description={keyword ? '未找到匹配字段' : '还没有字段'} style={{ padding: '60px 0' }}>
          {!keyword && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddClick}>
              添加第一个字段
            </Button>
          )}
        </Empty>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <Table<Field>
              rowKey="id"
              size="middle"
              columns={columns}
              dataSource={fields}
              pagination={false}
              bordered={false}
              components={{ body: { row: SortableRow } }}
              rowClassName={(record) => (record.isSystem ? 'apaas-system-field-row' : '')}
              onRow={(record) => ({
                onDoubleClick: () => handleEdit(record),
              })}
            />
          </SortableContext>
        </DndContext>
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

// ---------------------------------------------------------------------------
// 拖拽排序:行组件 + 拖拽手柄
// ---------------------------------------------------------------------------

/** 行间共享 useSortable 的 listeners/attributes(供手柄使用)。 */
interface RowDragContextValue {
  listeners?: ReturnType<typeof useSortable>['listeners'];
  attributes?: ReturnType<typeof useSortable>['attributes'];
  isDragging?: boolean;
}
const RowDragContext = createContext<RowDragContextValue>({});

/** AntD Table 自定义行:绑定 useSortable,通过 Context 暴露手柄事件。 */
function SortableRow(props: React.HTMLAttributes<HTMLTableRowElement> & { 'data-row-key'?: string }) {
  const id = props['data-row-key'] as string | undefined;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: id ?? '',
  });
  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: 'move',
    ...(isDragging ? { position: 'relative', zIndex: 10, background: '#e6f4ff' } : {}),
  };
  return (
    <RowDragContext.Provider value={{ listeners, attributes, isDragging }}>
      <tr {...props} ref={setNodeRef} style={style} />
    </RowDragContext.Provider>
  );
}

/** 拖拽手柄(第一列)。从 Context 取 listeners 绑定到图标按钮。 */
function DragHandle() {
  const { listeners, attributes } = useContext(RowDragContext);
  return (
    <Button
      type="text"
      size="small"
      {...attributes}
      {...listeners}
      icon={<HolderOutlined style={{ cursor: 'grab', color: 'rgba(0,0,0,0.35)' }} />}
      style={{ touchAction: 'none' }}
    />
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
