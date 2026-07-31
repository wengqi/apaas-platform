import { Card, Typography } from 'antd';
import { CheckSquareOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

export default function TaskCenter() {
  return (
    <Card>
      <Title level={4}>
        <CheckSquareOutlined /> 任务中心
      </Title>
      <Paragraph type="secondary">流程待办任务 — 当前用户的待审批/待处理任务列表</Paragraph>
      <Text type="warning">Phase 3 待实现:流程待办任务接入</Text>
    </Card>
  );
}
