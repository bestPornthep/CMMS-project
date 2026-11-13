import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Prisma } from '@prisma/client';
import { addFrequency, periodCode } from './frequency.util';

@Injectable()
export class CmmsService {
  constructor(private prisma: PrismaService) {}

  // ── PM Task ids: PM-{assetId}-{periodCode}-{seq} ─────────────────────────
  /**
   * Reserves the next sequence number for (assetId, period) with one atomic
   * MERGE, so concurrent creates (nightly job + manual) never get the same
   * number. Must run inside the same transaction that creates the task: a
   * rolled-back create then also rolls back its number, keeping the series
   * gap-free.
   */
  async nextTaskId(tx: Prisma.TransactionClient, assetId: string, frequency: string): Promise<string> {
    const code = periodCode(frequency);
    const rows = await tx.$queryRaw<{ lastSeq: number }[]>`
      MERGE cmms_pm_id_sequences WITH (HOLDLOCK) AS t
      USING (SELECT ${assetId} AS asset_id, ${code} AS period_code) AS s
        ON t.asset_id = s.asset_id AND t.period_code = s.period_code
      WHEN MATCHED THEN UPDATE SET last_seq = t.last_seq + 1
      WHEN NOT MATCHED THEN INSERT (asset_id, period_code, last_seq) VALUES (s.asset_id, s.period_code, 1)
      OUTPUT INSERTED.last_seq AS lastSeq;`;
    const seq = Number(rows[0].lastSeq);
    return `PM-${assetId}-${code}-${String(seq).padStart(2, '0')}`;
  }

  /** Mints the id and creates the task inside the caller's transaction. */
  async createTaskInTx(tx: Prisma.TransactionClient, data: Omit<Prisma.PmTaskCreateInput, 'id'>) {
    const id = await this.nextTaskId(tx, data.assetId, data.frequency);
    return tx.pmTask.create({ data: { ...data, id } });
  }

  /** Single-task create in its own transaction; retries transient conflicts. */
  async createTaskWithRetry(data: Omit<Prisma.PmTaskCreateInput, 'id'>, maxRetries = 5) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.prisma.$transaction((tx) => this.createTaskInTx(tx, data));
      } catch (err: any) {
        // P2002 = unique constraint violation; P2034 = write conflict / deadlock
        const isRetryable = err?.code === 'P2002' || err?.code === 'P2034';
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
    return (d: Date) => {
      d.setTime(addFrequency(d, frequency).getTime());
    };
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
