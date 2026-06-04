import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PmCreateComponent } from './pm-create.component';
import { By } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { PmService } from '../../core/services/pm.service';

describe('PmCreateComponent - Checklist', () => {
  let component: PmCreateComponent;
  let fixture: ComponentFixture<PmCreateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PmCreateComponent, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(PmCreateComponent);
    component = fixture.componentInstance;
    
    // Clear checklist for testing
    component.checklist.set([]);
    fixture.detectChanges();
  });

  it('should add a new item to the checklist when add button is clicked', async () => {
    const checklistCard = fixture.debugElement.queryAll(By.css('.card'))[1];
    
    const inputDebug = checklistCard.query(By.css('input[placeholder="New item..."]'));
    const inputElement = inputDebug.nativeElement as HTMLInputElement;

    // Type a new item
    inputElement.value = 'Test Checklist Item';
    inputElement.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    // Click the add button
    const addButtonDebug = checklistCard.query(By.css('button.btn-ghost'));
    addButtonDebug.nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    // Verify the checklist state
    expect(component.checklist().length).toBe(1);
    expect(component.checklist()[0].text).toBe('Test Checklist Item');

    // Verify UI reflects the change
    const checklistItems = checklistCard.queryAll(By.css('.checklist-item input'));
    expect(checklistItems.length).toBe(1);
    expect((checklistItems[0].nativeElement as HTMLInputElement).value).toBe('Test Checklist Item');
  });

  it('should save a template via PmService', () => {
    const pmService = TestBed.inject(PmService);
    let savedTemplate: any = null;
    (pmService as any).saveTemplate = (tpl: any) => { savedTemplate = tpl; };
    
    component.newTemplateName = 'My Test Template';
    component.department = 'Test Dept';
    component.checklist.set([{ text: 'Task 1', requiresPhoto: false }, { text: 'Task 2', requiresPhoto: false }]);
    
    component.saveTemplate();
    
    expect(savedTemplate).toEqual({
      name: 'My Test Template',
      department: 'Test Dept',
      checklist: [{ text: 'Task 1', requiresPhoto: false }, { text: 'Task 2', requiresPhoto: false }]
    });
  });

  it('should allow typing a custom part and adding it', async () => {
    const partsCard = fixture.debugElement.queryAll(By.css('.card'))[2];
    const inputDebug = partsCard.query(By.css('input[placeholder="Select or type part..."]'));
    const inputElement = inputDebug.nativeElement as HTMLInputElement;

    inputElement.value = 'Custom Bolt 5mm';
    inputElement.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    const addButtonDebug = partsCard.query(By.css('button.btn-ghost'));
    addButtonDebug.nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.parts().length).toBe(1);
    expect(component.parts()[0]).toBe('Custom Bolt 5mm');
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

  it('should open template dropdown and not be closed immediately by document click', async () => {
    // Override templates for this test so we can see the menu
    (component as any).templates = () => [{ name: 'T1', department: 'D', checklist: [] }];
    fixture.detectChanges();
    
    const dropdown = fixture.debugElement.query(By.css('.card .c-dropdown'));
    
    // Simulate a click on the dropdown that bubbles up to the document
    dropdown.nativeElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    // The dropdown should be open
    expect(component.dropdownOpen).toBe(true);
  });
});
