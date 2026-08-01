/**
 * 标准模式编辑器(bpmn-js) —— 对齐 DESIGN-process.md §4。
 *
 * 三栏布局 + 底部 XML 视图:
 *  - 左栏(200px): bpmn-js 原生 palette
 *  - 中栏: bpmn-js 画布(Modeler)
 *  - 右栏(320px): 属性面板(简易:选中元素属性)
 *  - 底部: XML 视图切换
 *
 * bpmn-js 通过 bpmn-js/lib/Modeler.js 导入(自带类型声明)。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Input, Segmented, Space, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import BpmnModeler from 'bpmn-js/lib/Modeler.js';
import type { WorkflowSchema } from '@apaas/shared';
import { workflowToBpmnXml, bpmnXmlToWorkflow } from '../../utils/bpmnConverter.js';

import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';

const { Text, Paragraph } = Typography;

export interface StandardEditorProps {
  /** 初始 BPMN XML */
  initialBpmnXml?: string;
  /** 初始 WorkflowSchema(无 BPMN XML 时从 schema 转换) */
  initialSchema?: WorkflowSchema;
  /** XML 变化回调 */
  onBpmnChange?: (bpmnXml: string) => void;
  /** Schema 变化回调(从 XML 转换) */
  onSchemaChange?: (schema: WorkflowSchema) => void;
}

/** bpmn-js modeler 的类型(放宽,因 ServiceMap 默认 null)。 */
type BpmnModelerInstance = BpmnModeler;

export default function StandardEditor({
  initialBpmnXml,
  initialSchema,
  onBpmnChange,
  onSchemaChange,
}: StandardEditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModelerInstance | null>(null);
  const [selectedElement, setSelectedElement] = useState<{
    id: string;
    type: string;
    name: string;
  } | null>(null);
  const [viewMode, setViewMode] = useState<'diagram' | 'xml'>('diagram');
  const [xmlContent, setXmlContent] = useState<string>('');

  /** 初始 BPMN XML。 */
  const initialXml = useMemo(() => {
    if (initialBpmnXml) return initialBpmnXml;
    if (initialSchema) return workflowToBpmnXml(initialSchema).bpmnXml;
    return '<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">\n  <bpmn:process id="Process_1" isExecutable="false">\n    <bpmn:startEvent id="StartEvent_1" name="开始"/>\n    <bpmn:endEvent id="EndEvent_1" name="结束"/>\n    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="EndEvent_1"/>\n  </bpmn:process>\n</bpmn:definitions>';
  }, [initialBpmnXml, initialSchema]);

  /** 初始化 bpmn-js Modeler。 */
  useEffect(() => {
    if (!canvasRef.current) return;

    const modeler = new BpmnModeler({
      container: canvasRef.current,
    }) as BpmnModelerInstance;
    modelerRef.current = modeler;

    /** 导入 XML。 */
    const importXml = async () => {
      try {
        await modeler.importXML(initialXml);
        // 缩放适应视区(modeler.get 返回 unknown,需断言)
        const canvas = modeler.get('canvas') as {
          zoom: (z: string | number, center?: unknown) => void;
        };
        canvas.zoom('fit-viewport');
        setXmlContent(initialXml);
      } catch (err) {
        console.error('[aPaaS] BPMN 导入失败:', err);
      }
    };
    void importXml();

    /** 监听选中元素变化 + 命令栈变更(通过 eventBus 统一注册)。 */
    const eventBus = modeler.get('eventBus') as {
      on: (event: string, cb: (e?: { element?: { id: string; type: string; businessObject?: { name?: string } } }) => void) => void;
    };
    eventBus.on('selection.changed', (e) => {
      const element = e?.element;
      if (element) {
        setSelectedElement({
          id: element.id,
          type: element.type,
          name: element.businessObject?.name ?? '',
        });
      } else {
        setSelectedElement(null);
      }
    });

    /** 监听变更(命令栈变化时导出 XML,通过 eventBus 注册)。 */
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    eventBus.on('commandStack.changed', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void exportXml(modeler);
      }, 800);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      modeler.destroy();
      modelerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialXml]);

  /** 导出当前 BPMN XML + 转换 WorkflowSchema。 */
  const exportXml = async (modeler: BpmnModelerInstance) => {
    try {
      const result = await modeler.saveXML({ format: true });
      const xml = (result as { xml: string }).xml;
      setXmlContent(xml);
      onBpmnChange?.(xml);
      const schema = bpmnXmlToWorkflow(xml);
      onSchemaChange?.(schema);
    } catch (err) {
      console.error('[aPaaS] BPMN 导出失败:', err);
    }
  };

  /** 复制 XML。 */
  const handleCopyXml = () => {
    if (xmlContent) {
      void navigator.clipboard.writeText(xmlContent);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#f5f7fa' }}>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 左栏:palette(bpmn-js 原生,渲染在画布容器内) */}
        {/* 中栏:画布 */}
        <div style={{ flex: 1, position: 'relative', minHeight: 0, background: '#fff' }}>
          <div ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        </div>
        {/* 右栏:属性面板(简易) */}
        <PropertiesPanel selectedElement={selectedElement} />
      </div>
      {/* 底部 XML 视图切换 */}
      <div
        style={{
          height: viewMode === 'xml' ? 240 : 40,
          flexShrink: 0,
          borderTop: '1px solid #eef0f4',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          transition: 'height 0.2s ease',
        }}
      >
        <div
          style={{
            padding: '6px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: viewMode === 'xml' ? '1px solid #eef0f4' : 'none',
          }}
        >
          <Segmented
            size="small"
            options={[
              { label: '图形视图', value: 'diagram' },
              { label: 'XML 视图', value: 'xml' },
            ]}
            value={viewMode}
            onChange={(v) => setViewMode(v as 'diagram' | 'xml')}
          />
          {viewMode === 'xml' && (
            <Button size="small" type="text" icon={<CopyOutlined />} onClick={handleCopyXml}>
              复制
            </Button>
          )}
        </div>
        {viewMode === 'xml' && (
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
            <pre
              style={{
                margin: 0,
                fontSize: 12,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: 'rgba(0,0,0,0.85)',
              }}
            >
              {xmlContent || '(无 XML 内容)'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 属性面板(简易:展示选中元素的 ID/类型/名称)
// ---------------------------------------------------------------------------

function PropertiesPanel({
  selectedElement,
}: {
  selectedElement: { id: string; type: string; name: string } | null;
}) {
  if (!selectedElement) {
    return (
      <div
        style={{
          width: 320,
          flexShrink: 0,
          height: '100%',
          background: '#fff',
          borderLeft: '1px solid #eef0f4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="选中一个元素以查看属性"
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: 320,
        flexShrink: 0,
        height: '100%',
        background: '#fff',
        borderLeft: '1px solid #eef0f4',
        overflow: 'auto',
        padding: 16,
      }}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            General
          </Text>
          <div style={{ marginTop: 8 }}>
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                ID
              </Text>
              <Input size="small" value={selectedElement.id} readOnly style={{ marginTop: 2 }} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                类型
              </Text>
              <Input
                size="small"
                value={selectedElement.type}
                readOnly
                style={{ marginTop: 2 }}
              />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                名称
              </Text>
              <Input
                size="small"
                value={selectedElement.name}
                readOnly
                style={{ marginTop: 2 }}
              />
            </div>
          </div>
        </div>
        <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
          完整 BPMN 属性面板(bpmn-js-properties-panel)可通过扩展属性 Provider
          注入 aPaaS 业务属性(approvalMode/assigneeType 等),Phase 3 后期补全。
        </Paragraph>
      </Space>
    </div>
  );
}
