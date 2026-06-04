import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';
import { PMTask } from '../../core/models/pm.model';
import { ActivatedRoute, Router } from '@angular/router';

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
  private router = inject(Router);

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      const taskId = params['task'];
      if (taskId) {
        const task = this.pmService.pmTasks().find(t => t.id === taskId);
        if (task) {
          const user = this.authService.currentUser();
          
          if (user?.baseRole === 'engineer' || user?.baseRole === 'technician') {
            const allowedProducts = this.authService.getAccessibleProducts('pm.record.view');
            const isSameDept = task.department === user.department;
            
            if (!isSameDept || (user.baseRole === 'engineer' && !allowedProducts.includes(task.productId || ''))) {
              alert("You do not have permission to view tasks outside your section or product scope.");
              this.router.navigate(['/pm-record']);
              return;
            }

            if (user.baseRole === 'engineer' && task.createdBy && task.createdBy !== user.employeeId) {
               const creator = this.authService.getUser(task.createdBy);
               if (creator && creator.baseRole === 'engineer') {
                 alert("You do not have permission to view tasks created by another Engineer.");
                 this.router.navigate(['/pm-record']);
                 return;
               }
            }
          }

          let isActionable = false;
          let isHistory = false;

          if (user && user.baseRole === 'technician') {
            isActionable = (task.status === 'Pending' || task.status === 'In Progress' || task.status === 'Overdue') && task.assignedTo === user.employeeId;
            isHistory = (task.status === 'Done' || task.status === 'Pending Approval') && task.completedBy === user.employeeId;
          } else {
            isActionable = task.status === 'Pending Approval';
            isHistory = task.status === 'Done' || (task.recordNotes?.includes('[Rejected') ?? false);
          }

          if (isActionable) {
            this.activeTab = 'action';
            this.selectTask(task);
            setTimeout(() => {
              const el = document.getElementById('row-' + taskId);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }, 100);
          } else if (isHistory) {
            this.activeTab = 'history';
            this.selectTask(task);
            this.viewTaskDetails(task);
            setTimeout(() => {
              const el = document.getElementById('row-' + taskId);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }, 100);
          } else {
            this.viewTaskDetails(task);
          }
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
      return tasks.filter(t => (t.status === 'Pending' || t.status === 'In Progress' || t.status === 'Overdue') && t.assignedTo === user.employeeId);
    }
    else {
      let filtered = tasks.filter(t => t.status === 'Pending Approval');
      if (user.baseRole === 'engineer') {
        const allowedProducts = this.authService.getAccessibleProducts('pm.record.submit');
        filtered = filtered.filter(t => t.department === user.department && allowedProducts.includes(t.productId || ''));
        filtered = filtered.filter(t => {
           if (t.createdBy && t.createdBy !== user.employeeId) {
              const creator = this.authService.getUser(t.createdBy);
              if (creator && creator.baseRole === 'engineer') return false;
           }
           return true;
        });
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
      return filtered.sort((a, b) => {
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return timeB - timeA;
      });
    } 
    else {
      let filtered = tasks.filter(t => t.status === 'Done' || (t.recordNotes && t.recordNotes.includes('[Rejected')));
      if (user.baseRole === 'engineer') {
        const allowedProducts = this.authService.getAccessibleProducts('pm.record.submit');
        filtered = filtered.filter(t => t.department === user.department && allowedProducts.includes(t.productId || ''));
        filtered = filtered.filter(t => {
           if (t.createdBy && t.createdBy !== user.employeeId) {
              const creator = this.authService.getUser(t.createdBy);
              if (creator && creator.baseRole === 'engineer') return false;
           }
           return true;
        });
      }

      if (filter === 'Approved') {
        filtered = filtered.filter(t => t.status === 'Done');
      } else if (filter === 'Rejected') {
        filtered = filtered.filter(t => t.status !== 'Done' && t.recordNotes && t.recordNotes.includes('[Rejected'));
      }

      return filtered.sort((a, b) => {
        const timeA = a.approvedAt ? new Date(a.approvedAt).getTime() : (a.completedAt ? new Date(a.completedAt).getTime() : 0);
        const timeB = b.approvedAt ? new Date(b.approvedAt).getTime() : (b.completedAt ? new Date(b.completedAt).getTime() : 0);
        return timeB - timeA;
      });
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

  viewTaskDetails(task: PMTask) {
    this.pmService.viewedTaskGlobal.set(task);
  }

  closeTaskDetails() {
    this.pmService.viewedTaskGlobal.set(null);
  }

  getRejectionReason(notes?: string): string {
    if (!notes || !notes.includes('[Rejected')) return '';
    // handle both [Rejected]: and [Rejected|timestamp]:
    const parts = notes.split(/\[Rejected(?:\|[^\]]+)?\]:/);
    return parts[parts.length - 1].trim();
  }

  getParsedNotes(notes?: string): { type: string, text: string, timestamp?: Date, checklist?: any[] }[] {
    if (!notes) return [];
    
    // Split on \n\n followed by a known tag
    const blocks = notes.split(/\n\n(?=\[(?:Rejected|Approver|Tech)(?:\|[^\]]+)?\])/);
    
    return blocks.map(part => {
      let type = 'tech';
      let text = part.trim();
      let timestamp: Date | undefined;
      let checklist: any[] | undefined;
      
      // Parse format: [Type|Timestamp]~~JSON: Text
      // Or old format: [Type|Timestamp|JSON]: Text
      // Or oldest format: [Type]: Text
      
      if (text.startsWith('[')) {
         const firstCloseBracket = text.indexOf(']');
         if (firstCloseBracket !== -1) {
            const metaInside = text.substring(1, firstCloseBracket); // e.g. Rejected|Timestamp
            const metaParts = metaInside.split('|');
            const rawType = metaParts[0];
            
            if (['Rejected', 'Approver', 'Tech'].includes(rawType)) {
               type = rawType.toLowerCase();
               if (metaParts.length > 1) {
                  timestamp = new Date(metaParts[1]);
               }
               
               // Look for "]:" to separate metadata from the actual text
               const colonIdx = text.indexOf(']:', firstCloseBracket);
               if (colonIdx !== -1) {
                  const betweenBracketAndColon = text.substring(firstCloseBracket + 1, colonIdx);
                  if (betweenBracketAndColon.startsWith('~~')) {
                     const jsonStr = betweenBracketAndColon.substring(2);
                     try { checklist = JSON.parse(jsonStr); } catch(e) {}
                  }
                  
                  if (!checklist && metaParts.length > 2) {
                     // Legacy broken format: [Rejected|time|[{"text"...}]]
                     const firstPipe = text.indexOf('|');
                     const secondPipe = text.indexOf('|', firstPipe + 1);
                     const lastBracket = text.lastIndexOf(']]:');
                     if (secondPipe !== -1 && lastBracket !== -1) {
                         const jsonStr = text.substring(secondPipe + 1, lastBracket + 1);
                         try { checklist = JSON.parse(jsonStr); } catch(e) {}
                         text = text.substring(lastBracket + 3).trim();
                     } else {
                         text = text.substring(colonIdx + 2).trim();
                     }
                  } else {
                     text = text.substring(colonIdx + 2).trim();
                  }
               } else {
                   // Failsafe: if we can't find ']:', just clear it so it doesn't show raw metadata
                   text = '';
               }
            }
         }
      }
      return { type, text, timestamp, checklist };
    }).filter(n => n.text.length > 0 || (n.checklist && n.checklist.length > 0));
  }

  getDisplayChecklist(task: PMTask | null): any[] {
    if (!task) return [];
    
    // For Approvers viewing a task that is currently In Progress (rejected),
    // we want to display the snapshot of what the tech submitted instead of the empty checklist.
    if (this.isApprover && task.status === 'In Progress' && task.recordNotes) {
       const notes = this.getParsedNotes(task.recordNotes);
       const rejectedNotes = notes.filter(n => n.type === 'rejected' && n.checklist && n.checklist.length > 0);
       if (rejectedNotes.length > 0) {
           return rejectedNotes[rejectedNotes.length - 1].checklist!;
       }
    }
    
    return task.checklist || [];
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
    const checklistSnapshot = this.selectedTask.checklist ? JSON.stringify(this.selectedTask.checklist) : '';
    // Format: [Rejected|timestamp]~~checklistJson: text
    const newNote = `[Rejected|${ts}]${checklistSnapshot ? '~~' + checklistSnapshot : ''}: ${this.completionNotes}`;
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
