import { Component, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PmService } from '../../core/services/pm.service';
import { PMTask } from '../../core/models/pm.model';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { TranslationService } from '../../core/services/translation.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private pmService = inject(PmService);
  private authService = inject(AuthService);
  public translationService = inject(TranslationService);
  
  tasks = computed(() => {
    const user = this.authService.currentUser();
    const allTasks = this.pmService.pmTasks();
    if (!user) return [];
    
    if (user.baseRole === 'admin' || user.baseRole === 'manager') {
      return allTasks;
    }
    
    if (user.baseRole === 'engineer') {
      return allTasks.filter(t => t.department === user.department);
    }
    
    if (user.baseRole === 'technician') {
      return allTasks.filter(t => t.assignedTo === user.employeeId);
    }
    
    return [];
  });
  
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
    return this.tasks().filter(t => t.status === 'In Progress' || t.assignedTo).length;
  });

  // Recent activity stream (last 5 done or assigned)
  recentActivity = computed(() => {
    return [...this.tasks()]
      .filter(t => t.createdAt)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, 5);
  });


  // Critical Work Orders (Top 4 most urgent/overdue)
  criticalWorkOrders = computed(() => {
    return [...this.tasks()]
      .filter(t => t.status === 'Overdue' || t.status === 'Pending')
      .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime())
      .slice(0, 4);
  });

  // Dynamic Chart Data (Simulating a 7-day lookback)
  chartData = computed(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    // Mock a distribution using real task counts as a base multiplier
    const baseMultiplier = Math.max(1, Math.floor(this.totalWorkOrders() / 10));
    
    return days.map((day, i) => {
      // Create some pseudo-random but deterministic data based on day index
      const cm = Math.floor(Math.abs(Math.sin(i + 1) * 20 * baseMultiplier)) + 10;
      const pm = Math.floor(Math.abs(Math.cos(i + 1) * 30 * baseMultiplier)) + 15;
      const em = Math.floor(Math.abs(Math.sin(i + 3) * 10 * baseMultiplier)) + 5;
      const total = cm + pm + em;
      
      return {
        label: day,
        cmPct: `${(cm / total) * 100}%`,
        pmPct: `${(pm / total) * 100}%`,
        emPct: `${(em / total) * 100}%`,
        cmCount: cm,
        pmCount: pm,
        emCount: em
      };
    });
  });
  
  chartTotals = computed(() => {
    const data = this.chartData();
    const cmTotal = data.reduce((sum, d) => sum + d.cmCount, 0);
    const pmTotal = data.reduce((sum, d) => sum + d.pmCount, 0);
    const emTotal = data.reduce((sum, d) => sum + d.emCount, 0);
    const grandTotal = cmTotal + pmTotal + emTotal;
    
    return {
      cm: cmTotal,
      pm: pmTotal,
      em: emTotal,
      cmPctStr: `${Math.round((cmTotal / grandTotal) * 100)}%`,
      pmPctStr: `${Math.round((pmTotal / grandTotal) * 100)}%`,
      emPctStr: `${Math.round((emTotal / grandTotal) * 100)}%`
    };
  });

  ngOnInit() {
    setTimeout(() => {
      document.querySelectorAll('[data-enter]').forEach((el: any, i) => {
        el.style.animationDelay = `${i * 60}ms`;
        el.classList.add('anim-enter');
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
