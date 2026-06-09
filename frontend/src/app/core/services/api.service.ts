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
}
