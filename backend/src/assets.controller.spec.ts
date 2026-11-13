import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AssetsController } from './assets.controller';

const baseAsset = {
  id: 'CNC-014',
  name: 'CNC',
  department: 'Fab',
  location: 'P1',
  isActive: true,
  workCenter: null,
  deactivatedAt: null,
  isInMasterPlan: false,
};

const admin = { baseRole: 'admin', employeeId: 'A1', name: 'Admin', ownedProducts: ['*'] };

function build(asset: any = baseAsset) {
  const tx = {
    pmSchedule: { updateMany: jest.fn().mockResolvedValue({}) },
    pmType: { findMany: jest.fn().mockResolvedValue([{ scheduleId: 'S1' }, { scheduleId: null }]) },
    pmTask: { updateMany: jest.fn().mockResolvedValue({}) },
    asset: { update: jest.fn(async ({ data }: any) => ({ ...(asset ?? baseAsset), ...data })) },
  };
  const prisma: any = {
    asset: { findUnique: jest.fn().mockResolvedValue(asset) },
    product: { findUnique: jest.fn().mockResolvedValue({ id: 'P2' }) },
    masterPlanChange: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  const cmms: any = {
    checkProductOwnership: jest.fn().mockResolvedValue(true),
    logAction: jest.fn().mockResolvedValue(undefined),
  };
  return { controller: new AssetsController(prisma, cmms), prisma, tx, cmms };
}

describe('AssetsController.update (PATCH /assets/:id)', () => {
  it('404s for an unknown asset', async () => {
    const { controller } = build(null);
    await expect(controller.update('X', { name: 'n' }, admin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an id change', async () => {
    const { controller } = build();
    await expect(controller.update('CNC-014', { id: 'OTHER' }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects technicians without delegation', async () => {
    const { controller } = build();
    await expect(
      controller.update('CNC-014', { name: 'n' }, { baseRole: 'technician', employeeId: 'T', name: 'T' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('plain edit: no cascade, audits Machine Updated', async () => {
    const { controller, tx, cmms } = build();
    const res = await controller.update('CNC-014', { name: 'CNC 2', workCenter: 'WC1' }, admin);
    expect(res.name).toBe('CNC 2');
    expect(tx.pmSchedule.updateMany).not.toHaveBeenCalled();
    expect(tx.pmTask.updateMany).not.toHaveBeenCalled();
    expect(cmms.logAction).toHaveBeenCalledTimes(1);
    expect(cmms.logAction.mock.calls[0][0]).toBe('Machine Updated');
  });

  it('no-op edit writes nothing', async () => {
    const { controller, prisma, cmms } = build();
    await controller.update('CNC-014', { name: 'CNC', isActive: true }, admin);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(cmms.logAction).not.toHaveBeenCalled();
  });

  it('deactivate: pauses schedules, cancels open tasks (never Done), audits', async () => {
    const { controller, tx, cmms } = build();
    const res = await controller.update('CNC-014', { isActive: false }, admin);
    expect(res.isActive).toBe(false);
    expect(res.deactivatedAt).toBeInstanceOf(Date);
    expect(tx.pmSchedule.updateMany).toHaveBeenCalledWith({ where: { assetId: 'CNC-014' }, data: { isActive: false } });
    const cancel = tx.pmTask.updateMany.mock.calls[0][0];
    expect(cancel.where.status.in).toEqual(['Pending', 'In Progress', 'Pending Approval', 'Overdue']);
    expect(cancel.data).toMatchObject({ status: 'Cancelled', cancelledReason: 'Machine deactivated' });
    expect(cancel.data.cancelledAt).toBeInstanceOf(Date);
    expect(cmms.logAction.mock.calls.map((c: any[]) => c[0])).toEqual(['Machine Deactivated']);
  });

  it('409s while the machine has an open Send to Master Plan', async () => {
    const { controller, prisma } = build();
    prisma.masterPlanChange.count.mockResolvedValue(1);
    await expect(controller.update('CNC-014', { name: 'n' }, admin)).rejects.toBeInstanceOf(ConflictException);
  });

  it('reactivate: resumes only schedules still holding their PM type, keeps cancelled tasks cancelled', async () => {
    const { controller, tx, cmms } = build({ ...baseAsset, isActive: false, deactivatedAt: new Date() });
    const res = await controller.update('CNC-014', { isActive: true }, admin);
    expect(res.isActive).toBe(true);
    expect(res.deactivatedAt).toBeNull();
    expect(tx.pmSchedule.updateMany).toHaveBeenCalledWith({ where: { assetId: 'CNC-014', id: { in: ['S1'] } }, data: { isActive: true } });
    expect(tx.pmTask.updateMany).not.toHaveBeenCalled();
    expect(cmms.logAction.mock.calls.map((c: any[]) => c[0])).toEqual(['Machine Reactivated']);
  });

  it('moving to an unknown product is rejected', async () => {
    const { controller, prisma } = build();
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(controller.update('CNC-014', { location: 'NOPE' }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });
});
