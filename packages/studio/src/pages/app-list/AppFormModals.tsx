/**
 * 应用列表页 — 创建 / 编辑应用弹窗（从 AppList.tsx 拆分，AGENTS.md 单文件 400 行规范）。
 *
 * 两个弹窗共用同一个 Form 实例（由调用方传入），字段集一致：
 * API 名称（仅创建可填）/ 显示名称 / 描述 / 图标 / 主题色。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { ColorPicker, Form, Input, Modal } from 'antd';
import type { AppSummary } from '../../api/apps.js';
import type { CreateFormValues } from './constants.js';
import EmojiIconPicker from '../../components/shared/EmojiIconPicker.js';

type AppForm = ReturnType<typeof Form.useForm<CreateFormValues>>[0];

interface CreateAppModalProps {
  open: boolean;
  form: AppForm;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
}

/** 创建应用弹窗。 */
export function CreateAppModal({
  open,
  form,
  confirmLoading,
  onCancel,
  onOk,
}: CreateAppModalProps) {
  return (
    <Modal
      title="创建应用"
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={confirmLoading}
      okText="创建"
      cancelText="取消"
      destroyOnClose
      modalRender={(node) => node}
    >
      <Form<CreateFormValues>
        form={form}
        layout="vertical"
        initialValues={{ icon: '📦', color: T.colorPrimary }}
        preserve={false}
      >
        <Form.Item
          label="API 名称"
          name="apiName"
          tooltip="小写下划线，租户内唯一，如 asset_management。留空则自动生成。"
          rules={[
            {
              pattern: /^[a-z][a-z0-9_]*$/,
              message: '仅支持小写字母、数字、下划线，且以字母开头',
            },
          ]}
        >
          <Input placeholder="留空则自动生成" />
        </Form.Item>
        <Form.Item
          label="显示名称"
          name="name"
          rules={[{ required: true, message: '请输入显示名称' }]}
        >
          <Input placeholder="资产管理" />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input.TextArea rows={2} placeholder="应用简介（可选）" />
        </Form.Item>
        <Form.Item label="图标" name="icon" tooltip="从图标库选择，或直接输入 emoji">
          <EmojiIconPicker />
        </Form.Item>
        <Form.Item
          label="主题色"
          name="color"
          getValueProps={(value) => ({ value: value ?? undefined })}
          getValueFromEvent={(color) => color?.toHexString()}
        >
          <ColorPicker showText format="hex" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

interface EditAppModalProps {
  app: AppSummary | null;
  form: AppForm;
  confirmLoading: boolean;
  onCancel: () => void;
  onOk: () => void;
}

/** 编辑应用弹窗（API 名称只读）。 */
export function EditAppModal({ app, form, confirmLoading, onCancel, onOk }: EditAppModalProps) {
  return (
    <Modal
      title="编辑应用"
      open={!!app}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={confirmLoading}
      okText="保存"
      cancelText="取消"
      destroyOnClose
      modalRender={(node) => node}
    >
      <Form<CreateFormValues> form={form} layout="vertical" preserve={false}>
        <Form.Item label="API 名称">
          <Input value={app?.apiName} disabled />
        </Form.Item>
        <Form.Item
          label="显示名称"
          name="name"
          rules={[{ required: true, message: '请输入显示名称' }]}
        >
          <Input placeholder="资产管理" />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input.TextArea rows={2} placeholder="应用简介（可选）" />
        </Form.Item>
        <Form.Item label="图标" name="icon" tooltip="从图标库选择，或直接输入 emoji">
          <EmojiIconPicker />
        </Form.Item>
        <Form.Item
          label="主题色"
          name="color"
          getValueProps={(value) => ({ value: value ?? undefined })}
          getValueFromEvent={(color) => color?.toHexString()}
        >
          <ColorPicker showText format="hex" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
