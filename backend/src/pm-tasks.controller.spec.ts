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

  it('schedule update accepts isActive', async () => {
    const { controller, prisma } = build(task('Pending'));
    prisma.pmSchedule.findUnique.mockResolvedValue({ id: 'S1', productId: 'P1' });
    prisma.pmTask.findMany = jest.fn().mockResolvedValue([]);
    await controller.updateSchedule('S1', { isActive: false }, admin);
    expect(prisma.pmSchedule.update).toHaveBeenCalledWith({ where: { id: 'S1' }, data: { isActive: false } });
  });
});
