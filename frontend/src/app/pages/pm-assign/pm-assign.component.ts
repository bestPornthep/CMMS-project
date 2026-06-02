import { Component, computed, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PmService } from '../../core/services/pm.service';
import { PMTask } from '../../core/models/pm.model';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-pm-assign',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pm-assign.component.html',
  styleUrl: './pm-assign.component.scss'
})
export class PmAssignComponent {
  private pmService = inject(PmService);
  private authService = inject(AuthService);

  get currentUser() { return this.authService.currentUser(); }
  get canChangeDept() {
    const role = this.currentUser?.baseRole;
    return role === 'admin' || role === 'manager';
  }

  constructor() {
    if (!this.canChangeDept && this.currentUser?.department) {
      this.deptFilter.set(this.currentUser.department);
    }
  }

  // Computed signals
  allTasks = this.pmService.pmTasks;
  
  // Department filter
  deptFilter = signal<string>('All');

  // Computed assigned tasks filtered by department
  assignedTasks = computed(() => {
    let tasks = this.allTasks().filter(t => t.status !== 'Pending');
    const dept = this.deptFilter();
    if (dept !== 'All') {
      tasks = tasks.filter(t => t.department === dept);
    }
    return tasks;
  });

  // Get only pending tasks to assign, filtered by department
  pendingTasks = computed(() => {
    let tasks = this.allTasks().filter(t => t.status === 'Pending');
    const dept = this.deptFilter();
    if (dept !== 'All') {
      tasks = tasks.filter(t => t.department === dept);
    }
    return tasks;
  });

  // Dynamically populated technicians based on delegation rules
  technicians = computed(() => {
    return this.authService.getAllUsers()
      .filter(u => u.employeeId && this.authService.canDelegate(u.employeeId))
      .map(u => u.name!);
  });

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
  bulkAssignee = signal<string>('');
  showBulkModal = signal<boolean>(false);

  toggleSelection(taskId: string) {
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

  toggleAllSelection(event: any) {
    const checked = event.target.checked;
    if (checked) {
      const allIds = this.pendingTasks().map(t => t.id);
      this.selectedTasks.set(new Set(allIds));
    } else {
      this.selectedTasks.set(new Set());
    }
  }

  openBulkAssignModal() {
    if (this.selectedTasks().size === 0) {
      alert('Please select at least one task.');
      return;
    }
    if (!this.bulkAssignee()) {
      alert('Please select a technician to assign.');
      return;
    }
    this.showBulkModal.set(true);
  }

  confirmBulkAssign() {
    const tech = this.bulkAssignee();
    const taskIds = this.selectedTasks();
    
    // Update all selected tasks
    const tasks = this.allTasks();
    for (const task of tasks) {
      if (taskIds.has(task.id)) {
        this.pmService.updateTask({
          ...task,
          status: 'In Progress',
          assignedTo: tech
        });
      }
    }
    
    // Reset state
    this.showBulkModal.set(false);
    this.selectedTasks.set(new Set());
    this.bulkAssignee.set('');
  }

  assignTask(task: PMTask) {
    const tech = this.selectedTech[task.id];
    if (!tech) {
      alert('Please select a technician first.');
      return;
    }
    
    // Update the task status to In Progress
    this.pmService.updateTask({
      ...task,
      status: 'In Progress',
      assignedTo: tech
    });
  }

  // --- Delegations ---
  delegations = signal<any[]>([]);
  newDelegationUsers = signal<string[]>([]);
  newDelegationProducts = signal<string[]>([]);
  newDelegationDuration = signal<number>(30);

  grantDelegation() {
    const users = this.newDelegationUsers();
    const products = this.newDelegationProducts();
    const duration = Number(this.newDelegationDuration());

    if (users.length === 0 || products.length === 0 || isNaN(duration) || duration <= 0) {
      alert('Please select users, products, and a valid duration.');
      return;
    }

    if (duration > 365) {
      alert('Maximum duration allowed is 365 days (1 year).');
      return;
    }

    const activeUsers = users.filter(user => 
      this.delegations().some(d => d.user === user)
    );

    if (activeUsers.length > 0) {
      alert(`The following users already have active permissions: ${activeUsers.join(', ')}. Please revoke their existing permissions first.`);
      return;
    }

    const newDelegations: any[] = [];
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + duration);

    for (const user of users) {
      newDelegations.push({
        id: Math.random().toString(36).substring(2, 9),
        user,
        products: [...products],
        validUntil
      });
    }

    this.delegations.update(d => [...newDelegations, ...d]);
    
    // Reset form
    this.newDelegationUsers.set([]);
    this.newDelegationProducts.set([]);
    this.newDelegationDuration.set(30);
  }

  revokeDelegation(id: string) {
    this.delegations.update(d => d.filter(x => x.id !== id));
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
      this.newDelegationUsers.set([...allUsers]);
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
