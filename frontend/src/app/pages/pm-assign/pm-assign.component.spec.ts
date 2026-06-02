import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PmAssignComponent } from './pm-assign.component';
import { By } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { PmService } from '../../core/services/pm.service';

describe('PmAssignComponent', () => {
  let component: PmAssignComponent;
  let fixture: ComponentFixture<PmAssignComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PmAssignComponent, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(PmAssignComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should switch tabs correctly', () => {
    // Default tab should be 'unassigned'
    expect(component.activeTab).toBe('unassigned');

    // Find the Assigned PMs tab button and click it
    const tabButtons = fixture.debugElement.queryAll(By.css('.tab-btn'));
    const assignedTabBtn = tabButtons.find(btn => btn.nativeElement.textContent.trim() === 'Assigned PMs');
    
    assignedTabBtn?.nativeElement.click();
    fixture.detectChanges();

    expect(component.activeTab).toBe('assigned');
    expect(assignedTabBtn?.classes['active']).toBe(true);
  });

  it('should filter pending tasks by selected department', () => {
    // Add mock tasks to PmService
    const pmService = TestBed.inject(PmService);
    (pmService as any).pmTasksSignal.set([
      { id: 'PM-1', title: 'Task 1', department: 'Facility', status: 'Pending', nextDueDate: new Date() } as any,
      { id: 'PM-2', title: 'Task 2', department: 'Mechanic', status: 'Pending', nextDueDate: new Date() } as any,
    ]);
    fixture.detectChanges();

    // Initially all pending tasks are shown
    expect(component.pendingTasks().length).toBe(2);

    // Set filter to Facility
    component.deptFilter.set('Facility');
    fixture.detectChanges();

    expect(component.pendingTasks().length).toBe(1);
    expect(component.pendingTasks()[0].department).toBe('Facility');
  });

  it('should allow bulk assigning tasks to a technician and clear selection', () => {
    const pmService = TestBed.inject(PmService);
    (pmService as any).pmTasksSignal.set([
      { id: 'PM-1', title: 'Task 1', status: 'Pending', nextDueDate: new Date() } as any,
      { id: 'PM-2', title: 'Task 2', status: 'Pending', nextDueDate: new Date() } as any,
      { id: 'PM-3', title: 'Task 3', status: 'Pending', nextDueDate: new Date() } as any,
    ]);
    fixture.detectChanges();

    // Select first and third tasks
    component.selectedTasks.update(set => {
      set.add('PM-1');
      set.add('PM-3');
      return new Set(set);
    });
    
    // Choose technician for bulk
    component.bulkAssignee.set('J. Doe');
    
    // Attempt bulk assign, should open modal
    component.openBulkAssignModal();
    expect(component.showBulkModal()).toBe(true);
    
    // Confirm bulk assignment
    component.confirmBulkAssign();
    
    // Verify tasks were assigned via service
    const tasks = pmService.pmTasks();
    const pm1 = tasks.find(t => t.id === 'PM-1');
    const pm2 = tasks.find(t => t.id === 'PM-2');
    const pm3 = tasks.find(t => t.id === 'PM-3');

    expect(pm1?.status).toBe('In Progress');
    expect(pm1?.assignedTo).toBe('J. Doe');
    
    expect(pm3?.status).toBe('In Progress');
    expect(pm3?.assignedTo).toBe('J. Doe');

    // PM-2 shouldn't be affected
    expect(pm2?.status).toBe('Pending');
    expect(pm2?.assignedTo).toBeUndefined();

    // Modal should close and selection should clear
    expect(component.showBulkModal()).toBe(false);
    expect(component.selectedTasks().size).toBe(0);
    expect(component.bulkAssignee()).toBe('');
  });

  it('should create a single delegation row with multiple products and allow revoking', () => {
    // Initial state
    expect(component.delegations().length).toBe(0);

    // Grant a delegation with multiple users and multiple products
    component.newDelegationUsers.set(['J. Doe', 'S. Miller']);
    component.newDelegationProducts.set(['Product A', 'Product B']);
    component.newDelegationDuration.set(30);

    component.grantDelegation();

    // Since we selected 2 users, there should be exactly 2 delegation rows (one per user)
    // Each row should contain both products.
    expect(component.delegations().length).toBe(2);
    
    const delegation1 = component.delegations().find(d => d.user === 'J. Doe');
    expect(delegation1.products.length).toBe(2);
    expect(delegation1.products).toContain('Product A');
    expect(delegation1.products).toContain('Product B');

    // Revoke the delegation
    component.revokeDelegation(delegation1.id);
    expect(component.delegations().length).toBe(1);
  });

  it('should close other dropdowns when opening a new one', () => {
    // Open user dropdown
    component.delegationUserDropdownOpen = true;
    expect(component.delegationUserDropdownOpen).toBe(true);

    // Toggle product dropdown
    const event = new MouseEvent('click');
    component.toggleDropdown('delegationProduct', event);

    // Product should be open, user should be closed
    expect(component.delegationProductDropdownOpen).toBe(true);
    expect(component.delegationUserDropdownOpen).toBe(false);
  });
});
