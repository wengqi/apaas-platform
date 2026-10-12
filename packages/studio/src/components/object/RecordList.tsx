/**
 * 记录列表（数据表格）。
 *
 * 根据对象字段动态生成列，支持分页 / 筛选 / 排序 / 新增 / 编辑 / 删除 / 批量删除 / 导入导出。
 *
 * 拆分说明（AGENTS.md「单文件最大 400 行」）：筛选逻辑（filter-logic.ts）、
 * 筛选栏（FilterBar.tsx）、筛选值输入（FilterValueInput.tsx）、工具栏（RecordToolbar.tsx）、
 * 单元格值渲染（RecordCellValue.tsx）、格式化与错误提示（utils.ts）已按职责抽出。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { useMemo, useState } from 'react';
import {
  Button,
  Empty,
  Popconfirm,
  Skeleton,
  Space,
  Table,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { objectsApi, type ObjectWithFields, type RecordItem } from '../../api/objects.js';
import RecordFormDrawer from './RecordFormDrawer.js';
import ImportRecordsModal from './ImportRecordsModal.js';
import FilterBar from './record-list/FilterBar.js';
import RecordToolbar from './record-list/RecordToolbar.js';
import RecordCellValue from './record-list/RecordCellValue.js';
import { buildFilterStr, type FilterRow, type SortState } from './record-list/filter-logic.js';
import { showError } from './record-list/utils.js';
import { buildSystemColumns } from './record-list/systemColumns.js';

const { Text } = Typography;

interface RecordListProps {
  object: ObjectWithFields;
}

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
  const filterStr = useMemo(
    () => buildFilterStr(appliedFilter, appliedSearch, firstTextField),
    [appliedFilter, appliedSearch, firstTextField],
  );

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

  /** 系统字段列（创建时间/更新时间/创建人，直接从记录列读取）。 */
  const systemColumns = buildSystemColumns();

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
      <RecordToolbar
        total={total}
        firstTextField={firstTextField}
        searchKeyword={searchKeyword}
        exportPending={exportMutation.isPending}
        onSearchKeywordChange={setSearchKeyword}
        onSearch={handleSearch}
        onOpenImport={() => setImportOpen(true)}
        onExport={() => exportMutation.mutate()}
        onAdd={handleAdd}
      />

      <FilterBar
        object={object}
        rows={filterRows}
        onAddRow={addFilterRow}
        onUpdateRow={updateFilterRow}
        onRemoveRow={removeFilterRow}
        onApply={handleApplyFilter}
        onReset={handleResetFilter}
      />

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
                background: T.colorPrimaryBg,
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
