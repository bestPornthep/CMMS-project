import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Asset, DraftPmType, MasterPlanVersionSnapshot, NewPmTypeDetail, PendingMasterPlanChange,
  PMTask, PMTaskStatus, PmTypeSummary, ProposedMasterPlanState, User
} from '../models/pm.model';
import { ApiService } from './api.service';
import { apiErrorMessage } from './api-error.util';
import { AuthService } from './auth.service';
import { PmStore } from './pm-store.service';
import { frequencyRank, normalizeFrequency } from './pm-frequency.util';
import { isAssetInMasterPlan, SERIES_MARKER, SERIES_MARKER_G } from './pm-plan.util';

@Injectable({ providedIn: 'root' })
export class MasterPlanService {
  private api = inject(ApiService);
  private authService = inject(AuthService);
  private store = inject(PmStore);

  // ── PM Master Plan approval workflow ─────────────────────────────────────
  // The backend owns the requests, versions, drafts and audit entries; these signals mirror what it
  // last sent. Every mutation is an API call followed by a re-sync, so the UI never drifts from the server.
  private pendingMasterPlanChangesSignal = signal<PendingMasterPlanChange[]>([]);
  private masterPlanVersionsSignal = signal<MasterPlanVersionSnapshot[]>([]);
  // Requests whose approval is still running, so a second approve/reject cannot apply them twice.
  private processingMasterPlanChangeIdsSignal = signal<ReadonlySet<string>>(new Set());

  // PM types defined on machines that are not in the Master Plan yet, by machine id (see DraftPmType).
  private draftPmTypesSignal = signal<Record<string, DraftPmType[]>>({});

  readonly pendingMasterPlanChanges = computed(() => this.pendingMasterPlanChangesSignal());
  readonly masterPlanVersions = computed(() => this.masterPlanVersionsSignal());

  // Loads requests, versions and drafts. Run after the machines are loaded (app start and login).
  // Technicians cannot see the Master Plan, so nothing is requested for them.
  async load(): Promise<void> {
    if (!this.canProposeMasterPlanChange()) return;
    await Promise.all([this.refreshChanges(), this.refreshVersions(), this.refreshDrafts()]);
  }

  private async refreshChanges(): Promise<void> {
    this.pendingMasterPlanChangesSignal.set(await this.api.listMasterPlanChanges());
  }

  private async refreshVersions(): Promise<void> {
    this.masterPlanVersionsSignal.set(await this.api.getMasterPlanVersions());
  }

  // Only machines outside the plan can have drafts.
  private async refreshDrafts(): Promise<void> {
    const ids = this.store.assets().filter(a => !isAssetInMasterPlan(a)).map(a => a.id);
    const lists = await Promise.all(ids.map(id => this.api.getDraftPmTypes(id)));
    this.draftPmTypesSignal.set(Object.fromEntries(ids.map((id, i) => [id, lists[i]]).filter(([, l]) => (l as DraftPmType[]).length > 0)));
  }

  // A new machine always starts out of the Master Plan.
  createAsset(asset: { id: string, name: string, location: string, department: string, workCenter?: string }): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) {
      return Promise.reject(new Error('Unauthorized to create assets.'));
    }
    const newAsset: Asset = { ...asset, isActive: true, isInMasterPlan: false };
    return this.api.createAsset(asset).then(() => {
      this.store.updateAssets(assets => [...assets, newAsset]);
    }, e => { throw new Error(apiErrorMessage(e)); });
  }

  // Edits a machine's own fields and/or its active status through PATCH /assets/:id. The backend
  // cancels the machine's open tasks when it is deactivated; the same cancel is mirrored locally so
  // the UI shows it at once, and the machine itself is taken from the response.
  private async updateAsset(id: string, patch: Partial<Pick<Asset, 'name' | 'department' | 'location' | 'workCenter' | 'isActive'>>): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) {
      throw new Error('Unauthorized to update assets.');
    }
    let saved: Asset;
    try {
      saved = await this.api.updateAsset(id, patch);
    } catch (e) {
      throw new Error(apiErrorMessage(e));
    }
    const deactivatedAt = saved.deactivatedAt ? new Date(saved.deactivatedAt) : undefined;
    this.store.updateAssets(assets => assets.map(a => a.id === id ? { ...a, ...saved, deactivatedAt } : a));
    if (patch.isActive === false) {
      const now = new Date();
      const cancelOpen = (tasks: PMTask[]) => tasks.map(t => {
        if (t.assetId !== id || t.status === 'Done' || t.status === 'Cancelled') return t;
        return { ...t, status: 'Cancelled' as PMTaskStatus, cancelledReason: 'Machine deactivated', cancelledAt: now };
      });
      this.store.updatePmTasks(cancelOpen);
      this.store.updatePreviewTasks(cancelOpen);
    }
  }

  createProduct(product: { id: string, name: string }): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) {
      return Promise.reject(new Error('Unauthorized to create products.'));
    }
    return this.api.createProduct(product).then(() => {
      // Reload user profile so new product appears in owned/accessible lists
      return this.authService.init();
    });
  }

  // ── Machine changes: direct while not in plan, approval once in plan ─────────

  // The one open (unresolved) request for a machine, if any.
  openRequestFor(assetId: string): PendingMasterPlanChange | undefined {
    return this.pendingMasterPlanChangesSignal().find(c => c.assetId === assetId && c.status === 'pending');
  }

  // A new machine is created at once, with no approval, and starts Not in plan. It joins the Master
  // Plan later through Send to Master Plan.
  async addMachine(input: { id: string; name: string; location: string; department: string; workCenter: string }): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) {
      throw new Error('Unauthorized to create assets.');
    }
    const machine = {
      id: input.id.trim(),
      name: input.name.trim(),
      location: input.location.trim(),
      department: input.department.trim(),
      workCenter: input.workCenter.trim()
    };
    if (!machine.id || !machine.name || !machine.location || !machine.department || !machine.workCenter) {
      throw new Error('Machine ID, name, customer, department and work center are required.');
    }
    if (this.store.assets().some(a => a.id.toLowerCase() === machine.id.toLowerCase())) {
      throw new Error('A machine with this ID already exists. Machine IDs must be unique.');
    }
    await this.createAsset(machine);
  }

  // Edits a machine's own fields. Not in plan: applied at once. In plan: becomes an approval request.
  // Only fields that differ from the live machine count, so re-saving unchanged values changes nothing
  // (an audit log where "approved" sometimes means nothing happened is not trustworthy).
  async editMachine(
    assetId: string,
    fields: { name?: string; department?: string; location?: string; workCenter?: string },
    note = 'Edited via Manage Machines'
  ): Promise<'applied' | 'submitted' | 'unchanged'> {
    const current = this.store.assets().find(a => a.id === assetId);
    if (!current) throw new Error('Machine not found.');
    this.assertNotWaiting(assetId);

    const diff: { name?: string; department?: string; location?: string; workCenter?: string } = {};
    for (const key of ['name', 'department', 'location', 'workCenter'] as const) {
      const raw = fields[key];
      if (raw === undefined) continue;
      const value = raw.trim();
      if (!value) throw new Error('Name, Department, Customer, and Work Center are required.');
      if (value !== (current[key] || '').trim()) diff[key] = value;
    }
    if (Object.keys(diff).length === 0) return 'unchanged';

    if (!this.isInMasterPlan(assetId)) {
      await this.updateAsset(assetId, diff);
      return 'applied';
    }
    await this.submitMasterPlanChange({ assetId, assetName: current.name, department: current.department, changes: { editFields: diff }, note });
    return this.openRequestFor(assetId) ? 'submitted' : 'unchanged';
  }

  // Deactivates or reactivates a machine. Not in plan: applied at once. In plan: becomes an approval request.
  async setMachineActive(assetId: string, active: boolean, note?: string): Promise<'applied' | 'submitted' | 'unchanged'> {
    const current = this.store.assets().find(a => a.id === assetId);
    if (!current) throw new Error('Machine not found.');
    this.assertNotWaiting(assetId);

    if (!this.isInMasterPlan(assetId)) {
      if ((current.isActive !== false) === active) return 'unchanged';
      await this.updateAsset(assetId, { isActive: active });
      return 'applied';
    }
    await this.submitMasterPlanChange({
      assetId,
      assetName: current.name,
      department: current.department,
      changes: { setActive: active },
      note: note ?? (active ? 'Reactivation requested via Manage Machines' : 'Deactivation requested via Manage Machines')
    });
    return this.openRequestFor(assetId) ? 'submitted' : 'unchanged';
  }

  // ── Draft PM types (machines that are not in the Master Plan yet) ────────────

  draftPmTypesFor(assetId: string): DraftPmType[] {
    return this.draftPmTypesSignal()[assetId] ?? [];
  }

  // True when the machine already has this PM type: saved, previewed (approved into the plan) or drafted.
  hasPmType(assetId: string, frequency: string): boolean {
    const target = normalizeFrequency(frequency);
    return !!this.store.findExistingPmOfType(assetId, frequency)
      || this.draftPmTypesFor(assetId).some(d => normalizeFrequency(d.frequency) === target);
  }

  // Shared guard for changing a machine's drafts: allowed user, machine exists, machine not in the plan
  // and not waiting for approval.
  private draftableMachine(assetId: string, verb: 'added' | 'removed'): Asset {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) {
      throw new Error('Unauthorized to change PM types.');
    }
    const machine = this.store.assets().find(a => a.id === assetId);
    if (!machine) throw new Error('Machine not found.');
    if (isAssetInMasterPlan(machine)) {
      throw new Error(`This machine is in the Master Plan, so PM types are ${verb} through an approval request.`);
    }
    this.assertNotWaiting(assetId);
    return machine;
  }

  // Saves a draft at once: no approval and no task. It becomes real PM tasks only when the machine is
  // approved into the plan.
  async addDraftPmType(assetId: string, frequency: string, detail: NewPmTypeDetail): Promise<void> {
    const machine = this.draftableMachine(assetId, 'added');
    if (machine.isActive === false) throw new Error('Reactivate this machine before adding PM types.');

    const label = frequency.trim();
    if (!label) throw new Error('Choose a PM type (frequency).');
    const title = detail.title.trim();
    if (!title) throw new Error('A PM title is required.');
    if (detail.estimatedHours !== undefined && !(Number.isFinite(detail.estimatedHours) && detail.estimatedHours > 0)) {
      throw new Error('Estimated hours must be a positive number.');
    }
    if (detail.startDate !== undefined && !Number.isFinite(new Date(detail.startDate).getTime())) {
      throw new Error('The first due date is not valid.');
    }
    if (this.hasPmType(assetId, label)) {
      throw new Error(`This machine already has a ${label} PM. You cannot create another PM of the same type for this machine.`);
    }

    let saved: DraftPmType;
    try {
      saved = await this.api.saveDraftPmType(assetId, label, {
        title,
        description: detail.description?.trim() || undefined,
        estimatedHours: detail.estimatedHours,
        partsRequired: detail.partsRequired ? [...detail.partsRequired] : undefined,
        checklist: detail.checklist
          ?.filter(item => item.text.trim())
          .map(item => ({ text: item.text.trim(), requiresPhoto: item.requiresPhoto, requiresValue: item.requiresValue })),
        startDate: detail.startDate ? new Date(detail.startDate) : undefined,
        isRecurring: detail.isRecurring
      });
    } catch (e) {
      throw new Error(apiErrorMessage(e));
    }
    this.draftPmTypesSignal.update(all => ({ ...all, [assetId]: [...(all[assetId] ?? []), saved] }));
  }

  async removeDraftPmType(assetId: string, frequency: string): Promise<void> {
    this.draftableMachine(assetId, 'removed');
    const target = normalizeFrequency(frequency);
    const draft = this.draftPmTypesFor(assetId).find(d => normalizeFrequency(d.frequency) === target);
    if (!draft) throw new Error('This PM type is not a draft on this machine.');
    try {
      await this.api.deleteDraftPmType(assetId, draft.frequency);
    } catch (e) {
      throw new Error(apiErrorMessage(e));
    }
    this.draftPmTypesSignal.update(all => ({
      ...all,
      [assetId]: (all[assetId] ?? []).filter(d => d !== draft)
    }));
  }

  // The PM types the Remove PM Type action can offer: drafts for a Not-in-plan machine, live types otherwise.
  removablePmTypeFrequencies(assetId: string): string[] {
    const machine = this.store.assets().find(a => a.id === assetId);
    if (!machine) return [];
    return isAssetInMasterPlan(machine)
      ? this.activeFrequenciesForAsset(assetId)
      : this.draftPmTypesFor(assetId).map(d => d.frequency);
  }

  // Removes a PM type. Not in plan: the draft goes at once. In plan: becomes an approval request.
  async removePmType(assetId: string, frequency: string): Promise<'applied' | 'submitted' | 'unchanged'> {
    const machine = this.store.assets().find(a => a.id === assetId);
    if (!machine) throw new Error('Machine not found.');
    this.assertNotWaiting(assetId);
    if (!isAssetInMasterPlan(machine)) {
      await this.removeDraftPmType(assetId, frequency);
      return 'applied';
    }
    await this.submitMasterPlanChange({
      assetId,
      assetName: machine.name,
      department: machine.department,
      changes: { removePmTypes: [frequency] },
      note: `Removal of ${frequency} PM requested via Manage Machines`
    });
    return this.openRequestFor(assetId) ? 'submitted' : 'unchanged';
  }

  // ── Send to Master Plan: Not in plan → waiting for approval → In plan ────────

  private static readonly WAITING_LOCK = 'This machine is waiting for approval. Withdraw the request to change it.';

  isSendRequest(c: PendingMasterPlanChange): boolean {
    return c.proposedState.addToPlan === true;
  }

  // Derived, never stored. Only a Send can open a request for a Not-in-plan machine.
  isWaitingForApproval(assetId: string): boolean {
    const machine = this.store.assets().find(a => a.id === assetId);
    return !!machine && !isAssetInMasterPlan(machine) && !!this.openRequestFor(assetId);
  }

  // The machine is locked while it waits, so what the approver reviews cannot change underneath them.
  private assertNotWaiting(assetId: string): void {
    if (this.isWaitingForApproval(assetId)) throw new Error(MasterPlanService.WAITING_LOCK);
  }

  // Null when Send is allowed, otherwise the reason (shown as the hint next to the disabled button).
  sendBlockedReason(assetId: string): string | null {
    const machine = this.store.assets().find(a => a.id === assetId);
    if (!machine) return 'Machine not found.';
    if (isAssetInMasterPlan(machine)) return 'This machine is already in the Master Plan.';
    if (this.openRequestFor(assetId)) return 'This machine is already waiting for approval.';
    if (machine.isActive === false) return 'Reactivate this machine before sending it.';
    if (this.draftPmTypesFor(assetId).length === 0) return 'Add at least one PM type before sending.';
    return null;
  }

  // One open request carrying the machine; the backend builds its PM types from the machine's drafts.
  // The drafts stay on the machine while it waits (it is locked) and are cleared once it is approved.
  async sendToMasterPlan(assetId: string): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.canProposeMasterPlanChange()) {
      throw new Error('Unauthorized to propose PM Master Plan changes.');
    }
    const blocked = this.sendBlockedReason(assetId);
    if (blocked) throw new Error(blocked);

    const machine = this.store.assets().find(a => a.id === assetId)!;
    try {
      await this.api.submitMasterPlanChange({
        assetId,
        proposedState: { addToPlan: true },
        note: `Send ${machine.name} to the Master Plan`
      });
    } catch (e) {
      throw new Error(apiErrorMessage(e));
    }
    await this.refreshChanges();
  }

  // Deletes the open Send request (it was never decided, so no audit entry). The machine is unlocked
  // and keeps its drafts.
  async withdrawSendRequest(assetId: string): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Unauthorized to withdraw this request.');
    const open = this.openRequestFor(assetId);
    if (!open || !this.isSendRequest(open)) {
      throw new Error('This machine has no request waiting for approval.');
    }
    if (open.submittedBy !== user.employeeId && !this.canApproveMasterPlanChange()) {
      throw new Error('Only the sender or an approver can withdraw this request.');
    }
    try {
      await this.api.withdrawMasterPlanChange(open.id);
    } catch (e) {
      throw new Error(apiErrorMessage(e));
    }
    await this.refreshChanges();
  }

  // The rejection to show on a Not-in-plan machine: only while its newest request is a rejected Send.
  // A withdrawn request is deleted, so withdrawing a newer Send shows the older rejection again.
  lastRejectionFor(assetId: string): { by: string; byName: string; at: Date; reason: string } | undefined {
    const machine = this.store.assets().find(a => a.id === assetId);
    if (!machine || isAssetInMasterPlan(machine) || this.openRequestFor(assetId)) return undefined;
    // The list is newest first and sort is stable, so equal timestamps keep that order.
    const [latest] = this.pendingMasterPlanChangesSignal()
      .filter(c => c.assetId === assetId)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    if (!latest || latest.status !== 'rejected' || !this.isSendRequest(latest) || !latest.resolvedBy || !latest.resolvedAt) {
      return undefined;
    }
    return {
      by: latest.resolvedBy,
      byName: this.authService.getUser(latest.resolvedBy)?.name ?? latest.resolvedBy,
      at: new Date(latest.resolvedAt),
      reason: latest.rejectReason ?? ''
    };
  }

  // A not-yet-approved "add PM type" for this asset+frequency, so Create PM can block a second submission.
  findPendingPmAdd(assetId: string, frequency: string): PendingMasterPlanChange | undefined {
    const target = normalizeFrequency(frequency);
    return this.pendingMasterPlanChangesSignal().find(c =>
      c.assetId === assetId && c.status === 'pending' &&
      (c.proposedState.addPmTypes || []).some(f => normalizeFrequency(f) === target));
  }

  canProposeMasterPlanChange(): boolean {
    const role = this.authService.currentUser()?.baseRole;
    return role === 'engineer' || role === 'manager' || role === 'admin';
  }

  canApproveMasterPlanChange(): boolean {
    return this.authService.hasPermission('pm.masterplan.approve');
  }

  // Unknown machine ids are not in plan.
  isInMasterPlan(assetId: string): boolean {
    const asset = this.store.assets().find(a => a.id === assetId);
    return !!asset && isAssetInMasterPlan(asset);
  }

  activeFrequenciesForAsset(assetId: string): string[] {
    return Array.from(new Set(
      this.store.planTasks().filter(t => t.assetId === assetId && t.status !== 'Cancelled').map(t => t.frequency)
    ));
  }

  // The machine's PM types as the detail window lists them: live types (real + preview tasks, cancelled
  // ones left out) plus the changes waiting for approval on an In-plan machine. Ordered most to least
  // frequent. Nothing is invented: a field the source does not have stays empty.
  pmTypesFor(assetId: string): PmTypeSummary[] {
    const key = (f: string) => normalizeFrequency(f);
    const open = this.openRequestFor(assetId);
    const removing = new Set((open?.proposedState.removePmTypes ?? []).map(key));
    const byType = new Map<string, PMTask[]>();
    for (const t of this.store.planTasks()) {
      if (t.assetId !== assetId || t.status === 'Cancelled') continue;
      byType.set(key(t.frequency), [...(byType.get(key(t.frequency)) ?? []), t]);
    }
    const checklistOf = (items?: { text: string; requiresPhoto?: boolean; requiresValue?: boolean }[]) =>
      (items ?? []).map(i => ({ text: i.text, requiresPhoto: i.requiresPhoto, requiresValue: i.requiresValue }));
    const byDue = (a: PMTask, b: PMTask) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime();

    const types: PmTypeSummary[] = [];
    for (const [typeKey, group] of byType) {
      const openTasks = group.filter(t => t.status !== 'Done').sort(byDue);
      const rep = openTasks[0] ?? [...group].sort(byDue).at(-1)!;
      types.push({
        frequency: rep.frequency,
        title: rep.title,
        state: removing.has(typeKey) ? 'waiting-remove' : 'live',
        // A recurring series is marked by a [SeriesID: …] tag in the description (the rest of the app
        // groups series that way) or by a schedule id; a standalone task has neither.
        isRecurring: group.some(t => !!t.scheduleId || SERIES_MARKER.test(t.description ?? '')),
        firstDue: openTasks[0] ? new Date(openTasks[0].nextDueDate) : undefined,
        estimatedHours: rep.estimatedHours,
        description: (rep.description ?? '').replace(SERIES_MARKER_G, '').trim() || undefined,
        parts: [...(rep.partsRequired ?? [])],
        checklist: checklistOf(rep.checklist)
      });
    }

    const asset = this.store.assets().find(a => a.id === assetId);
    if (asset && !isAssetInMasterPlan(asset)) {
      for (const { frequency, detail: d } of this.draftPmTypesFor(assetId)) {
        if (byType.has(key(frequency))) continue;
        types.push({
          frequency,
          title: d.title,
          state: 'draft',
          isRecurring: d.isRecurring,
          firstDue: d.startDate ? new Date(d.startDate) : undefined,
          estimatedHours: d.estimatedHours,
          description: d.description || undefined,
          parts: [...(d.partsRequired ?? [])],
          checklist: checklistOf(d.checklist)
        });
      }
    }

    if (open && this.isInMasterPlan(assetId)) {
      for (const frequency of open.proposedState.addPmTypes ?? []) {
        if (byType.has(key(frequency))) continue;
        const d = open.proposedState.newPmTypeDetails?.[frequency];
        types.push({
          frequency,
          title: d?.title ?? `${frequency} PM`,
          state: 'waiting-add',
          isRecurring: d?.isRecurring,
          firstDue: d?.startDate ? new Date(d.startDate) : undefined,
          estimatedHours: d?.estimatedHours,
          description: d?.description || undefined,
          parts: [...(d?.partsRequired ?? [])],
          checklist: checklistOf(d?.checklist)
        });
      }
    }

    // Labels that are not understood rank Infinity, so the subtraction can be NaN: fall back to the name.
    return types.sort((a, b) => (frequencyRank(a.frequency) - frequencyRank(b.frequency)) || a.frequency.localeCompare(b.frequency));
  }

  // Every engineer can propose — no department scoping (unlike Templates). One open card per machine:
  // the backend merges repeated edits into that card, and drops the card when the edits net out to no
  // change (re-sent edits, or an edit made and then undone).
  async submitMasterPlanChange(input: {
    assetId: string;
    assetName: string;
    department: string;
    changes: Partial<ProposedMasterPlanState>;
    note: string;
  }): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.canProposeMasterPlanChange()) {
      throw new Error('Unauthorized to propose PM Master Plan changes.');
    }
    if (!input.note.trim()) {
      throw new Error('A note describing this change is required.');
    }
    const target = this.store.assets().find(a => a.id === input.assetId);
    if (!target) throw new Error('Machine not found.');
    if (!isAssetInMasterPlan(target)) {
      throw new Error('This machine is not in the Master Plan yet, so its changes apply directly and need no approval.');
    }

    try {
      await this.api.submitMasterPlanChange({ assetId: input.assetId, proposedState: input.changes, note: input.note });
    } catch (e) {
      throw new Error(apiErrorMessage(e));
    }
    await this.refreshChanges();
  }

  // Applies the approved cards on the backend, which diffs each card against the machine's live state,
  // creates and cancels the PMs, writes the audit rows and saves one version snapshot per batch.
  // Each request is applied on its own, so one failing card does not stop the others.
  async approveMasterPlanChanges(ids: string[]): Promise<{ id: string; ok: boolean; error?: any }[]> {
    const user = this.authService.currentUser();
    if (!user || !this.canApproveMasterPlanChange()) {
      throw new Error('Unauthorized to approve PM Master Plan changes.');
    }

    // Claimed before the first await, so a second approve/reject arriving while this one runs
    // (double-click, bulk + row approve) is refused instead of applying the request twice.
    const claimed = new Set(ids.filter(id => !this.isProcessingMasterPlanChange(id)));
    this.processingMasterPlanChangeIdsSignal.update(set => new Set([...set, ...claimed]));
    try {
      return await this.applyMasterPlanApprovals(ids, claimed);
    } finally {
      this.processingMasterPlanChangeIdsSignal.update(set => new Set([...set].filter(id => !claimed.has(id))));
    }
  }

  isProcessingMasterPlanChange(id: string): boolean {
    return this.processingMasterPlanChangeIdsSignal().has(id);
  }

  private async applyMasterPlanApprovals(ids: string[], claimed: ReadonlySet<string>): Promise<{ id: string; ok: boolean; error?: any }[]> {
    let outcome = new Map<string, { ok: boolean; error?: string }>();
    if (claimed.size > 0) {
      try {
        const response = await this.api.approveMasterPlanChanges(ids.filter(id => claimed.has(id)));
        outcome = new Map(response.results.map(r => [r.id, r]));
      } catch (e) {
        throw new Error(apiErrorMessage(e, 'Failed to approve. Please try again.'));
      }
      // The backend created, cancelled and changed PMs and machines, so everything is read again. The
      // approval is already saved, so a failed read must not be reported as a failed approval.
      await Promise.all([this.store.loadData(), this.refreshChanges(), this.refreshVersions()])
        .then(() => this.refreshDrafts())
        .catch(e => console.error('Reload after approval failed', e));
    }
    return ids.map(id => {
      if (!claimed.has(id)) return { id, ok: false, error: new Error('This request is already being processed.') };
      const r = outcome.get(id);
      if (r?.ok) return { id, ok: true };
      return { id, ok: false, error: new Error(r?.error ?? 'Failed to approve. Please try again.') };
    });
  }

  // Single-item convenience wrapper around approveMasterPlanChanges.
  async approveMasterPlanChange(id: string): Promise<void> {
    const [result] = await this.approveMasterPlanChanges([id]);
    if (!result.ok) throw result.error;
  }

  async rejectMasterPlanChange(id: string, reason: string): Promise<void> {
    if (!this.canApproveMasterPlanChange()) {
      throw new Error('Unauthorized to reject PM Master Plan changes.');
    }
    if (!reason.trim()) {
      throw new Error('A rejection reason is required.');
    }
    if (this.isProcessingMasterPlanChange(id)) {
      throw new Error('This request is already being processed.');
    }
    try {
      await this.api.rejectMasterPlanChange(id, reason.trim());
    } catch (e) {
      throw new Error(apiErrorMessage(e, 'Failed to reject. Please try again.'));
    }
    await this.refreshChanges();
  }
}
