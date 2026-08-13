import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { Component, computed, inject, signal, HostListener, OnDestroy, DestroyRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';
import { PMTask } from '../../core/models/pm.model';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-pm-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  providers: [DatePipe],
  templateUrl: './pm-calendar.component.html',
  styleUrl: './pm-calendar.component.scss'
})
export class PmCalendarComponent implements OnDestroy {
  private pmService = inject(PmService);
  private authService = inject(AuthService);
  private datePipe = inject(DatePipe);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  // State
  private isDestroyed = false; // E3 fix: guard async timeouts
  currentDate = signal(new Date());
  realToday = new Date();
  dropdownOpen = false;
  highlightedTaskId = signal<string | null>(null);

  // Filters
  selectedDept = signal('All');
  filterScheduled = signal(true);
  filterDone = signal(true);
  filterOverdue = signal(true);

  constructor() {
    // Initialize department if the user is locked
    const user = this.authService.currentUser();
    if (user && user.baseRole !== 'manager' && user.baseRole !== 'admin') {
      this.selectedDept.set(user.department || 'All');
    }

    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const taskId = params['task'];
      if (taskId) {
        this.highlightTask(taskId);
      } else {
        this.highlightedTaskId.set(null);
      }
    });
  }

  get currentUser() {
    return this.authService.currentUser();
  }

  get canChangeDept() {
    const role = this.currentUser?.baseRole;
    return role === 'manager' || role === 'admin';
  }

  @HostListener('document:click')
  closeDropdowns() {
    this.dropdownOpen = false;
  }

  toggleDropdown(event: Event) {
    if (!this.canChangeDept) return;
    event.stopPropagation();
    this.dropdownOpen = !this.dropdownOpen;
  }

  setDepartment(dept: string) {
    if (!this.canChangeDept) return;
    this.selectedDept.set(dept);
  }

  // Navigation
  prevMonth() {
    this.currentDate.update(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  nextMonth() {
    this.currentDate.update(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  goToToday() {
    this.currentDate.set(new Date());
  }

  get currentMonthLabel() {
    return this.datePipe.transform(this.currentDate(), 'MMMM yyyy');
  }
  
  goToRecord(taskId: string, fromSidebar: boolean = false) {
    const task = this.pmService.pmTasks().find(t => t.id === taskId);
    if (!task) return;
    
    // Authorization check: Engineers can see all dept tasks on calendar, but can only click/open tasks they own
    const user = this.currentUser;
    if (user?.baseRole === 'engineer') {
      const allowedProducts = this.authService.getAccessibleProducts('pm.calendar.view');
      const ownsProduct = allowedProducts.includes(task.productId || '') || (user.ownedProducts && user.ownedProducts.includes('*'));
      
      let createdByOtherEngineer = false;
      if (task.createdBy && task.createdBy !== user.employeeId) {
        const creator = this.authService.getUser(task.createdBy);
        if (creator && creator.baseRole === 'engineer') {
          createdByOtherEngineer = true;
        }
      }

      if (!ownsProduct || createdByOtherEngineer) {
        // Visual only, not authorized to view details
        return;
      }
    }

    if (user?.baseRole !== 'technician') {
      if (task.status === 'Pending Approval') {
        // Redirect to Approval Records (pm-record action tab)
        this.router.navigate(['/pm-record'], { queryParams: { task: taskId } });
      } else if (task.status === 'Done') {
        // Only Done task gets the modal
        this.pmService.viewedTaskGlobal.set(task);
      } else if (fromSidebar) {
        // Scheduled and Overdue, clicked from the sidebar — stay on the calendar and
        // just scroll/highlight the matching day cell, no modal, no navigation.
        this.highlightTask(taskId);
      } else {
        // Scheduled and Overdue, clicked in the grid — show details/assign in the modal
        // instead of leaving the page.
        this.pmService.viewedTaskGlobal.set(task);
      }
      return;
    }

    // Technicians: Done tasks are read-only history, shown in the same shared modal as
    // every other role. Anything still in flight is executed in Record PM.
    if (task.status === 'Done') {
      this.pmService.viewedTaskGlobal.set(task);
      return;
    }
    this.router.navigate(['/pm-record'], { queryParams: { task: taskId } });
  }

  ngOnDestroy() {
    this.isDestroyed = true; // E3 fix: prevents stale timeout from navigating on the wrong page
  }

  highlightTask(taskId: string) {
    this.highlightedTaskId.set(taskId);
    const task = this.pmService.pmTasks().find(t => t.id === taskId);
    if (task && task.nextDueDate) {
      const d = new Date(task.nextDueDate);
      this.currentDate.set(new Date(d.getFullYear(), d.getMonth(), 1));
      setTimeout(() => {
        if (this.isDestroyed) return; // E3 fix
        const el = document.getElementById('task-' + taskId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Clear highlight after animation (2s)
        setTimeout(() => {
          if (this.isDestroyed) return; // E3 fix
          this.highlightedTaskId.set(null);
          this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { task: null },
            queryParamsHandling: 'merge',
            replaceUrl: true
          });
        }, 2500);
      }, 100);
    }
  }

  // Filtering Logic
  filteredTasks = computed(() => {
    const user = this.currentUser;
    if (!user) return [];
    
    let tasks = this.pmService.pmTasks();

    // 1. Role Based Department/Product Filtering
    if (user.baseRole === 'technician') {
      tasks = tasks.filter(t => t.department === user.department && t.assignedTo === user.employeeId);
    } else if (user.baseRole === 'engineer') {
      // Engineers see all tasks in their department so they can gauge technician workload.
      // Click access is restricted in goToRecord()
      tasks = tasks.filter(t => t.department === user.department);
    } else {
      // Manager/Admin uses the dropdown
      const dept = this.selectedDept();
      if (dept !== 'All') {
        tasks = tasks.filter(t => t.department === dept);
      }
    }

    // 2. Status Checkbox Filters
    tasks = tasks.filter(t => {
      if (t.status === 'Done') return this.filterDone();
      if (t.status === 'Overdue') return this.filterOverdue();
      return this.filterScheduled(); // Pending, In Progress, Pending Approval
    });

    return tasks;
  });

  // Calendar Generation
  calendarDays = computed(() => {
    const date = this.currentDate();
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // 0 = Sunday, we want Monday as first column (0 = Mon, ..., 6 = Sun)
    let startOffset = firstDay.getDay() - 1;
    if (startOffset === -1) startOffset = 6; // Sunday becomes 6
    
    const todayStr = new Date().toDateString();
    const days = [];
    const tasks = this.filteredTasks();

    // Pad previous month
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthDays - i);
      days.push(this.buildDay(d, tasks, todayStr, false));
    }

    // Current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push(this.buildDay(d, tasks, todayStr, true));
    }

    // Pad next month
    let nextMonthDay = 1;
    while (days.length % 7 !== 0) {
      const d = new Date(year, month + 1, nextMonthDay++);
      days.push(this.buildDay(d, tasks, todayStr, false));
    }

    return days;
  });

  private buildDay(date: Date, tasks: PMTask[], todayStr: string, isCurrentMonth: boolean) {
    const dayTasks = tasks.filter(t => {
      // Use completedAt for Done tasks if available, otherwise nextDueDate
      const compareDate = (t.status === 'Done' && t.completedAt) ? new Date(t.completedAt) : new Date(t.nextDueDate);
      return compareDate.getFullYear() === date.getFullYear() &&
             compareDate.getMonth() === date.getMonth() &&
             compareDate.getDate() === date.getDate();
    });

    return {
      date: date.getDate(),
      fullDate: date,
      isToday: date.toDateString() === todayStr,
      isCurrentMonth,
      tasks: dayTasks
    };
  }

  // Sidebar Data
  overdueTasks = computed(() => {
    return this.filteredTasks().filter(t => t.status === 'Overdue');
  });

  todayTasks = computed(() => {
    const today = new Date();
    return this.filteredTasks().filter(t => {
      if (t.status === 'Done') return false; // Don't show done tasks in today's upcoming
      const d = new Date(t.nextDueDate);
      return d.getFullYear() === today.getFullYear() && 
             d.getMonth() === today.getMonth() && 
             d.getDate() === today.getDate();
    });
  });

  monthSummary = computed(() => {
    const date = this.currentDate();
    const monthTasks = this.filteredTasks().filter(t => {
      const compareDate = (t.status === 'Done' && t.completedAt) ? new Date(t.completedAt) : new Date(t.nextDueDate);
      return compareDate.getFullYear() === date.getFullYear() && compareDate.getMonth() === date.getMonth();
    });

    const completed = monthTasks.filter(t => t.status === 'Done').length;
    const pendingApproval = monthTasks.filter(t => t.status === 'Pending Approval').length;
    const overdue = this.overdueTasks().length;

    return {
      scheduled: monthTasks.length,
      completed,
      overdue,
      pendingApproval
    };
  });
}

