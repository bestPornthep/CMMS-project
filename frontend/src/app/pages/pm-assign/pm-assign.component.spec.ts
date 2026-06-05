import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PmAssignComponent } from './pm-assign.component';
import { By } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';

const flush = () => new Promise(r => setTimeout(r, 0));

describe('PmAssignComponent', () => {
  let component: PmAssignComponent;
  let fixture: ComponentFixture<PmAssignComponent>;
  let authService: AuthService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [PmAssignComponent, FormsModule],
    }).compileComponents();

    authService = TestBed.inject(AuthService);
    await authService.login('MGR001', 'mgr123');
    await flush(); // allow usersCache to populate

    fixture = TestBed.createComponent(PmAssignComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    authService.logout();
    localStorage.clear();
  });

  it('should switch tabs correctly', () => {
    expect(component.activeTab).toBe('unassigned');

    const tabButtons = fixture.debugElement.queryAll(By.css('.tab-btn'));
    const assignedTabBtn = tabButtons.find(btn => btn.nativeElement.textContent.trim() === 'Assigned PMs');

    assignedTabBtn?.nativeElement.click();
    fixture.detectChanges();

    expect(component.activeTab).toBe('assigned');
    expect(assignedTabBtn?.classes['active']).toBe(true);
  });

  it('should filter pending tasks by selected department', () => {
    const pmService = TestBed.inject(PmService);
    (pmService as any).pmTasksSignal.set([
      { id: 'PM-1', title: 'Task 1', department: 'Facility', status: 'Pending', productId: 'CUST-001', frequency: 'Weekly', nextDueDate: new Date(), assetId: 'CH-P1-01' } as any,
      { id: 'PM-2', title: 'Task 2', department: 'Mechanic', status: 'Pending', productId: 'CUST-001', frequency: 'Monthly', nextDueDate: new Date(), assetId: 'CM-P1-01' } as any,
    ]);
    fixture.detectChanges();

    expect(component.pendingTasks().length).toBe(2);

    component.deptFilter.set('Facility');
    fixture.detectChanges();

    expect(component.pendingTasks().length).toBe(1);
    expect(component.pendingTasks()[0].department).toBe('Facility');
  });

  it('should allow bulk assigning tasks to a technician and clear selection', async () => {
    const pmService = TestBed.inject(PmService);

    // Use REAL pending tasks from seed data (they exist in ApiService too)
    const pending = pmService.pmTasks().filter(t => t.status === 'Pending');
    expect(pending.length).toBeGreaterThanOrEqual(2);

    const taskId1 = pending[0].id;
    const taskId2 = pending[1].id;

    component.selectedTasks.update(set => {
      set.add(taskId1);
      set.add(taskId2);
      return new Set(set);
    });

    const techUser = authService.getUser('TECH-TST-1');
    component.bulkAssignee.set(techUser);

    component.openBulkAssignModal();
    expect(component.showBulkModal()).toBe(true);

    component.confirmBulkAssign();
    await flush();

    const tasks = pmService.pmTasks();
    const t1 = tasks.find(t => t.id === taskId1);
    const t2 = tasks.find(t => t.id === taskId2);

    expect(t1?.status).toBe('In Progress');
    expect(t1?.assignedTo).toBe('TECH-TST-1');
    expect(t2?.status).toBe('In Progress');

    expect(component.showBulkModal()).toBe(false);
    expect(component.selectedTasks().size).toBe(0);
  });

  it('should create delegations and allow revoking', async () => {
    await flush(); // ensure usersCache is populated

    expect(component.delegations().length).toBe(0);

    component.newDelegationUsers.set(['TECH-TST-1', 'TECH-TST-2']);
    component.newDelegationProducts.set(['CUST-001', 'CUST-002']);
    component.newDelegationDuration.set(30);

    component.grantDelegation();

    // 2 users = 2 rows (after the composite key fix)
    expect(component.delegations().length).toBe(2);

    const delegation1 = component.delegations().find(d => d.employeeId === 'TECH-TST-1');
    expect(delegation1).toBeTruthy();
    expect(delegation1!.products.length).toBe(2);
    expect(delegation1!.products).toContain('CUST-001');
    expect(delegation1!.products).toContain('CUST-002');

    component.revokeDelegation(delegation1!.id);
    const after = component.delegations();
    // Only TECH-TST-1's delegation should be revoked, TECH-TST-2 still active
    expect(after.find(d => d.employeeId === 'TECH-TST-1')).toBeUndefined();
  });

  it('should close other dropdowns when opening a new one', () => {
    component.delegationUserDropdownOpen = true;
    expect(component.delegationUserDropdownOpen).toBe(true);

    const event = new MouseEvent('click');
    component.toggleDropdown('delegationProduct', event);

    expect(component.delegationProductDropdownOpen).toBe(true);
    expect(component.delegationUserDropdownOpen).toBe(false);
  });
});
