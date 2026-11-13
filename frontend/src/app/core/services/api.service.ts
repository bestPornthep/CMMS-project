import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  Asset, AuditLog, DraftPmType, MasterPlanVersionSnapshot, NewPmTypeDetail, NewUserPayload, PendingMasterPlanChange,
  PMTask, ProposedMasterPlanState, Template, User
} from '../models/pm.model';
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

  updateAsset(id: string, patch: Partial<Pick<Asset, 'name' | 'department' | 'location' | 'workCenter' | 'isActive'>>): Promise<Asset> {
    return firstValueFrom(this.http.patch<Asset>(`${this.baseUrl}/assets/${id}`, patch));
  }

  // ── PM Tasks ─────────────────────────────────────────────────────────────
  getTasks(status?: string, department?: string, productId?: string, assignedTo?: string, excludeStatus?: string): Promise<PMTask[]> {
    let url = `${this.baseUrl}/pm-tasks`;
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (excludeStatus) params.append('excludeStatus', excludeStatus);
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

  reassignTask(taskId: string, assignedTo: string): Promise<PMTask> {
    return firstValueFrom(this.http.put<PMTask>(`${this.baseUrl}/pm-tasks/${taskId}/reassign`, { assignedTo }));
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
    return firstValueFrom(this.http.get<User>(`${this.baseUrl}/users/${id}`))
      .catch((err: any) => {
        if (err?.status === 404) return undefined;
        throw err;
      });
  }

  getAllUsers(): Promise<User[]> {
    return firstValueFrom(this.http.get<User[]>(`${this.baseUrl}/users`));
  }

  updateUser(id: string, patch: Partial<User & { password?: string }>): Promise<User> {
    return firstValueFrom(this.http.patch<User>(`${this.baseUrl}/users/${id}`, patch));
  }

  createUser(payload: NewUserPayload): Promise<User> {
    return firstValueFrom(this.http.post<User>(`${this.baseUrl}/users`, payload));
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

  createAsset(asset: { id: string, name: string, location: string, department: string, workCenter?: string }): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.baseUrl}/assets`, asset));
  }

  // ── PM Schedules ───────────────────────────────────────────────────────
  createSchedule(schedule: import('../models/pm.model').PMSchedule): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.baseUrl}/pm-tasks/schedule`, schedule));
  }

  updateSchedule(seriesId: string, updates: Partial<import('../models/pm.model').PMSchedule>): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${this.baseUrl}/pm-tasks/schedule/${seriesId}`, updates));
  }

  // ── PM Master Plan ──────────────────────────────────────────────────────
  // The backend sends dates as ISO strings; these methods hand back real Dates.
  async listMasterPlanChanges(): Promise<PendingMasterPlanChange[]> {
    const rows = await firstValueFrom(this.http.get<any[]>(`${this.baseUrl}/pm-masterplan/changes`));
    return rows.map(reviveChange);
  }

  // `{ dropped: true }` = the edits netted out to no change, so the backend kept no card.
  async submitMasterPlanChange(body: { assetId: string; proposedState: ProposedMasterPlanState; note: string }): Promise<PendingMasterPlanChange | { dropped: true }> {
    const res = await firstValueFrom(this.http.post<any>(`${this.baseUrl}/pm-masterplan/changes`, body));
    return res?.dropped ? { dropped: true } : reviveChange(res);
  }

  approveMasterPlanChanges(ids: string[]): Promise<MasterPlanApproveResponse> {
    return firstValueFrom(this.http.post<MasterPlanApproveResponse>(`${this.baseUrl}/pm-masterplan/changes/approve`, { ids }));
  }

  async rejectMasterPlanChange(id: string, reason: string): Promise<PendingMasterPlanChange> {
    return reviveChange(await firstValueFrom(this.http.post<any>(`${this.baseUrl}/pm-masterplan/changes/${id}/reject`, { reason })));
  }

  withdrawMasterPlanChange(id: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.baseUrl}/pm-masterplan/changes/${id}/withdraw`, {}));
  }

  async getMasterPlanVersions(): Promise<MasterPlanVersionSnapshot[]> {
    const rows = await firstValueFrom(this.http.get<any[]>(`${this.baseUrl}/pm-masterplan/versions`));
    return rows.map(v => ({ ...v, createdAt: new Date(v.createdAt) }));
  }

  async getDraftPmTypes(assetId: string): Promise<DraftPmType[]> {
    const rows = await firstValueFrom(this.http.get<any[]>(`${this.baseUrl}/assets/${assetId}/draft-pm-types`));
    return rows.map(r => ({ frequency: r.frequency, detail: reviveDetail(r.detail) }));
  }

  async saveDraftPmType(assetId: string, frequency: string, detail: NewPmTypeDetail): Promise<DraftPmType> {
    const url = `${this.baseUrl}/assets/${assetId}/draft-pm-types/${encodeURIComponent(frequency)}`;
    const r = await firstValueFrom(this.http.put<any>(url, detail));
    return { frequency: r.frequency, detail: reviveDetail(r.detail) };
  }

  deleteDraftPmType(assetId: string, frequency: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.baseUrl}/assets/${assetId}/draft-pm-types/${encodeURIComponent(frequency)}`));
  }
}

export interface MasterPlanApproveResponse {
  revision?: { id: string; label: string };
  results: { id: string; ok: boolean; error?: string }[];
}

const toDate = (v: unknown): Date | undefined => (v ? new Date(v as string) : undefined);

function reviveDetail(d: any): NewPmTypeDetail {
  return { ...d, startDate: toDate(d?.startDate) };
}

function reviveChange(c: any): PendingMasterPlanChange {
  const state = c.proposedState ?? {};
  const details = state.newPmTypeDetails;
  return {
    ...c,
    submittedAt: new Date(c.submittedAt),
    resolvedAt: toDate(c.resolvedAt),
    history: (c.history ?? []).map((h: any) => ({ ...h, timestamp: new Date(h.timestamp) })),
    proposedState: {
      ...state,
      ...(details && { newPmTypeDetails: Object.fromEntries(Object.entries(details).map(([f, d]) => [f, reviveDetail(d)])) })
    }
  };
}
