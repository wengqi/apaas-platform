/**
 * MCP Server 工厂（G4/R1.6）——为每个请求构建无状态的 MCP Server 实例。
 *
 * 工具分四类：
 * - 读：get_platform_overview / list_* / get_*（平台既有查询，租户隔离）
 * - 校验：validate_schema（G3 dry-run，agent 提交前自检）
 * - 写：create_application（容器操作，即时生效）+ submit_page_draft /
 *   submit_workflow_draft / submit_object_draft
 *   —— 资源变更一律待审提交（R1.2 治理轨道：不落活表，人工批准才生效），
 *   先过 G3 校验合同
 * - 治理：list_review_submissions（审批结果与驳回意见回传，agent 自修正闭环）
 *
 * 必填参数在 dispatch 前统一守卫（TOOLS.inputSchema.required 是唯一事实源）：
 * 缺失/空白返回结构化错误，绝不允许以空串下潜到查询层静默返回空结果。
 *
 * 方言指南以工具形式提供（get_dialect_guide）：amis 惯例/示例/陷阱清单
 * （spike 语料：nested-select 命名、static 表单 actions:[]、取数表达式等）。
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { McpService } from './mcp.service.js';

/** JSON-RPC 工具参数（MCP 层透传的松散对象）。 */
type ToolArgs = Record<string, unknown>;

/** 每工具入参的 JSON Schema（MCP 原生形态——合同即文档）。 */
const TOOLS: Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> = [
  {
    name: 'get_platform_overview',
    description:
      '获取平台概况：应用列表（含对象/页面/流程数量）与下一步操作提示。开始任何工作前先调用它定位目标应用 appId。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_dialect_guide',
    description:
      '获取平台元数据方言指南（amis 页面 / WorkflowSchema / 对象元数据的惯例、示例与陷阱清单）。生成任何 schema 之前务必阅读对应指南。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['amis_page', 'workflow', 'object_meta'] },
      },
      required: ['kind'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_objects',
    description: '列出应用下全部业务对象（含字段定义）。',
    inputSchema: {
      type: 'object',
      properties: { appId: { type: 'string', description: '应用 ID' } },
      required: ['appId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_pages',
    description: '列出应用下全部页面（id/apiName/name/type，不含 schema）。',
    inputSchema: {
      type: 'object',
      properties: { appId: { type: 'string' } },
      required: ['appId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_processes',
    description: '列出应用下全部流程定义（id/apiName/name/status/triggerType）。',
    inputSchema: {
      type: 'object',
      properties: { appId: { type: 'string' } },
      required: ['appId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_page',
    description: '获取页面详情（含完整 amis 页面 schema）。',
    inputSchema: {
      type: 'object',
      properties: { pageId: { type: 'string' } },
      required: ['pageId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_process',
    description: '获取流程定义详情（含完整 WorkflowSchema）。',
    inputSchema: {
      type: 'object',
      properties: { processId: { type: 'string' } },
      required: ['processId'],
      additionalProperties: false,
    },
  },
  {
    name: 'validate_schema',
    description:
      '校验 schema 是否满足平台合同（不落库，dry-run）。submit_*_draft 前建议先自检；issues 含路径与修正建议。',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['amis_page', 'workflow', 'object_meta'] },
        schema: { type: 'object', description: '待校验的 schema 对象' },
      },
      required: ['kind', 'schema'],
      additionalProperties: false,
    },
  },
  {
    name: 'submit_page_draft',
    description:
      '提交页面草稿（amis 方言，type 必须为 "page"）。创建新页面或更新已有页面（传 pageId）。提交进入待审队列（不直接落库），人工在审核中心 diff 快审批准后生效。',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string' },
        apiName: {
          type: 'string',
          description: '页面路径标识（snake_case，应用内唯一；更新已有页面时忽略）',
        },
        name: { type: 'string', description: '页面显示名' },
        type: {
          type: 'string',
          enum: ['list_page', 'detail_page', 'form_page', 'dashboard', 'custom'],
        },
        objectId: { type: 'string', description: '关联对象 ID（对象列表页/表单页需要）' },
        pageId: { type: 'string', description: '更新已有页面时传其 ID' },
        schema: { type: 'object', description: '完整 amis 页面 schema' },
      },
      required: ['appId', 'apiName', 'name', 'schema'],
      additionalProperties: false,
    },
  },
  {
    name: 'submit_workflow_draft',
    description:
      '提交流程定义草稿（WorkflowSchema：start/end 必需、20 种节点、user_task 审批配置）。创建新流程或更新已有流程。提交进入待审队列，人工批准后以 DRAFT 落地（激活需人工发布流程）。',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string' },
        apiName: { type: 'string', description: '流程 Key（snake_case，应用内唯一；更新时忽略）' },
        name: { type: 'string' },
        triggerType: {
          type: 'string',
          enum: [
            'MANUAL',
            'RECORD_CREATED',
            'RECORD_UPDATED',
            'RECORD_DELETED',
            'SCHEDULED',
            'WEBHOOK',
            'API',
          ],
        },
        processId: { type: 'string', description: '更新已有流程时传其 ID' },
        workflowSchema: { type: 'object', description: '完整 WorkflowSchema' },
      },
      required: ['appId', 'apiName', 'name', 'workflowSchema'],
      additionalProperties: false,
    },
  },
  {
    name: 'submit_object_draft',
    description:
      '提交对象元数据草稿（18 种字段类型；系统字段批准落地时自动保留）。创建新对象或更新已有对象的业务字段。提交进入待审队列，人工批准后字段生效。',
    inputSchema: {
      type: 'object',
      properties: {
        appId: { type: 'string' },
        apiName: { type: 'string', description: '对象标识（snake_case，应用内唯一）' },
        name: { type: 'string' },
        description: { type: 'string' },
        icon: { type: 'string', description: 'emoji 图标' },
        objectId: { type: 'string', description: '更新已有对象时传其 ID' },
        fields: {
          type: 'array',
          description: '业务字段数组（每项 {apiName,label,type,config?}）',
          items: { type: 'object' },
        },
      },
      required: ['appId', 'apiName', 'name', 'fields'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_application',
    description:
      '创建新应用并返回 appId（容器操作，即时生效不入人审——与人工在搭建器创建应用语义一致；应用内资源变更仍走 submit_*_draft 人审）。从零构建新应用时的第一步。',
    inputSchema: {
      type: 'object',
      properties: {
        apiName: {
          type: 'string',
          description: '应用标识（snake_case，租户内唯一；不传则自动生成）',
        },
        name: { type: 'string', description: '应用显示名' },
        description: { type: 'string' },
        icon: { type: 'string', description: 'emoji 图标' },
        color: { type: 'string', description: '主题色（如 #1677ff）' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_review_submissions',
    description:
      '查询提交单审批状态（R1.2 治理轨道）。submit_*_draft 后用本工具跟踪审批进度；REJECTED 单的 reviewComment 是人类驳回意见，按意见修正后重新提交。',
    inputSchema: {
      type: 'object',
      properties: { appId: { type: 'string' } },
      required: ['appId'],
      additionalProperties: false,
    },
  },
];

/** 方言指南正文（语料：spike 陷阱清单 + 种子示例要点）。 */
const DIALECT_GUIDES: Record<string, string> = {
  amis_page: [
    '## amis 页面方言指南',
    '- 一切界面皆页面：根节点必须 {"type":"page","body":[...]}；表单是 body 里的 {"type":"form"} 组件',
    '- 级联选择是 nested-select（没有 input-cascader）；树选择是 tree-select',
    '- 查看态（审批场景）：form 或字段加 "static": true，且静态表单必须显式 "actions": []（否则自动多出提交按钮）',
    '- 表格/CRUD 取数用表达式 source: "${rows}"，裸字段名取不到',
    '- 字段显隐用 visibleOn/hiddenOn 表达式（如 "this.amount > 1000000"）',
    '- 页面内 api.url 必须是平台相对路径（/api/v1/...），数据域变量可用 ${taskId} 等',
    '- 附件查看：{"type":"input-file","static":true}（static-file 类型被禁用）',
    '- 提交/按钮动作用 actionType: "ajax"/"submit"，配合 api 对象',
    '- 示例可参考：list_pages 后 get_page 获取既有合法页面照猫画虎',
  ].join('\n'),
  workflow: [
    '## WorkflowSchema 方言指南',
    '- 结构：{nodes:[...], edges:[...]}；必须有 start 与 end 节点；edges 的 sourceNodeID/targetNodeID 必须指向已定义节点（幽灵边会被拒绝）',
    '- 20 种节点：start/end/trigger/assign/condition/inclusive/parallel/loop/break/continue/wait_for_condition/delay/object_operation/batch_operation/user_task/notification/http_request/sub_process/cloud_function/block',
    '- user_task 审批配置：taskName 必填；approvalMode=single(默认,需 assignee 或 candidateGroups) / countersign(会签,需 approveUsers) / or_sign(或签) / sequential(依次)',
    '- 审批页面绑定：data.pageId 指向平台页面 ID（list_pages 获取）；绑定后任务中心渲染该页面',
    '- 驳回跳转：data.rejectToNodeId 指向流程内节点',
    '- 边条件：condition 为 JsonLogic JSON 字符串，如 \'{"==":[{"var":"decision"},"APPROVED"]}\'；金额分支如 \'{"<":[{"var":"amount"},1000000]}\'（变量域含触发记录的顶层标量字段）',
    '- 记录状态回写：object_operation 节点 inputsValues 用四态 {type:"constant"/"ref",content:...}，recordId 用 {type:"ref",content:["recordId"]}',
    '- 流程出入参：start 节点 data.inputsValues 定义入参；end 节点 inputsValues 定义出参映射',
    '- triggerType=API 的流程发布后可经开放 API（X-API-Key）触发（G6）；user_task 仍走人工审批',
  ].join('\n'),
  object_meta: [
    '## 对象元数据方言指南',
    '- 结构：{apiName(snake_case), name, fields:[{apiName,label,type,config?}]}；系统字段(创建人/时间等)自动注入，业务字段由你提供',
    '- 18 种字段类型：text/long_text/rich_text/number/currency/percent/auto_number/single_select/multi_select/date/date_time/checkbox/attachment/user/lookup/sub_form/formula/rollup',
    '- 选择类字段必须带 config.options：[{"value":"S","label":"战略"}]',
    '- 自动编号必须带 config.format：如 "PO-{seq:0000}"',
    '- 公式字段建议带 config.expression',
  ].join('\n'),
};

/** 构建 MCP Server（每请求一个实例，无状态）。 */
export function createMcpServer(mcpService: McpService, tenantId: string, userId: string): Server {
  const server = new Server(
    { name: 'apaas-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as ToolArgs;
    let payload: McpToolResultLike;
    const guard = requireParams(name, args);
    if (guard) {
      payload = guard;
    } else {
      try {
        payload = await dispatch(mcpService, tenantId, userId, name, args);
      } catch (err) {
        payload = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          hint: '调用失败——检查参数（如 appId/pageId 是否存在）后重试',
        };
      }
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  });

  return server;
}

type McpToolResultLike = Record<string, unknown>;

/**
 * 必填参数守卫：以 TOOLS.inputSchema.required 为唯一事实源，
 * 缺失/空白立即返回结构化错误（agent 可自修正），
 * 绝不让空串下潜到查询层静默返回空结果（如 submissions: [] 误导 agent）。
 * 导出供单测直接覆盖（工具合同是本模块的公共契约）。
 */
export function requireParams(name: string, args: ToolArgs): McpToolResultLike | undefined {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return {
      ok: false,
      error: `未知工具 "${name}"`,
      hint: `可用工具：${TOOLS.map((t) => t.name).join(' / ')}`,
    };
  }
  const schema = tool.inputSchema as {
    required?: string[];
    properties?: Record<string, { type?: string }>;
  };
  const missing = (schema.required ?? []).filter((key) => {
    const value = args[key];
    if (value === undefined || value === null) return true;
    return typeof value === 'string' && value.trim().length === 0;
  });
  if (missing.length > 0) {
    return {
      ok: false,
      error: `缺少必填参数：${missing.join(', ')}`,
      hint: `工具 ${name} 必须提供 ${missing.join(' / ')}，修正后重试`,
    };
  }
  return undefined;
}

/** 工具分发（必填参数已由 requireParams 统一守卫）。 */
async function dispatch(
  svc: McpService,
  tenantId: string,
  userId: string,
  name: string,
  args: ToolArgs,
): Promise<McpToolResultLike> {
  switch (name) {
    case 'get_platform_overview':
      return svc.overview(tenantId);
    case 'get_dialect_guide': {
      const kind = String(args['kind']);
      const guide = DIALECT_GUIDES[kind];
      return guide
        ? { ok: true, kind, guide }
        : { ok: false, hint: `未知 kind "${kind}"，允许：amis_page/workflow/object_meta` };
    }
    case 'list_objects':
      return svc.listObjects(tenantId, str(args['appId']));
    case 'list_pages':
      return svc.listPages(tenantId, str(args['appId']));
    case 'list_processes':
      return svc.listProcesses(tenantId, str(args['appId']));
    case 'get_page':
      return svc.getPage(tenantId, str(args['pageId']));
    case 'get_process':
      return svc.getProcess(tenantId, str(args['processId']));
    case 'validate_schema':
      return svc.validateSchema(tenantId, str(args['kind']) as 'amis_page', args['schema']);
    case 'submit_page_draft':
      return svc.submitPageDraft(tenantId, userId, {
        appId: str(args['appId']),
        apiName: str(args['apiName']),
        name: str(args['name']),
        schema: args['schema'],
        type: optionalStr(args['type']),
        objectId: optionalStr(args['objectId']),
        pageId: optionalStr(args['pageId']),
      });
    case 'submit_workflow_draft':
      return svc.submitWorkflowDraft(tenantId, userId, {
        appId: str(args['appId']),
        apiName: str(args['apiName']),
        name: str(args['name']),
        workflowSchema: args['workflowSchema'],
        triggerType: optionalStr(args['triggerType']) as 'MANUAL' | undefined,
        processId: optionalStr(args['processId']),
      });
    case 'submit_object_draft':
      return svc.submitObjectDraft(tenantId, userId, {
        appId: str(args['appId']),
        apiName: str(args['apiName']),
        name: str(args['name']),
        fields: Array.isArray(args['fields'])
          ? (args['fields'] as Array<Record<string, unknown>>)
          : [],
        description: optionalStr(args['description']),
        icon: optionalStr(args['icon']),
        objectId: optionalStr(args['objectId']),
      });
    case 'create_application':
      return svc.createApplication(tenantId, userId, {
        apiName: optionalStr(args['apiName']),
        name: str(args['name']),
        description: optionalStr(args['description']),
        icon: optionalStr(args['icon']),
        color: optionalStr(args['color']),
      });
    case 'list_review_submissions':
      return svc.listReviewSubmissions(tenantId, str(args['appId']));
    default:
      return { ok: false, hint: `未知工具 "${name}"` };
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function optionalStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
