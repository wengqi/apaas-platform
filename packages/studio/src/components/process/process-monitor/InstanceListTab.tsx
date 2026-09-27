/**
 * 从 components/process/ProcessMonitor.tsx 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 实例列表 Tab：状态/流程筛选 + 运行实例表格。
 */

import { Empty, Select, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ProcessInstance } from '../../../api/processes.js';
import { INSTANCE_STATE_META } from '../../../constants/process.js';

interface InstanceListTabProps {
  instances: ProcessInstance[];
  isLoading: boolean;
  columns: ColumnsType<ProcessInstance>;
  stateFilter?: string;
  setStateFilter: (v?: string) => void;
  processes: { id: string; name: string }[];
  processId?: string;
  onProcessChange: (v?: string) => void;
}

export default function InstanceListTab({
  instances,
  isLoading,
  columns,
  stateFilter,
  setStateFilter,
  processes,
  processId,
  onProcessChange,
}: InstanceListTabProps) {
  return (
    <div style={{ padding: '0 24px 24px' }}>
      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="状态筛选"
          allowClear
          style={{ width: 140 }}
          value={stateFilter}
          onChange={(v) => setStateFilter(v)}
          options={Object.entries(INSTANCE_STATE_META).map(([k, v]) => ({
            label: v.label,
            value: k,
          }))}
        />
        <Select
          placeholder="流程筛选"
          allowClear
          showSearch
          style={{ width: 200 }}
          value={processId}
          onChange={(v) => onProcessChange(v)}
          options={processes.map((p) => ({ label: p.name, value: p.id }))}
        />
      </Space>
      <Table
        size="middle"
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={instances}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: <Empty description="暂无运行实例" /> }}
      />
    </div>
  );
}
