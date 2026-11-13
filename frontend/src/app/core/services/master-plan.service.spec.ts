import { Injector } from '@angular/core';
import { vi } from 'vitest';
import { PmStore } from './pm-store.service';
import { MasterPlanService } from './master-plan.service';
import { TemplateService } from './template.service';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { Asset, PendingMasterPlanChange, PMTask, User } from '../models/pm.model';

// The Master Plan rules (merging, netting out, applying) live in the backend. These tests cover the
// seam: what the service sends to the API, how it re-syncs, and how errors reach the user.

const asset = (over: Partial<Asset> & { id: string }): Asset => ({
  name: `Machine ${over.id}`, department: 'Mechanic', location: 'CUST-001', isActive: true, ...over
});

const user = (over: Partial<User> & { employeeId: string }): User => ({
  name: over.employeeId, initials: 'XX', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Mechanic',
  ownedProducts: ['CUST-001'], delegatedProducts: [], permissions: ['pm.create.submit'], ...over
});

const engineer = user({ employeeId: 'ENG-1' });
const manager = user({ employeeId: 'MGR-1', baseRole: 'manager', roleLabel: 'Manager', permissions: ['pm.create.submit', 'pm.masterplan.approve'] });
const technician = user({ employeeId: 'TECH-1', baseRole: 'technician', roleLabel: 'Technician', permissions: [] });

const card = (over: Partial<PendingMasterPlanChange> & { id: string; assetId: string }): PendingMasterPlanChange => ({
  assetName: `Machine ${over.assetId}`, department: 'Mechanic', proposedState: {}, submittedBy: 'ENG-1',
  submittedAt: new Date(2026, 5, 1), note: 'n', history: [], status: 'pending', ...over
});

function setup(options: { assets?: Asset[]; user?: User } = {}) {
  const currentUser = options.user ?? manager;
  const state = { assets: options.assets ?? [], changes: [] as PendingMasterPlanChange[], drafts: {} as Record<string, any[]> };

  const api = {
    getAssets: vi.fn(async () => state.assets.map(a => ({ ...a }))),
    getTasks: vi.fn(async () => [] as PMTask[]),
    getTemplates: vi.fn(async () => []),
    createAsset: vi.fn(async () => undefined),
    updateAsset: vi.fn(async (id: string, patch: Partial<Asset>) => ({ ...state.assets.find(a => a.id === id)!, ...patch })),
    listMasterPlanChanges: vi.fn(async () => state.changes),
    submitMasterPlanChange: vi.fn(async () => ({ dropped: true as const })),
    approveMasterPlanChanges: vi.fn(async (ids: string[]) => ({ results: ids.map(id => ({ id, ok: true })) })),
    rejectMasterPlanChange: vi.fn(async () => undefined),
    withdrawMasterPlanChange: vi.fn(async () => undefined),
    getMasterPlanVersions: vi.fn(async () => []),
    getDraftPmTypes: vi.fn(async (id: string) => state.drafts[id] ?? []),
    saveDraftPmType: vi.fn(async (_id: string, frequency: string, detail: any) => ({ frequency, detail })),
    deleteDraftPmType: vi.fn(async () => undefined),
  };
  const auth = {
    currentUser: () => currentUser,
    hasPermission: (p: string) => currentUser.permissions.includes(p),
    getUser: (id: string) => [engineer, manager].find(u => u.employeeId === id),
    init: async () => undefined,
  };
  const injector = Injector.create({
    providers: [
      { provide: ApiService, useValue: api }, { provide: AuthService, useValue: auth },
      PmStore, TemplateService, MasterPlanService
    ]
  });
  return { store: injector.get(PmStore), svc: injector.get(MasterPlanService), api, state };
}

const inPlan = asset({ id: 'IN', isInMasterPlan: true });
const outOfPlan = asset({ id: 'OUT', isInMasterPlan: false });

describe('MasterPlanService (API wiring)', () => {
  describe('load', () => {
    it('hydrates requests, versions and the drafts of machines that are not in the plan', async () => {
      const { svc, store, api, state } = setup({ assets: [inPlan, outOfPlan] });
      state.changes = [card({ id: 'C1', assetId: 'IN' })];
      state.drafts['OUT'] = [{ frequency: 'Monthly', detail: { title: 'Lube' } }];
      await store.loadData();
      await svc.load();
      expect(svc.pendingMasterPlanChanges().map(c => c.id)).toEqual(['C1']);
      expect(svc.draftPmTypesFor('OUT').map(d => d.frequency)).toEqual(['Monthly']);
      expect(api.getDraftPmTypes).toHaveBeenCalledTimes(1);
      expect(api.getDraftPmTypes).toHaveBeenCalledWith('OUT');
    });

    it('does not call the Master Plan API for a technician', async () => {
      const { svc, api } = setup({ user: technician });
      await svc.load();
      expect(api.listMasterPlanChanges).not.toHaveBeenCalled();
    });
  });

  describe('machine changes', () => {
    it('applies an edit to a machine outside the plan with a direct PATCH', async () => {
      const { svc, store, api } = setup({ assets: [outOfPlan] });
      await store.loadData();
      expect(await svc.editMachine('OUT', { name: 'New name' })).toBe('applied');
      expect(api.updateAsset).toHaveBeenCalledWith('OUT', { name: 'New name' });
      expect(store.assets().find(a => a.id === 'OUT')?.name).toBe('New name');
      expect(api.submitMasterPlanChange).not.toHaveBeenCalled();
    });

    it('sends nothing when the edit changes no field', async () => {
      const { svc, store, api } = setup({ assets: [outOfPlan] });
      await store.loadData();
      expect(await svc.editMachine('OUT', { name: 'Machine OUT' })).toBe('unchanged');
      expect(api.updateAsset).not.toHaveBeenCalled();
    });

    it('turns an edit of an in-plan machine into a request', async () => {
      const { svc, store, api, state } = setup({ assets: [inPlan] });
      await store.loadData();
      api.submitMasterPlanChange.mockImplementationOnce(async () => {
        state.changes = [card({ id: 'C1', assetId: 'IN', proposedState: { editFields: { name: 'X' } } })];
        return state.changes[0] as any;
      });
      expect(await svc.editMachine('IN', { name: 'X' })).toBe('submitted');
      expect(api.submitMasterPlanChange).toHaveBeenCalledWith({ assetId: 'IN', proposedState: { editFields: { name: 'X' } }, note: 'Edited via Manage Machines' });
      expect(api.updateAsset).not.toHaveBeenCalled();
    });

    it('reports "unchanged" when the backend drops a request that nets out to nothing', async () => {
      const { svc, store } = setup({ assets: [inPlan] });
      await store.loadData();
      expect(await svc.setMachineActive('IN', false)).toBe('unchanged');
    });

    it('deactivates a machine outside the plan with a direct PATCH', async () => {
      const { svc, store, api } = setup({ assets: [outOfPlan] });
      await store.loadData();
      expect(await svc.setMachineActive('OUT', false)).toBe('applied');
      expect(api.updateAsset).toHaveBeenCalledWith('OUT', { isActive: false });
    });

    it('shows the backend message when the PATCH fails', async () => {
      const { svc, store, api } = setup({ assets: [outOfPlan] });
      await store.loadData();
      api.updateAsset.mockRejectedValueOnce({ error: { message: 'Machine is locked' } });
      await expect(svc.editMachine('OUT', { name: 'X' })).rejects.toThrow('Machine is locked');
    });
  });

  describe('draft PM types', () => {
    it('saves a draft through the API and lists it', async () => {
      const { svc, store, api } = setup({ assets: [outOfPlan] });
      await store.loadData();
      await svc.addDraftPmType('OUT', 'Monthly', { title: ' Lube ' });
      expect(api.saveDraftPmType).toHaveBeenCalledWith('OUT', 'Monthly', expect.objectContaining({ title: 'Lube' }));
      expect(svc.draftPmTypesFor('OUT').map(d => d.frequency)).toEqual(['Monthly']);
    });

    it('refuses a second draft of the same type without calling the API again', async () => {
      const { svc, store, api } = setup({ assets: [outOfPlan] });
      await store.loadData();
      await svc.addDraftPmType('OUT', 'Monthly', { title: 'A' });
      await expect(svc.addDraftPmType('OUT', 'monthly', { title: 'B' })).rejects.toThrow(/already has a monthly PM/);
      expect(api.saveDraftPmType).toHaveBeenCalledTimes(1);
    });

    it('treats a custom length equal to a preset as the same type', async () => {
      const { svc, store, api } = setup({ assets: [outOfPlan] });
      await store.loadData();
      await svc.addDraftPmType('OUT', 'Weekly', { title: 'A' });
      await expect(svc.addDraftPmType('OUT', '1 week(s)', { title: 'B' })).rejects.toThrow(/already has a/);
      expect(api.saveDraftPmType).toHaveBeenCalledTimes(1);
    });

    it('refuses drafts on a machine that is in the plan', async () => {
      const { svc, store } = setup({ assets: [inPlan] });
      await store.loadData();
      await expect(svc.addDraftPmType('IN', 'Monthly', { title: 'A' })).rejects.toThrow(/approval request/);
    });

    it('removes a draft through the API', async () => {
      const { svc, store, api } = setup({ assets: [outOfPlan] });
      await store.loadData();
      await svc.addDraftPmType('OUT', 'Monthly', { title: 'A' });
      expect(await svc.removePmType('OUT', 'Monthly')).toBe('applied');
      expect(api.deleteDraftPmType).toHaveBeenCalledWith('OUT', 'Monthly');
      expect(svc.draftPmTypesFor('OUT')).toEqual([]);
    });

    it('turns removing a type from an in-plan machine into a request', async () => {
      const { svc, store, api } = setup({ assets: [inPlan] });
      await store.loadData();
      await svc.removePmType('IN', 'Monthly');
      expect(api.submitMasterPlanChange).toHaveBeenCalledWith(expect.objectContaining({
        assetId: 'IN', proposedState: { removePmTypes: ['Monthly'] }
      }));
    });
  });

  describe('Send to Master Plan', () => {
    it('is blocked until the machine has a draft', async () => {
      const { svc, store } = setup({ assets: [outOfPlan] });
      await store.loadData();
      expect(svc.sendBlockedReason('OUT')).not.toBeNull();
      await svc.addDraftPmType('OUT', 'Monthly', { title: 'A' });
      expect(svc.sendBlockedReason('OUT')).toBeNull();
    });

    it('submits {addToPlan:true} and locks the machine while it waits', async () => {
      const { svc, store, api, state } = setup({ assets: [outOfPlan] });
      await store.loadData();
      await svc.addDraftPmType('OUT', 'Monthly', { title: 'A' });
      api.submitMasterPlanChange.mockImplementationOnce(async () => {
        state.changes = [card({ id: 'S1', assetId: 'OUT', proposedState: { addToPlan: true } })];
        return state.changes[0] as any;
      });
      await svc.sendToMasterPlan('OUT');
      expect(api.submitMasterPlanChange).toHaveBeenCalledWith({ assetId: 'OUT', proposedState: { addToPlan: true }, note: expect.any(String) });
      expect(svc.isWaitingForApproval('OUT')).toBe(true);
      await expect(svc.editMachine('OUT', { name: 'X' })).rejects.toThrow(/waiting for approval/);
    });

    it('withdraws the open request and unlocks the machine', async () => {
      const { svc, store, api, state } = setup({ assets: [outOfPlan], user: manager });
      state.changes = [card({ id: 'S1', assetId: 'OUT', proposedState: { addToPlan: true } })];
      await store.loadData();
      await svc.load();
      api.listMasterPlanChanges.mockImplementationOnce(async () => []);
      await svc.withdrawSendRequest('OUT');
      expect(api.withdrawMasterPlanChange).toHaveBeenCalledWith('S1');
      expect(svc.isWaitingForApproval('OUT')).toBe(false);
    });
  });

  describe('approve and reject', () => {
    it('approves in one API call, then reloads machines, requests and versions', async () => {
      const { svc, store, api } = setup({ assets: [inPlan] });
      await store.loadData();
      api.getAssets.mockClear();
      const results = await svc.approveMasterPlanChanges(['C1', 'C2']);
      expect(api.approveMasterPlanChanges).toHaveBeenCalledTimes(1);
      expect(api.approveMasterPlanChanges).toHaveBeenCalledWith(['C1', 'C2']);
      expect(results.map(r => r.ok)).toEqual([true, true]);
      expect(api.getAssets).toHaveBeenCalled();
      expect(api.listMasterPlanChanges).toHaveBeenCalled();
      expect(api.getMasterPlanVersions).toHaveBeenCalled();
    });

    it('reports per-request failures and keeps the others', async () => {
      const { svc, api } = setup();
      api.approveMasterPlanChanges.mockResolvedValueOnce({ results: [{ id: 'C1', ok: true }, { id: 'C2', ok: false, error: 'Conflict' }] } as any);
      const results = await svc.approveMasterPlanChanges(['C1', 'C2']);
      expect(results[0]).toEqual({ id: 'C1', ok: true });
      expect(results[1].ok).toBe(false);
      expect(results[1].error.message).toBe('Conflict');
    });

    it('does not report a failed reload as a failed approval', async () => {
      const { svc, api } = setup();
      api.listMasterPlanChanges.mockRejectedValueOnce(new Error('offline'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const results = await svc.approveMasterPlanChanges(['C1']);
      expect(results[0].ok).toBe(true);
    });

    it('refuses a request that is already being processed', async () => {
      const { svc, api } = setup();
      let release!: () => void;
      api.approveMasterPlanChanges.mockImplementationOnce(() => new Promise(res => {
        release = () => res({ results: [{ id: 'C1', ok: true }] } as any);
      }));
      const first = svc.approveMasterPlanChanges(['C1']);
      const second = await svc.approveMasterPlanChanges(['C1']);
      expect(second[0].ok).toBe(false);
      release();
      await first;
      expect(api.approveMasterPlanChanges).toHaveBeenCalledTimes(1);
    });

    it('only managers/approvers can approve or reject', async () => {
      const { svc } = setup({ user: engineer });
      await expect(svc.approveMasterPlanChanges(['C1'])).rejects.toThrow(/Unauthorized/);
      await expect(svc.rejectMasterPlanChange('C1', 'no')).rejects.toThrow(/Unauthorized/);
    });

    it('rejects with a trimmed reason and refreshes the requests', async () => {
      const { svc, api } = setup();
      await svc.rejectMasterPlanChange('C1', '  not needed ');
      expect(api.rejectMasterPlanChange).toHaveBeenCalledWith('C1', 'not needed');
      expect(api.listMasterPlanChanges).toHaveBeenCalled();
    });

    it('requires a rejection reason', async () => {
      const { svc, api } = setup();
      await expect(svc.rejectMasterPlanChange('C1', '  ')).rejects.toThrow(/reason/);
      expect(api.rejectMasterPlanChange).not.toHaveBeenCalled();
    });
  });
});
