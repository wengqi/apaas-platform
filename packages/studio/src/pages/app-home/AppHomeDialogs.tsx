/**
 * 开发中心首页 — 弹窗组（从 DevCenterHome 拆出，单文件 400 行规范）。
 * 创建 / 编辑 / 移动到分组 三个弹窗，表单实例与 mutations 由页面注入。
 */

import { Form, Modal, Typography } from 'antd';
import type { AppSummary } from '../../api/apps.js';
import type { CreateFormValues } from '../app-list/constants.js';
import { CreateAppModal, EditAppModal } from '../app-list/AppFormModals.js';
import GroupSelect from './GroupSelect.js';

const { Text } = Typography;

interface AppFormInstance {
  validateFields: () => Promise<CreateFormValues>;
  resetFields: () => void;
  setFieldsValue: (v: Partial<CreateFormValues>) => void;
}

interface MoveFormInstance {
  validateFields: () => Promise<{ group: string }>;
  resetFields: () => void;
  setFieldsValue: (v: { group: string }) => void;
}

interface AppHomeDialogsProps {
  groupNames: string[];
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
  editingApp: AppSummary | null;
  setEditingApp: (app: AppSummary | null) => void;
  movingApp: AppSummary | null;
  setMovingApp: (app: AppSummary | null) => void;
  form: AppFormInstance;
  moveForm: MoveFormInstance;
  createPending: boolean;
  updatePending: boolean;
  movePending: boolean;
  onCreate: (values: CreateFormValues) => void;
  onUpdate: (appId: string, values: CreateFormValues) => void;
  onMove: (appId: string, group: string) => void;
}

export default function AppHomeDialogs({
  groupNames,
  createOpen,
  setCreateOpen,
  editingApp,
  setEditingApp,
  movingApp,
  setMovingApp,
  form,
  moveForm,
  createPending,
  updatePending,
  movePending,
  onCreate,
  onUpdate,
  onMove,
}: AppHomeDialogsProps) {
  return (
    <>
      <CreateAppModal
        open={createOpen}
        form={form as never}
        groupNames={groupNames}
        confirmLoading={createPending}
        onCancel={() => setCreateOpen(false)}
        onOk={async () => {
          const values = await form.validateFields();
          onCreate(values);
        }}
      />
      <EditAppModal
        app={editingApp}
        form={form as never}
        groupNames={groupNames}
        confirmLoading={updatePending}
        onCancel={() => {
          setEditingApp(null);
          form.resetFields();
        }}
        onOk={async () => {
          if (!editingApp) return;
          const values = await form.validateFields();
          onUpdate(editingApp.id, values);
        }}
      />
      <Modal
        title={`移动「${movingApp?.name ?? ''}」到分组`}
        open={movingApp !== null}
        confirmLoading={movePending}
        onCancel={() => setMovingApp(null)}
        onOk={async () => {
          const values = await moveForm.validateFields();
          onMove(movingApp!.id, values.group);
        }}
        okText="移动"
        cancelText="取消"
      >
        <Form form={moveForm as never} layout="vertical">
          <Form.Item label="目标分组" name="group">
            <GroupSelect groupNames={groupNames} />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            输入现有分组名，或输入新分组名直接建组；清空则移入「未分组」。
          </Text>
        </Form>
      </Modal>
    </>
  );
}
