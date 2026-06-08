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
  getAssets(): Promise<Asset[]> {
    return firstValueFrom(this.http.get<Asset[]>(`${this.baseUrl}/assets`));
  }

  // ── PM Tasks ─────────────────────────────────────────────────────────────
  getTasks(): Promise<PMTask[]> {
    return firstValueFrom(this.http.get<PMTask[]>(`${this.baseUrl}/pm-tasks`));
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

  deleteTemplate(name: string, department: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.baseUrl}/templates`, { body: { name, department } }));
  }

  // ── Auth / Users ─────────────────────────────────────────────────────────
  verifyLogin(employeeId: string, password: string): Promise<any> {
    return firstValueFrom(this.http.post<any>(`${this.baseUrl}/auth/login`, { employeeId, password }));
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
}
