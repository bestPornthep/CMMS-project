import { SchedulerService } from './scheduler.service';
import { CmmsService } from './cmms.service';

type FakeTask = { scheduleId: string; nextDueDate: Date; status: string };
type FakeSchedule = { id: string; frequency: string; isActive: boolean; title: string; assetId: string };

function build(schedules: FakeSchedule[], tasks: FakeTask[]) {
  const prisma: any = {
    pmSchedule: {
      findMany: jest.fn(async ({ where }: any = {}) =>
        schedules.filter(s => where?.isActive === undefined || s.isActive === where.isActive),
      ),
    },
    pmTask: {
      aggregate: jest.fn(async ({ where }: any) => {
        const dates = tasks.filter(t => t.scheduleId === where.scheduleId).map(t => t.nextDueDate.getTime());
        return { _max: { nextDueDate: dates.length ? new Date(Math.max(...dates)) : null } };
      }),
    },
  };
  const real = new CmmsService(prisma);
  const cmms: any = {
    calculateDates: real.calculateDates.bind(real),
    createTaskWithRetry: jest.fn(async (data: any) => {
      tasks.push({ scheduleId: data.scheduleId, nextDueDate: data.nextDueDate, status: data.status });
    }),
  };
  return { service: new SchedulerService(prisma, cmms), tasks, cmms, prisma };
}

describe('SchedulerService.topUpSchedules', () => {
  const sched = (over: Partial<FakeSchedule> = {}): FakeSchedule => ({
    id: 'SCH-1', frequency: 'Weekly', isActive: true, title: 't', assetId: 'A1', ...over,
  });

  it('does nothing on a second consecutive run', async () => {
    const { service, tasks } = build([sched()], []);
    await service.topUpSchedules();
    const afterFirst = tasks.length;
    expect(afterFirst).toBeGreaterThan(40);
    await service.topUpSchedules();
    expect(tasks.length).toBe(afterFirst);
  });

  it('never creates two tasks with the same scheduleId + nextDueDate', async () => {
    const { service, tasks } = build([sched()], []);
    await service.topUpSchedules();
    await service.topUpSchedules();
    const keys = tasks.map(t => `${t.scheduleId}|${t.nextDueDate.getTime()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('counts Cancelled and Done rows when finding the anchor, so they are not regenerated', async () => {
    const far = new Date();
    far.setMonth(far.getMonth() + 11);
    const tasks: FakeTask[] = [
      { scheduleId: 'SCH-1', nextDueDate: far, status: 'Cancelled' },
    ];
    const { service } = build([sched()], tasks);
    await service.topUpSchedules();
    const generatedBeyondCancelled = tasks.filter(t => t.status === 'Pending' && t.nextDueDate > far);
    expect(generatedBeyondCancelled.length).toBeLessThanOrEqual(6);
    expect(tasks.filter(t => t.status === 'Cancelled').length).toBe(1);
  });

  it('skips paused schedules', async () => {
    const { service, tasks } = build([sched({ isActive: false })], []);
    await service.topUpSchedules();
    expect(tasks).toHaveLength(0);
  });

  it('does not generate for a schedule whose tasks already extend past the horizon', async () => {
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 30);
    const { service, tasks } = build([sched()], [{ scheduleId: 'SCH-1', nextDueDate: farFuture, status: 'Pending' }]);
    await service.topUpSchedules();
    expect(tasks).toHaveLength(1);
  });
});
