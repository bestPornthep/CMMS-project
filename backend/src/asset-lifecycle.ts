import { Prisma } from '@prisma/client';

// Done tasks are history and are never touched by a machine deactivation.
export const ASSET_CASCADE_CANCEL_STATUSES = ['Pending', 'In Progress', 'Pending Approval', 'Overdue'] as const;

export interface AssetUpdate {
  fields?: Partial<Record<'name' | 'department' | 'location' | 'workCenter', string>>;
  isActive?: boolean;
  isInMasterPlan?: boolean;
}

// Writes a machine change and its cascade in the caller's transaction: deactivating pauses the
// machine's schedules and cancels its open tasks; reactivating resumes the schedules.
export async function applyAssetUpdate(tx: Prisma.TransactionClient, assetId: string, update: AssetUpdate, now: Date) {
  const data: Prisma.AssetUpdateInput = { ...(update.fields ?? {}) };
  if (update.isInMasterPlan !== undefined) data.isInMasterPlan = update.isInMasterPlan;
  if (update.isActive !== undefined) {
    data.isActive = update.isActive;
    data.deactivatedAt = update.isActive ? null : now;
    await tx.pmSchedule.updateMany({ where: { assetId }, data: { isActive: update.isActive } });
    if (!update.isActive) {
      await tx.pmTask.updateMany({
        where: { assetId, status: { in: [...ASSET_CASCADE_CANCEL_STATUSES] } },
        data: { status: 'Cancelled', cancelledReason: 'Machine deactivated', cancelledAt: now },
      });
    }
  }
  return tx.asset.update({ where: { id: assetId }, data });
}
