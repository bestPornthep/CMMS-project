import { Injector } from '@angular/core';
import { vi } from 'vitest';
import { PmStore } from './pm-store.service';
import { MasterPlanService } from './master-plan.service';
import { PmTaskService } from './pm-task.service';
import { TemplateService } from './template.service';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { isAssetInMasterPlan } from './pm-plan.util';
import { Asset, NewPmTypeDetail, PMTask, User } from '../models/pm.model';

// ── Test doubles ──────────────────────────────────────────────────────────
// Real ApiService needs HttpClient and the real AuthService needs a backend login, so this seam
// is exercised with small hand-written doubles. Nothing here ever reaches the network.

const asset = (over: Partial<Asset> & { id: string }): Asset => ({
  name: `Machine ${over.id}`, department: 'Mechanic', location: 'CUST-001', isActive: true, ...over
});

const task = (over: Partial<PMTask> & { id: string; assetId: string }): PMTask => ({
  title: `PM ${over.id}`, description: '', frequency: 'Monthly', nextDueDate: new Date(2026, 5, 1),
  estimatedHours: 1, status: 'Pending', productId: 'CUST-001', department: 'Mechanic', ...over
});

const user = (over: Partial<User> & { employeeId: string }): User => ({
  name: over.employeeId, initials: 'XX', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Mechanic',
  ownedProducts: ['CUST-001'], delegatedProducts: [], permissions: ['pm.create.submit'], ...over
});

const engineer = user({ employeeId: 'ENG-1', baseRole: 'engineer' });
const otherEngineer = user({ employeeId: 'ENG-2', baseRole: 'engineer' });
const manager = user({ employeeId: 'MGR-1', baseRole: 'manager', roleLabel: 'Manager', permissions: ['pm.create.submit', 'pm.masterplan.approve'] });
const technician = user({ employeeId: 'TECH-1', baseRole: 'technician', roleLabel: 'Technician', permissions: [] });

interface SetupOptions {
  assets?: Asset[];
  tasks?: PMTask[];
  user?: User | null;
}

function setup(options: SetupOptions = {}) {
  let currentUser: User | null = options.user === undefined ? manager : options.user;
  const backend = { assets: options.assets ?? [], tasks: options.tasks ?? [] };
  const users = [engineer, otherEngineer, manager, technician];

  const api = {
    getAssets: vi.fn(async () => backend.assets.map(a => ({ ...a }))),
    getTasks: vi.fn(async () => backend.tasks.map(t => ({ ...t }))),
    getTemplates: vi.fn(async () => []),
    createAsset: vi.fn(async () => undefined),
    updateAsset: vi.fn(async () => ({}) as Asset),
    createTask: vi.fn(async (t: PMTask) => t),
    createSchedule: vi.fn(async () => undefined),
    updateSchedule: vi.fn(async () => undefined),
  };
  const auth = {
    currentUser: () => currentUser,
    hasPermission: (p: string) => !!currentUser && currentUser.permissions.includes(p),
    getAccessibleProducts: () => ['CUST-001', 'CUST-002'],
    getUser: (id: string) => users.find(u => u.employeeId === id),
    getAllUsers: () => users,
    init: async () => undefined,
  };

  // A plain injector (no TestBed/DOM needed) is enough for services that only use inject().
  const injector = Injector.create({
    providers: [
      { provide: ApiService, useValue: api }, { provide: AuthService, useValue: auth },
      PmStore, TemplateService, PmTaskService, MasterPlanService
    ]
  });
  const svc = { store: injector.get(PmStore), masterPlan: injector.get(MasterPlanService) };
  return { svc, api, backend, setUser: (u: User | null) => { currentUser = u; } };
}

type Services = ReturnType<typeof setup>['svc'];

const byId = (svc: Services, id: string) => svc.store.assets().find(a => a.id === id);

// ── Ticket 01 — plan status foundation ────────────────────────────────────

describe('PmService — plan status', () => {
  describe('seeding at data load', () => {
    it('puts a machine that has tasks In plan and a machine with none Not in plan', async () => {
      const { svc } = setup({ assets: [asset({ id: 'A' }), asset({ id: 'B' })], tasks: [task({ id: 'T1', assetId: 'A' })] });
      await svc.store.loadData();
      expect(svc.masterPlan.isInMasterPlan('A')).toBe(true);
      expect(svc.masterPlan.isInMasterPlan('B')).toBe(false);
    });

    it('counts a machine whose only tasks are Cancelled as having tasks (it stays In plan)', async () => {
      const { svc } = setup({ assets: [asset({ id: 'A' })], tasks: [task({ id: 'T1', assetId: 'A', status: 'Cancelled' })] });
      await svc.store.loadData();
      expect(svc.masterPlan.isInMasterPlan('A')).toBe(true);
    });

    it('treats an unknown machine id as not in plan', async () => {
      const { svc } = setup();
      await svc.store.loadData();
      expect(svc.masterPlan.isInMasterPlan('NOPE')).toBe(false);
    });
  });

  describe('isAssetInMasterPlan', () => {
    it('counts a machine with no plan status at all as In plan, so today\'s Master Plan is unchanged', () => {
      expect(isAssetInMasterPlan(asset({ id: 'A' }))).toBe(true);
      expect(isAssetInMasterPlan(asset({ id: 'A', isInMasterPlan: true }))).toBe(true);
      expect(isAssetInMasterPlan(asset({ id: 'A', isInMasterPlan: false }))).toBe(false);
    });
  });

  describe('machines created without the backend', () => {
    it('creates a local-only, not-in-plan machine for a mock create and never calls the backend', async () => {
      const { svc, api } = setup();
      await svc.store.loadData();
      await svc.masterPlan.createAsset({ id: 'LOCAL-1', name: 'Local', location: 'CUST-001', department: 'Mechanic' }, { mock: true });
      const created = byId(svc, 'LOCAL-1');
      expect(created?.isLocalOnly).toBe(true);
      expect(svc.masterPlan.isInMasterPlan('LOCAL-1')).toBe(false);
      expect(api.createAsset).not.toHaveBeenCalled();
    });

    it('creates a not-in-plan machine for a real create, which is not local-only', async () => {
      const { svc, api } = setup();
      await svc.store.loadData();
      await svc.masterPlan.createAsset({ id: 'REAL-1', name: 'Real', location: 'CUST-001', department: 'Mechanic' });
      expect(api.createAsset).toHaveBeenCalledTimes(1);
      expect(byId(svc, 'REAL-1')?.isLocalOnly).toBeUndefined();
      expect(svc.masterPlan.isInMasterPlan('REAL-1')).toBe(false);
    });

    it('refuses to create a machine when the user is not allowed to', async () => {
      const { svc } = setup({ user: technician });
      await svc.store.loadData();
      await expect(svc.masterPlan.createAsset({ id: 'X', name: 'X', location: 'CUST-001', department: 'Mechanic' }, { mock: true }))
        .rejects.toThrow(/Unauthorized/);
      expect(byId(svc, 'X')).toBeUndefined();
    });
  });

  describe('data reload (also runs after every login)', () => {
    it('keeps machines created in this session and their plan status', async () => {
      const { svc } = setup({ assets: [asset({ id: 'A' })], tasks: [task({ id: 'T1', assetId: 'A' })] });
      await svc.store.loadData();
      await svc.masterPlan.createAsset({ id: 'LOCAL-1', name: 'Local', location: 'CUST-001', department: 'Mechanic' }, { mock: true });

      await svc.store.loadData();

      expect(svc.store.assets().map(a => a.id).sort()).toEqual(['A', 'LOCAL-1']);
      expect(byId(svc, 'LOCAL-1')?.isLocalOnly).toBe(true);
      expect(svc.masterPlan.isInMasterPlan('LOCAL-1')).toBe(false);
      expect(svc.masterPlan.isInMasterPlan('A')).toBe(true);
    });

    it('lets the backend machine win when it returns the same id as a local machine (no duplicate)', async () => {
      const { svc, backend } = setup();
      await svc.store.loadData();
      await svc.masterPlan.createAsset({ id: 'DUP-1', name: 'Local name', location: 'CUST-001', department: 'Mechanic' }, { mock: true });

      backend.assets = [asset({ id: 'DUP-1', name: 'Backend name' })];
      await svc.store.loadData();

      expect(svc.store.assets().filter(a => a.id === 'DUP-1')).toHaveLength(1);
      expect(byId(svc, 'DUP-1')?.name).toBe('Backend name');
      expect(byId(svc, 'DUP-1')?.isLocalOnly).toBeUndefined();
    });

    it('keeps a machine In plan once it was In plan, even if its tasks are gone on a later load', async () => {
      const { svc, backend } = setup({ assets: [asset({ id: 'A' })], tasks: [task({ id: 'T1', assetId: 'A' })] });
      await svc.store.loadData();
      backend.tasks = [];
      await svc.store.loadData();
      expect(svc.masterPlan.isInMasterPlan('A')).toBe(true);
    });

    it('promotes a seeded Not-in-plan backend machine when tasks appear on a later load', async () => {
      const { svc, backend } = setup({ assets: [asset({ id: 'A' })], tasks: [] });
      await svc.store.loadData();
      expect(svc.masterPlan.isInMasterPlan('A')).toBe(false);
      backend.tasks = [task({ id: 'T1', assetId: 'A' })];
      await svc.store.loadData();
      expect(svc.masterPlan.isInMasterPlan('A')).toBe(true);
    });

    it('keeps open requests, resolved requests, revisions and audit entries', async () => {
      const { svc } = setup({ assets: [asset({ id: 'A' })], tasks: [task({ id: 'T1', assetId: 'A' })] });
      await svc.store.loadData();
      svc.masterPlan.submitMasterPlanChange({ assetId: 'A', assetName: 'Machine A', department: 'Mechanic', changes: { editFields: { name: 'Renamed' } }, note: 'rename' });
      const [first] = svc.masterPlan.pendingMasterPlanChanges();
      await svc.masterPlan.approveMasterPlanChange(first.id);
      svc.masterPlan.submitMasterPlanChange({ assetId: 'A', assetName: 'Renamed', department: 'Mechanic', changes: { editFields: { workCenter: 'WC-9' } }, note: 'wc' });
      const versionsBefore = svc.masterPlan.masterPlanVersions().length;
      const auditBefore = svc.masterPlan.localAuditLogs().length;
      const requestsBefore = svc.masterPlan.pendingMasterPlanChanges().length;

      await svc.store.loadData();

      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(requestsBefore);
      expect(svc.masterPlan.pendingMasterPlanChanges().filter(c => c.status === 'pending')).toHaveLength(1);
      expect(svc.masterPlan.masterPlanVersions()).toHaveLength(versionsBefore);
      expect(svc.masterPlan.localAuditLogs()).toHaveLength(auditBefore);
    });

    it('leaves the current state untouched and rejects with the original error when the reload fails', async () => {
      const { svc, api } = setup({ assets: [asset({ id: 'A' })], tasks: [task({ id: 'T1', assetId: 'A' })] });
      await svc.store.loadData();
      await svc.masterPlan.createAsset({ id: 'LOCAL-1', name: 'Local', location: 'CUST-001', department: 'Mechanic' }, { mock: true });
      const before = svc.store.assets().map(a => ({ ...a }));

      api.getAssets.mockRejectedValueOnce(new Error('backend down'));

      await expect(svc.store.loadData()).rejects.toThrow('backend down');
      expect(svc.store.assets()).toEqual(before);
    });
  });

  describe('revision snapshots', () => {
    it('keeps each machine\'s plan status in the snapshot', async () => {
      const { svc } = setup({ assets: [asset({ id: 'A' })], tasks: [task({ id: 'T1', assetId: 'A' })] });
      await svc.store.loadData();
      await svc.masterPlan.createAsset({ id: 'LOCAL-1', name: 'Local', location: 'CUST-001', department: 'Mechanic' }, { mock: true });
      svc.masterPlan.submitMasterPlanChange({ assetId: 'A', assetName: 'Machine A', department: 'Mechanic', changes: { editFields: { name: 'Renamed' } }, note: 'rename' });
      await svc.masterPlan.approveMasterPlanChange(svc.masterPlan.pendingMasterPlanChanges()[0].id);

      const [snapshot] = svc.masterPlan.masterPlanVersions();
      const snapshotAssets = snapshot.assets;
      expect(isAssetInMasterPlan(snapshotAssets.find(a => a.id === 'A')!)).toBe(true);
      expect(isAssetInMasterPlan(snapshotAssets.find(a => a.id === 'LOCAL-1')!)).toBe(false);
    });
  });
});

// ── Ticket 02 — preview tasks and plan tasks ──────────────────────────────

describe('PmService — preview tasks and plan tasks', () => {
  // Only Date is faked, so promises and timers keep working; 26 Oct 2026 makes the occurrences predictable.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 26, 9, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function inPlanMachine() {
    const ctx = setup({ assets: [asset({ id: 'A' })], tasks: [task({ id: 'T1', assetId: 'A', frequency: 'Monthly' })] });
    await ctx.svc.store.loadData();
    return ctx;
  }

  async function approveChange(ctx: Awaited<ReturnType<typeof inPlanMachine>>, changes: Parameters<MasterPlanService['submitMasterPlanChange']>[0]['changes']) {
    ctx.svc.masterPlan.submitMasterPlanChange({ assetId: 'A', assetName: 'Machine A', department: 'Mechanic', changes, note: 'change' });
    const open = ctx.svc.masterPlan.pendingMasterPlanChanges().find(c => c.status === 'pending')!;
    await ctx.svc.masterPlan.approveMasterPlanChange(open.id);
  }

  const previews = (svc: Services, frequency: string) =>
    svc.store.planTasks().filter(t => t.assetId === 'A' && t.isPreview && t.frequency === frequency);

  it('creates one preview task per occurrence through year-end when a PM type is approved', async () => {
    const ctx = await inPlanMachine();
    await approveChange(ctx, { addPmTypes: ['Weekly'] });

    const weekly = previews(ctx.svc, 'Weekly');
    expect(weekly).toHaveLength(10); // 26 Oct, 2/9/16/23/30 Nov, 7/14/21/28 Dec
    expect(weekly[0].status).toBe('Pending');
    expect(new Set(weekly.map(t => t.id)).size).toBe(10);
    expect(new Set(weekly.map(t => t.scheduleId)).size).toBe(1);
    const dates = weekly.map(t => new Date(t.nextDueDate)).sort((a, b) => a.getTime() - b.getTime());
    expect([dates[0].getMonth(), dates[0].getDate()]).toEqual([9, 26]);
    expect([dates.at(-1)!.getMonth(), dates.at(-1)!.getDate()]).toEqual([11, 28]);
  });

  it('keeps preview tasks out of the real-task view that every other page reads', async () => {
    const ctx = await inPlanMachine();
    await approveChange(ctx, { addPmTypes: ['Weekly'] });

    expect(ctx.svc.store.pmTasks().some(t => t.isPreview)).toBe(false);
    expect(ctx.svc.store.pmTasks().map(t => t.id)).toEqual(['T1']);
    expect(ctx.svc.store.planTasks().some(t => t.id === 'T1')).toBe(true);
  });

  it('never calls the backend for a preview PM type', async () => {
    const ctx = await inPlanMachine();
    await approveChange(ctx, { addPmTypes: ['Weekly'] });

    expect(ctx.api.createTask).not.toHaveBeenCalled();
    expect(ctx.api.createSchedule).not.toHaveBeenCalled();
    expect(ctx.api.updateSchedule).not.toHaveBeenCalled();
  });

  it('counts preview tasks as an active PM type and in the duplicate check (aliases included)', async () => {
    const ctx = await inPlanMachine();
    await approveChange(ctx, { addPmTypes: ['Weekly'] });

    expect(ctx.svc.masterPlan.activeFrequenciesForAsset('A').sort()).toEqual(['Monthly', 'Weekly']);
    expect(ctx.svc.store.findExistingPmOfType('A', 'weekly')).toBeDefined();
    expect(ctx.svc.store.findExistingPmOfType('A', '7 Day(s)')).toBeDefined();
    expect(ctx.svc.store.findExistingPmOfType('A', 'Quarterly')).toBeUndefined();
  });

  it('does not create a second set of preview tasks when the same PM type is added again', async () => {
    const ctx = await inPlanMachine();
    await approveChange(ctx, { addPmTypes: ['Weekly'] });

    ctx.svc.masterPlan.submitMasterPlanChange({ assetId: 'A', assetName: 'Machine A', department: 'Mechanic', changes: { addPmTypes: ['weekly'] }, note: 'again' });

    expect(ctx.svc.masterPlan.pendingMasterPlanChanges().filter(c => c.status === 'pending')).toHaveLength(0);
    expect(previews(ctx.svc, 'Weekly')).toHaveLength(10);
  });

  it('cancels the preview tasks of a removed PM type (kept, with a reason) without touching the backend', async () => {
    const ctx = await inPlanMachine();
    await approveChange(ctx, { addPmTypes: ['Weekly'] });
    await approveChange(ctx, { removePmTypes: ['Weekly'] });

    const weekly = previews(ctx.svc, 'Weekly');
    expect(weekly).toHaveLength(10);
    expect(weekly.every(t => t.status === 'Cancelled' && t.cancelledReason === 'PM type removed' && !!t.cancelledAt)).toBe(true);
    expect(ctx.svc.masterPlan.activeFrequenciesForAsset('A')).toEqual(['Monthly']);
    expect(ctx.api.updateSchedule).not.toHaveBeenCalled();
  });

  it('cancels preview tasks when the machine is deactivated', async () => {
    const ctx = await inPlanMachine();
    await approveChange(ctx, { addPmTypes: ['Weekly'] });
    await approveChange(ctx, { setActive: false });

    expect(previews(ctx.svc, 'Weekly').every(t => t.status === 'Cancelled')).toBe(true);
  });

  it('keeps preview tasks through a data reload', async () => {
    const ctx = await inPlanMachine();
    await approveChange(ctx, { addPmTypes: ['Weekly'] });

    await ctx.svc.store.loadData();

    expect(previews(ctx.svc, 'Weekly')).toHaveLength(10);
    expect(ctx.svc.store.pmTasks().map(t => t.id)).toEqual(['T1']);
  });

  it('marks every preview task as a preview so nothing can mistake it for a saved task', async () => {
    const ctx = await inPlanMachine();
    await approveChange(ctx, { addPmTypes: ['Quarterly'] });

    const quarterly = previews(ctx.svc, 'Quarterly');
    expect(quarterly.length).toBeGreaterThan(0);
    expect(quarterly.every(t => t.isPreview === true && t.id.startsWith('PREVIEW-'))).toBe(true);
  });
});

// ── Ticket 03 — direct changes while Not in plan ──────────────────────────

describe('PmService — direct changes while not in plan', () => {
  // A = In plan (has a task), N = Not in plan (no tasks), both backend machines.
  async function twoMachines(user: User | null = engineer) {
    const ctx = setup({ user, assets: [asset({ id: 'A', workCenter: 'WC-A' }), asset({ id: 'N', workCenter: 'WC-N' })], tasks: [task({ id: 'T1', assetId: 'A' })] });
    await ctx.svc.store.loadData();
    return ctx;
  }
  const newMachine = (over: Partial<Parameters<MasterPlanService['addMachine']>[0]> = {}) =>
    ({ id: 'M-1', name: 'Mill 1', location: 'CUST-001', department: 'Mechanic', workCenter: 'WC-01', ...over });

  describe('addMachine', () => {
    it('creates the machine at once: Not in plan, local-only, no request, no backend call', async () => {
      const { svc, api } = await twoMachines();
      await svc.masterPlan.addMachine(newMachine());

      const created = byId(svc, 'M-1');
      expect(created).toMatchObject({ id: 'M-1', name: 'Mill 1', location: 'CUST-001', department: 'Mechanic', workCenter: 'WC-01', isActive: true });
      expect(created?.isLocalOnly).toBe(true);
      expect(svc.masterPlan.isInMasterPlan('M-1')).toBe(false);
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(0);
      expect(svc.masterPlan.localAuditLogs()).toHaveLength(0);
      expect(api.createAsset).not.toHaveBeenCalled();
      expect(svc.store.activeAssets().some(a => a.id === 'M-1')).toBe(true);
    });

    it('stores trimmed values', async () => {
      const { svc } = await twoMachines();
      await svc.masterPlan.addMachine(newMachine({ id: '  M-2 ', name: ' Mill 2 ', location: ' CUST-001 ', department: ' Mechanic ', workCenter: ' WC-02 ' }));
      expect(byId(svc, 'M-2')).toMatchObject({ name: 'Mill 2', location: 'CUST-001', department: 'Mechanic', workCenter: 'WC-02' });
    });

    it.each([['A'], ['a'], ['  A  '], ['n']])('refuses a duplicate machine id "%s" (case-insensitive, trimmed) and adds nothing', async id => {
      const { svc } = await twoMachines();
      const before = svc.store.assets().length;
      await expect(svc.masterPlan.addMachine(newMachine({ id }))).rejects.toThrow(/already exists/);
      expect(svc.store.assets()).toHaveLength(before);
    });

    it('refuses a second add of the same id', async () => {
      const { svc } = await twoMachines();
      await svc.masterPlan.addMachine(newMachine());
      await expect(svc.masterPlan.addMachine(newMachine({ id: 'm-1' }))).rejects.toThrow(/already exists/);
      expect(svc.store.assets().filter(a => a.id.toLowerCase() === 'm-1')).toHaveLength(1);
    });

    it.each(['id', 'name', 'location', 'department', 'workCenter'] as const)('refuses a blank %s', async field => {
      const { svc } = await twoMachines();
      const before = svc.store.assets().length;
      await expect(svc.masterPlan.addMachine(newMachine({ [field]: '   ' }))).rejects.toThrow(/required/);
      expect(svc.store.assets()).toHaveLength(before);
    });

    it('refuses a user who is not allowed to create machines, and a logged-out session', async () => {
      const technicianCtx = await twoMachines(technician);
      await expect(technicianCtx.svc.masterPlan.addMachine(newMachine())).rejects.toThrow(/Unauthorized/);
      expect(byId(technicianCtx.svc, 'M-1')).toBeUndefined();

      const loggedOut = await twoMachines(null);
      await expect(loggedOut.svc.masterPlan.addMachine(newMachine())).rejects.toThrow(/Unauthorized/);
    });

    it('lets the new machine be edited and deactivated at once afterwards', async () => {
      const { svc } = await twoMachines();
      await svc.masterPlan.addMachine(newMachine());
      expect(await svc.masterPlan.editMachine('M-1', { name: 'Mill One' })).toBe('applied');
      expect(await svc.masterPlan.setMachineActive('M-1', false)).toBe('applied');
      expect(byId(svc, 'M-1')).toMatchObject({ name: 'Mill One', isActive: false });
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(0);
    });
  });

  describe('editMachine', () => {
    it('applies at once on a Not-in-plan machine: no request, no audit entry, no backend call', async () => {
      const { svc, api } = await twoMachines();
      expect(await svc.masterPlan.editMachine('N', { name: 'Renamed', workCenter: 'WC-9' })).toBe('applied');

      expect(byId(svc, 'N')).toMatchObject({ name: 'Renamed', workCenter: 'WC-9', department: 'Mechanic' });
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(0);
      expect(svc.masterPlan.localAuditLogs()).toHaveLength(0);
      expect(api.updateAsset).not.toHaveBeenCalled();
    });

    it('changes nothing and says "unchanged" when the values are the same (or differ only by whitespace)', async () => {
      const { svc } = await twoMachines();
      expect(await svc.masterPlan.editMachine('N', { name: 'Machine N', workCenter: 'WC-N' })).toBe('unchanged');
      expect(await svc.masterPlan.editMachine('N', { name: '  Machine N  ' })).toBe('unchanged');
      expect(byId(svc, 'N')?.name).toBe('Machine N');
    });

    it('creates an approval request for an In-plan machine and leaves the machine untouched until approved', async () => {
      const { svc } = await twoMachines();
      expect(await svc.masterPlan.editMachine('A', { name: 'Renamed' })).toBe('submitted');

      expect(byId(svc, 'A')?.name).toBe('Machine A');
      const [request] = svc.masterPlan.pendingMasterPlanChanges();
      expect(request).toMatchObject({ assetId: 'A', status: 'pending' });
      expect(request.proposedState.editFields).toEqual({ name: 'Renamed' });
    });

    it('keeps a waiting rename when a later edit changes only another field', async () => {
      const { svc } = await twoMachines();
      await svc.masterPlan.editMachine('A', { name: 'Renamed' });
      // The edit form starts from the live values, so the untouched name arrives unchanged.
      expect(await svc.masterPlan.editMachine('A', { name: 'Machine A', workCenter: 'WC-NEW' })).toBe('submitted');

      const pending = svc.masterPlan.pendingMasterPlanChanges().filter(c => c.status === 'pending');
      expect(pending).toHaveLength(1);
      expect(pending[0].proposedState.editFields).toEqual({ name: 'Renamed', workCenter: 'WC-NEW' });
    });

    it('refuses a blank field and changes nothing', async () => {
      const { svc } = await twoMachines();
      await expect(svc.masterPlan.editMachine('N', { name: '   ' })).rejects.toThrow(/required/);
      await expect(svc.masterPlan.editMachine('N', { workCenter: '' })).rejects.toThrow(/required/);
      expect(byId(svc, 'N')?.name).toBe('Machine N');
    });

    it('refuses an unknown machine', async () => {
      const { svc } = await twoMachines();
      await expect(svc.masterPlan.editMachine('NOPE', { name: 'x' })).rejects.toThrow(/not found/);
    });

    it('refuses a user who is not allowed, on both routes', async () => {
      const { svc } = await twoMachines(technician);
      await expect(svc.masterPlan.editMachine('N', { name: 'x' })).rejects.toThrow(/Unauthorized/);
      await expect(svc.masterPlan.editMachine('A', { name: 'x' })).rejects.toThrow(/Unauthorized/);
      expect(byId(svc, 'N')?.name).toBe('Machine N');
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(0);
    });
  });

  describe('setMachineActive', () => {
    it('deactivates a Not-in-plan machine at once, stamping the deactivation time', async () => {
      const { svc } = await twoMachines();
      expect(await svc.masterPlan.setMachineActive('N', false)).toBe('applied');
      expect(byId(svc, 'N')?.isActive).toBe(false);
      expect(byId(svc, 'N')?.deactivatedAt).toBeInstanceOf(Date);
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(0);
    });

    it('reactivates it at once and clears the deactivation time', async () => {
      const { svc } = await twoMachines();
      await svc.masterPlan.setMachineActive('N', false);
      expect(await svc.masterPlan.setMachineActive('N', true)).toBe('applied');
      expect(byId(svc, 'N')?.isActive).toBe(true);
      expect(byId(svc, 'N')?.deactivatedAt).toBeUndefined();
    });

    it('says "unchanged" when a Not-in-plan machine is already in the requested state', async () => {
      const { svc } = await twoMachines();
      expect(await svc.masterPlan.setMachineActive('N', true)).toBe('unchanged');
      await svc.masterPlan.setMachineActive('N', false);
      expect(await svc.masterPlan.setMachineActive('N', false)).toBe('unchanged');
    });

    it('creates an approval request for an In-plan machine and leaves it active until approved', async () => {
      const { svc } = await twoMachines();
      expect(await svc.masterPlan.setMachineActive('A', false)).toBe('submitted');
      expect(byId(svc, 'A')?.isActive).toBe(true);
      expect(svc.masterPlan.pendingMasterPlanChanges()[0].proposedState.setActive).toBe(false);
    });

    it('refuses an unknown machine and an unauthorized user', async () => {
      const { svc } = await twoMachines();
      await expect(svc.masterPlan.setMachineActive('NOPE', false)).rejects.toThrow(/not found/);
      const denied = await twoMachines(technician);
      await expect(denied.svc.masterPlan.setMachineActive('N', false)).rejects.toThrow(/Unauthorized/);
      expect(byId(denied.svc, 'N')?.isActive).toBe(true);
    });
  });

  describe('generic request submission', () => {
    it('refuses a Not-in-plan machine, because its changes apply directly', async () => {
      const { svc } = await twoMachines();
      expect(() => svc.masterPlan.submitMasterPlanChange({
        assetId: 'N', assetName: 'Machine N', department: 'Mechanic', changes: { editFields: { name: 'x' } }, note: 'n'
      })).toThrow(/not in the Master Plan/);
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(0);
    });

    it('still accepts an In-plan machine', async () => {
      const { svc } = await twoMachines();
      svc.masterPlan.submitMasterPlanChange({ assetId: 'A', assetName: 'Machine A', department: 'Mechanic', changes: { editFields: { name: 'x' } }, note: 'n' });
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(1);
    });

    it('refuses a machine that does not exist (a request can no longer carry a new machine)', async () => {
      const { svc } = await twoMachines();
      expect(() => svc.masterPlan.submitMasterPlanChange({
        assetId: 'NOPE', assetName: 'Nope', department: 'Mechanic', changes: { addPmTypes: ['Weekly'] }, note: 'n'
      })).toThrow('Machine not found.');
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(0);
    });
  });
});

// ── Ticket 04 — a machine's PM types (what the detail modal lists) ────────

describe('PmService — pmTypesFor (machine detail)', () => {
  const due = (m: number, d: number) => new Date(2026, m, d);

  async function machineWithTasks(tasks: PMTask[], user: User | null = manager) {
    const ctx = setup({ user, assets: [asset({ id: 'A' }), asset({ id: 'N' })], tasks });
    await ctx.svc.store.loadData();
    return ctx;
  }

  it('lists each PM type once, with the details of its earliest open task', async () => {
    const { svc } = await machineWithTasks([
      task({ id: 'W2', assetId: 'A', frequency: 'Weekly', title: 'Weekly check', nextDueDate: due(10, 9), estimatedHours: 0.5, scheduleId: 'S-W', description: 'Walk-around', partsRequired: ['Filter'],
        checklist: [{ text: 'Check oil', done: false, requiresPhoto: true }, { text: 'Read gauge', done: false, requiresValue: true }] }),
      task({ id: 'W1', assetId: 'A', frequency: 'Weekly', title: 'Weekly check', nextDueDate: due(10, 2), estimatedHours: 0.5, scheduleId: 'S-W', description: 'Walk-around', partsRequired: ['Filter'],
        checklist: [{ text: 'Check oil', done: false, requiresPhoto: true }, { text: 'Read gauge', done: false, requiresValue: true }] }),
    ]);

    const types = svc.masterPlan.pmTypesFor('A');
    expect(types).toHaveLength(1);
    expect(types[0]).toMatchObject({
      frequency: 'Weekly', title: 'Weekly check', state: 'live', isRecurring: true, estimatedHours: 0.5, description: 'Walk-around', parts: ['Filter']
    });
    expect(types[0].firstDue?.getTime()).toBe(due(10, 2).getTime());
    expect(types[0].checklist).toEqual([
      { text: 'Check oil', requiresPhoto: true, requiresValue: undefined },
      { text: 'Read gauge', requiresPhoto: undefined, requiresValue: true }
    ]);
  });

  it('orders PM types by cadence, custom frequencies included', async () => {
    const { svc } = await machineWithTasks([
      task({ id: '1', assetId: 'A', frequency: 'Yearly' }),
      task({ id: '2', assetId: 'A', frequency: 'Monthly' }),
      task({ id: '3', assetId: 'A', frequency: '2 Week(s)' }),
      task({ id: '4', assetId: 'A', frequency: 'Weekly' }),
      task({ id: '5', assetId: 'A', frequency: 'Daily' }),
      task({ id: '6', assetId: 'A', frequency: 'Whenever' }),
    ]);
    expect(svc.masterPlan.pmTypesFor('A').map(t => t.frequency)).toEqual(['Daily', 'Weekly', '2 Week(s)', 'Monthly', 'Yearly', 'Whenever']);
  });

  it('leaves out cancelled PM types but keeps a type whose only tasks are completed', async () => {
    const { svc } = await machineWithTasks([
      task({ id: '1', assetId: 'A', frequency: 'Weekly', status: 'Cancelled' }),
      task({ id: '2', assetId: 'A', frequency: 'Monthly', status: 'Done' }),
    ]);
    const types = svc.masterPlan.pmTypesFor('A');
    expect(types.map(t => t.frequency)).toEqual(['Monthly']);
    expect(types[0].firstDue).toBeUndefined();
  });

  it('treats a PM type with no series as one-off', async () => {
    const { svc } = await machineWithTasks([task({ id: '1', assetId: 'A', frequency: 'Monthly' })]);
    expect(svc.masterPlan.pmTypesFor('A')[0].isRecurring).toBe(false);
  });

  it('recognises a recurring series by its [SeriesID] tag and hides the tag from the description', async () => {
    const { svc } = await machineWithTasks([
      task({ id: '1', assetId: 'A', frequency: 'Monthly', description: 'Check belts.\n[SeriesID: SCH-123]' }),
      task({ id: '2', assetId: 'A', frequency: 'Weekly', description: '[SeriesID: SCH-456]' }),
    ]);
    const [weekly, monthly] = svc.masterPlan.pmTypesFor('A');
    expect(monthly).toMatchObject({ frequency: 'Monthly', isRecurring: true, description: 'Check belts.' });
    expect(weekly).toMatchObject({ frequency: 'Weekly', isRecurring: true });
    expect(weekly.description).toBeUndefined();
  });

  it('omits fields a task does not have instead of inventing them', async () => {
    const { svc } = await machineWithTasks([task({ id: '1', assetId: 'A', description: '', partsRequired: undefined, checklist: undefined })]);
    const [type] = svc.masterPlan.pmTypesFor('A');
    expect(type.description).toBeUndefined();
    expect(type.parts).toEqual([]);
    expect(type.checklist).toEqual([]);
  });

  it('does not mix in another machine\'s tasks, and answers [] for unknown machines', async () => {
    const { svc } = await machineWithTasks([task({ id: '1', assetId: 'A' }), task({ id: '2', assetId: 'N', frequency: 'Yearly' })]);
    expect(svc.masterPlan.pmTypesFor('A').map(t => t.frequency)).toEqual(['Monthly']);
    expect(svc.masterPlan.pmTypesFor('NOPE')).toEqual([]);
  });

  it('includes preview PM types approved into the plan', async () => {
    const { svc } = await machineWithTasks([task({ id: '1', assetId: 'A', frequency: 'Monthly' })]);
    svc.masterPlan.submitMasterPlanChange({ assetId: 'A', assetName: 'Machine A', department: 'Mechanic', changes: { addPmTypes: ['Weekly'] }, note: 'add' });
    await svc.masterPlan.approveMasterPlanChange(svc.masterPlan.pendingMasterPlanChanges()[0].id);
    expect(svc.masterPlan.pmTypesFor('A').map(t => `${t.frequency}:${t.state}`)).toEqual(['Weekly:live', 'Monthly:live']);
  });

  describe('changes waiting for approval on an In-plan machine', () => {
    it('shows a waiting add as an extra entry with its details', async () => {
      const { svc } = await machineWithTasks([task({ id: '1', assetId: 'A', frequency: 'Monthly' })]);
      svc.masterPlan.submitMasterPlanChange({
        assetId: 'A', assetName: 'Machine A', department: 'Mechanic', note: 'add',
        changes: { addPmTypes: ['Quarterly'], newPmTypeDetails: { Quarterly: { title: 'Quarterly overhaul', estimatedHours: 3, partsRequired: ['Belt'], checklist: [{ text: 'Replace belt' }], startDate: due(11, 1), isRecurring: true } } }
      });

      const waiting = svc.masterPlan.pmTypesFor('A').find(t => t.state === 'waiting-add')!;
      expect(waiting).toMatchObject({ frequency: 'Quarterly', title: 'Quarterly overhaul', estimatedHours: 3, parts: ['Belt'], isRecurring: true });
      expect(waiting.firstDue?.getTime()).toBe(due(11, 1).getTime());
      expect(waiting.checklist).toEqual([{ text: 'Replace belt', requiresPhoto: undefined, requiresValue: undefined }]);
    });

    it('shows a waiting add without details using a plain title and no invented fields', async () => {
      const { svc } = await machineWithTasks([task({ id: '1', assetId: 'A', frequency: 'Monthly' })]);
      svc.masterPlan.submitMasterPlanChange({ assetId: 'A', assetName: 'Machine A', department: 'Mechanic', changes: { addPmTypes: ['Yearly'] }, note: 'add' });
      const waiting = svc.masterPlan.pmTypesFor('A').find(t => t.state === 'waiting-add')!;
      expect(waiting).toMatchObject({ frequency: 'Yearly', title: 'Yearly PM', parts: [], checklist: [] });
      expect(waiting.estimatedHours).toBeUndefined();
      expect(waiting.isRecurring).toBeUndefined();
    });

    it('tags an existing PM type that has a waiting removal', async () => {
      const { svc } = await machineWithTasks([task({ id: '1', assetId: 'A', frequency: 'Monthly' }), task({ id: '2', assetId: 'A', frequency: 'Weekly' })]);
      svc.masterPlan.submitMasterPlanChange({ assetId: 'A', assetName: 'Machine A', department: 'Mechanic', changes: { removePmTypes: ['monthly'] }, note: 'remove' });
      expect(svc.masterPlan.pmTypesFor('A').map(t => `${t.frequency}:${t.state}`)).toEqual(['Weekly:live', 'Monthly:waiting-remove']);
    });

    it('does not show a second entry for a type that became live while its add request was still waiting', async () => {
      const monthly = task({ id: '1', assetId: 'A', frequency: 'Monthly' });
      const { svc, backend } = await machineWithTasks([monthly]);
      svc.masterPlan.submitMasterPlanChange({ assetId: 'A', assetName: 'Machine A', department: 'Mechanic', changes: { addPmTypes: ['Weekly'] }, note: 'add' });

      backend.tasks = [monthly, task({ id: '2', assetId: 'A', frequency: 'Weekly' })];
      await svc.store.loadData();

      expect(svc.masterPlan.pmTypesFor('A').filter(t => t.frequency === 'Weekly').map(t => t.state)).toEqual(['live']);
    });

    it('ignores resolved requests', async () => {
      const { svc } = await machineWithTasks([task({ id: '1', assetId: 'A', frequency: 'Monthly' })]);
      svc.masterPlan.submitMasterPlanChange({ assetId: 'A', assetName: 'Machine A', department: 'Mechanic', changes: { removePmTypes: ['Monthly'] }, note: 'remove' });
      svc.masterPlan.rejectMasterPlanChange(svc.masterPlan.pendingMasterPlanChanges()[0].id, 'no');
      expect(svc.masterPlan.pmTypesFor('A').map(t => t.state)).toEqual(['live']);
    });
  });

  describe('machines that are not in the plan', () => {
    it('has no PM types yet', async () => {
      const { svc } = await machineWithTasks([task({ id: '1', assetId: 'A' })]);
      expect(svc.masterPlan.isInMasterPlan('N')).toBe(false);
      expect(svc.masterPlan.pmTypesFor('N')).toEqual([]);
    });
  });
});

// ── Ticket 05 — draft PM types ────────────────────────────────────────────

describe('PmService — draft PM types', () => {
  // A = In plan, N = Not in plan, I = Not in plan and inactive.
  async function machines(user: User | null = engineer) {
    const ctx = setup({
      user,
      assets: [asset({ id: 'A' }), asset({ id: 'N' }), asset({ id: 'I', isActive: false })],
      tasks: [task({ id: 'T1', assetId: 'A', frequency: 'Monthly' })]
    });
    await ctx.svc.store.loadData();
    return ctx;
  }
  const detail = (over: Partial<NewPmTypeDetail> = {}): NewPmTypeDetail => ({
    title: 'Weekly check', description: 'Walk around', estimatedHours: 1.5, partsRequired: ['Filter'],
    checklist: [{ text: 'Check oil', requiresPhoto: true }], startDate: new Date(2026, 10, 2), isRecurring: true, ...over
  });

  describe('addDraftPmType', () => {
    it('saves a draft with no approval, no task and no backend call', async () => {
      const { svc, api } = await machines();
      svc.masterPlan.addDraftPmType('N', 'Weekly', detail());

      const drafts = svc.masterPlan.draftPmTypesFor('N');
      expect(drafts).toHaveLength(1);
      expect(drafts[0].frequency).toBe('Weekly');
      expect(drafts[0].detail).toMatchObject({ title: 'Weekly check', estimatedHours: 1.5, isRecurring: true });
      expect(svc.store.pmTasks().map(t => t.id)).toEqual(['T1']);
      expect(svc.store.planTasks().map(t => t.id)).toEqual(['T1']);
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(0);
      expect(svc.masterPlan.localAuditLogs()).toHaveLength(0);
      expect(api.createTask).not.toHaveBeenCalled();
      expect(api.createSchedule).not.toHaveBeenCalled();
    });

    it('trims the frequency and title and keeps its own copy of the lists', async () => {
      const { svc } = await machines();
      const parts = ['Filter'];
      const checklist = [{ text: 'Check oil' }];
      svc.masterPlan.addDraftPmType('N', '  Weekly ', detail({ title: '  Weekly check  ', partsRequired: parts, checklist }));
      parts.push('Belt');
      checklist.push({ text: 'Added later' });

      const [draft] = svc.masterPlan.draftPmTypesFor('N');
      expect(draft.frequency).toBe('Weekly');
      expect(draft.detail.title).toBe('Weekly check');
      expect(draft.detail.partsRequired).toEqual(['Filter']);
      expect(draft.detail.checklist).toEqual([{ text: 'Check oil', requiresPhoto: undefined, requiresValue: undefined }]);
    });

    it('drops checklist items with blank text', async () => {
      const { svc } = await machines();
      svc.masterPlan.addDraftPmType('N', 'Weekly', detail({ checklist: [{ text: '  ' }, { text: 'Real step' }] }));
      expect(svc.masterPlan.draftPmTypesFor('N')[0].detail.checklist?.map(i => i.text)).toEqual(['Real step']);
    });

    it('accepts a draft with only a title (everything else is optional)', async () => {
      const { svc } = await machines();
      svc.masterPlan.addDraftPmType('N', 'Monthly', { title: 'Bare minimum' });
      expect(svc.masterPlan.draftPmTypesFor('N')).toHaveLength(1);
    });

    it('keeps each machine\'s drafts apart', async () => {
      const { svc } = await machines();
      svc.masterPlan.addDraftPmType('N', 'Weekly', detail());
      expect(svc.masterPlan.draftPmTypesFor('I')).toEqual([]);
      expect(svc.masterPlan.draftPmTypesFor('NOPE')).toEqual([]);
    });

    it('keeps drafts through a data reload and through deactivating and reactivating the machine', async () => {
      const { svc } = await machines();
      svc.masterPlan.addDraftPmType('N', 'Weekly', detail());

      await svc.store.loadData();
      expect(svc.masterPlan.draftPmTypesFor('N')).toHaveLength(1);

      await svc.masterPlan.setMachineActive('N', false);
      await svc.masterPlan.setMachineActive('N', true);
      expect(svc.masterPlan.draftPmTypesFor('N')).toHaveLength(1);
    });

    describe('one PM type per machine and frequency', () => {
      it('refuses the same frequency twice, ignoring case and whitespace', async () => {
        const { svc } = await machines();
        svc.masterPlan.addDraftPmType('N', 'Weekly', detail());
        expect(() => svc.masterPlan.addDraftPmType('N', ' weekly ', detail())).toThrow(/already has a .*PM/);
        expect(svc.masterPlan.draftPmTypesFor('N')).toHaveLength(1);
      });

      it('treats a custom duration equal to a preset as the same type', async () => {
        const { svc } = await machines();
        svc.masterPlan.addDraftPmType('N', 'Monthly', detail());
        expect(() => svc.masterPlan.addDraftPmType('N', '1 Month(s)', detail())).toThrow(/already has a .*PM/);
        svc.masterPlan.addDraftPmType('N', '2 Month(s)', detail());
        expect(svc.masterPlan.draftPmTypesFor('N')).toHaveLength(2);
      });

      it('allows the same frequency on another machine', async () => {
        const { svc } = await machines();
        await svc.masterPlan.setMachineActive('I', true); // the fixture machine "I" starts inactive
        svc.masterPlan.addDraftPmType('N', 'Weekly', detail());
        svc.masterPlan.addDraftPmType('I', 'Weekly', detail());
        expect(svc.masterPlan.draftPmTypesFor('I')).toHaveLength(1);
      });

      it('reports drafts and live PM types through hasPmType', async () => {
        const { svc } = await machines();
        svc.masterPlan.addDraftPmType('N', 'Weekly', detail());
        expect(svc.masterPlan.hasPmType('N', 'weekly')).toBe(true);
        expect(svc.masterPlan.hasPmType('N', 'Monthly')).toBe(false);
        expect(svc.masterPlan.hasPmType('A', 'Monthly')).toBe(true);
        expect(svc.masterPlan.hasPmType('NOPE', 'Monthly')).toBe(false);
      });
    });

    describe('refusals leave no partial state', () => {
      const cases: [string, () => ReturnType<typeof machines>, (svc: Services) => void, RegExp][] = [
        ['an unknown machine', () => machines(), svc => svc.masterPlan.addDraftPmType('NOPE', 'Weekly', detail()), /not found/],
        ['an In-plan machine (its PM types go through approval)', () => machines(), svc => svc.masterPlan.addDraftPmType('A', 'Weekly', detail()), /Master Plan/],
        ['an inactive machine', () => machines(), svc => svc.masterPlan.addDraftPmType('I', 'Weekly', detail()), /Reactivate/],
        ['a user who is not allowed', () => machines(technician), svc => svc.masterPlan.addDraftPmType('N', 'Weekly', detail()), /Unauthorized/],
        ['a logged-out session', () => machines(null), svc => svc.masterPlan.addDraftPmType('N', 'Weekly', detail()), /Unauthorized/],
        ['a blank frequency', () => machines(), svc => svc.masterPlan.addDraftPmType('N', '   ', detail()), /frequency/],
        ['a blank title', () => machines(), svc => svc.masterPlan.addDraftPmType('N', 'Weekly', detail({ title: '  ' })), /title/],
        ['zero hours', () => machines(), svc => svc.masterPlan.addDraftPmType('N', 'Weekly', detail({ estimatedHours: 0 })), /hours/],
        ['negative hours', () => machines(), svc => svc.masterPlan.addDraftPmType('N', 'Weekly', detail({ estimatedHours: -2 })), /hours/],
        ['NaN hours', () => machines(), svc => svc.masterPlan.addDraftPmType('N', 'Weekly', detail({ estimatedHours: NaN })), /hours/],
        ['infinite hours', () => machines(), svc => svc.masterPlan.addDraftPmType('N', 'Weekly', detail({ estimatedHours: Infinity })), /hours/],
        ['an invalid first due date', () => machines(), svc => svc.masterPlan.addDraftPmType('N', 'Weekly', detail({ startDate: new Date('nope') })), /date/],
      ];
      it.each(cases)('%s', async (_name, build, act, message) => {
        const { svc } = await build();
        expect(() => act(svc)).toThrow(message);
        expect(svc.masterPlan.draftPmTypesFor('N')).toEqual([]);
        expect(svc.masterPlan.draftPmTypesFor('I')).toEqual([]);
        expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(0);
      });
    });
  });

  describe('removeDraftPmType', () => {
    it('removes a draft at once (case and whitespace ignored) and leaves the others', async () => {
      const { svc } = await machines();
      svc.masterPlan.addDraftPmType('N', 'Weekly', detail());
      svc.masterPlan.addDraftPmType('N', 'Monthly', detail({ title: 'Monthly check' }));
      svc.masterPlan.removeDraftPmType('N', ' weekly ');
      expect(svc.masterPlan.draftPmTypesFor('N').map(d => d.frequency)).toEqual(['Monthly']);
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(0);
    });

    it('lets the same frequency be added again afterwards', async () => {
      const { svc } = await machines();
      svc.masterPlan.addDraftPmType('N', 'Weekly', detail());
      svc.masterPlan.removeDraftPmType('N', 'Weekly');
      svc.masterPlan.addDraftPmType('N', 'Weekly', detail());
      expect(svc.masterPlan.draftPmTypesFor('N')).toHaveLength(1);
    });

    it('refuses a draft that does not exist, an unknown machine, an In-plan machine and an unauthorized user', async () => {
      const { svc } = await machines();
      expect(() => svc.masterPlan.removeDraftPmType('N', 'Weekly')).toThrow(/not a draft/);
      expect(() => svc.masterPlan.removeDraftPmType('NOPE', 'Weekly')).toThrow(/not found/);
      expect(() => svc.masterPlan.removeDraftPmType('A', 'Monthly')).toThrow(/Master Plan/);
      const denied = await machines(technician);
      expect(() => denied.svc.masterPlan.removeDraftPmType('N', 'Weekly')).toThrow(/Unauthorized/);
    });
  });

  describe('removePmType (routes by plan status)', () => {
    it('removes a draft at once on a Not-in-plan machine', async () => {
      const { svc } = await machines();
      svc.masterPlan.addDraftPmType('N', 'Weekly', detail());
      expect(svc.masterPlan.removePmType('N', 'Weekly')).toBe('applied');
      expect(svc.masterPlan.draftPmTypesFor('N')).toEqual([]);
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(0);
    });

    it('creates an approval request on an In-plan machine and keeps its PM type until approved', async () => {
      const { svc } = await machines();
      expect(svc.masterPlan.removePmType('A', 'Monthly')).toBe('submitted');
      expect(svc.masterPlan.activeFrequenciesForAsset('A')).toEqual(['Monthly']);
      expect(svc.masterPlan.pendingMasterPlanChanges()[0].proposedState.removePmTypes).toEqual(['Monthly']);
    });

    it('refuses an unknown machine', async () => {
      const { svc } = await machines();
      expect(() => svc.masterPlan.removePmType('NOPE', 'Weekly')).toThrow(/not found/);
    });

    it('lists what can be removed: drafts for a Not-in-plan machine, live types for an In-plan one', async () => {
      const { svc } = await machines();
      svc.masterPlan.addDraftPmType('N', 'Weekly', detail());
      expect(svc.masterPlan.removablePmTypeFrequencies('N')).toEqual(['Weekly']);
      expect(svc.masterPlan.removablePmTypeFrequencies('A')).toEqual(['Monthly']);
      expect(svc.masterPlan.removablePmTypeFrequencies('NOPE')).toEqual([]);
    });
  });

  describe('as PM types of the machine (what the detail window lists)', () => {
    it('shows drafts with the Draft state and their own details, ordered by cadence', async () => {
      const { svc } = await machines();
      svc.masterPlan.addDraftPmType('N', 'Monthly', detail({ title: 'Monthly check', startDate: new Date(2026, 10, 15), isRecurring: false }));
      svc.masterPlan.addDraftPmType('N', 'Weekly', detail());

      const types = svc.masterPlan.pmTypesFor('N');
      expect(types.map(t => `${t.frequency}:${t.state}`)).toEqual(['Weekly:draft', 'Monthly:draft']);
      expect(types[0]).toMatchObject({ title: 'Weekly check', isRecurring: true, estimatedHours: 1.5, description: 'Walk around', parts: ['Filter'] });
      expect(types[0].firstDue?.getTime()).toBe(new Date(2026, 10, 2).getTime());
      expect(types[0].checklist).toEqual([{ text: 'Check oil', requiresPhoto: true, requiresValue: undefined }]);
      expect(types[1].isRecurring).toBe(false);
    });

    it('does not show drafts on an In-plan machine', async () => {
      const { svc } = await machines();
      expect(svc.masterPlan.pmTypesFor('A').every(t => t.state !== 'draft')).toBe(true);
    });
  });
});

// ── Ticket 06 — Send, Withdraw, Approve, Reject ───────────────────────────

describe('PmService — Send to Master Plan', () => {
  // Only Date is faked (26 Oct 2026), so promises keep working and the preview occurrences are predictable.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 26, 9, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const LOCKED = 'This machine is waiting for approval. Withdraw the request to change it.';

  // A = In plan (has a task); N and N2 = Not in plan, active; I = Not in plan, inactive. All backend machines.
  async function machines(u: User | null = engineer) {
    const ctx = setup({
      user: u,
      assets: [asset({ id: 'A' }), asset({ id: 'N' }), asset({ id: 'N2' }), asset({ id: 'I', isActive: false })],
      tasks: [task({ id: 'T1', assetId: 'A', frequency: 'Monthly' })]
    });
    await ctx.svc.store.loadData();
    return ctx;
  }
  const weekly = (): NewPmTypeDetail => ({
    title: 'Weekly check', description: 'Walk around', estimatedHours: 1.5, partsRequired: ['Filter'],
    checklist: [{ text: 'Check oil', requiresPhoto: true }], startDate: new Date(2026, 10, 2), isRecurring: true
  });
  const monthly = (): NewPmTypeDetail => ({ title: 'Monthly check', startDate: new Date(2026, 10, 15), isRecurring: true });
  // Weekly from 2 Nov = 9 occurrences through 28 Dec; Monthly from 15 Nov = 2 (15 Nov, 15 Dec).
  function addDrafts(svc: Services, id = 'N') {
    svc.masterPlan.addDraftPmType(id, 'Weekly', weekly());
    svc.masterPlan.addDraftPmType(id, 'Monthly', monthly());
  }
  async function ready(u: User | null = engineer) {
    const ctx = await machines(engineer);
    addDrafts(ctx.svc);
    ctx.setUser(u);
    return ctx;
  }
  async function sent() {
    const ctx = await ready();
    ctx.svc.masterPlan.sendToMasterPlan('N');
    return { ...ctx, request: ctx.svc.masterPlan.openRequestFor('N')! };
  }
  const previewsOf = (svc: Services, id: string, frequency?: string) =>
    svc.store.planTasks().filter(t => t.assetId === id && t.isPreview && (!frequency || t.frequency === frequency));
  const noBackendWrites = (api: ReturnType<typeof setup>['api']) => {
    expect(api.createTask).not.toHaveBeenCalled();
    expect(api.createSchedule).not.toHaveBeenCalled();
    expect(api.updateSchedule).not.toHaveBeenCalled();
    expect(api.updateAsset).not.toHaveBeenCalled();
    expect(api.createAsset).not.toHaveBeenCalled();
  };

  describe('sendBlockedReason', () => {
    it('allows Send for an active Not-in-plan machine with at least one draft', async () => {
      const { svc } = await ready();
      expect(svc.masterPlan.sendBlockedReason('N')).toBeNull();
    });

    it('explains why Send is not allowed, checking unknown, in plan, waiting, inactive, then drafts', async () => {
      const { svc } = await machines();
      expect(svc.masterPlan.sendBlockedReason('NOPE')).toBe('Machine not found.');
      expect(svc.masterPlan.sendBlockedReason('A')).toBe('This machine is already in the Master Plan.');
      expect(svc.masterPlan.sendBlockedReason('N')).toBe('Add at least one PM type before sending.');
      expect(svc.masterPlan.sendBlockedReason('I')).toBe('Reactivate this machine before sending it.');

      addDrafts(svc, 'N');
      await svc.masterPlan.setMachineActive('N', false);
      expect(svc.masterPlan.sendBlockedReason('N')).toBe('Reactivate this machine before sending it.');
      await svc.masterPlan.setMachineActive('N', true);
      svc.masterPlan.sendToMasterPlan('N');
      expect(svc.masterPlan.sendBlockedReason('N')).toBe('This machine is already waiting for approval.');
    });
  });

  describe('sendToMasterPlan', () => {
    it('creates one open request with the add-to-plan intent and every draft, and leaves the machine Not in plan', async () => {
      const { svc, api } = await ready();
      svc.masterPlan.sendToMasterPlan('N');

      const requests = svc.masterPlan.pendingMasterPlanChanges();
      expect(requests).toHaveLength(1);
      const [request] = requests;
      expect(request).toMatchObject({
        assetId: 'N', assetName: 'Machine N', department: 'Mechanic', status: 'pending',
        submittedBy: 'ENG-1', note: 'Send Machine N to the Master Plan'
      });
      expect(request.history).toHaveLength(1);
      expect(request.history[0]).toMatchObject({ by: 'ENG-1', note: 'Send Machine N to the Master Plan' });
      expect(request.proposedState.addToPlan).toBe(true);
      expect(request.proposedState.addPmTypes).toEqual(['Weekly', 'Monthly']);
      expect(request.proposedState.newPmTypeDetails).toEqual({
        Weekly: svc.masterPlan.draftPmTypesFor('N')[0].detail,
        Monthly: svc.masterPlan.draftPmTypesFor('N')[1].detail
      });
      expect(svc.masterPlan.isSendRequest(request)).toBe(true);

      expect(svc.masterPlan.isInMasterPlan('N')).toBe(false);
      expect(svc.masterPlan.isWaitingForApproval('N')).toBe(true);
      expect(svc.masterPlan.draftPmTypesFor('N')).toHaveLength(2);
      expect(svc.masterPlan.localAuditLogs()).toHaveLength(0);
      expect(svc.masterPlan.masterPlanVersions()).toHaveLength(0);
      expect(svc.store.planTasks().map(t => t.id)).toEqual(['T1']);
      noBackendWrites(api);
    });

    it('stores a copy of the drafts, not the drafts themselves', async () => {
      const { svc, request } = await sent();
      const draft = svc.masterPlan.draftPmTypesFor('N')[0].detail;
      const snapshot = request.proposedState.newPmTypeDetails!['Weekly'];
      expect(snapshot).toEqual(draft);
      expect(snapshot).not.toBe(draft);
      expect(snapshot.checklist).not.toBe(draft.checklist);
      expect(snapshot.partsRequired).not.toBe(draft.partsRequired);
      expect(snapshot.startDate).not.toBe(draft.startDate);
    });

    it('refuses a second Send while the first one waits (double click) and keeps one request', async () => {
      const { svc } = await ready();
      svc.masterPlan.sendToMasterPlan('N');
      expect(() => svc.masterPlan.sendToMasterPlan('N')).toThrow('This machine is already waiting for approval.');
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(1);
    });

    it.each([
      ['a technician', technician],
      ['a logged-out session', null],
    ])('refuses %s, who cannot propose Master Plan changes', async (_name, who) => {
      const { svc } = await ready(who);
      expect(() => svc.masterPlan.sendToMasterPlan('N')).toThrow('Unauthorized to propose PM Master Plan changes.');
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(0);
      expect(svc.masterPlan.isWaitingForApproval('N')).toBe(false);
    });

    it.each([
      ['a machine with no drafts', 'N2', 'Add at least one PM type before sending.'],
      ['an inactive machine', 'I', 'Reactivate this machine before sending it.'],
      ['an unknown machine', 'NOPE', 'Machine not found.'],
      ['an In-plan machine', 'A', 'This machine is already in the Master Plan.'],
    ])('refuses %s and creates nothing', async (_name, id, message) => {
      const { svc } = await ready();
      expect(() => svc.masterPlan.sendToMasterPlan(id)).toThrow(message);
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(0);
    });

    it('lets a manager send too', async () => {
      const { svc } = await ready(manager);
      svc.masterPlan.sendToMasterPlan('N');
      expect(svc.masterPlan.openRequestFor('N')?.submittedBy).toBe('MGR-1');
    });
  });

  describe('isWaitingForApproval', () => {
    it('is true only for a Not-in-plan machine with an open request', async () => {
      const { svc } = await ready();
      expect(svc.masterPlan.isWaitingForApproval('N')).toBe(false);
      svc.masterPlan.sendToMasterPlan('N');
      expect(svc.masterPlan.isWaitingForApproval('N')).toBe(true);
      expect(await svc.masterPlan.editMachine('A', { name: 'Renamed' })).toBe('submitted');
      expect(svc.masterPlan.isWaitingForApproval('A')).toBe(false);
      expect(svc.masterPlan.isWaitingForApproval('NOPE')).toBe(false);
    });
  });

  describe('lock while waiting for approval', () => {
    const lockedActions: [string, (svc: Services) => unknown][] = [
      ['edit', svc => svc.masterPlan.editMachine('N', { name: 'Renamed' })],
      ['edit with unchanged values', svc => svc.masterPlan.editMachine('N', { name: 'Machine N' })],
      ['deactivate', svc => svc.masterPlan.setMachineActive('N', false)],
      ['reactivate', svc => svc.masterPlan.setMachineActive('N', true)],
      ['add a draft', svc => svc.masterPlan.addDraftPmType('N', 'Quarterly', { title: 'Quarterly check' })],
      ['remove a draft', svc => svc.masterPlan.removeDraftPmType('N', 'Weekly')],
      ['remove a PM type', svc => svc.masterPlan.removePmType('N', 'Weekly')],
    ];

    it.each(lockedActions)('refuses to %s and changes nothing, so the request snapshot cannot drift', async (_name, act) => {
      const { svc, request } = await sent();
      const machineBefore = { ...byId(svc, 'N')! };
      const draftsBefore = svc.masterPlan.draftPmTypesFor('N');
      const proposedBefore = structuredClone(request.proposedState);

      await expect((async () => act(svc))()).rejects.toThrow(LOCKED);

      expect(byId(svc, 'N')).toEqual(machineBefore);
      expect(svc.masterPlan.draftPmTypesFor('N')).toEqual(draftsBefore);
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(1);
      expect(svc.masterPlan.openRequestFor('N')?.proposedState).toEqual(proposedBefore);
    });

    it('allows every change again after Withdraw', async () => {
      const { svc } = await sent();
      svc.masterPlan.withdrawSendRequest('N');

      expect(await svc.masterPlan.editMachine('N', { name: 'Renamed' })).toBe('applied');
      svc.masterPlan.addDraftPmType('N', 'Quarterly', { title: 'Quarterly check' });
      svc.masterPlan.removeDraftPmType('N', 'Quarterly');
      expect(svc.masterPlan.removePmType('N', 'Weekly')).toBe('applied');
      expect(await svc.masterPlan.setMachineActive('N', false)).toBe('applied');
      expect(await svc.masterPlan.setMachineActive('N', true)).toBe('applied');
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(0);
    });

    it('does not lock an In-plan machine: its changes still merge into its one open request', async () => {
      const { svc } = await ready();
      svc.masterPlan.sendToMasterPlan('N');
      expect(await svc.masterPlan.editMachine('A', { name: 'Renamed' })).toBe('submitted');
      expect(await svc.masterPlan.setMachineActive('A', false)).toBe('submitted');
      const open = svc.masterPlan.pendingMasterPlanChanges().filter(c => c.assetId === 'A' && c.status === 'pending');
      expect(open).toHaveLength(1);
      expect(open[0].proposedState).toMatchObject({ editFields: { name: 'Renamed' }, setActive: false });
    });

    it('still lists the drafts as drafts while waiting', async () => {
      const { svc } = await sent();
      expect(svc.masterPlan.pmTypesFor('N').map(t => `${t.frequency}:${t.state}`)).toEqual(['Weekly:draft', 'Monthly:draft']);
    });
  });

  describe('withdrawSendRequest', () => {
    it('lets the sender withdraw: the request is deleted, the machine unlocked, drafts intact, no audit entry', async () => {
      const { svc } = await sent();
      svc.masterPlan.withdrawSendRequest('N');

      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(0);
      expect(svc.masterPlan.openRequestFor('N')).toBeUndefined();
      expect(svc.masterPlan.isWaitingForApproval('N')).toBe(false);
      expect(svc.masterPlan.isInMasterPlan('N')).toBe(false);
      expect(svc.masterPlan.draftPmTypesFor('N').map(d => d.frequency)).toEqual(['Weekly', 'Monthly']);
      expect(svc.masterPlan.localAuditLogs()).toHaveLength(0);
      expect(svc.masterPlan.lastRejectionFor('N')).toBeUndefined();
      expect(svc.masterPlan.sendBlockedReason('N')).toBeNull();
    });

    it('lets an approver who did not send it withdraw it', async () => {
      const { svc, setUser } = await sent();
      setUser(manager);
      svc.masterPlan.withdrawSendRequest('N');
      expect(svc.masterPlan.isWaitingForApproval('N')).toBe(false);
      expect(svc.masterPlan.localAuditLogs()).toHaveLength(0);
    });

    it.each([
      ['another engineer who cannot approve', otherEngineer, /Only the sender or an approver/],
      ['a logged-out session', null, /Unauthorized/],
    ])('refuses %s and keeps the request', async (_name, who, message) => {
      const { svc, setUser } = await sent();
      setUser(who);
      expect(() => svc.masterPlan.withdrawSendRequest('N')).toThrow(message);
      expect(svc.masterPlan.isWaitingForApproval('N')).toBe(true);
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(1);
    });

    it('refuses when the machine has no open Send request (none at all, or only an In-plan change request)', async () => {
      const { svc } = await ready();
      expect(() => svc.masterPlan.withdrawSendRequest('N')).toThrow('This machine has no request waiting for approval.');
      await svc.masterPlan.editMachine('A', { name: 'Renamed' });
      expect(() => svc.masterPlan.withdrawSendRequest('A')).toThrow('This machine has no request waiting for approval.');
      expect(svc.masterPlan.openRequestFor('A')).toBeDefined();
    });
  });

  describe('approve', () => {
    it('puts the machine in plan with preview tasks per occurrence, clears its drafts and makes one revision', async () => {
      const { svc, api, setUser, request } = await sent();
      setUser(manager);

      const results = await svc.masterPlan.approveMasterPlanChanges([request.id]);

      expect(results).toEqual([{ id: request.id, ok: true }]);
      expect(svc.masterPlan.isInMasterPlan('N')).toBe(true);
      expect(svc.masterPlan.isWaitingForApproval('N')).toBe(false);
      expect(svc.masterPlan.draftPmTypesFor('N')).toEqual([]);
      expect(svc.masterPlan.pendingMasterPlanChanges()[0]).toMatchObject({ status: 'approved', resolvedBy: 'MGR-1' });

      const weeklyPreviews = previewsOf(svc, 'N', 'Weekly');
      const monthlyPreviews = previewsOf(svc, 'N', 'Monthly');
      expect(weeklyPreviews).toHaveLength(9);
      expect(monthlyPreviews).toHaveLength(2);
      expect(weeklyPreviews.every(t => t.isPreview === true && t.title === 'Weekly check' && t.status === 'Pending')).toBe(true);
      expect(weeklyPreviews[0]).toMatchObject({ estimatedHours: 1.5, partsRequired: ['Filter'], productId: 'CUST-001', department: 'Mechanic', createdBy: 'ENG-1' });
      expect(svc.store.pmTasks().some(t => t.assetId === 'N')).toBe(false);
      expect(svc.masterPlan.pmTypesFor('N').map(t => `${t.frequency}:${t.state}`)).toEqual(['Weekly:live', 'Monthly:live']);

      expect(svc.masterPlan.localAuditLogs()).toHaveLength(1);
      expect(svc.masterPlan.localAuditLogs()[0]).toMatchObject({ action: 'Approved PM Master Plan', actor: { id: 'MGR-1' } });
      expect(svc.masterPlan.localAuditLogs()[0].changes).toEqual(['Added machine to Master Plan', 'Added Weekly PM', 'Added Monthly PM']);

      expect(svc.masterPlan.masterPlanVersions()).toHaveLength(1);
      expect(svc.masterPlan.masterPlanVersions()[0].assets.find(a => a.id === 'N')?.isInMasterPlan).toBe(true);
      noBackendWrites(api);
    });

    it('makes one revision for a bulk approval of two Send requests', async () => {
      const { svc, setUser } = await ready();
      addDrafts(svc, 'N2');
      svc.masterPlan.sendToMasterPlan('N');
      svc.masterPlan.sendToMasterPlan('N2');
      setUser(manager);

      const ids = svc.masterPlan.pendingMasterPlanChanges().map(c => c.id);
      const results = await svc.masterPlan.approveMasterPlanChanges(ids);

      expect(results.every(r => r.ok)).toBe(true);
      expect(svc.masterPlan.isInMasterPlan('N')).toBe(true);
      expect(svc.masterPlan.isInMasterPlan('N2')).toBe(true);
      expect(svc.masterPlan.masterPlanVersions()).toHaveLength(1);
      const snapshot = svc.masterPlan.masterPlanVersions()[0].assets;
      expect(snapshot.filter(a => a.id === 'N' || a.id === 'N2').every(a => a.isInMasterPlan === true)).toBe(true);
      expect(svc.masterPlan.localAuditLogs()).toHaveLength(2);
      expect(previewsOf(svc, 'N2')).toHaveLength(11);
    });

    it('refuses an already resolved request, in a later call or twice in the same batch', async () => {
      const { svc, setUser, request } = await sent();
      setUser(manager);

      const sameBatch = await svc.masterPlan.approveMasterPlanChanges([request.id, request.id]);
      expect(sameBatch[0].ok).toBe(true);
      expect(sameBatch[1]).toMatchObject({ ok: false });
      expect((sameBatch[1].error as Error).message).toBe('Already resolved.');

      const [later] = await svc.masterPlan.approveMasterPlanChanges([request.id]);
      expect(later.ok).toBe(false);
      expect((later.error as Error).message).toBe('Already resolved.');
      expect(svc.masterPlan.masterPlanVersions()).toHaveLength(1);
      expect(previewsOf(svc, 'N')).toHaveLength(11);
    });

    it('fails an item whose machine no longer exists, keeps it pending, and still approves the rest of the batch', async () => {
      const { svc, setUser, backend } = await ready();
      addDrafts(svc, 'N2');
      svc.masterPlan.sendToMasterPlan('N');
      svc.masterPlan.sendToMasterPlan('N2');
      const gone = svc.masterPlan.openRequestFor('N')!;
      const kept = svc.masterPlan.openRequestFor('N2')!;
      backend.assets = backend.assets.filter(a => a.id !== 'N');
      await svc.store.loadData();
      expect(byId(svc, 'N')).toBeUndefined();
      setUser(manager);

      const results = await svc.masterPlan.approveMasterPlanChanges([gone.id, kept.id]);

      expect(results[0].ok).toBe(false);
      expect((results[0].error as Error).message).toBe('Machine not found.');
      expect(results[1].ok).toBe(true);
      expect(svc.masterPlan.pendingMasterPlanChanges().find(c => c.id === gone.id)?.status).toBe('pending');
      expect(previewsOf(svc, 'N')).toHaveLength(0);
      expect(svc.masterPlan.localAuditLogs()).toHaveLength(1);
      expect(svc.masterPlan.masterPlanVersions()).toHaveLength(1);
    });

    it('resolves with no revision, no audit entry and no preview tasks when the machine is already in plan', async () => {
      const { svc, setUser, backend, request } = await sent();
      backend.tasks = [...backend.tasks, task({ id: 'TN', assetId: 'N', frequency: 'Yearly' })];
      await svc.store.loadData();
      expect(svc.masterPlan.isInMasterPlan('N')).toBe(true);
      setUser(manager);

      const [result] = await svc.masterPlan.approveMasterPlanChanges([request.id]);

      expect(result.ok).toBe(true);
      expect(svc.masterPlan.pendingMasterPlanChanges()[0].status).toBe('approved');
      expect(svc.masterPlan.masterPlanVersions()).toHaveLength(0);
      expect(svc.masterPlan.localAuditLogs()).toHaveLength(0);
      expect(previewsOf(svc, 'N')).toHaveLength(0);
      expect(svc.masterPlan.draftPmTypesFor('N')).toEqual([]); // an In-plan machine cannot use drafts any more
    });

    it('lets the sender approve their own request', async () => {
      const { svc } = await ready(manager);
      svc.masterPlan.sendToMasterPlan('N');
      await svc.masterPlan.approveMasterPlanChange(svc.masterPlan.openRequestFor('N')!.id);
      expect(svc.masterPlan.isInMasterPlan('N')).toBe(true);
    });

    it('refuses a user who cannot approve and changes nothing', async () => {
      const { svc, request } = await sent();
      await expect(svc.masterPlan.approveMasterPlanChanges([request.id])).rejects.toThrow('Unauthorized to approve PM Master Plan changes.');
      expect(svc.masterPlan.isWaitingForApproval('N')).toBe(true);
      expect(svc.masterPlan.draftPmTypesFor('N')).toHaveLength(2);
    });

    it('sends every later change of the approved machine through approval', async () => {
      const { svc, setUser, request } = await sent();
      setUser(manager);
      await svc.masterPlan.approveMasterPlanChange(request.id);
      setUser(engineer);

      expect(await svc.masterPlan.editMachine('N', { name: 'Renamed' })).toBe('submitted');
      expect(byId(svc, 'N')?.name).toBe('Machine N');
      expect(svc.masterPlan.removePmType('N', 'Weekly')).toBe('submitted');
      expect(() => svc.masterPlan.addDraftPmType('N', 'Quarterly', { title: 'Quarterly check' })).toThrow(/Master Plan/);
      expect(svc.masterPlan.isWaitingForApproval('N')).toBe(false);
    });

    it('keeps the request, the machine, the drafts, then the plan status and preview tasks through data reloads', async () => {
      const { svc, setUser, request } = await sent();
      await svc.store.loadData();
      expect(svc.masterPlan.openRequestFor('N')?.id).toBe(request.id);
      expect(svc.masterPlan.isWaitingForApproval('N')).toBe(true);
      expect(svc.masterPlan.draftPmTypesFor('N')).toHaveLength(2);

      setUser(manager);
      await svc.masterPlan.approveMasterPlanChange(request.id);
      await svc.store.loadData();

      expect(svc.masterPlan.isInMasterPlan('N')).toBe(true);
      expect(previewsOf(svc, 'N')).toHaveLength(11);
      expect(svc.masterPlan.draftPmTypesFor('N')).toEqual([]);
      expect(svc.masterPlan.masterPlanVersions()).toHaveLength(1);
      expect(svc.store.pmTasks().map(t => t.id)).toEqual(['T1']);
    });

    it('does the same for a machine that exists only in this session', async () => {
      const { svc, api, setUser } = await machines();
      await svc.masterPlan.addMachine({ id: 'L-1', name: 'Local mill', location: 'CUST-001', department: 'Mechanic', workCenter: 'WC-1' });
      addDrafts(svc, 'L-1');
      svc.masterPlan.sendToMasterPlan('L-1');
      await svc.store.loadData();
      expect(svc.masterPlan.isWaitingForApproval('L-1')).toBe(true);
      expect(svc.masterPlan.draftPmTypesFor('L-1')).toHaveLength(2);

      setUser(manager);
      await svc.masterPlan.approveMasterPlanChange(svc.masterPlan.openRequestFor('L-1')!.id);
      await svc.store.loadData();

      expect(byId(svc, 'L-1')).toMatchObject({ isLocalOnly: true, isInMasterPlan: true });
      expect(previewsOf(svc, 'L-1')).toHaveLength(11);
      noBackendWrites(api);
    });
  });

  describe('approving an In-plan add-PM-type request', () => {
    const quarterly = (): NewPmTypeDetail => ({ title: 'Quarterly overhaul', estimatedHours: 3, startDate: new Date(2026, 10, 1), isRecurring: true });

    it('creates preview tasks for a local-only machine and never calls the backend', async () => {
      const { svc, api, setUser } = await machines();
      await svc.masterPlan.addMachine({ id: 'L-1', name: 'Local mill', location: 'CUST-001', department: 'Mechanic', workCenter: 'WC-1' });
      addDrafts(svc, 'L-1');
      svc.masterPlan.sendToMasterPlan('L-1');
      setUser(manager);
      await svc.masterPlan.approveMasterPlanChange(svc.masterPlan.openRequestFor('L-1')!.id);

      svc.masterPlan.submitMasterPlanChange({
        assetId: 'L-1', assetName: 'Local mill', department: 'Mechanic', note: 'add',
        changes: { addPmTypes: ['Quarterly'], newPmTypeDetails: { Quarterly: quarterly() } }
      });
      await svc.masterPlan.approveMasterPlanChange(svc.masterPlan.openRequestFor('L-1')!.id);

      expect(previewsOf(svc, 'L-1', 'Quarterly')).toHaveLength(1); // 1 Nov only: the next one is in 2027
      expect(previewsOf(svc, 'L-1', 'Quarterly')[0].title).toBe('Quarterly overhaul');
      expect(api.createTask).not.toHaveBeenCalled();
      expect(api.createSchedule).not.toHaveBeenCalled();
    });

    it('keeps the real creation path for a backend machine', async () => {
      const { svc, api, setUser } = await machines(manager);
      setUser(manager);
      svc.masterPlan.submitMasterPlanChange({
        assetId: 'A', assetName: 'Machine A', department: 'Mechanic', note: 'add',
        changes: { addPmTypes: ['Quarterly'], newPmTypeDetails: { Quarterly: quarterly() } }
      });
      await svc.masterPlan.approveMasterPlanChange(svc.masterPlan.openRequestFor('A')!.id);

      expect(api.createSchedule).toHaveBeenCalledTimes(1);
      expect(previewsOf(svc, 'A')).toHaveLength(0);
    });

    it('leaves no partial state when one item fails, and still approves the others in the batch', async () => {
      const { svc, api, setUser } = await ready();
      svc.masterPlan.sendToMasterPlan('N');
      setUser(manager);
      await svc.masterPlan.setMachineActive('A', false);
      svc.masterPlan.submitMasterPlanChange({
        assetId: 'A', assetName: 'Machine A', department: 'Mechanic', note: 'add',
        changes: { addPmTypes: ['Quarterly'], newPmTypeDetails: { Quarterly: quarterly() } }
      });
      const failing = svc.masterPlan.openRequestFor('A')!;
      api.createSchedule.mockRejectedValueOnce(new Error('backend down'));

      const results = await svc.masterPlan.approveMasterPlanChanges([failing.id, svc.masterPlan.openRequestFor('N')!.id]);

      expect(results[0].ok).toBe(false);
      expect((results[0].error as Error).message).toBe('backend down');
      expect(byId(svc, 'A')?.isActive).toBe(true);
      expect(byId(svc, 'A')?.deactivatedAt).toBeUndefined();
      expect(svc.store.pmTasks().find(t => t.id === 'T1')?.status).toBe('Pending');
      expect(svc.masterPlan.openRequestFor('A')?.id).toBe(failing.id);
      expect(results[1].ok).toBe(true);
      expect(svc.masterPlan.isInMasterPlan('N')).toBe(true);
      expect(svc.masterPlan.masterPlanVersions()).toHaveLength(1);
      expect(svc.masterPlan.localAuditLogs()).toHaveLength(1);
    });
  });

  describe('reject', () => {
    it('requires a reason and changes nothing without one', async () => {
      const { svc, setUser, request } = await sent();
      setUser(manager);
      expect(() => svc.masterPlan.rejectMasterPlanChange(request.id, '   ')).toThrow('A rejection reason is required.');
      expect(svc.masterPlan.isWaitingForApproval('N')).toBe(true);
      expect(svc.masterPlan.localAuditLogs()).toHaveLength(0);
    });

    it('keeps the machine Not in plan, unlocked, with its drafts, and reports who rejected it, when and why', async () => {
      const { svc, setUser, request } = await sent();
      setUser(manager);
      svc.masterPlan.rejectMasterPlanChange(request.id, 'Add a checklist to the Monthly PM.');

      expect(svc.masterPlan.pendingMasterPlanChanges()[0].status).toBe('rejected');
      expect(svc.masterPlan.isInMasterPlan('N')).toBe(false);
      expect(svc.masterPlan.isWaitingForApproval('N')).toBe(false);
      expect(svc.masterPlan.draftPmTypesFor('N')).toHaveLength(2);
      expect(svc.masterPlan.sendBlockedReason('N')).toBeNull();
      expect(svc.masterPlan.masterPlanVersions()).toHaveLength(0);
      expect(svc.masterPlan.localAuditLogs()[0]).toMatchObject({ action: 'Rejected PM Master Plan', changes: ['Rejected: Add a checklist to the Monthly PM.'] });

      const rejection = svc.masterPlan.lastRejectionFor('N');
      expect(rejection).toEqual({ by: 'MGR-1', byName: 'MGR-1', at: new Date(2026, 9, 26, 9, 0), reason: 'Add a checklist to the Monthly PM.' });

      setUser(engineer);
      expect(await svc.masterPlan.editMachine('N', { name: 'Renamed' })).toBe('applied');
    });

    it('hides the rejection once a newer Send exists, and shows it again if that Send is withdrawn', async () => {
      const { svc, setUser, request } = await sent();
      setUser(manager);
      svc.masterPlan.rejectMasterPlanChange(request.id, 'Not ready.');
      setUser(engineer);

      svc.masterPlan.sendToMasterPlan('N');
      expect(svc.masterPlan.isWaitingForApproval('N')).toBe(true);
      expect(svc.masterPlan.lastRejectionFor('N')).toBeUndefined();

      // Withdraw deletes the newer request, so the rejection is again the latest decision on this machine.
      svc.masterPlan.withdrawSendRequest('N');
      expect(svc.masterPlan.lastRejectionFor('N')?.reason).toBe('Not ready.');

      svc.masterPlan.sendToMasterPlan('N');
      setUser(manager);
      await svc.masterPlan.approveMasterPlanChange(svc.masterPlan.openRequestFor('N')!.id);
      expect(svc.masterPlan.lastRejectionFor('N')).toBeUndefined();
    });

    it('has no rejection for a machine never rejected, an unknown machine, or a rejected In-plan change', async () => {
      const { svc, setUser } = await ready();
      expect(svc.masterPlan.lastRejectionFor('N')).toBeUndefined();
      expect(svc.masterPlan.lastRejectionFor('NOPE')).toBeUndefined();
      await svc.masterPlan.editMachine('A', { name: 'Renamed' });
      setUser(manager);
      svc.masterPlan.rejectMasterPlanChange(svc.masterPlan.openRequestFor('A')!.id, 'No.');
      expect(svc.masterPlan.lastRejectionFor('A')).toBeUndefined();
    });
  });

  describe('revision history (older revisions do not list machines not yet in plan)', () => {
    it('keeps the machine Not in plan in the revision taken before its approval and In plan in the one after', async () => {
      const { svc, setUser, request } = await sent();
      setUser(manager);
      svc.masterPlan.submitMasterPlanChange({ assetId: 'A', assetName: 'Machine A', department: 'Mechanic', changes: { editFields: { name: 'Renamed' } }, note: 'rename' });
      await svc.masterPlan.approveMasterPlanChange(svc.masterPlan.openRequestFor('A')!.id);
      await svc.masterPlan.approveMasterPlanChange(request.id);

      const [before, after] = svc.masterPlan.masterPlanVersions();
      expect(before.assets.find(a => a.id === 'N')?.isInMasterPlan).toBe(false);
      expect(isAssetInMasterPlan(before.assets.find(a => a.id === 'N')!)).toBe(false);
      expect(after.assets.find(a => a.id === 'N')?.isInMasterPlan).toBe(true);
    });
  });

  describe('dev seeds', () => {
    // A and B are In plan (they have tasks); N is Not in plan.
    async function seeded() {
      const ctx = setup({
        user: manager,
        assets: [asset({ id: 'A' }), asset({ id: 'B' }), asset({ id: 'N' })],
        tasks: [task({ id: 'T1', assetId: 'A', frequency: 'Monthly' }), task({ id: 'T2', assetId: 'A', frequency: 'Weekly' }), task({ id: 'T3', assetId: 'B' })]
      });
      await ctx.svc.store.loadData();
      ctx.svc.masterPlan.seedMockMasterPlanChanges();
      return ctx;
    }

    it('targets only In-plan machines, apart from one Send request for a seeded Not-in-plan machine', async () => {
      const { svc } = await seeded();
      const requests = svc.masterPlan.pendingMasterPlanChanges();
      const sendRequests = requests.filter(c => svc.masterPlan.isSendRequest(c));
      expect(requests.length).toBeGreaterThan(1);
      expect(requests.filter(c => !svc.masterPlan.isSendRequest(c)).every(c => svc.masterPlan.isInMasterPlan(c.assetId))).toBe(true);
      expect(byId(svc, 'N')?.isActive).toBe(true);

      expect(sendRequests).toHaveLength(1);
      const [send] = sendRequests;
      expect(send.status).toBe('pending');
      const machine = byId(svc, send.assetId)!;
      expect(machine).toMatchObject({ isLocalOnly: true, isInMasterPlan: false, isActive: true });
      expect(svc.masterPlan.isWaitingForApproval(machine.id)).toBe(true);
      const drafts = svc.masterPlan.draftPmTypesFor(machine.id);
      expect(drafts).toHaveLength(2);
      expect(send.proposedState.addPmTypes).toEqual(drafts.map(d => d.frequency));
      expect(send.proposedState.newPmTypeDetails).toEqual(Object.fromEntries(drafts.map(d => [d.frequency, d.detail])));
    });

    it('does not duplicate anything when called twice', async () => {
      const { svc } = await seeded();
      const assetsBefore = svc.store.assets().length;
      const requestsBefore = svc.masterPlan.pendingMasterPlanChanges().length;
      svc.masterPlan.seedMockMasterPlanChanges();
      expect(svc.store.assets()).toHaveLength(assetsBefore);
      expect(svc.masterPlan.pendingMasterPlanChanges()).toHaveLength(requestsBefore);
    });

    it('seeds only the Send request when no machine is in plan', async () => {
      const ctx = setup({ user: manager, assets: [asset({ id: 'N' })], tasks: [] });
      await ctx.svc.store.loadData();
      ctx.svc.masterPlan.seedMockMasterPlanChanges();
      const requests = ctx.svc.masterPlan.pendingMasterPlanChanges();
      expect(requests).toHaveLength(1);
      expect(ctx.svc.masterPlan.isSendRequest(requests[0])).toBe(true);
      expect(byId(ctx.svc, 'N')?.isActive).toBe(true);
    });

    it('lets the seeded Send request be approved end to end', async () => {
      const { svc, api } = await seeded();
      const send = svc.masterPlan.pendingMasterPlanChanges().find(c => svc.masterPlan.isSendRequest(c))!;

      const [result] = await svc.masterPlan.approveMasterPlanChanges([send.id]);

      expect(result.ok).toBe(true);
      expect(svc.masterPlan.isInMasterPlan(send.assetId)).toBe(true);
      expect(svc.masterPlan.draftPmTypesFor(send.assetId)).toEqual([]);
      expect(previewsOf(svc, send.assetId).length).toBeGreaterThan(0);
      expect(svc.masterPlan.masterPlanVersions()).toHaveLength(1);
      expect(svc.masterPlan.localAuditLogs()[0].changes?.[0]).toBe('Added machine to Master Plan');
      noBackendWrites(api);
    });
  });
});

// ── Approving In-plan change requests on backend machines ─────────────────

describe('PmService — approving In-plan change requests', () => {
  const quarterly = (): NewPmTypeDetail => ({ title: 'Quarterly overhaul', estimatedHours: 3, startDate: new Date(2026, 10, 1), isRecurring: true });

  // A (Facility) and B are In plan backend machines with a Monthly PM each.
  async function inPlan() {
    const ctx = setup({
      user: manager,
      assets: [asset({ id: 'A', department: 'Facility' }), asset({ id: 'B' })],
      tasks: [task({ id: 'T1', assetId: 'A', frequency: 'Monthly', department: 'Facility', scheduleId: 'S-1' }), task({ id: 'T3', assetId: 'B', frequency: 'Monthly' })]
    });
    await ctx.svc.store.loadData();
    return ctx;
  }
  const submit = (svc: Services, assetId: string, changes: Parameters<MasterPlanService['submitMasterPlanChange']>[0]['changes']) => {
    svc.masterPlan.submitMasterPlanChange({ assetId, assetName: `Machine ${assetId}`, department: byId(svc, assetId)!.department, note: 'change', changes });
    return svc.masterPlan.openRequestFor(assetId)!;
  };
  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    return { promise, resolve };
  };

  describe('a field change together with an added PM type', () => {
    it('creates the new PM type under the machine\'s new department', async () => {
      const { svc, api } = await inPlan();
      const request = submit(svc, 'A', { editFields: { department: 'Mechanic' }, addPmTypes: ['Quarterly'], newPmTypeDetails: { Quarterly: quarterly() } });

      const [result] = await svc.masterPlan.approveMasterPlanChanges([request.id]);

      expect(result).toEqual({ id: request.id, ok: true });
      expect(byId(svc, 'A')?.department).toBe('Mechanic');
      expect(api.createSchedule).toHaveBeenCalledTimes(1);
      expect(api.createSchedule).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'A', department: 'Mechanic', productId: 'CUST-001' }));
      expect(svc.masterPlan.localAuditLogs()[0].changes).toEqual(['Changed department to Mechanic', 'Added Quarterly PM']);
    });

    it('approves the seeded combined card (department change + Daily add with details) cleanly', async () => {
      const ctx = setup({
        user: manager,
        assets: [asset({ id: 'A', department: 'Facility' }), asset({ id: 'B' }), asset({ id: 'I', isActive: false })],
        tasks: [
          task({ id: 'T1', assetId: 'A', frequency: 'Monthly', department: 'Facility' }),
          task({ id: 'T2', assetId: 'A', frequency: 'Weekly', department: 'Facility' }),
          task({ id: 'T3', assetId: 'B' }),
          task({ id: 'T4', assetId: 'I' })
        ]
      });
      await ctx.svc.store.loadData();
      ctx.svc.masterPlan.seedMockMasterPlanChanges();
      const { svc, api } = ctx;

      const [result] = await svc.masterPlan.approveMasterPlanChanges(['PMC-MOCK-COMBO']);

      expect(result).toEqual({ id: 'PMC-MOCK-COMBO', ok: true });
      expect(byId(svc, 'A')).toMatchObject({ department: 'Mechanic', workCenter: 'WC-10', name: 'Machine A (Rev)' });
      expect(api.createSchedule).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'A', department: 'Mechanic', title: 'Daily Air Compressor Check' }));
      expect(svc.store.pmTasks().find(t => t.id === 'T1')?.status).toBe('Cancelled');
      expect(svc.masterPlan.pendingMasterPlanChanges().find(c => c.id === 'PMC-MOCK-COMBO')?.status).toBe('approved');
    });
  });

  describe('a removed PM type together with a real add', () => {
    it('keeps the removed PM type\'s tasks cancelled after the add reloads tasks from the backend', async () => {
      const { svc, api } = await inPlan();
      const request = submit(svc, 'A', { removePmTypes: ['Monthly'], addPmTypes: ['Quarterly'], newPmTypeDetails: { Quarterly: quarterly() } });

      const [result] = await svc.masterPlan.approveMasterPlanChanges([request.id]);

      expect(result.ok).toBe(true);
      expect(api.getTasks).toHaveBeenCalledTimes(2); // load + the reload after the real add
      expect(svc.store.pmTasks().find(t => t.id === 'T1')).toMatchObject({ status: 'Cancelled', cancelledReason: 'PM type removed' });
      expect(svc.masterPlan.activeFrequenciesForAsset('A')).toEqual([]);
      expect(svc.masterPlan.localAuditLogs()[0].changes).toEqual(['Added Quarterly PM', 'Removed Monthly PM']);
    });

    it('keeps an earlier item\'s removal cancelled when a later item in the same batch reloads tasks', async () => {
      const { svc, api } = await inPlan();
      const removal = submit(svc, 'A', { removePmTypes: ['Monthly'] });
      const add = submit(svc, 'B', { addPmTypes: ['Quarterly'], newPmTypeDetails: { Quarterly: quarterly() } });

      const results = await svc.masterPlan.approveMasterPlanChanges([removal.id, add.id]);

      expect(results.every(r => r.ok)).toBe(true);
      expect(api.createSchedule).toHaveBeenCalledTimes(1);
      expect(svc.store.pmTasks().find(t => t.id === 'T1')?.status).toBe('Cancelled');
      expect(svc.store.pmTasks().find(t => t.id === 'T3')?.status).toBe('Pending');
    });

    it('leaves the PM type to remove untouched when the add fails', async () => {
      const { svc, api } = await inPlan();
      const request = submit(svc, 'A', { removePmTypes: ['Monthly'], addPmTypes: ['Quarterly'], newPmTypeDetails: { Quarterly: quarterly() } });
      api.createSchedule.mockRejectedValueOnce(new Error('backend down'));

      const [result] = await svc.masterPlan.approveMasterPlanChanges([request.id]);

      expect(result.ok).toBe(false);
      expect((result.error as Error).message).toBe('backend down');
      expect(svc.store.pmTasks().find(t => t.id === 'T1')?.status).toBe('Pending');
      expect(svc.masterPlan.openRequestFor('A')?.id).toBe(request.id);
      expect(svc.masterPlan.localAuditLogs()).toHaveLength(0);
      expect(svc.masterPlan.masterPlanVersions()).toHaveLength(0);
    });
  });

  describe('a request already being processed', () => {
    async function inFlight() {
      const ctx = await inPlan();
      const request = submit(ctx.svc, 'A', { addPmTypes: ['Quarterly'], newPmTypeDetails: { Quarterly: quarterly() } });
      const gate = deferred();
      ctx.api.createSchedule.mockImplementationOnce(() => gate.promise.then(() => undefined));
      const first = ctx.svc.masterPlan.approveMasterPlanChanges([request.id]);
      await Promise.resolve();
      return { ...ctx, request, gate, first };
    }

    it('is reported as processing until its approval finishes', async () => {
      const { svc, request, gate, first } = await inFlight();
      expect(svc.masterPlan.isProcessingMasterPlanChange(request.id)).toBe(true);
      gate.resolve();
      await first;
      expect(svc.masterPlan.isProcessingMasterPlanChange(request.id)).toBe(false);
    });

    it('refuses a second approval (single or bulk) while the first is in flight, and applies it once', async () => {
      const { svc, api, request, gate, first } = await inFlight();

      const [again] = await svc.masterPlan.approveMasterPlanChanges([request.id]);
      await expect(svc.masterPlan.approveMasterPlanChange(request.id)).rejects.toThrow('This request is already being processed.');
      gate.resolve();
      const [result] = await first;

      expect(again.ok).toBe(false);
      expect((again.error as Error).message).toBe('This request is already being processed.');
      expect(result.ok).toBe(true);
      expect(api.createSchedule).toHaveBeenCalledTimes(1);
      expect(svc.masterPlan.localAuditLogs()).toHaveLength(1);
      expect(svc.masterPlan.masterPlanVersions()).toHaveLength(1);
      expect(svc.masterPlan.pendingMasterPlanChanges()[0].status).toBe('approved');
    });

    it('refuses a rejection while the approval is in flight', async () => {
      const { svc, request, gate, first } = await inFlight();

      expect(() => svc.masterPlan.rejectMasterPlanChange(request.id, 'No.')).toThrow('This request is already being processed.');
      gate.resolve();
      await first;

      expect(svc.masterPlan.pendingMasterPlanChanges()[0].status).toBe('approved');
      expect(svc.masterPlan.localAuditLogs().map(l => l.action)).toEqual(['Approved PM Master Plan']);
    });

    it('releases the request when its approval fails, so it can be approved again', async () => {
      const { svc, api } = await inPlan();
      const request = submit(svc, 'A', { addPmTypes: ['Quarterly'], newPmTypeDetails: { Quarterly: quarterly() } });
      api.createSchedule.mockRejectedValueOnce(new Error('backend down'));

      expect((await svc.masterPlan.approveMasterPlanChanges([request.id]))[0].ok).toBe(false);
      expect(svc.masterPlan.isProcessingMasterPlanChange(request.id)).toBe(false);
      expect((await svc.masterPlan.approveMasterPlanChanges([request.id]))[0].ok).toBe(true);
    });
  });
});
