import { Component, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';
import { PMTask } from '../../core/models/pm.model';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-pm-record',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pm-record.component.html',
  styleUrl: './pm-record.component.scss'
})
export class PmRecordComponent implements OnInit {
  private pmService = inject(PmService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      const taskId = params['task'];
      if (taskId) {
        const task = this.pmService.pmTasks().find(t => t.id === taskId);
        if (task) {
          const user = this.authService.currentUser();
          if (user?.baseRole === 'technician') {
            if (task.status === 'Done' || task.status === 'Pending Approval') {
              this.activeTab = 'history';
            } else {
              this.activeTab = 'action';
            }
          } else {
            if (task.status === 'Done') {
              this.activeTab = 'history';
            } else {
              this.activeTab = 'action';
            }
          }
          this.selectTask(task);
        }
      }
    });
  }

  get isApprover(): boolean {
    const role = this.authService.currentUser()?.baseRole;
    return role === 'engineer' || role === 'manager' || role === 'admin';
  }

  // Get tasks based on role: Techs execute, Eng/Mgr approve
  availableTasks = computed(() => {
    const user = this.authService.currentUser();
    const tasks = this.pmService.pmTasks();
    if (!user) return [];
    
    if (user.baseRole === 'technician') {
      return tasks.filter(t => (t.status === 'Pending' || t.status === 'In Progress') && t.assignedTo === user.employeeId);
    }
    else {
      let filtered = tasks.filter(t => t.status === 'Pending Approval');
      if (user.baseRole === 'engineer') {
        const allowedProducts = this.authService.getAccessibleProducts('pm.record.submit');
        filtered = filtered.filter(t => t.department === user.department && allowedProducts.includes(t.productId || ''));
      }
      return filtered;
    }
  });

  activeTab = 'action';
  
  setTab(tab: string) {
    this.activeTab = tab;
    this.selectedTask = null;
  }

  historyTasks = computed(() => {
    const user = this.authService.currentUser();
    const tasks = this.pmService.pmTasks();
    if (!user) return [];
    
    if (user.baseRole === 'technician') {
      return tasks.filter(t => (t.status === 'Done' || t.status === 'Pending Approval') && t.completedBy === user.employeeId);
    } 
    else {
      let filtered = tasks.filter(t => t.status === 'Done');
      if (user.baseRole === 'engineer') {
        const allowedProducts = this.authService.getAccessibleProducts('pm.record.submit');
        filtered = filtered.filter(t => t.department === user.department && allowedProducts.includes(t.productId || ''));
      }
      return filtered;
    }
  });

  getTechName(employeeId?: string): string {
    if (!employeeId || employeeId === 'CURRENT-USER' || employeeId === 'System') return 'System';
    const tech = this.authService.getAllUsers().find(u => u.employeeId === employeeId);
    return tech?.name || employeeId;
  }

  selectedTask: PMTask | null = null;
  completionNotes = '';
  actualHours = 0;

  selectTask(task: PMTask) {
    this.selectedTask = task;
    this.actualHours = task.actualHours || task.estimatedHours || 0;
  }

  toggleChecklist(index: number) {
    if (this.isApprover) return; // Approvers review but do not modify the checklist
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
    const user = this.authService.currentUser();
    if (!user) return;

    if (!this.isApprover) {
      if (!this.allChecked) {
        alert("Please complete all checklist items before submitting.");
        return;
      }
      if (this.actualHours <= 0 || isNaN(this.actualHours)) {
        alert("Please enter a valid actual time spent (in hours).");
        return;
      }
      this.pmService.updateTask({
        ...this.selectedTask,
        status: 'Pending Approval',
        completedAt: new Date(),
        completedBy: user.employeeId,
        recordNotes: this.completionNotes,
        actualHours: this.actualHours
      });
      alert('PM Work Order submitted for approval!');
    } else {
      this.pmService.updateTask({
        ...this.selectedTask,
        status: 'Done',
        approvedAt: new Date(),
        approvedBy: user.employeeId,
        recordNotes: this.selectedTask.recordNotes ? `${this.selectedTask.recordNotes}\n\n[Approver]: ${this.completionNotes}` : this.completionNotes
      });
      alert('PM Work Order successfully approved!');
    }
    
    this.selectedTask = null;
    this.completionNotes = '';
    this.actualHours = 0;
  }
}
