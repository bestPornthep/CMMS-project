import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from './prisma.service';
import { CmmsService } from './cmms.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private cmms: CmmsService,
  ) {}

  /**
   * Runs every hour.
   * Marks all delegations past their validUntil as 'revoked' and logs each one.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireDelegations() {
    const now = new Date();

    const expired = await this.prisma.delegation.findMany({
      where: { status: 'active', validUntil: { lt: now } },
    });

    if (expired.length === 0) return;

    await this.prisma.delegation.updateMany({
      where: { status: 'active', validUntil: { lt: now } },
      data: { status: 'revoked' },
    });

    for (const d of expired) {
      const [grantor, grantee] = await Promise.all([
        this.prisma.user.findUnique({ where: { employeeId: d.grantorId } }),
        this.prisma.user.findUnique({ where: { employeeId: d.granteeId } }),
      ]);

      this.logger.log(
        `Auto-revoked delegation ${d.id}: ${grantee?.name ?? d.granteeId} → product ${d.productId} (expired ${d.validUntil.toISOString()})`,
      );

      await this.cmms.logAction(
        'Delegation Auto-Expired',
        { id: d.grantorId, name: grantor?.name ?? d.grantorId },
        { id: d.granteeId, name: grantee?.name ?? d.granteeId, isUser: true },
        d.productId,
        'security',
        grantor?.department ?? null,
      );
    }
  }

  /**
   * Runs every hour.
   * Sets PM tasks whose nextDueDate has passed and are still Pending to Overdue.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async markOverdueTasks() {
    const now = new Date();

    const result = await this.prisma.pmTask.updateMany({
      where: {
        status: 'Pending',
        nextDueDate: { lt: now },
      },
      data: { status: 'Overdue' },
    });

    if (result.count > 0) {
      this.logger.log(`Marked ${result.count} task(s) as Overdue`);
    }
  }

  /**
   * Runs nightly at midnight.
   * Ensures every active PM schedule has a rolling 1-year buffer of tasks.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async topUpSchedules() {
    const schedules = await this.prisma.pmSchedule.findMany();
    
    let totalCreated = 0;
    
    for (const schedule of schedules) {
      // Find the latest pending task for this schedule
      const latestTask = await this.prisma.pmTask.findFirst({
        where: { scheduleId: schedule.id, status: 'Pending' },
        orderBy: { nextDueDate: 'desc' },
      });

      // If no tasks exist, start from today. Otherwise, start from the latest task's date.
      const startDate = latestTask ? latestTask.nextDueDate : new Date();
      
      const dates = this.cmms.calculateDates(schedule.frequency, startDate);
      
      // Skip the first date if it exactly matches the latest task's date
      const newDates = dates.filter(d => !latestTask || d.getTime() !== latestTask.nextDueDate.getTime());
      
      for (const date of newDates) {
        await this.cmms.createTaskWithRetry({
          title: schedule.title,
          description: schedule.description || '',
          frequency: schedule.frequency,
          assetId: schedule.assetId,
          productId: schedule.productId,
          department: schedule.department,
          nextDueDate: date,
          estimatedHours: schedule.estimatedHours,
          status: 'Pending',
          checklist: schedule.checklist,
          partsRequired: schedule.partsRequired,
          partsUsed: '[]',
          assignedTo: schedule.assignedTo,
          createdBy: schedule.createdBy,
          scheduleId: schedule.id,
        });
        totalCreated++;
      }
    }
    
    if (totalCreated > 0) {
      this.logger.log(`Generated ${totalCreated} top-up task(s) for active schedules`);
    }
  }
}
