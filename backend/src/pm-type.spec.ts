import { ConflictException } from '@nestjs/common';
import { CmmsService } from './cmms.service';

type Sched = { id: string; assetId: string; frequency: string; assignedTo: string | null; createdAt: Date };
type Task = { id: string; assetId: string; scheduleId: string | null; frequency: string; status: string; assignedTo: string | null; nextDueDate: Date };

function fakeDb(schedules: Sched[] = [], tasks: Task[] = [], claims: Record<string, any> = {}) {
  return {
    pmType: {
      findUnique: jest.fn(async ({ where }: any) => claims[`${where.assetId_normalizedFrequency.assetId}|${where.assetId_normalizedFrequency.normalizedFrequency}`] ?? null),
      create: jest.fn(async ({ data }: any) => {
        const key = `${data.assetId}|${data.normalizedFrequency}`;
        if (claims[key]) throw Object.assign(new Error('unique'), { code: 'P2002' });
        claims[key] = data;
        return data;
      }),
    },
    pmSchedule: { findMany: jest.fn(async ({ where }: any) => schedules.filter(s => s.assetId === where.assetId)) },
    pmTask: {
      findMany: jest.fn(async ({ where }: any) =>
        tasks
          .filter(t => t.assetId === where.assetId)
          .filter(t => (where.scheduleId === null ? t.scheduleId === null : where.scheduleId ? t.scheduleId === where.scheduleId : true))
          .sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime()),
      ),
    },
  } as any;
}

describe('unique PM type per asset', () => {
  const t = (over: Partial<Task>): Task => ({
    id: 'PM-A1-1m-01', assetId: 'A1', scheduleId: 'SCH-1', frequency: 'Monthly', status: 'Pending',
    assignedTo: 'TECH-1', nextDueDate: new Date(2026, 0, 1), ...over,
  });
  const s = (over: Partial<Sched> = {}): Sched => ({
    id: 'SCH-1', assetId: 'A1', frequency: 'Monthly', assignedTo: 'TECH-1', createdAt: new Date(2026, 0, 1), ...over,
  });

  it('passes when the asset has no PM of that frequency', async () => {
    const db = fakeDb([s({ frequency: 'Weekly' })], [t({ frequency: 'Weekly' })]);
    const service = new CmmsService(db);
    await expect(service.assertPmTypeAvailable(db, 'A1', 'Monthly')).resolves.toBeUndefined();
  });

  it('rejects a duplicate with 409 carrying the conflicting task id, status and assignee', async () => {
    const db = fakeDb([s()], [t({})]);
    const service = new CmmsService(db);
    const err: any = await service.assertPmTypeAvailable(db, 'A1', 'Monthly').catch(e => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse().conflict).toMatchObject({ taskId: 'PM-A1-1m-01', status: 'Pending', assignedTo: 'TECH-1' });
  });

  it('treats "1 month(s)" and "Monthly" as the same PM type', async () => {
    const db = fakeDb([s({ frequency: '1 month(s)' })], [t({ frequency: '1 month(s)' })]);
    const service = new CmmsService(db);
    await expect(service.assertPmTypeAvailable(db, 'A1', 'Monthly')).rejects.toBeInstanceOf(ConflictException);
  });

  it('a series whose tasks are all Done still blocks', async () => {
    const db = fakeDb([s()], [t({ status: 'Done' })]);
    const service = new CmmsService(db);
    await expect(service.assertPmTypeAvailable(db, 'A1', 'Monthly')).rejects.toBeInstanceOf(ConflictException);
  });

  it('a one-off task (no schedule) also blocks', async () => {
    const db = fakeDb([], [t({ scheduleId: null, status: 'Done' })]);
    const service = new CmmsService(db);
    await expect(service.assertPmTypeAvailable(db, 'A1', 'Monthly')).rejects.toBeInstanceOf(ConflictException);
  });

  it('other assets are unaffected', async () => {
    const db = fakeDb([s({ assetId: 'A2' })], [t({ assetId: 'A2' })]);
    const service = new CmmsService(db);
    await expect(service.assertPmTypeAvailable(db, 'A1', 'Monthly')).resolves.toBeUndefined();
  });

  it('claim: two parallel claims for the same asset+frequency let exactly one through', async () => {
    const claims: Record<string, any> = {};
    const db = fakeDb([], [], claims);
    const service = new CmmsService(db);
    const results = await Promise.allSettled([
      service.claimPmType(db, 'A1', 'Monthly', { scheduleId: 'SCH-A' }),
      service.claimPmType(db, 'A1', '1 month(s)', { scheduleId: 'SCH-B' }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(Object.keys(claims)).toEqual(['A1|monthly']);
  });

  it('claim: rethrows non-unique errors untouched', async () => {
    const db = fakeDb();
    db.pmType.create = jest.fn(async () => { throw new Error('boom'); });
    const service = new CmmsService(db);
    await expect(service.claimPmType(db, 'A1', 'Monthly', { taskId: 'x' })).rejects.toThrow('boom');
  });
});
