/**
 * 记录列表 — 工具栏（从 RecordList.tsx 抽出）。
 *
 * 职责：记录总数、全文搜索（首个文本字段）、导入 / 导出 / 新增入口。
 */

import { Button, Input, Space, Tooltip, Typography } from 'antd';
import { ExportOutlined, ImportOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import type { Field } from '../../../api/objects.js';

const { Text } = Typography;

interface RecordToolbarProps {
  total: number;
  firstTextField?: Field | undefined;
  searchKeyword: string;
  exportPending: boolean;
  onSearchKeywordChange: (value: string) => void;
  onSearch: () => void;
  onOpenImport: () => void;
  onExport: () => void;
  onAdd: () => void;
}

export default function RecordToolbar({
  total,
  firstTextField,
  searchKeyword,
  exportPending,
  onSearchKeywordChange,
  onSearch,
  onOpenImport,
  onExport,
  onAdd,
}: RecordToolbarProps) {
  return (
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
            onChange={(e) => onSearchKeywordChange(e.target.value)}
            onPressEnter={onSearch}
            style={{ width: 200 }}
          />
        )}
        <Tooltip title="导入 CSV">
          <Button icon={<ImportOutlined />} onClick={onOpenImport}>
            导入
          </Button>
        </Tooltip>
        <Tooltip title="导出当前视图为 CSV">
          <Button icon={<ExportOutlined />} loading={exportPending} onClick={onExport}>
            导出
          </Button>
        </Tooltip>
        <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
          新增记录
        </Button>
      </Space>
    </div>
  );
}
