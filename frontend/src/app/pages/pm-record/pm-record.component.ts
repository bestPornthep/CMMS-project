import { Component, computed, inject, OnInit, OnDestroy, signal, DestroyRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PMTask } from '../../core/models/pm.model';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-pm-record',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  providers: [DatePipe],
  templateUrl: './pm-record.component.html',
  styleUrl: './pm-record.component.scss'
})
export class PmRecordComponent implements OnInit, OnDestroy {
  private pmService = inject(PmService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  @ViewChild('cameraVideo') cameraVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('nativePhotoInput') nativePhotoInput?: ElementRef<HTMLInputElement>;

  ngOnDestroy() {
    this.mediaStream?.getTracks().forEach(t => t.stop());
  }

  ngOnInit() {
    // Lazy load historical data, then re-check route param in case target task is a Done task
    this.pmService.loadHistoricalTasks()
      .then(() => {
        const taskId = this.route.snapshot.queryParams['task'];
        if (taskId) this.resolveTaskFromParam(taskId);
      })
      .catch(() => this.toast.error('Failed to load task history. Some records may be missing.'));

    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const taskId = params['task'];
      if (taskId) this.resolveTaskFromParam(taskId);
    });
  }

  private resolveTaskFromParam(taskId: string) {
    const task = this.pmService.pmTasks().find(t => t.id === taskId);
    if (!task) return;

    const user = this.authService.currentUser();

    if (user?.baseRole === 'engineer' || user?.baseRole === 'technician') {
      const allowedProducts = this.authService.getAccessibleProducts('pm.record.view');
      const isSameDept = task.department === user.department;

      if (!isSameDept || (user.baseRole === 'engineer' && !allowedProducts.includes(task.productId || ''))) {
        this.toast.error('You do not have permission to view tasks outside your section or product scope.');
        this.router.navigate(['/pm-record']);
        return;
      }

      if (user.baseRole === 'engineer' && task.createdBy && task.createdBy !== user.employeeId) {
        const creator = this.authService.getUser(task.createdBy);
        if (creator && creator.baseRole === 'engineer') {
          this.toast.error('You do not have permission to view tasks created by another Engineer.');
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
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } else if (isHistory) {
      this.activeTab = 'history';
      this.selectTask(task);
      this.viewTaskDetails(task);
      setTimeout(() => {
        const el = document.getElementById('row-' + taskId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } else {
      this.viewTaskDetails(task);
    }
  }

  // Get tasks based on role: Techs execute, Eng/Mgr approve
  availableTasks = computed(() => {
    const user = this.authService.currentUser();
    const tasks = this.pmService.pmTasks();
    if (!user) return [];
    
    if (user.baseRole === 'technician') {
      const techTasks = tasks.filter(t => 
        (t.status === 'Pending' || t.status === 'In Progress' || t.status === 'Overdue') && 
        t.assignedTo === user.employeeId
      );
      
      // Sort tasks first so the earliest task in a series is always chosen as the representative
      techTasks.sort((a, b) => {
        const timeA = a.nextDueDate ? new Date(a.nextDueDate).getTime() : 0;
        const timeB = b.nextDueDate ? new Date(b.nextDueDate).getTime() : 0;
        return timeA - timeB;
      });

      // Group by SeriesID so recurring schedules only appear once
      const grouped: PMTask[] = [];
      const seenSeries = new Set<string>();
      
      for (const task of techTasks) {
        const seriesMatch = task.description?.match(/\[SeriesID:\s*([^\]]+)\]/);
        if (seriesMatch) {
          const seriesId = seriesMatch[1];
          if (!seenSeries.has(seriesId)) {
            seenSeries.add(seriesId);
            grouped.push(task);
          }
        } else {
          grouped.push(task);
        }
      }
      
      return grouped;
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

  get isApprover(): boolean {
    const role = this.authService.currentUser()?.baseRole;
    return role === 'engineer' || role === 'manager' || role === 'admin';
  }

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
    
    if (this.isApprover && task.status === 'In Progress' && task.recordNotes) {
       const notes = this.getParsedNotes(task.recordNotes);
       const rejectedNotes = notes.filter(n => n.type === 'rejected' && n.checklist && n.checklist.length > 0);
       if (rejectedNotes.length > 0) {
           return rejectedNotes[rejectedNotes.length - 1].checklist!;
       }
    }
    
    return task.checklist || [];
  }

  getCleanDescription(desc?: string): string {
    if (!desc) return '';
    return desc.replace(/\[SeriesID:\s*[^\]]+\]\n?/g, '').trim();
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
    if (this.isApprover) return;
    if (this.selectedTask && this.selectedTask.checklist) {
      // C3 fix: deep copy to avoid mutating the signal store reference
      const newChecklist = this.selectedTask.checklist.map((item, i) =>
        i === index ? { ...item, done: !item.done } : { ...item }
      );
      this.selectedTask = { ...this.selectedTask, checklist: newChecklist };
    }
  }

  // Which checklist row is currently being captured (drives both the live camera modal and the native-input fallback)
  pendingPhotoIndex: number | null = null;
  cameraModalOpen = false;
  private mediaStream: MediaStream | null = null;

  async startPhotoCapture(index: number, event: Event) {
    event.stopPropagation();
    if (this.isApprover) return;
    this.pendingPhotoIndex = index;

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
        this.mediaStream = stream;
        this.cameraModalOpen = true;
        // Video element is always in the DOM (hidden via CSS) so the ViewChild ref is already available here.
        if (this.cameraVideo) {
          this.cameraVideo.nativeElement.srcObject = stream;
        }
        return;
      } catch {
        // No camera / permission denied / insecure context (e.g. HTTP on a non-localhost host) — fall back below.
      }
    }

    this.nativePhotoInput?.nativeElement.click();
  }

  capturePhoto() {
    const index = this.pendingPhotoIndex;
    if (index === null || !this.cameraVideo) return;
    const video = this.cameraVideo.nativeElement;

    const dataUrl = this.drawVideoFrameToDataUrl(video);
    if (!dataUrl) {
      this.toast.error('Failed to process the captured photo. Please try again.');
      return;
    }
    this.applyPhotoToChecklist(index, dataUrl);
    this.closeCamera();
  }

  closeCamera() {
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.mediaStream = null;
    this.cameraModalOpen = false;
    this.pendingPhotoIndex = null;
  }

  async onPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // reset so retaking the same shot still fires a change event
    const index = this.pendingPhotoIndex;
    this.pendingPhotoIndex = null;
    if (!file || this.isApprover || index === null) return;

    try {
      const dataUrl = await this.compressImageToDataUrl(file);
      this.applyPhotoToChecklist(index, dataUrl);
    } catch {
      this.toast.error('Failed to process the captured photo. Please try again.');
    }
  }

  private applyPhotoToChecklist(index: number, dataUrl: string) {
    if (this.selectedTask && this.selectedTask.checklist) {
      // C3 fix: deep copy before mutating
      const newChecklist = this.selectedTask.checklist.map((item, i) =>
        i === index ? { ...item, photoUrl: dataUrl, done: true } : { ...item }
      );
      this.selectedTask = { ...this.selectedTask, checklist: newChecklist };
    }
  }

  private drawVideoFrameToDataUrl(video: HTMLVideoElement, maxDimension = 1280, quality = 0.7): string | null {
    let width = video.videoWidth;
    let height = video.videoHeight;
    if (!width || !height) return null;
    if (width > maxDimension || height > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  }

  // Downscales the captured photo client-side (base64 inline storage - no upload endpoint exists yet)
  private compressImageToDataUrl(file: File, maxDimension = 1280, quality = 0.7): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Failed to load captured image'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            const scale = maxDimension / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas context unavailable')); return; }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  updateChecklistValue(index: number, val: string) {
    if (this.isApprover) return;
    if (this.selectedTask && this.selectedTask.checklist) {
      const newChecklist = this.selectedTask.checklist.map((item, i) =>
        i === index ? { ...item, value: val } : { ...item }
      );
      this.selectedTask = { ...this.selectedTask, checklist: newChecklist };
    }
  }

  // Stable identity across re-renders so typing in one row doesn't rebuild every input and steal focus
  trackByIndex(index: number): number {
    return index;
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
        this.toast.warning('Please complete all checklist items before submitting.');
        return;
      }
      const missingPhotos = this.selectedTask.checklist?.some(item => item.requiresPhoto && !item.photoUrl);
      if (missingPhotos) {
        this.toast.warning('Please upload photographic evidence for all required checklist items.');
        return;
      }
      const missingValues = this.selectedTask.checklist?.some(item => item.requiresValue && !item.value?.trim());
      if (missingValues) {
        this.toast.warning('Please enter a value for all required checklist items.');
        return;
      }
      if (this.actualHours <= 0 || isNaN(this.actualHours)) {
        this.toast.warning('Please enter a valid actual time spent (in hours).');
        return;
      }
      if (this.actualHours > 999) {
        this.toast.warning('Actual hours cannot exceed 999. Please enter a realistic value.');
        return;
      }
      const ts = new Date().toISOString();
      const newNote = `[Tech|${ts}]: ${this.completionNotes}`;
      
      let updatedNotes = this.selectedTask.recordNotes || '';
      if (updatedNotes) {
        // Remove any existing Tech notes safely using regex split so multiline notes aren't chopped
        updatedNotes = updatedNotes.split(/\n\n(?=\[(?:Rejected|Approver|Tech)(?:\|[^\]]+)?\])/).filter(n => !n.startsWith('[Tech')).join('\n\n');
      }
      
      this.pmService.updateTask({
        ...this.selectedTask,
        status: 'Pending Approval',
        completedAt: new Date(),
        completedBy: user.employeeId,
        actualHours: this.actualHours,
        recordNotes: updatedNotes ? `${updatedNotes}\n\n${newNote}` : newNote
      });
      this.toast.success('PM Work Order submitted for approval!');
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
      this.toast.success('PM Work Order successfully approved!');
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
      this.toast.warning('Please provide completion notes explaining the rejection.');
      return;
    }
    const ts = new Date().toISOString();
    const checklistSnapshot = this.selectedTask.checklist ? JSON.stringify(this.selectedTask.checklist) : '';
    // Format: [Rejected|timestamp]~~checklistJson: text
    const newNote = `[Rejected|${ts}]${checklistSnapshot ? '~~' + checklistSnapshot : ''}: ${this.completionNotes}`;
    const updatedChecklist = this.selectedTask.checklist ? this.selectedTask.checklist.map(item => ({
      ...item,
      photoUrl: undefined,
      value: undefined,
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
    this.toast.warning('PM Work Order rejected. Sent back to technician.');
    
    this.selectedTask = null;
    this.completionNotes = '';
    this.actualHours = 0;
  }
}

