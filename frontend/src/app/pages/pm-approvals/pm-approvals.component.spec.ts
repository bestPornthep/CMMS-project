import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { PmApprovalsComponent } from './pm-approvals.component';
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
const KNOWN_USERS = [manager, engineer];

const BACKEND_ASSETS = [
  asset({ id: 'A', name: 'Air Compressor' }),
  asset({ id: 'N', name: 'New Mill' }),
  asset({ id: 'M', name: 'Second Mill' }),
];
const BACKEND_TASKS = [
  task({ id: 'T1', assetId: 'A', frequency: 'Weekly', title: 'Weekly compressor check', scheduleId: 'S-1' }),
];

const WEEKLY_DRAFT: NewPmTypeDetail = {
  title: 'Weekly spindle check', description: 'Check spindle runout', estimatedHours: 0.5, partsRequired: ['Grease'],
  checklist: [{ text: 'Wipe spindle', requiresPhoto: true }, { text: 'Log runout', requiresValue: true }],
  startDate: new Date(2026, 6, 6), isRecurring: true
};
const MONTHLY_DRAFT: NewPmTypeDetail = {
  title: 'Monthly coolant change', estimatedHours: 2, partsRequired: ['Coolant', 'Filter'],
  checklist: [{ text: 'Drain tank' }], startDate: new Date(2026, 6, 1), isRecurring: false
};

// Starts signed in as the engineer who prepares and sends machines; a test switches to the manager
// with setUser() before opening the page.
async function render() {
  // A signal, like the real AuthService, so a user switch refreshes the page (the app is zoneless).
  const userSignal = signal<User>(engineer);
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
    getAccessibleProducts: () => ['CUST-001'],
    getUser: (id: string) => KNOWN_USERS.find(u => u.employeeId === id),
    getAllUsers: () => [],
    init: async () => undefined,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: ApiService, useValue: api },
      { provide: AuthService, useValue: auth },
      provideRouter([{ path: 'approvals', component: PmApprovalsComponent }]),
    ]
  });
  const pm = TestBed.inject(PmService);
  await pm.loadData();

  const openPage = async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/approvals', PmApprovalsComponent);
    const host: HTMLElement = harness.routeNativeElement as HTMLElement;
    const settle = async () => {
      // The approve actions are async but not tracked by Angular, so let their promises finish first.
      await new Promise(resolve => setTimeout(resolve));
      harness.detectChanges();
      await harness.fixture.whenStable();
      harness.detectChanges();
    };
    await settle();
    return { host, settle };
  };
  return {
    pm, api, backend, openPage,
    setUser: (u: User) => userSignal.set(u),
    toast: TestBed.inject(ToastService)
  };
}
type Rendered = Awaited<ReturnType<typeof render>>;

// Drafts the given PM types on a machine and sends it, as the current (engineer) user.
function sendMachine(pm: PmService, assetId: string, drafts: [string, NewPmTypeDetail][] = [['Weekly', WEEKLY_DRAFT], ['Monthly', MONTHLY_DRAFT]]) {
  for (const [frequency, detail] of drafts) pm.addDraftPmType(assetId, frequency, detail);
  pm.sendToMasterPlan(assetId);
}
const openRequestFor = (pm: PmService, assetId: string) =>
  pm.pendingMasterPlanChanges().find(c => c.assetId === assetId && c.status === 'pending');

const pendingRows = (host: HTMLElement) =>
  Array.from(host.querySelector('table.data-table')!.querySelectorAll<HTMLElement>('tbody tr')).filter(r => r.querySelector('.mono'));
const rowFor = (host: HTMLElement, assetId: string) =>
  pendingRows(host).find(r => r.querySelector('.mono')?.textContent?.trim() === assetId)!;
const tagTexts = (row: HTMLElement) => Array.from(row.querySelectorAll('.change-tag')).map(t => t.textContent?.trim());
const dialog = (host: HTMLElement) => host.querySelector<HTMLElement>('.detail-modal')!;
const isOpen = (host: HTMLElement) => dialog(host).classList.contains('open');
const buttonIn = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll<HTMLElement>('button')).find(b => b.textContent?.trim() === text)!;
const blockOf = (host: HTMLElement, frequency: string) =>
  Array.from(dialog(host).querySelectorAll<HTMLElement>('.pm-type-block'))
    .find(b => b.querySelector('.pm-type-block-heading')?.textContent?.trim() === `+ ${frequency} PM`)!;
const fieldOf = (block: HTMLElement, label: string) =>
  Array.from(block.querySelectorAll('tr')).find(r => r.children[0]?.textContent?.trim() === label)?.children[1]?.textContent?.trim();
const checklistRows = (block: HTMLElement) =>
  Array.from(block.querySelectorAll('.pm-checklist-table tr')).slice(1).map(r => r.textContent?.replace(/\s+/g, ' ').trim());
const toastsOf = (toast: ToastService, type: string) => toast.toasts().filter(t => t.type === type).map(t => t.message);
const versionCount = (pm: PmService) => pm.masterPlanVersions().length;

function typeReason(host: HTMLElement, reason: string) {
  const input = dialog(host).querySelector<HTMLInputElement>('input.input')!;
  input.value = reason;
  input.dispatchEvent(new Event('input'));
}

async function pageWithSentMachines(ctx: Rendered, assetIds: string[] = ['N']) {
  for (const id of assetIds) sendMachine(ctx.pm, id);
  ctx.setUser(manager);
  return ctx.openPage();
}

// ── Ticket 06 — Send requests on the Approvals page ───────────────────────

describe('PmApprovalsComponent — Send to Master Plan requests', () => {
  it('tags a Send request "Add to Master Plan", then one tag per PM type', async () => {
    const ctx = await render();
    const { host } = await pageWithSentMachines(ctx);

    const row = rowFor(host, 'N');
    expect(row.textContent).toContain('New Mill');
    expect(row.textContent).toContain('Eddie Engineer');
    expect(tagTexts(row)).toEqual(['Add to Master Plan', '+ Weekly PM', '+ Monthly PM']);
    expect(row.querySelector('.change-tag.tag-send')?.textContent?.trim()).toBe('Add to Master Plan');
  });

  it('does not tag a change request on an In-plan machine as a Send', async () => {
    const ctx = await render();
    ctx.pm.removePmType('A', 'Weekly');
    ctx.setUser(manager);
    const { host } = await ctx.openPage();

    expect(tagTexts(rowFor(host, 'A'))).toEqual(['− Weekly PM']);
    expect(host.querySelector('.tag-send')).toBeNull();
  });

  it('shows the banner and every PM type with its full details in the modal', async () => {
    const ctx = await render();
    const { host, settle } = await pageWithSentMachines(ctx);

    rowFor(host, 'N').click();
    await settle();

    expect(isOpen(host)).toBe(true);
    expect(dialog(host).querySelector('.send-banner')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'This request adds the machine and all its PM types to the Master Plan. Approving puts the machine in the plan and creates a new revision.');
    expect(dialog(host).textContent).toContain('PM Type Changes — Added');

    const weekly = blockOf(host, 'Weekly');
    expect(fieldOf(weekly, 'Title')).toBe('Weekly spindle check');
    expect(fieldOf(weekly, 'Frequency')).toBe('Weekly');
    expect(fieldOf(weekly, 'Recurrence')).toBe('Recurring');
    expect(fieldOf(weekly, 'First due')).toBe('Jul 6, 2026');
    expect(fieldOf(weekly, 'Description')).toBe('Check spindle runout');
    expect(fieldOf(weekly, 'Est. Hours')).toBe('0.5');
    expect(fieldOf(weekly, 'Parts')).toBe('Grease');
    expect(weekly.querySelector('.pm-checklist-heading')?.textContent).toContain('Checklist (2 items)');
    expect(checklistRows(weekly)).toEqual(['1. Wipe spindle photo_cameraPhoto required', '2. Log runout numbersValue required']);

    const monthly = blockOf(host, 'Monthly');
    expect(fieldOf(monthly, 'Title')).toBe('Monthly coolant change');
    expect(fieldOf(monthly, 'Recurrence')).toBe('One-time');
    expect(fieldOf(monthly, 'First due')).toBe('Jul 1, 2026');
    expect(fieldOf(monthly, 'Est. Hours')).toBe('2');
    expect(fieldOf(monthly, 'Parts')).toBe('Coolant, Filter');
    expect(checklistRows(monthly)).toEqual(['1. Drain tank']);
  });

  it('does not show the Send banner for a change request on an In-plan machine', async () => {
    const ctx = await render();
    ctx.pm.removePmType('A', 'Weekly');
    ctx.setUser(manager);
    const { host, settle } = await ctx.openPage();

    rowFor(host, 'A').click();
    await settle();

    expect(isOpen(host)).toBe(true);
    expect(dialog(host).querySelector('.send-banner')).toBeNull();
  });

  describe('approving', () => {
    it('puts the machine In plan, makes one revision, closes the modal and removes the request from the list', async () => {
      const ctx = await render();
      const { host, settle } = await pageWithSentMachines(ctx);
      const versionsBefore = versionCount(ctx.pm);

      rowFor(host, 'N').click();
      await settle();
      buttonIn(dialog(host), 'Approve').click();
      await settle();

      expect(ctx.pm.isInMasterPlan('N')).toBe(true);
      expect(ctx.pm.draftPmTypesFor('N')).toEqual([]);
      expect(ctx.pm.pmTypesFor('N').map(t => t.frequency)).toEqual(['Weekly', 'Monthly']);
      expect(ctx.pm.pmTypesFor('N').some(t => t.state === 'draft')).toBe(false);
      expect(versionCount(ctx.pm)).toBe(versionsBefore + 1);
      expect(toastsOf(ctx.toast, 'success')).toContain('Approved changes for N.');
      expect(isOpen(host)).toBe(false);
      expect(pendingRows(host).length).toBe(0);
    });

    it('also works from the Approve button in the table row', async () => {
      const ctx = await render();
      const { host, settle } = await pageWithSentMachines(ctx);

      buttonIn(rowFor(host, 'N'), 'Approve').click();
      await settle();

      expect(ctx.pm.isInMasterPlan('N')).toBe(true);
      expect(pendingRows(host).length).toBe(0);
    });

    it('bulk approving two Send requests makes one revision', async () => {
      const ctx = await render();
      const { host, settle } = await pageWithSentMachines(ctx, ['N', 'M']);
      const versionsBefore = versionCount(ctx.pm);
      expect(pendingRows(host).length).toBe(2);

      rowFor(host, 'N').querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
      rowFor(host, 'M').querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
      await settle();
      buttonIn(host.querySelector<HTMLElement>('.bulk-bar')!, 'Approve Selected').click();
      await settle();

      expect(ctx.pm.isInMasterPlan('N')).toBe(true);
      expect(ctx.pm.isInMasterPlan('M')).toBe(true);
      expect(versionCount(ctx.pm)).toBe(versionsBefore + 1);
      expect(toastsOf(ctx.toast, 'success')).toContain('2 change(s) approved.');
      expect(pendingRows(host).length).toBe(0);
    });

    it('shows the real error and keeps the request listed when the machine no longer exists', async () => {
      const ctx = await render();
      sendMachine(ctx.pm, 'N');
      ctx.backend.assets = ctx.backend.assets.filter(a => a.id !== 'N');
      await ctx.pm.loadData();
      ctx.setUser(manager);
      const { host, settle } = await ctx.openPage();
      expect(pendingRows(host).length).toBe(1);

      buttonIn(rowFor(host, 'N'), 'Approve').click();
      await settle();

      expect(toastsOf(ctx.toast, 'error')).toEqual(['Machine not found.']);
      expect(toastsOf(ctx.toast, 'success')).toEqual([]);
      expect(pendingRows(host).length).toBe(1);
      expect(openRequestFor(ctx.pm, 'N')).toBeDefined();
      expect(versionCount(ctx.pm)).toBe(0);
    });

    it('shows the real error of a failed item when bulk approving, and keeps that request listed', async () => {
      const ctx = await render();
      sendMachine(ctx.pm, 'N');
      sendMachine(ctx.pm, 'M');
      ctx.backend.assets = ctx.backend.assets.filter(a => a.id !== 'N');
      await ctx.pm.loadData();
      ctx.setUser(manager);
      const { host, settle } = await ctx.openPage();

      host.querySelector<HTMLInputElement>('thead input[type="checkbox"]')!.click();
      await settle();
      buttonIn(host.querySelector<HTMLElement>('.bulk-bar')!, 'Approve Selected').click();
      await settle();

      expect(toastsOf(ctx.toast, 'error')).toEqual(['Machine not found.']);
      expect(toastsOf(ctx.toast, 'warning')).toEqual(['1 approved, 1 failed. Please check and retry.']);
      expect(ctx.pm.isInMasterPlan('M')).toBe(true);
      expect(pendingRows(host).map(r => r.querySelector('.mono')?.textContent?.trim())).toEqual(['N']);
    });

    it('disables Approve, Reject and Approve Selected while an approval is in flight, and approves once', async () => {
      const ctx = await render();
      const { host, settle } = await pageWithSentMachines(ctx, ['N', 'M']);
      let finish!: () => void;
      const approve = vi.spyOn(ctx.pm, 'approveMasterPlanChange').mockImplementation(() => new Promise<void>(r => { finish = r; }));
      rowFor(host, 'M').querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
      await settle();

      buttonIn(rowFor(host, 'N'), 'Approve').click();
      buttonIn(rowFor(host, 'N'), 'Approve').click();
      await settle();

      const disabled = (b: HTMLElement) => (b as HTMLButtonElement).disabled;
      expect(approve).toHaveBeenCalledTimes(1);
      expect(disabled(buttonIn(rowFor(host, 'N'), 'Approve'))).toBe(true);
      expect(disabled(buttonIn(rowFor(host, 'M'), 'Reject'))).toBe(true);
      expect(disabled(buttonIn(host.querySelector<HTMLElement>('.bulk-bar')!, 'Approve Selected'))).toBe(true);

      rowFor(host, 'M').click();
      await settle();
      expect(disabled(buttonIn(dialog(host), 'Approve'))).toBe(true);
      expect(disabled(buttonIn(dialog(host), 'Reject'))).toBe(true);

      finish();
      await settle();
      expect(disabled(buttonIn(rowFor(host, 'M'), 'Approve'))).toBe(false);
      expect(disabled(buttonIn(dialog(host), 'Approve'))).toBe(false);
      expect(disabled(buttonIn(host.querySelector<HTMLElement>('.bulk-bar')!, 'Approve Selected'))).toBe(false);
    });
  });

  describe('rejecting', () => {
    it('is refused without a reason and leaves the request pending', async () => {
      const ctx = await render();
      const { host, settle } = await pageWithSentMachines(ctx);

      buttonIn(rowFor(host, 'N'), 'Reject').click();
      await settle();
      expect(isOpen(host)).toBe(true);
      buttonIn(dialog(host), 'Confirm Reject').click();
      await settle();

      expect(toastsOf(ctx.toast, 'warning')).toEqual(['Please enter a reason for rejecting this change.']);
      expect(openRequestFor(ctx.pm, 'N')).toBeDefined();
      expect(ctx.pm.lastRejectionFor('N')).toBeUndefined();
      expect(ctx.pm.localAuditLogs().length).toBe(0);
      expect(isOpen(host)).toBe(true);
    });

    it('with a reason resolves the request, and the machine stays Not in plan with its drafts and the reason', async () => {
      const ctx = await render();
      const { host, settle } = await pageWithSentMachines(ctx);

      buttonIn(rowFor(host, 'N'), 'Reject').click();
      await settle();
      typeReason(host, 'Checklist is missing torque values');
      await settle();
      buttonIn(dialog(host), 'Confirm Reject').click();
      await settle();

      expect(openRequestFor(ctx.pm, 'N')).toBeUndefined();
      expect(ctx.pm.isInMasterPlan('N')).toBe(false);
      expect(ctx.pm.isWaitingForApproval('N')).toBe(false);
      expect(ctx.pm.draftPmTypesFor('N').length).toBe(2);
      expect(ctx.pm.lastRejectionFor('N')).toMatchObject({ byName: 'Mia Manager', reason: 'Checklist is missing torque values' });
      expect(toastsOf(ctx.toast, 'success')).toContain('Rejected changes for N.');
      expect(isOpen(host)).toBe(false);
      expect(pendingRows(host).length).toBe(0);
    });
  });
});
