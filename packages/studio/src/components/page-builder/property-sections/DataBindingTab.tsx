/**
 * 数据绑定 Tab — 列出组件 props，每项可切换常量/绑定。
 *
 * 从 PropertyPanel.tsx 提取。
 */

import { Input, InputNumber, Segmented, Switch, TreeSelect, Typography } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { usePageBuilderStore } from '../../../stores/pageBuilder.js';
import type { ComponentNode, PropValue } from '../../../api/pages.js';
import { PlaceholderTab } from './shared.js';

const { Text } = Typography;

/** 排除系统 / 内部 prop 的可绑定属性 key 列表。 */
function getBindablePropKeys(node: ComponentNode): string[] {
  const exclude = new Set(['style', 'className', 'events']);
  return Object.keys(node.props).filter((k) => !exclude.has(k));
}

/** 判断属性值是否为绑定表达式。 */
function isBindValue(value: PropValue | undefined): value is { __bind: string } {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    '__bind' in value
  );
}

/** 取绑定路径（或返回空）。 */
function getBindPath(value: PropValue | undefined): string {
  return isBindValue(value) ? value.__bind : '';
}

/** 构建 ViewModel 变量树 TreeSelect 数据。 */
function useBindingTreeData() {
  const schema = usePageBuilderStore((s) => s.schema);
  const variables = schema?.viewModel.variables ?? {};
  return Object.entries(variables).map(([key, def]) => ({
    title: `${key} (${def.type})`,
    value: `vm.${key}`,
    selectable: true,
  }));
}

/** 数据绑定 Tab。 */
export function DataBindingTab({ node }: { node: ComponentNode }) {
  const updateComponentProps = usePageBuilderStore((s) => s.updateComponentProps);
  const treeData = useBindingTreeData();
  const propKeys = getBindablePropKeys(node);

  if (propKeys.length === 0) {
    return <PlaceholderTab text="此组件无可绑定属性" />;
  }

  return (
    <div>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
        切换「常量」输入值，或「绑定」关联视图模型变量。
      </Text>
      {propKeys.map((key) => {
        const value = node.props[key];
        const isBind = isBindValue(value);
        return (
          <BindingRow
            key={key}
            propKey={key}
            isBind={isBind}
            value={value}
            treeData={treeData}
            onSetConstant={(val) => updateComponentProps(node.id, { [key]: val })}
            onSetBind={(path) => updateComponentProps(node.id, { [key]: { __bind: path } })}
          />
        );
      })}
    </div>
  );
}

/** 单个属性的常量 / 绑定切换行。 */
function BindingRow({
  propKey,
  isBind,
  value,
  treeData,
  onSetConstant,
  onSetBind,
}: {
  propKey: string;
  isBind: boolean;
  value: PropValue | undefined;
  treeData: { title: string; value: string; selectable: boolean }[];
  onSetConstant: (val: PropValue) => void;
  onSetBind: (path: string) => void;
}) {
  const bindPath = getBindPath(value);

  const renderConstantControl = () => {
    if (typeof value === 'boolean') {
      return <Switch size="small" checked={value} onChange={(v) => onSetConstant(v)} />;
    }
    if (typeof value === 'number') {
      return (
        <InputNumber
          size="small"
          value={value}
          onChange={(v) => onSetConstant(v ?? 0)}
          style={{ width: '100%' }}
        />
      );
    }
    const textValue = typeof value === 'string' ? value : '';
    return (
      <Input
        size="small"
        value={textValue}
        onChange={(e) => onSetConstant(e.target.value)}
        placeholder="输入常量值"
      />
    );
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <Text style={{ fontSize: 13 }}>{propKey}</Text>
        <Segmented
          size="small"
          value={isBind ? 'bind' : 'constant'}
          onChange={(v) => {
            if (v === 'bind') {
              onSetBind(bindPath || 'vm.');
            } else {
              onSetConstant('');
            }
          }}
          options={[
            { label: '常量', value: 'constant' },
            { label: '绑定', value: 'bind' },
          ]}
        />
      </div>
      {isBind ? (
        <div style={{ display: 'flex', gap: 4 }}>
          <Input
            size="small"
            value={bindPath}
            onChange={(e) => onSetBind(e.target.value)}
            placeholder="vm.record.name"
            style={{ fontFamily: 'monospace' }}
          />
          <TreeSelect
            size="small"
            treeData={treeData}
            value={bindPath || undefined}
            onChange={(v) => v && onSetBind(v)}
            placeholder="选择变量"
            style={{ width: 140 }}
            allowClear
            showSearch
            treeNodeFilterProp="title"
            suffixIcon={<LinkOutlined />}
          />
        </div>
      ) : (
        renderConstantControl()
      )}
    </div>
  );
}
