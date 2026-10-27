import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { PmService } from '../../core/services/pm.service';
import { ToastService } from '../../core/services/toast.service';
import { AuditLog } from '../../core/models/pm.model';

@Component({
  selector: 'app-pm-audit',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './pm-audit.component.html',
  styleUrl: './pm-audit.component.scss'
})
export class PmAuditComponent {
  private authService = inject(AuthService);
  private api = inject(ApiService);
  private pmService = inject(PmService);
  private toast = inject(ToastService);

  private apiAuditLogs = signal<AuditLog[]>([]);
  // PM Master Plan approve/reject rows aren't backend-persisted yet (see
  // docs/backend_fixes_needed_combined.html#masterplan) — merge the client-only log entries in so they
  // show up here too, newest first.
  auditLogs = computed(() => [...this.pmService.localAuditLogs(), ...this.apiAuditLogs()]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));

  constructor() {
    const user = this.authService.currentUser();
    if (user) {
      this.api.getAuditLogs(user.employeeId, user.baseRole, user.department)
        .then(logs => this.apiAuditLogs.set(logs))
        .catch(() => this.toast.error('Failed to load audit logs. Please refresh the page.'));
    }
  }

  searchQuery = signal('');

  filteredLogs = computed(() => {
    const q = this.searchQuery().toLowerCase();
    if (!q) return this.auditLogs();
    return this.auditLogs().filter(log =>
      log.action.toLowerCase().includes(q) ||
      log.actor.name.toLowerCase().includes(q) ||
      log.actor.id.toLowerCase().includes(q) ||
      (log.target && (log.target.name.toLowerCase().includes(q) || log.target.id.toLowerCase().includes(q))) ||
      log.product.toLowerCase().includes(q)
    );
  });

  updateSearch(event: Event) {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  expandedLogId = signal<string | null>(null);

  toggleExpanded(log: AuditLog) {
    if (!log.changes?.length) return;
    this.expandedLogId.set(this.expandedLogId() === log.id ? null : log.id);
  }

  changeTagClass(change: string): string {
    if (change.includes('requirement')) return 'tag-flag';
    if (change.startsWith('Added')) return 'tag-added';
    if (change.startsWith('Removed')) return 'tag-removed';
    return 'tag-flag';
  }
}

