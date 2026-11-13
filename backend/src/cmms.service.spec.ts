import { CmmsService } from './cmms.service';

function fakeTx() {
  const counters = new Map<string, number>();
  const tx: any = {
    $queryRaw: jest.fn(async (_strings: TemplateStringsArray, assetId: string, code: string) => {
      const key = `${assetId}|${code}`;
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return [{ lastSeq: next }];
    }),
    pmTask: { create: jest.fn(async ({ data }: any) => data) },
  };
  return { tx, counters };
}

describe('CmmsService task ids', () => {
  const service = new CmmsService({} as any);

  it('formats PM-{asset}-{period}-{seq} with a 2-digit minimum', async () => {
    const { tx } = fakeTx();
    expect(await service.nextTaskId(tx, 'FCT-RN005-AR-A-001', 'Monthly')).toBe('PM-FCT-RN005-AR-A-001-1m-01');
    expect(await service.nextTaskId(tx, 'FCT-RN005-AR-A-001', '1 month(s)')).toBe('PM-FCT-RN005-AR-A-001-1m-02');
  });

  it('never truncates wide sequence numbers', async () => {
    const { tx, counters } = fakeTx();
    counters.set('A1|1m', 99);
    expect(await service.nextTaskId(tx, 'A1', 'Monthly')).toBe('PM-A1-1m-100');
    counters.set('A1|4h', 4379);
    expect(await service.nextTaskId(tx, 'A1', '4 hour(s)')).toBe('PM-A1-4h-4380');
  });

  it('keeps a separate counter per asset and period', async () => {
    const { tx } = fakeTx();
    expect(await service.nextTaskId(tx, 'A1', 'Weekly')).toBe('PM-A1-1w-01');
    expect(await service.nextTaskId(tx, 'A1', 'Monthly')).toBe('PM-A1-1m-01');
    expect(await service.nextTaskId(tx, 'A2', 'Weekly')).toBe('PM-A2-1w-01');
  });

  it('hands out distinct gap-free ids for 50 concurrent creates', async () => {
    const { tx } = fakeTx();
    const ids = await Promise.all(Array.from({ length: 50 }, () => service.nextTaskId(tx, 'A1', 'Monthly')));
    expect(new Set(ids).size).toBe(50);
    const seqs = ids.map(id => parseInt(id.split('-').pop()!, 10)).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('createTaskInTx mints the id and creates the task in the supplied transaction', async () => {
    const { tx } = fakeTx();
    const created = await service.createTaskInTx(tx, { assetId: 'A1', frequency: 'Weekly', title: 't' } as any);
    expect(created.id).toBe('PM-A1-1w-01');
    expect(tx.pmTask.create).toHaveBeenCalledTimes(1);
  });
});
