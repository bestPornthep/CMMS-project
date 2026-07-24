import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
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
  private toast = inject(ToastService);

  auditLogs = signal<AuditLog[]>([]);

  constructor() {
    const user = this.authService.currentUser();
    if (user) {
      this.api.getAuditLogs(user.employeeId, user.baseRole, user.department)
        .then(logs => this.auditLogs.set(logs))
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
}

