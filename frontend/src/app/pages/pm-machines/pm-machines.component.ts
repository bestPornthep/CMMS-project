import { Component, computed, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { Asset } from '../../core/models/pm.model';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { environment } from '../../../environments/environment';

type StatusFilter = 'all' | 'active' | 'inactive';

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

  // Only shown/usable outside production builds \u2014 lets this page be tested end-to-end
  // (create + deactivate/reactivate) before the backend supports isActive/PATCH /assets/:id
  // (see docs/backend_machine_active_status.html).
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

      await this.pmService.createAsset({ id: assetId, name: assetName, location: productId, department, workCenter }, { mock });
      this.toast.success(`Machine "${assetName}" added.`);
      // Keep Customer/Department so adding several machines to the same customer stays quick.
      this.assetId = '';
      this.assetName = '';
      this.workCenter = '';
    } catch (e) {
      this.toast.error('Failed to create new machine. Please try again.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  // ── Machines list ────────────────────────────────────────────────────────
  searchQuery = signal('');
  statusFilter = signal<StatusFilter>('all');

  setStatusFilter(f: StatusFilter) {
    this.statusFilter.set(f);
  }

  filteredMachines = computed(() => {
    // Admin/manager can manage machines for any customer, including ones just created —
    // getAccessibleProducts() only returns a fixed known-customer list, which would otherwise
    // hide brand-new customers' machines from their own management page.
    // Engineer/technician see every machine in their own department (any customer), not just
    // the customers they're currently in charge of — this list is for spotting unused machines
    // across the whole department, not just their assigned accounts.
    const role = this.currentUser?.baseRole;
    const showAll = role === 'admin' || role === 'manager';
    const userDept = (this.currentUser?.department || '').toLowerCase();
    const q = this.searchQuery().trim().toLowerCase();
    const status = this.statusFilter();
    return this.pmService.assets()
      .filter(a => showAll || a.department?.toLowerCase() === userDept)
      .filter(a => {
        if (status === 'active') return a.isActive !== false;
        if (status === 'inactive') return a.isActive === false;
        return true;
      })
      .filter(a => {
        if (!q) return true;
        return a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.location.toLowerCase().includes(q)
          || (a.workCenter || '').toLowerCase().includes(q);
      });
  });

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
    const name = this.editName.trim();
    const department = this.editDepartment.trim();
    const location = this.editProductId.trim();
    const workCenter = this.editWorkCenter.trim();
    if (!name || !department || !location || !workCenter) {
      this.toast.error('Name, Department, Customer, and Work Center are required.');
      return;
    }
    const mock = this.isDevBuild && this.useMockData();
    try {
      await this.pmService.updateAsset(a.id, { name, department, location, workCenter }, { mock });
      this.toast.success('Machine updated.');
      this.editingId = null;
    } catch (e) {
      this.toast.error('Failed to update machine. Please try again.');
    }
  }

  // ── Deactivate / Reactivate ──────────────────────────────────────────────
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
    const mock = this.isDevBuild && this.useMockData();
    try {
      await this.pmService.updateAsset(asset.id, { isActive: activate }, { mock });
      this.toast.success(activate ? `Machine "${asset.name}" reactivated.` : `Machine "${asset.name}" deactivated.`);
      this.closeConfirm();
    } catch (e) {
      this.toast.error('Failed to update machine status. Please try again.');
    }
  }
}
