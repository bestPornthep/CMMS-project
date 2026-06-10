import { Injectable, signal, computed, inject } from '@angular/core';
import { Asset, PMTask, Template } from '../models/pm.model';
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
      this.api.getTasks(),
      this.api.getTemplates(),
    ]).then(([assets, tasks, templates]) => {
      this.assetsSignal.set(assets);
      this.pmTasksSignal.set(tasks);
      this.templatesSignal.set(templates);
    });
  }

  addPmTask(task: Partial<PMTask>): void {
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

    this.api.createTask({ ...task, createdAt: new Date() } as Omit<PMTask, 'id'>).then(newTask => {
      this.pmTasksSignal.update(tasks => [newTask, ...tasks]);
    });
  }

  updateTask(updatedTask: PMTask): void {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Unauthorized.');

    if (user.baseRole === 'engineer' || user.baseRole === 'technician') {
      const allowed = this.authService.getAccessibleProducts('pm.assign.submit');
      if (!allowed.includes(updatedTask.productId || '') && updatedTask.assignedTo !== user.employeeId) {
        throw new Error('Unauthorized to update this task.');
      }
    }

    this.api.updateTask(updatedTask).then(updated => {
      this.pmTasksSignal.update(tasks => tasks.map(t => t.id === updated.id ? updated : t));
    });
  }

  deleteTask(id: string): void {
    this.api.deleteTask(id).then(() => {
      this.pmTasksSignal.update(tasks => tasks.filter(t => t.id !== id));
    });
  }

  saveTemplate(tpl: Template): void {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Unauthorized.');
    if ((user.baseRole === 'engineer' || user.baseRole === 'technician') && tpl.department !== user.department) {
      throw new Error('Can only save templates for your own department.');
    }

    this.api.createTemplate(tpl).then(saved => {
      this.templatesSignal.update(t => [...t, saved]);
    });
  }

  updateTemplate(tpl: Template): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Unauthorized.');
    if (!tpl.id) throw new Error('Cannot update template without an id.');
    if ((user.baseRole === 'engineer' || user.baseRole === 'technician') && tpl.department !== user.department) {
      throw new Error('Can only update templates for your own department.');
    }

    return this.api.updateTemplate(tpl.id, tpl).then(updated => {
      this.templatesSignal.update(t => t.map(x => x.id === updated.id ? updated : x));
    });
  }

  deleteTemplate(tpl: Template): void {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Unauthorized.');
    if ((user.baseRole === 'engineer' || user.baseRole === 'technician') && tpl.department !== user.department) {
      throw new Error('Can only delete templates for your own department.');
    }

    if (!tpl.id) throw new Error('Cannot delete template without an id.');

    this.api.deleteTemplate(tpl.id).then(() => {
      this.templatesSignal.update(t => t.filter(x => x.id !== tpl.id));
    });
  }

  createAsset(asset: { id: string, name: string, location: string, department: string }): Promise<void> {
    return this.api.createAsset(asset).then(() => {
      this.assetsSignal.update(assets => [...assets, asset as Asset]);
    });
  }

  createProduct(product: { id: string, name: string }): Promise<void> {
    return this.api.createProduct(product).then(() => {
      // Reload user profile so new product appears in owned/accessible lists
      return this.authService.init();
    });
  }
}