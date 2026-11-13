import { Prisma } from '@prisma/client';
import { normalizeFrequency } from './frequency.util';

// Done tasks are history and are never touched by a machine deactivation.
export const ASSET_CASCADE_CANCEL_STATUSES = ['Pending', 'In Progress', 'Pending Approval', 'Overdue'] as const;

export interface AssetUpdate {
  fields?: Partial<Record<'name' | 'department' | 'location' | 'workCenter', string>>;
  isActive?: boolean;
  isInMasterPlan?: boolean;
}

// Writes a machine change and its cascade in the caller's transaction: deactivating pauses the
// machine's schedules and cancels its open tasks; reactivating resumes only the schedules that
// still hold their PM-type claim (a schedule removed as a PM type has released it and stays off).
export async function applyAssetUpdate(tx: Prisma.TransactionClient, assetId: string, update: AssetUpdate, now: Date) {
  const data: Prisma.AssetUpdateInput = { ...(update.fields ?? {}) };
  if (update.isInMasterPlan !== undefined) data.isInMasterPlan = update.isInMasterPlan;
  if (update.isActive !== undefined) {
    data.isActive = update.isActive;
    data.deactivatedAt = update.isActive ? null : now;
    if (update.isActive) {
      const claims = await tx.pmType.findMany({ where: { assetId } });
      const claimed = claims.map((c) => c.scheduleId).filter((id): id is string => !!id);
      await tx.pmSchedule.updateMany({ where: { assetId, id: { in: claimed } }, data: { isActive: true } });
    } else {
      await tx.pmSchedule.updateMany({ where: { assetId }, data: { isActive: false } });
      await tx.pmTask.updateMany({
        where: { assetId, status: { in: [...ASSET_CASCADE_CANCEL_STATUSES] } },
        data: { status: 'Cancelled', cancelledReason: 'Machine deactivated', cancelledAt: now },
      });
    }
  }
  return tx.asset.update({ where: { id: assetId }, data });
}

// Removes one PM type from a machine: stops its schedule (or cancels its one-off task), cancels
// the open tasks and releases the (asset, frequency) claim so the type can be added again.
export async function retirePmType(tx: Prisma.TransactionClient, assetId: string, frequency: string, now: Date) {
  const normalized = normalizeFrequency(frequency);
  const cancelled = { status: 'Cancelled', cancelledReason: 'PM type removed', cancelledAt: now };
  const open = { in: [...ASSET_CASCADE_CANCEL_STATUSES] };

  const schedules = await tx.pmSchedule.findMany({ where: { assetId, isActive: true } });
  const schedule = schedules.find((s) => normalizeFrequency(s.frequency) === normalized);
  if (schedule) {
    await tx.pmSchedule.update({ where: { id: schedule.id }, data: { isActive: false } });
    await tx.pmTask.updateMany({ where: { scheduleId: schedule.id, status: open }, data: cancelled });
  } else {
    const oneOffs = await tx.pmTask.findMany({ where: { assetId, scheduleId: null, status: open } });
    const ids = oneOffs.filter((t) => normalizeFrequency(t.frequency) === normalized).map((t) => t.id);
    if (ids.length > 0) await tx.pmTask.updateMany({ where: { id: { in: ids } }, data: cancelled });
  }
  await tx.pmType.deleteMany({ where: { assetId, normalizedFrequency: normalized } });
}
