/**
 * BPMN ↔ WorkflowSchema 转换器 —— 对齐 DESIGN-process.md §5。
 *
 * 轻量级实现(无第三方 BPMN 解析库依赖,基于正则/字符串解析):
 *  - workflowToBpmnXml: WorkflowSchema → BPMN 2.0 XML
 *  - bpmnXmlToWorkflow: BPMN 2.0 XML → WorkflowSchema
 *  - checkBpmnCapability: 检测 BPMn XML 中简化模式无法表达的高级元素
 *
 * 支持基础 BPMN 元素(StartEvent/EndEvent/Task/UserTask/ServiceTask/
 * ExclusiveGateway/ParallelGateway/InclusiveGateway/SubProcess/SequenceFlow)。
 * 高级元素(BoundaryEvent/EventGateway/ComplexGateway/Transaction/MessageFlow/
 * Multi-Instance)标记为 unsupported,触发只读降级。
 */

import type {
  WorkflowSchema,
  WorkflowNode,
  WorkflowEdge,
  CapabilityCheckResult,
  UnsupportedElement,
} from '@apaas/shared';

// ---------------------------------------------------------------------------
// WorkflowSchema → BPMN 2.0 XML
// ---------------------------------------------------------------------------

export interface WorkflowToBpmnResult {
  bpmnXml: string;
  warnings: string[];
}

/** BPMN 元素类型映射(aPaaS 节点 → BPMN)。 */
const NODE_TYPE_TO_BPMN: Record<string, string> = {
  start: 'bpmn:startEvent',
  end: 'bpmn:endEvent',
  trigger: 'bpmn:startEvent',
  userTask: 'bpmn:userTask',
  objectOperation: 'bpmn:serviceTask',
  httpRequest: 'bpmn:serviceTask',
  notification: 'bpmn:serviceTask',
  assign: 'bpmn:serviceTask',
  delay: 'bpmn:serviceTask',
  condition: 'bpmn:exclusiveGateway',
  parallel: 'bpmn:parallelGateway',
  inclusive: 'bpmn:inclusiveGateway',
  sub_process: 'bpmn:subProcess',
};

/** 将 WorkflowSchema 转为 BPMN 2.0 XML。 */
export function workflowToBpmnXml(schema: WorkflowSchema): WorkflowToBpmnResult {
  const warnings: string[] = [];
  const nodes = schema.nodes ?? [];
  const edges = schema.edges ?? [];
  const processKey = 'process_1';

  const shapes: string[] = [];
  const flows: string[] = [];
  const edgeShapes: string[] = [];
  /** 节点位置映射(用于计算边的 waypoint 坐标)。 */
  const nodePositions = new Map<string, { x: number; y: number; w: number; h: number }>();
  let x = 160;
  const y = 160;
  const step = 200;

  // 生成节点声明 + 图形
  const nodeDecls: string[] = [];
  for (const node of nodes) {
    const bpmnType = NODE_TYPE_TO_BPMN[node.type] ?? 'bpmn:task';
    const id = sanitizeId(node.id);
    const name = escapeXml(String(node.data?.title ?? ''));
    const isEvent = bpmnType.includes('Event');
    const w = isEvent ? 36 : 100;
    const h = isEvent ? 36 : 80;
    nodePositions.set(id, { x, y, w, h });
    nodeDecls.push(`    <${bpmnType} id="${id}" name="${name}"/>`);
    shapes.push(
      `    <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}">
      <dc:Bounds x="${x}" y="${y}" width="${w}" height="${h}"/>
    </bpmndi:BPMNShape>`,
    );
    x += step;
  }

  // 生成边声明 + 图形(使用节点位置计算 waypoint)
  for (const edge of edges) {
    const source = sanitizeId(edge.sourceNodeID);
    const target = sanitizeId(edge.targetNodeID);
    const flowId = sanitizeId(`flow_${edge.sourceNodeID}_${edge.targetNodeID}`);
    const labelAttr = edge.label ? ` name="${escapeXml(edge.label)}"` : '';
    flows.push(`    <bpmn:sequenceFlow id="${flowId}" sourceRef="${source}" targetRef="${target}"${labelAttr}/>`);

    const srcPos = nodePositions.get(source);
    const tgtPos = nodePositions.get(target);
    const sx = srcPos ? srcPos.x + srcPos.w : 0;
    const sy = srcPos ? srcPos.y + srcPos.h / 2 : 0;
    const tx = tgtPos ? tgtPos.x : 0;
    const ty = tgtPos ? tgtPos.y + tgtPos.h / 2 : 0;
    edgeShapes.push(
      `      <bpmndi:BPMNEdge id="${flowId}_di" bpmnElement="${flowId}">
        <di:waypoint x="${sx}" y="${sy}"/>
        <di:waypoint x="${tx}" y="${ty}"/>
      </bpmndi:BPMNEdge>`,
    );
  }

  const bpmnXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${processKey}" isExecutable="false">
${nodeDecls.join('\n')}
${flows.join('\n')}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processKey}">
${shapes.join('\n')}
${edgeShapes.join('\n')}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

  return { bpmnXml, warnings };
}

// ---------------------------------------------------------------------------
// BPMN 2.0 XML → WorkflowSchema
// ---------------------------------------------------------------------------

/** 将 BPMN 2.0 XML 转为 WorkflowSchema。 */
export function bpmnXmlToWorkflow(bpmnXml: string): WorkflowSchema {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  // 解析节点(正则匹配 <bpmn:xxx id="..." name="..."/>)
  const nodeRegex = /<bpmn:(startEvent|endEvent|userTask|serviceTask|scriptTask|sendTask|businessRuleTask|task|exclusiveGateway|parallelGateway|inclusiveGateway|eventGateway|complexGateway|subProcess|callActivity|intermediateThrowEvent|intermediateCatchEvent|boundaryEvent)\s+([^>]*)\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = nodeRegex.exec(bpmnXml)) !== null) {
    const bpmnType = match[1] as string;
    const attrs = match[2] as string;
    const id = extractAttr(attrs, 'id') ?? `node_${nodes.length}`;
    const name = extractAttr(attrs, 'name') ?? '';
    const nodeType = bpmnTypeToNodeType(bpmnType);
    nodes.push({
      id,
      type: nodeType,
      meta: {},
      data: { title: name || nodeType },
    });
  }

  // 解析连线 <bpmn:sequenceFlow id="..." sourceRef="..." targetRef="..." [name="..."]/>
  const flowRegex = /<bpmn:sequenceFlow\s+([^/>]*)\/?>/g;
  while ((match = flowRegex.exec(bpmnXml)) !== null) {
    const attrs = match[1] as string;
    const source = extractAttr(attrs, 'sourceRef');
    const target = extractAttr(attrs, 'targetRef');
    const label = extractAttr(attrs, 'name');
    if (source && target) {
      edges.push({
        sourceNodeID: source,
        targetNodeID: target,
        label: label,
      });
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// capability-check
// ---------------------------------------------------------------------------

/** 简化模式无法表达的高级 BPMN 元素类型。 */
const ADVANCED_BPMN_TYPES = new Set([
  'boundaryEvent',
  'eventGateway',
  'complexGateway',
  'transaction',
  'compensation',
]);

/** 检测 BPMN XML 中简化模式无法表达的元素。 */
export function checkBpmnCapability(bpmnXml: string): CapabilityCheckResult {
  const unsupportedElements: UnsupportedElement[] = [];

  // 检测高级元素
  const advancedRegex = /<bpmn:(boundaryEvent|eventGateway|complexGateway|transaction)\s+([^/>]*)\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = advancedRegex.exec(bpmnXml)) !== null) {
    const bpmnType = match[1] as string;
    const attrs = match[2] as string;
    const id = extractAttr(attrs, 'id') ?? 'unknown';
    unsupportedElements.push({
      bpmnElementType: bpmnType,
      elementId: id,
      reason: getAdvancedReason(bpmnType),
    });
  }

  // 检测消息流(跨池)
  if (/<bpmn:messageFlow\s/.test(bpmnXml)) {
    unsupportedElements.push({
      bpmnElementType: 'messageFlow',
      elementId: 'messageFlow',
      reason: '消息流(跨池)简化模式无法表达',
    });
  }

  // 检测多实例
  const multiInstanceRegex = /<bpmn:(multiInstanceLoopCharacteristics|standardLoopCharacteristics)/;
  if (multiInstanceRegex.test(bpmnXml)) {
    unsupportedElements.push({
      bpmnElementType: 'multiInstance',
      elementId: 'multiInstance',
      reason: '多实例/循环简化模式部分不支持',
    });
  }

  return {
    editable: unsupportedElements.length === 0,
    unsupportedElements,
  };
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeId(id: string): string {
  // BPMN ID 仅允许字母/数字/下划线
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function extractAttr(attrs: string, name: string): string | undefined {
  const regex = new RegExp(`${name}="([^"]*)"`);
  const m = regex.exec(attrs);
  return m ? (m[1] as string) : undefined;
}

function bpmnTypeToNodeType(bpmnType: string): string {
  switch (bpmnType) {
    case 'startEvent':
      return 'start';
    case 'endEvent':
      return 'end';
    case 'userTask':
      return 'userTask';
    case 'serviceTask':
    case 'scriptTask':
    case 'sendTask':
    case 'businessRuleTask':
    case 'task':
      return 'objectOperation';
    case 'exclusiveGateway':
      return 'condition';
    case 'parallelGateway':
      return 'parallel';
    case 'inclusiveGateway':
      return 'inclusive';
    case 'subProcess':
    case 'callActivity':
      return 'sub_process';
    default:
      return bpmnType;
  }
}

function getAdvancedReason(bpmnType: string): string {
  switch (bpmnType) {
    case 'boundaryEvent':
      return '边界事件(定时器/错误),简化模式无法表达';
    case 'eventGateway':
      return '事件网关,简化模式无法表达';
    case 'complexGateway':
      return '复杂网关,简化模式无法表达';
    case 'transaction':
      return '事务子流程,简化模式无法表达';
    default:
      return '高级 BPMN 元素,简化模式无法表达';
  }
}

/** 判断是否为高级元素(供外部使用)。 */
export function isAdvancedBpmnType(bpmnType: string): boolean {
  return ADVANCED_BPMN_TYPES.has(bpmnType);
}
