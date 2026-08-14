import { Component, computed, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { PmService } from '../core/services/pm.service';
import { PMTask } from '../core/models/pm.model';
import { TranslationService } from '../core/services/translation.service';
import { ToastService } from '../core/services/toast.service';
import { ThemeService } from '../core/services/theme.service';
import { LiquidGlassToggleComponent } from '../shared/components/liquid-glass-toggle/liquid-glass-toggle.component';
import { TranslatePipe } from '../shared/pipes/translate.pipe';
import { filter, map, mergeMap } from 'rxjs/operators';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, LiquidGlassToggleComponent, TranslatePipe],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent {
  private authService = inject(AuthService);
  private pmService = inject(PmService);
  public translationService = inject(TranslationService);
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);
  private toast = inject(ToastService);
  themeService = inject(ThemeService);

  user = this.authService.currentUser;

  currentSection = signal('Overview');
  currentTitle = signal('Dashboard');

  notificationsOpen = false;
  settingsOpen = false;

  notifications = computed(() => {
    const user = this.user();
    const tasks = this.pmService.pmTasks();
    if (!user) return [];

    let notifs: any[] = [];

    // 1. Overdue Tasks
    let overdue = tasks.filter(t => t.status === 'Overdue');
    if (user.baseRole === 'technician') {
      overdue = overdue.filter(t => t.assignedTo === user.employeeId);
    } else if (user.baseRole === 'engineer') {
      const allowedProducts = this.authService.getAccessibleProducts('pm.record.submit');
      overdue = overdue.filter(t => t.department === user.department && allowedProducts.includes(t.productId || ''));
      overdue = overdue.filter(t => {
        if (t.createdBy && t.createdBy !== user.employeeId) {
          const creator = this.authService.getUser(t.createdBy);
          if (creator && creator.baseRole === 'engineer') return false;
        }
        return true;
      });
    }

    notifs = notifs.concat(overdue.map(t => ({
      id: t.id,
      type: 'overdue',
      title: `Task Overdue: ${t.id}`,
      message: `The maintenance task for asset ${t.assetId} is overdue.`,
      read: false
    })));

    // 2. Rejected Tasks for Technicians
    if (user.baseRole === 'technician') {
      const rejected = tasks.filter(t => t.assignedTo === user.employeeId && t.status === 'In Progress' && t.recordNotes?.includes('[Rejected'));
      notifs = notifs.concat(rejected.map(t => ({
        id: t.id,
        type: 'rejected',
        title: `Task Rejected: ${t.id}`,
        message: `Your completion for asset ${t.assetId} was rejected.`,
        read: false
      })));
    }

    // 3. Pending Approval for Engineers/Managers
    if (user.baseRole === 'engineer' || user.baseRole === 'manager' || user.baseRole === 'admin') {
      let pending = tasks.filter(t => t.status === 'Pending Approval');
      if (user.baseRole === 'engineer') {
        const allowedProducts = this.authService.getAccessibleProducts('pm.record.submit');
        pending = pending.filter(t => t.department === user.department && allowedProducts.includes(t.productId || ''));
        pending = pending.filter(t => {
          if (t.createdBy && t.createdBy !== user.employeeId) {
            const creator = this.authService.getUser(t.createdBy);
            if (creator && creator.baseRole === 'engineer') return false;
          }
          return true;
        });
      }

      notifs = notifs.concat(pending.map(t => ({
        id: t.id,
        type: 'approval',
        title: `Pending Approval: ${t.id}`,
        message: `Task for asset ${t.assetId} awaits your approval.`,
        read: false
      })));
    }

    // 4. Newly Assigned Tasks for Technicians
    if (user.baseRole === 'technician') {
      const assigned = tasks.filter(t => t.assignedTo === user.employeeId && t.status === 'In Progress' && (!t.recordNotes || !t.recordNotes.includes('[Rejected')));
      
      const groupedAssigned: any[] = [];
      const seenSeriesAssigned = new Set<string>();
      
      // Sort by due date first so we get the most immediate one
      assigned.sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());

      for (const t of assigned) {
        const seriesMatch = t.description?.match(/\[SeriesID:\s*([^\]]+)\]/);
        if (seriesMatch) {
          const seriesId = seriesMatch[1];
          if (!seenSeriesAssigned.has(seriesId)) {
            seenSeriesAssigned.add(seriesId);
            groupedAssigned.push(t);
          }
        } else {
          groupedAssigned.push(t);
        }
      }

      notifs = notifs.concat(groupedAssigned.map(t => ({
        id: t.id,
        type: 'assigned',
        title: `New Assignment: ${t.id}`,
        message: `You have been assigned to PM on asset ${t.assetId}.`,
        read: false
      })));
    }

    return notifs.slice(0, 10);
  });

  hasUnreadNotifications = computed(() => {
    return this.notifications().some(n => !n.read);
  });

  constructor() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.activatedRoute),
      map(route => {
        while (route.firstChild) route = route.firstChild;
        return route;
      }),
      filter(route => route.outlet === 'primary'),
      mergeMap(route => route.data)
    ).subscribe(data => {
      this.closeTaskDetails(); // Close modal on navigation
      if (data['section']) this.currentSection.set(data['section']);
      if (data['title']) this.currentTitle.set(data['title']);
    });
  }

  // Expose permission check for sidebar links
  hasPermission(permission: string): boolean {
    return this.authService.hasPermission(permission);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    const val = input.value.trim().toUpperCase();
    if (val) {
      const task = this.pmService.pmTasks().find(t => t.id === val || t.id.includes(val));
      const user = this.user();

      let isAllowed = false;
      let notFoundMsg = 'Work order not found.';

      if (user && task) {
        if (user.baseRole === 'manager' || user.baseRole === 'engineer') {
          // C5 fix: include In Progress (rejected tasks) so engineers can search them
          const isApprovalStatus = task.status === 'Pending Approval' || task.status === 'Done' || task.status === 'In Progress';

          if (user.baseRole === 'engineer') {
            const allowedProducts = this.authService.getAccessibleProducts('pm.calendar.view');
            const ownsProduct = allowedProducts.includes(task.productId || '') || (user.ownedProducts && user.ownedProducts.includes('*'));

            let createdByOtherEngineer = false;
            if (task.createdBy && task.createdBy !== user.employeeId) {
              const creator = this.authService.getUser(task.createdBy);
              if (creator && creator.baseRole === 'engineer') {
                createdByOtherEngineer = true;
              }
            }

            if (task.department === user.department && ownsProduct && !createdByOtherEngineer) {
              if (isApprovalStatus) {
                isAllowed = true;
              }
            }
          } else {
            // Manager
            if (isApprovalStatus) {
              isAllowed = true;
            }
          }
        } else if (user.baseRole === 'technician') {
          if (task.assignedTo === user.employeeId || task.completedBy === user.employeeId) {
            isAllowed = true;
          }
        } else {
          // Admins
          isAllowed = true;
        }

        if (!isAllowed) {
          notFoundMsg = `Work order ${task.id} is currently ${task.status} and cannot be viewed here.`;
        }
      } else if (!task) {
        notFoundMsg = 'Work order not found.';
      }

      if (isAllowed && task) {
        if (task.status === 'Done') {
          // Done tasks are read-only — show details in the global modal.
          this.pmService.viewedTaskGlobal.set(task);
        } else if (user!.baseRole === 'technician' || task.status === 'Pending Approval') {
          // Technicians execute/view their own work in Record PM; Pending Approval
          // always routes there regardless of role since that's where approval happens.
          this.router.navigate(['/pm-record'], { queryParams: { task: task.id } });
        } else {
          // Pending / In Progress / Overdue — show details/assign in the shared
          // modal, same as clicking the task in the calendar grid.
          this.pmService.viewedTaskGlobal.set(task);
        }
      } else {
        this.toast.warning(notFoundMsg);
      }

      input.value = '';
      input.blur();
    }
  }

  toggleNotifications(event: Event) {
    event.stopPropagation();
    this.notificationsOpen = !this.notificationsOpen;
    this.settingsOpen = false;
  }

  toggleSettings(event: Event) {
    event.stopPropagation();
    this.settingsOpen = !this.settingsOpen;
    this.notificationsOpen = false;
  }

  @HostListener('document:click')
  closeDropdowns() {
    this.notificationsOpen = false;
    this.settingsOpen = false;
    this.assignDropdownOpen = false;
    this.reassignDropdownOpen = false;
  }

  readNotification(notif: any) {
    this.notificationsOpen = false;
    const user = this.user();
    if (user && (user.baseRole === 'engineer' || user.baseRole === 'manager' || user.baseRole === 'admin') && notif.type === 'overdue') {
      this.router.navigate(['/pm-calendar'], { queryParams: { task: notif.id } });
    } else {
      this.router.navigate(['/pm-record'], { queryParams: { task: notif.id } });
    }
  }

  // Global Task Details Modal logic
  get viewedTask() {
    return this.pmService.viewedTaskGlobal();
  }

  closeTaskDetails() {
    this.pmService.viewedTaskGlobal.set(null);
    this.selectedAssignTech.set('');
    this.selectedReassignTech.set('');
    this.reassignConfirmPending.set(false);
    this.assignDropdownOpen = false;
    this.reassignDropdownOpen = false;
  }

  // --- Assign (Pending tasks, shown inline in the modal instead of on the Assign PM page) ---
  selectedAssignTech = signal<string>('');
  assignDropdownOpen = false;

  toggleAssignDropdown(event: Event) {
    event.stopPropagation();
    this.assignDropdownOpen = !this.assignDropdownOpen;
    this.reassignDropdownOpen = false;
  }

  canManageTask(task: PMTask): boolean {
    return this.pmService.canManageTask(task);
  }

  getAssignableTechnicians(task: PMTask) {
    return this.pmService.getAssignableTechnicians(task);
  }

  async assignFromModal(task: PMTask) {
    const tech = this.selectedAssignTech();
    if (!tech) {
      this.toast.warning('Please select a technician first.');
      return;
    }
    try {
      await this.pmService.assignTaskToTechnician(task, tech);
      this.toast.success('Task assigned successfully.');
      this.selectedAssignTech.set('');
      // The modal holds a direct object reference — re-point it at the refreshed
      // task (assign/reassign refetch pmTasks() internally) so fields stay in sync.
      const updated = this.pmService.pmTasks().find(t => t.id === task.id);
      if (updated) this.pmService.viewedTaskGlobal.set(updated);
    } catch (err: any) {
      this.toast.error(err?.message || 'Failed to assign task. Please check the server connection.');
    }
  }

  // --- Reassign (In Progress/Overdue tasks) — inline confirm, no second stacked modal ---
  selectedReassignTech = signal<string>('');
  reassignConfirmPending = signal<boolean>(false);
  reassignDropdownOpen = false;

  toggleReassignDropdown(event: Event) {
    event.stopPropagation();
    this.reassignDropdownOpen = !this.reassignDropdownOpen;
    this.assignDropdownOpen = false;
  }

  canReassignTask(task: PMTask): boolean {
    return this.pmService.canReassignTask(task);
  }

  getReassignableTechnicians(task: PMTask) {
    return this.pmService.getReassignableTechnicians(task);
  }

  requestReassign() {
    if (!this.selectedReassignTech()) {
      this.toast.warning('Please select a technician first.');
      return;
    }
    this.reassignConfirmPending.set(true);
  }

  cancelReassignFromModal() {
    this.reassignConfirmPending.set(false);
  }

  async confirmReassignFromModal(task: PMTask) {
    const tech = this.selectedReassignTech();
    if (!tech) return;
    try {
      const updated = await this.pmService.reassignTask(task, tech);
      this.toast.success('Task reassigned successfully.');
      this.selectedReassignTech.set('');
      this.pmService.viewedTaskGlobal.set(updated);
    } catch (err: any) {
      this.toast.error(err?.message || 'Failed to reassign task. Please check the server connection.');
    } finally {
      this.reassignConfirmPending.set(false);
    }
  }

  getCleanDescription(desc?: string): string {
    if (!desc) return '';
    return desc.replace(/\[SeriesID:\s*[^\]]+\]\n?/g, '').trim();
  }

  getTechName(employeeId?: string): string {
    if (!employeeId || employeeId === 'CURRENT-USER' || employeeId === 'System') return 'System';
    const tech = this.authService.getAllUsers().find(u => u.employeeId === employeeId);
    return tech?.name || employeeId;
  }

  // Same lookup as getTechName, but falls back to "Unassigned" — used for the Assigned To field,
  // which is meaningfully different from "no creator" (matches pm-assign's own getTechName convention).
  getAssigneeName(employeeId?: string): string {
    if (!employeeId) return 'Unassigned';
    return this.getTechName(employeeId);
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

      if (text.startsWith('[')) {
        const firstCloseBracket = text.indexOf(']');
        if (firstCloseBracket !== -1) {
          const metaInside = text.substring(1, firstCloseBracket);
          const metaParts = metaInside.split('|');
          const rawType = metaParts[0];

          if (['Rejected', 'Approver', 'Tech'].includes(rawType)) {
            type = rawType.toLowerCase();
            if (metaParts.length > 1) {
              timestamp = new Date(metaParts[1]);
            }

            const colonIdx = text.indexOf(']:', firstCloseBracket);
            if (colonIdx !== -1) {
              const betweenBracketAndColon = text.substring(firstCloseBracket + 1, colonIdx);
              if (betweenBracketAndColon.startsWith('~~')) {
                const jsonStr = betweenBracketAndColon.substring(2);
                try { checklist = JSON.parse(jsonStr); } catch (e) { }
              }

              if (!checklist && metaParts.length > 2) {
                const firstPipe = text.indexOf('|');
                const secondPipe = text.indexOf('|', firstPipe + 1);
                const lastBracket = text.lastIndexOf(']]:');
                if (secondPipe !== -1 && lastBracket !== -1) {
                  const jsonStr = text.substring(secondPipe + 1, lastBracket + 1);
                  try { checklist = JSON.parse(jsonStr); } catch (e) { }
                }
              }
              text = text.substring(colonIdx + 2).trim();
            } else {
              text = text.substring(firstCloseBracket + 1).trim();
            }
          }
        }
      }
      return { type, text, timestamp, checklist };
    });
  }

  getDisplayChecklist(task: any): any[] {
    if (!task) return [];
    if (task.recordNotes && task.recordNotes.includes('[Rejected')) {
      const parsed = this.getParsedNotes(task.recordNotes);
      for (let i = parsed.length - 1; i >= 0; i--) {
        if (parsed[i].type === 'tech' && parsed[i].checklist) {
          return parsed[i].checklist!;
        }
      }
    }
    return task.checklist || [];
  }
}
