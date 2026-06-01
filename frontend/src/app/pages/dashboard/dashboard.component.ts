import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PmService } from '../../core/services/pm.service';
import { PMTask } from '../../core/models/pm.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private pmService = inject(PmService);
  
  tasks = this.pmService.pmTasks;
  
  // Computed KPI Metrics from actual live data
  totalWorkOrders = computed(() => this.tasks().length);
  
  pendingActions = computed(() => {
    return this.tasks().filter(t => t.status === 'Pending' || t.status === 'In Progress').length;
  });
  
  overdueActions = computed(() => {
    return this.tasks().filter(t => t.status === 'Overdue').length;
  });
  
  pmCompliance = computed(() => {
    const all = this.tasks().length;
    if (all === 0) return 0;
    const completed = this.tasks().filter(t => t.status === 'Done').length;
    return Math.round((completed / all) * 100);
  });
  
  assignedTasks = computed(() => {
    return this.tasks().filter(t => t.status === 'In Progress').length;
  });

  // Recent activity stream (last 5 done or assigned)
  recentActivity = computed(() => {
    return [...this.tasks()]
      .filter(t => t.createdAt)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, 5);
  });

  ngOnInit() {
    // Re-implement the staggered entrance logic purely in TS/DOM if needed, 
    // or just rely on CSS animation.
    setTimeout(() => {
      document.querySelectorAll('[data-enter]').forEach((el: any, i) => {
        el.style.animationDelay = `${i * 60}ms`;
        el.classList.add('anim-enter');
      });
      
      document.querySelectorAll('.health-bar-fill[data-width]').forEach((bar: any, i) => {
        const targetWidth = bar.getAttribute('data-width');
        const pct = parseInt(targetWidth);
        const color = pct >= 70 ? 'var(--success-mid)' : pct >= 50 ? 'var(--warning-mid)' : 'var(--error-mid)';
        bar.style.background = color;
    
        setTimeout(() => {
          bar.style.transition = `width 700ms cubic-bezier(0.16, 1, 0.3, 1)`;
          bar.style.width = targetWidth;
        }, 400 + i * 80);
      });
    }, 50);
  }

  getRelativeTime(dateInput: Date | undefined): string {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const hours = Math.floor(diffMins / 60);
    if (hours < 24) return hours === 1 ? '1 hr ago' : `${hours} hrs ago`;
    return `${Math.floor(hours/24)} days ago`;
  }
}
