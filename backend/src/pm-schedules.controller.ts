import { Controller, Post, Put, Delete, Param, Body, UseGuards, ForbiddenException, NotFoundException, HttpCode, HttpStatus } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CmmsService } from './cmms.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CurrentUser } from './auth/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/pm-schedules')
export class PmSchedulesController {
  constructor(
    private prisma: PrismaService,
    private cmms: CmmsService,
  ) {}

  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    const hasPermission =
      user.baseRole === 'admin' ||
      user.baseRole === 'manager' ||
      user.baseRole === 'engineer' ||
      user.delegatedProducts?.some((dp: any) => dp.productId === body.productId && dp.permissions.includes('pm.create.submit'));

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permission to create PM schedules');
    }

    await this.cmms.checkProductOwnership(user, body.productId, 'pm.create.submit');

    const scheduleId = `SCH-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const dates = this.cmms.calculateDates(body.frequency, body.startDate ? new Date(body.startDate) : undefined);

    const schedule = await this.prisma.pmSchedule.create({
      data: {
        id: scheduleId,
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

    const createdTasks = [];
    for (const date of dates) {
      const task = await this.cmms.createTaskWithRetry({
        title: body.title,
        description: body.description || '',
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
        scheduleId: scheduleId,
      });
      createdTasks.push(task);
    }

    return { ...schedule, tasks: createdTasks };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    const existing = await this.prisma.pmSchedule.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Schedule ${id} not found`);
    }

    const isOwner =
      user.baseRole === 'admin' ||
      user.baseRole === 'manager' ||
      user.ownedProducts.includes('*') ||
      user.ownedProducts.includes(existing.productId);

    if (user.baseRole === 'engineer' && !isOwner) {
       throw new ForbiddenException('You do not own the product for this schedule.');
    }

    const data: any = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.frequency !== undefined) data.frequency = body.frequency;
    if (body.estimatedHours !== undefined) data.estimatedHours = body.estimatedHours;
    if (body.checklist !== undefined) data.checklist = JSON.stringify(body.checklist);
    if (body.partsRequired !== undefined) data.partsRequired = JSON.stringify(body.partsRequired);
    if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo;

    const schedule = await this.prisma.pmSchedule.update({
      where: { id },
      data,
    });

    // Update matching pending tasks
    const tasksDataToUpdate: any = {};
    if (body.title !== undefined) tasksDataToUpdate.title = body.title;
    if (body.description !== undefined) tasksDataToUpdate.description = body.description;
    if (body.frequency !== undefined) tasksDataToUpdate.frequency = body.frequency;
    if (body.estimatedHours !== undefined) tasksDataToUpdate.estimatedHours = body.estimatedHours;
    if (body.checklist !== undefined) tasksDataToUpdate.checklist = JSON.stringify(body.checklist);
    if (body.partsRequired !== undefined) tasksDataToUpdate.partsRequired = JSON.stringify(body.partsRequired);
    if (body.assignedTo !== undefined) tasksDataToUpdate.assignedTo = body.assignedTo;

    if (Object.keys(tasksDataToUpdate).length > 0) {
      await this.prisma.pmTask.updateMany({
        where: {
          scheduleId: id,
          status: 'Pending',
        },
        data: tasksDataToUpdate,
      });
    }

    return schedule;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentUser() user: any) {
    if (user.baseRole !== 'admin' && user.baseRole !== 'manager') {
      throw new ForbiddenException('Only admin or manager can delete schedules');
    }

    const schedule = await this.prisma.pmSchedule.findUnique({
      where: { id },
    });
    if (!schedule) {
      throw new NotFoundException(`Schedule ${id} not found`);
    }

    await this.prisma.pmTask.deleteMany({
      where: {
        scheduleId: id,
        status: 'Pending',
      },
    });

    await this.prisma.pmSchedule.delete({
      where: { id },
    });
  }
}
