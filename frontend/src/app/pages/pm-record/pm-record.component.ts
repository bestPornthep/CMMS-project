import { Component, computed, inject, OnInit, signal } from '@angular/core';
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
  historyFilter = signal<'All' | 'Approved' | 'Rejected' | 'Pending' | 'Done'>('All');
  filterDropdownOpen = false;
  
  setTab(tab: string) {
    this.activeTab = tab;
    this.selectedTask = null;
    if (tab === 'history') {
      this.historyFilter.set('All');
    }
  }

  historyTasks = computed(() => {
    const user = this.authService.currentUser();
    const tasks = this.pmService.pmTasks();
    const filter = this.historyFilter();
    if (!user) return [];
    
    if (user.baseRole === 'technician') {
      let filtered = tasks.filter(t => (t.status === 'Done' || t.status === 'Pending Approval') && t.completedBy === user.employeeId);
      if (filter === 'Pending') {
        filtered = filtered.filter(t => t.status === 'Pending Approval');
      } else if (filter === 'Done') {
        filtered = filtered.filter(t => t.status === 'Done');
      }
      return filtered;
    } 
    else {
      let filtered = tasks.filter(t => t.status === 'Done' || (t.recordNotes && t.recordNotes.includes('[Rejected')));
      if (user.baseRole === 'engineer') {
        const allowedProducts = this.authService.getAccessibleProducts('pm.record.submit');
        filtered = filtered.filter(t => t.department === user.department && allowedProducts.includes(t.productId || ''));
      }

      if (filter === 'Approved') {
        filtered = filtered.filter(t => t.status === 'Done');
      } else if (filter === 'Rejected') {
        filtered = filtered.filter(t => t.status !== 'Done' && t.recordNotes && t.recordNotes.includes('[Rejected'));
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

  viewedTask: PMTask | null = null;

  viewTaskDetails(task: PMTask) {
    this.viewedTask = task;
  }

  closeTaskDetails() {
    this.viewedTask = null;
  }

  getRejectionReason(notes?: string): string {
    if (!notes || !notes.includes('[Rejected')) return '';
    // handle both [Rejected]: and [Rejected|timestamp]:
    const parts = notes.split(/\[Rejected(?:\|[^\]]+)?\]:/);
    return parts[parts.length - 1].trim();
  }

  getParsedNotes(notes?: string): { type: string, text: string, timestamp?: Date }[] {
    if (!notes) return [];
    return notes.split(/\n\n(?=\[(?:Rejected|Approver|Tech)(?:\|[^\]]+)?\]:)/).map(part => {
      let type = 'tech';
      let text = part.trim();
      let timestamp: Date | undefined;
      
      const match = text.match(/^\[(Rejected|Approver|Tech)(?:\|([^\]]+))?\]:\s*(.*)/s);
      if (match) {
        type = match[1].toLowerCase();
        if (match[2]) {
           timestamp = new Date(match[2]);
        }
        text = match[3];
      } else if (text.startsWith('[Rejected]:')) {
        type = 'rejected';
        text = text.replace('[Rejected]:', '').trim();
      } else if (text.startsWith('[Approver]:')) {
        type = 'approver';
        text = text.replace('[Approver]:', '').trim();
      }
      return { type, text, timestamp };
    }).filter(n => n.text.length > 0);
  }

  getFallbackRejectedAt(t: PMTask): Date | undefined {
    if (t.rejectedAt) return t.rejectedAt;
    if (t.recordNotes) {
      const notes = this.getParsedNotes(t.recordNotes);
      const rejectedNotes = notes.filter(n => n.type === 'rejected' && n.timestamp);
      if (rejectedNotes.length > 0) {
        return rejectedNotes[rejectedNotes.length - 1].timestamp;
      }
    }
    return undefined;
  }

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

  uploadPhoto(index: number, event: Event) {
    event.stopPropagation();
    if (this.isApprover) return;
    if (this.selectedTask && this.selectedTask.checklist) {
      // simulate upload
      this.selectedTask.checklist[index].photoUrl = 'assets/demo-photo.jpg';
      this.selectedTask.checklist[index].done = true;
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
      const missingPhotos = this.selectedTask.checklist?.some(item => item.requiresPhoto && !item.photoUrl);
      if (missingPhotos) {
        alert("Please upload photographic evidence for all required checklist items.");
        return;
      }
      if (this.actualHours <= 0 || isNaN(this.actualHours)) {
        alert("Please enter a valid actual time spent (in hours).");
        return;
      }
      const ts = new Date().toISOString();
      const newNote = `[Tech|${ts}]: ${this.completionNotes}`;
      
      let updatedNotes = this.selectedTask.recordNotes || '';
      if (updatedNotes) {
        // Remove any existing Tech notes safely using regex split so multiline notes aren't chopped
        updatedNotes = updatedNotes.split(/\n\n(?=\[(?:Rejected|Approver|Tech)(?:\|[^\]]+)?\]:)/).filter(n => !n.startsWith('[Tech')).join('\n\n');
      }
      
      this.pmService.updateTask({
        ...this.selectedTask,
        status: 'Pending Approval',
        completedAt: new Date(),
        completedBy: user.employeeId,
        actualHours: this.actualHours,
        recordNotes: updatedNotes ? `${updatedNotes}\n\n${newNote}` : newNote
      });
      alert('PM Work Order submitted for approval!');
    } else {
      const ts = new Date().toISOString();
      const newNote = `[Approver|${ts}]: ${this.completionNotes}`;
      this.pmService.updateTask({
        ...this.selectedTask,
        status: 'Done',
        approvedAt: new Date(),
        approvedBy: user.employeeId,
        recordNotes: this.selectedTask.recordNotes ? `${this.selectedTask.recordNotes}\n\n${newNote}` : newNote
      });
      alert('PM Work Order successfully approved!');
    }
    
    this.selectedTask = null;
    this.completionNotes = '';
    this.actualHours = 0;
  }

  rejectRecord() {
    if (!this.selectedTask) return;
    const user = this.authService.currentUser();
    if (!user) return;
    if (!this.completionNotes.trim()) {
      alert("Please provide completion notes explaining the rejection.");
      return;
    }
    const ts = new Date().toISOString();
    const newNote = `[Rejected|${ts}]: ${this.completionNotes}`;
    const updatedChecklist = this.selectedTask.checklist ? this.selectedTask.checklist.map(item => ({
      ...item,
      photoUrl: undefined,
      done: false
    })) : undefined;

    this.pmService.updateTask({
      ...this.selectedTask,
      checklist: updatedChecklist,
      status: 'In Progress',
      rejectedBy: user.employeeId,
      rejectedAt: new Date(),
      recordNotes: this.selectedTask.recordNotes ? `${this.selectedTask.recordNotes}\n\n${newNote}` : newNote
    });
    alert('PM Work Order rejected. Sent back to technician.');
    
    this.selectedTask = null;
    this.completionNotes = '';
    this.actualHours = 0;
  }
}
