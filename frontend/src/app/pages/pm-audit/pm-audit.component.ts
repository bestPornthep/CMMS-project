import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PmService } from '../../core/services/pm.service';

@Component({
  selector: 'app-pm-audit',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pm-audit.component.html',
  styleUrl: './pm-audit.component.scss'
})
export class PmAuditComponent {
  private pmService = inject(PmService);

  // Get tasks that are 'Done' and need audit
  doneTasks = computed(() => {
    return this.pmService.pmTasks().filter(t => t.status === 'Done');
  });

  approveTask(id: string) {
    alert('Task ' + id + ' approved!');
    // In a real app we might change status to 'Audited' or 'Closed'
    // For now, we just leave it as Done.
  }

  rejectTask(id: string) {
    alert('Task ' + id + ' rejected! Re-opening.');
    this.pmService.updateTask({
      ...this.pmService.pmTasks().find(t => t.id === id)!,
      status: 'In Progress'
    });
  }
}
