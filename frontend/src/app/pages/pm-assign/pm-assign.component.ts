import { Component, computed, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PmService } from '../../core/services/pm.service';
import { PMTask } from '../../core/models/pm.model';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-pm-assign',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './pm-assign.component.html',
  styleUrl: './pm-assign.component.scss'
})
export class PmAssignComponent {
  private pmService = inject(PmService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  get currentUser() { return this.authService.currentUser(); }
  get canChangeDept() {
    const role = this.currentUser?.baseRole;
    return role === 'admin' || role === 'manager';
  }
  
  canManageDelegations = computed(() => {
    return this.authService.hasPermission('pm.permission.delegate');
  });

  constructor() {
    if (!this.canChangeDept && this.currentUser?.department) {
      this.deptFilter.set(this.currentUser.department);
    }
  }

  deptFilter = signal<string>('All');

  // Computed assigned tasks filtered by department
  assignedTasks = computed(() => {
    let tasks = this.pmService.pmTasks().filter(t => t.status !== 'Pending' && this.canManageTask(t));
    const dept = this.deptFilter();
    if (dept !== 'All') tasks = tasks.filter(t => t.department === dept);
    return tasks;
  });

  pendingTasks = computed(() => {
    let tasks = this.pmService.pmTasks().filter(t => t.status === 'Pending' && this.canManageTask(t));
    const dept = this.deptFilter();
    if (dept !== 'All') tasks = tasks.filter(t => t.department === dept);
    return tasks;
  });

  // Dynamically populated technicians based on assignment rules
  technicians = computed(() => {
    const user = this.currentUser;
    if (!user) return [];
    
    return this.authService.getAllUsers().filter(u => {
       if (!u.employeeId || u.baseRole !== 'technician') return false;
       if (user.baseRole === 'admin' || user.baseRole === 'manager') return true;
       return u.department === user.department;
    });
  });

  getTechName(employeeId?: string): string {
    if (!employeeId) return 'Unassigned';
    const tech = this.authService.getAllUsers().find(u => u.employeeId === employeeId);
    return tech?.name || employeeId;
  }

  getTaskTechnicians(task: PMTask) {
    return this.authService.getAllUsers().filter(u => {
      if (!u.employeeId || u.baseRole !== 'technician') return false;
      // Always restrict by task department to protect against human error
      return u.department === task.department;
    });
  }

  getBulkTechnicians() {
    const selectedIds = Array.from(this.selectedTasks());
    const tasks = this.pendingTasks().filter(t => selectedIds.includes(t.id));
    const depts = new Set(tasks.map(t => t.department));
    
    return this.authService.getAllUsers().filter(u => {
      if (!u.employeeId || u.baseRole !== 'technician') return false;
      if (depts.size === 0) return true;
      // If multiple departments are selected, we shouldn't allow bulk assign to prevent cross-dept error
      if (depts.size > 1) return false;
      return depts.has(u.department);
    });
  }

  getTechWorkload(techId: string): number {
    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    const tasks = this.pmService.pmTasks().filter((t: PMTask) => 
      t.assignedTo === techId && 
      t.status !== 'Done' && 
      new Date(t.nextDueDate) <= thirtyDaysFromNow
    );

    const totalHours = tasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
    return Math.round((totalHours / 70) * 100);
  }

  getTechNameWithWorkload(employeeId?: string): string {
    if (!employeeId) return 'Unassigned';
    const tech = this.authService.getAllUsers().find(u => u.employeeId === employeeId);
    if (!tech) return employeeId;
    const workload = this.getTechWorkload(employeeId);
    return `${tech.name} (${workload}%)`;
  }

  getCreatorName(employeeId?: string): string {
    if (!employeeId) return 'System';
    const user = this.authService.getAllUsers().find(u => u.employeeId === employeeId);
    return user?.name || employeeId;
  }

  // Dynamically populated products based on access rules
  products = computed(() => {
    return this.authService.getAccessibleProducts('pm.permission.delegate');
  });

  // Keep track of which tech is selected for which task
  selectedTech: Record<string, string> = {};
  techDropdownOpen: Record<string, boolean> = {};
  activeTab: string = 'unassigned';

  // Dropdown states
  bulkDropdownOpen = false;
  deptDropdownOpen = false;
  delegationUserDropdownOpen = false;
  delegationProductDropdownOpen = false;

  toggleDropdown(dropdownName: string, event: Event) {
    event.stopPropagation();
    
    const wasOpen = (() => {
      switch (dropdownName) {
        case 'bulk': return this.bulkDropdownOpen;
        case 'dept': return this.deptDropdownOpen;
        case 'delegationUser': return this.delegationUserDropdownOpen;
        case 'delegationProduct': return this.delegationProductDropdownOpen;
        default: return false;
      }
    })();

    this.bulkDropdownOpen = false;
    this.deptDropdownOpen = false;
    this.delegationUserDropdownOpen = false;
    this.delegationProductDropdownOpen = false;

    if (!wasOpen) {
      switch (dropdownName) {
        case 'bulk': this.bulkDropdownOpen = true; break;
        case 'dept': this.deptDropdownOpen = true; break;
        case 'delegationUser': this.delegationUserDropdownOpen = true; break;
        case 'delegationProduct': this.delegationProductDropdownOpen = true; break;
      }
    }
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.bulkDropdownOpen = false;
    this.deptDropdownOpen = false;
    this.techDropdownOpen = {};
    this.delegationUserDropdownOpen = false;
    this.delegationProductDropdownOpen = false;
  }

  // Track selected tasks for bulk actions
  selectedTasks = signal<Set<string>>(new Set());
  bulkAssignee = signal<any>(null);
  showBulkModal = signal<boolean>(false);

  canManageTask(task: PMTask): boolean {
    const user = this.currentUser;
    if (!user) return false;
    if (user.baseRole === 'admin' || user.baseRole === 'manager') return true;
    
    if (user.baseRole === 'engineer') {
      if (user.ownedProducts && !(user.ownedProducts.includes('*') || user.ownedProducts.includes(task.productId!))) {
         return false;
      }
      if (task.createdBy && task.createdBy !== user.employeeId) {
         const creator = this.authService.getUser(task.createdBy);
         if (creator && creator.baseRole === 'engineer') {
            return false;
         }
      }
      return true;
    }
    
    if (user.baseRole === 'technician') {
      const allowedProducts = this.authService.getAccessibleProducts('pm.assign.submit');
      if (allowedProducts.length === 0) return false;
      return user.department === task.department && allowedProducts.includes(task.productId || '');
    }
    
    return false;
  }

  toggleSelection(taskId: string) {
    const task = this.pmService.pmTasks().find(t => t.id === taskId);
    if (task && !this.canManageTask(task)) {
      this.toast.error('You cannot manage or reassign work owned by another Engineer or outside your responsibility.');
      return;
    }
    this.selectedTasks.update(set => {
      const newSet = new Set(set);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  }

  viewTaskDetails(task: PMTask) {
    this.pmService.viewedTaskGlobal.set(task);
  }

  toggleAllSelection(event: any) {
    const checked = event.target.checked;
    if (checked) {
      const manageableIds = this.pendingTasks()
        .filter(t => this.canManageTask(t))
        .map(t => t.id);
      this.selectedTasks.set(new Set(manageableIds));
    } else {
      this.selectedTasks.set(new Set());
    }
  }

  openBulkAssignModal() {
    if (this.selectedTasks().size === 0) {
      this.toast.warning('Please select at least one task.');
      return;
    }
    if (!this.bulkAssignee()) {
      this.toast.warning('Please select a technician to assign.');
      return;
    }
    this.showBulkModal.set(true);
  }

  confirmBulkAssign() {
    const tech = this.bulkAssignee();
    const taskIds = this.selectedTasks();
    
    // Update all selected tasks
    const tasks = this.pmService.pmTasks();
    for (const task of tasks) {
      if (taskIds.has(task.id)) {
        // Validate Product-Asset match before assignment
        const asset = this.pmService.assets().find(a => a.id === task.assetId);
        if (!asset || asset.location !== task.productId) {
           this.toast.error(`Task ${task.id} has a Product-Asset mismatch and cannot be assigned.`);
           return;
        }

        this.pmService.updateTask({
          ...task,
          assignedTo: tech.employeeId,
          status: 'In Progress',
          assignedAt: new Date(),
          assignedBy: this.currentUser?.employeeId
        });
      }
    }
    
    // Reset state
    this.showBulkModal.set(false);
    this.selectedTasks.set(new Set());
    this.bulkAssignee.set('');
  }

  assignTask(task: PMTask) {
    if (!this.canManageTask(task)) {
      this.toast.error('You cannot manage or reassign work owned by another Engineer or outside your responsibility.');
      return;
    }
    
    // Validate Product-Asset match before assignment
    const asset = this.pmService.assets().find(a => a.id === task.assetId);
    if (!asset || asset.location !== task.productId) {
      this.toast.error('Cannot assign task due to Product-Asset mismatch in the task record.');
      return;
    }

    const tech = this.selectedTech[task.id];
    if (!tech) {
      this.toast.warning('Please select a technician first.');
      return;
    }
    
    // Update the task status to In Progress
    this.pmService.updateTask({
      ...task,
      status: 'In Progress',
      assignedTo: tech,
      assignedAt: new Date(),
      assignedBy: this.currentUser?.employeeId
    });
  }

  // --- Delegations ---
  delegations = signal<any[]>(this.authService.getActiveDelegations());
  newDelegationUsers = signal<string[]>([]);
  newDelegationProducts = signal<string[]>([]);
  newDelegationDuration = signal<number>(30);

  grantDelegation() {
    const users = this.newDelegationUsers();
    const products = this.newDelegationProducts();
    const duration = Number(this.newDelegationDuration());

    if (users.length === 0 || products.length === 0 || isNaN(duration) || duration <= 0) {
      this.toast.warning('Please select users, products, and a valid duration.');
      return;
    }

    if (duration > 365) {
      this.toast.warning('Maximum duration allowed is 365 days (1 year).');
      return;
    }

    // Check if any of the selected users already have an active delegation for any of the selected products
    const conflicts: string[] = [];
    for (const user of users) {
      const existingUserDelegations = this.delegations().filter(d => d.employeeId === user || d.user === user);
      for (const p of products) {
        if (existingUserDelegations.some(d => d.products.includes(p))) {
           const userName = existingUserDelegations[0].user || user;
           conflicts.push(`${userName} (${p})`);
        }
      }
    }

    if (conflicts.length > 0) {
      this.toast.warning(`The following users already have active permissions for these products: ${conflicts.join(', ')}. Please revoke their existing permissions first or unselect those products.`);
      return;
    }

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + duration);

    this.authService.grantDelegation(users, products, validUntil);
    this.delegations.set(this.authService.getActiveDelegations());
    
    // Reset form
    this.newDelegationUsers.set([]);
    this.newDelegationProducts.set([]);
    this.newDelegationDuration.set(30);
  }

  revokeDelegation(id: string) {
    this.authService.revokeDelegation(id);
    this.delegations.set(this.authService.getActiveDelegations());
  }

  toggleDelegationUser(user: string) {
    this.newDelegationUsers.update(users => {
      if (users.includes(user)) return users.filter(u => u !== user);
      return [...users, user];
    });
  }

  toggleAllDelegationUsers() {
    const allUsers = this.technicians();
    if (this.newDelegationUsers().length === allUsers.length) {
      this.newDelegationUsers.set([]);
    } else {
      this.newDelegationUsers.set(allUsers.map(u => u.employeeId!));
    }
  }

  removeDelegationUser(index: number) {
    this.newDelegationUsers.update(users => users.filter((_, i) => i !== index));
  }

  toggleDelegationProduct(product: string) {
    this.newDelegationProducts.update(products => {
      if (products.includes(product)) return products.filter(p => p !== product);
      return [...products, product];
    });
  }

  toggleAllDelegationProducts() {
    const allProducts = this.products();
    if (this.newDelegationProducts().length === allProducts.length) {
      this.newDelegationProducts.set([]);
    } else {
      this.newDelegationProducts.set([...allProducts]);
    }
  }

  removeDelegationProduct(index: number) {
    this.newDelegationProducts.update(products => products.filter((_, i) => i !== index));
  }
}
