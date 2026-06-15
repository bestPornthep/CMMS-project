import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Asset, AuditLog, PMTask, Template, User } from '../models/pm.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/v1`;

  // ── Assets ──────────────────────────────────────────────────────────────
  getAssets(location?: string, department?: string): Promise<Asset[]> {
    let url = `${this.baseUrl}/assets`;
    const params = new URLSearchParams();
    if (location) params.append('location', location);
    if (department) params.append('department', department);
    if (params.toString()) url += `?${params.toString()}`;
    return firstValueFrom(this.http.get<Asset[]>(url));
  }

  // ── PM Tasks ─────────────────────────────────────────────────────────────
  getTasks(status?: string, department?: string, productId?: string, assignedTo?: string): Promise<PMTask[]> {
    let url = `${this.baseUrl}/pm-tasks`;
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (department) params.append('department', department);
    if (productId) params.append('productId', productId);
    if (assignedTo) params.append('assignedTo', assignedTo);
    if (params.toString()) url += `?${params.toString()}`;
    return firstValueFrom(this.http.get<PMTask[]>(url));
  }

  createTask(task: Omit<PMTask, 'id'>): Promise<PMTask> {
    return firstValueFrom(this.http.post<PMTask>(`${this.baseUrl}/pm-tasks`, task));
  }

  updateTask(task: PMTask): Promise<PMTask> {
    return firstValueFrom(this.http.put<PMTask>(`${this.baseUrl}/pm-tasks/${task.id}`, task));
  }

  deleteTask(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.baseUrl}/pm-tasks/${id}`));
  }

  // ── Templates ────────────────────────────────────────────────────────────
  getTemplates(): Promise<Template[]> {
    return firstValueFrom(this.http.get<Template[]>(`${this.baseUrl}/templates`));
  }

  createTemplate(template: Template): Promise<Template> {
    return firstValueFrom(this.http.post<Template>(`${this.baseUrl}/templates`, template));
  }

  updateTemplate(id: string, template: Template): Promise<Template> {
    return firstValueFrom(this.http.put<Template>(`${this.baseUrl}/templates/${id}`, template));
  }

  deleteTemplate(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.baseUrl}/templates/${id}`));
  }

  // ── Auth / Users ─────────────────────────────────────────────────────────
  verifyLogin(employeeId: string, password: string): Promise<any> {
    return firstValueFrom(this.http.post<any>(`${this.baseUrl}/auth/login`, { employeeId, password }));
  }

  getAuthMe(): Promise<User> {
    return firstValueFrom(this.http.get<User>(`${this.baseUrl}/auth/me`));
  }

  getUser(id: string): Promise<User | undefined> {
    return firstValueFrom(this.http.get<User>(`${this.baseUrl}/users/${id}`)).catch(() => undefined);
  }

  getAllUsers(): Promise<User[]> {
    return firstValueFrom(this.http.get<User[]>(`${this.baseUrl}/users`));
  }

  updateUser(id: string, patch: Partial<User & { password?: string }>): Promise<User> {
    return firstValueFrom(this.http.patch<User>(`${this.baseUrl}/users/${id}`, patch));
  }

  getAuditLogs(userId: string, role: string, department?: string): Promise<AuditLog[]> {
    let url = `${this.baseUrl}/audit-logs`;
    if (department && (role === 'engineer' || role === 'manager')) {
      url += `?department=${department}`;
    }
    return firstValueFrom(this.http.get<AuditLog[]>(url));
  }

  logout(): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.baseUrl}/auth/logout`, {}));
  }

  grantDelegation(targetIds: string[], products: string[], validUntil: Date): Promise<any> {
    return firstValueFrom(this.http.post<any>(`${this.baseUrl}/delegations`, { targetIds, products, validUntil }));
  }

  revokeDelegation(id: string): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`${this.baseUrl}/delegations/${id}/revoke`, {}));
  }

  // ── New Asset & Product Creation Endpoints ──────────────────────────────
  createProduct(product: { id: string, name: string }): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.baseUrl}/products`, product));
  }

  createAsset(asset: { id: string, name: string, location: string, department: string }): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.baseUrl}/assets`, asset));
  }

  // ── PM Schedules (Temporary Shim) ───────────────────────────────────────
  async createSchedule(schedule: import('../models/pm.model').PMSchedule): Promise<void> {
    const seriesId = `SCH-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const dates = this.calculateDates(schedule.frequency);

    // Create tasks sequentially
    for (const date of dates) {
      await this.createTask({
        title: schedule.title,
        description: `[SeriesID: ${seriesId}]\n${schedule.description || ''}`,
        frequency: schedule.frequency,
        assetId: schedule.assetId,
        productId: schedule.productId,
        department: schedule.department,
        estimatedHours: schedule.estimatedHours,
        status: 'Pending',
        nextDueDate: date,
        checklist: schedule.checklist as any,
        partsRequired: schedule.partsRequired,
        assignedTo: schedule.assignedTo,
        createdBy: schedule.createdBy
      });
    }
  }

  async updateSchedule(seriesId: string, updates: Partial<import('../models/pm.model').PMSchedule>): Promise<void> {
    const tasks = await this.getTasks();
    const seriesTasks = tasks.filter(t => t.description?.includes(`[SeriesID: ${seriesId}]`) && t.status === 'Pending');

    for (const task of seriesTasks) {
      await this.updateTask({
        ...task,
        title: updates.title ?? task.title,
        description: updates.description !== undefined ? `[SeriesID: ${seriesId}]\n${updates.description}` : task.description,
        checklist: updates.checklist as any ?? task.checklist,
        partsRequired: updates.partsRequired ?? task.partsRequired,
        assignedTo: updates.assignedTo !== undefined ? updates.assignedTo : task.assignedTo
      });
    }
  }

  private calculateDates(frequency: string): Date[] {
    const dates: Date[] = [];
    let current = new Date();
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    const maxTasks = 365;
    dates.push(new Date(current)); // First occurrence is today
    
    let addFunc = (d: Date) => d.setMonth(d.getMonth() + 1);

    if (frequency === 'Daily') addFunc = (d: Date) => d.setDate(d.getDate() + 1);
    else if (frequency === 'Weekly') addFunc = (d: Date) => d.setDate(d.getDate() + 7);
    else if (frequency === 'Monthly') addFunc = (d: Date) => d.setMonth(d.getMonth() + 1);
    else if (frequency === 'Quarterly') addFunc = (d: Date) => d.setMonth(d.getMonth() + 3);
    else if (frequency === 'Yearly') addFunc = (d: Date) => d.setFullYear(d.getFullYear() + 1);
    else {
      const parts = frequency.split(' ');
      if (parts.length === 2) {
        const val = parseInt(parts[0], 10);
        const unit = parts[1];
        if (unit === 'hour(s)') addFunc = (d: Date) => d.setHours(d.getHours() + val);
        else if (unit === 'day(s)') addFunc = (d: Date) => d.setDate(d.getDate() + val);
        else if (unit === 'month(s)') addFunc = (d: Date) => d.setMonth(d.getMonth() + val);
        else if (unit === 'Year(s)') addFunc = (d: Date) => d.setFullYear(d.getFullYear() + val);
      }
    }

    while (current < oneYearFromNow && dates.length < maxTasks) {
      const nextDate = new Date(current);
      addFunc(nextDate);
      
      if (nextDate.getTime() === current.getTime()) {
        dates.push(nextDate);
        break;
      }

      if (nextDate >= oneYearFromNow) {
        if (dates.length === 0) dates.push(nextDate);
        break;
      }

      dates.push(nextDate);
      current = nextDate;
    }

    return dates;
  }
}
