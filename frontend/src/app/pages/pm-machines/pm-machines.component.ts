import { Component, ElementRef, ViewChild, computed, effect, inject, signal, untracked, HostListener } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { Asset, PendingMasterPlanChange, PmTypeSummary } from '../../core/models/pm.model';
import { isAssetInMasterPlan } from '../../core/services/pm-plan.util';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { environment } from '../../../environments/environment';

type StatusFilter = 'all' | 'active' | 'inactive';
type PlanFilter = 'all' | 'in' | 'out';

@Component({
  selector: 'app-pm-machines',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './pm-machines.component.html',
  styleUrl: './pm-machines.component.scss'
})
export class PmMachinesComponent {
  private pmService = inject(PmService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  // Only shown/usable outside production builds — lets this page be tested end-to-end
  // (create + deactivate/reactivate) before the backend supports isActive/PATCH /assets/:id
  // (see docs/backend_fixes_needed_combined.html#machine).
  readonly isDevBuild = !environment.production;
  useMockData = signal(false);

  get currentUser() { return this.authService.currentUser(); }
  get canChangeDept() {
    const role = this.currentUser?.baseRole;
    return role === 'admin' || role === 'manager';
  }

  departments = ['Facility', 'Mechanic', 'Manufacturing', 'Maintenance', 'Test'];
  products = computed(() => this.authService.getAccessibleProducts('pm.create.submit'));

  // ── Add Machine form ────────────────────────────────────────────────────
  productId = '';
  department = '';
  assetId = '';
  assetName = '';
  workCenter = '';
  isSubmitting = signal(false);

  constructor() {
    if (!this.canChangeDept && this.currentUser?.department) {
      this.department = this.currentUser.department;
    }

    // A link such as /pm-machines?machine=CNC-014 opens that machine's detail window.
    effect(() => {
      const id = this.queryParams()?.get('machine');
      if (id) untracked(() => this.openFromLink(id));
    });
    // If the machine disappears while its window is open (data reload), close the window for good.
    effect(() => {
      if (this.detailId() && !this.detailMachine()) untracked(() => this.detailId.set(null));
    });
  }

  openDropdown: string | null = null;

  @HostListener('document:click')
  closeDropdowns() {
    this.openDropdown = null;
    this.editOpenDropdown = null;
  }

  toggleDropdown(name: string, event: Event) {
    event.stopPropagation();
    this.openDropdown = this.openDropdown === name ? null : name;
  }

  selectProduct(p: string, event: Event) {
    event.stopPropagation();
    this.productId = p;
    this.openDropdown = null;
  }

  selectDept(d: string, event: Event) {
    event.stopPropagation();
    this.department = d;
    this.openDropdown = null;
  }

  getFilteredProducts() {
    const val = (this.productId || '').toLowerCase();
    return this.products().filter(p => p.toLowerCase().includes(val));
  }

  isDuplicateAssetId(): boolean {
    const id = this.assetId.trim().toLowerCase();
    if (!id) return false;
    return this.pmService.assets().some(a => a.id.toLowerCase() === id);
  }

  async addMachine() {
    const productId = this.productId.trim();
    const department = this.department.trim();
    const assetId = this.assetId.trim();
    const assetName = this.assetName.trim();
    const workCenter = this.workCenter.trim();

    if (!productId || !department || !assetId || !assetName || !workCenter) {
      this.toast.error('Please fill out Customer, Department, Machine ID, Machine Name, and Work Center.');
      return;
    }
    if (this.isDuplicateAssetId()) {
      this.toast.error('A machine with this ID already exists. Machine IDs must be unique.');
      return;
    }

    const mock = this.isDevBuild && this.useMockData();
    const isNewProduct = !mock && !this.products().includes(productId);

    this.isSubmitting.set(true);
    try {
      if (isNewProduct) {
        try {
          await this.pmService.createProduct({ id: productId, name: productId });
        } catch (e: any) {
          if (e?.status === 403) {
            this.toast.error('You do not have permission to create new customers. Contact an admin or manager.');
          } else {
            this.toast.error('Failed to create new customer. Please try again.');
          }
          return;
        }
      }

      await this.pmService.addMachine({ id: assetId, name: assetName, location: productId, department, workCenter });
      this.toast.success('Machine added. It is not in the Master Plan yet: add its PM types, then send it to the Master Plan.');
      // Keep Customer/Department so adding several machines to the same customer stays quick.
      this.assetId = '';
      this.assetName = '';
      this.workCenter = '';
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to add the machine. Please try again.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // ── Machines list ────────────────────────────────────────────────────────
  searchQuery = signal('');
  statusFilter = signal<StatusFilter>('all');
  planFilter = signal<PlanFilter>('all');

  setStatusFilter(f: StatusFilter) {
    this.statusFilter.set(f);
  }

  setPlanFilter(f: PlanFilter) {
    this.planFilter.set(f);
  }

  isInPlan(a: Asset): boolean {
    return isAssetInMasterPlan(a);
  }

  // Admin/manager can manage machines for any customer, including ones just created —
  // getAccessibleProducts() only returns a fixed known-customer list, which would otherwise
  // hide brand-new customers' machines from their own management page.
  // Engineer/technician see every machine in their own department (any customer), not just
  // the customers they're currently in charge of — this list is for spotting unused machines
  // across the whole department, not just their assigned accounts.
  private visibleMachines = computed(() => {
    const role = this.currentUser?.baseRole;
    const showAll = role === 'admin' || role === 'manager';
    const userDept = (this.currentUser?.department || '').toLowerCase();
    return this.pmService.assets().filter(a => showAll || a.department?.toLowerCase() === userDept);
  });

  filteredMachines = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const status = this.statusFilter();
    const plan = this.planFilter();
    return this.visibleMachines()
      .filter(a => {
        if (status === 'active') return a.isActive !== false;
        if (status === 'inactive') return a.isActive === false;
        return true;
      })
      .filter(a => {
        if (plan === 'in') return isAssetInMasterPlan(a);
        if (plan === 'out') return !isAssetInMasterPlan(a);
        return true;
      })
      .filter(a => {
        if (!q) return true;
        return a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.location.toLowerCase().includes(q)
          || (a.workCenter || '').toLowerCase().includes(q);
      });
  });

  // ── Machine detail window ─────────────────────────────────────────────────
  private queryParams = toSignal(this.route.queryParamMap);
  @ViewChild('detailDialog') private detailDialog?: ElementRef<HTMLElement>;
  private expandedChecklists = signal<Set<string>>(new Set());
  private returnFocusTo: HTMLElement | null = null;

  detailId = signal<string | null>(null);
  detailMachine = computed(() => {
    const id = this.detailId();
    return id ? this.visibleMachines().find(a => a.id === id) ?? null : null;
  });
  detailPmTypes = computed(() => {
    const machine = this.detailMachine();
    return machine ? this.pmService.pmTypesFor(machine.id) : [];
  });
  // Computed (not template method calls) so the banners get a stable object between change detections.
  detailWaitingRequest = computed<PendingMasterPlanChange | null>(() => {
    const machine = this.detailMachine();
    return machine && this.pmService.isWaitingForApproval(machine.id) ? this.pmService.openRequestFor(machine.id) ?? null : null;
  });
  detailRejection = computed(() => {
    const machine = this.detailMachine();
    return machine ? this.pmService.lastRejectionFor(machine.id) ?? null : null;
  });

  readonly lockMessage = 'This machine is waiting for approval. Withdraw the request to change it.';

  // A machine waiting for approval is locked: the service refuses changes and the page disables them.
  isLocked(assetId: string): boolean {
    return this.pmService.isWaitingForApproval(assetId);
  }

  resolveName(employeeId: string): string {
    return this.authService.getUser(employeeId)?.name || employeeId;
  }

  openDetail(id: string, event?: Event) {
    this.returnFocusTo = (event?.currentTarget as HTMLElement | null) ?? null;
    this.expandedChecklists.set(new Set());
    this.detailId.set(id);
    queueMicrotask(() => this.detailDialog?.nativeElement.focus());
  }

  closeDetail() {
    this.detailId.set(null);
    const target = this.returnFocusTo;
    this.returnFocusTo = null;
    if (target) queueMicrotask(() => { if (target.isConnected) target.focus(); });
  }

  // A click that started on a button inside the row (even a disabled one) belongs to that button.
  onRowClick(a: Asset, event: Event) {
    if ((event.target as HTMLElement | null)?.closest('button')) return;
    this.openDetail(a.id, event);
  }

  // Enter on a button inside the row belongs to that button, not to the row.
  onRowKey(a: Asset, event: Event) {
    if (event.target === event.currentTarget) this.openDetail(a.id, event);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.detailMachine()) this.closeDetail();
  }

  private openFromLink(id: string) {
    if (this.visibleMachines().some(a => a.id === id)) this.openDetail(id);
    else this.toast.error('Machine not found.');
    // The parameter has done its job; clearing it keeps a refresh or Back from reopening the window.
    this.router.navigate([], { relativeTo: this.route, queryParams: { machine: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  private checklistKey(t: PmTypeSummary) {
    return `${t.state}:${t.frequency}`;
  }

  isChecklistOpen(t: PmTypeSummary): boolean {
    return this.expandedChecklists().has(this.checklistKey(t));
  }

  toggleChecklist(t: PmTypeSummary) {
    const key = this.checklistKey(t);
    this.expandedChecklists.update(set => {
      const next = new Set(set);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  // ── Edit ─────────────────────────────────────────────────────────────────
  editingId: string | null = null;
  editName = '';
  editDepartment = '';
  editProductId = '';
  editWorkCenter = '';
  editOpenDropdown: string | null = null;

  startEdit(a: Asset, event: Event) {
    event.stopPropagation();
    this.editingId = a.id;
    this.editName = a.name;
    this.editDepartment = a.department;
    this.editProductId = a.location;
    this.editWorkCenter = a.workCenter || '';
    this.editOpenDropdown = null;
  }

  cancelEdit() {
    this.editingId = null;
    this.editOpenDropdown = null;
  }

  toggleEditDropdown(name: string, event: Event) {
    event.stopPropagation();
    this.editOpenDropdown = this.editOpenDropdown === name ? null : name;
  }

  selectEditProduct(p: string, event: Event) {
    event.stopPropagation();
    this.editProductId = p;
    this.editOpenDropdown = null;
  }

  selectEditDept(d: string, event: Event) {
    event.stopPropagation();
    this.editDepartment = d;
    this.editOpenDropdown = null;
  }

  async saveEdit(a: Asset) {
    try {
      const result = await this.pmService.editMachine(a.id, {
        name: this.editName,
        department: this.editDepartment,
        location: this.editProductId,
        workCenter: this.editWorkCenter
      });
      if (result === 'unchanged') this.toast.show('No changes to save.');
      else this.toast.success(result === 'applied' ? 'Machine updated.' : 'Change submitted for approval.');
      this.cancelEdit();
    } catch (e: any) {
      // The edit row stays open with the user's values so nothing typed is lost.
      this.toast.error(e?.message || 'Failed to save the change. Please try again.');
    }
  }

  // Machines with a not-yet-resolved Master Plan change, for the row badge.
  pendingAssetIds = computed(() => new Set(
    this.pmService.pendingMasterPlanChanges().filter(c => c.status === 'pending').map(c => c.assetId)));

  removePmTarget: Asset | null = null;
  removePmType = '';

  askRemovePm(a: Asset, event: Event) {
    event.stopPropagation();
    this.removePmTarget = a;
    this.removePmType = '';
  }

  closeRemovePm() {
    this.removePmTarget = null;
    this.removePmType = '';
  }

  removablePmTypes(): string[] {
    return this.removePmTarget ? this.pmService.removablePmTypeFrequencies(this.removePmTarget.id) : [];
  }

  confirmRemovePm() {
    const asset = this.removePmTarget;
    const frequency = this.removePmType;
    if (!asset || !frequency) return;
    try {
      const result = this.pmService.removePmType(asset.id, frequency);
      if (result === 'applied') this.toast.success('Draft PM type removed.');
      else if (result === 'submitted') this.toast.success(`Removal of ${frequency} PM for "${asset.name}" submitted for approval.`);
      else this.toast.show('No changes to save.');
      this.closeRemovePm();
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to remove the PM type. Please try again.');
    }
  }

  // ── Add PM type (opens Create PM with this machine preselected) ───────────
  addPmType(machine: Asset) {
    if (machine.isActive === false || this.isLocked(machine.id)) return;
    this.router.navigate(['/pm-create'], { queryParams: { machine: machine.id } });
  }

  // ── Send to Master Plan / Withdraw ──────────────────────────────────────────
  // Why Send is unavailable, or null when it is allowed.
  sendDisabledReason(assetId: string): string | null {
    return this.pmService.sendBlockedReason(assetId)
      ?? (this.pmService.canProposeMasterPlanChange() ? null : 'You are not allowed to send machines to the Master Plan.');
  }

  // The one hint line in the detail footer: waiting first, then an inactive machine (whose hint already
  // covers Send), then the reason Send itself is unavailable.
  detailHint(machine: Asset): string | null {
    if (machine.isActive === false && !this.isLocked(machine.id)) return 'Reactivate this machine to add PM types.';
    return this.sendDisabledReason(machine.id);
  }

  sendToMasterPlan(machine: Asset) {
    try {
      this.pmService.sendToMasterPlan(machine.id);
      this.toast.success('Sent to the Master Plan for approval. The machine is locked until a manager decides.');
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to send the machine to the Master Plan. Please try again.');
    }
  }

  // The sender or an approver; the service enforces the same rule.
  canWithdraw(request: PendingMasterPlanChange): boolean {
    return request.submittedBy === this.currentUser?.employeeId || this.pmService.canApproveMasterPlanChange();
  }

  withdrawRequest(machine: Asset) {
    try {
      this.pmService.withdrawSendRequest(machine.id);
      this.toast.success('Request withdrawn. You can edit the machine again.');
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to withdraw the request. Please try again.');
    }
  }

  // ── Deactivate / Reactivate ─────────────────────────────────────────────────
  confirmTarget: Asset | null = null;
  confirmAction: 'deactivate' | 'reactivate' | null = null;

  askDeactivate(a: Asset, event: Event) {
    event.stopPropagation();
    this.confirmTarget = a;
    this.confirmAction = 'deactivate';
  }

  askReactivate(a: Asset, event: Event) {
    event.stopPropagation();
    this.confirmTarget = a;
    this.confirmAction = 'reactivate';
  }

  closeConfirm() {
    this.confirmTarget = null;
    this.confirmAction = null;
  }

  async confirmToggleActive() {
    if (!this.confirmTarget || !this.confirmAction) return;
    const asset = this.confirmTarget;
    const activate = this.confirmAction === 'reactivate';
    try {
      const result = await this.pmService.setMachineActive(asset.id, activate);
      if (result === 'unchanged') this.toast.show('No changes to save.');
      else if (result === 'applied') this.toast.success(activate ? 'Machine reactivated.' : 'Machine deactivated.');
      else this.toast.success('Change submitted for approval.');
      this.closeConfirm();
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to save the change. Please try again.');
    }
  }
}
