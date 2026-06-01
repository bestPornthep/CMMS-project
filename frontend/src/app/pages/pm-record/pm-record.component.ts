import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PmService } from '../../core/services/pm.service';
import { PMTask } from '../../core/models/pm.model';

@Component({
  selector: 'app-pm-record',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pm-record.component.html',
  styleUrl: './pm-record.component.scss'
})
export class PmRecordComponent {
  private pmService = inject(PmService);

  // Get tasks that are in progress
  inProgressTasks = computed(() => {
    return this.pmService.pmTasks().filter(t => t.status === 'In Progress');
  });

  selectedTask: PMTask | null = null;
  completionNotes = '';

  selectTask(task: PMTask) {
    this.selectedTask = task;
  }

  toggleChecklist(index: number) {
    if (this.selectedTask && this.selectedTask.checklist) {
      this.selectedTask.checklist[index].done = !this.selectedTask.checklist[index].done;
    }
  }

  get allChecked(): boolean {
    if (!this.selectedTask || !this.selectedTask.checklist) return false;
    return this.selectedTask.checklist.every(item => item.done);
  }

  submitRecord() {
    if (!this.selectedTask) return;
    if (!this.allChecked) {
      alert("Please complete all checklist items before submitting.");
      return;
    }

    this.pmService.updateTask({
      ...this.selectedTask,
      status: 'Done',
      completedAt: new Date(),
      completedBy: this.selectedTask.assignedTo || 'Current User'
    });

    alert('PM Work Order successfully recorded!');
    this.selectedTask = null;
    this.completionNotes = '';
  }
}
