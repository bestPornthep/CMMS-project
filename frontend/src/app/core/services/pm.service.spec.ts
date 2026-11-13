import { TestBed } from '@angular/core/testing';
import { PmStore } from './pm-store.service';
import { PmTaskService } from './pm-task.service';
import { TemplateService } from './template.service';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { PMTask } from '../models/pm.model';

// Helper: flush microtask queue (resolves Promise.resolve/all in constructors)
const flush = () => new Promise(r => setTimeout(r, 0));

describe('PmService', () => {
  let pmStore: PmStore;
  let pmTaskService: PmTaskService;
  let templateService: TemplateService;
  let authService: AuthService;
  let apiService: ApiService;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    apiService = TestBed.inject(ApiService);
    authService = TestBed.inject(AuthService);
    pmStore = TestBed.inject(PmStore);
    pmTaskService = TestBed.inject(PmTaskService);
    templateService = TestBed.inject(TemplateService);
    await flush(); // resolve constructor Promise.all
  });

  afterEach(() => {
    authService.logout();
    localStorage.clear();
  });

  // ── Data Loading ──────────────────────────────────────────────────────

  describe('Initialization', () => {
    it('should load assets from ApiService on init', () => {
      expect(pmStore.assets().length).toBeGreaterThan(0);
    });

    it('should load tasks from ApiService on init', () => {
      expect(pmStore.pmTasks().length).toBeGreaterThan(0);
    });

    it('should load templates from ApiService on init', () => {
      expect(templateService.templates()).toBeDefined();
    });
  });

  // ── addPmTask() ────────────────────────────────────────────────────────

  describe('addPmTask() — Authorization', () => {
    it('should throw when no user is logged in', () => {
      expect(() => pmTaskService.addPmTask({ productId: 'CUST-001' }))
        .toThrowError(/Unauthorized/);
    });

    it('should throw when technician tries to create (no permission)', async () => {
      await authService.login('TECH-TST-1', 'tech123');
      expect(() => pmTaskService.addPmTask({ productId: 'CUST-001', department: 'Test', assetId: 'THC-P1-01' }))
        .toThrowError(/Unauthorized/);
    });

    it('should throw when engineer creates for product they do not own', async () => {
      await authService.login('ENG-TST-1', 'eng123');
      // ENG-TST-1 owns CUST-001, CUST-002 only
      expect(() => pmTaskService.addPmTask({ productId: 'CUST-003', department: 'Test', assetId: 'THC-P3-01' }))
        .toThrowError(/Product access denied/);
    });

    it('should throw when asset does not match product', async () => {
      await authService.login('ENG-TST-1', 'eng123');
      // CH-P1-01 belongs to CUST-001 Facility, not CUST-002
      expect(() => pmTaskService.addPmTask({ productId: 'CUST-002', department: 'Facility', assetId: 'CH-P1-01' }))
        .toThrowError(/Invalid Product-Asset/);
    });

    it('should throw when asset department does not match task department', async () => {
      await authService.login('ENG-TST-1', 'eng123');
      // THC-P1-01 is in Test department, not Facility
      expect(() => pmTaskService.addPmTask({ productId: 'CUST-001', department: 'Facility', assetId: 'THC-P1-01' }))
        .toThrowError(/Invalid Product-Asset/);
    });

    it('should throw when assetId does not exist', async () => {
      await authService.login('ENG-TST-1', 'eng123');
      expect(() => pmTaskService.addPmTask({ productId: 'CUST-001', department: 'Test', assetId: 'FAKE-ASSET' }))
        .toThrowError(/Invalid Product-Asset/);
    });

    it('should succeed with valid data as engineer', async () => {
      await authService.login('ENG-TST-1', 'eng123');
      const before = pmStore.pmTasks().length;

      pmTaskService.addPmTask({
        productId: 'CUST-001',
        department: 'Test',
        assetId: 'THC-P1-01',
        title: 'Valid Task',
        description: 'test',
        frequency: 'Weekly',
        nextDueDate: new Date(),
        estimatedHours: 1,
        status: 'Pending',
      });
      await flush(); // resolve createTask promise

      expect(pmStore.pmTasks().length).toBe(before + 1);
    });

    it('should succeed as manager for any product', async () => {
      await authService.login('MGR001', 'mgr123');
      const before = pmStore.pmTasks().length;

      pmTaskService.addPmTask({
        productId: 'CUST-005',
        department: 'Maintenance',
        assetId: 'GEN-P5-01',
        title: 'Manager Task',
        description: '',
        frequency: 'Monthly',
        nextDueDate: new Date(),
        estimatedHours: 2,
        status: 'Pending',
      });
      await flush();

      expect(pmStore.pmTasks().length).toBe(before + 1);
    });
  });

  // ── updateTask() ──────────────────────────────────────────────────────

  describe('updateTask() — Authorization', () => {
    it('should throw when no user is logged in', () => {
      const fakeTask = { id: 'PM-TST-0001', productId: 'CUST-001' } as PMTask;
      expect(() => pmTaskService.updateTask(fakeTask)).toThrowError(/Unauthorized/);
    });

    it('should throw when engineer updates task for product they do not own and are not assigned', async () => {
      await authService.login('ENG-TST-1', 'eng123');

      const task = pmStore.pmTasks().find(t =>
        t.productId === 'CUST-003' || t.productId === 'CUST-004' || t.productId === 'CUST-005'
      );
      if (task) {
        expect(() => pmTaskService.updateTask({ ...task, title: 'Hacked' }))
          .toThrowError(/Unauthorized/);
      }
    });

    it('should allow engineer to update task for owned product', async () => {
      await authService.login('ENG-TST-1', 'eng123');
      const task = pmStore.pmTasks().find(t => t.productId === 'CUST-001');
      if (task) {
        expect(() => pmTaskService.updateTask({ ...task, title: 'Updated' })).not.toThrow();
        await flush();
      }
    });

    it('should allow manager to update any task', async () => {
      await authService.login('MGR001', 'mgr123');
      const task = pmStore.pmTasks()[0];
      expect(() => pmTaskService.updateTask({ ...task, title: 'Manager Update' })).not.toThrow();
      await flush();
    });

    it('should allow technician to update task assigned to them', async () => {
      await authService.login('TECH-TST-1', 'tech123');
      const task = pmStore.pmTasks().find(t => t.assignedTo === 'TECH-TST-1');
      if (task) {
        expect(() => pmTaskService.updateTask({ ...task, recordNotes: 'Done' })).not.toThrow();
        await flush();
      }
    });
  });

  // ── deleteTask() ──────────────────────────────────────────────────────

  describe('deleteTask()', () => {
    it('should remove a task from the list', async () => {
      const tasks = pmStore.pmTasks();
      const id = tasks[0].id;
      pmTaskService.deleteTask(id);
      await flush();
      expect(pmStore.pmTasks().find(t => t.id === id)).toBeUndefined();
    });

    it('should handle deleting non-existent task gracefully', async () => {
      const before = pmStore.pmTasks().length;
      pmTaskService.deleteTask('PM-FAKE-9999');
      await flush();
      expect(pmStore.pmTasks().length).toBe(before);
    });
  });

  // ── Template CRUD ─────────────────────────────────────────────────────

  describe('saveTemplate()', () => {
    it('should throw when not logged in', () => {
      expect(() => templateService.saveTemplate({ name: 'T', department: 'Test', checklist: [] }))
        .toThrowError(/Unauthorized/);
    });

    it('should throw when engineer saves template for different department', async () => {
      await authService.login('ENG-TST-1', 'eng123');
      expect(() => templateService.saveTemplate({ name: 'X', department: 'Facility', checklist: [] }))
        .toThrowError(/your own department/);
    });

    it('should allow engineer to save template for own department', async () => {
      await authService.login('ENG-TST-1', 'eng123');
      templateService.saveTemplate({ name: 'My Template', department: 'Test', checklist: [{ text: 'Step 1' }] });
      await flush();
      expect(templateService.templates().some(t => t.name === 'My Template')).toBe(true);
    });

    it('should allow manager to save template for any department', async () => {
      await authService.login('MGR001', 'mgr123');
      templateService.saveTemplate({ name: 'Mgr Template', department: 'Facility', checklist: [] });
      await flush();
      expect(templateService.templates().some(t => t.name === 'Mgr Template')).toBe(true);
    });
  });

  describe('deleteTemplate()', () => {
    it('should throw when not logged in', () => {
      expect(() => templateService.deleteTemplate({ id: '1', name: 'T', department: 'Test', checklist: [] }))
        .toThrowError(/Unauthorized/);
    });

    it('should throw when engineer deletes template from different department', async () => {
      await authService.login('ENG-TST-1', 'eng123');
      expect(() => templateService.deleteTemplate({ id: '1', name: 'X', department: 'Facility', checklist: [] }))
        .toThrowError(/your own department/);
    });
  });

  // ── viewedTaskGlobal ──────────────────────────────────────────────────

  describe('viewedTaskGlobal', () => {
    it('should start as null', () => {
      expect(pmStore.viewedTaskGlobal()).toBeNull();
    });

    it('should hold a task when set', () => {
      const task = pmStore.pmTasks()[0];
      pmStore.viewedTaskGlobal.set(task);
      expect(pmStore.viewedTaskGlobal()).toBe(task);
    });

    it('should be clearable', () => {
      pmStore.viewedTaskGlobal.set(pmStore.pmTasks()[0]);
      pmStore.viewedTaskGlobal.set(null);
      expect(pmStore.viewedTaskGlobal()).toBeNull();
    });
  });
});
