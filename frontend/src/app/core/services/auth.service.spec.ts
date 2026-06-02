import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';

describe('AuthService - RBAC', () => {
  let service: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    service.logout();
  });

  describe('Technician Permissions', () => {
    it('should grant Tech only Record and Calendar view access by default', () => {
      // TECH-TST-1 is a Technician in Demo data
      service.login('TECH-TST-1', 'tech123');
      
      // Allowed basic tech perms
      expect(service.hasPermission('pm.record.view')).toBe(true);
      expect(service.hasPermission('pm.record.submit')).toBe(true);
      expect(service.hasPermission('pm.calendar.view')).toBe(true);

      // Denied advanced perms
      expect(service.hasPermission('pm.create.view')).toBe(false);
      expect(service.hasPermission('pm.assign.view')).toBe(false);
      expect(service.hasPermission('pm.dashboard.view')).toBe(false);
    });

    it('should grant Tech extra permissions if they have an active delegation', () => {
      // We will mock a login and manually inject a delegation
      service.login('TECH-TST-1', 'tech123');
      const techUser = service.currentUser();
      
      // Inject delegation (simulating what the auth service or app should do on load)
      techUser!.delegatedProducts = [{
        productId: 'CUST-001',
        permissions: ['pm.create.view', 'pm.assign.view'],
        status: 'active'
      }];

      // Denied previously, but should now be allowed via delegation
      expect(service.hasPermission('pm.create.view')).toBe(true);
      expect(service.hasPermission('pm.assign.view')).toBe(true);
      
      // But still denied for things not in delegation
      expect(service.hasPermission('pm.dashboard.view')).toBe(false);
    });
  });

  describe('Engineer Permissions & Scoping', () => {
    it('should grant Eng base access but restrict to owned products and same-department tech delegation', () => {
      // ENG-TST-1 is in 'Test' department and owns CUST-001, CUST-002
      service.login('ENG-TST-1', 'eng123');

      // Base permissions
      expect(service.hasPermission('pm.create.view')).toBe(true);
      expect(service.hasPermission('pm.assign.view')).toBe(true);

      // Accessible products should be restricted
      const accessibleProducts = service.getAccessibleProducts('pm.create.view');
      expect(accessibleProducts).toEqual(['CUST-001', 'CUST-002']);

      // Scoped permission checks
      expect(service.hasPermission('pm.create.view', 'CUST-001')).toBe(true); // Owned
      expect(service.hasPermission('pm.create.view', 'CUST-003')).toBe(false); // Not owned

      // Delegation rules (ENG-TST-1 is in Test dept)
      // TECH-TST-1 is in Test dept
      expect(service.canDelegate('TECH-TST-1')).toBe(true);
      
      // TECH-MEC-1 is in Mechanic dept
      expect(service.canDelegate('TECH-MEC-1')).toBe(false);
      
      // MGR001 is a Manager (Eng can only delegate to Tech)
      expect(service.canDelegate('MGR001')).toBe(false);
    });
  });

  describe('Manager & Admin Permissions', () => {
    it('should allow Manager to cross departments and access all products', () => {
      service.login('MGR001', 'mgr123');

      // Base permissions
      expect(service.hasPermission('pm.create.view')).toBe(true);

      // Accessible products should be all Demo products (CUST-001 to CUST-006)
      const accessibleProducts = service.getAccessibleProducts('pm.create.view');
      expect(accessibleProducts.length).toBe(6);
      expect(accessibleProducts).toContain('CUST-006');

      // Can cross departments (Tech Test and Tech Mech)
      expect(service.canDelegate('TECH-TST-1')).toBe(true);
      expect(service.canDelegate('TECH-MEC-1')).toBe(true);
      
      // Can even delegate to an Engineer
      expect(service.canDelegate('ENG-TST-1')).toBe(true);
    });

    it('should grant Admin full access to everything', () => {
      service.login('ADM001', 'adm123');

      expect(service.hasPermission('pm.dashboard.view')).toBe(true);
      expect(service.hasPermission('system.user.manage')).toBe(true);
      
      // Can delegate to anyone
      expect(service.canDelegate('TECH-TST-1')).toBe(true);
      expect(service.canDelegate('ENG-TST-1')).toBe(true);
      expect(service.canDelegate('MGR001')).toBe(true);
    });
  });
});
