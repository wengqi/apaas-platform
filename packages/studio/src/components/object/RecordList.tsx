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
  ImportOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import {
  objectsApi,
  type Field,
  type FilterOperator,
  type ObjectWithFields,
  type RecordItem,
} from '../../api/objects.js';
import { type FieldType } from '../../constants/fieldTypes.js';
import RecordFormDrawer from './RecordFormDrawer.js';
import ImportRecordsModal from './ImportRecordsModal.js';

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
 * 将单个筛选行转换为 JsonLogic 规则。
 * field 为字段 apiName，operator 为旧操作符名。
 */
function filterRowToJsonLogic(field: string, operator: FilterOperator, value?: unknown): object {
  const varRef = { var: field };
  switch (operator) {
    case 'eq':
      return { '==': [varRef, value] };
    case 'ne':
      return { '!=': [varRef, value] };
    case 'contains':
      return { in: [String(value), varRef] };
    case 'not_contains':
      return { '!': { in: [String(value), varRef] } };
    case 'starts_with':
      return { in: [String(value), varRef] }; // 注: starts_with 简化为 contains，后端 JSONB 仅支持 string_contains
    case 'ends_with':
      return { in: [String(value), varRef] }; // 注: ends_with 简化为 contains
    case 'gt':
      return { '>': [varRef, value] };
    case 'gte':
      return { '>=': [varRef, value] };
    case 'lt':
      return { '<': [varRef, value] };
    case 'lte':
      return { '<=': [varRef, value] };
    case 'is_empty':
      return { '!': varRef };
    case 'is_not_empty':
      return { '!!': varRef };
    case 'in':
      return { in: [varRef, Array.isArray(value) ? value : [value]] };
    case 'not_in':
      return { '!': { in: [varRef, Array.isArray(value) ? value : [value]] } };
    default:
      return { '==': [varRef, value] };
  }
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
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  /** 第一个文本类字段(用于全文搜索 contains)。 */
  const firstTextField = useMemo(
    () => object.fields.find((f) => ['text', 'long_text'].includes(f.type)),
    [object.fields],
  );

  /** 构建筛选 JsonLogic JSON 字符串(field 用 apiName)。 */
  const filterStr = useMemo(() => {
    const rules: object[] = [];

    // 全文搜索(对第一个文本字段 contains)
    if (appliedSearch && firstTextField) {
      rules.push({ in: [appliedSearch, { var: firstTextField.apiName }] });
    }

    // 筛选行(忽略无值且需要值的条件)
    for (const row of appliedFilter) {
      if (NO_VALUE_OPERATORS.includes(row.operator)) {
        rules.push(filterRowToJsonLogic(row.field, row.operator));
      } else if (row.value !== undefined && row.value !== '' && row.value !== null) {
        rules.push(filterRowToJsonLogic(row.field, row.operator, row.value));
      }
    }

    if (rules.length === 0) return undefined;
    // AND 组合所有条件
    const logic = rules.length === 1 ? rules[0]! : { and: rules };
    return JSON.stringify(logic);
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
      queryClient.invalidateQueries({ queryKey: qk.objectRecords(object.id) });
    },
    onError: (err) => showError(err),
  });

  /** 批量删除记录。 */
  const batchDeleteMutation = useMutation({
    mutationFn: (recordIds: string[]) => objectsApi.records.batchDelete(recordIds),
    onSuccess: (result) => {
      message.success(`已删除 ${result.deleted} 条记录`);
      setSelectedRowKeys([]);
      queryClient.invalidateQueries({ queryKey: qk.objectRecords(object.id) });
    },
    onError: (err) => showError(err),
  });

  /** 导出记录为 CSV。 */
  const exportMutation = useMutation({
    mutationFn: () => objectsApi.records.exportCsv(object.id, { sort: sortStr, filter: filterStr }),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${object.id}_records.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('导出成功');
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
      render: (r) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {formatDateTime(r.createdAt)}
        </Text>
      ),
    },
    {
      key: 'updatedAt',
      title: '更新时间',
      width: 160,
      render: (r) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {formatDateTime(r.updatedAt)}
        </Text>
      ),
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

  /**
   * 业务字段列(根据字段类型渲染值)。
   * 评审整改：排除 isSystem 系统字段(创建人/创建时间/更新人/更新时间/拥有者)，
   * 其已由下方 systemColumns 从记录顶层字段统一渲染，避免同一系统字段出现两列。
   */
  const businessColumns: ColumnsType<RecordItem> = object.fields
    .filter((field) => !field.isSystem)
    .map((field) => ({
      title: field.label,
      key: field.apiName,
      width: 160,
      sorter: true,
      sortOrder:
        sort?.field === field.apiName ? (sort.order === 'asc' ? 'ascend' : 'descend') : undefined,
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

  const columns: ColumnsType<RecordItem> = [
    ...businessColumns,
    ...systemColumns.map((c) => ({
      title: c.title,
      key: c.key,
      width: c.width,
      render: (_: unknown, record: RecordItem) => c.render(record),
    })),
    actionColumn,
  ];

  // -------------------------------------------------------------------------
  // 事件处理
  // -------------------------------------------------------------------------

  /** 点击列标题排序(三态:asc → desc → 取消)。 */
  const handleTableChange = (
    pagination: TablePaginationConfig,
    _filters: unknown,
    sorter: unknown,
  ) => {
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
          <Tooltip title="导入 CSV">
            <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
              导入
            </Button>
          </Tooltip>
          <Tooltip title="导出当前视图为 CSV">
            <Button
              icon={<ExportOutlined />}
              loading={exportMutation.isPending}
              onClick={() => exportMutation.mutate()}
            >
              导出
            </Button>
          </Tooltip>
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
            const operators: FilterOperator[] = field
              ? getOperatorsForType(field.type)
              : ['eq', 'ne'];
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
            <Button
              type="primary"
              size="small"
              icon={<FilterOutlined />}
              onClick={handleApplyFilter}
            >
              筛选
            </Button>
          </Space>
        </div>
      </div>

      {/* 数据表格 */}
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : records.length === 0 ? (
        <Empty
          description={filterStr ? '未找到匹配记录' : '还没有记录'}
          style={{ padding: '60px 0' }}
        >
          {!filterStr && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              新增第一条记录
            </Button>
          )}
        </Empty>
      ) : (
        <>
          {selectedRowKeys.length > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#e6f4ff',
                padding: '8px 16px',
                borderRadius: 8,
                marginBottom: 12,
              }}
            >
              <Text>已选择 {selectedRowKeys.length} 项</Text>
              <Space>
                <Popconfirm
                  title={`确认删除 ${selectedRowKeys.length} 条记录？`}
                  onConfirm={() => batchDeleteMutation.mutate(selectedRowKeys as string[])}
                >
                  <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    loading={batchDeleteMutation.isPending}
                  >
                    批量删除
                  </Button>
                </Popconfirm>
                <Button size="small" type="text" onClick={() => setSelectedRowKeys([])}>
                  取消选择
                </Button>
              </Space>
            </div>
          )}
          <Table<RecordItem>
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={records}
            loading={isFetching && !isLoading}
            scroll={{ x: 'max-content' }}
            onChange={handleTableChange}
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
            }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
              pageSizeOptions: ['10', '20', '50'],
            }}
          />
        </>
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

      {/* 导入记录弹窗 */}
      <ImportRecordsModal
        open={importOpen}
        objectId={object.id}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          setImportOpen(false);
          queryClient.invalidateQueries({ queryKey: qk.objectRecords(object.id) });
        }}
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
    // 评审整改：存储值可能是 value 或历史 label，两者都反查展示文案
    const opt = (field.config.options ?? []).find(
      (o) => o.label === value || (o.value ?? o.label) === value,
    );
    return <Tag color={opt?.color ?? 'default'}>{String(value)}</Tag>;
  }
  if (type === 'multi_select') {
    const arr = Array.isArray(value) ? value : [value];
    return (
      <Space size={4} wrap>
        {arr.map((v, i) => {
          const opt = (field.config.options ?? []).find(
            (o) => o.label === v || (o.value ?? o.label) === v,
          );
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
    return value === true || value === 'true' ? <Tag color="green">是</Tag> : <Tag>否</Tag>;
  }
  if (type === 'date') {
    return <Text style={{ fontSize: 13 }}>{formatDate(String(value))}</Text>;
  }
  if (type === 'date_time') {
    return <Text style={{ fontSize: 13 }}>{formatDateTime(String(value))}</Text>;
  }
  if (type === 'currency') {
    const code = field.config.currency?.code ?? '';
    return (
      <Text style={{ fontSize: 13 }}>
        {code} {String(value)}
      </Text>
    );
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
        // 评审整改：筛选条件按存储值（value）比较，与记录存储一致
        options={options.map((o) => ({ value: o.value ?? o.label, label: o.label }))}
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
      return [
        'eq',
        'ne',
        'contains',
        'not_contains',
        'starts_with',
        'ends_with',
        'is_empty',
        'is_not_empty',
      ];
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
