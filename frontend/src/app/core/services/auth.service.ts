import { Injectable, signal, computed } from '@angular/core';
import { User } from '../models/pm.model';

const AUTH_KEY = 'assetintel_auth';

// Legacy mock data
const DEMO_USERS: Record<string, Partial<User> & { password?: string }> = {
  // ── Managers (3) ─────────────────────────────────────────────────────────
  'MGR001': { employeeId: 'MGR001', name: 'Manager Somporn', initials: 'MS', baseRole: 'manager', department: 'All', ownedProducts: ['*'], delegatedProducts: [], password: 'mgr123' },
  'MGR002': { employeeId: 'MGR002', name: 'Senior Eng Nattapol', initials: 'SN', baseRole: 'manager', department: 'All', ownedProducts: ['*'], delegatedProducts: [], password: 'mgr123' },
  'MGR003': { employeeId: 'MGR003', name: 'Senior Eng Wipa', initials: 'SW', baseRole: 'manager', department: 'All', ownedProducts: ['*'], delegatedProducts: [], password: 'mgr123' },

  // ── Engineers (15) ───────────────────────────────────────────────────────
  // Test Department
  'ENG-TST-1': { employeeId: 'ENG-TST-1', name: 'Eng Test A', initials: 'TA', baseRole: 'engineer', department: 'Test', ownedProducts: ['CUST-001', 'CUST-002'], delegatedProducts: [], password: 'eng123' },
  'ENG-TST-2': { employeeId: 'ENG-TST-2', name: 'Eng Test B', initials: 'TB', baseRole: 'engineer', department: 'Test', ownedProducts: ['CUST-003', 'CUST-004'], delegatedProducts: [], password: 'eng123' },
  'ENG-TST-3': { employeeId: 'ENG-TST-3', name: 'Eng Test C', initials: 'TC', baseRole: 'engineer', department: 'Test', ownedProducts: ['CUST-005', 'CUST-006'], delegatedProducts: [], password: 'eng123' },

  // Mechanic Department
  'ENG-MEC-1': { employeeId: 'ENG-MEC-1', name: 'Eng Mech A', initials: 'MA', baseRole: 'engineer', department: 'Mechanic', ownedProducts: ['CUST-002', 'CUST-004'], delegatedProducts: [], password: 'eng123' },
  'ENG-MEC-2': { employeeId: 'ENG-MEC-2', name: 'Eng Mech B', initials: 'MB', baseRole: 'engineer', department: 'Mechanic', ownedProducts: ['CUST-001', 'CUST-006'], delegatedProducts: [], password: 'eng123' },
  'ENG-MEC-3': { employeeId: 'ENG-MEC-3', name: 'Eng Mech C', initials: 'MC', baseRole: 'engineer', department: 'Mechanic', ownedProducts: ['CUST-003', 'CUST-005'], delegatedProducts: [], password: 'eng123' },

  // Manufacturing Department
  'ENG-MFG-1': { employeeId: 'ENG-MFG-1', name: 'Eng Mfg A', initials: 'FA', baseRole: 'engineer', department: 'Manufacturing', ownedProducts: ['CUST-003', 'CUST-001'], delegatedProducts: [], password: 'eng123' },
  'ENG-MFG-2': { employeeId: 'ENG-MFG-2', name: 'Eng Mfg B', initials: 'FB', baseRole: 'engineer', department: 'Manufacturing', ownedProducts: ['CUST-006', 'CUST-002'], delegatedProducts: [], password: 'eng123' },
  'ENG-MFG-3': { employeeId: 'ENG-MFG-3', name: 'Eng Mfg C', initials: 'FC', baseRole: 'engineer', department: 'Manufacturing', ownedProducts: ['CUST-005', 'CUST-004'], delegatedProducts: [], password: 'eng123' },

  // Maintenance Department
  'ENG-MTN-1': { employeeId: 'ENG-MTN-1', name: 'Eng Maint A', initials: 'NA', baseRole: 'engineer', department: 'Maintenance', ownedProducts: ['CUST-005', 'CUST-001'], delegatedProducts: [], password: 'eng123' },
  'ENG-MTN-2': { employeeId: 'ENG-MTN-2', name: 'Eng Maint B', initials: 'NB', baseRole: 'engineer', department: 'Maintenance', ownedProducts: ['CUST-002', 'CUST-003'], delegatedProducts: [], password: 'eng123' },
  'ENG-MTN-3': { employeeId: 'ENG-MTN-3', name: 'Eng Maint C', initials: 'NC', baseRole: 'engineer', department: 'Maintenance', ownedProducts: ['CUST-004', 'CUST-006'], delegatedProducts: [], password: 'eng123' },

  // Facility Department
  'ENG-FAC-1': { employeeId: 'ENG-FAC-1', name: 'Eng Fac A', initials: 'CA', baseRole: 'engineer', department: 'Facility', ownedProducts: ['CUST-006', 'CUST-001'], delegatedProducts: [], password: 'eng123' },
  'ENG-FAC-2': { employeeId: 'ENG-FAC-2', name: 'Eng Fac B', initials: 'CB', baseRole: 'engineer', department: 'Facility', ownedProducts: ['CUST-003', 'CUST-002'], delegatedProducts: [], password: 'eng123' },
  'ENG-FAC-3': { employeeId: 'ENG-FAC-3', name: 'Eng Fac C', initials: 'CC', baseRole: 'engineer', department: 'Facility', ownedProducts: ['CUST-005', 'CUST-004'], delegatedProducts: [], password: 'eng123' },

  // ── Technicians (20) ─────────────────────────────────────────────────────
  // Test Department (4)
  'TECH-TST-1': { employeeId: 'TECH-TST-1', name: 'Tech Test 1', initials: 'T1', baseRole: 'technician', department: 'Test', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
  'TECH-TST-2': { employeeId: 'TECH-TST-2', name: 'Tech Test 2', initials: 'T2', baseRole: 'technician', department: 'Test', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
  'TECH-TST-3': { employeeId: 'TECH-TST-3', name: 'Tech Test 3', initials: 'T3', baseRole: 'technician', department: 'Test', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
  'TECH-TST-4': { employeeId: 'TECH-TST-4', name: 'Tech Test 4', initials: 'T4', baseRole: 'technician', department: 'Test', ownedProducts: [], delegatedProducts: [], password: 'tech123' },

  // Mechanic Department (4)
  'TECH-MEC-1': { employeeId: 'TECH-MEC-1', name: 'Tech Mech 1', initials: 'M1', baseRole: 'technician', department: 'Mechanic', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
  'TECH-MEC-2': { employeeId: 'TECH-MEC-2', name: 'Tech Mech 2', initials: 'M2', baseRole: 'technician', department: 'Mechanic', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
  'TECH-MEC-3': { employeeId: 'TECH-MEC-3', name: 'Tech Mech 3', initials: 'M3', baseRole: 'technician', department: 'Mechanic', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
  'TECH-MEC-4': { employeeId: 'TECH-MEC-4', name: 'Tech Mech 4', initials: 'M4', baseRole: 'technician', department: 'Mechanic', ownedProducts: [], delegatedProducts: [], password: 'tech123' },

  // Manufacturing Department (4)
  'TECH-MFG-1': { employeeId: 'TECH-MFG-1', name: 'Tech Mfg 1', initials: 'F1', baseRole: 'technician', department: 'Manufacturing', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
  'TECH-MFG-2': { employeeId: 'TECH-MFG-2', name: 'Tech Mfg 2', initials: 'F2', baseRole: 'technician', department: 'Manufacturing', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
  'TECH-MFG-3': { employeeId: 'TECH-MFG-3', name: 'Tech Mfg 3', initials: 'F3', baseRole: 'technician', department: 'Manufacturing', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
  'TECH-MFG-4': { employeeId: 'TECH-MFG-4', name: 'Tech Mfg 4', initials: 'F4', baseRole: 'technician', department: 'Manufacturing', ownedProducts: [], delegatedProducts: [], password: 'tech123' },

  // Maintenance Department (4)
  'TECH-MTN-1': { employeeId: 'TECH-MTN-1', name: 'Tech Maint 1', initials: 'N1', baseRole: 'technician', department: 'Maintenance', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
  'TECH-MTN-2': { employeeId: 'TECH-MTN-2', name: 'Tech Maint 2', initials: 'N2', baseRole: 'technician', department: 'Maintenance', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
  'TECH-MTN-3': { employeeId: 'TECH-MTN-3', name: 'Tech Maint 3', initials: 'N3', baseRole: 'technician', department: 'Maintenance', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
  'TECH-MTN-4': { employeeId: 'TECH-MTN-4', name: 'Tech Maint 4', initials: 'N4', baseRole: 'technician', department: 'Maintenance', ownedProducts: [], delegatedProducts: [], password: 'tech123' },

  // Facility Department (4)
  'TECH-FAC-1': { employeeId: 'TECH-FAC-1', name: 'Tech Fac 1', initials: 'C1', baseRole: 'technician', department: 'Facility', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
  'TECH-FAC-2': { employeeId: 'TECH-FAC-2', name: 'Tech Fac 2', initials: 'C2', baseRole: 'technician', department: 'Facility', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
  'TECH-FAC-3': { employeeId: 'TECH-FAC-3', name: 'Tech Fac 3', initials: 'C3', baseRole: 'technician', department: 'Facility', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
  'TECH-FAC-4': { employeeId: 'TECH-FAC-4', name: 'Tech Fac 4', initials: 'C4', baseRole: 'technician', department: 'Facility', ownedProducts: [], delegatedProducts: [], password: 'tech123' },

  // ── Admin (1) ────────────────────────────────────────────────────────────
  'ADM001': { employeeId: 'ADM001', name: 'Admin Supachai', initials: 'AS', baseRole: 'admin', department: 'All', ownedProducts: ['*'], delegatedProducts: [], password: 'adm123', permissions: ['pm.dashboard.view', 'pm.create.view', 'pm.create.submit', 'pm.assign.view', 'pm.assign.submit', 'pm.record.view', 'pm.record.submit', 'pm.calendar.view', 'pm.reports.view', 'pm.audit.view', 'pm.reports.export', 'pm.permission.delegate', 'pm.permission.revoke', 'system.user.manage', 'system.role.manage', 'system.product.manage'] },
};

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSignal = signal<User | null>(this.loadStoredAuth());

  // Expose state via computed signals
  readonly currentUser = computed(() => this.currentUserSignal());
  readonly isLoggedIn = computed(() => this.currentUserSignal() !== null);

  constructor() {}

  login(employeeId: string, password?: string): boolean {
    const user = DEMO_USERS[employeeId];
    if (user && user.password === password) {
      // Create clean user object without password
      const { password: _, ...cleanUser } = user;
      
      this.currentUserSignal.set(cleanUser as User);
      localStorage.setItem(AUTH_KEY, JSON.stringify(cleanUser));
      return true;
    }
    return false;
  }

  logout(): void {
    this.currentUserSignal.set(null);
    localStorage.removeItem(AUTH_KEY);
  }

  private readonly ROLE_DEFAULTS: Record<string, string[]> = {
    technician: [
      'pm.dashboard.view',
      'pm.record.view',
      'pm.record.submit',
      'pm.calendar.view',
    ],
    engineer: [
      'pm.dashboard.view',
      'pm.create.view',
      'pm.create.submit',
      'pm.assign.view',
      'pm.assign.submit',
      'pm.record.view',
      'pm.record.submit',
      'pm.calendar.view',
      'pm.reports.view',
      'pm.audit.view',
      'pm.reports.export',
      'pm.permission.delegate',
    ]
  };

  hasPermission(permission: string, productId?: string): boolean {
    const user = this.currentUser();
    if (!user) return false;
    
    // Admins and Managers get full access (legacy mapping)
    if (user.baseRole === 'admin' || user.baseRole === 'manager') return true;
    
    // Check base role defaults
    if (user.baseRole && this.ROLE_DEFAULTS[user.baseRole]) {
      if (this.ROLE_DEFAULTS[user.baseRole].includes(permission)) {
        // If it's an engineer, ensure they own the product (or if no product specified, they just have the permission globally)
        if (user.baseRole === 'engineer' && productId) {
          return !!user.ownedProducts && (user.ownedProducts.includes('*') || user.ownedProducts.includes(productId));
        }
        return true;
      }
    }

    // Check delegations (Technicians)
    if (user.baseRole === 'technician' && user.delegatedProducts?.length > 0) {
      for (const dp of user.delegatedProducts) {
        if (dp.status !== 'active') continue;
        if (dp.validUntil && new Date(dp.validUntil) < new Date()) {
          dp.status = 'revoked';
          continue;
        }
        if (!dp.permissions?.includes(permission)) continue;

        // If no specific product is queried, they have the permission generally
        if (!productId) return true;
        
        // If product is specified, it must match
        if (dp.productId === productId) return true;
      }
    }

    return user.permissions?.includes(permission) ?? false;
  }

  canDelegate(targetEmployeeId: string): boolean {
    const user = this.currentUser();
    if (!user) return false;

    // Admin/Manager can cross sections and roles
    if (user.baseRole === 'admin' || user.baseRole === 'manager') return true;

    // Engineer can only delegate to Technicians in the exact same department
    if (user.baseRole === 'engineer') {
      const targetUser = this.getUser(targetEmployeeId);
      if (!targetUser) return false;
      return targetUser.baseRole === 'technician' && targetUser.department === user.department;
    }

    return false;
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  grantDelegation(targetUserNamesOrIds: string[], products: string[], validUntil: Date): void {
    const currentUser = this.currentUser();
    if (!currentUser) throw new Error("Unauthorized.");

    if (currentUser.baseRole === 'technician') {
      // Tech can only delegate if they have temp permissions themselves, and only for products they have access to
      const allowedProducts = this.getAccessibleProducts('pm.create.submit');
      if (allowedProducts.length === 0) {
        alert("API ERROR: Tech must have temporary permissions to grant delegations.");
        throw new Error("Unauthorized");
      }
      for (const p of products) {
        if (!allowedProducts.includes(p)) {
          alert("API ERROR: Tech can only delegate within their granted scope.");
          throw new Error("Scope error");
        }
      }
    } else if (currentUser.baseRole === 'engineer') {
      const allowedProducts = this.getAccessibleProducts('pm.create.submit');
      for (const p of products) {
        if (!allowedProducts.includes(p)) {
          alert("API ERROR: Engineers can only delegate within their own department/products.");
          throw new Error("Scope error");
        }
      }
    }

    const defaultPermissions = ['pm.create.view', 'pm.create.submit', 'pm.assign.view', 'pm.record.view', 'pm.record.submit', 'pm.calendar.view'];
    const delegationId = `DEL-${this.generateUUID()}`;
    
    for (const nameOrId of targetUserNamesOrIds) {
      const targetUser = Object.values(DEMO_USERS).find(u => u.name === nameOrId || u.employeeId === nameOrId);
      if (targetUser) {
        targetUser.delegatedProducts = targetUser.delegatedProducts || [];
        for (const productId of products) {
          targetUser.delegatedProducts.push({
            id: delegationId,
            productId,
            status: 'active',
            permissions: defaultPermissions,
            validUntil
          });
        }
      }
    }
  }

  revokeDelegation(delegationId: string): void {
    const currentUser = this.currentUser();
    if (!currentUser) throw new Error("Unauthorized.");

    if (currentUser.baseRole === 'technician') {
       alert("API ERROR: Technicians cannot revoke delegations.");
       throw new Error("Unauthorized");
    }

    for (const user of Object.values(DEMO_USERS)) {
      if (user.delegatedProducts) {
        for (const dp of user.delegatedProducts) {
          if (dp.id === delegationId) {
            dp.status = 'revoked';
          }
        }
      }
    }
  }

  getActiveDelegations(): any[] {
    const delegationsMap = new Map<string, any>();
    
    for (const user of Object.values(DEMO_USERS)) {
      if (user.delegatedProducts) {
        for (const dp of user.delegatedProducts) {
          if (dp.status === 'active') {
            if (dp.validUntil && new Date(dp.validUntil) < new Date()) {
               dp.status = 'revoked';
               continue;
            }
            const id = dp.id || `DEL-${this.generateUUID()}`;
            if (!delegationsMap.has(id)) {
              delegationsMap.set(id, {
                id,
                user: user.name,
                products: new Set([dp.productId]),
                validUntil: dp.validUntil
              });
            } else {
              delegationsMap.get(id).products.add(dp.productId);
            }
          }
        }
      }
    }
    
    return Array.from(delegationsMap.values()).map(d => ({
      ...d,
      products: Array.from(d.products)
    }));
  }

  getUser(employeeId: string): Partial<User> | undefined {
    return DEMO_USERS[employeeId];
  }

  getAllUsers(): Partial<User>[] {
    return Object.values(DEMO_USERS);
  }

  getAccessibleProducts(permission: string): string[] {
    const user = this.currentUser();
    if (!user) return [];
    if (user.baseRole === 'admin' || user.baseRole === 'manager') {
      return ['CUST-001', 'CUST-002', 'CUST-003', 'CUST-004', 'CUST-005', 'CUST-006']; // Demo all products
    }
    return user.ownedProducts || [];
  }

  private loadStoredAuth(): User | null {
    try {
      const stored = localStorage.getItem(AUTH_KEY);
      if (stored) {
        return JSON.parse(stored) as User;
      }
    } catch {
      // Ignored
    }
    return null;
  }
}
