import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from './prisma.service';
import { CmmsService } from './cmms.service';
import { computeMissingDates } from './schedule-horizon.util';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private toppingUp = false;

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
    if (this.toppingUp) return;
    this.toppingUp = true;
    try {
      await this.runTopUp();
    } finally {
      this.toppingUp = false;
    }
  }

  private async runTopUp() {
    const schedules = await this.prisma.pmSchedule.findMany({ where: { isActive: true } });
    const now = new Date();

    let totalCreated = 0;

    for (const schedule of schedules) {
      // Anchor on the latest due date across every status (Done/Cancelled
      // included) so cancelled occurrences are never regenerated and a second
      // run finds nothing missing.
      const { _max } = await this.prisma.pmTask.aggregate({
        where: { scheduleId: schedule.id },
        _max: { nextDueDate: true },
      });
      const anchor = _max.nextDueDate ?? null;

      const dates = computeMissingDates(schedule.frequency, anchor, now);

      for (const date of dates) {
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

      // Symptom of the old blind-append bug: tasks far beyond the 1-year horizon.
      if (anchor) {
        const limit = new Date(now);
        limit.setFullYear(limit.getFullYear() + 1);
        limit.setDate(limit.getDate() + 7);
        if (anchor > limit) {
          this.logger.warn(`Schedule ${schedule.id} has tasks beyond the 1-year horizon (latest ${anchor.toISOString()})`);
        }
      }
    }
    
    if (totalCreated > 0) {
      this.logger.log(`Generated ${totalCreated} top-up task(s) for active schedules`);
    }
  }
}
