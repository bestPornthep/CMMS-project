import { Component, computed, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { NewUserPayload, Role, User } from '../../core/models/pm.model';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

interface PermissionCatalogItem {
  key: string;
  label: string;
}

// Every new user starts as a Technician — admin promotes them by picking a Role
// Template, which applies that role's standard permission set (below).
const ROLE_TEMPLATES: Role[] = ['technician', 'engineer', 'manager', 'admin'];

const ROLE_LABELS: Record<Role, string> = {
  technician: 'Technician',
  engineer: 'Engineer',
  manager: 'Manager',
  admin: 'Admin',
};

// Mirrors AuthService.ROLE_DEFAULTS — the standard permission set each role template grants.
const ROLE_STANDARD_PERMISSIONS: Record<Role, string[]> = {
  technician: ['pm.dashboard.view', 'pm.record.view', 'pm.record.submit', 'pm.calendar.view'],
  engineer: [
    'pm.dashboard.view', 'pm.create.view', 'pm.create.submit',
    'pm.assign.view', 'pm.assign.submit', 'pm.record.view', 'pm.record.submit',
    'pm.calendar.view', 'pm.reports.view', 'pm.audit.view',
    'pm.reports.export', 'pm.permission.delegate',
  ],
  manager: [], // manager/admin bypass all permission checks — always full access
  admin: [],
};

const PERMISSION_CATALOG: PermissionCatalogItem[] = [
  { key: 'pm.dashboard.view', label: 'View Dashboard' },
  { key: 'pm.create.view', label: 'View Create PM Page' },
  { key: 'pm.create.submit', label: 'Create PM Tasks' },
  { key: 'pm.assign.view', label: 'View Assign PM Page' },
  { key: 'pm.assign.submit', label: 'Assign PM Tasks to Technicians' },
  { key: 'pm.record.view', label: 'View Record PM Page' },
  { key: 'pm.record.submit', label: 'Submit / Approve PM Records' },
  { key: 'pm.calendar.view', label: 'View PM Calendar' },
  { key: 'pm.reports.view', label: 'View PM Reports' },
  { key: 'pm.reports.export', label: 'Export PM Reports (PDF)' },
  { key: 'pm.audit.view', label: 'View Audit Log' },
  { key: 'pm.permission.delegate', label: 'Delegate Permissions to Technicians' },
];

const DEPARTMENT_OPTIONS = ['Facility', 'Mechanic', 'Manufacturing', 'Maintenance', 'Test', 'All'];
const PRODUCT_OPTIONS = ['CUST-001', 'CUST-002', 'CUST-003', 'CUST-004', 'CUST-005', 'CUST-006'];

@Component({
  selector: 'app-profile-config',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './profile-config.component.html',
  styleUrl: './profile-config.component.scss'
})
export class ProfileConfigComponent {
  private authService = inject(AuthService);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  readonly roleTemplates = ROLE_TEMPLATES;
  readonly roleLabels = ROLE_LABELS;
  readonly departmentOptions = DEPARTMENT_OPTIONS;
  readonly productOptions = PRODUCT_OPTIONS;
  readonly permissionCatalog = PERMISSION_CATALOG;

  users = signal<User[]>([]);
  searchQuery = signal('');
  saving = signal(false);
  modalOpen = signal(false);
  editingId = signal<string | null>(null);
  isEditing = computed(() => this.editingId() !== null);
  currentUserId = computed(() => this.authService.currentUser()?.employeeId);

  filteredUsers = computed(() => {
    const q = this.searchQuery().toLowerCase();
    if (!q) return this.users();
    return this.users().filter(u =>
      u.employeeId.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      u.department.toLowerCase().includes(q)
    );
  });

  // Form fields
  formEmployeeId = '';
  formName = '';
  formInitials = '';
  formDepartment = 'Facility';
  formBaseRole: Role = 'technician';
  formRoleLabel = ROLE_LABELS['technician'];
  formPassword = '';
  formOwnedProducts: string[] = [];
  formPermissions: string[] = []; // extra permissions on top of the role's standard set
  formIsActive = true;
  deptDropdownOpen = false;

  @HostListener('document:click')
  closeDropdowns() {
    this.deptDropdownOpen = false;
  }

  toggleDeptDropdown(event: Event) {
    event.stopPropagation();
    this.deptDropdownOpen = !this.deptDropdownOpen;
  }

  selectDept(d: string, event: Event) {
    event.stopPropagation();
    this.formDepartment = d;
    this.deptDropdownOpen = false;
  }

  constructor() {
    this.loadUsers();
  }

  private loadUsers() {
    this.api.getAllUsers()
      .then(users => this.users.set(users))
      .catch(() => this.toast.error('Failed to load users. Please refresh the page.'));
  }

  updateSearch(event: Event) {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  openCreateModal() {
    this.editingId.set(null);
    this.formEmployeeId = '';
    this.formName = '';
    this.formInitials = '';
    this.formDepartment = 'Facility';
    this.formBaseRole = 'technician';
    this.formRoleLabel = ROLE_LABELS['technician'];
    this.formPassword = '';
    this.formOwnedProducts = [];
    this.formPermissions = [];
    this.formIsActive = true;
    this.modalOpen.set(true);
  }

  openEditModal(u: User) {
    this.editingId.set(u.employeeId);
    this.formEmployeeId = u.employeeId;
    this.formName = u.name;
    this.formInitials = u.initials;
    this.formDepartment = u.department;
    this.formBaseRole = u.baseRole;
    this.formRoleLabel = u.roleLabel;
    this.formPassword = '';
    this.formOwnedProducts = [...(u.ownedProducts || [])];
    const standard = ROLE_STANDARD_PERMISSIONS[u.baseRole] || [];
    this.formPermissions = (u.permissions || []).filter(p => !standard.includes(p));
    this.formIsActive = u.isActive !== false;
    this.modalOpen.set(true);
  }

  closeModal() {
    this.modalOpen.set(false);
  }

  selectRoleTemplate(role: Role) {
    if (role === this.formBaseRole) return; // already selected — don't wipe previously granted extras
    this.formBaseRole = role;
    this.formRoleLabel = ROLE_LABELS[role];
    this.formPermissions = []; // switching templates resets any extras from the previous role
  }

  isStandardPermission(key: string): boolean {
    if (this.formBaseRole === 'admin' || this.formBaseRole === 'manager') return true;
    return ROLE_STANDARD_PERMISSIONS[this.formBaseRole].includes(key);
  }

  isPermissionChecked(key: string): boolean {
    return this.isStandardPermission(key) || this.formPermissions.includes(key);
  }

  togglePermission(key: string) {
    if (this.isStandardPermission(key)) return; // locked in by the role template
    const idx = this.formPermissions.indexOf(key);
    if (idx >= 0) this.formPermissions.splice(idx, 1);
    else this.formPermissions.push(key);
  }

  toggleOwnedProduct(p: string) {
    const idx = this.formOwnedProducts.indexOf(p);
    if (idx >= 0) this.formOwnedProducts.splice(idx, 1);
    else this.formOwnedProducts.push(p);
  }

  toggleAllOwnedProducts() {
    this.formOwnedProducts = this.formOwnedProducts.length === this.productOptions.length ? [] : [...this.productOptions];
  }

  private autoInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  private validate(): string | null {
    if (!this.isEditing() && !this.formEmployeeId.trim()) return 'Employee ID is required.';
    if (!this.formName.trim()) return 'Name is required.';
    if (!this.isEditing() && !this.formPassword.trim()) return 'Password is required for new users.';
    return null;
  }

  async submit() {
    const error = this.validate();
    if (error) {
      this.toast.error(error);
      return;
    }

    this.saving.set(true);
    try {
      const permissions = [...new Set([...ROLE_STANDARD_PERMISSIONS[this.formBaseRole], ...this.formPermissions])];

      if (this.isEditing()) {
        const id = this.editingId()!;
        await this.api.updateUser(id, {
          name: this.formName.trim(),
          initials: this.formInitials.trim() || this.autoInitials(this.formName),
          department: this.formDepartment,
          baseRole: this.formBaseRole,
          roleLabel: this.formRoleLabel.trim() || ROLE_LABELS[this.formBaseRole],
          permissions,
          ownedProducts: this.formOwnedProducts,
          isActive: this.formIsActive,
          ...(this.formPassword.trim() ? { password: this.formPassword.trim() } : {}),
        });
        this.toast.success('User updated successfully.');
      } else {
        const payload: NewUserPayload = {
          employeeId: this.formEmployeeId.trim().toUpperCase(),
          name: this.formName.trim(),
          initials: this.formInitials.trim() || this.autoInitials(this.formName),
          department: this.formDepartment,
          baseRole: this.formBaseRole,
          roleLabel: this.formRoleLabel.trim() || ROLE_LABELS[this.formBaseRole],
          password: this.formPassword.trim(),
          ownedProducts: this.formOwnedProducts,
          permissions,
        };
        await this.api.createUser(payload);
        this.toast.success('User created successfully.');
      }

      this.loadUsers();
      this.authService.refreshUsers();
      this.modalOpen.set(false);
    } catch (err: any) {
      this.toast.error(err?.error?.message || 'Failed to save user. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(u: User) {
    try {
      await this.api.updateUser(u.employeeId, { isActive: !(u.isActive !== false) });
      this.toast.success(u.isActive !== false ? 'User deactivated.' : 'User reactivated.');
      this.loadUsers();
      this.authService.refreshUsers();
    } catch {
      this.toast.error('Failed to update user status. Please try again.');
    }
  }
}
