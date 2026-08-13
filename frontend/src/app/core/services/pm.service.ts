import { Injectable, signal, computed, inject } from '@angular/core';
import { Asset, PMTask, Template, User } from '../models/pm.model';
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

  // Reassign is only offered for tasks still actively in flight — never for a task
  // already submitted for approval or already Done (approved history is immutable).
  canReassignTask(task: PMTask): boolean {
    return (task.status === 'In Progress' || task.status === 'Overdue') && this.canManageTask(task);
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

  // Assigns a Pending task to a technician. For a recurring series, the earliest still-Pending
  // occurrence is assigned (the clicked row may only be the series' display representative).
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
      const nextTask = this.pmTasksSignal()
        .filter(t => t.status === 'Pending' && t.description?.includes(`[SeriesID: ${seriesId}]`))
        .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime())[0];

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

  createAsset(asset: { id: string, name: string, location: string, department: string }): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) {
      return Promise.reject(new Error('Unauthorized to create assets.'));
    }
    return this.api.createAsset(asset).then(() => {
      this.assetsSignal.update(assets => [...assets, asset as Asset]);
    });
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