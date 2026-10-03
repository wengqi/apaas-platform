/**
 * 创建页面弹窗 —— 从 components/page-builder/PageList.tsx 拆分
 * （AGENTS.md 单文件 400 行规范）。
 */

import { Form, Input, Modal, Select, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { objectsApi } from '../../../api/objects.js';
import type { PageType } from '../../../api/pages.js';
import { suggestApiName } from '../../../utils/api-name-suggestion.js';

const { Text } = Typography;

/** 创建页面表单值。 */
/** 页面类型选项（原 pageComponents 注册表随 v1 搭建器退役，仅建页弹窗仍在用） */
const PAGE_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: '列表页', value: 'list_page' },
  { label: '详情页', value: 'detail_page' },
  { label: '表单页', value: 'form_page' },
  { label: '仪表盘', value: 'dashboard' },
  { label: '自定义', value: 'custom' },
];

export interface CreatePageFormValues {
  name: string;
  slug: string;
  type: PageType;
  objectId?: string;
}

export function CreatePageModal({
  open,
  form,
  appId,
  onCancel,
  onOk,
  confirmLoading,
}: {
  open: boolean;
  form: ReturnType<typeof Form.useForm<CreatePageFormValues>>[0];
  appId?: string;
  onCancel: () => void;
  onOk: () => void;
  confirmLoading: boolean;
}) {
  /** 加载对象列表(供关联对象选择)。 */
  const { data: objects } = useQuery({
    queryKey: qk.appObjects(appId!),
    queryFn: () => objectsApi.list(appId as string),
    enabled: open && !!appId,
  });

  const objectOptions = (objects ?? []).map((obj) => ({
    label: obj.name,
    value: obj.id,
  }));

  /** 监听页面类型变化,决定关联对象是否必填（原 templates/dispatch 随 v1 搭建器退役） */
  const pageType = Form.useWatch('type', form);
  const requiresObject = ['list_page', 'detail_page', 'form_page'].includes(pageType ?? 'custom');

  return (
    <Modal
      title="新建页面"
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={confirmLoading}
      okText="创建"
      cancelText="取消"
      destroyOnHidden
    >
      <Form<CreatePageFormValues>
        form={form}
        layout="vertical"
        initialValues={{ type: 'custom' as PageType }}
        preserve={false}
      >
        <Form.Item
          label="页面名称"
          name="name"
          rules={[{ required: true, message: '请输入页面名称' }]}
        >
          <Input
            placeholder="客户列表页"
            onChange={() => {
              // QA 交互评审（2026-10-03）：API 名称未手填时自动生成建议值，可改
              const slug = form?.getFieldValue('slug');
              if (!slug) form?.setFieldValue('slug', suggestApiName('page'));
            }}
          />
        </Form.Item>
        <Form.Item
          label="API 名称"
          name="slug"
          tooltip="小写下划线,应用内唯一,如 customer_list"
          rules={[
            { required: true, message: '请输入 API 名称' },
            {
              pattern: /^[a-z][a-z0-9_]*$/,
              message: '仅支持小写字母、数字、下划线,且以字母开头',
            },
          ]}
        >
          <Input placeholder="customer_list" style={{ fontFamily: 'monospace' }} />
        </Form.Item>
        <Form.Item label="页面类型" name="type" rules={[{ required: true }]}>
          <Select options={PAGE_TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item
          label="关联对象"
          name="objectId"
          tooltip={
            requiresObject
              ? '列表/详情/表单页需要关联一个对象,将自动生成模板'
              : '自定义页可不关联对象'
          }
          rules={requiresObject ? [{ required: true, message: '该页面类型需要关联对象' }] : []}
        >
          <Select
            showSearch
            allowClear
            placeholder={requiresObject ? '选择对象(必选)' : '选择对象(可选)'}
            optionFilterProp="label"
            options={objectOptions}
            notFoundContent={objects ? '暂无对象' : '加载中...'}
          />
        </Form.Item>
        {requiresObject && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            将基于所选对象的字段自动生成页面模板,可在搭建器中进一步编辑。
          </Text>
        )}
      </Form>
    </Modal>
  );
}
