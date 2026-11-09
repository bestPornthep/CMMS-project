import { Injectable, inject } from '@angular/core';
import { PMSchedule, PMTask, PMTaskStatus, User } from '../models/pm.model';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { PmStore } from './pm-store.service';
import { normalizeFrequency } from './pm-frequency.util';

@Injectable({ providedIn: 'root' })
export class PmTaskService {
  private api = inject(ApiService);
  private authService = inject(AuthService);
  private store = inject(PmStore);

  async addPmTask(task: Partial<PMTask>): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) {
      throw new Error('Unauthorized to create PM tasks.');
    }
    const accessible = this.authService.getAccessibleProducts('pm.create.submit');
    if (!accessible.includes(task.productId || '')) {
      throw new Error('Product access denied.');
    }
    const asset = this.store.assets().find(a => a.id === task.assetId);
    if (!asset || asset.location !== task.productId || asset.department !== task.department) {
      throw new Error('Invalid Product-Asset combination.');
    }

    const newTask = await this.api.createTask({ ...task, createdAt: new Date() } as Omit<PMTask, 'id'>);
    this.store.updatePmTasks(tasks => [newTask, ...tasks]);
  }

  async addPmSchedule(schedule: PMSchedule): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) {
      throw new Error('Unauthorized to create PM schedules.');
    }
    const accessible = this.authService.getAccessibleProducts('pm.create.submit');
    if (!accessible.includes(schedule.productId || '')) {
      throw new Error('Product access denied.');
    }
    const asset = this.store.assets().find(a => a.id === schedule.assetId);
    if (!asset || asset.location !== schedule.productId || asset.department !== schedule.department) {
      throw new Error('Invalid Product-Asset combination.');
    }

    await this.api.createSchedule(schedule);
    // Reload tasks to show the generated series
    const newTasks = await this.api.getTasks();
    this.store.setPmTasks(newTasks);
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
    this.store.updatePmTasks(tasks => tasks.map(t => t.id === updated.id ? updated : t));
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
    this.store.setPmTasks(tasks);
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

  // Cancel is narrower than reassign: only Pending/In Progress are eligible. Done is immutable
  // history, and Overdue/Pending Approval already passed their planned window (in the past),
  // so none of those three can be cancelled.
  canCancelTask(task: PMTask): boolean {
    return (task.status === 'Pending' || task.status === 'In Progress')
      && this.canManageTask(task);
  }

  // Operational cancel, distinct from removePmScheduleType (the Master-Plan-approval-gated
  // structural action): this only cancels already-materialized task rows, from this task's due
  // date onward in the same recurring series (assetId + frequency) — it never touches
  // PMSchedule.isActive, so the rule itself keeps generating normally. Engineers can do this
  // directly, no approval needed.
  async cancelPmTaskSeries(taskId: string): Promise<void> {
    if (!this.authService.currentUser()) throw new Error('Unauthorized to cancel PM tasks.');
    const task = this.store.pmTasks().find(t => t.id === taskId);
    if (!task || !this.canCancelTask(task)) throw new Error('Unauthorized to cancel PM tasks.');

    const target = normalizeFrequency(task.frequency);
    const fromTime = new Date(task.nextDueDate).getTime();
    const toCancel = this.store.pmTasks().filter(t =>
      t.assetId === task.assetId &&
      normalizeFrequency(t.frequency) === target &&
      (t.status === 'Pending' || t.status === 'In Progress') &&
      new Date(t.nextDueDate).getTime() >= fromTime
    );

    const now = new Date();
    for (const t of toCancel) {
      try {
        await this.api.updateTask({ ...t, status: 'Cancelled', cancelledReason: 'Cancelled by engineer', cancelledAt: now });
      } catch {
        // fall through to local-only apply for this task
      }
    }
    const ids = new Set(toCancel.map(t => t.id));
    this.store.updatePmTasks(tasks => tasks.map(t =>
      ids.has(t.id) ? { ...t, status: 'Cancelled' as PMTaskStatus, cancelledReason: 'Cancelled by engineer', cancelledAt: now } : t));
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
    this.store.setPmTasks(tasks);
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

    const asset = this.store.assets().find(a => a.id === task.assetId);
    if (!asset || asset.location !== task.productId) {
      throw new Error('Cannot assign task due to Product-Asset mismatch in the task record.');
    }

    const user = this.authService.currentUser();
    const seriesMatch = task.description?.match(/\[SeriesID:\s*([^\]]+)\]/);
    if (seriesMatch) {
      const seriesId = seriesMatch[1];
      const [nextTask, ...futureTasks] = this.store.pmTasks()
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


  async deleteTask(id: string): Promise<void> {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) throw new Error('Unauthorized.');
    await this.api.deleteTask(id);
    this.store.updatePmTasks(tasks => tasks.filter(t => t.id !== id));
  }
}
