import { useMemo, useState } from 'react';
import {
  Button,
  Empty,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  FilterOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  objectsApi,
  type Field,
  type FilterOperator,
  type ObjectWithFields,
  type RecordFilterCondition,
  type RecordItem,
} from '../../api/objects.js';
import { getFieldTypeMeta, type FieldType } from '../../constants/fieldTypes.js';
import RecordFormDrawer from './RecordFormDrawer.js';

const { Text } = Typography;

interface RecordListProps {
  object: ObjectWithFields;
}

/** 操作符 → 中文标签。 */
const OPERATOR_LABEL: Record<FilterOperator, string> = {
  eq: '等于',
  ne: '不等于',
  contains: '包含',
  not_contains: '不包含',
  starts_with: '开头是',
  ends_with: '结尾是',
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  is_empty: '为空',
  is_not_empty: '不为空',
  in: '属于',
  not_in: '不属于',
};

/** 无需输入值的操作符。 */
const NO_VALUE_OPERATORS: FilterOperator[] = ['is_empty', 'is_not_empty'];

/** 系统字段列定义(直接从记录列读取,非 data JSON)。 */
interface SystemColumn {
  key: string;
  title: string;
  width: number;
  render: (record: RecordItem) => React.ReactNode;
}

/** 排序状态(field apiName + 方向)。 */
interface SortState {
  field: string;
  order: 'asc' | 'desc';
}

/** 筛选行状态。 */
interface FilterRow {
  field: string; // apiName
  operator: FilterOperator;
  value: unknown;
}

/**
 * 记录列表(数据表格)。
 * 根据对象字段动态生成列,支持分页 / 筛选 / 排序 / 新增 / 编辑 / 删除。
 */
export default function RecordList({ object }: RecordListProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<SortState | undefined>(undefined);
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  /** 已应用的筛选(点击筛选按钮后才生效)。 */
  const [appliedFilter, setAppliedFilter] = useState<FilterRow[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editRecord, setEditRecord] = useState<RecordItem | undefined>(undefined);

  /** 第一个文本类字段(用于全文搜索 contains)。 */
  const firstTextField = useMemo(
    () => object.fields.find((f) => ['text', 'long_text'].includes(f.type)),
    [object.fields],
  );

  /** 构建筛选 JSON 字符串(field 用 apiName)。 */
  const filterStr = useMemo(() => {
    const conditions: RecordFilterCondition[] = [];

    // 全文搜索(对第一个文本字段 contains)
    if (appliedSearch && firstTextField) {
      conditions.push({
        field: firstTextField.apiName,
        operator: 'contains',
        value: appliedSearch,
      });
    }

    // 筛选行(忽略无值且需要值的条件)
    for (const row of appliedFilter) {
      if (NO_VALUE_OPERATORS.includes(row.operator)) {
        conditions.push({ field: row.field, operator: row.operator });
      } else if (row.value !== undefined && row.value !== '' && row.value !== null) {
        conditions.push({ field: row.field, operator: row.operator, value: row.value });
      }
    }

    if (conditions.length === 0) return undefined;
    return JSON.stringify(conditions);
  }, [appliedFilter, appliedSearch, firstTextField]);

  /** 排序字符串(field:order)。 */
  const sortStr = useMemo(() => {
    if (!sort) return undefined;
    return `${sort.field}:${sort.order}`;
  }, [sort]);

  /** 加载记录列表。 */
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['object', object.id, 'records', page, pageSize, sortStr, filterStr],
    queryFn: () =>
      objectsApi.records.list(object.id, {
        page,
        pageSize,
        sort: sortStr,
        filter: filterStr,
      }),
  });

  /** 删除记录。 */
  const deleteMutation = useMutation({
    mutationFn: (recordId: string) => objectsApi.records.delete(recordId),
    onSuccess: () => {
      message.success('记录已删除');
      queryClient.invalidateQueries({ queryKey: ['object', object.id, 'records'] });
    },
    onError: (err) => showError(err),
  });

  // -------------------------------------------------------------------------
  // 列定义
  // -------------------------------------------------------------------------

  /** 系统字段列(创建时间 / 更新时间 / 创建人)。 */
  const systemColumns: SystemColumn[] = [
    {
      key: 'createdAt',
      title: '创建时间',
      width: 160,
      render: (r) => <Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(r.createdAt)}</Text>,
    },
    {
      key: 'updatedAt',
      title: '更新时间',
      width: 160,
      render: (r) => <Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(r.updatedAt)}</Text>,
    },
    {
      key: 'createdBy',
      title: '创建人',
      width: 120,
      render: (r) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {r.createdBy ?? '—'}
        </Text>
      ),
    },
  ];

  /** 业务字段列(根据字段类型渲染值)。 */
  const businessColumns: ColumnsType<RecordItem> = object.fields.map((field) => ({
    title: field.label,
    key: field.apiName,
    width: 160,
    sorter: true,
    sortOrder:
      sort?.field === field.apiName
        ? sort.order === 'asc'
          ? 'ascend'
          : 'descend'
        : undefined,
    render: (_: unknown, record: RecordItem) => (
      <RecordCellValue field={field} value={record.data[field.apiName]} />
    ),
  }));

  /** 操作列。 */
  const actionColumn: ColumnsType<RecordItem>[number] = {
    title: '操作',
    key: '_actions',
    width: 100,
    fixed: 'right',
    render: (_: unknown, record: RecordItem) => (
      <Space size={4}>
        <Tooltip title="编辑">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditRecord(record);
              setFormMode('edit');
              setFormOpen(true);
            }}
          />
        </Tooltip>
        <Popconfirm
          title="删除记录"
          description="确定删除此记录吗?删除后不可恢复。"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => deleteMutation.mutate(record.id)}
        >
          <Tooltip title="删除">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Tooltip>
        </Popconfirm>
      </Space>
    ),
  };

  const columns: ColumnsType<RecordItem> = [...businessColumns, ...systemColumns.map((c) => ({
    title: c.title,
    key: c.key,
    width: c.width,
    render: (_: unknown, record: RecordItem) => c.render(record),
  })), actionColumn];

  // -------------------------------------------------------------------------
  // 事件处理
  // -------------------------------------------------------------------------

  /** 点击列标题排序(三态:asc → desc → 取消)。 */
  const handleTableChange = (pagination: TablePaginationConfig, _filters: unknown, sorter: unknown) => {
    const s = sorter as { field?: string; columnKey?: string; order?: 'ascend' | 'descend' };
    const colKey = s.columnKey as string | undefined;
    if (colKey && s.order) {
      setSort({ field: colKey, order: s.order === 'ascend' ? 'asc' : 'desc' });
    } else {
      setSort(undefined);
    }
    setPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? 10);
  };

  /** 应用筛选。 */
  const handleApplyFilter = () => {
    setAppliedFilter(filterRows.filter((r) => r.field));
    setPage(1);
  };

  /** 重置筛选。 */
  const handleResetFilter = () => {
    setFilterRows([]);
    setAppliedFilter([]);
    setAppliedSearch('');
    setSearchKeyword('');
    setPage(1);
  };

  /** 全文搜索。 */
  const handleSearch = () => {
    setAppliedSearch(searchKeyword);
    setPage(1);
  };

  /** 新增记录。 */
  const handleAdd = () => {
    setEditRecord(undefined);
    setFormMode('create');
    setFormOpen(true);
  };

  // -------------------------------------------------------------------------
  // 筛选行操作
  // -------------------------------------------------------------------------

  const addFilterRow = () => {
    const firstField = object.fields[0];
    setFilterRows((prev) => [
      ...prev,
      { field: firstField?.apiName ?? '', operator: 'eq', value: '' },
    ]);
  };

  const updateFilterRow = (index: number, patch: Partial<FilterRow>) => {
    setFilterRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeFilterRow = (index: number) => {
    setFilterRows((prev) => prev.filter((_, i) => i !== index));
  };

  const records = data?.items ?? [];
  const total = data?.total ?? 0;

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
          共 {total} 条记录
        </Text>
        <Space>
          {firstTextField && (
            <Input
              allowClear
              size="small"
              placeholder={`搜索${firstTextField.label}`}
              prefix={<SearchOutlined />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onPressEnter={handleSearch}
              style={{ width: 200 }}
            />
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增记录
          </Button>
        </Space>
      </div>

      {/* 筛选栏 */}
      <div
        style={{
          background: '#fafbfc',
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filterRows.map((row, index) => {
            const field = object.fields.find((f) => f.apiName === row.field);
            const operators: FilterOperator[] = field ? getOperatorsForType(field.type) : ['eq', 'ne'];
            const needValue = !NO_VALUE_OPERATORS.includes(row.operator);
            return (
              <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Select
                  size="small"
                  value={row.field || undefined}
                  onChange={(v) => {
                    const newField = object.fields.find((f) => f.apiName === v);
                    updateFilterRow(index, {
                      field: v,
                      operator: newField ? getDefaultOperator(newField.type) : 'eq',
                      value: '',
                    });
                  }}
                  style={{ width: 140 }}
                  showSearch
                  optionFilterProp="label"
                  placeholder="选择字段"
                  options={object.fields.map((f) => ({ value: f.apiName, label: f.label }))}
                />
                <Select
                  size="small"
                  value={row.operator}
                  onChange={(v) => updateFilterRow(index, { operator: v, value: '' })}
                  style={{ width: 110 }}
                  options={operators.map((op) => ({ value: op, label: OPERATOR_LABEL[op] }))}
                />
                {needValue ? (
                  <FilterValueInput
                    field={field}
                    value={row.value}
                    onChange={(v) => updateFilterRow(index, { value: v })}
                  />
                ) : (
                  <Text type="secondary" style={{ fontSize: 12, flex: 1 }}>
                    —
                  </Text>
                )}
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeFilterRow(index)}
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
          <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addFilterRow}>
            添加筛选
          </Button>
          <Space>
            <Button size="small" icon={<ReloadOutlined />} onClick={handleResetFilter}>
              重置
            </Button>
            <Button type="primary" size="small" icon={<FilterOutlined />} onClick={handleApplyFilter}>
              筛选
            </Button>
          </Space>
        </div>
      </div>

      {/* 数据表格 */}
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : records.length === 0 ? (
        <Empty description={filterStr ? '未找到匹配记录' : '还没有记录'} style={{ padding: '60px 0' }}>
          {!filterStr && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              新增第一条记录
            </Button>
          )}
        </Empty>
      ) : (
        <Table<RecordItem>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={records}
          loading={isFetching && !isLoading}
          scroll={{ x: 'max-content' }}
          onChange={handleTableChange}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            pageSizeOptions: ['10', '20', '50'],
          }}
        />
      )}

      {/* 记录表单抽屉 */}
      <RecordFormDrawer
        open={formOpen}
        mode={formMode}
        object={{ id: object.id, label: object.label }}
        fields={object.fields}
        record={editRecord}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 单元格值渲染
// ---------------------------------------------------------------------------

/** 按字段类型渲染记录值。 */
function RecordCellValue({ field, value }: { field: Field; value: unknown }) {
  if (value === undefined || value === null || value === '') {
    return <Text type="secondary">—</Text>;
  }

  const type = field.type;

  if (type === 'single_select') {
    const opt = (field.config.options ?? []).find((o) => o.label === value);
    return <Tag color={opt?.color ?? 'default'}>{String(value)}</Tag>;
  }
  if (type === 'multi_select') {
    const arr = Array.isArray(value) ? value : [value];
    return (
      <Space size={4} wrap>
        {arr.map((v, i) => {
          const opt = (field.config.options ?? []).find((o) => o.label === v);
          return (
            <Tag key={i} color={opt?.color ?? 'default'} style={{ margin: 0 }}>
              {String(v)}
            </Tag>
          );
        })}
      </Space>
    );
  }
  if (type === 'checkbox') {
    return value === true || value === 'true' ? (
      <Tag color="green">是</Tag>
    ) : (
      <Tag>否</Tag>
    );
  }
  if (type === 'date') {
    return <Text style={{ fontSize: 13 }}>{formatDate(String(value))}</Text>;
  }
  if (type === 'date_time') {
    return <Text style={{ fontSize: 13 }}>{formatDateTime(String(value))}</Text>;
  }
  if (type === 'currency') {
    const code = field.config.currency?.code ?? '';
    return <Text style={{ fontSize: 13 }}>{code} {String(value)}</Text>;
  }
  if (type === 'percent') {
    return <Text style={{ fontSize: 13 }}>{String(value)}%</Text>;
  }
  if (['number'].includes(type)) {
    return <Text style={{ fontSize: 13 }}>{String(value)}</Text>;
  }

  return <Text style={{ fontSize: 13 }}>{String(value)}</Text>;
}

// ---------------------------------------------------------------------------
// 筛选值输入
// ---------------------------------------------------------------------------

function FilterValueInput({
  field,
  value,
  onChange,
}: {
  field: Field | undefined;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (!field) {
    return <Input size="small" style={{ flex: 1 }} placeholder="值" />;
  }
  const type = field.type;

  if (type === 'single_select' || type === 'multi_select') {
    const options = (field.config.options ?? []).filter((o) => !!o.label);
    return (
      <Select
        size="small"
        mode={type === 'multi_select' ? 'multiple' : undefined}
        allowClear
        value={value as string | string[] | undefined}
        onChange={(v) => onChange(v)}
        style={{ flex: 1, minWidth: 140 }}
        placeholder="选择值"
        options={options.map((o) => ({ value: o.label, label: o.label }))}
      />
    );
  }
  if (type === 'checkbox') {
    return (
      <Select
        size="small"
        value={value as string | undefined}
        onChange={(v) => onChange(v)}
        style={{ flex: 1 }}
        options={[
          { value: 'true', label: '是' },
          { value: 'false', label: '否' },
        ]}
      />
    );
  }
  if (['number', 'currency', 'percent'].includes(type)) {
    return (
      <InputNumber
        size="small"
        value={value as number | undefined}
        onChange={(v) => onChange(v ?? '')}
        style={{ flex: 1 }}
        placeholder="数值"
      />
    );
  }
  return (
    <Input
      size="small"
      value={value as string | undefined}
      onChange={(e) => onChange(e.target.value)}
      style={{ flex: 1 }}
      placeholder="值"
    />
  );
}

// ---------------------------------------------------------------------------
// 操作符工具
// ---------------------------------------------------------------------------

/** 按字段类型返回可用操作符。 */
function getOperatorsForType(type: FieldType): FilterOperator[] {
  switch (type) {
    case 'text':
    case 'long_text':
    case 'rich_text':
    case 'auto_number':
      return ['eq', 'ne', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'];
    case 'number':
    case 'currency':
    case 'percent':
      return ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'];
    case 'single_select':
      return ['eq', 'ne', 'is_empty', 'is_not_empty', 'in'];
    case 'multi_select':
      return ['contains', 'is_empty', 'is_not_empty'];
    case 'date':
    case 'date_time':
      return ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'];
    case 'checkbox':
      return ['eq'];
    default:
      return ['eq', 'ne', 'is_empty', 'is_not_empty'];
  }
}

/** 字段类型的默认操作符。 */
function getDefaultOperator(type: FieldType): FilterOperator {
  switch (type) {
    case 'text':
    case 'long_text':
    case 'rich_text':
    case 'auto_number':
      return 'contains';
    case 'multi_select':
      return 'contains';
    default:
      return 'eq';
  }
}

// ---------------------------------------------------------------------------
// 日期格式化(无 dayjs 依赖,纯字符串处理)
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = formatDate(iso);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

/** 统一错误提示。 */
function showError(err: unknown) {
  const axErr = err as {
    response?: { data?: { error?: { message?: string } }; message?: string };
    message?: string;
  };
  message.error(axErr.response?.data?.error?.message ?? axErr.message ?? '操作失败,请重试');
}
