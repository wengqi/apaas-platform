/**
 * 页面属性表单 + 视图模型入口按钮。
 *
 * 从 PropertyPanel.tsx 提取。未选中组件时显示页面级属性（名称/API名/类型）。
 */

import { Button, Input, Select } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import { usePageBuilderStore } from '../../../stores/pageBuilder.js';
import { PAGE_TYPE_OPTIONS } from '../../../constants/pageComponents.js';
import type { PageType } from '../../../api/pages.js';
import { FormField } from './shared.js';

/** 视图模型面板入口按钮。 */
function ViewModelEntryButton() {
  const setVmPanelOpen = usePageBuilderStore((s) => s.setVmPanelOpen);
  const schema = usePageBuilderStore((s) => s.schema);
  const varCount = Object.keys(schema?.viewModel.variables ?? {}).length;
  return (
    <Button
      block
      icon={<DatabaseOutlined />}
      onClick={() => setVmPanelOpen(true)}
      style={{ marginTop: 8 }}
    >
      视图模型 ({varCount})
    </Button>
  );
}

interface PagePropertyFormProps {
  name: string;
  slug: string;
  type: PageType;
  onNameChange: (v: string) => void;
  onSlugChange: (v: string) => void;
  onTypeChange: (v: PageType) => void;
}

export function PagePropertyForm({
  name,
  slug,
  type,
  onNameChange,
  onSlugChange,
  onTypeChange,
}: PagePropertyFormProps) {
  return (
    <div>
      <FormField label="页面名称">
        <Input value={name} onChange={(e) => onNameChange(e.target.value)} size="small" />
      </FormField>
      <FormField label="API 名称">
        <Input
          value={slug}
          onChange={(e) => onSlugChange(e.target.value)}
          size="small"
          style={{ fontFamily: 'monospace' }}
        />
      </FormField>
      <FormField label="页面类型">
        <Select
          value={type}
          onChange={(v) => onTypeChange(v as PageType)}
          size="small"
          style={{ width: '100%' }}
          options={PAGE_TYPE_OPTIONS}
        />
      </FormField>
      <ViewModelEntryButton />
    </div>
  );
}
