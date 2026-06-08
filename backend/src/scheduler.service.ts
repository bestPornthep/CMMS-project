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
}
