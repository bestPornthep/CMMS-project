import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PmService } from '../../core/services/pm.service';
import { PMTask } from '../../core/models/pm.model';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-pm-assign',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pm-assign.component.html',
  styleUrl: './pm-assign.component.scss'
})
export class PmAssignComponent {
  private pmService = inject(PmService);

  // Computed signals
  allTasks = this.pmService.pmTasks;
  
  // Get only pending tasks to assign
  pendingTasks = computed(() => {
    return this.allTasks().filter(t => t.status === 'Pending');
  });

  // Example technicians
  technicians = ['J. Doe', 'S. Miller', 'R. Jones', 'A. Lee', 'T. Smith'];

  // Keep track of which tech is selected for which task
  selectedTech: Record<string, string> = {};
  activeTab: string = 'unassigned';

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
}
