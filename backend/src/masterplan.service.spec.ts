import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { MasterplanService } from './masterplan.service';

const engineer = { baseRole: 'engineer', employeeId: 'E1', name: 'Eng', department: 'Fab', ownedProducts: ['P1'] };
const manager = { baseRole: 'manager', employeeId: 'M1', name: 'Mgr', department: 'Fab', ownedProducts: ['*'] };
const technician = { baseRole: 'technician', employeeId: 'T1', name: 'Tech', department: 'Fab', ownedProducts: [] };

const inPlanAsset = {
  id: 'A1', name: 'Press', department: 'Fab', location: 'P1', workCenter: null,
  isActive: true, isInMasterPlan: true,
};
const detail = { title: 'Monthly lube', estimatedHours: 1, checklist: [{ text: 'Lube' }] };

function build(opts: { asset?: any; existingCard?: any; drafts?: any[]; claimCount?: number; frequencies?: string[] } = {}) {
  const asset = opts.asset === undefined ? inPlanAsset : opts.asset;
  const card = opts.existingCard ?? null;
  const tx: any = {
    masterPlanChange: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.claimCount ?? 1 }),
      findUnique: jest.fn().mockResolvedValue(card),
    },
    asset: {
      findUnique: jest.fn().mockResolvedValue(asset),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(async ({ data }: any) => ({ ...asset, ...data })),
    },
    product: { findUnique: jest.fn().mockResolvedValue({ id: 'P2' }) },
    pmSchedule: {
      findMany: jest.fn().mockResolvedValue((opts.frequencies ?? []).map((frequency) => ({ frequency }))),
      update: jest.fn(), updateMany: jest.fn(),
    },
    pmTask: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    pmType: { deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    draftPmType: { deleteMany: jest.fn() },
  };
  const prisma: any = {
    ...tx,
    masterPlanChange: {
      ...tx.masterPlanChange,
      findFirst: jest.fn().mockResolvedValue(card),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }: any) => ({ ...data, submittedAt: data.submittedAt, resolvedBy: null, resolvedAt: null, rejectReason: null })),
      update: jest.fn(async ({ data }: any) => ({ ...card, ...data, resolvedBy: null, resolvedAt: null, rejectReason: null })),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    masterPlanVersion: { count: jest.fn().mockResolvedValue(0), create: jest.fn(async ({ data }: any) => data), findMany: jest.fn().mockResolvedValue([]) },
    draftPmType: { findMany: jest.fn().mockResolvedValue(opts.drafts ?? []), deleteMany: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  const cmms: any = {
    assertPmTypeAvailable: jest.fn().mockResolvedValue(undefined),
    createScheduleInTx: jest.fn().mockResolvedValue([]),
    createStandalonePmInTx: jest.fn().mockResolvedValue({}),
    logAction: jest.fn().mockResolvedValue(undefined),
  };
  return { service: new MasterplanService(prisma, cmms), prisma, tx, cmms };
}

const pendingCard = (state: any, extra: any = {}) => ({
  id: 'MPC-1', assetId: 'A1', assetName: 'Press', department: 'Fab', proposedState: JSON.stringify(state),
  submittedBy: 'E1', submittedAt: new Date(), note: 'n', history: '[]', status: 'pending',
  resolvedBy: null, resolvedAt: null, rejectReason: null, ...extra,
});

describe('MasterplanService.submit', () => {
  it('rejects technicians and blank notes', async () => {
    const { service } = build();
    await expect(service.submit(technician, { assetId: 'A1', proposedState: { setActive: false }, note: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.submit(engineer, { assetId: 'A1', proposedState: { setActive: false }, note: '  ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an empty proposedState', async () => {
    const { service } = build();
    await expect(service.submit(engineer, { assetId: 'A1', proposedState: {}, note: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses changes for a machine that is not in the plan', async () => {
    const { service } = build({ asset: { ...inPlanAsset, isInMasterPlan: false } });
    await expect(service.submit(engineer, { assetId: 'A1', proposedState: { setActive: false }, note: 'x' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates one card with the first history entry', async () => {
    const { service, prisma } = build();
    const card: any = await service.submit(engineer, { assetId: 'A1', proposedState: { setActive: false }, note: 'retire it' });
    expect(card.proposedState).toEqual({ setActive: false });
    expect(card.history).toHaveLength(1);
    expect(card.status).toBe('pending');
    expect(prisma.masterPlanChange.create).toHaveBeenCalledTimes(1);
  });

  it('merges into the open card and appends history', async () => {
    const existing = pendingCard({ setActive: false }, { history: JSON.stringify([{ by: 'E1', note: 'a', timestamp: 't' }]) });
    const { service, prisma } = build({ existingCard: existing });
    const card: any = await service.submit(engineer, { assetId: 'A1', proposedState: { editFields: { department: 'Quality' } }, note: 'b' });
    expect(card.proposedState).toEqual({ setActive: false, editFields: { department: 'Quality' } });
    expect(card.history).toHaveLength(2);
    expect(prisma.masterPlanChange.create).not.toHaveBeenCalled();
  });

  it('drops the card when the merged change nets out to nothing', async () => {
    const existing = pendingCard({ setActive: false });
    const { service, prisma } = build({ existingCard: existing });
    // asset is active, so "set active true" cancels the pending deactivation
    const res = await service.submit(engineer, { assetId: 'A1', proposedState: { setActive: true }, note: 'undo' });
    expect(res).toEqual({ dropped: true });
    expect(prisma.masterPlanChange.deleteMany).toHaveBeenCalled();
  });

  it('requires details to add a PM type and enforces the unique rule', async () => {
    const { service, cmms } = build();
    await expect(service.submit(engineer, { assetId: 'A1', proposedState: { addPmTypes: ['Monthly'] }, note: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    cmms.assertPmTypeAvailable.mockRejectedValue(new ConflictException('exists'));
    await expect(
      service.submit(engineer, { assetId: 'A1', proposedState: { addPmTypes: ['Monthly'], newPmTypeDetails: { Monthly: detail } }, note: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a second add for a frequency already pending', async () => {
    const existing = pendingCard({ addPmTypes: ['Monthly'], newPmTypeDetails: { Monthly: detail } });
    const { service } = build({ existingCard: existing });
    await expect(
      service.submit(engineer, { assetId: 'A1', proposedState: { addPmTypes: ['monthly'], newPmTypeDetails: { monthly: detail } }, note: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('Send: builds the card from drafts, ignoring client details; 409 without drafts', async () => {
    const notInPlan = { ...inPlanAsset, isInMasterPlan: false };
    const none = build({ asset: notInPlan });
    await expect(none.service.submit(engineer, { assetId: 'A1', proposedState: { addToPlan: true }, note: 'x' })).rejects.toBeInstanceOf(ConflictException);

    const drafts = [{ frequency: 'Monthly', detail: JSON.stringify(detail) }];
    const { service } = build({ asset: notInPlan, drafts });
    const card: any = await service.submit(engineer, { assetId: 'A1', proposedState: { addToPlan: true, addPmTypes: ['Yearly'] }, note: 'send' });
    expect(card.proposedState).toEqual({ addToPlan: true, addPmTypes: ['Monthly'], newPmTypeDetails: { Monthly: detail } });
  });

  it('Send: refuses a machine already in the plan', async () => {
    const { service } = build({ drafts: [{ frequency: 'Monthly', detail: JSON.stringify(detail) }] });
    await expect(service.submit(engineer, { assetId: 'A1', proposedState: { addToPlan: true }, note: 'x' })).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('MasterplanService.approve', () => {
  it('requires the approve permission', () => {
    const { service } = build();
    expect(() => service.approve(engineer, ['MPC-1'])).toThrow(ForbiddenException);
  });

  it('reports "Already resolved." when the claim finds nothing pending', async () => {
    const { service } = build({ claimCount: 0, existingCard: pendingCard({}, { status: 'approved' }) });
    const res = await service.approve(manager, ['MPC-1']);
    expect(res.results).toEqual([{ id: 'MPC-1', ok: false, error: 'Already resolved.' }]);
    expect(res.revision).toBeUndefined();
  });

  it('applies the delta: adds a PM via cmms, retires removals, audits, saves one revision', async () => {
    const state = { addPmTypes: ['Monthly'], removePmTypes: ['Daily'], newPmTypeDetails: { Monthly: detail }, setActive: undefined };
    const { service, tx, cmms, prisma } = build({ existingCard: pendingCard(state), frequencies: ['Daily'] });
    prisma.asset.findMany = jest.fn().mockResolvedValue([inPlanAsset]);
    const res = await service.approve(manager, ['MPC-1']);

    expect(res.results).toEqual([{ id: 'MPC-1', ok: true }]);
    expect(res.revision?.label).toBe('A');
    expect(cmms.createScheduleInTx).toHaveBeenCalledTimes(1);
    const def = cmms.createScheduleInTx.mock.calls[0][1];
    expect(def).toMatchObject({ assetId: 'A1', productId: 'P1', frequency: 'Monthly', createdBy: 'E1', title: 'Monthly lube' });
    expect(tx.pmType.deleteMany).toHaveBeenCalled();
    expect(cmms.logAction).toHaveBeenCalledTimes(1);
    expect(cmms.logAction.mock.calls[0][0]).toBe('Approved PM Master Plan');
    expect(cmms.logAction.mock.calls[0][1]).toEqual({ id: 'M1', name: 'Mgr' });
    expect(cmms.logAction.mock.calls[0][2].name).toBe('Rev A · A1');
    expect(cmms.logAction.mock.calls[0][6]).toEqual(['Added Monthly PM', 'Removed Daily PM']);
    expect(prisma.masterPlanVersion.create).toHaveBeenCalledTimes(1);
  });

  it('creates a one-off task when the detail is not recurring', async () => {
    const state = { addPmTypes: ['Monthly'], newPmTypeDetails: { Monthly: { ...detail, isRecurring: false } } };
    const { service, cmms } = build({ existingCard: pendingCard(state) });
    await service.approve(manager, ['MPC-1']);
    expect(cmms.createStandalonePmInTx).toHaveBeenCalledTimes(1);
    expect(cmms.createScheduleInTx).not.toHaveBeenCalled();
  });

  it('moves a start date that passed while waiting to today', async () => {
    const state = { addPmTypes: ['Monthly'], newPmTypeDetails: { Monthly: { ...detail, startDate: '2020-01-01' } } };
    const { service, cmms } = build({ existingCard: pendingCard(state) });
    await service.approve(manager, ['MPC-1']);
    const start: Date = cmms.createScheduleInTx.mock.calls[0][1].startDate;
    expect(start.getTime()).toBeGreaterThan(new Date('2020-01-01').getTime());
  });

  it('a Send puts the machine in the plan and clears its drafts', async () => {
    const asset = { ...inPlanAsset, isInMasterPlan: false };
    const state = { addToPlan: true, addPmTypes: ['Monthly'], newPmTypeDetails: { Monthly: detail } };
    const { service, tx, prisma } = build({ asset, existingCard: pendingCard(state) });
    prisma.asset.findMany = jest.fn().mockResolvedValue([]);
    await service.approve(manager, ['MPC-1']);
    expect(tx.asset.update.mock.calls[0][0].data).toMatchObject({ isInMasterPlan: true });
    expect(tx.draftPmType.deleteMany).toHaveBeenCalledWith({ where: { assetId: 'A1' } });
  });

  it('a failing machine reports its error and leaves the rest of the batch alone', async () => {
    const state = { addPmTypes: ['Monthly'], newPmTypeDetails: { Monthly: detail } };
    const { service, cmms } = build({ existingCard: pendingCard(state) });
    cmms.createScheduleInTx.mockRejectedValueOnce(new ConflictException('Asset A1 already has a monthly PM.'));
    const res = await service.approve(manager, ['MPC-1', 'MPC-1']);
    expect(res.results).toEqual([{ id: 'MPC-1', ok: false, error: 'Asset A1 already has a monthly PM.' }]);
  });
});

describe('MasterplanService.reject / withdraw', () => {
  it('rejects only with a reason, and only while pending', async () => {
    const { service, prisma } = build({ existingCard: pendingCard({ setActive: false }) });
    await expect(service.reject(manager, 'MPC-1', ' ')).rejects.toBeInstanceOf(BadRequestException);
    prisma.masterPlanChange.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.reject(manager, 'MPC-1', 'no')).rejects.toBeInstanceOf(ConflictException);
  });

  it('logs the rejection with its reason', async () => {
    const { service, cmms } = build({ existingCard: pendingCard({ setActive: false }) });
    await service.reject(manager, 'MPC-1', 'not now');
    expect(cmms.logAction.mock.calls[0][0]).toBe('Rejected PM Master Plan');
    expect(cmms.logAction.mock.calls[0][6]).toEqual(['Rejected: not now']);
  });

  it('withdraw: sender or approver only', async () => {
    const { service, prisma } = build({ existingCard: pendingCard({ setActive: false }) });
    await expect(service.withdraw({ ...engineer, employeeId: 'E2' }, 'MPC-1')).rejects.toBeInstanceOf(ForbiddenException);
    await service.withdraw(engineer, 'MPC-1');
    await service.withdraw(manager, 'MPC-1');
    expect(prisma.masterPlanChange.deleteMany).toHaveBeenCalledTimes(2);
  });
});

describe('MasterplanService.list', () => {
  it('forbids technicians; engineers only see their department or owned products', async () => {
    const { service, prisma } = build();
    await expect(service.list(technician)).rejects.toBeInstanceOf(ForbiddenException);
    prisma.masterPlanChange.findMany.mockResolvedValue([
      pendingCard({}, { id: '1', department: 'Fab' }),
      pendingCard({}, { id: '2', department: 'Other', assetId: 'A2' }),
      pendingCard({}, { id: '3', department: 'Other', assetId: 'A3' }),
    ]);
    prisma.asset.findMany = jest.fn().mockResolvedValue([
      { id: 'A1', location: 'P9' }, { id: 'A2', location: 'P1' }, { id: 'A3', location: 'P9' },
    ]);
    const cards: any[] = await service.list(engineer);
    expect(cards.map((c) => c.id)).toEqual(['1', '2']);
  });
});
