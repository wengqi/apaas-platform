/**
 * 模式切换组件 —— 对齐 DESIGN-process.md §5。
 *
 * 一键切换简化↔标准模式。切换前执行 capability-check:
 *  - 简化→标准: 调用 workflowToBpmn 转换(无损),加载 bpmn-js
 *  - 标准→简化: 解析 BPMN XML→WorkflowSchema,capability-check 判定可编辑/只读
 *  - 含高级 BPMN 元素: 弹确认框,进入只读简化模式
 *
 * 切换前保存当前模式数据。
 */

import { useMemo, useState } from 'react';
import { Modal, Segmented, message, Alert, List, Tag, Typography } from 'antd';
import type { WorkflowSchema, CapabilityCheckResult, UnsupportedElement } from '@apaas/shared';
import type { EditorMode } from '../../constants/process.js';
import { workflowToBpmnXml, bpmnXmlToWorkflow, checkBpmnCapability } from '../../utils/bpmnConverter.js';

const { Text } = Typography;

export interface ModeSwitcherProps {
  /** 当前模式 */
  mode: EditorMode;
  /** 切换模式回调(父组件执行实际加载) */
  onSwitch: (mode: EditorMode, payload: ModeSwitchPayload) => void;
  /** 禁用 */
  disabled?: boolean;
}

export interface ModeSwitchPayload {
  /** 简化→标准: 转换出的 BPMN XML */
  bpmnXml?: string;
  /** 标准→简化: 转换出的 WorkflowSchema */
  schema?: WorkflowSchema;
  /** 标准→简化: 能力检测结果 */
  capability?: CapabilityCheckResult;
  /** 是否只读降级 */
  readonly?: boolean;
}

export default function ModeSwitcher({ mode, onSwitch, disabled = false }: ModeSwitcherProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingCapability, setPendingCapability] = useState<CapabilityCheckResult | null>(null);
  const [pendingSchema, setPendingSchema] = useState<WorkflowSchema | null>(null);

  const options = useMemo(
    () => [
      { label: '简化', value: 'simplified' as EditorMode },
      { label: '标准', value: 'standard' as EditorMode },
    ],
    [],
  );

  /** 切换请求入口。 */
  const handleSwitch = (target: EditorMode) => {
    if (target === mode) return;
    // 父组件需先保存当前模式数据(由 onSwitch 触发前的钩子处理)
    // 这里仅负责转换 + capability-check
    if (target === 'standard') {
      // 简化→标准:需要父组件提供当前 schema,这里通过自定义事件桥接
      // 实际转换在父组件调用 switchToStandard 完成;此处仅触发
      onSwitch('standard', {});
    } else {
      // 标准→简化:父组件提供当前 bpmnXml,这里转换 + check
      onSwitch('simplified', {});
    }
  };

  /**
   * 标准→简化:执行 BPMN→WorkflowSchema 转换 + capability-check。
   * 由父组件在拿到 bpmnXml 后调用此方法。
   */
  const performStandardToSimplified = (bpmnXml: string) => {
    const schema = bpmnXmlToWorkflow(bpmnXml);
    const capability = checkBpmnCapability(bpmnXml);
    if (!capability.editable) {
      // 含高级元素:弹确认框
      setPendingCapability(capability);
      setPendingSchema(schema);
      setModalOpen(true);
    } else {
      // 无高级元素:直接切换
      onSwitch('simplified', { schema, capability, readonly: false });
      message.success('已切换到简化模式');
    }
  };

  /**
   * 简化→标准:执行 WorkflowSchema→BPMN XML 转换。
   * 由父组件在拿到 schema 后调用此方法。
   */
  const performSimplifiedToStandard = (schema: WorkflowSchema) => {
    const { bpmnXml, warnings } = workflowToBpmnXml(schema);
    onSwitch('standard', { bpmnXml });
    if (warnings.length > 0) {
      message.warning(`已切换到标准模式,${warnings.length} 项提示`);
    } else {
      message.success('已切换到标准模式');
    }
  };

  // 暴露转换方法给父组件(通过 ref 或 props callback 模式)
  // 这里采用将方法挂到 window 的简易桥接(父组件通过 onSwitch 协调)
  // 实际生产中应使用 forwardRef + useImperativeHandle
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__apaasModeSwitch = {
      performStandardToSimplified,
      performSimplifiedToStandard,
    };
  }

  const handleConfirmReadonly = () => {
    if (pendingSchema && pendingCapability) {
      onSwitch('simplified', {
        schema: pendingSchema,
        capability: pendingCapability,
        readonly: true,
      });
      message.warning('已以只读模式查看,高级元素折叠为占位标记');
    }
    setModalOpen(false);
    setPendingCapability(null);
    setPendingSchema(null);
  };

  const handleCancelSwitch = () => {
    setModalOpen(false);
    setPendingCapability(null);
    setPendingSchema(null);
  };

  return (
    <>
      <Segmented
        size="small"
        options={options}
        value={mode}
        onChange={(val) => handleSwitch(val as EditorMode)}
        disabled={disabled}
      />
      <Modal
        title="切换到简化模式"
        open={modalOpen}
        width={480}
        onCancel={handleCancelSwitch}
        onOk={handleConfirmReadonly}
        okText="以只读模式查看"
        cancelText="取消"
      >
        {pendingCapability && (
          <>
            <Alert
              type="warning"
              showIcon
              message="当前流程包含简化模式无法完整表达的高级 BPMN 元素"
              style={{ marginBottom: 16 }}
            />
            <Text type="secondary">
              检测到 {pendingCapability.unsupportedElements.length} 个高级元素:
            </Text>
            <List
              size="small"
              dataSource={pendingCapability.unsupportedElements}
              style={{ marginTop: 8 }}
              renderItem={(item: UnsupportedElement) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<Tag color="orange">{item.bpmnElementType}</Tag>}
                    title={item.elementId}
                    description={item.reason}
                  />
                </List.Item>
              )}
            />
            <Text type="secondary" style={{ display: 'block', marginTop: 16, fontSize: 12 }}>
              切换后将以只读模式显示,这些元素折叠为占位标记,不可编辑。
              如需编辑,请返回标准模式。
            </Text>
          </>
        )}
      </Modal>
    </>
  );
}
