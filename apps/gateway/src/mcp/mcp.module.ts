import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller.js';
import { McpService } from './mcp.service.js';
import { SchemaContractModule } from '../schema-contract/schema-contract.module.js';
import { PageModule } from '../page/page.module.js';
import { ProcessModule } from '../process/process.module.js';
import { ObjectModule } from '../object/object.module.js';
import { PermissionModule } from '../permission/permission.module.js';
import { ReviewModule } from '../review/review.module.js';
import { ApplicationModule } from '../application/application.module.js';

/**
 * MCP 模块（G4/R1.6 AI 生成接口）。
 *
 * 无状态 Streamable HTTP 端点挂在 gateway（不新增部署单元）；
 * 依赖：G3 校验合同 + R1.2 治理轨道（资源变更一律待审）+ 页面/流程/对象/应用服务。
 */
@Module({
  imports: [
    SchemaContractModule,
    PageModule,
    ProcessModule,
    ObjectModule,
    PermissionModule,
    ReviewModule,
    ApplicationModule,
  ],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}
