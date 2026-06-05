import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';
import { PMTask, Template } from '../models/pm.model';

describe('ApiService', () => {
  let service: ApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApiService);
  });

  // ── Assets ────────────────────────────────────────────────────────────────

  describe('getAssets()', () => {
    it('should return all seed assets', async () => {
      const assets = await service.getAssets();
      expect(assets.length).toBeGreaterThan(0);
    });

    it('should return assets with valid structure', async () => {
      const assets = await service.getAssets();
      for (const a of assets) {
        expect(a.id).toBeTruthy();
        expect(a.name).toBeTruthy();
        expect(a.department).toBeTruthy();
        expect(a.location).toBeTruthy();
      }
    });

    it('should return assets for all 6 products', async () => {
      const assets = await service.getAssets();
      const locations = new Set(assets.map(a => a.location));
      expect(locations.size).toBe(6);
      expect(locations.has('CUST-001')).toBe(true);
      expect(locations.has('CUST-006')).toBe(true);
    });

    it('should return assets for all 5 departments', async () => {
      const assets = await service.getAssets();
      const depts = new Set(assets.map(a => a.department));
      expect(depts.has('Facility')).toBe(true);
      expect(depts.has('Mechanic')).toBe(true);
      expect(depts.has('Manufacturing')).toBe(true);
      expect(depts.has('Maintenance')).toBe(true);
      expect(depts.has('Test')).toBe(true);
    });

    it('should return a new array each call (no mutation leaks)', async () => {
      const a1 = await service.getAssets();
      const a2 = await service.getAssets();
      expect(a1).not.toBe(a2);
      a1.pop();
      const a3 = await service.getAssets();
      expect(a3.length).toBe(a2.length);
    });
  });

  // ── PM Tasks ──────────────────────────────────────────────────────────────

  describe('getTasks()', () => {
    it('should return seed tasks', async () => {
      const tasks = await service.getTasks();
      expect(tasks.length).toBeGreaterThan(0);
    });

    it('should return tasks with valid status values', async () => {
      const valid = ['Pending', 'In Progress', 'Pending Approval', 'Done', 'Overdue'];
      const tasks = await service.getTasks();
      for (const t of tasks) {
        expect(valid).toContain(t.status);
      }
    });

    it('should return tasks with valid asset references', async () => {
      const assets = await service.getAssets();
      const assetIds = new Set(assets.map(a => a.id));
      const tasks = await service.getTasks();
      for (const t of tasks) {
        expect(assetIds.has(t.assetId)).toBe(true);
      }
    });

    it('should return copies (no mutation leaks)', async () => {
      const t1 = await service.getTasks();
      t1[0].title = 'MUTATED';
      const t2 = await service.getTasks();
      expect(t2[0].title).not.toBe('MUTATED');
    });
  });

  describe('createTask()', () => {
    it('should create a task with auto-generated ID', async () => {
      const task = await service.createTask({
        title: 'Test Task',
        description: 'desc',
        frequency: 'Weekly',
        assetId: 'CH-P1-01',
        productId: 'CUST-001',
        department: 'Facility',
        nextDueDate: new Date(),
        estimatedHours: 1,
        status: 'Pending',
      } as Omit<PMTask, 'id'>);

      expect(task.id).toBeTruthy();
      expect(task.id).toMatch(/^PM-FAC-\d{4}$/);
      expect(task.title).toBe('Test Task');
    });

    it('should prepend new task to the list', async () => {
      const before = await service.getTasks();
      await service.createTask({
        title: 'Prepended',
        description: '',
        frequency: 'Daily',
        assetId: 'CH-P1-01',
        productId: 'CUST-001',
        department: 'Facility',
        nextDueDate: new Date(),
        estimatedHours: 0.5,
        status: 'Pending',
      } as Omit<PMTask, 'id'>);
      const after = await service.getTasks();
      expect(after.length).toBe(before.length + 1);
      expect(after[0].title).toBe('Prepended');
    });

    it('should handle missing department gracefully', async () => {
      const task = await service.createTask({
        title: 'No Dept',
        description: '',
        frequency: 'Daily',
        assetId: 'X',
        nextDueDate: new Date(),
        estimatedHours: 1,
        status: 'Pending',
      } as Omit<PMTask, 'id'>);

      // Should use "General" prefix fallback
      expect(task.id).toMatch(/^PM-GEN-\d{4}$/);
    });
  });

  describe('updateTask()', () => {
    it('should update an existing task', async () => {
      const tasks = await service.getTasks();
      const original = tasks[0];
      const updated = await service.updateTask({ ...original, title: 'Updated Title' });
      expect(updated.title).toBe('Updated Title');
      expect(updated.updatedAt).toBeDefined();
    });

    it('should reject updating a non-existent task', async () => {
      const fakeTask = { id: 'PM-FAKE-9999', title: 'Ghost' } as PMTask;
      await expect(service.updateTask(fakeTask)).rejects.toThrow(/not found/);
    });
  });

  describe('deleteTask()', () => {
    it('should remove a task by ID', async () => {
      const tasks = await service.getTasks();
      const idToDelete = tasks[0].id;
      await service.deleteTask(idToDelete);
      const after = await service.getTasks();
      expect(after.find(t => t.id === idToDelete)).toBeUndefined();
    });

    it('should silently succeed if ID does not exist', async () => {
      await expect(service.deleteTask('PM-FAKE-0000')).resolves.toBeUndefined();
    });
  });

  // ── Templates ─────────────────────────────────────────────────────────────

  describe('Templates CRUD', () => {
    it('should start with empty templates', async () => {
      const templates = await service.getTemplates();
      expect(templates.length).toBe(0);
    });

    it('should create and retrieve a template', async () => {
      await service.createTemplate({ name: 'T1', department: 'Test', checklist: [{ text: 'Item 1' }] });
      const templates = await service.getTemplates();
      expect(templates.length).toBe(1);
      expect(templates[0].name).toBe('T1');
    });

    it('should delete a template by name + department', async () => {
      await service.createTemplate({ name: 'ToDelete', department: 'Facility', checklist: [] });
      await service.deleteTemplate('ToDelete', 'Facility');
      const templates = await service.getTemplates();
      expect(templates.find(t => t.name === 'ToDelete')).toBeUndefined();
    });

    it('should not delete templates from a different department', async () => {
      await service.createTemplate({ name: 'Keep', department: 'Test', checklist: [] });
      await service.deleteTemplate('Keep', 'Facility'); // wrong dept
      const templates = await service.getTemplates();
      expect(templates.find(t => t.name === 'Keep')).toBeDefined();
    });
  });

  // ── Auth / Users ──────────────────────────────────────────────────────────

  describe('verifyLogin()', () => {
    it('should return user for valid credentials', async () => {
      const user = await service.verifyLogin('MGR001', 'mgr123');
      expect(user).toBeTruthy();
      expect(user!.employeeId).toBe('MGR001');
      expect(user!.baseRole).toBe('manager');
    });

    it('should return null for wrong password', async () => {
      const user = await service.verifyLogin('MGR001', 'wrong');
      expect(user).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      const user = await service.verifyLogin('GHOST-999', 'any');
      expect(user).toBeNull();
    });

    it('should return null for empty credentials', async () => {
      const user = await service.verifyLogin('', '');
      expect(user).toBeNull();
    });

    it('should NOT expose password in returned user object', async () => {
      const user = await service.verifyLogin('MGR001', 'mgr123');
      expect((user as any).password).toBeUndefined();
    });
  });

  describe('getUser()', () => {
    it('should return user by ID', async () => {
      const user = await service.getUser('ENG-TST-1');
      expect(user).toBeDefined();
      expect(user!.name).toBe('Eng Test A');
    });

    it('should return undefined for non-existent user', async () => {
      const user = await service.getUser('NOBODY');
      expect(user).toBeUndefined();
    });

    it('should NOT expose password', async () => {
      const user = await service.getUser('MGR001');
      expect((user as any).password).toBeUndefined();
    });
  });

  describe('getAllUsers()', () => {
    it('should return all users', async () => {
      const users = await service.getAllUsers();
      expect(users.length).toBeGreaterThan(30);
    });

    it('should NOT expose any passwords', async () => {
      const users = await service.getAllUsers();
      for (const u of users) {
        expect((u as any).password).toBeUndefined();
      }
    });
  });

  describe('updateUser()', () => {
    it('should patch user fields', async () => {
      const updated = await service.updateUser('MGR001', { name: 'Patched Manager' });
      expect(updated.name).toBe('Patched Manager');

      const check = await service.getUser('MGR001');
      expect(check!.name).toBe('Patched Manager');
    });

    it('should reject patching non-existent user', async () => {
      await expect(
        service.updateUser('GHOST-999', { name: 'X' })
      ).rejects.toThrow(/not found/);
    });
  });

  // ── Audit Logs ────────────────────────────────────────────────────────────

  describe('getAuditLogs()', () => {
    it('should return logs for a manager', async () => {
      const logs = await service.getAuditLogs('MGR001', 'manager');
      expect(logs.length).toBe(5);
      expect(logs.some(l => l.type === 'security')).toBe(true);
      expect(logs.some(l => l.type === 'system')).toBe(true);
    });

    it('should return department-scoped logs for an engineer', async () => {
      const logs = await service.getAuditLogs('ENG-TST-1', 'engineer', 'Test');
      expect(logs.length).toBe(5);
      expect(logs.some(l => l.product.includes('Test'))).toBe(true);
    });

    it('should have valid structure for each log', async () => {
      const logs = await service.getAuditLogs('MGR001', 'manager');
      for (const log of logs) {
        expect(log.id).toBeTruthy();
        expect(log.timestamp).toBeInstanceOf(Date);
        expect(log.action).toBeTruthy();
        expect(log.actor).toBeDefined();
        expect(log.actor.name).toBeTruthy();
        expect(['security', 'system', 'data']).toContain(log.type);
      }
    });
  });
});
