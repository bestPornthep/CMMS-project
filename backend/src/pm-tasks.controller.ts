import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CmmsService } from './cmms.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CurrentUser } from './auth/current-user.decorator';
import { CreatePmTaskDto } from './dto/create-pm-task.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('PM Tasks')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('api/v1/pm-tasks')
export class PmTasksController {
  constructor(
    private prisma: PrismaService,
    private cmms: CmmsService,
  ) {}

  @Get()
  async getAll(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('department') department?: string,
    @Query('productId') productId?: string,
    @Query('assignedTo') assignedTo?: string,
  ) {
    const where: any = {};
    if (status) where.status = status;
    if (department) where.department = department;
    if (assignedTo) where.assignedTo = assignedTo;

    if (user.baseRole !== 'admin' && user.baseRole !== 'manager') {
      const owned = user.ownedProducts || [];
      const delegated =
        user.delegatedProducts?.map((dp: any) => dp.productId) || [];
      const accessibleProducts = Array.from(new Set([...owned, ...delegated]));

      if (!accessibleProducts.includes('*')) {
        if (productId) {
          if (!accessibleProducts.includes(productId)) {
            throw new ForbiddenException(
              `Product access denied for ${productId}`,
            );
          }
          where.productId = productId;
        } else {
          where.productId = { in: accessibleProducts };
        }
      }

      if (user.baseRole === 'technician') {
        where.OR = [
          { assignedTo: user.employeeId },
          { productId: { in: delegated } },
        ];
      }
    } else {
      if (productId) where.productId = productId;
    }

    const tasks = await this.prisma.pmTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return tasks.map((t) => this.cleanPmTask(t));
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: any) {
    const t = await this.prisma.pmTask.findUnique({
      where: { id },
    });
    if (!t) {
      throw new NotFoundException(`Task ${id} not found`);
    }

    if (user.baseRole !== 'admin' && user.baseRole !== 'manager') {
      const owned = user.ownedProducts || [];
      const delegated =
        user.delegatedProducts?.map((dp: any) => dp.productId) || [];
      const accessibleProducts = Array.from(new Set([...owned, ...delegated]));

      if (
        !accessibleProducts.includes('*') &&
        !accessibleProducts.includes(t.productId)
      ) {
        throw new ForbiddenException(
          `Access denied for product ${t.productId}`,
        );
      }

      if (
        user.baseRole === 'technician' &&
        t.assignedTo !== user.employeeId &&
        !delegated.includes(t.productId)
      ) {
        throw new ForbiddenException(`Task ${id} is not assigned to you`);
      }
    }

    return this.cleanPmTask(t);
  }

  @Post()
  async create(@Body() body: CreatePmTaskDto, @CurrentUser() user: any) {
    const hasPermission =
      user.baseRole === 'admin' ||
      user.baseRole === 'manager' ||
      user.baseRole === 'engineer' ||
      user.delegatedProducts?.some(
        (dp: any) =>
          dp.productId === body.productId &&
          dp.permissions.includes('pm.create.submit'),
      );

    if (!hasPermission) {
      throw new ForbiddenException(
        'Insufficient permission to create PM tasks',
      );
    }

    await this.cmms.checkProductOwnership(
      user,
      body.productId,
      'pm.create.submit',
    );

    const asset = await this.prisma.asset.findUnique({
      where: { id: body.assetId },
    });
    if (!asset) {
      throw new BadRequestException(`Asset ${body.assetId} not found`);
    }
    if (asset.location !== body.productId) {
      throw new BadRequestException(
        `Asset location (${asset.location}) does not match product (${body.productId})`,
      );
    }
    if (asset.department !== body.department) {
      throw new BadRequestException(
        `Asset department (${asset.department}) does not match task department (${body.department})`,
      );
    }

    const task = await this.cmms.createTaskWithRetry({
      title: body.title,
      description: body.description || '',
      frequency: body.frequency,
      assetId: body.assetId,
      productId: body.productId,
      department: body.department,
      nextDueDate: new Date(body.nextDueDate),
      estimatedHours: body.estimatedHours,
      status: body.status || 'Pending',
      checklist: JSON.stringify(body.checklist || []),
      partsRequired: JSON.stringify(body.partsRequired || []),
      partsUsed: JSON.stringify(body.partsUsed || []),
      recordNotes: body.recordNotes || null,
      assignedTo: body.assignedTo || null,
      createdBy: user.employeeId,
    });

    return this.cleanPmTask(task);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    const existing = await this.prisma.pmTask.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Task ${id} not found`);
    }

    const isOwner =
      user.baseRole === 'admin' ||
      user.baseRole === 'manager' ||
      user.ownedProducts.includes('*') ||
      user.ownedProducts.includes(existing.productId);

    const hasDelegatedRecord =
      user.baseRole === 'technician' &&
      user.delegatedProducts?.some(
        (dp: any) =>
          dp.productId === existing.productId &&
          dp.permissions.includes('pm.record.submit'),
      );
    const hasDelegatedAssign =
      user.baseRole === 'technician' &&
      user.delegatedProducts?.some(
        (dp: any) =>
          dp.productId === existing.productId &&
          dp.permissions.includes('pm.assign.submit'),
      );

    const canRecord =
      user.baseRole === 'admin' ||
      user.baseRole === 'manager' ||
      user.baseRole === 'engineer' ||
      hasDelegatedRecord ||
      (user.baseRole === 'technician' &&
        existing.assignedTo === user.employeeId);

    const canAssign =
      user.baseRole === 'admin' ||
      user.baseRole === 'manager' ||
      (user.baseRole === 'engineer' && isOwner) ||
      hasDelegatedAssign;

    if (!canRecord && !canAssign) {
      throw new ForbiddenException(
        'You do not have permission to modify this task',
      );
    }

    const isApprover =
      user.baseRole === 'admin' ||
      user.baseRole === 'manager' ||
      user.baseRole === 'engineer';

    // ── Status transition guard ──────────────────────────────────────────────
    if (body.status !== undefined) {
      const from = existing.status;
      const to = body.status;
      const TECHNICIAN_ALLOWED: Record<string, string[]> = {
        Pending: ['In Progress'],
        'In Progress': ['Pending Approval'],
        'Pending Approval': [], // technicians cannot approve or revert
      };

      if (!isApprover) {
        const allowed = TECHNICIAN_ALLOWED[from] ?? [];
        if (!allowed.includes(to)) {
          throw new ForbiddenException(
            `Technicians cannot transition a task from '${from}' to '${to}'`,
          );
        }
      } else {
        // Approvers may do any transition except backwards from Done
        if (from === 'Done') {
          throw new ForbiddenException(`Cannot modify a completed task`);
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const data: any = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.frequency !== undefined) data.frequency = body.frequency;
    if (body.nextDueDate !== undefined)
      data.nextDueDate = new Date(body.nextDueDate);
    if (body.estimatedHours !== undefined)
      data.estimatedHours = body.estimatedHours;
    if (body.actualHours !== undefined) data.actualHours = body.actualHours;
    if (body.status !== undefined) data.status = body.status;
    if (body.checklist !== undefined)
      data.checklist = JSON.stringify(body.checklist);
    if (body.partsRequired !== undefined)
      data.partsRequired = JSON.stringify(body.partsRequired);
    if (body.partsUsed !== undefined)
      data.partsUsed = JSON.stringify(body.partsUsed);
    if (body.recordNotes !== undefined) data.recordNotes = body.recordNotes;

    if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo;
    if (body.assignedAt !== undefined)
      data.assignedAt = body.assignedAt ? new Date(body.assignedAt) : null;
    if (body.assignedBy !== undefined) data.assignedBy = body.assignedBy;

    if (body.completedBy !== undefined) data.completedBy = body.completedBy;
    if (body.completedAt !== undefined)
      data.completedAt = body.completedAt ? new Date(body.completedAt) : null;

    // Only approvers may write approval/rejection fields
    if (isApprover) {
      if (body.approvedBy !== undefined) data.approvedBy = body.approvedBy;
      if (body.approvedAt !== undefined)
        data.approvedAt = body.approvedAt ? new Date(body.approvedAt) : null;
      if (body.rejectedBy !== undefined) data.rejectedBy = body.rejectedBy;
      if (body.rejectedAt !== undefined)
        data.rejectedAt = body.rejectedAt ? new Date(body.rejectedAt) : null;
    }

    const updated = await this.prisma.pmTask.update({
      where: { id },
      data,
    });

    return this.cleanPmTask(updated);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentUser() user: any) {
    if (user.baseRole !== 'admin') {
      throw new ForbiddenException('Admin only');
    }
    const task = await this.prisma.pmTask.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    await this.prisma.pmTask.delete({ where: { id } });
  }

  private cleanPmTask(t: any) {
    return {
      ...t,
      checklist:
        typeof t.checklist === 'string' ? JSON.parse(t.checklist) : t.checklist,
      partsRequired:
        typeof t.partsRequired === 'string'
          ? JSON.parse(t.partsRequired)
          : t.partsRequired,
      partsUsed:
        typeof t.partsUsed === 'string' ? JSON.parse(t.partsUsed) : t.partsUsed,
    };
  }
}
