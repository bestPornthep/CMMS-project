import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PmService } from '../../core/services/pm.service';

@Component({
  selector: 'app-pm-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pm-calendar.component.html',
  styleUrl: './pm-calendar.component.scss'
})
export class PmCalendarComponent {
  private pmService = inject(PmService);

  // Expose the tasks for the calendar view
  tasks = this.pmService.pmTasks;

  // We'll just generate some dynamic list for the sidebar
  upcomingTasks = computed(() => {
    return this.tasks().filter(t => t.status !== 'Done').slice(0, 5);
  });
}
