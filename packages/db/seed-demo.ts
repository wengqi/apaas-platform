/**
 * Demo 应用内容种子 — 资产管理系统。
 *
 * 在 asset_management 应用壳中填充完整的业务内容：
 * - 3 个业务对象（asset / borrow_request / asset_category）+ 字段
 * - 7 个页面（list/detail/form × 对象 + dashboard）
 * - 1 个审批流程（资产领用审批）
 * - 示例记录（4 分类 + 15 资产 + 5 领用申请）
 * - 应用发布（构造 publishedSnapshot）
 *
 * 所有 schema 构造函数内联实现，参照：
 * - packages/studio/src/components/page-builder/templates.ts（页面模板格式）
 * - packages/shared/src/process/index.ts（WorkflowSchema 格式）
 * - apps/gateway/src/application/snapshot.service.ts（AppSnapshot 格式）
 */

import { prisma, type Prisma } from './src/index.js';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// 类型别名（内联，避免跨包导入 React 依赖）
// ---------------------------------------------------------------------------

interface StoredField {
  id: string;
  objectId: string;
  apiName: string;
  label: string;
  type: string;
  config: unknown;
  required: boolean;
  unique: boolean;
  searchable: boolean;
  defaultValue?: unknown;
  description?: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

const now = () => new Date().toISOString();

/** 系统字段（与 ObjectService.createSystemFields 一致） */
function createSystemFields(objectId: string): StoredField[] {
  const ts = now();
  const defs = [
    { apiName: 'created_by', label: '创建人', type: 'user' },
    { apiName: 'created_at', label: '创建时间', type: 'date_time' },
    { apiName: 'updated_by', label: '更新人', type: 'user' },
    { apiName: 'updated_at', label: '更新时间', type: 'date_time' },
    { apiName: 'owner', label: '拥有者', type: 'user' },
  ];
  return defs.map((f) => ({
    id: randomUUID(),
    objectId,
    apiName: f.apiName,
    label: f.label,
    type: f.type,
    config: {},
    required: false,
    unique: false,
    searchable: true,
    isSystem: true,
    createdAt: ts,
    updatedAt: ts,
  }));
}

function makeField(
  objectId: string,
  apiName: string,
  label: string,
  type: string,
  config: unknown = {},
  opts: { required?: boolean; unique?: boolean; searchable?: boolean } = {},
): StoredField {
  const ts = now();
  return {
    id: randomUUID(),
    objectId,
    apiName,
    label,
    type,
    config,
    required: opts.required ?? false,
    unique: opts.unique ?? false,
    searchable: opts.searchable ?? true,
    isSystem: false,
    createdAt: ts,
    updatedAt: ts,
  };
}

// ---------------------------------------------------------------------------
// 页面 Schema 构造器（参照 templates.ts 结构）
// ---------------------------------------------------------------------------

interface ObjectMeta {
  id: string;
  apiName: string;
  name: string;
  fields: StoredField[];
}

function businessFields(fields: StoredField[]): StoredField[] {
  return fields.filter((f) => !f.isSystem);
}

// ---------------------------------------------------------------------------
// R1.7：页面 schema 统一产 amis 方言（v2）——PageView.isAmisPage 分流 AmisRenderer；
// 取数/提交走平台相对 api.url（fetcher 带 token）。字段类型 → amis 控件映射。
// ---------------------------------------------------------------------------
function amisOptions(
  opts: Array<{ id: string; label: string }>,
): Array<{ label: string; value: string }> {
  return opts.map((o) => ({ label: o.label, value: o.id }));
}

function amisFieldControl(f: StoredField): Record<string, unknown> {
  const config = (f.config ?? {}) as Record<string, unknown>;
  const base: Record<string, unknown> = {
    name: f.apiName,
    label: f.label,
    required: f.required === true,
  };
  switch (f.type) {
    case 'long_text':
      return { type: 'textarea', ...base };
    case 'currency':
      return { type: 'input-number', ...base, kilobitSeparator: true, precision: 2 };
    case 'number':
      return { type: 'input-number', ...base };
    case 'percent':
      return { type: 'input-number', ...base, suffix: '%' };
    case 'single_select':
      return {
        type: 'select',
        ...base,
        options: amisOptions((config.options as Array<{ id: string; label: string }>) ?? []),
      };
    case 'multi_select':
      return {
        type: 'select',
        ...base,
        multiple: true,
        options: amisOptions((config.options as Array<{ id: string; label: string }>) ?? []),
      };
    case 'date':
      return { type: 'input-date', ...base, format: 'YYYY-MM-DD' };
    case 'date_time':
      return { type: 'input-datetime', ...base, format: 'YYYY-MM-DD HH:mm:ss' };
    case 'auto_number':
      return { type: 'static', name: f.apiName, label: f.label };
    case 'checkbox':
      return { type: 'switch', name: f.apiName, label: f.label };
    case 'attachment':
      return { type: 'input-file', ...base };
    default:
      return { type: 'input-text', ...base };
  }
}

function generateListPage(
  meta: ObjectMeta,
  label: string,
  formSlug?: string,
): Record<string, unknown> {
  const fields = businessFields(meta.fields).slice(0, 6);
  return {
    type: 'page',
    title: `${label}列表`,
    data: { objectId: meta.id },
    body: [
      {
        type: 'crud',
        name: `${meta.apiName}_crud`,
        api: {
          url: `/objects/${meta.id}/records?page=$page&pageSize=$perPage`,
          method: 'get',
        },
        perPage: 20,
        columns: fields.map((f) => ({
          name: f.apiName,
          label: f.label,
          width: 160,
          sortable: true,
        })),
        headerToolbar: [
          formSlug
            ? {
                type: 'button',
                label: '新建',
                level: 'primary',
                actionType: 'url',
                url: `/app/${'{appId}'}/p/${formSlug}`,
                blank: false,
              }
            : {
                type: 'button',
                label: '新建',
                level: 'primary',
                actionType: 'dialog',
                dialog: {
                  title: '新建',
                  body: {
                    type: 'form',
                    api: { url: `/objects/${meta.id}/records`, method: 'post' },
                    body: businessFields(meta.fields).map(amisFieldControl),
                  },
                },
              },
        ],
      },
    ],
  };
}

function generateDetailPage(
  meta: ObjectMeta,
  label: string,
  appId: string,
): Record<string, unknown> {
  const fields = businessFields(meta.fields);
  return {
    type: 'page',
    title: `${label}详情`,
    data: { appId },
    body: [
      {
        type: 'form',
        title: `${label}详情`,
        className: 'Formula',
        body: fields.map((f) => {
          const control = amisFieldControl(f);
          return { ...control, static: true };
        }),
        actions: [],
      },
      {
        type: 'button-toolbar',
        buttons: [
          {
            type: 'button',
            label: '编辑',
            level: 'primary',
            actionType: 'url',
            url: `/app/${'{appId}'}/p/${meta.apiName}_form`,
            blank: false,
          },
          {
            type: 'button',
            label: '返回列表',
            actionType: 'url',
            url: `/app/${'{appId}'}/p/${meta.apiName}_list`,
            blank: false,
          },
        ],
      },
    ],
  };
}

function generateFormPage(meta: ObjectMeta, label: string): Record<string, unknown> {
  const fields = businessFields(meta.fields);
  return {
    type: 'page',
    title: `${label}表单`,
    data: { objectId: meta.id },
    body: [
      {
        type: 'form',
        title: `${label}表单`,
        api: { url: `/objects/${meta.id}/records`, method: 'post' },
        body: fields.map(amisFieldControl),
        actions: [
          { type: 'submit', label: '保存', level: 'primary' },
          {
            type: 'button',
            label: '取消',
            actionType: 'url',
            url: `/app/${'{appId}'}/p/${meta.apiName}_list`,
            blank: false,
          },
        ],
      },
    ],
  };
}

function generateDashboardPage(assetObjectId: string, appId: string): Record<string, unknown> {
  // 图表数据源：chart-data 聚合 API 返回 [{category, value}]，
  // responseAdaptor 摊平为 echarts 可绑定的 categories/values 数组
  const chartApi = (categoryField: string, aggregation: string, timeGranularity?: string) => ({
    url: `/apps/${appId}/datasets/chart-data`,
    method: 'post',
    data: {
      sourceType: 'object',
      sourceId: assetObjectId,
      categoryField,
      aggregation,
      ...(timeGranularity ? { timeGranularity } : {}),
    },
  });
  const axisOption = {
    xAxis: { type: 'category', data: '${categories}' },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: '${values}' }],
  };
  return {
    type: 'page',
    title: '仪表盘',
    data: { appId },
    body: [
      { type: 'divider' },
      {
        type: 'grid',
        columns: [
          {
            md: 4,
            body: {
              type: 'chart',
              name: 'stat-count',
              api: chartApi('name', 'count'),
              config: {
                title: { text: '资产总数（按分类）' },
                xAxis: { type: 'category', data: '${categories}' },
                yAxis: { type: 'value' },
                series: [{ type: 'bar', data: '${values}' }],
              },
            },
          },
          {
            md: 8,
            body: {
              type: 'chart',
              api: chartApi('category', 'count'),
              config: {
                title: { text: '资产分类分布' },
                ...axisOption,
              },
            },
          },
          {
            md: 6,
            body: {
              type: 'chart',
              api: chartApi('purchase_date', 'count', 'month'),
              config: {
                title: { text: '采购趋势' },
                xAxis: { type: 'category', data: '${categories}' },
                yAxis: { type: 'value' },
                series: [{ type: 'line', data: '${values}' }],
              },
            },
          },
          {
            md: 6,
            body: {
              type: 'chart',
              api: chartApi('status', 'count'),
              config: {
                title: { text: '资产状态分布' },
                tooltip: { trigger: 'item' },
                series: [{ type: 'pie', radius: '60%', data: '${categories}' }],
              },
            },
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 审批流程 WorkflowSchema 构造器
// ---------------------------------------------------------------------------

function generateBorrowApprovalWorkflow(adminUserId: string): Record<string, unknown> {
  return {
    nodes: [
      {
        id: 'start_0',
        type: 'start',
        meta: { position: { x: 100, y: 200 } },
        data: {
          title: '开始',
          outputs: {
            type: 'object',
            properties: {
              recordId: { type: 'string', description: '触发记录 ID' },
            },
          },
        },
      },
      {
        id: 'user_task_approval',
        type: 'user_task',
        meta: { position: { x: 350, y: 200 } },
        data: {
          title: '资产领用审批',
          taskName: '资产领用审批',
          assignee: adminUserId,
          candidateGroups: [],
          inputs: {
            type: 'object',
            properties: {
              decision: { type: 'string', description: '审批决策' },
              comment: { type: 'string', description: '审批意见' },
            },
          },
        },
      },
      {
        id: 'condition_0',
        type: 'condition',
        meta: { position: { x: 600, y: 200 } },
        data: { title: '审批结果分支' },
      },
      {
        id: 'object_op_update',
        type: 'object_operation',
        meta: { position: { x: 850, y: 100 } },
        data: {
          title: '更新申请状态',
          operation: 'update',
          // 评审整改：对象操作的 objectId 必须是"领用申请"对象
          //（原误指向资产对象 → 条件命中后更新 0 行且无告警）
          objectId: '__BORROW_OBJECT_ID__',
          // 评审整改：此前误把 inputs 写成 JSON-Schema 描述（引擎实际消费
          // inputsValues 四态值），导致条件分支命中后对象更新节点报
          // "缺少 recordId"、下游通知永不执行。此处在条件命中的"已批准"分支
          // 里把申请记录状态置为 APPROVED。
          inputsValues: {
            recordId: { type: 'ref', content: ['recordId'] },
            status: { type: 'constant', content: 'APPROVED' },
          },
        },
      },
      {
        id: 'notification_approved',
        type: 'notification',
        meta: { position: { x: 1100, y: 100 } },
        data: {
          title: '通知申请人（已批准）',
          channel: 'IN_APP',
          // 模板引用：解析为记录创建人（申请人）的用户 ID
          recipients: ['{{record.created_by}}'],
          title_template: '资产领用申请已批准',
          content: '您的资产领用申请已批准，请前往领取。',
        },
      },
      {
        id: 'object_op_reject',
        type: 'object_operation',
        meta: { position: { x: 850, y: 300 } },
        data: {
          title: '更新申请状态（已拒绝）',
          operation: 'update',
          objectId: '__BORROW_OBJECT_ID__',
          inputsValues: {
            recordId: { type: 'ref', content: ['recordId'] },
            status: { type: 'constant', content: 'REJECTED' },
          },
        },
      },
      {
        id: 'notification_rejected',
        type: 'notification',
        meta: { position: { x: 850, y: 300 } },
        data: {
          title: '通知申请人（已拒绝）',
          channel: 'IN_APP',
          // 模板引用：解析为记录创建人（申请人）的用户 ID
          recipients: ['{{record.created_by}}'],
          title_template: '资产领用申请被拒绝',
          content: '您的资产领用申请被拒绝，如有疑问请联系管理员。',
        },
      },
      {
        id: 'end_0',
        type: 'end',
        meta: { position: { x: 1350, y: 200 } },
        data: { title: '结束' },
      },
    ],
    edges: [
      { sourceNodeID: 'start_0', targetNodeID: 'user_task_approval' },
      { sourceNodeID: 'user_task_approval', targetNodeID: 'condition_0' },
      {
        sourceNodeID: 'condition_0',
        targetNodeID: 'object_op_update',
        label: 'APPROVED',
        condition: '{"==":[{"var":"decision"},"APPROVED"]}',
      },
      {
        sourceNodeID: 'condition_0',
        targetNodeID: 'object_op_reject',
        label: 'REJECTED',
        condition: '{"==":[{"var":"decision"},"REJECTED"]}',
      },
      { sourceNodeID: 'object_op_reject', targetNodeID: 'notification_rejected' },
      { sourceNodeID: 'object_op_update', targetNodeID: 'notification_approved' },
      { sourceNodeID: 'notification_approved', targetNodeID: 'end_0' },
      { sourceNodeID: 'notification_rejected', targetNodeID: 'end_0' },
    ],
  };
}

// ---------------------------------------------------------------------------
// 主种子函数
// ---------------------------------------------------------------------------

export async function seedDemoContent(
  tenantId: string,
  appId: string,
  adminUserId: string,
  adminEmail: string,
): Promise<void> {
  console.log('📦 开始填充 Demo 应用内容...');

  // ========================================================================
  // 1. 创建业务对象
  // ========================================================================

  // --- 对象 1: 资产 (asset) ---
  const assetObjId = randomUUID();
  const assetFields: StoredField[] = [
    ...createSystemFields(assetObjId),
    makeField(assetObjId, 'asset_code', '资产编号', 'auto_number', { format: 'AST-{seq:0000}' }),
    makeField(assetObjId, 'asset_name', '资产名称', 'text', { maxLength: 100 }, { required: true }),
    makeField(
      assetObjId,
      'category',
      '资产分类',
      'single_select',
      {
        options: [
          { id: 'IT', value: 'IT', label: 'IT设备' },
          { id: 'OFFICE', value: 'OFFICE', label: '办公用品' },
          { id: 'FURNITURE', value: 'FURNITURE', label: '家具' },
          { id: 'VEHICLE', value: 'VEHICLE', label: '车辆' },
        ],
      },
      { required: true },
    ),
    makeField(
      assetObjId,
      'status',
      '资产状态',
      'single_select',
      {
        options: [
          { id: 'IN_STOCK', value: 'IN_STOCK', label: '在库' },
          { id: 'IN_USE', value: 'IN_USE', label: '使用中' },
          { id: 'UNDER_REPAIR', value: 'UNDER_REPAIR', label: '维修中' },
          { id: 'SCRAPPED', value: 'SCRAPPED', label: '已报废' },
        ],
      },
      { required: true },
    ),
    makeField(assetObjId, 'purchase_date', '采购日期', 'date', {}),
    makeField(assetObjId, 'purchase_price', '采购价格', 'currency', { number: { precision: 2 } }),
    makeField(assetObjId, 'location', '存放位置', 'text', { maxLength: 200 }),
    makeField(assetObjId, 'current_user', '当前使用人', 'text', { maxLength: 50 }),
    makeField(assetObjId, 'remark', '备注', 'long_text', { maxLength: 500 }),
  ];

  const assetObj = await prisma.objectMeta.upsert({
    where: { appId_apiName: { appId, apiName: 'asset' } },
    update: { fields: assetFields as unknown as Prisma.InputJsonValue },
    create: {
      id: assetObjId,
      tenantId,
      appId,
      apiName: 'asset',
      name: '资产',
      description: '企业资产信息',
      icon: '💻',
      fields: assetFields as unknown as Prisma.InputJsonValue,
      isSystem: false,
    },
  });
  // 使用实际 DB 中的 ID（幂等：重跑时 upsert 可能返回已有行的旧 ID）
  const assetDbId = assetObj.id;
  console.log(`  ✅ 对象: 资产 (asset) — ${assetFields.length} 字段`);

  // --- 对象 2: 领用申请 (borrow_request) ---
  const borrowObjId = randomUUID();
  const borrowFields: StoredField[] = [
    ...createSystemFields(borrowObjId),
    makeField(borrowObjId, 'request_code', '申请编号', 'auto_number', { format: 'REQ-{seq:0000}' }),
    makeField(borrowObjId, 'asset_id', '关联资产', 'text', {}),
    makeField(borrowObjId, 'asset_name', '资产名称', 'text', { maxLength: 100 }),
    makeField(borrowObjId, 'applicant', '申请人', 'text', { maxLength: 50 }, { required: true }),
    makeField(
      borrowObjId,
      'request_type',
      '申请类型',
      'single_select',
      {
        options: [
          { id: 'BORROW', value: 'BORROW', label: '领用' },
          { id: 'RETURN', value: 'RETURN', label: '归还' },
        ],
      },
      { required: true },
    ),
    makeField(
      borrowObjId,
      'status',
      '审批状态',
      'single_select',
      {
        options: [
          { id: 'PENDING', value: 'PENDING', label: '待审批' },
          { id: 'APPROVED', value: 'APPROVED', label: '已批准' },
          { id: 'REJECTED', value: 'REJECTED', label: '已拒绝' },
          { id: 'COMPLETED', value: 'COMPLETED', label: '已完成' },
        ],
      },
      { required: true },
    ),
    makeField(borrowObjId, 'request_date', '申请日期', 'date', {}),
    makeField(borrowObjId, 'reason', '申请理由', 'long_text', { maxLength: 500 }),
    makeField(borrowObjId, 'approver', '审批人', 'text', { maxLength: 50 }),
  ];

  const borrowObj = await prisma.objectMeta.upsert({
    where: { appId_apiName: { appId, apiName: 'borrow_request' } },
    update: { fields: borrowFields as unknown as Prisma.InputJsonValue },
    create: {
      id: borrowObjId,
      tenantId,
      appId,
      apiName: 'borrow_request',
      name: '领用申请',
      description: '资产领用与归还申请',
      icon: '📝',
      fields: borrowFields as unknown as Prisma.InputJsonValue,
      isSystem: false,
    },
  });
  const borrowDbId = borrowObj.id;
  console.log(`  ✅ 对象: 领用申请 (borrow_request) — ${borrowFields.length} 字段`);

  // --- 对象 3: 资产分类 (asset_category) ---
  const categoryObjId = randomUUID();
  const categoryFields: StoredField[] = [
    ...createSystemFields(categoryObjId),
    makeField(
      categoryObjId,
      'code',
      '分类编码',
      'text',
      { maxLength: 20 },
      { required: true, unique: true },
    ),
    makeField(categoryObjId, 'name', '分类名称', 'text', { maxLength: 50 }, { required: true }),
    makeField(categoryObjId, 'description', '描述', 'long_text', { maxLength: 200 }),
  ];

  const categoryObj = await prisma.objectMeta.upsert({
    where: { appId_apiName: { appId, apiName: 'asset_category' } },
    update: { fields: categoryFields as unknown as Prisma.InputJsonValue },
    create: {
      id: categoryObjId,
      tenantId,
      appId,
      apiName: 'asset_category',
      name: '资产分类',
      description: '资产分类管理',
      icon: '🏷️',
      fields: categoryFields as unknown as Prisma.InputJsonValue,
      isSystem: false,
    },
  });
  const categoryDbId = categoryObj.id;
  console.log(`  ✅ 对象: 资产分类 (asset_category) — ${categoryFields.length} 字段`);

  const assetMeta: ObjectMeta = {
    id: assetDbId,
    apiName: 'asset',
    name: '资产',
    fields: assetFields,
  };
  const borrowMeta: ObjectMeta = {
    id: borrowDbId,
    apiName: 'borrow_request',
    name: '领用申请',
    fields: borrowFields,
  };
  const categoryMeta: ObjectMeta = {
    id: categoryDbId,
    apiName: 'asset_category',
    name: '资产分类',
    fields: categoryFields,
  };

  // ========================================================================
  // 2. 创建页面
  // ========================================================================

  const pages: Array<{
    apiName: string;
    name: string;
    type: string;
    objectId: string | null;
    schema: PageSchema;
  }> = [
    {
      apiName: 'asset_list',
      name: '资产列表',
      type: 'list_page',
      objectId: assetDbId,
      schema: generateListPage(assetMeta, '资产', 'asset_form'),
    },
    {
      apiName: 'asset_detail',
      name: '资产详情',
      type: 'detail_page',
      objectId: assetDbId,
      schema: generateDetailPage(assetMeta, '资产', appId),
    },
    {
      apiName: 'asset_form',
      name: '资产登记',
      type: 'form_page',
      objectId: assetDbId,
      schema: generateFormPage(assetMeta, '资产'),
    },
    {
      apiName: 'borrow_list',
      name: '领用申请列表',
      type: 'list_page',
      objectId: borrowDbId,
      schema: generateListPage(borrowMeta, '领用申请', 'borrow_form'),
    },
    {
      apiName: 'borrow_form',
      name: '领用申请',
      type: 'form_page',
      objectId: borrowDbId,
      schema: generateFormPage(borrowMeta, '领用申请'),
    },
    {
      apiName: 'category_list',
      name: '资产分类',
      type: 'list_page',
      objectId: categoryDbId,
      schema: generateListPage(categoryMeta, '资产分类'),
    },
    {
      apiName: 'dashboard',
      name: '资产仪表盘',
      type: 'dashboard',
      objectId: null,
      schema: generateDashboardPage(assetDbId, appId),
    },
  ];

  for (const p of pages) {
    await prisma.pageMeta.upsert({
      where: { appId_apiName: { appId, apiName: p.apiName } },
      update: {
        name: p.name,
        type: p.type,
        objectId: p.objectId,
        schema: p.schema as unknown as Prisma.InputJsonValue,
      },
      create: {
        tenantId,
        appId,
        apiName: p.apiName,
        name: p.name,
        type: p.type,
        objectId: p.objectId,
        schema: p.schema as unknown as Prisma.InputJsonValue,
        isPublished: false,
      },
    });
  }
  console.log(`  ✅ 页面: ${pages.length} 个`);

  // ========================================================================
  // 3. 创建审批流程
  // ========================================================================

  let workflowSchema = generateBorrowApprovalWorkflow(adminUserId);
  // 替换占位符为实际对象 ID（申请状态回写作用于领用申请对象）
  const workflowStr = JSON.stringify(workflowSchema).replaceAll('__BORROW_OBJECT_ID__', borrowDbId);
  workflowSchema = JSON.parse(workflowStr);

  await prisma.processDef.upsert({
    where: { appId_apiName_version: { appId, apiName: 'asset_borrow_approval', version: 1 } },
    update: {
      workflowSchema: workflowSchema as unknown as Prisma.InputJsonValue,
      triggerType: 'RECORD_CREATED',
    },
    create: {
      tenantId,
      appId,
      apiName: 'asset_borrow_approval',
      name: '资产领用审批',
      workflowSchema: workflowSchema as unknown as Prisma.InputJsonValue,
      triggerType: 'RECORD_CREATED',
      version: 1,
      status: 'DRAFT',
    },
  });
  console.log(`  ✅ 流程: 资产领用审批 (asset_borrow_approval)`);

  // ========================================================================
  // 4. 创建示例记录
  // ========================================================================

  // --- 资产分类（4 条）---
  const categories = [
    { code: 'IT', name: 'IT设备', description: '计算机、服务器、网络设备等' },
    { code: 'OFFICE', name: '办公用品', description: '办公耗材、文具等' },
    { code: 'FURNITURE', name: '家具', description: '办公家具、储物柜等' },
    { code: 'VEHICLE', name: '车辆', description: '公务用车' },
  ];

  for (const cat of categories) {
    const existing = await prisma.record.findFirst({
      where: { objectId: categoryDbId, tenantId, data: { path: ['code'], equals: cat.code } },
    });
    if (!existing) {
      await prisma.record.create({
        data: {
          tenantId,
          appId,
          objectId: categoryDbId,
          data: {
            code: cat.code,
            name: cat.name,
            description: cat.description,
          } as unknown as Prisma.InputJsonValue,
          createdBy: adminUserId,
        },
      });
    }
  }
  console.log(`  ✅ 资产分类记录: ${categories.length} 条`);

  // --- 资产记录（15 条）---
  const assets = [
    {
      asset_code: 'AST-0001',
      asset_name: 'MacBook Pro 16寸',
      category: 'IT',
      status: 'IN_USE',
      purchase_date: '2025-01-15',
      purchase_price: 18999,
      location: '研发部-3F',
      current_user: '张三',
      remark: '开发用机',
    },
    {
      asset_code: 'AST-0002',
      asset_name: 'Dell U2723QE 显示器',
      category: 'IT',
      status: 'IN_USE',
      purchase_date: '2025-02-20',
      purchase_price: 4599,
      location: '研发部-3F',
      current_user: '张三',
      remark: '',
    },
    {
      asset_code: 'AST-0003',
      asset_name: 'iPhone 15 Pro',
      category: 'IT',
      status: 'IN_USE',
      purchase_date: '2025-03-10',
      purchase_price: 7999,
      location: '市场部-2F',
      current_user: '李四',
      remark: '测试用机',
    },
    {
      asset_code: 'AST-0004',
      asset_name: 'ThinkPad X1 Carbon',
      category: 'IT',
      status: 'IN_STOCK',
      purchase_date: '2025-01-20',
      purchase_price: 12999,
      location: 'IT仓库-B1',
      current_user: '',
      remark: '备用机',
    },
    {
      asset_code: 'AST-0005',
      asset_name: 'HP LaserJet 打印机',
      category: 'IT',
      status: 'IN_USE',
      purchase_date: '2024-11-05',
      purchase_price: 2599,
      location: '行政部-1F',
      current_user: '王五',
      remark: '',
    },
    {
      asset_code: 'AST-0006',
      asset_name: '人体工学椅',
      category: 'FURNITURE',
      status: 'IN_USE',
      purchase_date: '2024-12-15',
      purchase_price: 1899,
      location: '研发部-3F',
      current_user: '赵六',
      remark: '',
    },
    {
      asset_code: 'AST-0007',
      asset_name: '电动升降桌',
      category: 'FURNITURE',
      status: 'IN_USE',
      purchase_date: '2025-01-08',
      purchase_price: 2299,
      location: '研发部-3F',
      current_user: '张三',
      remark: '',
    },
    {
      asset_code: 'AST-0008',
      asset_name: '铁皮文件柜',
      category: 'FURNITURE',
      status: 'IN_STOCK',
      purchase_date: '2024-10-20',
      purchase_price: 899,
      location: 'IT仓库-B1',
      current_user: '',
      remark: '',
    },
    {
      asset_code: 'AST-0009',
      asset_name: 'A4 打印纸（箱）',
      category: 'OFFICE',
      status: 'IN_USE',
      purchase_date: '2025-03-01',
      purchase_price: 199,
      location: '行政部-1F',
      current_user: '王五',
      remark: '耗材',
    },
    {
      asset_code: 'AST-0010',
      asset_name: '白板笔套装',
      category: 'OFFICE',
      status: 'IN_USE',
      purchase_date: '2025-02-28',
      purchase_price: 89,
      location: '会议室-A',
      current_user: '',
      remark: '',
    },
    {
      asset_code: 'AST-0011',
      asset_name: '丰田凯美瑞',
      category: 'VEHICLE',
      status: 'IN_USE',
      purchase_date: '2024-06-15',
      purchase_price: 189000,
      location: '地下车库',
      current_user: '李四',
      remark: '公务用车',
    },
    {
      asset_code: 'AST-0012',
      asset_name: '别克 GL8',
      category: 'VEHICLE',
      status: 'UNDER_REPAIR',
      purchase_date: '2023-09-10',
      purchase_price: 235000,
      location: '4S店维修',
      current_user: '',
      remark: '保养维修中',
    },
    {
      asset_code: 'AST-0013',
      asset_name: 'MacBook Air M3',
      category: 'IT',
      status: 'IN_STOCK',
      purchase_date: '2025-03-20',
      purchase_price: 9499,
      location: 'IT仓库-B1',
      current_user: '',
      remark: '新采购',
    },
    {
      asset_code: 'AST-0014',
      asset_name: '会议桌（8人）',
      category: 'FURNITURE',
      status: 'IN_USE',
      purchase_date: '2024-08-01',
      purchase_price: 3500,
      location: '会议室-B',
      current_user: '',
      remark: '',
    },
    {
      asset_code: 'AST-0015',
      asset_name: '投影仪 Epson',
      category: 'IT',
      status: 'SCRAPPED',
      purchase_date: '2022-03-15',
      purchase_price: 4599,
      location: '报废区',
      current_user: '',
      remark: '已达报废年限',
    },
  ];

  for (const a of assets) {
    const existing = await prisma.record.findFirst({
      where: {
        objectId: assetDbId,
        tenantId,
        data: { path: ['asset_code'], equals: a.asset_code },
      },
    });
    if (!existing) {
      await prisma.record.create({
        data: {
          tenantId,
          appId,
          objectId: assetDbId,
          data: a as unknown as Prisma.InputJsonValue,
          createdBy: adminUserId,
        },
      });
    }
  }
  console.log(`  ✅ 资产记录: ${assets.length} 条`);

  // --- 领用申请记录（5 条）---
  const borrowRequests = [
    {
      request_code: 'REQ-0001',
      asset_id: '',
      asset_name: 'MacBook Pro 16寸',
      applicant: '张三',
      request_type: 'BORROW',
      status: 'APPROVED',
      request_date: '2025-01-16',
      reason: '开发工作需要',
      approver: adminEmail,
    },
    {
      request_code: 'REQ-0002',
      asset_id: '',
      asset_name: 'iPhone 15 Pro',
      applicant: '李四',
      request_type: 'BORROW',
      status: 'APPROVED',
      request_date: '2025-03-11',
      reason: '市场推广测试',
      approver: adminEmail,
    },
    {
      request_code: 'REQ-0003',
      asset_id: '',
      asset_name: '人体工学椅',
      applicant: '赵六',
      request_type: 'BORROW',
      status: 'PENDING',
      request_date: '2025-03-25',
      reason: '腰不舒服，需要更换座椅',
      approver: '',
    },
    {
      request_code: 'REQ-0004',
      asset_id: '',
      asset_name: 'MacBook Air M3',
      applicant: '王五',
      request_type: 'BORROW',
      status: 'PENDING',
      request_date: '2025-03-28',
      reason: '新项目需要开发设备',
      approver: '',
    },
    {
      request_code: 'REQ-0005',
      asset_id: '',
      asset_name: '丰田凯美瑞',
      applicant: '李四',
      request_type: 'BORROW',
      status: 'REJECTED',
      request_date: '2025-02-10',
      reason: '客户拜访需要用车',
      approver: adminEmail,
    },
  ];

  for (const r of borrowRequests) {
    const existing = await prisma.record.findFirst({
      where: {
        objectId: borrowDbId,
        tenantId,
        data: { path: ['request_code'], equals: r.request_code },
      },
    });
    if (!existing) {
      await prisma.record.create({
        data: {
          tenantId,
          appId,
          objectId: borrowDbId,
          data: r as unknown as Prisma.InputJsonValue,
          createdBy: adminUserId,
        },
      });
    }
  }
  console.log(`  ✅ 领用申请记录: ${borrowRequests.length} 条`);

  // ========================================================================
  // 5. 应用发布（构造 publishedSnapshot）
  // ========================================================================

  console.log('  📤 正在发布应用...');

  // 重新加载所有数据（确保拿到最新状态）
  const [allObjects, allPages, allProcesses] = await Promise.all([
    prisma.objectMeta.findMany({
      where: { appId },
      include: { views: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.pageMeta.findMany({
      where: { appId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.processDef.findMany({
      where: { appId },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const publishedAt = new Date().toISOString();

  // 快照包含租户级角色 + 权限规则（演示权限模型，对齐 SnapshotService.collectSnapshot 行为）
  const tenantRoles = await prisma.role.findMany({
    where: { tenantId },
    include: { permissionRules: true },
    orderBy: { createdAt: 'asc' },
  });

  const snapshot = {
    meta: {
      appId,
      appName: '资产管理',
      apiName: 'asset_management',
      version: 1,
      publishedAt,
      publishedBy: adminUserId,
    },
    objects: allObjects.map((obj) => ({
      id: obj.id,
      apiName: obj.apiName,
      name: obj.name,
      description: obj.description,
      icon: obj.icon,
      fields: obj.fields as unknown[],
      isSystem: obj.isSystem,
      views: obj.views.map((v) => ({
        id: v.id,
        name: v.name,
        type: v.type,
        config: v.config as Record<string, unknown>,
      })),
    })),
    pages: allPages.map((p) => ({
      id: p.id,
      apiName: p.apiName,
      name: p.name,
      type: p.type,
      schema: p.schema as Record<string, unknown>,
      objectId: p.objectId,
    })),
    processes: allProcesses.map((proc) => ({
      id: proc.id,
      apiName: proc.apiName,
      name: proc.name,
      workflowSchema: proc.workflowSchema as Record<string, unknown>,
      triggerType: proc.triggerType,
    })),
    permissions: {
      roles: tenantRoles.map((role) => ({
        id: role.id,
        name: role.name,
        code: role.code,
        isBuiltIn: role.isBuiltIn,
        rules: role.permissionRules.map((rule) => ({
          id: rule.id,
          type: rule.type,
          action: rule.action,
          targetId: rule.targetId,
          conditions: (rule.condition as Record<string, unknown>) ?? null,
          fieldScope: (rule.fieldScope as string[]) ?? null,
        })),
      })),
    },
  };

  // 事务：更新应用状态 + 发布页面 + 发布流程
  await prisma.$transaction([
    prisma.application.update({
      where: { id: appId },
      data: {
        status: 'PUBLISHED',
        version: 1,
        publishedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        // R1.4：环境指针优先于 publishedSnapshot（若存在）——种子回无指针基线保证幂等
        environments: {
          updateMany: { where: {}, data: { currentVersionId: null } },
        },
        publishedAt: new Date(),
      },
    }),
    prisma.pageMeta.updateMany({
      where: { appId },
      data: { isPublished: true },
    }),
    prisma.processDef.updateMany({
      where: { appId },
      data: { status: 'PUBLISHED' },
    }),
  ]);

  console.log('  ✅ 应用已发布 (v1.0.0) — publishedSnapshot 已写入');
  console.log('📦 Demo 应用内容填充完成!');
}
