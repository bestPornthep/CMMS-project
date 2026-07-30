import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersController } from './users.controller';
import { ProductsController } from './products.controller';
import { AssetsController } from './assets.controller';
import { PmTasksController } from './pm-tasks.controller';
import { TemplatesController } from './templates.controller';
import { DelegationsController } from './delegations.controller';
import { AuditLogsController } from './audit-logs.controller';
import { CmmsService } from './cmms.service';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [PrismaModule, AuthModule, ScheduleModule.forRoot()],
  controllers: [
    AppController,
    UsersController,
    ProductsController,
    AssetsController,
    PmTasksController,
    TemplatesController,
    DelegationsController,
    AuditLogsController,
  ],
  providers: [AppService, CmmsService, SchedulerService],
})
export class AppModule {}
