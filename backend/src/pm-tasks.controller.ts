import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, ForbiddenException, BadRequestException, NotFoundException, HttpCode, HttpStatus } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CmmsService } from './cmms.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CurrentUser } from './auth/current-user.decorator';
import { CreatePmTaskDto } from './dto/create-pm-task.dto';

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
    @Query('excludeStatus') excludeStatus?: string,
    @Query('department') department?: string,
    @Query('productId') productId?: string,
    @Query('assignedTo') assignedTo?: string,
  ) {
    const where: any = {};
    if (status) where.status = status;
    if (excludeStatus) where.status = { not: excludeStatus };
    if (department) where.department = department;
    if (assignedTo) where.assignedTo = assignedTo;

    if (user.baseRole !== 'admin' && user.baseRole !== 'manager') {
      const owned = user.ownedProducts || [];
      const delegated = user.delegatedProducts?.map((dp: any) => dp.productId) || [];
      const accessibleProducts = Array.from(new Set([...owned, ...delegated]));

      if (user.baseRole === 'technician') {
        // Technicians never own products — access is governed solely by
        // assignment or delegation, not by ownedProducts/accessibleProducts.
        // (Applying the product-ownership filter here would AND an empty/
        // partial productId list with this OR clause, silently hiding every
        // task assigned to the technician outside that product set.)
        where.OR = [
          { assignedTo: user.employeeId },
          { productId: { in: delegated } },
        ];
        if (productId) where.productId = productId;
      } else if (!accessibleProducts.includes('*')) {
        if (productId) {
          if (!accessibleProducts.includes(productId)) {
            throw new ForbiddenException(`Product access denied for ${productId}`);
          }
          where.productId = productId;
        } else {
          where.productId = { in: accessibleProducts };
        }
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
      const delegated = user.delegatedProducts?.map((dp: any) => dp.productId) || [];
      const accessibleProducts = Array.from(new Set([...owned, ...delegated]));

      if (user.baseRole === 'technician') {
        if (t.assignedTo !== user.employeeId && !delegated.includes(t.productId)) {
          throw new ForbiddenException(`Task ${id} is not assigned to you`);
        }
      } else if (!accessibleProducts.includes('*') && !accessibleProducts.includes(t.productId)) {
        throw new ForbiddenException(`Access denied for product ${t.productId}`);
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
      user.delegatedProducts?.some((dp: any) => dp.productId === body.productId && dp.permissions.includes('pm.create.submit'));

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permission to create PM tasks');
    }

    await this.cmms.checkProductOwnership(user, body.productId, 'pm.create.submit');

    const asset = await this.prisma.asset.findUnique({
      where: { id: body.assetId },
    });
    if (!asset) {
      throw new BadRequestException(`Asset ${body.assetId} not found`);
    }
    if (asset.location !== body.productId) {
      throw new BadRequestException(`Asset location (${asset.location}) does not match product (${body.productId})`);
    }
    if (asset.department !== body.department) {
      throw new BadRequestException(`Asset department (${asset.department}) does not match task department (${body.department})`);
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
      scheduleId: body.scheduleId || null,
    });

    return this.cleanPmTask(task);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
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

    const hasDelegatedRecord = user.baseRole === 'technician' && user.delegatedProducts?.some((dp: any) => dp.productId === existing.productId && dp.permissions.includes('pm.record.submit'));
    const hasDelegatedAssign = user.baseRole === 'technician' && user.delegatedProducts?.some((dp: any) => dp.productId === existing.productId && dp.permissions.includes('pm.assign.submit'));

    const canRecord =
      user.baseRole === 'admin' ||
      user.baseRole === 'manager' ||
      (user.baseRole === 'engineer' && isOwner) ||
      hasDelegatedRecord ||
      (user.baseRole === 'technician' && existing.assignedTo === user.employeeId);

    const canAssign =
      user.baseRole === 'admin' ||
      user.baseRole === 'manager' ||
      (user.baseRole === 'engineer' && isOwner) ||
      hasDelegatedAssign;

    if (!canRecord && !canAssign) {
      throw new ForbiddenException('You do not have permission to modify this task');
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
        'Pending':            ['In Progress'],
        'In Progress':        ['Pending Approval'],
        'Pending Approval':   [],   // technicians cannot approve or revert
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
    if (body.nextDueDate !== undefined) data.nextDueDate = new Date(body.nextDueDate);
    if (body.estimatedHours !== undefined) data.estimatedHours = body.estimatedHours;
    if (body.actualHours !== undefined) data.actualHours = body.actualHours;
    if (body.status !== undefined) data.status = body.status;
    if (body.checklist !== undefined) data.checklist = JSON.stringify(body.checklist);
    if (body.partsRequired !== undefined) data.partsRequired = JSON.stringify(body.partsRequired);
    if (body.partsUsed !== undefined) data.partsUsed = JSON.stringify(body.partsUsed);
    if (body.recordNotes !== undefined) data.recordNotes = body.recordNotes;
    if (body.scheduleId !== undefined) data.scheduleId = body.scheduleId;

    if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo;
    if (body.assignedAt !== undefined) data.assignedAt = body.assignedAt ? new Date(body.assignedAt) : null;
    if (body.assignedBy !== undefined) data.assignedBy = body.assignedBy;

    if (body.completedBy !== undefined) data.completedBy = body.completedBy;
    if (body.completedAt !== undefined) data.completedAt = body.completedAt ? new Date(body.completedAt) : null;

    // Only approvers may write approval/rejection fields
    if (isApprover) {
      if (body.approvedBy !== undefined) data.approvedBy = body.approvedBy;
      if (body.approvedAt !== undefined) data.approvedAt = body.approvedAt ? new Date(body.approvedAt) : null;
      if (body.rejectedBy !== undefined) data.rejectedBy = body.rejectedBy;
      if (body.rejectedAt !== undefined) data.rejectedAt = body.rejectedAt ? new Date(body.rejectedAt) : null;
    }

    const updated = await this.prisma.pmTask.update({
      where: { id },
      data,
    });

    // Assigning a recurring occurrence assigns the whole series: persist to
    // the parent schedule so future generated occurrences inherit it, and
    // backfill not-yet-started siblings already sitting in the buffer.
    if (body.assignedTo && existing.scheduleId) {
      await this.prisma.pmSchedule.update({
        where: { id: existing.scheduleId },
        data: { assignedTo: body.assignedTo },
      });

      await this.prisma.pmTask.updateMany({
        where: {
          scheduleId: existing.scheduleId,
          id: { not: id },
          status: { in: ['Pending', 'Overdue'] },
        },
        data: { assignedTo: body.assignedTo },
      });
    }

    // Rolling due dates: every time a task in a recurring series is approved,
    // re-anchor the remaining Pending siblings' due dates off the actual
    // approval time instead of their original fixed calendar dates. Repeats
    // on every approval, indefinitely — independent of the reassign cascade.
    const approvedAt = updated.approvedAt;
    const isApproving = body.status === 'Done' && !!approvedAt && existing.status !== 'Done';
    if (isApproving && approvedAt) {
      const seriesWhere = existing.scheduleId
        ? { scheduleId: existing.scheduleId, status: 'Pending' }
        : this.cmms.extractSeriesIdFromDescription(existing.description)
          ? { description: { contains: `[SeriesID: ${this.cmms.extractSeriesIdFromDescription(existing.description)}]` }, status: 'Pending' }
          : null;

      if (seriesWhere) {
        const pendingSiblings = await this.prisma.pmTask.findMany({
          where: seriesWhere,
          orderBy: { nextDueDate: 'asc' },
        });

        if (pendingSiblings.length > 0) {
          const newDates = this.cmms.calculateDatesFromAnchor(existing.frequency, approvedAt, pendingSiblings.length);
          await this.prisma.$transaction(
            pendingSiblings.map((sibling, i) =>
              this.prisma.pmTask.update({ where: { id: sibling.id }, data: { nextDueDate: newDates[i] } }),
            ),
          );
        }
      }
    }

    return this.cleanPmTask(updated);
  }

  @Put(':id/reassign')
  async reassign(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    if (!body.assignedTo) {
      throw new BadRequestException('assignedTo is required');
    }

    const existing = await this.prisma.pmTask.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Task ${id} not found`);
    }

    // Same canAssign computation as the generic update() handler.
    const isOwner =
      user.baseRole === 'admin' ||
      user.baseRole === 'manager' ||
      user.ownedProducts.includes('*') ||
      user.ownedProducts.includes(existing.productId);

    const hasDelegatedAssign = user.baseRole === 'technician' && user.delegatedProducts?.some((dp: any) => dp.productId === existing.productId && dp.permissions.includes('pm.assign.submit'));

    const canAssign =
      user.baseRole === 'admin' ||
      user.baseRole === 'manager' ||
      (user.baseRole === 'engineer' && isOwner) ||
      hasDelegatedAssign;

    if (!canAssign) {
      throw new ForbiddenException('You do not have permission to reassign this task');
    }

    if (existing.status === 'Done') {
      throw new ForbiddenException('Cannot modify a completed task');
    }
    if (!['In Progress', 'Overdue'].includes(existing.status)) {
      throw new ForbiddenException(`Cannot reassign a task in '${existing.status}' status`);
    }
    if (body.assignedTo === existing.assignedTo) {
      throw new BadRequestException('Task is already assigned to this technician');
    }

    const oldAssignedTo = existing.assignedTo;

    // Cascade to every other still-Pending occurrence in the same series
    // (falls back to the legacy [SeriesID: xxx] description marker for
    // series created before PmSchedule rows existed); standalone tasks have
    // no series to cascade to.
    const legacySeriesId = this.cmms.extractSeriesIdFromDescription(existing.description);
    const seriesWhere = existing.scheduleId
      ? { scheduleId: existing.scheduleId, status: 'Pending', id: { not: existing.id } }
      : legacySeriesId
        ? { description: { contains: `[SeriesID: ${legacySeriesId}]` }, status: 'Pending', id: { not: existing.id } }
        : null;

    const [updatedPrimary, cascadeCount] = await this.prisma.$transaction(async (tx) => {
      const primary = await tx.pmTask.update({
        where: { id: existing.id },
        data: {
          assignedTo: body.assignedTo,
          assignedAt: new Date(),
          assignedBy: user.employeeId,
          reassignCount: { increment: 1 },
        },
      });

      const cascade = seriesWhere
        ? await tx.pmTask.updateMany({
            where: seriesWhere,
            data: { assignedTo: body.assignedTo, assignedBy: user.employeeId, reassignCount: { increment: 1 } },
          })
        : { count: 0 };

      if (existing.scheduleId) {
        await tx.pmSchedule.update({ where: { id: existing.scheduleId }, data: { assignedTo: body.assignedTo } }).catch(() => {});
      }

      return [primary, cascade.count];
    });

    const [oldTech, newTech] = await Promise.all([
      oldAssignedTo ? this.prisma.user.findUnique({ where: { employeeId: oldAssignedTo } }) : null,
      this.prisma.user.findUnique({ where: { employeeId: body.assignedTo } }),
    ]);

    await this.cmms.logAction(
      `Reassigned ${existing.id}${cascadeCount > 0 ? ` + ${cascadeCount} future occurrence(s)` : ''} from ${oldTech?.name ?? oldAssignedTo ?? 'Unassigned'} to ${newTech?.name ?? body.assignedTo}`,
      { id: user.employeeId, name: user.name },
      { id: existing.id, name: existing.title, isUser: false },
      existing.productId,
      'data',
      existing.department,
    );

    return this.cleanPmTask(updatedPrimary);
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
      checklist: typeof t.checklist === 'string' ? JSON.parse(t.checklist) : t.checklist,
      partsRequired: typeof t.partsRequired === 'string' ? JSON.parse(t.partsRequired) : t.partsRequired,
      partsUsed: typeof t.partsUsed === 'string' ? JSON.parse(t.partsUsed) : t.partsUsed,
    };
  }

  // ── Scheduling ───────────────────────────────────────────────────────────
  // NOTE: This is the only schedule-creation/update path the frontend actually
  // calls (`ApiService.createSchedule()` / `updateSchedule()` → POST/PUT here).
  // A separate `PmSchedulesController` existed at /api/v1/pm-schedules with a
  // proper `PmSchedule`-row-backed implementation, but the frontend never
  // called it — meaning `SchedulerService.topUpSchedules()` (which only tops
  // up schedules that have a `PmSchedule` row) could never see schedules
  // created here. Fixed by creating a real `PmSchedule` row below, in addition
  // to keeping the legacy `[SeriesID: xxx]` text marker in `description` that
  // the frontend still parses to group/display series (see
  // `layout.component.ts`, `pm-assign.component.ts`, `pm-calendar.component.ts`).

  @Post('schedule')
  async createSchedule(@Body() body: any, @CurrentUser() user: any) {
    const hasPermission =
      user.baseRole === 'admin' ||
      user.baseRole === 'manager' ||
      user.baseRole === 'engineer' ||
      user.delegatedProducts?.some((dp: any) => dp.productId === body.productId && dp.permissions.includes('pm.create.submit'));

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permission to create PM schedules');
    }

    await this.cmms.checkProductOwnership(user, body.productId, 'pm.create.submit');

    const seriesId = `SCH-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const startDate = body.startDate ? new Date(body.startDate) : new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDate < today) {
      throw new BadRequestException('Start date cannot be in the past');
    }

    // First occurrence lands exactly on the user-chosen start date; every
    // later occurrence is startDate + N×frequency via the existing helper.
    const dates = [startDate, ...this.cmms.calculateDates(body.frequency, startDate)];

    // Persist a real PmSchedule row (id = seriesId) so the nightly
    // topUpSchedules() cron can keep generating future tasks for this series
    // beyond the initial ~1 year batch created below.
    await this.prisma.pmSchedule.create({
      data: {
        id: seriesId,
        title: body.title,
        description: body.description || null,
        frequency: body.frequency,
        assetId: body.assetId,
        productId: body.productId,
        department: body.department,
        estimatedHours: body.estimatedHours,
        checklist: JSON.stringify(body.checklist || []),
        partsRequired: JSON.stringify(body.partsRequired || []),
        assignedTo: body.assignedTo || null,
        createdBy: user.employeeId,
      },
    });

    // We can't easily use createMany because each task needs a unique `PM-FAC-XXXX` ID.
    // Instead we'll loop in the backend, but it's much faster and safer than frontend HTTP loops.
    // In a real prod environment we'd use a DB sequence for the ID to do bulk inserts.
    const createdTasks = [];
    for (const date of dates) {
      const task = await this.cmms.createTaskWithRetry({
        title: body.title,
        description: `[SeriesID: ${seriesId}]\n${body.description || ''}`,
        frequency: body.frequency,
        assetId: body.assetId,
        productId: body.productId,
        department: body.department,
        nextDueDate: date,
        estimatedHours: body.estimatedHours,
        status: 'Pending',
        checklist: JSON.stringify(body.checklist || []),
        partsRequired: JSON.stringify(body.partsRequired || []),
        partsUsed: '[]',
        assignedTo: body.assignedTo || null,
        createdBy: user.employeeId,
        scheduleId: seriesId,
      });
      createdTasks.push(task);
    }
    
    return createdTasks.map(t => this.cleanPmTask(t));
  }

  @Put('schedule/:seriesId')
  async updateSchedule(@Param('seriesId') seriesId: string, @Body() body: any, @CurrentUser() user: any) {
    const schedule = await this.prisma.pmSchedule.findUnique({ where: { id: seriesId } });

    if (schedule) {
      // Proper path: a PmSchedule row exists (series created after this fix).
      const isOwner =
        user.baseRole === 'admin' ||
        user.baseRole === 'manager' ||
        user.ownedProducts.includes('*') ||
        user.ownedProducts.includes(schedule.productId);

      if (user.baseRole === 'engineer' && !isOwner) {
        throw new ForbiddenException('You do not own the product for this schedule.');
      }

      const scheduleData: any = {};
      if (body.title !== undefined) scheduleData.title = body.title;
      if (body.description !== undefined) scheduleData.description = body.description;
      if (body.checklist !== undefined) scheduleData.checklist = JSON.stringify(body.checklist);
      if (body.partsRequired !== undefined) scheduleData.partsRequired = JSON.stringify(body.partsRequired);
      if (body.assignedTo !== undefined) scheduleData.assignedTo = body.assignedTo;
      if (Object.keys(scheduleData).length > 0) {
        await this.prisma.pmSchedule.update({ where: { id: seriesId }, data: scheduleData });
      }

      const tasks = await this.prisma.pmTask.findMany({
        where: { scheduleId: seriesId, status: 'Pending' },
      });
      return this.applyScheduleUpdatesToTasks(tasks, seriesId, body);
    }

    // Legacy fallback: schedules created before this fix have no PmSchedule
    // row. Preserve the old description-substring-search behavior so those
    // existing series remain editable (not retroactively migrated).
    const tasks = await this.prisma.pmTask.findMany({
      where: {
        status: 'Pending',
        description: { contains: `[SeriesID: ${seriesId}]` },
      },
    });

    if (tasks.length === 0) return [];

    const isOwner =
      user.baseRole === 'admin' ||
      user.baseRole === 'manager' ||
      user.ownedProducts.includes('*') ||
      user.ownedProducts.includes(tasks[0].productId);

    if (user.baseRole === 'engineer' && !isOwner) {
      throw new ForbiddenException('You do not own the product for this schedule.');
    }

    return this.applyScheduleUpdatesToTasks(tasks, seriesId, body);
  }

  private async applyScheduleUpdatesToTasks(tasks: any[], seriesId: string, body: any) {
    const updatedTasks = [];
    for (const task of tasks) {
      const data: any = {};
      if (body.title !== undefined) data.title = body.title;
      if (body.description !== undefined) data.description = `[SeriesID: ${seriesId}]\n${body.description}`;
      if (body.checklist !== undefined) data.checklist = JSON.stringify(body.checklist);
      if (body.partsRequired !== undefined) data.partsRequired = JSON.stringify(body.partsRequired);
      if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo;

      const updated = await this.prisma.pmTask.update({
        where: { id: task.id },
        data,
      });
      updatedTasks.push(updated);
    }

    return updatedTasks.map(t => this.cleanPmTask(t));
  }
}
