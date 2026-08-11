-- DropBpmnXml
-- 流程引擎单模式化：移除 BPMN XML 字段（已决策不实现双模式/BPMN 互操作）

ALTER TABLE "process_definitions" DROP COLUMN "bpmn_xml";
