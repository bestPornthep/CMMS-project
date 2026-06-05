import { Injectable, signal, computed, inject } from '@angular/core';
import { User, DelegatedProduct } from '../models/pm.model';
import { ApiService } from './api.service';

const AUTH_KEY = 'assetintel_auth'; // session token only — not a database

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);

  // Cached user list for sync lookups (getAllUsers, getUser, etc.)
  private usersCache = signal<User[]>([]);
  private currentUserSignal = signal<User | null>(this.loadStoredSession());

  readonly currentUser = computed(() => this.currentUserSignal());
  readonly isLoggedIn = computed(() => this.currentUserSignal() !== null);

  constructor() {
    // Pre-load user list so role-based lookups work immediately
    this.api.getAllUsers().then(users => this.usersCache.set(users));
  }

  // ── Auth ────────────────────────────────────────────────────────────────

  async login(employeeId: string, password: string): Promise<boolean> {
    const user = await this.api.verifyLogin(employeeId, password);
    if (!user) return false;
    this.currentUserSignal.set(user);
    localStorage.setItem(AUTH_KEY, JSON.stringify(user)); // session persistence
    return true;
  }

  logout(): void {
    this.currentUserSignal.set(null);
    localStorage.removeItem(AUTH_KEY); // clears session on explicit logout
  }

  // ── Permission checks (synchronous — uses cached user) ──────────────────

  private readonly ROLE_DEFAULTS: Record<string, string[]> = {
    technician: [
      'pm.dashboard.view', 'pm.record.view', 'pm.record.submit', 'pm.calendar.view',
    ],
    engineer: [
      'pm.dashboard.view', 'pm.create.view', 'pm.create.submit',
      'pm.assign.view', 'pm.assign.submit', 'pm.record.view', 'pm.record.submit',
      'pm.calendar.view', 'pm.reports.view', 'pm.audit.view',
      'pm.reports.export', 'pm.permission.delegate',
    ],
  };

  hasPermission(permission: string, productId?: string): boolean {
    const user = this.currentUser();
    if (!user) return false;

    if (permission === 'pm.audit.view') {
      return user.baseRole === 'engineer' || user.baseRole === 'manager';
    }
    if (user.baseRole === 'admin' || user.baseRole === 'manager') return true;

    const defaults = this.ROLE_DEFAULTS[user.baseRole];
    if (defaults?.includes(permission)) {
      if (user.baseRole === 'engineer' && productId) {
        return !!user.ownedProducts && (user.ownedProducts.includes('*') || user.ownedProducts.includes(productId));
      }
      return true;
    }

    // Check active delegations (technicians)
    if (user.baseRole === 'technician' && user.delegatedProducts?.length > 0) {
      for (const dp of user.delegatedProducts) {
        if (dp.status !== 'active') continue;
        if (dp.validUntil && new Date(dp.validUntil) < new Date()) continue;
        if (!dp.permissions?.includes(permission)) continue;
        if (!productId || dp.productId === productId) return true;
      }
    }

    return user.permissions?.includes(permission) ?? false;
  }

  getAccessibleProducts(permission: string): string[] {
    const user = this.currentUser();
    if (!user) return [];
    if (user.baseRole === 'admin' || user.baseRole === 'manager') {
      return ['CUST-001', 'CUST-002', 'CUST-003', 'CUST-004', 'CUST-005', 'CUST-006'];
    }

    const products = new Set<string>(user.ownedProducts || []);

    for (const dp of user.delegatedProducts || []) {
      if (dp.status !== 'active') continue;
      if (dp.validUntil && new Date(dp.validUntil) < new Date()) continue;
      if (dp.permissions?.includes(permission) && dp.productId) {
        products.add(dp.productId);
      }
    }

    return Array.from(products);
  }

  canDelegate(targetEmployeeId: string): boolean {
    const user = this.currentUser();
    if (!user) return false;
    if (user.baseRole === 'admin' || user.baseRole === 'manager') return true;
    if (user.baseRole === 'engineer') {
      const target = this.getUser(targetEmployeeId);
      return !!target && target.baseRole === 'technician' && target.department === user.department;
    }
    return false;
  }

  // ── Sync user lookups (from cache) ───────────────────────────────────────

  getUser(employeeId: string): User | undefined {
    return this.usersCache().find(u => u.employeeId === employeeId);
  }

  getAllUsers(): User[] {
    return this.usersCache();
  }

  // ── Delegations ──────────────────────────────────────────────────────────

  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  grantDelegation(targetIds: string[], products: string[], validUntil: Date): void {
    const currentUser = this.currentUser();
    if (!currentUser) throw new Error('Unauthorized.');

    if (currentUser.baseRole === 'technician') {
      const allowed = this.getAccessibleProducts('pm.create.submit');
      if (allowed.length === 0) throw new Error('No products to delegate.');
      for (const p of products) {
        if (!allowed.includes(p)) throw new Error('Can only delegate within granted scope.');
      }
    } else if (currentUser.baseRole === 'engineer') {
      const allowed = this.getAccessibleProducts('pm.create.submit');
      for (const p of products) {
        if (!allowed.includes(p)) throw new Error('Can only delegate within owned products.');
      }
    }

    const defaultPermissions = [
      'pm.create.view', 'pm.create.submit', 'pm.assign.view', 'pm.assign.submit',
      'pm.record.view', 'pm.record.submit', 'pm.calendar.view',
    ];
    const delegationId = `DEL-${this.generateId()}`;

    this.usersCache.update(users => users.map(u => {
      if (!targetIds.includes(u.employeeId)) return u;
      const newDelegations: DelegatedProduct[] = products.map(productId => ({
        id: delegationId, productId, status: 'active', permissions: defaultPermissions, validUntil
      }));
      return { ...u, delegatedProducts: [...(u.delegatedProducts || []), ...newDelegations] };
    }));

    // Sync session user if they were updated
    const sessionUser = this.currentUser();
    if (sessionUser && targetIds.includes(sessionUser.employeeId)) {
      const updated = this.usersCache().find(u => u.employeeId === sessionUser.employeeId);
      if (updated) {
        this.currentUserSignal.set(updated);
        localStorage.setItem(AUTH_KEY, JSON.stringify(updated));
      }
    }

    // Also update ApiService for consistency
    for (const id of targetIds) {
      const updated = this.usersCache().find(u => u.employeeId === id);
      if (updated) this.api.updateUser(id, { delegatedProducts: updated.delegatedProducts });
    }
  }

  revokeDelegation(delegationId: string): void {
    const currentUser = this.currentUser();
    if (!currentUser) throw new Error('Unauthorized.');
    if (currentUser.baseRole === 'technician') throw new Error('Technicians cannot revoke delegations.');

    this.usersCache.update(users => users.map(u => ({
      ...u,
      delegatedProducts: (u.delegatedProducts || []).map(dp =>
        dp.id === delegationId ? { ...dp, status: 'revoked' as const } : dp
      )
    })));

    // Sync to api for consistency
    for (const u of this.usersCache()) {
      if (u.delegatedProducts?.some(dp => dp.id === delegationId)) {
        this.api.updateUser(u.employeeId, { delegatedProducts: u.delegatedProducts });
      }
    }
  }

  getActiveDelegations(): { id: string; employeeId: string; user: string; products: string[]; validUntil?: Date }[] {
    const map = new Map<string, { id: string; employeeId: string; user: string; products: Set<string>; validUntil?: Date }>();

    for (const u of this.usersCache()) {
      for (const dp of u.delegatedProducts || []) {
        if (dp.status !== 'active') continue;
        if (dp.validUntil && new Date(dp.validUntil) < new Date()) continue;
        const id = dp.id || `DEL-${this.generateId()}`;
        const key = `${id}::${u.employeeId}`;
        if (!map.has(key)) {
          map.set(key, { id, employeeId: u.employeeId, user: u.name, products: new Set([dp.productId]), validUntil: dp.validUntil });
        } else {
          map.get(key)!.products.add(dp.productId);
        }
      }
    }

    return Array.from(map.values()).map(d => ({ ...d, products: Array.from(d.products) }));
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private loadStoredSession(): User | null {
    try {
      const stored = localStorage.getItem(AUTH_KEY);
      return stored ? JSON.parse(stored) as User : null;
    } catch {
      return null;
    }
  }
}
