/**
 * 视图模型面板（Drawer）—— 管理页面级状态变量。
 *
 * 变量头部 / 编辑器 / 类型元数据已拆分至 ./view-model-panel/
 * （AGENTS.md 单文件 400 行规范）。
 */

import { useState } from 'react';
import { Button, Collapse, Drawer, Empty, Form, Input, Modal, Select, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { useParams } from 'react-router-dom';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import { objectsApi } from '../../api/objects.js';
import type { VariableType } from '../../api/pages.js';
import { VARIABLE_TYPE_OPTIONS } from './view-model-panel/variableMeta.js';
import { VariableHeader } from './view-model-panel/VariableHeader.js';
import { VariableEditor } from './view-model-panel/VariableEditor.js';

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
