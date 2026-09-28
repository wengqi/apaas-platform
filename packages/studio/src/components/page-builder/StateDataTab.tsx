/**
 * 左栏「状态数据」页签 — 对齐飞书 aPaaS：数据请求 / 自定义变量 / JS 方法 /
 * 组件 / URL 参数 五组。预览态显示运行时值（由 RuntimeVmBridge 同步）。
 */

import { useMemo, useState } from 'react';
import { Button, Input, Select, Typography } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import { useDebugStore } from '../../stores/page-builder/debug.js';
import { useQueryClient } from '@tanstack/react-query';
import type { ComponentNode, PropValue, VariableDef, VariableType } from '../../api/pages.js';
import { propKeyCount, splitVariables, stringifyValue } from '../../utils/state-data.js';

const { Text } = Typography;

const VARIABLE_TYPE_OPTIONS: { value: VariableType; label: string }[] = [
  { value: 'scalar', label: '标量' },
  { value: 'object', label: '对象' },
  { value: 'array', label: '数组' },
  { value: 'record', label: '记录' },
  { value: 'record_list', label: '记录列表' },
];

/** 状态数据页签主组件。 */
export default function StateDataTab() {
  const schema = usePageBuilderStore((s) => s.schema);
  const mode = usePageBuilderStore((s) => s.mode);
  const runtimeVm = useDebugStore((s) => s.runtimeVm);
  const [keyword, setKeyword] = useState('');

  const groups = useMemo(() => splitVariables(schema?.viewModel.variables ?? {}), [schema]);

  const kw = keyword.trim().toLowerCase();
  const match = (name: string) => !kw || name.toLowerCase().includes(kw);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '8px 12px', flexShrink: 0 }}>
        <Input
          size="small"
          placeholder="搜索"
          prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.35)', fontSize: 12 }} />}
          allowClear
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 12px', minHeight: 0 }}>
        {mode === 'preview' && (
          <div
            style={{
              margin: '0 4px 8px',
              padding: '4px 8px',
              background: '#eef4ff',
              borderRadius: 4,
            }}
          >
            <Text type="secondary" style={{ fontSize: 11 }}>
              预览态：下方展示运行时值
            </Text>
          </div>
        )}
        <Group title={`数据请求(${groups.dataRequests.length})`}>
          {groups.dataRequests
            .filter(([name]) => match(name))
            .map(([name, def]) => (
              <VariableRow key={name} name={name} def={def} runtimeValue={runtimeVm?.[name]} />
            ))}
          {groups.dataRequests.length === 0 && <EmptyHint text="暂无数据请求" />}
        </Group>
        <CustomVariableGroup
          variables={groups.custom.filter(([name]) => match(name))}
          totalCount={groups.custom.length}
        />
        <Group title="JS 方法">
          <EmptyHint text="在事件动作中选择「执行页面脚本」编写页面级 JS" />
        </Group>
        <ComponentGroup keyword={kw} />
        <Group title="URL 参数">
          <UrlParams />
        </Group>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 分组容器 / 行
// ---------------------------------------------------------------------------

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          userSelect: 'none',
          padding: '4px 4px',
        }}
      >
        <Text style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{open ? '▾' : '▸'}</Text>
        <Text strong style={{ fontSize: 13 }}>
          {title}
        </Text>
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

function VariableRow({
  name,
  def,
  runtimeValue,
}: {
  name: string;
  def: VariableDef;
  runtimeValue?: unknown;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: '2px 4px' }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          padding: '2px 0',
        }}
      >
        <Text style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{open ? '▾' : '▸'}</Text>
        <Text style={{ fontSize: 13 }}>{name}</Text>
        <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>
          {def.type}
        </Text>
      </div>
      {open && (
        <div style={{ paddingLeft: 22, paddingBottom: 4 }}>
          <KeyValue k="type" v={def.type} />
          {def.datasource && <KeyValue k="objectId" v={def.datasource.objectId} />}
          {def.datasource && <KeyValue k="autoQuery" v={String(def.datasource.autoQuery)} />}
          <KeyValue
            k={runtimeValue !== undefined ? '当前值' : '初始值'}
            v={stringifyValue(runtimeValue ?? def.initialValue ?? null)}
          />
        </div>
      )}
    </div>
  );
}

function KeyValue({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '1px 0' }}>
      <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
        {k}
      </Text>
      <Text style={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>{v}</Text>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <Text type="secondary" style={{ fontSize: 12, display: 'block', padding: '2px 4px 4px 20px' }}>
      {text}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// 自定义变量（可添加/删除，写回 viewModel）
// ---------------------------------------------------------------------------

function CustomVariableGroup({
  variables,
  totalCount,
}: {
  variables: [string, VariableDef][];
  totalCount: number;
}) {
  const schema = usePageBuilderStore((s) => s.schema);
  const addVariable = usePageBuilderStore((s) => s.addVariable);
  const removeVariable = usePageBuilderStore((s) => s.removeVariable);
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<VariableType>('scalar');
  const [initial, setInitial] = useState('');

  if (totalCount === 0 && !adding) {
    return (
      <div style={{ marginBottom: 8 }}>
        <Group title="自定义变量(0)">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 4px',
            }}
          >
            <EmptyHint text="暂无内容" />
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setAdding(true)}
              title="添加变量"
            />
          </div>
        </Group>
      </div>
    );
  }

  const submit = () => {
    const key = name.trim();
    if (!key || !schema) return;
    if (key in schema.viewModel.variables) return;
    let initialValue: PropValue = initial;
    if (type === 'scalar' && initial !== '') {
      if (initial === 'true') initialValue = true;
      else if (initial === 'false') initialValue = false;
      else if (initial !== '' && !Number.isNaN(Number(initial))) initialValue = Number(initial);
    }
    addVariable(key, { type, initialValue: initialValue === '' ? null : initialValue });
    // 失效页面 query 让依赖 schema 的缓存刷新（与保存流程一致由保存真正落库）
    void queryClient.invalidateQueries({ queryKey: ['page'] });
    setName('');
    setInitial('');
    setAdding(false);
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <Group title={`自定义变量(${totalCount})`}>
        {variables.map(([name, def]) => (
          <div
            key={name}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px' }}
          >
            <Text style={{ fontSize: 13 }}>{name}</Text>
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>
              {def.type}
            </Text>
            <Button
              type="text"
              size="small"
              danger
              onClick={() => removeVariable(name)}
              title="删除变量"
              style={{ height: 20, width: 20 }}
            >
              ✕
            </Button>
          </div>
        ))}
        {adding && (
          <div style={{ display: 'flex', gap: 6, padding: '4px' }}>
            <Input
              size="small"
              placeholder="变量名"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Select
              size="small"
              value={type}
              onChange={(v) => setType(v)}
              options={VARIABLE_TYPE_OPTIONS}
              style={{ width: 88 }}
            />
            <Input
              size="small"
              placeholder="初始值"
              value={initial}
              onChange={(e) => setInitial(e.target.value)}
            />
            <Button size="small" type="primary" onClick={submit}>
              确认
            </Button>
          </div>
        )}
        {!adding && (
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setAdding(true)}
            style={{ marginLeft: 4 }}
          >
            添加变量
          </Button>
        )}
      </Group>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 组件状态
// ---------------------------------------------------------------------------

function ComponentGroup({ keyword }: { keyword: string }) {
  const schema = usePageBuilderStore((s) => s.schema);

  const nodes = useMemo(() => {
    const out: ComponentNode[] = [];
    const walk = (node: ComponentNode): void => {
      out.push(node);
      for (const child of node.children ?? []) walk(child);
    };
    if (schema) walk(schema.root);
    return out;
  }, [schema]);

  const filtered = nodes.filter(
    (n) =>
      !keyword || (n.name || n.type).toLowerCase().includes(keyword) || n.type.includes(keyword),
  );

  return (
    <div style={{ marginBottom: 8 }}>
      <Group title={`组件(${nodes.length})`}>
        {filtered.map((n) => (
          <ComponentStateRow key={n.id} node={n} />
        ))}
        {filtered.length === 0 && <EmptyHint text="未匹配组件" />}
      </Group>
    </div>
  );
}

function ComponentStateRow({ node }: { node: ComponentNode }) {
  const [open, setOpen] = useState(false);
  const keys = propKeyCount(node);
  const summary = useMemo(() => (open ? Object.keys(node.props ?? {}) : []), [open, node.props]);
  return (
    <div style={{ padding: '2px 4px' }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          padding: '2px 0',
        }}
      >
        <Text style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>{open ? '▾' : '▸'}</Text>
        <Text style={{ fontSize: 13 }}>{node.name || node.type}</Text>
        <Text
          type="secondary"
          style={{ fontSize: 11, marginLeft: 'auto', fontFamily: 'monospace' }}
        >
          {'{ } '}
          {keys} keys
        </Text>
      </div>
      {open && (
        <div style={{ paddingLeft: 22, paddingBottom: 4 }}>
          {summary.length === 0 ? (
            <EmptyHint text="无属性" />
          ) : (
            summary.map((key) => (
              <KeyValue key={key} k={key} v={stringifyValue(node.props[key]).slice(0, 60)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// URL 参数（只读展示当前地址栏参数）
// ---------------------------------------------------------------------------

function UrlParams() {
  const params = useMemo(() => {
    if (typeof window === 'undefined') return [] as [string, string][];
    return [...new URLSearchParams(window.location.search).entries()];
  }, []);

  if (params.length === 0) return <EmptyHint text="暂无内容" />;
  return (
    <div style={{ padding: '0 4px' }}>
      {params.map(([key, value]) => (
        <KeyValue key={key} k={key} v={value} />
      ))}
    </div>
  );
}
