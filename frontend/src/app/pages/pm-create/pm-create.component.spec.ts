import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PmCreateComponent } from './pm-create.component';
import { By } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';

describe('PmCreateComponent - Checklist', () => {
  let component: PmCreateComponent;
  let fixture: ComponentFixture<PmCreateComponent>;
  let authService: AuthService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [PmCreateComponent, FormsModule],
    }).compileComponents();

    authService = TestBed.inject(AuthService);
    await authService.login('ENG-TST-1', 'eng123');

    fixture = TestBed.createComponent(PmCreateComponent);
    component = fixture.componentInstance;

    component.checklist.set([]);
    fixture.detectChanges();
  });

  afterEach(() => {
    authService.logout();
    localStorage.clear();
  });

  it('should add a new item to the checklist via component method', () => {
    component.newChecklistItem = 'Test Checklist Item';
    component.addChecklistItem();

    expect(component.checklist().length).toBe(1);
    expect(component.checklist()[0].text).toBe('Test Checklist Item');
  });

  it('should not add empty checklist items', () => {
    component.newChecklistItem = '';
    component.addChecklistItem();
    expect(component.checklist().length).toBe(0);

    component.newChecklistItem = '   ';
    component.addChecklistItem();
    expect(component.checklist().length).toBe(0);
  });

  it('should remove a checklist item', () => {
    component.checklist.set([
      { text: 'Item 1', requiresPhoto: false },
      { text: 'Item 2', requiresPhoto: false },
    ]);

    component.removeChecklistItem(0);
    expect(component.checklist().length).toBe(1);
    expect(component.checklist()[0].text).toBe('Item 2');
  });

  it('should save a template via PmService', () => {
    const pmService = TestBed.inject(PmService);
    let savedTemplate: any = null;
    (pmService as any).saveTemplate = (tpl: any) => { savedTemplate = tpl; };

    component.newTemplateName = 'My Test Template';
    component.department = 'Test';
    component.checklist.set([{ text: 'Task 1', requiresPhoto: false }, { text: 'Task 2', requiresPhoto: false }]);

    component.saveTemplate();

    expect(savedTemplate).toEqual({
      name: 'My Test Template',
      department: 'Test',
      checklist: [{ text: 'Task 1', requiresPhoto: false }, { text: 'Task 2', requiresPhoto: false }]
    });
  });

  it('should add a custom part', () => {
    component.selectedPart = 'Custom Bolt 5mm';
    component.addPart();

    expect(component.parts().length).toBe(1);
    expect(component.parts()[0]).toBe('Custom Bolt 5mm');
  });

  it('should not add empty parts', () => {
    component.selectedPart = '';
    component.addPart();
    expect(component.parts().length).toBe(0);
  });

  it('should not add duplicate parts', () => {
    component.selectedPart = 'Bearing Assembly 6205';
    component.addPart();
    component.selectedPart = 'Bearing Assembly 6205';
    component.addPart();
    expect(component.parts().length).toBe(1);
  });

  it('should auto-calculate nextDueDate and save PM task with checklist and parts', () => {
    const pmService = TestBed.inject(PmService);
    let savedTask: any = null;
    (pmService as any).addPmTask = (task: any) => { savedTask = task; };

    let navigatedTo: any = null;
    (component as any).router = { navigate: (path: any[]) => { navigatedTo = path; } };

    component.productId = 'CUST-001';
    component.department = 'Test';
    component.assetId = 'THC-P1-01';
    component.pmType = 'Weekly';

    component.checklist.set([{ text: 'Task A', requiresPhoto: false }]);
    component.parts.set(['Part A']);

    component.submitForm();

    expect(savedTask).toBeTruthy();
    expect(savedTask.productId).toBe('CUST-001');
    expect(savedTask.frequency).toBe('Weekly');
    expect(savedTask.checklist[0].text).toBe('Task A');
    expect(savedTask.partsRequired).toEqual(['Part A']);

    // Check due date logic (+7 days for Weekly)
    const today = new Date();
    const diffTime = savedTask.nextDueDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
    expect(diffDays).toBe(7);

    expect(navigatedTo).toEqual(['/pm-assign']);
  });

  it('should not submit without required fields', () => {
    const pmService = TestBed.inject(PmService);
    let savedTask: any = null;
    (pmService as any).addPmTask = (task: any) => { savedTask = task; };

    // Missing productId, department, assetId
    component.submitForm();
    expect(savedTask).toBeNull();
  });

  it('should reject submission with mismatched asset-product', () => {
    const pmService = TestBed.inject(PmService);
    let savedTask: any = null;
    (pmService as any).addPmTask = (task: any) => { savedTask = task; };

    // THC-P1-01 belongs to CUST-001 Test, setting CUST-002 should fail
    component.productId = 'CUST-002';
    component.department = 'Test';
    component.assetId = 'THC-P1-01';
    component.pmType = 'Weekly';

    // Mock alert to prevent actual popup
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    component.submitForm();

    expect(savedTask).toBeNull();
  });

  it('should filter available assets by selected product and department', () => {
    component.productId = 'CUST-001';
    component.department = 'Test';

    const assets = component.availableAssets();
    expect(assets.length).toBeGreaterThan(0);
    for (const a of assets) {
      expect(a.location).toBe('CUST-001');
      expect(a.department).toBe('Test');
    }
  });

  it('should clear asset when switching department if asset does not match', () => {
    component.assetId = 'THC-P1-01'; // Test dept
    component.selectDept('Facility');
    expect(component.assetId).toBe('');
  });

  it('should auto-fill product and department when selecting an asset', () => {
    component.selectAsset('THC-P1-01');
    expect(component.productId).toBe('CUST-001');
    expect(component.department).toBe('Test');
  });
});
