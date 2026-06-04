import { Component, computed, inject, signal, HostListener } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';
import { PMTask } from '../../core/models/pm.model';

@Component({
  selector: 'app-pm-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './pm-calendar.component.html',
  styleUrl: './pm-calendar.component.scss'
})
export class PmCalendarComponent {
  private pmService = inject(PmService);
  private authService = inject(AuthService);
  private datePipe = inject(DatePipe);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // State
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

    this.route.queryParams.subscribe(params => {
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
    
    if (this.currentUser?.baseRole !== 'technician') {
      if (task.status === 'Pending Approval' || task.status === 'Done') {
        this.router.navigate(['/pm-record'], { queryParams: { task: taskId } });
      } else {
        if (fromSidebar) {
          this.highlightTask(taskId);
        } else {
          this.pmService.viewedTaskGlobal.set(task);
        }
      }
      return;
    }

    this.router.navigate(['/pm-record'], { queryParams: { task: taskId } });
  }

  highlightTask(taskId: string) {
    this.highlightedTaskId.set(taskId);
    const task = this.pmService.pmTasks().find(t => t.id === taskId);
    if (task && task.nextDueDate) {
      const d = new Date(task.nextDueDate);
      this.currentDate.set(new Date(d.getFullYear(), d.getMonth(), 1));
      setTimeout(() => {
        const el = document.getElementById('task-' + taskId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Clear highlight after animation (2s)
        setTimeout(() => {
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
      const allowedProducts = this.authService.getAccessibleProducts('pm.calendar.view');
      tasks = tasks.filter(t => t.department === user.department && allowedProducts.includes(t.productId || ''));
      tasks = tasks.filter(t => {
        if (t.createdBy && t.createdBy !== user.employeeId) {
          const creator = this.authService.getUser(t.createdBy);
          if (creator && creator.baseRole === 'engineer') return false;
        }
        return true;
      });
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
      scheduled: monthTasks.length + overdue,
      completed,
      overdue,
      pendingApproval
    };
  });
}
