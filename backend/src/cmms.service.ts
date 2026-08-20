import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class CmmsService {
  constructor(private prisma: PrismaService) {}

  // ── PM Tasks Sequential ID (transaction + retry) ─────────────────────────
  /**
   * Generates a task ID and creates the task atomically inside a serializable
   * transaction. Retries up to MAX_RETRIES times on unique-key conflicts that
   * arise from concurrent requests racing for the same sequential ID.
   */
  async createTaskWithRetry(data: Omit<Prisma.PmTaskCreateInput, 'id'>, maxRetries = 5) {
    const deptPrefix = (data.department || 'Gen').substring(0, 3).toUpperCase();

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const tasks = await tx.pmTask.findMany({
            where: { id: { startsWith: `PM-${deptPrefix}-` } },
            select: { id: true },
          });

          let maxNum = 0;
          for (const t of tasks) {
            const parts = t.id.split('-');
            if (parts.length === 3) {
              const num = parseInt(parts[2], 10);
              if (!isNaN(num) && num > maxNum) maxNum = num;
            }
          }

          const taskId = `PM-${deptPrefix}-${(maxNum + 1).toString().padStart(4, '0')}`;
          return tx.pmTask.create({ data: { ...data, id: taskId } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (err: any) {
        // P2002 = unique constraint violation; P2034 = serialization failure
        const isRetryable =
          err?.code === 'P2002' || err?.code === 'P2034';
        if (!isRetryable || attempt === maxRetries - 1) throw err;
      }
    }
  }

  // ── Verification Helper: User has scope over Product ──────────────────────
  async checkProductOwnership(user: any, productId: string, permission: string) {
    if (user.baseRole === 'admin' || user.baseRole === 'manager') {
      return true;
    }

    // Check owned products
    if (user.ownedProducts.includes('*') || user.ownedProducts.includes(productId)) {
      return true;
    }

    // Check active delegations (for technicians)
    if (user.baseRole === 'technician') {
      const activeDelegation = user.delegatedProducts?.find(
        (dp: any) =>
          dp.productId === productId &&
          dp.status === 'active' &&
          dp.permissions.includes(permission),
      );
      if (activeDelegation) {
        return true;
      }
    }

    throw new ForbiddenException(`Product access denied for ${productId}`);
  }

  // ── Legacy Series Marker Helper ────────────────────────────────────────────
  /**
   * Series created before PmSchedule rows existed only carry their series id
   * as a `[SeriesID: xxx]` marker inside `description`. Extracts it so those
   * legacy series can still be matched by description-contains fallback.
   */
  extractSeriesIdFromDescription(description: string | null | undefined): string | null {
    if (!description) return null;
    const match = description.match(/\[SeriesID: (.+?)\]/);
    return match ? match[1] : null;
  }

  // ── Logging Helper ───────────────────────────────────────────────────────
  async logAction(
    action: string,
    actor: { id: string; name: string },
    target: { id?: string; name?: string; isUser: boolean } | null,
    productId: string | null,
    type: 'security' | 'system' | 'data',
    department: string | null = null,
  ) {
    await this.prisma.auditLog.create({
      data: {
        action,
        actorId: actor.id,
        actorName: actor.name,
        targetId: target?.id || null,
        targetName: target?.name || null,
        targetIsUser: target?.isUser || false,
        productId,
        department,
        type,
      },
    });
  }

  // ── Scheduling Logic ───────────────────────────────────────────────────────
  private getFrequencyIncrementFn(frequency: string): (d: Date) => void {
    if (frequency === 'Daily') return (d: Date) => d.setDate(d.getDate() + 1);
    if (frequency === 'Weekly') return (d: Date) => d.setDate(d.getDate() + 7);
    if (frequency === 'Monthly') return (d: Date) => d.setMonth(d.getMonth() + 1);
    if (frequency === 'Quarterly') return (d: Date) => d.setMonth(d.getMonth() + 3);
    if (frequency === 'Yearly') return (d: Date) => d.setFullYear(d.getFullYear() + 1);

    const parts = frequency.split(' ');
    if (parts.length === 2) {
      const val = parseInt(parts[0], 10);
      const unit = parts[1];
      if (unit === 'hour(s)') return (d: Date) => d.setHours(d.getHours() + val);
      if (unit === 'day(s)') return (d: Date) => d.setDate(d.getDate() + val);
      if (unit === 'month(s)') return (d: Date) => d.setMonth(d.getMonth() + val);
      if (unit === 'Year(s)') return (d: Date) => d.setFullYear(d.getFullYear() + val);
    }

    return (d: Date) => d.setMonth(d.getMonth() + 1);
  }

  calculateDates(frequency: string, startDate?: Date): Date[] {
    const dates: Date[] = [];
    let current = startDate ? new Date(startDate) : new Date();
    const oneYearFromNow = new Date(current);
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    const maxTasks = 365;
    const addFunc = this.getFrequencyIncrementFn(frequency);

    while (dates.length < maxTasks) {
      const nextDate = new Date(current);
      addFunc(nextDate);

      if (nextDate.getTime() === current.getTime()) break; // infinite loop guard
      if (nextDate >= oneYearFromNow) break;

      dates.push(nextDate);
      current = nextDate;
    }

    return dates;
  }

  /**
   * Recalculates `count` future occurrence dates anchored off `anchor`
   * (e.g. an approval timestamp), using the same per-frequency increment
   * logic as calculateDates() so both paths never drift apart.
   */
  calculateDatesFromAnchor(frequency: string, anchor: Date, count: number): Date[] {
    const addFunc = this.getFrequencyIncrementFn(frequency);
    const dates: Date[] = [];
    let current = new Date(anchor);
    for (let i = 0; i < count; i++) {
      addFunc(current);
      dates.push(new Date(current));
    }
    return dates;
  }
}
