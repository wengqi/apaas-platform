import { useState } from 'react';
import {
  Button,
  Collapse,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { useParams } from 'react-router-dom';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import { objectsApi } from '../../api/objects.js';
import type { PropValue, VariableDef, VariableType } from '../../api/pages.js';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// 变量类型元数据
// ---------------------------------------------------------------------------

const VARIABLE_TYPE_META: Record<VariableType, { label: string; color: string }> = {
  record: { label: '单条记录', color: 'blue' },
  record_list: { label: '记录列表', color: 'geekblue' },
  scalar: { label: '标量', color: 'purple' },
  object: { label: '对象', color: 'cyan' },
  array: { label: '数组', color: 'orange' },
};

const VARIABLE_TYPE_OPTIONS: { label: string; value: VariableType }[] = [
  { label: '标量 (string/number/boolean)', value: 'scalar' },
  { label: '单条记录 (record)', value: 'record' },
  { label: '记录列表 (record_list)', value: 'record_list' },
  { label: '对象 (object)', value: 'object' },
  { label: '数组 (array)', value: 'array' },
];

/** 变量是否支持数据源配置。 */
function hasDatasource(type: VariableType): boolean {
  return type === 'record' || type === 'record_list';
}

// ---------------------------------------------------------------------------
// 初始值解析 / 格式化
// ---------------------------------------------------------------------------

/** 将文本解析为初始值(按变量类型)。 */
function parseInitialValue(text: string, type: VariableType): PropValue {
  if (type === 'scalar') {
    const trimmed = text.trim();
    if (trimmed === '') return null;
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    const num = Number(trimmed);
    if (!Number.isNaN(num)) return num;
    return trimmed;
  }
  // object / array: 尝试 JSON 解析
  try {
    return JSON.parse(text) as PropValue;
  } catch {
    return text;
  }
}

/** 将初始值格式化为文本。 */
function formatInitialValue(value: PropValue | undefined, type: VariableType): string {
  if (value === undefined || value === null) return '';
  if (type === 'object' || type === 'array') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// 视图模型面板(Drawer)
// ---------------------------------------------------------------------------

/**
 * 视图模型面板 —— 管理页面级状态变量。
 * 变量树(可折叠)+ 添加 / 编辑 / 删除 + 数据源配置。
 */
export default function ViewModelPanel() {
  const open = usePageBuilderStore((s) => s.vmPanelOpen);
  const setOpen = usePageBuilderStore((s) => s.setVmPanelOpen);
  const schema = usePageBuilderStore((s) => s.schema);
  const addVariable = usePageBuilderStore((s) => s.addVariable);
  const removeVariable = usePageBuilderStore((s) => s.removeVariable);
  const updateVariable = usePageBuilderStore((s) => s.updateVariable);

  const params = useParams<{ appId: string }>();
  const appId = params.appId;

  /** 加载对象列表(供数据源 objectId 选择)。 */
  const { data: objects } = useQuery({
    queryKey: qk.appObjects(appId!),
    queryFn: () => objectsApi.list(appId as string),
    enabled: open && !!appId,
  });

  const objectOptions = (objects ?? []).map((obj) => ({
    label: obj.label,
    value: obj.id,
  }));

  const variables = schema?.viewModel.variables ?? {};
  const varEntries = Object.entries(variables);

  const [addOpen, setAddOpen] = useState(false);

  return (
    <Drawer
      title="视图模型"
      open={open}
      onClose={() => setOpen(false)}
      width={440}
      styles={{ body: { padding: 16 } }}
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setAddOpen(true)}
        >
          添加变量
        </Button>
      }
    >
      {varEntries.length === 0 ? (
        <Empty description="暂无变量,点击「添加变量」创建" style={{ padding: '60px 0' }} />
      ) : (
        <Collapse
          ghost
          size="small"
          defaultActiveKey={varEntries[0]?.[0]}
          items={varEntries.map(([key, def]) => ({
            key,
            label: <VariableHeader varKey={key} def={def} onDelete={() => removeVariable(key)} />,
            children: (
              <VariableEditor
                varKey={key}
                def={def}
                objectOptions={objectOptions}
                onSave={(oldKey, newKey, newDef) => updateVariable(oldKey, newKey, newDef)}
              />
            ),
          }))}
        />
      )}

      <AddVariableModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(name, type) => {
          addVariable(name, {
            type,
            initialValue: type === 'scalar' ? null : undefined,
          });
          setAddOpen(false);
        }}
      />
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// 变量头部(名称 + 类型标签 + 删除)
// ---------------------------------------------------------------------------

function VariableHeader({
  varKey,
  def,
  onDelete,
}: {
  varKey: string;
  def: VariableDef;
  onDelete: () => void;
}) {
  const meta = VARIABLE_TYPE_META[def.type] ?? { label: def.type, color: 'default' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <Text strong style={{ fontSize: 13, fontFamily: 'monospace' }}>
        {varKey}
      </Text>
      <Tag style={{ margin: 0, fontSize: 11 }} color={meta.color}>
        {meta.label}
      </Tag>
      <div style={{ flex: 1 }} />
      <Popconfirm
        title="删除变量"
        description="删除变量将解除所有引用它的绑定,是否继续?"
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        onConfirm={(e) => {
          e?.stopPropagation();
          onDelete();
        }}
        onCancel={(e) => e?.stopPropagation()}
      >
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={(e) => e.stopPropagation()}
        />
      </Popconfirm>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 变量编辑器(名称 / 类型 / 初始值 / 数据源)
// ---------------------------------------------------------------------------

function VariableEditor({
  varKey,
  def,
  objectOptions,
  onSave,
}: {
  varKey: string;
  def: VariableDef;
  objectOptions: { label: string; value: string }[];
  onSave: (oldKey: string, newKey: string, def: VariableDef) => void;
}) {
  const [name, setName] = useState(varKey);
  const [type, setType] = useState<VariableType>(def.type);
  const [initialValueText, setInitialValueText] = useState(
    formatInitialValue(def.initialValue, def.type),
  );
  const [objectId, setObjectId] = useState(def.datasource?.objectId ?? '');
  const [viewId, setViewId] = useState(def.datasource?.viewId ?? '');
  const [autoQuery, setAutoQuery] = useState(
    def.datasource?.autoQuery ?? def.type === 'record_list',
  );

  const showDatasource = hasDatasource(type);

  /** 加载当前 objectId 的视图列表(仅 record/record_list)。 */
  const { data: views } = useQuery({
    queryKey: ['views', objectId],
    queryFn: () => objectsApi.listViews(objectId),
    enabled: showDatasource && !!objectId,
  });

  const viewOptions = (views ?? []).map((v) => ({ label: v.name, value: v.id }));

  const handleSave = () => {
    if (!name.match(/^[a-zA-Z][a-zA-Z0-9_]*$/)) {
      message.error('变量名须以字母开头,仅含字母数字下划线');
      return;
    }
    const newDef: VariableDef = { type };
    if (showDatasource && objectId) {
      newDef.datasource = {
        objectId,
        viewId: viewId || undefined,
        autoQuery,
      };
    }
    if (!showDatasource) {
      newDef.initialValue = parseInitialValue(initialValueText, type);
    }
    if (def.description) newDef.description = def.description;
    onSave(varKey, name, newDef);
    message.success('变量已保存');
  };

  return (
    <Form layout="vertical" size="small">
      <FormField label="变量名">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ fontFamily: 'monospace' }}
        />
      </FormField>
      <FormField label="类型">
        <Select
          value={type}
          onChange={(v) => setType(v)}
          options={VARIABLE_TYPE_OPTIONS}
          style={{ width: '100%' }}
        />
      </FormField>

      {/* 初始值(scalar/object/array) */}
      {!showDatasource && (
        <FormField label="初始值">
          {type === 'object' || type === 'array' ? (
            <Input.TextArea
              value={initialValueText}
              onChange={(e) => setInitialValueText(e.target.value)}
              rows={3}
              placeholder='{"key":"value"} 或 [1,2,3]'
              style={{ fontFamily: 'monospace' }}
            />
          ) : (
            <Input
              value={initialValueText}
              onChange={(e) => setInitialValueText(e.target.value)}
              placeholder="留空表示 null"
            />
          )}
        </FormField>
      )}

      {/* 数据源配置(record/record_list) */}
      {showDatasource && (
        <>
          <div
            style={{
              fontSize: 12,
              color: 'rgba(0,0,0,0.45)',
              margin: '8px 0',
              paddingBottom: 4,
              borderBottom: '1px solid #f0f2f5',
            }}
          >
            数据源
          </div>
          <FormField label="关联对象">
            <Select
              value={objectId || undefined}
              onChange={(v) => {
                setObjectId(v ?? '');
                setViewId('');
              }}
              showSearch
              allowClear
              placeholder="选择对象"
              optionFilterProp="label"
              options={objectOptions}
              notFoundContent={objectOptions.length > 0 ? '暂无对象' : '加载中...'}
            />
          </FormField>
          <FormField label="视图(可选)">
            <Select
              value={viewId || undefined}
              onChange={(v) => setViewId(v ?? '')}
              allowClear
              placeholder="使用默认视图"
              options={viewOptions}
              notFoundContent={objectId ? (views ? '暂无视图' : '加载中...') : '请先选择对象'}
            />
          </FormField>
          <FormField label="页面加载时自动查询">
            <Space>
              <Switch checked={autoQuery} onChange={setAutoQuery} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {autoQuery ? '是' : '否'}
              </Text>
            </Space>
          </FormField>
        </>
      )}

      <Button type="primary" size="small" block onClick={handleSave}>
        保存
      </Button>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// 添加变量弹窗
// ---------------------------------------------------------------------------

function AddVariableModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string, type: VariableType) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<VariableType>('scalar');

  const handleOk = () => {
    if (!name.match(/^[a-zA-Z][a-zA-Z0-9_]*$/)) {
      message.error('变量名须以字母开头,仅含字母数字下划线');
      return;
    }
    onAdd(name, type);
    setName('');
    setType('scalar');
  };

  return (
    <Modal
      title="添加变量"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="添加"
      cancelText="取消"
      destroyOnHidden
    >
      <Form layout="vertical">
        <Form.Item label="变量名" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如 record / list / keyword"
            style={{ fontFamily: 'monospace' }}
          />
        </Form.Item>
        <Form.Item label="类型" required>
          <Select
            value={type}
            onChange={(v) => setType(v)}
            options={VARIABLE_TYPE_OPTIONS}
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// 通用表单字段:标签 + 控件
// ---------------------------------------------------------------------------

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.88)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
