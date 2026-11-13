import { Injectable, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Prisma } from '@prisma/client';
import { addFrequency, normalizeFrequency, periodCode } from './frequency.util';

export interface PmDefinition {
  title: string;
  description?: string | null;
  frequency: string;
  assetId: string;
  productId: string;
  department: string;
  estimatedHours: number;
  checklist?: unknown[];
  partsRequired?: unknown[];
  assignedTo?: string | null;
  createdBy: string;
  startDate: Date;
}

@Injectable()
export class CmmsService {
  constructor(private prisma: PrismaService) {}

  // ── One PM per frequency per asset ───────────────────────────────────────
  /** Builds the 409 for an asset that already has a PM of this frequency, or null if none. */
  private async findPmTypeConflict(
    db: Prisma.TransactionClient,
    assetId: string,
    normalized: string,
  ): Promise<ConflictException | null> {
    const schedules = await db.pmSchedule.findMany({ where: { assetId } });
    const schedule = schedules.find((s) => normalizeFrequency(s.frequency) === normalized);

    let tasks: any[] = [];
    if (schedule) {
      tasks = await db.pmTask.findMany({ where: { assetId, scheduleId: schedule.id }, orderBy: { nextDueDate: 'asc' } });
    } else {
      const oneOffs = await db.pmTask.findMany({ where: { assetId, scheduleId: null } });
      tasks = oneOffs.filter((t) => normalizeFrequency(t.frequency) === normalized);
    }

    // Prefer a live occurrence to point at; fall back to the latest finished one.
    const live = tasks.find((t) => t.status !== 'Done' && t.status !== 'Cancelled');
    const task = live ?? tasks[tasks.length - 1];

    if (!schedule && !task) {
      const claim = await db.pmType.findUnique({
        where: { assetId_normalizedFrequency: { assetId, normalizedFrequency: normalized } },
      });
      if (!claim) return null;
      return this.pmTypeConflict(assetId, normalized, { taskId: claim.taskId ?? undefined, scheduleId: claim.scheduleId ?? undefined });
    }

    return this.pmTypeConflict(assetId, normalized, {
      taskId: task?.id,
      scheduleId: schedule?.id ?? task?.scheduleId ?? undefined,
      status: task?.status,
      assignedTo: task?.assignedTo ?? schedule?.assignedTo ?? null,
    });
  }

  private pmTypeConflict(
    assetId: string,
    normalized: string,
    conflict: { taskId?: string; scheduleId?: string; status?: string; assignedTo?: string | null },
  ) {
    const who = conflict.assignedTo ? `, assigned to ${conflict.assignedTo}` : '';
    const what = conflict.taskId ? ` (task ${conflict.taskId}${conflict.status ? `, ${conflict.status}` : ''}${who})` : '';
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      message: `Asset ${assetId} already has a ${normalized} PM${what}.`,
      conflict,
    });
  }

  /** Friendly pre-check. Not race-safe on its own; claimPmType is the guarantee. */
  async assertPmTypeAvailable(db: Prisma.TransactionClient, assetId: string, frequency: string): Promise<void> {
    const conflict = await this.findPmTypeConflict(db, assetId, normalizeFrequency(frequency));
    if (conflict) throw conflict;
  }

  /**
   * Race-safe: the (assetId, normalizedFrequency) primary key lets exactly one
   * of two simultaneous creators win; the loser gets the 409.
   */
  async claimPmType(
    db: Prisma.TransactionClient,
    assetId: string,
    frequency: string,
    ref: { scheduleId?: string; taskId?: string },
  ): Promise<void> {
    const normalized = normalizeFrequency(frequency);
    try {
      await db.pmType.create({
        data: { assetId, normalizedFrequency: normalized, scheduleId: ref.scheduleId ?? null, taskId: ref.taskId ?? null },
      });
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
      // Read with the base client: the failed insert may have poisoned the transaction.
      const conflict = await this.findPmTypeConflict(this.prisma, assetId, normalized);
      throw conflict ?? this.pmTypeConflict(assetId, normalized, {});
    }
  }

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

  /**
   * Creates a recurring PM series in the caller's transaction: PM-type claim, PmSchedule row and
   * the initial tasks (first on `startDate`, the rest one year ahead). A failure anywhere rolls
   * back the claim and any partial series. The legacy [SeriesID: x] marker in `description` is
   * kept because the frontend still parses it to group a series.
   */
  async createScheduleInTx(tx: Prisma.TransactionClient, def: PmDefinition, seriesId: string) {
    await this.assertPmTypeAvailable(tx, def.assetId, def.frequency);
    await this.claimPmType(tx, def.assetId, def.frequency, { scheduleId: seriesId });

    const checklist = JSON.stringify(def.checklist || []);
    const partsRequired = JSON.stringify(def.partsRequired || []);

    // A real PmSchedule row (id = seriesId) lets the nightly topUpSchedules() keep generating tasks.
    await tx.pmSchedule.create({
      data: {
        id: seriesId,
        title: def.title,
        description: def.description || null,
        frequency: def.frequency,
        assetId: def.assetId,
        productId: def.productId,
        department: def.department,
        estimatedHours: def.estimatedHours,
        checklist,
        partsRequired,
        assignedTo: def.assignedTo || null,
        createdBy: def.createdBy,
      },
    });

    const tasks = [];
    for (const date of [def.startDate, ...this.calculateDates(def.frequency, def.startDate)]) {
      tasks.push(
        await this.createTaskInTx(tx, {
          title: def.title,
          description: `[SeriesID: ${seriesId}]\n${def.description || ''}`,
          frequency: def.frequency,
          assetId: def.assetId,
          productId: def.productId,
          department: def.department,
          nextDueDate: date,
          estimatedHours: def.estimatedHours,
          status: 'Pending',
          checklist,
          partsRequired,
          partsUsed: '[]',
          assignedTo: def.assignedTo || null,
          createdBy: def.createdBy,
          scheduleId: seriesId,
        }),
      );
    }
    return tasks;
  }

  /** One-off PM (not recurring): claims the PM type with the task and creates the single task. */
  async createStandalonePmInTx(tx: Prisma.TransactionClient, def: PmDefinition) {
    await this.assertPmTypeAvailable(tx, def.assetId, def.frequency);
    const task = await this.createTaskInTx(tx, {
      title: def.title,
      description: def.description || '',
      frequency: def.frequency,
      assetId: def.assetId,
      productId: def.productId,
      department: def.department,
      nextDueDate: def.startDate,
      estimatedHours: def.estimatedHours,
      status: 'Pending',
      checklist: JSON.stringify(def.checklist || []),
      partsRequired: JSON.stringify(def.partsRequired || []),
      partsUsed: '[]',
      assignedTo: def.assignedTo || null,
      createdBy: def.createdBy,
    });
    await this.claimPmType(tx, def.assetId, def.frequency, { taskId: task.id });
    return task;
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
    changes: string[] = [],
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
        ...(changes.length > 0 && { changes: JSON.stringify(changes) }),
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
