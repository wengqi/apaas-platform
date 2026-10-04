import { Module } from '@nestjs/common';
import { ReviewController } from './review.controller.js';
import { ReviewService } from './review.service.js';
import { ReviewSnapshotService } from './review-snapshot.service.js';
import { ReviewCallbackService } from './review-callback.service.js';
import { PageModule } from '../page/page.module.js';
import { ProcessModule } from '../process/process.module.js';
import { ObjectModule } from '../object/object.module.js';
import { NotificationModule } from '../notification/notification.module.js';
import { ChangeLogModule } from '../application/changelog.module.js';
import { PermissionModule } from '../permission/permission.module.js';

/**
 * 审核模块（R1.2 版本模型 G1）。
 *
 * 资源级 草稿→提交→发布 治理轨道：AI 提交待人审（批准才落活表），
 * 人工提交即时生效基线；diff 快审（gateway 计算 + studio 渲染共用 shared 内核）。
 * ReviewCallbackService：批/驳出站 webhook（agent 闭环，替代轮询）。
 */
@Module({
  imports: [
    PageModule,
    ProcessModule,
    ObjectModule,
    NotificationModule,
    ChangeLogModule,
    PermissionModule,
  ],
  controllers: [ReviewController],
  providers: [ReviewService, ReviewSnapshotService, ReviewCallbackService],
  exports: [ReviewService],
})
export class ReviewModule {}
