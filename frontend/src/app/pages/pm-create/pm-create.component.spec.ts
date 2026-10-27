import { ChangeDetectorRef, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { PmCreateComponent } from './pm-create.component';
import { By } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { Asset, NewPmTypeDetail, PMTask, User } from '../../core/models/pm.model';

describe('PmCreateComponent - Checklist', () => {
  let component: PmCreateComponent;
  let fixture: ComponentFixture<PmCreateComponent>;
  let authService: AuthService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [PmCreateComponent, FormsModule],
      providers: [provideRouter([])],
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
      { text: 'Item 1', requiresPhoto: false, requiresValue: false },
      { text: 'Item 2', requiresPhoto: false, requiresValue: false },
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
    component.checklist.set([{ text: 'Task 1', requiresPhoto: false, requiresValue: false }, { text: 'Task 2', requiresPhoto: false, requiresValue: false }]);

    component.saveTemplate();

    expect(savedTemplate).toEqual({
      name: 'My Test Template',
      department: 'Test',
      checklist: [{ text: 'Task 1', requiresPhoto: false, requiresValue: false }, { text: 'Task 2', requiresPhoto: false, requiresValue: false }]
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
    component.selectDept('Facility', new Event('change'));
    expect(component.assetId).toBe('');
  });

  it('should auto-fill product and department when selecting an asset', () => {
    component.selectAsset('THC-P1-01', new Event('change'));
    expect(component.productId).toBe('CUST-001');
    expect(component.department).toBe('Test');
  });
});

// ── Ticket 05 — draft PM types and the machine link ───────────────────────
// Hand-written ApiService/AuthService doubles: nothing here logs in or reaches a backend.

@Component({ standalone: true, template: '' })
class BlankPageComponent {}

const asset = (over: Partial<Asset> & { id: string }): Asset => ({
  name: `Machine ${over.id}`, department: 'Mechanic', location: 'CUST-001', isActive: true, ...over
});
const task = (over: Partial<PMTask> & { id: string; assetId: string }): PMTask => ({
  title: `PM ${over.id}`, description: '', frequency: 'Monthly', nextDueDate: new Date(2026, 5, 1),
  estimatedHours: 1, status: 'Pending', productId: 'CUST-001', department: 'Mechanic', ...over
});
const user = (over: Partial<User> & { employeeId: string }): User => ({
  name: over.employeeId, initials: 'XX', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Mechanic',
  ownedProducts: ['CUST-001'], delegatedProducts: [], permissions: ['pm.create.submit'], ...over
});
const manager = user({ employeeId: 'MGR-1', baseRole: 'manager', roleLabel: 'Manager', permissions: ['pm.create.submit', 'pm.masterplan.approve'] });
const engineer = user({ employeeId: 'ENG-1', baseRole: 'engineer' });

// A: In plan (has a Weekly task). N: Not in plan. I: inactive, Not in plan. F: other department, In plan via a task.
// X: a customer the user cannot access.
const BACKEND_ASSETS = [
  asset({ id: 'A', name: 'Air Compressor' }),
  asset({ id: 'N', name: 'New Mill' }),
  asset({ id: 'I', name: 'Idle Press', isActive: false }),
  asset({ id: 'F', name: 'Facility Chiller', department: 'Facility' }),
  asset({ id: 'X', name: 'Far Lathe', location: 'CUST-009' }),
];
const BACKEND_TASKS = [
  task({ id: 'T1', assetId: 'A', frequency: 'Weekly' }),
  task({ id: 'T2', assetId: 'F', frequency: 'Monthly', department: 'Facility' }),
];
const ALL_IDS = BACKEND_ASSETS.map(a => a.id);

const DETAILS = {
  description: 'Replace belts and re-torque',
  estimatedHours: 3,
  parts: ['Drive Belt B-440'],
  checklist: [
    { text: 'Check belt tension', requiresPhoto: true, requiresValue: false },
    { text: 'Record motor temperature', requiresPhoto: false, requiresValue: true },
  ],
};

const DRAFT_SAVED_TOAST = 'PM type saved as a draft. Send the machine to the Master Plan when it is ready.';

async function render(options: { user?: User; url?: string } = {}) {
  const currentUser = options.user ?? manager;
  const api = {
    getAssets: vi.fn(async () => BACKEND_ASSETS.map(a => ({ ...a }))),
    getTasks: vi.fn(async () => BACKEND_TASKS.map(t => ({ ...t }))),
    getTemplates: vi.fn(async () => []),
    createAsset: vi.fn(async () => undefined),
    updateAsset: vi.fn(async () => ({}) as Asset),
    createProduct: vi.fn(async () => undefined),
    createTask: vi.fn(async (t: PMTask) => t),
    createSchedule: vi.fn(async () => undefined),
  };
  const auth = {
    currentUser: () => currentUser,
    hasPermission: (p: string) => currentUser.permissions.includes(p),
    getAccessibleProducts: () => ['CUST-001', 'CUST-002'],
    getUser: () => undefined,
    getAllUsers: () => [],
    init: async () => undefined,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: ApiService, useValue: api },
      { provide: AuthService, useValue: auth },
      provideRouter([
        { path: 'create', component: PmCreateComponent },
        { path: 'pm-machines', component: BlankPageComponent },
        { path: 'pm-approvals', component: BlankPageComponent },
        { path: 'dashboard', component: BlankPageComponent },
      ]),
    ]
  });
  const pm = TestBed.inject(PmService);
  await pm.loadData();

  const harness = await RouterTestingHarness.create();
  const component = await harness.navigateByUrl(options.url ?? '/create', PmCreateComponent);
  const host: HTMLElement = harness.routeNativeElement as HTMLElement;
  // The specs set plain component fields directly; Angular only re-renders a view that was marked dirty
  // (as a real event handler would), so mark the routed component before every check.
  const settle = async () => {
    harness.routeDebugElement?.injector.get(ChangeDetectorRef).markForCheck();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  await settle();
  return { harness, component, host, pm, api, settle, toast: TestBed.inject(ToastService), router: TestBed.inject(Router) };
}

const messagesOf = (toast: ToastService, type: 'success' | 'error' | 'warning' | 'info') =>
  toast.toasts().filter(t => t.type === type).map(t => t.message);

const previewValue = (host: HTMLElement, label: string) =>
  Array.from(host.querySelectorAll<HTMLElement>('.preview-row'))
    .find(r => r.querySelector('.preview-label')?.textContent?.trim().toLowerCase() === label)
    ?.querySelector('.preview-val')?.textContent?.trim();

const submitButton = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(b => /Create (Schedule|PM)/.test(b.textContent ?? ''))!;

const locationOf = (router: Router) => {
  const tree = router.parseUrl(router.url);
  return { path: router.url.split('?')[0], query: tree.queryParams };
};

const isoDay = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function fillDetails(component: PmCreateComponent, over: { pmType?: string; isRecurring?: boolean } = {}) {
  component.pmType = over.pmType ?? 'Monthly';
  component.isRecurring = over.isRecurring ?? true;
  component.description = DETAILS.description;
  component.estimatedHours = DETAILS.estimatedHours;
  component.parts.set([...DETAILS.parts]);
  component.checklist.set(DETAILS.checklist.map(i => ({ ...i })));
}

const expectedDetail = (title: string, startDate: string, isRecurring = true): NewPmTypeDetail => ({
  title,
  description: DETAILS.description,
  estimatedHours: DETAILS.estimatedHours,
  partsRequired: DETAILS.parts,
  checklist: DETAILS.checklist,
  startDate: new Date(startDate),
  isRecurring
});

// Nothing was written: no draft on any machine and no approval request.
const expectNothingSaved = (pm: PmService) => {
  for (const id of ALL_IDS) expect(pm.draftPmTypesFor(id)).toEqual([]);
  expect(pm.pendingMasterPlanChanges()).toEqual([]);
};

describe('PmCreateComponent — draft PM types and machine link', () => {
  describe('opening from a machine link', () => {
    it('preselects the customer, department and machine of a Not-in-plan machine', async () => {
      const { component, host } = await render({ url: '/create?machine=N' });

      expect(component.productId).toBe('CUST-001');
      expect(component.department).toBe('Mechanic');
      expect(component.assetId).toBe('N');
      expect(previewValue(host, 'product')).toBe('CUST-001');
      expect(previewValue(host, 'dept')).toBe('Mechanic');
      expect(previewValue(host, 'asset')).toBe('N');
    });

    it('shows an error and leaves the form empty for an unknown machine', async () => {
      const { component, host, toast } = await render({ url: '/create?machine=NOPE' });

      expect(messagesOf(toast, 'error')).toEqual(['Machine not found.']);
      expect(component.assetId).toBe('');
      expect(component.productId).toBe('');
      expect(component.department).toBe('');
      expect(previewValue(host, 'asset')).toBe('—');
    });

    it('refuses a machine of another department for an engineer', async () => {
      const { component, toast } = await render({ user: engineer, url: '/create?machine=F' });

      expect(messagesOf(toast, 'error')).toEqual(['You cannot create PM types for this machine.']);
      expect(component.assetId).toBe('');
      expect(component.productId).toBe('');
      expect(component.department).toBe('Mechanic');
    });

    it('preselects a machine of another department for a manager', async () => {
      const { component, toast } = await render({ user: manager, url: '/create?machine=F' });

      expect(messagesOf(toast, 'error')).toEqual([]);
      expect(component.productId).toBe('CUST-001');
      expect(component.department).toBe('Facility');
      expect(component.assetId).toBe('F');
    });

    it('refuses a machine at a customer the user cannot access', async () => {
      const { component, toast } = await render({ user: manager, url: '/create?machine=X' });

      expect(messagesOf(toast, 'error')).toEqual(['You cannot create PM types for this machine.']);
      expect(component.assetId).toBe('');
      expect(component.productId).toBe('');
      expect(component.department).toBe('');
    });

    it('refuses an inactive machine and asks for it to be reactivated', async () => {
      const { component, toast } = await render({ user: engineer, url: '/create?machine=I' });

      expect(messagesOf(toast, 'error')).toEqual(['Reactivate this machine before adding PM types.']);
      expect(component.assetId).toBe('');
      expect(component.productId).toBe('');
      expect(component.department).toBe('Mechanic');
    });
  });

  describe('machine picker', () => {
    it('offers Not-in-plan machines but not inactive ones', async () => {
      const { component } = await render();
      component.productId = 'CUST-001';
      component.department = 'Mechanic';

      const ids = component.availableAssets().map(a => a.id).sort();
      expect(ids).toEqual(['A', 'N']);
      expect(ids).not.toContain('I');
    });
  });

  describe('submitting on a Not-in-plan machine', () => {
    it('saves a draft with the entered details and creates no approval request, task or schedule', async () => {
      const { component, pm, api, toast, router, settle } = await render({ user: manager, url: '/create?machine=N' });
      fillDetails(component);
      const startDate = component.startDate;

      await component.submitForm();
      await settle();

      const drafts = pm.draftPmTypesFor('N');
      expect(drafts).toHaveLength(1);
      expect(drafts[0].frequency).toBe('Monthly');
      expect(drafts[0].detail).toEqual(expectedDetail('New Mill', startDate));
      expect(drafts[0].detail.startDate?.getTime()).toBe(new Date(startDate).getTime());
      expect(pm.pendingMasterPlanChanges()).toEqual([]);
      expect(api.createTask).not.toHaveBeenCalled();
      expect(api.createSchedule).not.toHaveBeenCalled();
      expect(messagesOf(toast, 'success')).toEqual([DRAFT_SAVED_TOAST]);
      expect(locationOf(router)).toEqual({ path: '/pm-machines', query: { machine: 'N' } });
    });

    it('keeps a One-time PM as not recurring', async () => {
      const { component, pm, settle } = await render({ user: engineer, url: '/create?machine=N' });
      fillDetails(component, { isRecurring: false });

      await component.submitForm();
      await settle();

      const drafts = pm.draftPmTypesFor('N');
      expect(drafts).toHaveLength(1);
      expect(drafts[0].detail.isRecurring).toBe(false);
    });
  });

  describe('submitting on an In-plan machine', () => {
    it('sends an approval request and goes to the approvals page for an approver', async () => {
      const { component, pm, toast, router, settle } = await render({ user: manager, url: '/create?machine=A' });
      fillDetails(component);
      const startDate = component.startDate;

      await component.submitForm();
      await settle();

      const pending = pm.pendingMasterPlanChanges().filter(c => c.assetId === 'A');
      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe('pending');
      expect(pending[0].proposedState.addPmTypes).toEqual(['Monthly']);
      expect(pending[0].proposedState.newPmTypeDetails).toEqual({ Monthly: expectedDetail('Air Compressor', startDate) });
      expect(pm.draftPmTypesFor('A')).toEqual([]);
      expect(messagesOf(toast, 'success')).toEqual(['Monthly PM for "Air Compressor" submitted for approval.']);
      expect(locationOf(router).path).toBe('/pm-approvals');
    });

    it('sends the same request and goes to the dashboard for an engineer', async () => {
      const { component, pm, router, settle } = await render({ user: engineer, url: '/create?machine=A' });
      fillDetails(component);

      await component.submitForm();
      await settle();

      const pending = pm.pendingMasterPlanChanges().filter(c => c.assetId === 'A');
      expect(pending).toHaveLength(1);
      expect(pending[0].proposedState.addPmTypes).toEqual(['Monthly']);
      expect(pm.draftPmTypesFor('A')).toEqual([]);
      expect(locationOf(router).path).toBe('/dashboard');
    });
  });

  describe('duplicate PM types', () => {
    const draftMonthly = (pm: PmService) => pm.addDraftPmType('N', 'Monthly', { title: 'New Mill' });

    it('counts an existing draft, including its Custom alias, but not another frequency', async () => {
      const { component, pm, settle } = await render({ url: '/create?machine=N' });
      draftMonthly(pm);
      await settle();

      component.pmType = 'Monthly';
      expect(component.isDuplicatePm()).toBe(true);

      component.pmType = 'Custom';
      component.customDurationValue = 1;
      component.customDurationUnit = 'Month(s)';
      expect(component.isDuplicatePm()).toBe(true);

      component.pmType = 'Weekly';
      expect(component.isDuplicatePm()).toBe(false);
    });

    it('warns, disables the submit button and refuses to add a second draft', async () => {
      const { component, host, pm, toast, settle } = await render({ url: '/create?machine=N' });
      draftMonthly(pm);
      fillDetails(component);
      await settle();

      expect(host.textContent).toContain('This asset already has a PM of this type');
      expect(submitButton(host).disabled).toBe(true);

      await component.submitForm();

      expect(messagesOf(toast, 'error').some(m => m.includes('already has a Monthly PM'))).toBe(true);
      expect(pm.draftPmTypesFor('N')).toHaveLength(1);

      component.pmType = 'Weekly';
      await settle();
      expect(host.textContent).not.toContain('This asset already has a PM of this type');
      expect(submitButton(host).disabled).toBe(false);
    });

    it('counts a real task on an In-plan machine and refuses to request it again', async () => {
      const { component, host, pm, toast, settle } = await render({ url: '/create?machine=A' });
      fillDetails(component, { pmType: 'Weekly' });
      await settle();

      expect(component.isDuplicatePm()).toBe(true);
      expect(host.textContent).toContain('This asset already has a PM of this type');
      expect(submitButton(host).disabled).toBe(true);

      component.pmType = 'Custom';
      component.customDurationValue = 7;
      component.customDurationUnit = 'Day(s)';
      expect(component.isDuplicatePm()).toBe(true);

      component.pmType = 'Weekly';
      await component.submitForm();

      expect(messagesOf(toast, 'error').some(m => m.includes('already has a Weekly PM'))).toBe(true);
      expectNothingSaved(pm);
    });

    it('leaves exactly one draft when submit is triggered twice back to back', async () => {
      const { component, pm, toast } = await render({ url: '/create?machine=N' });
      fillDetails(component);

      await Promise.all([component.submitForm(), component.submitForm()]);

      expect(pm.draftPmTypesFor('N')).toHaveLength(1);
      expect(messagesOf(toast, 'success')).toEqual([DRAFT_SAVED_TOAST]);
      expect(pm.pendingMasterPlanChanges()).toEqual([]);
    });
  });

  describe('validation', () => {
    it('rejects a form with missing required fields', async () => {
      const { component, pm, toast } = await render({ url: '/create' });
      fillDetails(component);

      await component.submitForm();

      expect(messagesOf(toast, 'error').some(m => m.includes('Please fill out all required fields'))).toBe(true);
      expect(messagesOf(toast, 'success')).toEqual([]);
      expectNothingSaved(pm);
    });

    it('rejects a start date in the past', async () => {
      const { component, pm, toast } = await render({ url: '/create?machine=N' });
      fillDetails(component);
      component.startDate = isoDay(-1);

      await component.submitForm();

      expect(messagesOf(toast, 'error')).toEqual(['Start date cannot be in the past.']);
      expect(messagesOf(toast, 'success')).toEqual([]);
      expectNothingSaved(pm);
    });

    it('rejects a custom duration of 0', async () => {
      const { component, pm, toast } = await render({ url: '/create?machine=N' });
      fillDetails(component, { pmType: 'Custom' });
      component.customDurationValue = 0;

      await component.submitForm();

      expect(messagesOf(toast, 'error')).toEqual(['Custom duration must be a positive number.']);
      expect(messagesOf(toast, 'success')).toEqual([]);
      expectNothingSaved(pm);
    });
  });

  describe('service refusal', () => {
    it('shows the service message, saves nothing and frees the submit button', async () => {
      const { component, host, pm, toast, settle } = await render({ url: '/create?machine=N' });
      fillDetails(component);
      await pm.setMachineActive('N', false);

      await component.submitForm();
      await settle();

      expect(messagesOf(toast, 'error')).toEqual(['Reactivate this machine before adding PM types.']);
      expect(messagesOf(toast, 'success')).toEqual([]);
      expect(pm.draftPmTypesFor('N')).toEqual([]);
      expect(component.isGenerating()).toBe(false);
      expect(submitButton(host).disabled).toBe(false);
    });
  });
});
