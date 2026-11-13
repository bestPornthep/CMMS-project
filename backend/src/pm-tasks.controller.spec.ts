import { ForbiddenException } from '@nestjs/common';
import { PmTasksController } from './pm-tasks.controller';

const admin = { baseRole: 'admin', employeeId: 'A1', name: 'Admin', ownedProducts: ['*'] };

function build(existing: any) {
  const tx = {
    pmTask: {
      update: jest.fn(async ({ data }: any) => ({ ...existing, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    pmSchedule: { update: jest.fn().mockResolvedValue({}) },
    pmType: { deleteMany: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null) },
  };
  const prisma: any = {
    pmTask: {
      findUnique: jest.fn().mockResolvedValue(existing),
      update: jest.fn(async ({ data }: any) => ({ ...existing, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    pmSchedule: { update: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue({ name: 'Tech' }) },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  const cmms: any = {
    logAction: jest.fn().mockResolvedValue(undefined),
    extractSeriesIdFromDescription: jest.fn().mockReturnValue(null),
  };
  return { controller: new (PmTasksController as any)(prisma, cmms) as PmTasksController, prisma, tx };
}

const task = (status: string) => ({
  id: 'PM-1',
  title: 'T',
  description: '',
  status,
  productId: 'P1',
  department: 'Fab',
  scheduleId: 'S1',
  assignedTo: 'E1',
  checklist: '[]',
  partsRequired: '[]',
  partsUsed: '[]',
});

describe('PmTasksController — cancellation & reassign cascade', () => {
  it('persists cancelledReason/cancelledAt when an approver cancels a task', async () => {
    const { controller, prisma } = build(task('Pending'));
    await controller.update('PM-1', { status: 'Cancelled', cancelledReason: 'Machine deactivated' }, admin);
    const data = prisma.pmTask.update.mock.calls[0][0].data;
    expect(data.status).toBe('Cancelled');
    expect(data.cancelledReason).toBe('Machine deactivated');
    expect(data.cancelledAt).toBeInstanceOf(Date);
  });

  it('refuses to modify the status of a cancelled task', async () => {
    const { controller } = build(task('Cancelled'));
    await expect(controller.update('PM-1', { status: 'Pending' }, admin)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('technicians cannot cancel', async () => {
    const { controller } = build({ ...task('In Progress'), assignedTo: 'T1' });
    await expect(
      controller.update('PM-1', { status: 'Cancelled' }, { baseRole: 'technician', employeeId: 'T1', name: 'T', ownedProducts: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reassign cascades to Pending and Overdue siblings', async () => {
    const { controller, tx } = build(task('In Progress'));
    await controller.reassign('PM-1', { assignedTo: 'E2' }, admin);
    expect(tx.pmTask.updateMany.mock.calls[0][0].where.status).toEqual({ in: ['Pending', 'Overdue'] });
  });

  it('stopping a schedule releases its PM type; resuming claims it again', async () => {
    const { controller, prisma, tx } = build(task('Pending'));
    const schedule = { id: 'S1', productId: 'P1', assetId: 'A1', frequency: '1 month(s)', isActive: true, checklist: '[]' };
    prisma.pmSchedule.findUnique.mockResolvedValue(schedule);
    prisma.pmTask.findMany = jest.fn().mockResolvedValue([]);
    await controller.updateSchedule('S1', { isActive: false }, admin);
    expect(tx.pmSchedule.update).toHaveBeenCalledWith({ where: { id: 'S1' }, data: { isActive: false } });
    expect(tx.pmType.deleteMany).toHaveBeenCalledWith({ where: { assetId: 'A1', normalizedFrequency: 'monthly' } });

    prisma.pmSchedule.findUnique.mockResolvedValue({ ...schedule, isActive: false });
    const cmms = (controller as any).cmms;
    cmms.assertPmTypeAvailable = jest.fn().mockResolvedValue(undefined);
    cmms.claimPmType = jest.fn().mockResolvedValue(undefined);
    await controller.updateSchedule('S1', { isActive: true }, admin);
    expect(cmms.claimPmType).toHaveBeenCalledWith(tx, 'A1', '1 month(s)', { scheduleId: 'S1' });
  });
});

describe('PmTasksController.updateSchedule — checklist edit', () => {
  const item = (text: string, extra: any = {}) => ({ text, requiresPhoto: false, requiresValue: false, ...extra });

  function setup(tasks: any[], scheduleChecklist: any[]) {
    const { controller, prisma } = build(task('Pending'));
    const logAction = (controller as any).cmms.logAction as jest.Mock;
    prisma.pmSchedule.findUnique.mockResolvedValue({
      id: 'S1', title: 'Series', productId: 'P1', department: 'Fab', checklist: JSON.stringify(scheduleChecklist),
    });
    prisma.pmTask.findMany = jest.fn().mockResolvedValue(tasks);
    return { controller, prisma, logAction };
  }

  it('scopes to non-Done/Cancelled tasks, audits the diff', async () => {
    const { controller, prisma, logAction } = setup([], [item('a'), item('b')]);
    await controller.updateSchedule('S1', { checklist: [item('a'), item('c')] }, admin);
    expect(prisma.pmTask.findMany.mock.calls[0][0].where).toEqual({
      scheduleId: 'S1',
      status: { notIn: ['Done', 'Cancelled'] },
    });
    expect(logAction).toHaveBeenCalledTimes(1);
    expect(logAction.mock.calls[0][0]).toBe('Edited PM checklist');
    expect(logAction.mock.calls[0][6]).toEqual(["Added: 'c'", "Removed: 'b'"]);
  });

  it('writes no audit entry for a reorder-only edit', async () => {
    const { controller, logAction } = setup([], [item('a'), item('b')]);
    await controller.updateSchedule('S1', { checklist: [item('b'), item('a')] }, admin);
    expect(logAction).not.toHaveBeenCalled();
  });

  it('keeps recorded progress on in-flight tasks and leaves other fields alone', async () => {
    const inFlight = {
      ...task('In Progress'),
      checklist: JSON.stringify([item('a', { done: true, value: '42' }), item('b')]),
    };
    const { controller, prisma } = setup([inFlight], [item('a'), item('b')]);
    await controller.updateSchedule('S1', { title: 'New', checklist: [item('a'), item('c')] }, admin);
    const data = prisma.pmTask.update.mock.calls[0][0].data;
    expect(data.title).toBeUndefined();
    expect(JSON.parse(data.checklist)).toEqual([item('a', { done: true, value: '42' }), item('c')]);
  });
});
