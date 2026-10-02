/**
 * 采购合同应用种子 — R1.5 端到端验收应用（P0-S4）。
 *
 * 在 procurement 应用壳中填充完整业务内容：
 * - 2 个业务对象（supplier / contract）+ 字段
 * - 3 个页面：合同台账（v1 渲染器）、合同提交页、**审批任务页（amis 方言 v2，user_task 绑定）**
 * - 1 个审批流程：合同审批（金额条件分支 → 大额走会签 → 依次多级 → 小额单人 → 状态回写+通知）
 *   —— 用满 R1.3 新语义：approvalMode countersign/sequential、pageId 审批页面绑定、
 *   rejectToNodeId 驳回跳转、start 入参 / end 出参
 * - 示例记录（3 供应商 + 4 合同，覆盖大额/小额分支）
 * - 应用发布（publishedSnapshot，对齐 seed-demo 模式）
 *
 * 页面双方言并存说明（ADR-0003 过渡期）：
 * - 台账/提交页走 v1 自有方言（generateListPage/generateFormPage 同款结构，运行时立即可用）
 * - 审批任务页走 amis 方言（ApprovalPageRenderer 渲染，验证 P0 S2 链路）
 */

import { prisma, type Prisma } from './src/index.js';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// 类型与工具（与 seed-demo.ts 同构，独立内联避免跨文件耦合）
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

interface ObjectMeta {
  id: string;
  apiName: string;
  name: string;
  fields: StoredField[];
}

const now = () => new Date().toISOString();

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
  config: Record<string, unknown> = {},
  opts: { required?: boolean; unique?: boolean } = {},
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
    searchable: true,
    isSystem: false,
    createdAt: ts,
    updatedAt: ts,
  };
}

function businessFields(fields: StoredField[]): StoredField[] {
  return fields.filter((f) => !f.isSystem);
}

// ---------------------------------------------------------------------------
// v1 方言页面（台账 / 提交页，立即被现有运行时渲染）
// ---------------------------------------------------------------------------

/**
 * R1.7：页面 schema 统一产 amis 方言（v2）——运行时经 PageView 的 isAmisPage
 * 分流由 AmisRenderer 渲染；取数/提交全部走平台相对 api.url（fetcher 带 token）。
 * 字段类型 → amis 控件映射与 v1 表单生成器一致。
 */
function amisFieldControl(f: {
  apiName: string;
  label: string;
  type: string;
  required?: boolean;
}): Record<string, unknown> {
  const base = { name: f.apiName, label: f.label, required: f.required === true };
  const map: Record<string, Record<string, unknown>> = {
    text: { type: 'input-text', ...base },
    long_text: { type: 'textarea', ...base },
    currency: { type: 'input-number', ...base, kilobitSeparator: true, precision: 2 },
    number: { type: 'input-number', ...base },
    percent: { type: 'input-number', ...base, suffix: '%' },
    single_select: { type: 'select', ...base },
    date: { type: 'input-date', ...base },
    date_time: { type: 'input-datetime', ...base },
  };
  return map[f.type] ?? { type: 'input-text', ...base };
}

function generateContractListPage(
  meta: ObjectMeta,
  label: string,
  formSlug?: string,
): Record<string, unknown> {
  const fields = businessFields(meta.fields).slice(0, 6);
  const columns = fields.map((f) => ({
    name: f.apiName,
    label: f.label,
    width: 160,
    sortable: true,
  }));

  return {
    type: 'page',
    title: `${label}列表`,
    data: { objectId: meta.id },
    body: [
      {
        type: 'crud',
        name: 'contract_crud',
        api: {
          url: `/objects/${meta.id}/records?page=$page&pageSize=$perPage`,
          method: 'get',
          responseAdaptor:
            'return { ...payload, data: { ...payload.data, count: payload.data.total } }',
        },
        perPage: 20,
        columns,
        features: ['create', 'filter'],
        headerToolbar: [
          {
            type: 'button',
            label: '新建合同',
            level: 'primary',
            ...(formSlug
              ? {
                  actionType: 'url',
                  url: `/app/${'{appId}'}/p/${formSlug}`,
                  blank: false,
                }
              : {}),
          },
        ],
      },
    ],
  };
}

function generateContractFormPage(meta: ObjectMeta, label: string): Record<string, unknown> {
  const fields = businessFields(meta.fields);
  return {
    type: 'page',
    title: `${label}提交`,
    data: { objectId: meta.id },
    body: [
      {
        type: 'form',
        title: `${label}表单`,
        api: {
          url: `/objects/${meta.id}/records`,
          method: 'post',
        },
        body: fields.map(amisFieldControl),
        actions: [
          {
            type: 'submit',
            label: '提交审批',
            level: 'primary',
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// amis 方言页面（审批任务页，user_task 绑定 — ApprovalPageRenderer 渲染）
// ---------------------------------------------------------------------------

/**
 * 合同审批任务页（amis 方言，type: 'page'）。
 * 一切界面皆页面（ADR-0003）：含合同信息 static 查看区 + 审批意见输入表单。
 * 数据域：任务中心注入 { taskId, recordId, amount, contract_name, ... }（流程变量+触发上下文）。
 */
function generateApprovalTaskPage(): Record<string, unknown> {
  return {
    type: 'page',
    title: '合同审批',
    body: [
      {
        type: 'form',
        title: '合同信息（查看）',
        mode: 'horizontal',
        static: true,
        actions: [],
        body: [
          { type: 'input-text', name: 'contract_name', label: '合同名称' },
          { type: 'input-number', name: 'amount', label: '合同金额（元）', kilobitSeparator: true },
          { type: 'input-text', name: 'supplier_name', label: '供应商' },
          { type: 'input-date', name: 'sign_date', label: '签订日期', static: true },
        ],
      },
      {
        type: 'form',
        title: '审批意见',
        mode: 'horizontal',
        body: [
          {
            type: 'textarea',
            name: 'opinion',
            label: '意见',
            placeholder: '请输入审批意见（可选）',
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 审批流程 — 金额条件分支 + 会签 + 依次多级（R1.3 语义全量使用）
// ---------------------------------------------------------------------------

function generateContractApprovalWorkflow(adminUserId: string): Record<string, unknown> {
  return {
    nodes: [
      {
        id: 'start_0',
        type: 'start',
        meta: { position: { x: 80, y: 240 } },
        data: {
          title: '开始',
          // R1.3 流程入参：触发上下文带 recordId（创建合同记录触发）
          inputsValues: {
            recordId: { type: 'ref', content: ['recordId'] },
          },
        },
      },
      {
        // 大额合同（≥100 万）：财务+法务会签
        id: 'user_task_countersign',
        type: 'user_task',
        meta: { position: { x: 320, y: 120 } },
        data: {
          title: '大额合同会签（财务+法务）',
          taskName: '大额合同会签',
          approvalMode: 'countersign',
          approveUsers: [adminUserId, '__CFO_USER_ID__'],
          pageId: '__APPROVAL_PAGE_ID__',
          rejectToNodeId: '',
        },
      },
      {
        // 小额合同（<100 万）：采购主管单人审批
        id: 'user_task_minor',
        type: 'user_task',
        meta: { position: { x: 320, y: 360 } },
        data: {
          title: '小额合同审批',
          taskName: '小额合同审批',
          approvalMode: 'single',
          assignee: adminUserId,
          pageId: '__APPROVAL_PAGE_ID__',
        },
      },
      {
        // 大额走完会签后：总经理依次终审（多级顺序）
        id: 'user_task_final',
        type: 'user_task',
        meta: { position: { x: 580, y: 120 } },
        data: {
          title: '总经理终审',
          taskName: '总经理终审',
          approvalMode: 'sequential',
          approveUsers: [adminUserId],
          pageId: '__APPROVAL_PAGE_ID__',
        },
      },
      {
        id: 'condition_0',
        type: 'condition',
        meta: { position: { x: 840, y: 240 } },
        data: { title: '审批结果分支' },
      },
      {
        id: 'object_op_approved',
        type: 'object_operation',
        meta: { position: { x: 1080, y: 140 } },
        data: {
          title: '合同状态置为已批准',
          operation: 'update',
          objectId: '__CONTRACT_OBJECT_ID__',
          inputsValues: {
            recordId: { type: 'ref', content: ['recordId'] },
            status: { type: 'constant', content: 'APPROVED' },
          },
        },
      },
      {
        id: 'notification_approved',
        type: 'notification',
        meta: { position: { x: 1320, y: 140 } },
        data: {
          title: '通知申请人（已批准）',
          channel: 'IN_APP',
          recipients: ['{{record.created_by}}'],
          title_template: '合同审批通过',
          content: '您提交的合同已通过全部审批并归档。',
        },
      },
      {
        id: 'object_op_rejected',
        type: 'object_operation',
        meta: { position: { x: 1080, y: 340 } },
        data: {
          title: '合同状态置为已驳回',
          operation: 'update',
          objectId: '__CONTRACT_OBJECT_ID__',
          inputsValues: {
            recordId: { type: 'ref', content: ['recordId'] },
            status: { type: 'constant', content: 'REJECTED' },
          },
        },
      },
      {
        id: 'notification_rejected',
        type: 'notification',
        meta: { position: { x: 1320, y: 340 } },
        data: {
          title: '通知申请人（已驳回）',
          channel: 'IN_APP',
          recipients: ['{{record.created_by}}'],
          title_template: '合同审批被驳回',
          content: '您提交的合同审批被驳回，请查看审批意见。',
        },
      },
      {
        id: 'end_0',
        type: 'end',
        meta: { position: { x: 1560, y: 240 } },
        data: {
          title: '结束',
          // R1.3 流程出参（headless 可读）
          inputsValues: {
            result: { type: 'template', content: '${condition_0.decision}' },
          },
        },
      },
    ],
    edges: [
      {
        // 金额条件分支在 start 之后、审批之前（引擎在 split 处求值分支条件）
        sourceNodeID: 'start_0',
        targetNodeID: 'user_task_countersign',
        label: '≥100万',
        condition: '{"or":[{"<=":[1000000,{"var":"amount"}]}]}',
      },
      {
        sourceNodeID: 'start_0',
        targetNodeID: 'user_task_minor',
        label: '<100万',
        condition: '{"<":[{"var":"amount"},1000000]}',
      },
      { sourceNodeID: 'user_task_countersign', targetNodeID: 'user_task_final' },
      { sourceNodeID: 'user_task_final', targetNodeID: 'condition_0' },
      { sourceNodeID: 'user_task_minor', targetNodeID: 'condition_0' },
      {
        sourceNodeID: 'condition_0',
        targetNodeID: 'object_op_approved',
        label: 'APPROVED',
        condition: '{"==":[{"var":"decision"},"APPROVED"]}',
      },
      {
        sourceNodeID: 'condition_0',
        targetNodeID: 'object_op_rejected',
        label: 'REJECTED',
        condition: '{"==":[{"var":"decision"},"REJECTED"]}',
      },
      { sourceNodeID: 'object_op_approved', targetNodeID: 'notification_approved' },
      { sourceNodeID: 'object_op_rejected', targetNodeID: 'notification_rejected' },
      { sourceNodeID: 'notification_approved', targetNodeID: 'end_0' },
      { sourceNodeID: 'notification_rejected', targetNodeID: 'end_0' },
    ],
  };
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

export async function seedProcurementContent(
  tenantId: string,
  appId: string,
  adminUserId: string,
): Promise<void> {
  console.log('📦 开始填充采购合同应用内容...');

  // ========================================================================
  // 1. 业务对象
  // ========================================================================

  // --- 供应商 (supplier) ---
  const supplierObjId = randomUUID();
  const supplierFields: StoredField[] = [
    ...createSystemFields(supplierObjId),
    makeField(supplierObjId, 'supplier_code', '供应商编码', 'auto_number', {
      format: 'SUP-{seq:0000}',
    }),
    makeField(supplierObjId, 'name', '供应商名称', 'text', { maxLength: 100 }, { required: true }),
    makeField(
      supplierObjId,
      'level',
      '供应商等级',
      'single_select',
      {
        options: [
          { id: 'S', value: 'S', label: '战略供应商' },
          { id: 'A', value: 'A', label: '优选供应商' },
          { id: 'B', value: 'B', label: '合格供应商' },
        ],
      },
      { required: true },
    ),
    makeField(supplierObjId, 'contact', '联系人', 'text', { maxLength: 50 }),
    makeField(supplierObjId, 'phone', '联系电话', 'text', { maxLength: 30 }),
    makeField(supplierObjId, 'remark', '备注', 'long_text', { maxLength: 300 }),
  ];
  const supplierObj = await prisma.objectMeta.upsert({
    where: { appId_apiName: { appId, apiName: 'supplier' } },
    update: { fields: supplierFields as unknown as Prisma.InputJsonValue },
    create: {
      id: supplierObjId,
      tenantId,
      appId,
      apiName: 'supplier',
      name: '供应商',
      description: '采购供应商档案',
      icon: '🏢',
      fields: supplierFields as unknown as Prisma.InputJsonValue,
      isSystem: false,
    },
  });
  console.log(`  ✅ 对象: 供应商 (supplier) — ${supplierFields.length} 字段`);

  // --- 采购合同 (contract) ---
  const contractObjId = randomUUID();
  const contractFields: StoredField[] = [
    ...createSystemFields(contractObjId),
    makeField(contractObjId, 'contract_code', '合同编号', 'auto_number', {
      format: 'PO-{seq:0000}',
    }),
    makeField(
      contractObjId,
      'contract_name',
      '合同名称',
      'text',
      { maxLength: 150 },
      { required: true },
    ),
    makeField(
      contractObjId,
      'supplier_name',
      '供应商',
      'text',
      { maxLength: 100 },
      { required: true },
    ),
    makeField(
      contractObjId,
      'amount',
      '合同金额（元）',
      'currency',
      { number: { precision: 2 } },
      { required: true },
    ),
    makeField(
      contractObjId,
      'status',
      '审批状态',
      'single_select',
      {
        options: [
          { id: 'PENDING', value: 'PENDING', label: '审批中' },
          { id: 'APPROVED', value: 'APPROVED', label: '已批准' },
          { id: 'REJECTED', value: 'REJECTED', label: '已驳回' },
        ],
      },
      { required: true },
    ),
    makeField(contractObjId, 'sign_date', '签订日期', 'date', {}),
    makeField(contractObjId, 'attachment', '合同附件', 'attachment', {}),
    makeField(contractObjId, 'remark', '备注', 'long_text', { maxLength: 500 }),
  ];
  const contractObj = await prisma.objectMeta.upsert({
    where: { appId_apiName: { appId, apiName: 'contract' } },
    update: { fields: contractFields as unknown as Prisma.InputJsonValue },
    create: {
      id: contractObjId,
      tenantId,
      appId,
      apiName: 'contract',
      name: '采购合同',
      description: '采购合同台账与审批',
      icon: '📄',
      fields: contractFields as unknown as Prisma.InputJsonValue,
      isSystem: false,
    },
  });
  console.log(`  ✅ 对象: 采购合同 (contract) — ${contractFields.length} 字段`);

  const contractMeta: ObjectMeta = {
    id: contractObj.id,
    apiName: 'contract',
    name: '采购合同',
    fields: contractFields,
  };

  // ========================================================================
  // 2. 页面
  // ========================================================================

  const approvalPageApiName = 'contract_approval_page';
  const pages: Array<{
    apiName: string;
    name: string;
    type: string;
    objectId: string | null;
    schema: unknown;
  }> = [
    {
      apiName: 'contract_list',
      name: '合同台账',
      type: 'list_page',
      objectId: contractObj.id,
      schema: generateContractListPage(contractMeta, '采购合同', 'contract_form'),
    },
    {
      apiName: 'contract_form',
      name: '合同提交',
      type: 'form_page',
      objectId: contractObj.id,
      schema: generateContractFormPage(contractMeta, '采购合同'),
    },
    {
      apiName: approvalPageApiName,
      name: '合同审批页',
      type: 'custom',
      objectId: null,
      schema: generateApprovalTaskPage(),
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
  console.log(`  ✅ 页面: ${pages.length} 个（含 amis 审批页 ${approvalPageApiName}）`);

  // ========================================================================
  // 3. 审批流程
  // ========================================================================

  // 审批人：管理员 + 平台内第二审批人（builder，不足时回退管理员本人）
  const secondApprover =
    (
      await prisma.user.findFirst({
        where: { tenantId, status: 'ACTIVE', id: { not: adminUserId } },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
    )?.id ?? adminUserId;

  let workflowSchema = generateContractApprovalWorkflow(adminUserId);
  const workflowStr = JSON.stringify(workflowSchema)
    .replaceAll('__CONTRACT_OBJECT_ID__', contractObj.id)
    .replaceAll('__APPROVAL_PAGE_ID__', pages[2]!.apiName)
    .replaceAll('__CFO_USER_ID__', secondApprover);
  workflowSchema = JSON.parse(workflowStr);

  await prisma.processDef.upsert({
    where: { appId_apiName_version: { appId, apiName: 'contract_approval', version: 1 } },
    update: {
      workflowSchema: workflowSchema as unknown as Prisma.InputJsonValue,
      triggerType: 'RECORD_CREATED',
    },
    create: {
      tenantId,
      appId,
      apiName: 'contract_approval',
      name: '采购合同审批',
      workflowSchema: workflowSchema as unknown as Prisma.InputJsonValue,
      triggerType: 'RECORD_CREATED',
      version: 1,
      status: 'DRAFT',
    },
  });
  console.log('  ✅ 流程: 采购合同审批 (contract_approval) — 金额分支/会签/依次终审');

  // ========================================================================
  // 4. 示例记录
  // ========================================================================

  const suppliers = [
    {
      name: '联想（上海）',
      level: 'S',
      contact: '王经理',
      phone: '13800000001',
      remark: 'IT 设备战略供应商',
    },
    { name: '震旦办公', level: 'A', contact: '李经理', phone: '13800000002', remark: '办公家具' },
    { name: '施耐德电气', level: 'A', contact: '赵工', phone: '13800000003', remark: 'UPS 维保' },
  ];
  for (const s of suppliers) {
    const existing = await prisma.record.findFirst({
      where: { objectId: supplierObj.id, tenantId, data: { path: ['name'], equals: s.name } },
    });
    if (!existing) {
      await prisma.record.create({
        data: {
          tenantId,
          appId,
          objectId: supplierObj.id,
          data: s as unknown as Prisma.InputJsonValue,
          createdBy: adminUserId,
        },
      });
    }
  }
  console.log(`  ✅ 供应商记录: ${suppliers.length} 条`);

  const contracts = [
    {
      contract_name: '华东区服务器采购合同',
      supplier_name: '联想（上海）',
      amount: 1280000,
      status: 'PENDING',
      sign_date: '2026-09-12',
      remark: '100 万以上 → 走会签+终审',
    },
    {
      contract_name: '办公家具框架协议',
      supplier_name: '震旦办公',
      amount: 356000,
      status: 'PENDING',
      sign_date: '2026-08-30',
      remark: '100 万以下 → 单人审批',
    },
    {
      contract_name: '数据中心 UPS 维保合同',
      supplier_name: '施耐德电气',
      amount: 89000,
      status: 'PENDING',
      sign_date: '2026-07-15',
      remark: '小额',
    },
    {
      contract_name: '园区安防改造合同',
      supplier_name: '海康威视',
      amount: 620000,
      status: 'PENDING',
      sign_date: '2026-09-01',
      remark: '小额',
    },
  ];
  for (const c of contracts) {
    const existing = await prisma.record.findFirst({
      where: {
        objectId: contractObj.id,
        tenantId,
        data: { path: ['contract_name'], equals: c.contract_name },
      },
    });
    if (!existing) {
      await prisma.record.create({
        data: {
          tenantId,
          appId,
          objectId: contractObj.id,
          data: c as unknown as Prisma.InputJsonValue,
          createdBy: adminUserId,
        },
      });
    }
  }
  console.log(`  ✅ 合同记录: ${contracts.length} 条（覆盖大额/小额分支）`);

  // ========================================================================
  // 5. 应用发布（构造 publishedSnapshot，对齐 seed-demo 模式）
  // ========================================================================

  console.log('  📤 正在发布采购合同应用...');

  const [allObjects, allPages, allProcesses] = await Promise.all([
    prisma.objectMeta.findMany({
      where: { appId },
      include: { views: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.pageMeta.findMany({ where: { appId }, orderBy: { createdAt: 'asc' } }),
    prisma.processDef.findMany({ where: { appId }, orderBy: { createdAt: 'asc' } }),
  ]);

  const publishedAt = new Date().toISOString();
  const tenantRoles = await prisma.role.findMany({
    where: { tenantId },
    include: { permissionRules: true },
    orderBy: { createdAt: 'asc' },
  });

  const appRow = await prisma.application.findUniqueOrThrow({ where: { id: appId } });

  const snapshot = {
    meta: {
      appId,
      appName: appRow.name,
      apiName: appRow.apiName,
      version: (appRow.version ?? 0) + 1,
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

  await prisma.$transaction([
    prisma.application.update({
      where: { id: appId },
      data: {
        status: 'PUBLISHED',
        version: (appRow.version ?? 0) + 1,
        publishedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        // R1.4：环境指针优先于 publishedSnapshot（若存在）——种子回无指针基线保证幂等
        environments: {
          updateMany: { where: {}, data: { currentVersionId: null } },
        },
        publishedAt: new Date(),
      },
    }),
    prisma.pageMeta.updateMany({ where: { appId }, data: { isPublished: true } }),
    prisma.processDef.updateMany({ where: { appId }, data: { status: 'PUBLISHED' } }),
  ]);

  console.log('  ✅ 应用已发布 — publishedSnapshot 已写入');
  console.log('📦 采购合同应用内容填充完成!');
}
