import { Component, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { PmMachinesComponent } from './pm-machines.component';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { Asset, NewPmTypeDetail, PMTask, User } from '../../core/models/pm.model';

// ── Test doubles ──────────────────────────────────────────────────────────

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
const manager = user({ employeeId: 'MGR-1', name: 'Mia Manager', baseRole: 'manager', roleLabel: 'Manager', permissions: ['pm.create.submit', 'pm.masterplan.approve'] });
const engineer = user({ employeeId: 'ENG-1', name: 'Eddie Engineer', baseRole: 'engineer' });
const otherEngineer = user({ employeeId: 'ENG-2', name: 'Erin Engineer', baseRole: 'engineer' });
const technician = user({ employeeId: 'TECH-1', name: 'Tom Technician', baseRole: 'technician', roleLabel: 'Technician', permissions: [] });
const KNOWN_USERS = [manager, engineer, otherEngineer, technician];

const BACKEND_ASSETS = [
  asset({ id: 'A', name: 'Air Compressor', workCenter: 'WC-A' }),
  asset({ id: 'N', name: 'New Mill', workCenter: 'WC-N' }),
  asset({ id: 'F', name: 'Facility Chiller', department: 'Facility' }),
];
const BACKEND_TASKS = [
  task({ id: 'T1', assetId: 'A', frequency: 'Weekly', title: 'Weekly compressor check', scheduleId: 'S-1', estimatedHours: 0.5, partsRequired: ['Filter'],
    checklist: [{ text: 'Check oil level', done: false, requiresPhoto: true }] }),
  task({ id: 'T2', assetId: 'F', frequency: 'Monthly' }),
];

@Component({ selector: 'app-pm-create-stub', template: '' })
class PmCreateStubComponent {}

async function render(options: { user?: User; url?: string } = {}) {
  // A signal, like the real AuthService, so a user switch refreshes the page (the app is zoneless).
  const userSignal = signal<User>(options.user ?? manager);
  const setUser = (u: User) => userSignal.set(u);
  const backend = { assets: BACKEND_ASSETS.map(a => ({ ...a })), tasks: BACKEND_TASKS.map(t => ({ ...t })) };
  const api = {
    getAssets: vi.fn(async () => backend.assets.map(a => ({ ...a }))),
    getTasks: vi.fn(async () => backend.tasks.map(t => ({ ...t }))),
    getTemplates: vi.fn(async () => []),
    createAsset: vi.fn(async () => undefined),
    updateAsset: vi.fn(async () => ({}) as Asset),
    createProduct: vi.fn(async () => undefined),
  };
  const auth = {
    currentUser: () => userSignal(),
    hasPermission: (p: string) => userSignal().permissions.includes(p),
    getAccessibleProducts: () => ['CUST-001', 'CUST-002'],
    getUser: (id: string) => KNOWN_USERS.find(u => u.employeeId === id),
    getAllUsers: () => [],
    init: async () => undefined,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: ApiService, useValue: api },
      { provide: AuthService, useValue: auth },
      provideRouter([
        { path: 'machines', component: PmMachinesComponent },
        { path: 'pm-create', component: PmCreateStubComponent },
      ]),
    ]
  });
  const pm = TestBed.inject(PmService);
  await pm.loadData();

  const harness = await RouterTestingHarness.create();
  const component = await harness.navigateByUrl(options.url ?? '/machines', PmMachinesComponent);
  const host: HTMLElement = harness.routeNativeElement as HTMLElement;
  const settle = async () => { harness.detectChanges(); await harness.fixture.whenStable(); harness.detectChanges(); };
  await settle();
  return { harness, component, host, pm, api, backend, settle, setUser, toast: TestBed.inject(ToastService) };
}

const rowOf = (host: HTMLElement, id: string) =>
  Array.from(host.querySelectorAll<HTMLElement>('tr.machine-row')).find(r => r.textContent?.includes(id))!;
const dialog = (host: HTMLElement) => host.querySelector<HTMLElement>('.detail-modal')!;
const isOpen = (host: HTMLElement) => dialog(host).classList.contains('open');
const buttonIn = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll<HTMLElement>('button')).find(b => b.textContent?.trim() === text)!;

// ── Ticket 04 — machine detail window ─────────────────────────────────────

describe('PmMachinesComponent — machine detail window', () => {
  it('opens a labelled dialog for the clicked machine', async () => {
    const { host, settle } = await render();
    rowOf(host, 'A').click();
    await settle();

    expect(isOpen(host)).toBe(true);
    expect(dialog(host).getAttribute('role')).toBe('dialog');
    const labelId = dialog(host).getAttribute('aria-labelledby')!;
    expect(host.querySelector(`#${labelId}`)?.textContent).toContain('Air Compressor');
    expect(dialog(host).textContent).toContain('CUST-001');
    expect(dialog(host).textContent).toContain('WC-A');
  });

  it('shows the plan and active status badges', async () => {
    const { host, settle } = await render();
    rowOf(host, 'A').click();
    await settle();
    const badges = host.querySelector('.detail-badges')!.textContent!;
    expect(badges).toContain('Active');
    expect(badges).toContain('In plan');
  });

  it('does not open when a row action button is clicked', async () => {
    const { host, settle } = await render();
    buttonIn(rowOf(host, 'A'), 'Edit').click();
    await settle();
    expect(isOpen(host)).toBe(false);
    expect(host.querySelector('tr.edit-row')).not.toBeNull();
  });

  it('does not open when clicking inside a row that is being edited', async () => {
    const { host, settle } = await render();
    buttonIn(rowOf(host, 'A'), 'Edit').click();
    await settle();
    host.querySelector<HTMLElement>('tr.edit-row input')!.click();
    await settle();
    expect(isOpen(host)).toBe(false);
  });

  it('lists the PM types of an In-plan machine with their details', async () => {
    const { host, settle } = await render();
    rowOf(host, 'A').click();
    await settle();

    const text = dialog(host).textContent!;
    expect(text).toContain('PM Types (1)');
    expect(text).toContain('Weekly');
    expect(text).toContain('Weekly compressor check');
    expect(text).toContain('Recurring');
    expect(text).toContain('Filter');
    expect(text).toContain('Checklist (1 items)');
    expect(text).not.toContain('Check oil level'); // the checklist starts collapsed
  });

  it('expands and collapses a checklist', async () => {
    const { host, settle } = await render();
    rowOf(host, 'A').click();
    await settle();

    const toggle = host.querySelector<HTMLElement>('.checklist-toggle')!;
    toggle.click();
    await settle();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(dialog(host).textContent).toContain('Check oil level');
    expect(dialog(host).textContent).toContain('Photo required');

    toggle.click();
    await settle();
    expect(dialog(host).textContent).not.toContain('Check oil level');
  });

  it('shows a friendly empty state for a Not-in-plan machine with no PM types', async () => {
    const { host, settle } = await render();
    rowOf(host, 'N').click();
    await settle();
    expect(dialog(host).textContent).toContain('Not in plan');
    expect(dialog(host).textContent).toContain('PM Types (0)');
    expect(dialog(host).textContent).toContain('No PM types yet. Add one, then send this machine to the Master Plan.');
  });

  it('closes with the Close button, the overlay and Escape', async () => {
    const { host, settle } = await render();

    rowOf(host, 'A').click();
    await settle();
    buttonIn(dialog(host), 'Close').click();
    await settle();
    expect(isOpen(host)).toBe(false);

    rowOf(host, 'A').click();
    await settle();
    host.querySelector<HTMLElement>('.modal-overlay.open')!.click();
    await settle();
    expect(isOpen(host)).toBe(false);

    rowOf(host, 'A').click();
    await settle();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(isOpen(host)).toBe(false);
  });

  it('moves focus into the dialog and back to the row when it closes', async () => {
    const { host, settle } = await render();
    const row = rowOf(host, 'A');
    row.click();
    await settle();
    await Promise.resolve();
    expect(document.activeElement).toBe(dialog(host));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    await Promise.resolve();
    expect(document.activeElement).toBe(row);
  });

  it('opens from the keyboard with Enter on a focused row, but not Enter on a button inside it', async () => {
    const { host, settle } = await render();
    const row = rowOf(host, 'A');
    buttonIn(row, 'Edit').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(isOpen(host)).toBe(false);

    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(isOpen(host)).toBe(true);
  });

  it('closes by itself when the machine disappears while it is open', async () => {
    const { host, settle, pm, backend } = await render();
    rowOf(host, 'A').click();
    await settle();
    expect(isOpen(host)).toBe(true);

    backend.assets = backend.assets.filter(a => a.id !== 'A');
    await pm.loadData();
    await settle();

    expect(isOpen(host)).toBe(false);
  });

  describe('opening from a link', () => {
    it('opens the named machine and removes the parameter from the address', async () => {
      const { host, settle } = await render({ url: '/machines?machine=A' });
      await settle();
      expect(isOpen(host)).toBe(true);
      expect(host.querySelector('#machine-detail-title')?.textContent).toContain('Air Compressor');
      expect(TestBed.inject(Router).url).not.toContain('machine=');
    });

    it('shows an error and opens nothing for an unknown machine', async () => {
      const { host, settle, toast } = await render({ url: '/machines?machine=NOPE' });
      await settle();
      expect(isOpen(host)).toBe(false);
      expect(toast.toasts().some(t => t.type === 'error' && t.message.includes('Machine not found'))).toBe(true);
    });

    it('treats a machine from another department as unknown for an engineer', async () => {
      const { host, settle, toast } = await render({ user: engineer, url: '/machines?machine=F' });
      await settle();
      expect(isOpen(host)).toBe(false);
      expect(toast.toasts().some(t => t.type === 'error')).toBe(true);
    });
  });
});

// ── Ticket 05 — draft PM types ────────────────────────────────────────────

const WEEKLY_DRAFT: NewPmTypeDetail = {
  title: 'Weekly spindle check', description: 'Check spindle runout', estimatedHours: 0.5, partsRequired: ['Grease'],
  checklist: [{ text: 'Wipe spindle', requiresPhoto: true }, { text: 'Log runout', requiresValue: true }],
  startDate: new Date(2026, 6, 6), isRecurring: true
};
const MONTHLY_DRAFT: NewPmTypeDetail = {
  title: 'Monthly coolant change', estimatedHours: 2, partsRequired: ['Coolant', 'Filter'],
  checklist: [{ text: 'Drain tank' }], startDate: new Date(2026, 6, 1), isRecurring: false
};
// Added Monthly first on purpose: the detail window must still order Weekly before Monthly.
const addTwoDrafts = (pm: PmService) => {
  pm.addDraftPmType('N', 'Monthly', MONTHLY_DRAFT);
  pm.addDraftPmType('N', 'Weekly', WEEKLY_DRAFT);
};

const pmTypeBlocks = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLElement>('.pm-type-block'));
const frequencyTags = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('.pm-type-block .freq-tag')).map(e => e.textContent?.trim());
const fieldOf = (block: HTMLElement, label: string) =>
  Array.from(block.querySelectorAll('tr')).find(r => r.children[0]?.textContent?.trim() === label)?.children[1]?.textContent?.trim();

const addPmTypeButton = (host: HTMLElement) =>
  Array.from(dialog(host).querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes('Add PM type'))!;

const removeModal = (host: HTMLElement) => host.querySelector<HTMLElement>('.confirm-modal.open');
const removeOption = (host: HTMLElement, frequency: string) =>
  Array.from(removeModal(host)!.querySelectorAll('label')).find(l => l.textContent?.trim() === frequency)?.querySelector('input');
const removeOptionLabels = (host: HTMLElement) =>
  Array.from(removeModal(host)!.querySelectorAll('label')).map(l => l.textContent?.trim());
const confirmRemoveButton = (host: HTMLElement) => buttonIn(removeModal(host)!, 'Remove PM Type') as HTMLButtonElement;
const successMessages = (toast: ToastService) => toast.toasts().filter(t => t.type === 'success').map(t => t.message);
const openRequestsFor = (pm: PmService, assetId: string) =>
  pm.pendingMasterPlanChanges().filter(c => c.assetId === assetId && c.status === 'pending');

type Rendered = Awaited<ReturnType<typeof render>>;
async function openRemoveModal({ host, settle }: Rendered, assetId: string) {
  buttonIn(rowOf(host, assetId), 'Remove PM Type').click();
  await settle();
}
async function chooseRemoveOption({ host, settle }: Rendered, frequency: string) {
  removeOption(host, frequency)!.click();
  await settle();
}

describe('PmMachinesComponent — draft PM types in the detail window', () => {
  it('lists the drafts of a Not-in-plan machine, each tagged Draft, most frequent first', async () => {
    const { host, settle, pm } = await render();
    addTwoDrafts(pm);
    rowOf(host, 'N').click();
    await settle();

    expect(dialog(host).textContent).toContain('Not in plan');
    expect(dialog(host).textContent).toContain('PM Types (2)');
    expect(frequencyTags(host)).toEqual(['Weekly', 'Monthly']);
    expect(pmTypeBlocks(host).map(b => b.querySelector('.pm-type-title')?.textContent?.trim()))
      .toEqual(['Weekly spindle check', 'Monthly coolant change']);
    expect(pmTypeBlocks(host).map(b => b.querySelectorAll('.tag-draft').length)).toEqual([1, 1]);
    expect(dialog(host).textContent).not.toContain('No PM types yet');
  });

  it('shows the details the user entered for each draft', async () => {
    const { host, settle, pm } = await render();
    addTwoDrafts(pm);
    rowOf(host, 'N').click();
    await settle();

    const [weekly, monthly] = pmTypeBlocks(host);
    expect(fieldOf(weekly, 'Recurrence')).toBe('Recurring');
    expect(fieldOf(weekly, 'First / next due')).toBe('Jul 6, 2026');
    expect(fieldOf(weekly, 'Est. Hours')).toBe('0.5');
    expect(fieldOf(weekly, 'Description')).toBe('Check spindle runout');
    expect(fieldOf(weekly, 'Parts')).toBe('Grease');
    expect(weekly.querySelector('.checklist-toggle')?.textContent).toContain('Checklist (2 items)');

    expect(fieldOf(monthly, 'Recurrence')).toBe('One-time');
    expect(fieldOf(monthly, 'First / next due')).toBe('Jul 1, 2026');
    expect(fieldOf(monthly, 'Est. Hours')).toBe('2');
    expect(fieldOf(monthly, 'Description')).toBeUndefined();
    expect(fieldOf(monthly, 'Parts')).toBe('Coolant, Filter');
    expect(monthly.querySelector('.checklist-toggle')?.textContent).toContain('Checklist (1 items)');
  });

  it('expands the checklist of one draft without opening the other', async () => {
    const { host, settle, pm } = await render();
    addTwoDrafts(pm);
    rowOf(host, 'N').click();
    await settle();
    expect(dialog(host).textContent).not.toContain('Wipe spindle');

    const [weekly, monthly] = pmTypeBlocks(host);
    weekly.querySelector<HTMLElement>('.checklist-toggle')!.click();
    await settle();

    expect(weekly.textContent).toContain('Wipe spindle');
    expect(weekly.textContent).toContain('Photo required');
    expect(weekly.textContent).toContain('Log runout');
    expect(weekly.textContent).toContain('Value required');
    expect(monthly.textContent).not.toContain('Drain tank');
  });

  it('shows the empty note when a Not-in-plan machine has no drafts, and brings it back after the last draft goes', async () => {
    const { host, settle, pm } = await render();
    rowOf(host, 'N').click();
    await settle();

    expect(dialog(host).textContent).toContain('PM Types (0)');
    expect(dialog(host).textContent).toContain('No PM types yet. Add one, then send this machine to the Master Plan.');
    expect(host.querySelector('.tag-draft')).toBeNull();

    pm.addDraftPmType('N', 'Weekly', WEEKLY_DRAFT);
    await settle();
    expect(dialog(host).textContent).toContain('PM Types (1)');
    expect(dialog(host).textContent).not.toContain('No PM types yet');

    pm.removeDraftPmType('N', 'Weekly');
    await settle();
    expect(dialog(host).textContent).toContain('No PM types yet. Add one, then send this machine to the Master Plan.');
  });
});

describe('PmMachinesComponent — Add PM type from the detail window', () => {
  it('opens Create PM with the Not-in-plan machine preselected', async () => {
    const { host, settle } = await render();
    rowOf(host, 'N').click();
    await settle();

    expect(addPmTypeButton(host).disabled).toBe(false);
    expect(host.querySelector('.detail-action-hint')?.textContent).not.toContain('Reactivate');
    addPmTypeButton(host).click();
    await settle();

    expect(TestBed.inject(Router).url).toContain('/pm-create?machine=N');
  });

  it('opens Create PM with an In-plan machine preselected', async () => {
    const { host, settle } = await render();
    rowOf(host, 'A').click();
    await settle();

    expect(addPmTypeButton(host).disabled).toBe(false);
    addPmTypeButton(host).click();
    await settle();

    expect(TestBed.inject(Router).url).toContain('/pm-create?machine=A');
  });

  it('is disabled with a hint for an inactive machine and goes nowhere when clicked', async () => {
    const { host, settle, pm } = await render();
    await pm.setMachineActive('N', false);
    await settle();
    rowOf(host, 'N').click();
    await settle();

    expect(dialog(host).textContent).toContain('Inactive');
    expect(addPmTypeButton(host).disabled).toBe(true);
    expect(host.querySelector('.detail-action-hint')?.textContent).toContain('Reactivate this machine to add PM types.');

    addPmTypeButton(host).click();
    await settle();

    expect(TestBed.inject(Router).url).toBe('/machines');
    expect(isOpen(host)).toBe(true);
  });
});

describe('PmMachinesComponent — Remove PM Type', () => {
  describe('on a Not-in-plan machine', () => {
    it('offers each draft and removes only the chosen one at once, with no approval request', async () => {
      const ctx = await render();
      const { host, settle, pm, toast } = ctx;
      addTwoDrafts(pm);
      await openRemoveModal(ctx, 'N');

      expect(removeModal(host)!.textContent).toContain('Remove PM Type?');
      expect([...removeOptionLabels(host)].sort()).toEqual(['Monthly', 'Weekly']);
      expect(confirmRemoveButton(host).disabled).toBe(true);

      await chooseRemoveOption(ctx, 'Weekly');
      expect(confirmRemoveButton(host).disabled).toBe(false);
      confirmRemoveButton(host).click();
      await settle();

      expect(pm.draftPmTypesFor('N').map(d => d.frequency)).toEqual(['Monthly']);
      expect(successMessages(toast)).toContain('Draft PM type removed.');
      expect(removeModal(host)).toBeNull();
      expect(openRequestsFor(pm, 'N')).toEqual([]);
      expect(rowOf(host, 'N').textContent).not.toContain('Pending approval');
    });

    it('shows the remaining draft in the detail window after one is removed', async () => {
      const ctx = await render();
      const { host, settle, pm } = ctx;
      addTwoDrafts(pm);
      await openRemoveModal(ctx, 'N');
      await chooseRemoveOption(ctx, 'Weekly');
      confirmRemoveButton(host).click();
      await settle();

      rowOf(host, 'N').click();
      await settle();
      expect(dialog(host).textContent).toContain('PM Types (1)');
      expect(frequencyTags(host)).toEqual(['Monthly']);
    });

    it('clears the earlier choice when the window is cancelled and opened again', async () => {
      const ctx = await render();
      const { host, settle, pm } = ctx;
      addTwoDrafts(pm);
      await openRemoveModal(ctx, 'N');
      await chooseRemoveOption(ctx, 'Monthly');
      buttonIn(removeModal(host)!, 'Cancel').click();
      await settle();

      expect(removeModal(host)).toBeNull();
      expect(pm.draftPmTypesFor('N').length).toBe(2);

      await openRemoveModal(ctx, 'N');
      expect(removeOption(host, 'Monthly')!.checked).toBe(false);
      expect(confirmRemoveButton(host).disabled).toBe(true);
    });

    it('says there are no draft PM types and cannot be confirmed when the machine has none', async () => {
      const ctx = await render();
      const { host } = ctx;
      await openRemoveModal(ctx, 'N');

      expect(removeModal(host)!.textContent).toContain('This machine has no draft PM types.');
      expect(removeModal(host)!.querySelectorAll('input[type="radio"]').length).toBe(0);
      expect(confirmRemoveButton(host).disabled).toBe(true);
    });
  });

  describe('on an In-plan machine', () => {
    it('submits the removal for approval and keeps the PM type listed as waiting to be removed', async () => {
      const ctx = await render();
      const { host, settle, pm, toast } = ctx;
      await openRemoveModal(ctx, 'A');

      expect(removeOptionLabels(host)).toEqual(['Weekly']);
      await chooseRemoveOption(ctx, 'Weekly');
      confirmRemoveButton(host).click();
      await settle();

      const requests = openRequestsFor(pm, 'A');
      expect(requests.length).toBe(1);
      expect(requests[0].proposedState.removePmTypes).toContain('Weekly');
      expect(successMessages(toast)).toContain('Removal of Weekly PM for "Air Compressor" submitted for approval.');
      expect(removeModal(host)).toBeNull();
      expect(rowOf(host, 'A').textContent).toContain('Pending approval');

      rowOf(host, 'A').click();
      await settle();
      expect(dialog(host).textContent).toContain('PM Types (1)');
      expect(frequencyTags(host)).toEqual(['Weekly']);
      expect(host.querySelectorAll('.tag-removed').length).toBe(1);
      expect(dialog(host).textContent).toContain('Waiting for approval: remove');
    });
  });

  describe('explanation', () => {
    it('mentions approval for an In-plan machine', async () => {
      const ctx = await render();
      await openRemoveModal(ctx, 'A');

      const text = removeModal(ctx.host)!.textContent!;
      expect(text).toContain('submitted for Master Plan approval');
      expect(text).toContain('Air Compressor');
      expect(text).not.toContain('no approval is needed');
    });

    it('says no approval is needed for a Not-in-plan machine', async () => {
      const ctx = await render();
      await openRemoveModal(ctx, 'N');

      const text = removeModal(ctx.host)!.textContent!;
      expect(text).toContain('no approval is needed');
      expect(text).toContain('New Mill');
      expect(text).toContain('is deleted at once');
      expect(text).not.toContain('submitted for Master Plan approval');
    });
  });
});

// ── Ticket 06 — Send to Master Plan, Withdraw, rejection and approval ─────

const LOCK_MESSAGE = 'This machine is waiting for approval. Withdraw the request to change it.';
const SENT_TOAST = 'Sent to the Master Plan for approval. The machine is locked until a manager decides.';
const WITHDRAWN_TOAST = 'Request withdrawn. You can edit the machine again.';

const sendButton = (host: HTMLElement) =>
  Array.from(dialog(host).querySelectorAll<HTMLButtonElement>('.detail-modal-actions button')).find(b => b.textContent?.includes('Send to Master Plan'))!;
const hintOf = (host: HTMLElement) => host.querySelector('.detail-action-hint')?.textContent?.trim();
const waitingBanner = (host: HTMLElement) => dialog(host).querySelector<HTMLElement>('.detail-banner.waiting');
const rejectedBanner = (host: HTMLElement) => dialog(host).querySelector<HTMLElement>('.detail-banner.rejected');
const withdrawButton = (host: HTMLElement) => waitingBanner(host)?.querySelector<HTMLButtonElement>('button') ?? null;
const bannerText = (banner: HTMLElement | null) => banner?.textContent?.replace(/\s+/g, ' ').trim();
const errorMessages = (toast: ToastService) => toast.toasts().filter(t => t.type === 'error').map(t => t.message);
const today = () => new DatePipe('en-US').transform(new Date(), 'mediumDate');
const rowButton = (host: HTMLElement, id: string, text: string) => buttonIn(rowOf(host, id), text) as HTMLButtonElement;

async function openDetailOf({ host, settle }: Rendered, id: string) {
  rowOf(host, id).click();
  await settle();
}
// Drafts two PM types on N, opens its detail and sends it as the current user.
async function sendMachineN(ctx: Rendered) {
  addTwoDrafts(ctx.pm);
  await openDetailOf(ctx, 'N');
  sendButton(ctx.host).click();
  await ctx.settle();
}

describe('PmMachinesComponent — Send to Master Plan button', () => {
  it('is disabled with a hint while the machine has no PM types', async () => {
    const ctx = await render();
    await openDetailOf(ctx, 'N');

    expect(sendButton(ctx.host).disabled).toBe(true);
    expect(hintOf(ctx.host)).toBe('Add at least one PM type before sending.');
  });

  it('is disabled for an inactive machine, and says why', async () => {
    const ctx = await render();
    ctx.pm.addDraftPmType('N', 'Weekly', WEEKLY_DRAFT);
    await ctx.pm.setMachineActive('N', false);
    await ctx.settle();
    await openDetailOf(ctx, 'N');

    expect(sendButton(ctx.host).disabled).toBe(true);
    expect(sendButton(ctx.host).title).toBe('Reactivate this machine before sending it.');
    // One hint line only: the inactive hint already tells the user to reactivate.
    expect(ctx.host.querySelectorAll('.detail-action-hint').length).toBe(1);
    expect(hintOf(ctx.host)).toBe('Reactivate this machine to add PM types.');
  });

  it('is disabled for a machine already in the Master Plan', async () => {
    const ctx = await render();
    await openDetailOf(ctx, 'A');

    expect(sendButton(ctx.host).disabled).toBe(true);
    expect(hintOf(ctx.host)).toBe('This machine is already in the Master Plan.');
    expect(ctx.host.querySelectorAll('.detail-action-hint').length).toBe(1);
  });

  it('is disabled with a hint for a user who is not allowed to send', async () => {
    const ctx = await render();
    ctx.pm.addDraftPmType('N', 'Weekly', WEEKLY_DRAFT);
    ctx.setUser(technician);
    await openDetailOf(ctx, 'N');

    expect(sendButton(ctx.host).disabled).toBe(true);
    expect(hintOf(ctx.host)).toBe('You are not allowed to send machines to the Master Plan.');
    expect(ctx.host.querySelectorAll('.detail-action-hint').length).toBe(1);
  });

  it('is enabled, with no hint, for an active Not-in-plan machine that has a draft', async () => {
    const ctx = await render();
    ctx.pm.addDraftPmType('N', 'Weekly', WEEKLY_DRAFT);
    await openDetailOf(ctx, 'N');

    expect(sendButton(ctx.host).disabled).toBe(false);
    expect(hintOf(ctx.host)).toBeUndefined();
  });

  it('sends the machine: one request, the waiting banner, a toast, and the window stays open', async () => {
    const ctx = await render({ user: engineer });
    const { host, pm, toast } = ctx;
    await sendMachineN(ctx);

    expect(openRequestsFor(pm, 'N').length).toBe(1);
    expect(openRequestsFor(pm, 'N')[0].proposedState.addPmTypes).toEqual(['Monthly', 'Weekly']);
    expect(successMessages(toast)).toContain(SENT_TOAST);
    expect(isOpen(host)).toBe(true);
    expect(bannerText(waitingBanner(host))).toContain(
      `Waiting for approval — sent by Eddie Engineer on ${today()}. Editing, PM types and activation are locked until a manager decides.`);
    expect(sendButton(host).disabled).toBe(true);
    expect(hintOf(host)).toBe('This machine is already waiting for approval.');
    expect(rowOf(host, 'N').textContent).toContain('Pending approval');
  });

  it('locks Edit, Remove PM Type, Deactivate and Add PM type, each with the lock message', async () => {
    const ctx = await render({ user: engineer });
    const { host, settle } = ctx;
    await sendMachineN(ctx);

    for (const label of ['Edit', 'Remove PM Type', 'Deactivate']) {
      expect(rowButton(host, 'N', label).disabled, label).toBe(true);
      expect(rowButton(host, 'N', label).title, label).toBe(LOCK_MESSAGE);
    }
    expect(addPmTypeButton(host).disabled).toBe(true);
    expect(addPmTypeButton(host).title).toBe(LOCK_MESSAGE);

    rowButton(host, 'N', 'Edit').click();
    addPmTypeButton(host).click();
    await settle();
    expect(host.querySelector('tr.edit-row')).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/machines');
  });

  it('leaves the buttons of an In-plan machine with a change waiting enabled, with no banner', async () => {
    const ctx = await render({ user: engineer });
    const { host, settle, pm } = ctx;
    pm.removePmType('A', 'Weekly');
    await settle();
    await openDetailOf(ctx, 'A');

    expect(rowOf(host, 'A').textContent).toContain('Pending approval');
    expect(waitingBanner(host)).toBeNull();
    for (const label of ['Edit', 'Remove PM Type', 'Deactivate']) {
      expect(rowButton(host, 'A', label).disabled, label).toBe(false);
      expect(rowButton(host, 'A', label).title, label).toBe('');
    }
    expect(addPmTypeButton(host).disabled).toBe(false);
  });

  it('ignores a click that bubbles out of a button inside the row', async () => {
    const { host, settle } = await render();

    // A button whose handler does not stop the event, as a disabled button's content can behave in some browsers.
    const stray = document.createElement('button');
    rowOf(host, 'A').querySelector('.row-actions-inner')!.appendChild(stray);
    stray.click();
    await settle();

    expect(isOpen(host)).toBe(false);
  });

  it('disables Save in an open Edit row once the machine starts waiting', async () => {
    const ctx = await render({ user: engineer });
    const { host, settle, pm } = ctx;
    pm.addDraftPmType('N', 'Weekly', WEEKLY_DRAFT);
    rowButton(host, 'N', 'Edit').click();
    await settle();
    expect((buttonIn(host.querySelector<HTMLElement>('tr.edit-row')!, 'Save') as HTMLButtonElement).disabled).toBe(false);

    pm.sendToMasterPlan('N');
    await settle();

    const save = buttonIn(host.querySelector<HTMLElement>('tr.edit-row')!, 'Save') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(save.title).toBe(LOCK_MESSAGE);
  });

  it('shows the real error and creates no second request when the service refuses a stale click', async () => {
    const ctx = await render({ user: engineer });
    const { host, settle, pm, toast } = ctx;
    pm.addDraftPmType('N', 'Weekly', WEEKLY_DRAFT);
    await openDetailOf(ctx, 'N');
    expect(sendButton(host).disabled).toBe(false);

    pm.sendToMasterPlan('N'); // another tab or a quick double click: the button on screen is still enabled
    sendButton(host).click();
    await settle();

    expect(errorMessages(toast)).toEqual(['This machine is already waiting for approval.']);
    expect(successMessages(toast)).not.toContain(SENT_TOAST);
    expect(openRequestsFor(pm, 'N').length).toBe(1);
  });
});

describe('PmMachinesComponent — Withdraw', () => {
  it('is offered to the sender and to an approver, but not to another engineer', async () => {
    const ctx = await render({ user: engineer });
    const { host, settle, setUser } = ctx;
    await sendMachineN(ctx);
    expect(withdrawButton(host)).not.toBeNull();

    setUser(otherEngineer);
    await settle();
    expect(waitingBanner(host)).not.toBeNull();
    expect(withdrawButton(host)).toBeNull();

    setUser(manager);
    await settle();
    expect(withdrawButton(host)).not.toBeNull();
  });

  it('unlocks the machine for the sender: banner gone, buttons enabled, drafts kept, no audit entry', async () => {
    const ctx = await render({ user: engineer });
    const { host, settle, pm, toast } = ctx;
    await sendMachineN(ctx);

    withdrawButton(host)!.click();
    await settle();

    expect(waitingBanner(host)).toBeNull();
    expect(openRequestsFor(pm, 'N')).toEqual([]);
    expect(successMessages(toast)).toContain(WITHDRAWN_TOAST);
    expect(pm.localAuditLogs().length).toBe(0);
    expect(pm.draftPmTypesFor('N').length).toBe(2);
    expect(dialog(host).textContent).toContain('PM Types (2)');
    expect(frequencyTags(host)).toEqual(['Weekly', 'Monthly']);
    for (const label of ['Edit', 'Remove PM Type', 'Deactivate']) {
      expect(rowButton(host, 'N', label).disabled, label).toBe(false);
    }
    expect(addPmTypeButton(host).disabled).toBe(false);
    expect(sendButton(host).disabled).toBe(false);
    expect(rowOf(host, 'N').textContent).not.toContain('Pending approval');
  });

  it('lets a manager withdraw a request someone else sent', async () => {
    const ctx = await render({ user: engineer });
    const { host, settle, pm, setUser } = ctx;
    await sendMachineN(ctx);

    setUser(manager);
    await settle();
    withdrawButton(host)!.click();
    await settle();

    expect(waitingBanner(host)).toBeNull();
    expect(openRequestsFor(pm, 'N')).toEqual([]);
  });

  it('shows the real error and keeps the request when the service refuses a stale click', async () => {
    const ctx = await render({ user: engineer });
    const { host, settle, pm, toast, setUser } = ctx;
    await sendMachineN(ctx);
    const stale = withdrawButton(host)!;

    setUser(otherEngineer); // no change detection yet: the button of the previous user is still on screen
    stale.click();
    await settle();

    expect(errorMessages(toast)).toEqual(['Only the sender or an approver can withdraw this request.']);
    expect(openRequestsFor(pm, 'N').length).toBe(1);
    expect(waitingBanner(host)).not.toBeNull();
  });
});

describe('PmMachinesComponent — rejection and approval', () => {
  it('shows who rejected the request, when and why, with Send enabled again; sending again hides it', async () => {
    const ctx = await render({ user: engineer });
    const { host, settle, pm, setUser } = ctx;
    await sendMachineN(ctx);

    setUser(manager);
    pm.rejectMasterPlanChange(openRequestsFor(pm, 'N')[0].id, 'Checklist is missing torque values');
    setUser(engineer);
    await settle();

    expect(waitingBanner(host)).toBeNull();
    expect(bannerText(rejectedBanner(host))).toContain(`Rejected by Mia Manager on ${today()}: Checklist is missing torque values`);
    expect(rowOf(host, 'N').textContent).toContain('Not in plan');
    expect(sendButton(host).disabled).toBe(false);
    expect(rowButton(host, 'N', 'Edit').disabled).toBe(false);
    expect(dialog(host).textContent).toContain('PM Types (2)');

    sendButton(host).click();
    await settle();

    expect(rejectedBanner(host)).toBeNull();
    expect(waitingBanner(host)).not.toBeNull();
  });

  it('puts an approved machine In plan with its PM types, no Draft tags, and Send disabled', async () => {
    const ctx = await render({ user: engineer });
    const { host, settle, pm, setUser } = ctx;
    await sendMachineN(ctx);

    setUser(manager);
    await pm.approveMasterPlanChange(openRequestsFor(pm, 'N')[0].id);
    await settle();

    expect(waitingBanner(host)).toBeNull();
    expect(rejectedBanner(host)).toBeNull();
    expect(dialog(host).querySelector('.detail-badges')!.textContent).toContain('In plan');
    expect(dialog(host).querySelector('.detail-badges')!.textContent).not.toContain('Not in plan');
    expect(dialog(host).textContent).toContain('PM Types (2)');
    expect(frequencyTags(host)).toEqual(['Weekly', 'Monthly']);
    expect(host.querySelector('.tag-draft')).toBeNull();
    expect(sendButton(host).disabled).toBe(true);
    expect(hintOf(host)).toBe('This machine is already in the Master Plan.');
    expect(rowOf(host, 'N').textContent).toContain('In plan');
    expect(rowOf(host, 'N').textContent).not.toContain('Pending approval');
  });
});
