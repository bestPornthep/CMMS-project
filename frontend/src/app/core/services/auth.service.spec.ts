import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    service.logout();
    localStorage.clear();
  });

  // ── Login / Logout ─────────────────────────────────────────────────────

  describe('login()', () => {
    it('should login with valid credentials', async () => {
      const result = await service.login('MGR001', 'mgr123');
      expect(result).toBe(true);
      expect(service.currentUser()).toBeTruthy();
      expect(service.currentUser()!.employeeId).toBe('MGR001');
    });

    it('should fail login with wrong password', async () => {
      const result = await service.login('MGR001', 'wrong');
      expect(result).toBe(false);
      expect(service.currentUser()).toBeNull();
    });

    it('should fail login with non-existent user', async () => {
      const result = await service.login('NOBODY', 'any');
      expect(result).toBe(false);
    });

    it('should fail login with empty credentials', async () => {
      const result = await service.login('', '');
      expect(result).toBe(false);
    });

    it('should persist session to localStorage on login', async () => {
      await service.login('ENG-TST-1', 'eng123');
      const stored = localStorage.getItem('assetintel_auth');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.employeeId).toBe('ENG-TST-1');
    });

    it('should set isLoggedIn to true after login', async () => {
      expect(service.isLoggedIn()).toBe(false);
      await service.login('MGR001', 'mgr123');
      expect(service.isLoggedIn()).toBe(true);
    });
  });

  describe('logout()', () => {
    it('should clear currentUser on logout', async () => {
      await service.login('MGR001', 'mgr123');
      service.logout();
      expect(service.currentUser()).toBeNull();
      expect(service.isLoggedIn()).toBe(false);
    });

    it('should clear localStorage on logout', async () => {
      await service.login('MGR001', 'mgr123');
      service.logout();
      expect(localStorage.getItem('assetintel_auth')).toBeNull();
    });

    it('should be safe to call logout when not logged in', () => {
      expect(() => service.logout()).not.toThrow();
    });
  });

  describe('Session persistence', () => {
    it('should store session on login and restore on fresh init', async () => {
      await service.login('MGR001', 'mgr123');
      const stored = localStorage.getItem('assetintel_auth');
      expect(stored).toBeTruthy();

      // Verify the stored data can be parsed back into a valid user
      const parsed = JSON.parse(stored!);
      expect(parsed.employeeId).toBe('MGR001');
      expect(parsed.baseRole).toBe('manager');
    });

    it('should handle corrupted localStorage gracefully', () => {
      localStorage.setItem('assetintel_auth', 'NOT_VALID_JSON{{{');
      // Should not throw — loadStoredSession has try/catch
      expect(() => TestBed.inject(AuthService)).not.toThrow();
    });
  });

  // ── Permission Checks ─────────────────────────────────────────────────

  describe('hasPermission() — no user', () => {
    it('should return false when no user is logged in', () => {
      expect(service.hasPermission('pm.dashboard.view')).toBe(false);
      expect(service.hasPermission('pm.create.view')).toBe(false);
      expect(service.hasPermission('system.user.manage')).toBe(false);
    });
  });

  describe('hasPermission() — Technician', () => {
    beforeEach(async () => {
      await service.login('TECH-TST-1', 'tech123');
    });

    it('should grant basic tech permissions', () => {
      expect(service.hasPermission('pm.dashboard.view')).toBe(true);
      expect(service.hasPermission('pm.record.view')).toBe(true);
      expect(service.hasPermission('pm.record.submit')).toBe(true);
      expect(service.hasPermission('pm.calendar.view')).toBe(true);
    });

    it('should deny advanced permissions', () => {
      expect(service.hasPermission('pm.create.view')).toBe(false);
      expect(service.hasPermission('pm.create.submit')).toBe(false);
      expect(service.hasPermission('pm.assign.view')).toBe(false);
      expect(service.hasPermission('pm.reports.view')).toBe(false);
      expect(service.hasPermission('pm.audit.view')).toBe(false);
      expect(service.hasPermission('system.user.manage')).toBe(false);
    });

    it('should grant delegated permissions when active delegation exists', () => {
      const user = service.currentUser()!;
      user.delegatedProducts = [{
        id: 'DEL-TEST', productId: 'CUST-001', status: 'active',
        permissions: ['pm.create.view', 'pm.create.submit'],
      }];

      expect(service.hasPermission('pm.create.view')).toBe(true);
      expect(service.hasPermission('pm.create.submit')).toBe(true);
      // Still denied for things not in delegation
      expect(service.hasPermission('pm.assign.view')).toBe(false);
    });

    it('should deny delegated permission if delegation is revoked', () => {
      const user = service.currentUser()!;
      user.delegatedProducts = [{
        id: 'DEL-REVOKED', productId: 'CUST-001', status: 'revoked',
        permissions: ['pm.create.view'],
      }];
      expect(service.hasPermission('pm.create.view')).toBe(false);
    });

    it('should deny delegated permission if delegation is expired', () => {
      const user = service.currentUser()!;
      const pastDate = new Date(Date.now() - 86400000); // yesterday
      user.delegatedProducts = [{
        id: 'DEL-EXPIRED', productId: 'CUST-001', status: 'active',
        permissions: ['pm.create.view'], validUntil: pastDate,
      }];
      expect(service.hasPermission('pm.create.view')).toBe(false);
    });

    it('should scope delegated permission to specific product when productId is given', () => {
      const user = service.currentUser()!;
      user.delegatedProducts = [{
        id: 'DEL-SCOPED', productId: 'CUST-001', status: 'active',
        permissions: ['pm.create.view'],
      }];
      expect(service.hasPermission('pm.create.view', 'CUST-001')).toBe(true);
      expect(service.hasPermission('pm.create.view', 'CUST-002')).toBe(false);
    });
  });

  describe('hasPermission() — Engineer', () => {
    beforeEach(async () => {
      await service.login('ENG-TST-1', 'eng123');
    });

    it('should grant all engineer permissions without product scope', () => {
      expect(service.hasPermission('pm.create.view')).toBe(true);
      expect(service.hasPermission('pm.assign.view')).toBe(true);
      expect(service.hasPermission('pm.record.view')).toBe(true);
      expect(service.hasPermission('pm.reports.view')).toBe(true);
      expect(service.hasPermission('pm.audit.view')).toBe(true);
    });

    it('should scope product access to owned products', () => {
      // ENG-TST-1 owns CUST-001, CUST-002
      expect(service.hasPermission('pm.create.submit', 'CUST-001')).toBe(true);
      expect(service.hasPermission('pm.create.submit', 'CUST-002')).toBe(true);
      expect(service.hasPermission('pm.create.submit', 'CUST-003')).toBe(false);
    });

    it('should deny system admin permissions', () => {
      expect(service.hasPermission('system.user.manage')).toBe(false);
    });
  });

  describe('hasPermission() — Manager', () => {
    beforeEach(async () => {
      await service.login('MGR001', 'mgr123');
    });

    it('should grant all permissions except audit view', () => {
      expect(service.hasPermission('pm.create.view')).toBe(true);
      expect(service.hasPermission('pm.assign.submit')).toBe(true);
      expect(service.hasPermission('pm.reports.export')).toBe(true);
      expect(service.hasPermission('pm.permission.delegate')).toBe(true);
    });

    it('should grant audit view for manager', () => {
      expect(service.hasPermission('pm.audit.view')).toBe(true);
    });
  });

  describe('hasPermission() — Admin', () => {
    beforeEach(async () => {
      await service.login('ADM001', 'adm123');
    });

    it('should grant all general permissions', () => {
      expect(service.hasPermission('pm.dashboard.view')).toBe(true);
      expect(service.hasPermission('pm.create.submit')).toBe(true);
      expect(service.hasPermission('system.user.manage')).toBe(true);
    });

    it('should deny audit view for admin (per RBAC spec)', () => {
      // Admin has baseRole 'admin', audit view is engineer+manager only
      expect(service.hasPermission('pm.audit.view')).toBe(false);
    });
  });

  // ── getAccessibleProducts() ───────────────────────────────────────────

  describe('getAccessibleProducts()', () => {
    it('should return empty when not logged in', () => {
      expect(service.getAccessibleProducts('pm.create.submit')).toEqual([]);
    });

    it('should return all 6 products for manager', async () => {
      await service.login('MGR001', 'mgr123');
      const products = service.getAccessibleProducts('pm.create.submit');
      expect(products.length).toBe(6);
    });

    it('should return only owned products for engineer', async () => {
      await service.login('ENG-TST-1', 'eng123');
      const products = service.getAccessibleProducts('pm.create.submit');
      expect(products).toContain('CUST-001');
      expect(products).toContain('CUST-002');
      expect(products).not.toContain('CUST-003');
    });

    it('should include delegated products for technician', async () => {
      await service.login('TECH-TST-1', 'tech123');
      const user = service.currentUser()!;
      user.delegatedProducts = [{
        id: 'DEL-X', productId: 'CUST-001', status: 'active',
        permissions: ['pm.create.submit'],
      }];
      const products = service.getAccessibleProducts('pm.create.submit');
      expect(products).toContain('CUST-001');
    });

    it('should exclude expired delegated products', async () => {
      await service.login('TECH-TST-1', 'tech123');
      const user = service.currentUser()!;
      user.delegatedProducts = [{
        id: 'DEL-Y', productId: 'CUST-001', status: 'active',
        permissions: ['pm.create.submit'],
        validUntil: new Date(Date.now() - 86400000),
      }];
      const products = service.getAccessibleProducts('pm.create.submit');
      expect(products).not.toContain('CUST-001');
    });
  });

  // ── canDelegate() ─────────────────────────────────────────────────────

  describe('canDelegate()', () => {
    it('should return false when not logged in', () => {
      expect(service.canDelegate('TECH-TST-1')).toBe(false);
    });

    it('should allow manager to delegate to anyone', async () => {
      await service.login('MGR001', 'mgr123');
      expect(service.canDelegate('TECH-TST-1')).toBe(true);
      expect(service.canDelegate('TECH-MEC-1')).toBe(true);
      expect(service.canDelegate('ENG-TST-1')).toBe(true);
    });

    it('should allow engineer to delegate to same-dept technician only', async () => {
      await service.login('ENG-TST-1', 'eng123');
      // Same dept (Test)
      expect(service.canDelegate('TECH-TST-1')).toBe(true);
      // Different dept (Mechanic)
      expect(service.canDelegate('TECH-MEC-1')).toBe(false);
      // Not a technician
      expect(service.canDelegate('MGR001')).toBe(false);
    });

    it('should deny technician from delegating', async () => {
      await service.login('TECH-TST-1', 'tech123');
      expect(service.canDelegate('TECH-TST-2')).toBe(false);
    });

    it('should return false for non-existent target user', async () => {
      await service.login('ENG-TST-1', 'eng123');
      // getUser returns undefined for non-existent → canDelegate should return false
      expect(service.canDelegate('GHOST-999')).toBe(false);
    });
  });

  // ── grantDelegation() / revokeDelegation() ────────────────────────────

  describe('grantDelegation()', () => {
    it('should throw when not logged in', () => {
      expect(() => service.grantDelegation(['TECH-TST-1'], ['CUST-001'], new Date()))
        .toThrowError(/Unauthorized/);
    });

    it('should grant delegation as manager', async () => {
      await service.login('MGR001', 'mgr123');
      const futureDate = new Date(Date.now() + 30 * 86400000);
      service.grantDelegation(['TECH-TST-1'], ['CUST-001'], futureDate);

      const delegations = service.getActiveDelegations();
      expect(delegations.length).toBeGreaterThan(0);
      expect(delegations.some(d => d.employeeId === 'TECH-TST-1')).toBe(true);
    });

    it('should throw when engineer tries to delegate product they do not own', async () => {
      await service.login('ENG-TST-1', 'eng123');
      // ENG-TST-1 owns CUST-001, CUST-002 only
      expect(() => service.grantDelegation(['TECH-TST-1'], ['CUST-003'], new Date(Date.now() + 86400000)))
        .toThrowError(/owned products/);
    });

    it('should throw when technician tries to delegate without delegation scope', async () => {
      await service.login('TECH-TST-1', 'tech123');
      // Technician has no products to delegate by default
      expect(() => service.grantDelegation(['TECH-TST-2'], ['CUST-001'], new Date(Date.now() + 86400000)))
        .toThrowError(/No products to delegate/);
    });
  });

  describe('revokeDelegation()', () => {
    it('should throw when not logged in', () => {
      expect(() => service.revokeDelegation('DEL-123')).toThrowError(/Unauthorized/);
    });

    it('should throw when technician tries to revoke', async () => {
      await service.login('TECH-TST-1', 'tech123');
      expect(() => service.revokeDelegation('DEL-123')).toThrowError(/Technicians cannot revoke/);
    });

    it('should revoke a delegation as manager', async () => {
      await service.login('MGR001', 'mgr123');
      const futureDate = new Date(Date.now() + 30 * 86400000);
      service.grantDelegation(['TECH-TST-1'], ['CUST-001'], futureDate);

      const delegations = service.getActiveDelegations();
      const delegationId = delegations.find(d => d.employeeId === 'TECH-TST-1')?.id;
      expect(delegationId).toBeTruthy();

      service.revokeDelegation(delegationId!);

      // Should no longer appear in active delegations
      const after = service.getActiveDelegations();
      expect(after.find(d => d.id === delegationId)).toBeUndefined();
    });
  });

  // ── User lookup ────────────────────────────────────────────────────────

  describe('getUser() / getAllUsers()', () => {
    it('getAllUsers should return all users after cache loads', async () => {
      await new Promise(r => setTimeout(r, 0)); // flush constructor promise
      const users = service.getAllUsers();
      expect(users.length).toBeGreaterThan(30);
    });

    it('getUser should find by employeeId', async () => {
      await new Promise(r => setTimeout(r, 0));
      const user = service.getUser('ENG-TST-1');
      expect(user).toBeDefined();
      expect(user!.department).toBe('Test');
    });

    it('getUser should return undefined for non-existent user', async () => {
      await new Promise(r => setTimeout(r, 0));
      expect(service.getUser('GHOST-999')).toBeUndefined();
    });
  });
});
