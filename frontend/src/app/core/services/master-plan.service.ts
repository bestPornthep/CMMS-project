import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Asset, AuditLog, DraftPmType, MasterPlanEditHistoryEntry, MasterPlanVersionSnapshot, NewPmTypeDetail, PendingMasterPlanChange,
  PMTask, PMTaskStatus, PmTypeSummary, ProposedMasterPlanState, User
} from '../models/pm.model';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { PmStore } from './pm-store.service';
import { PmTaskService } from './pm-task.service';
import { reconcileMasterPlanChange, ReconcileResult } from './pm-masterplan-reconcile.util';
import { frequencyRank, normalizeFrequency } from './pm-frequency.util';
import { copyPmTypeDetail, isAssetInMasterPlan, SERIES_MARKER, SERIES_MARKER_G } from './pm-plan.util';
import { generateOccurrenceDates } from './pm-preview-occurrences.util';
import { buildMockMasterPlanChanges } from './pm-masterplan-mock';

@Injectable({ providedIn: 'root' })
export class MasterPlanService {
  private api = inject(ApiService);
  private authService = inject(AuthService);
  private store = inject(PmStore);
  private taskService = inject(PmTaskService);

  // ── PM Master Plan approval workflow — first-version, mock-only state ────
  // No backend endpoint exists for any of this yet (see docs/backend_fixes_needed_combined.html#masterplan)
  // so it lives purely in these in-memory signals — never persisted, lost on refresh.
  private pendingMasterPlanChangesSignal = signal<PendingMasterPlanChange[]>([]);
  private masterPlanVersionsSignal = signal<MasterPlanVersionSnapshot[]>([]);
  private localAuditLogsSignal = signal<AuditLog[]>([]);
  private requestSeq = 0;
  // Requests whose approval is still running, so a second approve/reject cannot apply them twice.
  private processingMasterPlanChangeIdsSignal = signal<ReadonlySet<string>>(new Set());

  private previewSeq = 0;

  // PM types defined on machines that are not in the Master Plan yet, by machine id (see DraftPmType).
  private draftPmTypesSignal = signal<Record<string, DraftPmType[]>>({});

  readonly pendingMasterPlanChanges = computed(() => this.pendingMasterPlanChangesSignal());
  readonly masterPlanVersions = computed(() => this.masterPlanVersionsSignal());
  readonly localAuditLogs = computed(() => this.localAuditLogsSignal());

  // `mock: true` skips the real API call entirely (purely local signal update) — lets the
  // Machines page be exercised end-to-end before the backend supports isActive/PATCH (see
  // docs/backend_fixes_needed_combined.html#machine). Never used in production builds.
  // A new machine always starts out of the Master Plan; a mock one also never leaves this browser session.
  createAsset(asset: { id: string, name: string, location: string, department: string, workCenter?: string }, opts?: { mock?: boolean }): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) {
      return Promise.reject(new Error('Unauthorized to create assets.'));
    }
    const newAsset: Asset = { ...asset, isActive: true, isInMasterPlan: false, ...(opts?.mock ? { isLocalOnly: true } : {}) };
    if (opts?.mock) {
      this.store.updateAssets(assets => [...assets, newAsset]);
      return Promise.resolve();
    }
    return this.api.createAsset(asset).then(() => {
      this.store.updateAssets(assets => [...assets, newAsset]);
    });
  }

  // Edits a machine's own fields and/or its active status. Deactivating cascades locally to
  // cancel that machine's not-yet-Done tasks so the UI reflects the effect immediately — the
  // backend is the source of truth for actually pausing the recurring schedule (see
  // docs/backend_fixes_needed_combined.html#machine); this local mirror is a best-effort UI preview.
  private updateAsset(id: string, patch: Partial<Pick<Asset, 'name' | 'department' | 'location' | 'workCenter' | 'isActive'>>, opts?: { mock?: boolean }): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) {
      return Promise.reject(new Error('Unauthorized to update assets.'));
    }
    const applyLocally = () => {
      const now = new Date();
      // Track when deactivation happened so PM Master Plan can tell "deactivated this year"
      // (still show, with cutoff) from "deactivated a past year" (exclude entirely).
      const withTimestamp = { ...patch } as typeof patch & { deactivatedAt?: Date };
      if (patch.isActive === false) withTimestamp.deactivatedAt = now;
      else if (patch.isActive === true) withTimestamp.deactivatedAt = undefined;
      this.store.updateAssets(assets => assets.map(a => a.id === id ? { ...a, ...withTimestamp } : a));
      if (patch.isActive === false) {
        const cancelOpen = (tasks: PMTask[]) => tasks.map(t => {
          if (t.assetId !== id || t.status === 'Done' || t.status === 'Cancelled') return t;
          return { ...t, status: 'Cancelled' as PMTaskStatus, cancelledReason: 'Machine deactivated', cancelledAt: now };
        });
        this.store.updatePmTasks(cancelOpen);
        this.store.updatePreviewTasks(cancelOpen);
      }
    };
    if (opts?.mock) {
      applyLocally();
      return Promise.resolve();
    }
    return this.api.updateAsset(id, patch).then(() => applyLocally());
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

  // A new machine is created at once, with no approval: Not in plan and local-only (never sent to
  // the backend). It joins the Master Plan later through Send to Master Plan.
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
    await this.createAsset(machine, { mock: true });
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
      await this.updateAsset(assetId, diff, { mock: true });
      return 'applied';
    }
    this.submitMasterPlanChange({ assetId, assetName: current.name, department: current.department, changes: { editFields: diff }, note });
    return this.openRequestFor(assetId) ? 'submitted' : 'unchanged';
  }

  // Deactivates or reactivates a machine. Not in plan: applied at once. In plan: becomes an approval request.
  async setMachineActive(assetId: string, active: boolean, note?: string): Promise<'applied' | 'submitted' | 'unchanged'> {
    const current = this.store.assets().find(a => a.id === assetId);
    if (!current) throw new Error('Machine not found.');
    this.assertNotWaiting(assetId);

    if (!this.isInMasterPlan(assetId)) {
      if ((current.isActive !== false) === active) return 'unchanged';
      await this.updateAsset(assetId, { isActive: active }, { mock: true });
      return 'applied';
    }
    this.submitMasterPlanChange({
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

  // Saves a draft at once: no approval, no task, nothing sent to the backend. It becomes real PM tasks
  // only when the machine is approved into the plan.
  addDraftPmType(assetId: string, frequency: string, detail: NewPmTypeDetail): void {
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

    const draft: DraftPmType = {
      frequency: label,
      detail: {
        title,
        description: detail.description?.trim() || undefined,
        estimatedHours: detail.estimatedHours,
        partsRequired: detail.partsRequired ? [...detail.partsRequired] : undefined,
        checklist: detail.checklist
          ?.filter(item => item.text.trim())
          .map(item => ({ text: item.text.trim(), requiresPhoto: item.requiresPhoto, requiresValue: item.requiresValue })),
        startDate: detail.startDate ? new Date(detail.startDate) : undefined,
        isRecurring: detail.isRecurring
      }
    };
    this.draftPmTypesSignal.update(all => ({ ...all, [assetId]: [...(all[assetId] ?? []), draft] }));
  }

  removeDraftPmType(assetId: string, frequency: string): void {
    this.draftableMachine(assetId, 'removed');
    const target = normalizeFrequency(frequency);
    if (!this.draftPmTypesFor(assetId).some(d => normalizeFrequency(d.frequency) === target)) {
      throw new Error('This PM type is not a draft on this machine.');
    }
    this.draftPmTypesSignal.update(all => ({
      ...all,
      [assetId]: (all[assetId] ?? []).filter(d => normalizeFrequency(d.frequency) !== target)
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
  removePmType(assetId: string, frequency: string): 'applied' | 'submitted' | 'unchanged' {
    const machine = this.store.assets().find(a => a.id === assetId);
    if (!machine) throw new Error('Machine not found.');
    this.assertNotWaiting(assetId);
    if (!isAssetInMasterPlan(machine)) {
      this.removeDraftPmType(assetId, frequency);
      return 'applied';
    }
    this.submitMasterPlanChange({
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

  // One open request carrying the machine and a copy of all its drafts. The drafts stay on the machine
  // while it waits (it is locked) and are cleared only when the request is approved.
  sendToMasterPlan(assetId: string): void {
    const user = this.authService.currentUser();
    if (!user || !this.canProposeMasterPlanChange()) {
      throw new Error('Unauthorized to propose PM Master Plan changes.');
    }
    const blocked = this.sendBlockedReason(assetId);
    if (blocked) throw new Error(blocked);

    const machine = this.store.assets().find(a => a.id === assetId)!;
    const request = this.buildSendRequest(machine, this.draftPmTypesFor(assetId), user.employeeId, new Date());
    this.pendingMasterPlanChangesSignal.update(list => [request, ...list]);
  }

  private buildSendRequest(machine: Asset, drafts: DraftPmType[], submittedBy: string, at: Date): PendingMasterPlanChange {
    const note = `Send ${machine.name} to the Master Plan`;
    return {
      id: this.newRequestId(),
      assetId: machine.id,
      assetName: machine.name,
      department: machine.department,
      proposedState: {
        addToPlan: true,
        addPmTypes: drafts.map(d => d.frequency),
        newPmTypeDetails: Object.fromEntries(drafts.map(d => [d.frequency, copyPmTypeDetail(d.detail)]))
      },
      submittedBy,
      submittedAt: at,
      note,
      history: [{ timestamp: at, by: submittedBy, note }],
      status: 'pending'
    };
  }

  // Deletes the open Send request (it was never decided, so no audit entry). The machine is unlocked
  // and keeps its drafts.
  withdrawSendRequest(assetId: string): void {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Unauthorized to withdraw this request.');
    const open = this.openRequestFor(assetId);
    if (!open || !this.isSendRequest(open)) {
      throw new Error('This machine has no request waiting for approval.');
    }
    if (open.submittedBy !== user.employeeId && !this.canApproveMasterPlanChange()) {
      throw new Error('Only the sender or an approver can withdraw this request.');
    }
    this.pendingMasterPlanChangesSignal.update(list => list.filter(c => c.id !== open.id));
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

  // Removes a PM type from a machine already in the plan: cancels its open tasks locally (same as
  // updateAsset's deactivate cascade) and pauses the series so the generator stops. Only
  // FUTURE tasks are affected — Done/Cancelled history is never touched.
  private async removePmScheduleType(assetId: string, frequency: string, opts?: { mock?: boolean }): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) {
      throw new Error('Unauthorized to update PM schedules.');
    }
    const target = normalizeFrequency(frequency);
    // Only a real series is ever paused on the backend; a preview series was never saved there.
    const seriesId = this.store.pmTasks().find(t => t.assetId === assetId && normalizeFrequency(t.frequency) === target)?.scheduleId;

    if (opts?.mock || !seriesId) {
      this.cancelOpenTasksOfType(assetId, frequency);
      return;
    }
    // Backend support for isActive on schedules is unconfirmed — see
    // docs/backend_fixes_needed_combined.html#masterplan. Falls back to local-only on failure so the
    // demo still works while that's verified/built.
    try {
      await this.api.updateSchedule(seriesId, { isActive: false });
    } catch {
      // fall through to local-only apply
    }
    this.cancelOpenTasksOfType(assetId, frequency);
  }

  private cancelOpenTasksOfType(assetId: string, frequency: string): void {
    const target = normalizeFrequency(frequency);
    const now = new Date();
    const cancelType = (tasks: PMTask[]) => tasks.map(t => {
      if (t.assetId !== assetId || normalizeFrequency(t.frequency) !== target) return t;
      if (t.status === 'Done' || t.status === 'Cancelled') return t;
      return { ...t, status: 'Cancelled' as PMTaskStatus, cancelledReason: 'PM type removed', cancelledAt: now };
    });
    this.store.updatePmTasks(cancelType);
    this.store.updatePreviewTasks(cancelType);
  }

  // Creates the preview tasks of a PM type that was just approved into the plan: one per occurrence
  // (see generateOccurrenceDates). Purely in memory — never sent to the API, and only plan views see
  // them. `detail` is absent for dev-seed cards, which carry no PM definition.
  private addPreviewPmType(asset: { id: string; location?: string; department?: string }, frequency: string, detail?: NewPmTypeDetail, createdBy?: string): void {
    const dates = generateOccurrenceDates({ frequency, firstDue: detail?.startDate, isRecurring: detail?.isRecurring });
    const seq = ++this.previewSeq;
    const stamp = Date.now();
    const scheduleId = detail?.isRecurring === false ? undefined : `PREVIEW-SCH-${stamp}-${seq}`;
    const createdAt = new Date();
    const tasks: PMTask[] = dates.map((due, i) => ({
      id: `PREVIEW-${stamp}-${seq}-${i}`,
      title: detail?.title ?? `${frequency} PM (added via Master Plan approval)`,
      description: detail?.description ?? '[PREVIEW — nothing is saved to the backend]',
      frequency,
      assetId: asset.id,
      nextDueDate: due,
      estimatedHours: detail?.estimatedHours ?? 1,
      status: 'Pending' as PMTaskStatus,
      productId: asset.location,
      department: asset.department,
      scheduleId,
      partsRequired: detail?.partsRequired ? [...detail.partsRequired] : undefined,
      checklist: detail?.checklist?.map(item => ({ text: item.text, done: false, requiresPhoto: item.requiresPhoto, requiresValue: item.requiresValue })),
      createdBy,
      createdAt,
      isPreview: true
    }));
    this.store.updatePreviewTasks(list => [...tasks, ...list]);
  }

  // Real create (unlike addPreviewPmType): only reached when Create PM captured full detail.
  private async createPmFromProposal(asset: Asset, frequency: string, d: NewPmTypeDetail, createdBy: string): Promise<void> {
    const common = {
      title: d.title,
      description: d.description ?? '',
      frequency,
      assetId: asset.id,
      productId: asset.location,
      department: asset.department,
      estimatedHours: d.estimatedHours ?? 1,
      partsRequired: d.partsRequired ?? [],
      createdBy
    };
    const start = d.startDate ?? new Date();
    if (d.isRecurring === false) {
      await this.taskService.addPmTask({
        ...common,
        nextDueDate: start,
        status: 'Pending',
        checklist: (d.checklist ?? []).map(i => ({ text: i.text, done: false, requiresPhoto: i.requiresPhoto, requiresValue: i.requiresValue }))
      });
    } else {
      await this.taskService.addPmSchedule({ id: '', ...common, startDate: start, checklist: d.checklist });
    }
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

  // True when a proposed net state resolves to no actual change against the live current state —
  // e.g. a field was edited then edited back, or Save was clicked with nothing changed. Used to
  // auto-clear a pending card instead of leaving a trustworthiness-eroding "approved nothing"
  // entry in the audit log (see handoff: empty-delta ⇒ no submission).
  private isMasterPlanChangeEmpty(assetId: string, proposed: ProposedMasterPlanState): boolean {
    const currentAsset = this.store.assets().find(a => a.id === assetId);
    if (!currentAsset) return false; // can't verify against a live asset — don't auto-clear
    const diff = reconcileMasterPlanChange({
      proposed,
      currentAssetInPlan: isAssetInMasterPlan(currentAsset),
      currentAssetActive: currentAsset.isActive !== false,
      currentActiveFrequencies: this.activeFrequenciesForAsset(assetId),
      currentAssetFields: { name: currentAsset.name, department: currentAsset.department, location: currentAsset.location, workCenter: currentAsset.workCenter }
    });
    return this.isEmptyDiff(diff);
  }

  private isEmptyDiff(diff: ReconcileResult): boolean {
    return !diff.setInPlan && diff.setAssetActive === undefined && diff.addFrequencies.length === 0
      && diff.removeFrequencies.length === 0 && !diff.editFields;
  }

  private newRequestId(): string {
    return `PMC-${Date.now()}-${++this.requestSeq}`;
  }

  // Every engineer can propose — no department scoping (unlike Templates). One open pending
  // card per machine: repeated edits before approval merge into the same card's `proposedState`
  // (reducer pattern) instead of queuing separate cards, so the approver never sees duplicates.
  submitMasterPlanChange(input: {
    assetId: string;
    assetName: string;
    department: string;
    changes: Partial<ProposedMasterPlanState>;
    note: string;
  }): void {
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

    const now = new Date();
    const historyEntry: MasterPlanEditHistoryEntry = { timestamp: now, by: user.employeeId, note: input.note };

    this.pendingMasterPlanChangesSignal.update(list => {
      const existing = list.find(c => c.assetId === input.assetId && c.status === 'pending');

      if (existing) {
        const merged: ProposedMasterPlanState = { ...existing.proposedState };
        if (input.changes.setActive !== undefined) merged.setActive = input.changes.setActive;
        if (input.changes.editFields) merged.editFields = { ...(merged.editFields || {}), ...input.changes.editFields };

        // Contradicting edits collapse to the latest intent — e.g. add-then-remove-then-add
        // again nets out to just "add" (never queued as a log of operations).
        if (input.changes.addPmTypes?.length) {
          const adding = new Set(input.changes.addPmTypes.map(f => f.toLowerCase()));
          merged.removePmTypes = (merged.removePmTypes || []).filter(f => !adding.has(f.toLowerCase()));
          merged.addPmTypes = Array.from(new Set([...(merged.addPmTypes || []), ...input.changes.addPmTypes]));
        }
        if (input.changes.removePmTypes?.length) {
          const removing = new Set(input.changes.removePmTypes.map(f => f.toLowerCase()));
          merged.addPmTypes = (merged.addPmTypes || []).filter(f => !removing.has(f.toLowerCase()));
          merged.removePmTypes = Array.from(new Set([...(merged.removePmTypes || []), ...input.changes.removePmTypes]));
        }
        if (input.changes.newPmTypeDetails) {
          merged.newPmTypeDetails = { ...(merged.newPmTypeDetails || {}), ...input.changes.newPmTypeDetails };
        }
        if (merged.newPmTypeDetails) {
          const kept = new Set(merged.addPmTypes || []);
          merged.newPmTypeDetails = Object.fromEntries(Object.entries(merged.newPmTypeDetails).filter(([f]) => kept.has(f)));
        }

        // Net delta collapsed back to "no change" — discard the card entirely, edit history
        // included, rather than keep a submission that would approve into nothing auditable.
        if (this.isMasterPlanChangeEmpty(input.assetId, merged)) {
          return list.filter(c => c.id !== existing.id);
        }

        const updated: PendingMasterPlanChange = {
          ...existing,
          proposedState: merged,
          note: input.note,
          history: [...existing.history, historyEntry]
        };
        return list.map(c => c.id === existing.id ? updated : c);
      }

      // First submission for this machine nets to no real change — never create a card for it.
      if (this.isMasterPlanChangeEmpty(input.assetId, input.changes)) {
        return list;
      }

      const created: PendingMasterPlanChange = {
        id: this.newRequestId(),
        assetId: input.assetId,
        assetName: input.assetName,
        department: input.department,
        proposedState: { ...input.changes },
        submittedBy: user.employeeId,
        submittedAt: now,
        note: input.note,
        history: [historyEntry],
        status: 'pending'
      };
      return [created, ...list];
    });
  }

  private appendAuditLog(entry: Omit<AuditLog, 'id'>): void {
    const log: AuditLog = { id: `LOCAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`, ...entry };
    this.localAuditLogsSignal.update(logs => [log, ...logs]);
  }

  private static readonly VERSION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  private nextVersionLabel(): string {
    const n = this.masterPlanVersionsSignal().length;
    return MasterPlanService.VERSION_LETTERS[n] ?? `V${n + 1}`;
  }

  private saveMasterPlanVersionSnapshot(label: string): void {
    const snapshot: MasterPlanVersionSnapshot = {
      id: `MPV-${Date.now()}`,
      label,
      createdAt: new Date(),
      assets: this.store.assets().map(a => ({ ...a }))
    };
    this.masterPlanVersionsSignal.update(list => [...list, snapshot]);
  }

  // Diffs the pending card's net `proposedState` against ACTUAL current state and applies only
  // the delta (reconcile, never replay) — see pm-masterplan-reconcile.util.ts. Idempotent: a
  // second call (double-click, or two approvers racing) on an already-resolved id is a no-op.
  //
  // One call to this = one revision, whether it's a single-item approve or a bulk-approve of N
  // items: the version label is reserved ONCE up front and the snapshot is saved ONCE at the
  // end, after every item in the batch has been applied — never one snapshot per item. This
  // mirrors the audit log's "one batchTime per bulk action" rule so Version history and Audit
  // Log both describe the same discrete approval events.
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
      return await this.applyMasterPlanApprovals(ids, claimed, user);
    } finally {
      this.processingMasterPlanChangeIdsSignal.update(set => new Set([...set].filter(id => !claimed.has(id))));
    }
  }

  isProcessingMasterPlanChange(id: string): boolean {
    return this.processingMasterPlanChangeIdsSignal().has(id);
  }

  private async applyMasterPlanApprovals(ids: string[], claimed: ReadonlySet<string>, user: User): Promise<{ id: string; ok: boolean; error?: any }[]> {
    const batchTime = new Date();
    const versionLabel = this.nextVersionLabel();
    const results: { id: string; ok: boolean; error?: any }[] = [];
    let appliedAny = false;
    // Removals are local-only, but a real add reloads every task from the backend, which brings
    // back tasks cancelled earlier in the batch — so those removals are re-applied after each reload.
    const removedInBatch: { assetId: string; frequency: string }[] = [];

    // Sequential, not Promise.allSettled(...map) — items in the same batch must see each
    // other's effects (e.g. two cards touching related state) and must share one reserved
    // version label without racing on `nextVersionLabel()`.
    for (const id of ids) {
      if (!claimed.has(id)) {
        results.push({ id, ok: false, error: new Error('This request is already being processed.') });
        continue;
      }
      const record = this.pendingMasterPlanChangesSignal().find(c => c.id === id);
      if (!record || record.status !== 'pending') {
        results.push({ id, ok: false, error: new Error('Already resolved.') });
        continue;
      }
      const before = this.captureMachineState(record.assetId);
      let wroteBackend = false;

      try {
        const currentAsset = before.asset;
        if (!currentAsset) throw new Error('Machine not found.');

        const isSend = this.isSendRequest(record);
        const reconciled = reconcileMasterPlanChange({
          proposed: record.proposedState,
          currentAssetInPlan: isAssetInMasterPlan(currentAsset),
          currentAssetActive: currentAsset.isActive !== false,
          currentActiveFrequencies: this.activeFrequenciesForAsset(record.assetId),
          currentAssetFields: { name: currentAsset.name, department: currentAsset.department, location: currentAsset.location, workCenter: currentAsset.workCenter }
        });
        // A Send whose machine is already in plan (it got there some other way) applies nothing; only its
        // drafts, which an In-plan machine can no longer use, are cleared below.
        const diff: ReconcileResult = isSend && !reconciled.setInPlan
          ? { addFrequencies: [], removeFrequencies: [] }
          : reconciled;

        if (diff.setInPlan) {
          this.store.updateAssets(list => list.map(a => a.id === record.assetId ? { ...a, isInMasterPlan: true } : a));
        }
        // Combined into one updateAsset call so the local apply (and its deactivatedAt bookkeeping) runs once.
        if (diff.setAssetActive !== undefined || diff.editFields) {
          await this.updateAsset(record.assetId, {
            ...diff.editFields,
            ...(diff.setAssetActive !== undefined ? { isActive: diff.setAssetActive } : {})
          }, { mock: true });
        }
        // Re-read: PM types added below must carry the machine's new customer/department, not the old ones.
        const machine = this.store.assets().find(a => a.id === record.assetId) ?? currentAsset;
        // Adds run before removals: a real add reloads every task from the backend, which would undo a
        // local-only removal made before it.
        for (const freq of diff.addFrequencies) {
          const detail = record.proposedState.newPmTypeDetails?.[freq];
          // A Send (its snapshot of drafts) and a local-only machine never reach the backend.
          if (detail && !isSend && !machine.isLocalOnly) {
            await this.createPmFromProposal(machine, freq, detail, record.submittedBy);
            wroteBackend = true;
            for (const r of removedInBatch) this.cancelOpenTasksOfType(r.assetId, r.frequency);
          } else {
            this.addPreviewPmType(
              { id: record.assetId, location: machine.location, department: machine.department },
              freq, detail, record.submittedBy);
          }
        }
        for (const freq of diff.removeFrequencies) {
          await this.removePmScheduleType(record.assetId, freq, { mock: true });
        }
        if (isSend) {
          this.draftPmTypesSignal.update(all => {
            const rest = { ...all };
            delete rest[record.assetId];
            return rest;
          });
        }

        this.pendingMasterPlanChangesSignal.update(list => list.map(c =>
          c.id === id ? { ...c, status: 'approved' as const, resolvedBy: user.employeeId, resolvedAt: batchTime } : c));

        // A diff that reconciled to nothing (state already matched some other way since submit)
        // is resolved as approved but never written to the audit log or counted toward a new
        // version snapshot — an "approved" audit entry must mean a real change happened.
        if (!this.isEmptyDiff(diff)) {
          this.appendAuditLog({
            timestamp: batchTime,
            action: 'Approved PM Master Plan',
            actor: { name: user.name, id: user.employeeId },
            target: { name: `Rev ${versionLabel} · ${record.assetId}`, id: record.id, isUser: false },
            product: currentAsset.location,
            type: 'data',
            changes: this.describeMasterPlanDiff(diff)
          });
          appliedAny = true;
        }

        removedInBatch.push(...diff.removeFrequencies.map(frequency => ({ assetId: record.assetId, frequency })));
        results.push({ id, ok: true });
      } catch (error) {
        this.restoreMachineState(record.assetId, before, wroteBackend);
        results.push({ id, ok: false, error });
      }
    }

    if (appliedAny) this.saveMasterPlanVersionSnapshot(versionLabel);
    return results;
  }

  // What approving one request may change for its machine, so a failure part-way can be undone.
  private captureMachineState(assetId: string) {
    return {
      asset: this.store.assets().find(a => a.id === assetId),
      tasks: new Map(this.store.pmTasks().filter(t => t.assetId === assetId).map(t => [t.id, t])),
      previews: new Map(this.store.previewTasks().filter(t => t.assetId === assetId).map(t => [t.id, t])),
      drafts: this.draftPmTypesSignal()[assetId]
    };
  }

  // Undoes a failed approval for one machine only, leaving the rest of the batch alone. After a real
  // create the task list was reloaded from the backend, which cannot be undone from here, so it is kept.
  private restoreMachineState(assetId: string, before: ReturnType<MasterPlanService['captureMachineState']>, keepTasks: boolean): void {
    const { asset, tasks, previews, drafts } = before;
    if (asset) this.store.updateAssets(list => list.map(a => a.id === assetId ? asset : a));
    if (!keepTasks) this.store.updatePmTasks(list => list.map(t => tasks.get(t.id) ?? t));
    this.store.updatePreviewTasks(list => list
      .filter(t => t.assetId !== assetId || previews.has(t.id))
      .map(t => previews.get(t.id) ?? t));
    this.draftPmTypesSignal.update(all => {
      const rest = { ...all };
      delete rest[assetId];
      return drafts ? { ...rest, [assetId]: drafts } : rest;
    });
  }

  // Single-item convenience wrapper around approveMasterPlanChanges — a lone approve is just a
  // batch of one, so it goes through the exact same one-revision-per-batch logic above.
  async approveMasterPlanChange(id: string): Promise<void> {
    const [result] = await this.approveMasterPlanChanges([id]);
    if (!result.ok) throw result.error;
  }

  rejectMasterPlanChange(id: string, reason: string, opts?: { batchTime?: Date }): void {
    const user = this.authService.currentUser();
    if (!user || !this.canApproveMasterPlanChange()) {
      throw new Error('Unauthorized to reject PM Master Plan changes.');
    }
    if (!reason.trim()) {
      throw new Error('A rejection reason is required.');
    }

    const record = this.pendingMasterPlanChangesSignal().find(c => c.id === id);
    if (!record || record.status !== 'pending') return;
    if (this.isProcessingMasterPlanChange(id)) {
      throw new Error('This request is already being processed.');
    }

    const now = opts?.batchTime ?? new Date();
    this.pendingMasterPlanChangesSignal.update(list => list.map(c =>
      c.id === id ? { ...c, status: 'rejected' as const, resolvedBy: user.employeeId, resolvedAt: now, rejectReason: reason } : c));

    this.appendAuditLog({
      timestamp: now,
      action: 'Rejected PM Master Plan',
      actor: { name: user.name, id: user.employeeId },
      target: { name: record.assetId, id: record.id, isUser: false },
      product: this.store.assets().find(a => a.id === record.assetId)?.location ?? '',
      type: 'data',
      changes: [`Rejected: ${reason}`]
    });
  }

  private describeMasterPlanDiff(diff: ReconcileResult): string[] {
    const lines: string[] = [];
    if (diff.setInPlan) lines.push('Added machine to Master Plan');
    if (diff.setAssetActive === false) lines.push('Deactivated machine');
    if (diff.setAssetActive === true) lines.push('Reactivated machine');
    if (diff.editFields?.name) lines.push(`Renamed to "${diff.editFields.name}"`);
    if (diff.editFields?.department) lines.push(`Changed department to ${diff.editFields.department}`);
    if (diff.editFields?.location) lines.push(`Changed customer to ${diff.editFields.location}`);
    if (diff.editFields?.workCenter) lines.push(`Changed work center to ${diff.editFields.workCenter}`);
    for (const f of diff.addFrequencies) lines.push(`Added ${f} PM`);
    for (const f of diff.removeFrequencies) lines.push(`Removed ${f} PM`);
    return lines;
  }

  // Dev-only: seeds one pending/resolved card per distinct change type the Approvals page can
  // render (a Send to Master Plan, each editFields key, deactivate/reactivate, add/remove PM type, a
  // combined multi-field+multi-history card, plus one approved and one rejected resolved
  // example) so every tag/section/modal path can be reviewed without a backend. Purely
  // client-side — never sent to the API. Change cards only target In-plan machines (the only ones
  // whose changes need approval); the Send card targets a seeded Not-in-plan machine.
  seedMockMasterPlanChanges(): void {
    if (this.pendingMasterPlanChangesSignal().length > 0) return;
    this.pendingMasterPlanChangesSignal.set(buildMockMasterPlanChanges({
      assets: () => this.store.assets(),
      updateAssets: fn => this.store.updateAssets(fn),
      activeFrequenciesForAsset: assetId => this.activeFrequenciesForAsset(assetId),
      draftPmTypesFor: assetId => this.draftPmTypesFor(assetId),
      setDraftPmTypes: (assetId, drafts) => this.draftPmTypesSignal.update(all => ({ ...all, [assetId]: drafts })),
      buildSendRequest: (machine, drafts, submittedBy, at) => this.buildSendRequest(machine, drafts, submittedBy, at)
    }));
  }
}
