import { Injectable, signal, computed, inject } from '@angular/core';
import { Asset, PMTask, PMTaskStatus, Template, User } from '../models/pm.model';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class PmService {
  private api = inject(ApiService);
  private authService = inject(AuthService);

  private assetsSignal = signal<Asset[]>([]);
  private pmTasksSignal = signal<PMTask[]>([]);
  private templatesSignal = signal<Template[]>([]);

  readonly assets = computed(() => this.assetsSignal());
  // Hides machines that have been deactivated — use for pickers (Create PM, etc.), not for
  // history/reporting views, which must still show inactive machines' past data.
  readonly activeAssets = computed(() => this.assetsSignal().filter(a => a.isActive !== false));
  readonly pmTasks = computed(() => this.pmTasksSignal());
  readonly templates = computed(() => this.templatesSignal());

  viewedTaskGlobal = signal<PMTask | null>(null);

  constructor() {}

  loadData(): Promise<void> {
    return Promise.all([
      this.api.getAssets(),
      this.api.getTasks(undefined, undefined, undefined, undefined, 'Done'), // Exclude 'Done' tasks on initial load
      this.api.getTemplates(),
    ]).then(([assets, tasks, templates]) => {
      this.assetsSignal.set(assets);
      this.pmTasksSignal.set(tasks);
      
      const mockDefaultTemplates: Template[] = [
        { id: 'def-fac-1', name: 'Standard HVAC Inspection', department: 'Facility', isDefault: true, checklist: [{text: 'Check filters', requiresPhoto: true}, {text: 'Measure airflow', requiresPhoto: false}] },
        { id: 'def-fac-2', name: 'Monthly Boiler PM', department: 'Facility', isDefault: true, checklist: [{text: 'Check pressure valve', requiresPhoto: true}, {text: 'Inspect burner', requiresPhoto: false}] },
        { id: 'def-mech-1', name: 'CNC Daily Calibration', department: 'Mechanic', isDefault: true, checklist: [{text: 'Check spindle alignment', requiresPhoto: true}, {text: 'Lubricate guideways', requiresPhoto: false}] },
        { id: 'def-mech-2', name: 'Conveyor Belt Tension', department: 'Mechanic', isDefault: true, checklist: [{text: 'Check belt tension', requiresPhoto: true}, {text: 'Inspect rollers', requiresPhoto: false}] },
        { id: 'def-manu-1', name: 'Assembly Line Start-up', department: 'Manufacturing', isDefault: true, checklist: [{text: 'Test emergency stops', requiresPhoto: true}, {text: 'Verify sensor alignment', requiresPhoto: false}] },
        { id: 'def-manu-2', name: 'Weekly SMT Maintenance', department: 'Manufacturing', isDefault: true, checklist: [{text: 'Clean nozzles', requiresPhoto: true}, {text: 'Check feeder tension', requiresPhoto: false}] },
        { id: 'def-main-1', name: 'General Motor Lubrication', department: 'Maintenance', isDefault: true, checklist: [{text: 'Apply grease to bearings', requiresPhoto: true}, {text: 'Check for abnormal noise', requiresPhoto: false}] },
        { id: 'def-main-2', name: 'Hydraulic System Check', department: 'Maintenance', isDefault: true, checklist: [{text: 'Check fluid levels', requiresPhoto: true}, {text: 'Inspect hoses for leaks', requiresPhoto: false}] },
        { id: 'def-test-1', name: 'Tester Calibration Matrix', department: 'Test', isDefault: true, checklist: [{text: 'Run self-test diagnostic', requiresPhoto: true}, {text: 'Verify calibration certs', requiresPhoto: false}] },
        { id: 'def-test-2', name: 'Probe Pin Inspection', department: 'Test', isDefault: true, checklist: [{text: 'Check for bent pins', requiresPhoto: true}, {text: 'Clean fixture surface', requiresPhoto: false}] },
      ];
      
      // Deduplicate: if backend returns a template with same id as a default, API wins
      const apiIds = new Set(templates.map(t => t.id));
      const dedupedDefaults = mockDefaultTemplates.filter(t => !apiIds.has(t.id));
      this.templatesSignal.set([...dedupedDefaults, ...templates]);
    });
  }

  loadHistoricalTasks(): Promise<void> {
    // Only fetch 'Done' tasks
    return this.api.getTasks('Done').then(tasks => {
      // Merge with existing tasks (avoiding duplicates)
      this.pmTasksSignal.update(existing => {
        const existingIds = new Set(existing.map(t => t.id));
        const newTasks = tasks.filter(t => !existingIds.has(t.id));
        return [...existing, ...newTasks];
      });
    });
  }

  // Custom durations numerically identical to a preset are treated as the same PM type for duplicate
  // detection only (the label the user picked is still stored/displayed as-is) — otherwise picking
  // "Custom: 1 month(s)" would silently bypass the block on an existing "Monthly" PM.
  private static readonly FREQUENCY_ALIASES: Record<string, string> = {
    '1 day(s)': 'Daily',
    '7 day(s)': 'Weekly',
    '1 month(s)': 'Monthly',
    '3 month(s)': 'Quarterly',
    '12 month(s)': 'Yearly',
    '1 year(s)': 'Yearly',
  };

  private normalizeFrequency(frequency: string): string {
    const cleaned = frequency.trim().toLowerCase();
    const alias = PmService.FREQUENCY_ALIASES[cleaned];
    // Lowercase non-aliased values too so e.g. "Monthly" vs "monthly" still match.
    return (alias || frequency).trim().toLowerCase();
  }

  // Hard-block guard: an asset may only ever have one PM of a given frequency, regardless of status.
  findExistingPmOfType(assetId: string, frequency: string): PMTask | undefined {
    const target = this.normalizeFrequency(frequency);
    return this.pmTasksSignal().find(t => t.assetId === assetId && this.normalizeFrequency(t.frequency) === target);
  }

  async addPmTask(task: Partial<PMTask>): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) {
      throw new Error('Unauthorized to create PM tasks.');
    }
    const accessible = this.authService.getAccessibleProducts('pm.create.submit');
    if (!accessible.includes(task.productId || '')) {
      throw new Error('Product access denied.');
    }
    const asset = this.assets().find(a => a.id === task.assetId);
    if (!asset || asset.location !== task.productId || asset.department !== task.department) {
      throw new Error('Invalid Product-Asset combination.');
    }

    const newTask = await this.api.createTask({ ...task, createdAt: new Date() } as Omit<PMTask, 'id'>);
    this.pmTasksSignal.update(tasks => [newTask, ...tasks]);
  }

  async addPmSchedule(schedule: import('../models/pm.model').PMSchedule): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) {
      throw new Error('Unauthorized to create PM schedules.');
    }
    const accessible = this.authService.getAccessibleProducts('pm.create.submit');
    if (!accessible.includes(schedule.productId || '')) {
      throw new Error('Product access denied.');
    }
    const asset = this.assets().find(a => a.id === schedule.assetId);
    if (!asset || asset.location !== schedule.productId || asset.department !== schedule.department) {
      throw new Error('Invalid Product-Asset combination.');
    }

    await this.api.createSchedule(schedule);
    // Reload tasks to show the generated series
    const newTasks = await this.api.getTasks();
    this.pmTasksSignal.set(newTasks);
  }

  async updateTask(updatedTask: PMTask): Promise<PMTask> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Unauthorized.');

    if (user.baseRole === 'engineer' || user.baseRole === 'technician') {
      // Technicians can always update tasks assigned to them
      if (user.baseRole === 'technician' && updatedTask.assignedTo === user.employeeId) {
        // allowed
      } else {
        const allowed = this.authService.getAccessibleProducts('pm.assign.submit');
        if (!allowed.includes(updatedTask.productId || '')) {
          throw new Error('Unauthorized to update this task.');
        }
      }
    }

    const updated = await this.api.updateTask(updatedTask);
    this.pmTasksSignal.update(tasks => tasks.map(t => t.id === updated.id ? updated : t));
    return updated;
  }

  async reassignTask(task: PMTask, newAssignedTo: string): Promise<PMTask> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Unauthorized.');
    if (user.baseRole === 'engineer' || user.baseRole === 'technician') {
      const allowed = this.authService.getAccessibleProducts('pm.assign.submit');
      if (!allowed.includes(task.productId || '')) {
        throw new Error('Unauthorized to reassign this task.');
      }
    }

    const updated = await this.api.reassignTask(task.id, newAssignedTo);
    // Reassign can cascade to sibling tasks in the same series (assignedTo, nextDueDate) on
    // the backend, so refetch everything rather than patching just this one task in place.
    const tasks = await this.api.getTasks();
    this.pmTasksSignal.set(tasks);
    return updated;
  }

  // Shared with pm-assign page and the global PM Details modal — single source of truth
  // for who is allowed to assign/reassign a given task.
  canManageTask(task: PMTask): boolean {
    const user = this.authService.currentUser();
    if (!user) return false;
    if (user.baseRole === 'admin' || user.baseRole === 'manager') return true;

    if (user.baseRole === 'engineer') {
      if (task.productId && user.ownedProducts && !(user.ownedProducts.includes('*') || user.ownedProducts.includes(task.productId))) {
        return false;
      }
      if (task.createdBy && task.createdBy !== user.employeeId) {
        const creator = this.authService.getUser(task.createdBy);
        if (creator && creator.baseRole === 'engineer') {
          return false;
        }
      }
      return true;
    }

    if (user.baseRole === 'technician') {
      const allowedProducts = this.authService.getAccessibleProducts('pm.assign.submit');
      if (allowedProducts.length === 0) return false;
      return user.department === task.department && allowedProducts.includes(task.productId || '');
    }

    return false;
  }

  // Reassign is offered for every status except Done — approved history is immutable,
  // but any not-yet-completed task (Pending, In Progress, Overdue, Pending Approval) can
  // have its (and its not-Done series siblings') assignee swapped.
  canReassignTask(task: PMTask): boolean {
    return task.status !== 'Done' && this.canManageTask(task);
  }

  // Same rule as reassign: only recurring series (not standalone tasks), any status except Done.
  canEditSeriesChecklist(task: PMTask): boolean {
    return !!task.scheduleId && task.status !== 'Done' && this.canManageTask(task);
  }

  // Edits the checklist template for a recurring series. Backend cascades this to every
  // not-Done occurrence (mirrors reassign's cascade rule) — Done tasks and PM reports pulled
  // for already-completed work keep their original checklist untouched.
  async updateSeriesChecklist(task: PMTask, checklist: { text: string; requiresPhoto?: boolean; requiresValue?: boolean }[]): Promise<void> {
    if (!this.canEditSeriesChecklist(task)) {
      throw new Error('You cannot manage or edit checklist for work owned by another Engineer or outside your responsibility.');
    }
    await this.api.updateSchedule(task.scheduleId!, { checklist });
    const tasks = await this.api.getTasks();
    this.pmTasksSignal.set(tasks);
  }

  getAssignableTechnicians(task: PMTask): User[] {
    return this.authService.getAllUsers().filter(u => {
      if (!u.employeeId || u.baseRole !== 'technician') return false;
      // Always restrict by task department to protect against human error
      return u.department === task.department;
    });
  }

  // Reassign only offers technicians other than whoever is currently assigned —
  // picking the same person isn't a reassign.
  getReassignableTechnicians(task: PMTask): User[] {
    return this.getAssignableTechnicians(task).filter(u => u.employeeId !== task.assignedTo);
  }

  // Assigns a Pending task to a technician. For a recurring series, this is a one-time
  // action: the earliest still-Pending occurrence starts now (-> In Progress), and every
  // other not-Done Pending occurrence in the series is pre-assigned to the same technician
  // (stays Pending until its own due date) so the series doesn't keep reappearing as
  // "unassigned" every time the current occurrence is picked up.
  async assignTaskToTechnician(task: PMTask, techId: string): Promise<void> {
    if (!this.canManageTask(task)) {
      throw new Error('You cannot manage or reassign work owned by another Engineer or outside your responsibility.');
    }

    const asset = this.assetsSignal().find(a => a.id === task.assetId);
    if (!asset || asset.location !== task.productId) {
      throw new Error('Cannot assign task due to Product-Asset mismatch in the task record.');
    }

    const user = this.authService.currentUser();
    const seriesMatch = task.description?.match(/\[SeriesID:\s*([^\]]+)\]/);
    if (seriesMatch) {
      const seriesId = seriesMatch[1];
      const [nextTask, ...futureTasks] = this.pmTasksSignal()
        .filter(t => t.status === 'Pending' && t.description?.includes(`[SeriesID: ${seriesId}]`))
        .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());

      if (!nextTask) {
        throw new Error('No pending task found in this series to assign.');
      }

      await this.updateTask({
        ...nextTask,
        status: 'In Progress',
        assignedTo: techId,
        assignedAt: new Date(),
        assignedBy: user?.employeeId
      });

      for (const futureTask of futureTasks) {
        await this.updateTask({
          ...futureTask,
          assignedTo: techId,
          assignedAt: new Date(),
          assignedBy: user?.employeeId
        });
      }
    } else {
      await this.updateTask({
        ...task,
        status: 'In Progress',
        assignedTo: techId,
        assignedAt: new Date(),
        assignedBy: user?.employeeId
      });
    }
  }

  async updatePmSchedule(seriesId: string, updates: Partial<import('../models/pm.model').PMSchedule>): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Unauthorized.');

    // We assume permission to update the series if they can update tasks.
    // In a real backend, this would be a single API call with auth checks.
    await this.api.updateSchedule(seriesId, updates);
    // Reload tasks
    const newTasks = await this.api.getTasks();
    this.pmTasksSignal.set(newTasks);
  }

  async deleteTask(id: string): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) throw new Error('Unauthorized.');
    await this.api.deleteTask(id);
    this.pmTasksSignal.update(tasks => tasks.filter(t => t.id !== id));
  }

  saveTemplate(tpl: Template): Promise<Template> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Unauthorized.');
    if ((user.baseRole === 'engineer' || user.baseRole === 'technician') && tpl.department !== user.department) {
      throw new Error('Can only save templates for your own department.');
    }

    tpl.isDefault = false;
    tpl.createdBy = user.employeeId;

    return this.api.createTemplate(tpl).then(saved => {
      this.templatesSignal.update(t => [...t, saved]);
      return saved;
    });
  }

  updateTemplate(tpl: Template): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Unauthorized.');
    if (!tpl.id) throw new Error('Cannot update template without an id.');
    if (tpl.isDefault) throw new Error('Cannot modify default templates.');
    if ((user.baseRole === 'engineer' || user.baseRole === 'technician') && tpl.department !== user.department) {
      throw new Error('Can only update templates for your own department.');
    }

    return this.api.updateTemplate(tpl.id, tpl).then(updated => {
      this.templatesSignal.update(t => t.map(x => x.id === updated.id ? updated : x));
    });
  }

  deleteTemplate(tpl: Template): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Unauthorized.');
    if (tpl.isDefault) throw new Error('Cannot delete default templates.');
    if ((user.baseRole === 'engineer' || user.baseRole === 'technician') && tpl.department !== user.department) {
      throw new Error('Can only delete templates for your own department.');
    }

    if (!tpl.id) throw new Error('Cannot delete template without an id.');

    return this.api.deleteTemplate(tpl.id).then(() => {
      this.templatesSignal.update(t => t.filter(x => x.id !== tpl.id));
    });
  }

  // `mock: true` skips the real API call entirely (purely local signal update) — lets the
  // Machines page be exercised end-to-end before the backend supports isActive/PATCH (see
  // docs/backend_machine_active_status.html). Never used in production builds.
  createAsset(asset: { id: string, name: string, location: string, department: string, workCenter?: string }, opts?: { mock?: boolean }): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) {
      return Promise.reject(new Error('Unauthorized to create assets.'));
    }
    const newAsset: Asset = { ...asset, isActive: true };
    if (opts?.mock) {
      this.assetsSignal.update(assets => [...assets, newAsset]);
      return Promise.resolve();
    }
    return this.api.createAsset(asset).then(() => {
      this.assetsSignal.update(assets => [...assets, newAsset]);
    });
  }

  // Edits a machine's own fields and/or its active status. Deactivating cascades locally to
  // cancel that machine's not-yet-Done tasks so the UI reflects the effect immediately — the
  // backend is the source of truth for actually pausing the recurring schedule (see
  // docs/backend_machine_active_status.html); this local mirror is a best-effort UI preview.
  updateAsset(id: string, patch: Partial<Pick<Asset, 'name' | 'department' | 'location' | 'workCenter' | 'isActive'>>, opts?: { mock?: boolean }): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) {
      return Promise.reject(new Error('Unauthorized to update assets.'));
    }
    const applyLocally = () => {
      this.assetsSignal.update(assets => assets.map(a => a.id === id ? { ...a, ...patch } : a));
      if (patch.isActive === false) {
        const now = new Date();
        this.pmTasksSignal.update(tasks => tasks.map(t => {
          if (t.assetId !== id || t.status === 'Done' || t.status === 'Cancelled') return t;
          return { ...t, status: 'Cancelled' as PMTaskStatus, cancelledReason: 'Machine deactivated', cancelledAt: now };
        }));
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
}