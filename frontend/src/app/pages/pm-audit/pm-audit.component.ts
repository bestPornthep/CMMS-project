import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';

export interface AuditLog {
  id: string;
  timestamp: Date;
  action: string;
  actor: { name: string, id: string };
  target: { name: string, id: string, isUser: boolean } | null;
  product: string;
  type: 'security' | 'system' | 'data';
}

@Component({
  selector: 'app-pm-audit',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pm-audit.component.html',
  styleUrl: './pm-audit.component.scss'
})
export class PmAuditComponent {
  private authService = inject(AuthService);
  
  auditLogs = computed<AuditLog[]>(() => {
    const user = this.authService.currentUser();
    if (!user) return [];

    const logs: AuditLog[] = [
      {
        id: 'AL-1001',
        timestamp: new Date(new Date().getTime() - 1000 * 60 * 5),
        action: 'Delegated Product Access',
        actor: { name: 'Admin Supachai', id: 'ADM001' },
        target: { name: user.name, id: user.employeeId, isUser: true },
        product: 'CUST-001',
        type: 'security'
      },
      {
        id: 'AL-1002',
        timestamp: new Date(new Date().getTime() - 1000 * 60 * 45),
        action: 'Revoked Product Access',
        actor: { name: 'Admin Supachai', id: 'ADM001' },
        target: { name: user.name, id: user.employeeId, isUser: true },
        product: 'CUST-002',
        type: 'security'
      },
      {
        id: 'AL-1003',
        timestamp: new Date(new Date().getTime() - 1000 * 60 * 60 * 2),
        action: 'Granted View Permission',
        actor: { name: user.name, id: user.employeeId },
        target: { name: 'Tech Somchai', id: 'TECH-TST-1', isUser: true },
        product: 'CUST-001',
        type: 'security'
      }
    ];

    if (user.baseRole === 'manager') {
      logs.push(
        {
          id: 'AL-1004',
          timestamp: new Date(new Date().getTime() - 1000 * 60 * 60 * 24),
          action: 'Created PM Template',
          actor: { name: 'Eng SMT B', id: 'ENG-SMT-2' },
          target: { name: 'best', id: 'TMPL-042', isUser: false },
          product: 'SMT Shared Asset',
          type: 'system'
        },
        {
          id: 'AL-1005',
          timestamp: new Date(new Date().getTime() - 1000 * 60 * 60 * 48),
          action: 'Deleted PM Template',
          actor: { name: 'Eng Test C', id: 'ENG-TST-3' },
          target: { name: 'Weekly Calibration', id: 'TMPL-018', isUser: false },
          product: 'Test Shared Asset',
          type: 'system'
        }
      );
    } else {
      const d = user.department || 'Test';
      const pfx = d.substring(0, 3).toUpperCase();
      logs.push(
        {
          id: 'AL-1004',
          timestamp: new Date(new Date().getTime() - 1000 * 60 * 60 * 24),
          action: 'Created PM Template',
          actor: { name: `Eng ${d} B`, id: `ENG-${pfx}-2` },
          target: { name: 'best', id: 'TMPL-042', isUser: false },
          product: `${d} Shared Asset`,
          type: 'system'
        },
        {
          id: 'AL-1005',
          timestamp: new Date(new Date().getTime() - 1000 * 60 * 60 * 48),
          action: 'Created PM Template',
          actor: { name: `Tech ${d} 1`, id: `TECH-${pfx}-1 (Delegated)` },
          target: { name: 'Monthly Inspection', id: 'TMPL-088', isUser: false },
          product: `${d} Shared Asset`,
          type: 'system'
        }
      );
    }

    return logs;
  });

  searchQuery = signal('');

  filteredLogs = computed(() => {
    return this.auditLogs().filter(log => {
      const q = this.searchQuery().toLowerCase();
      if (!q) return true;
      return log.action.toLowerCase().includes(q) || 
             log.actor.name.toLowerCase().includes(q) || 
             log.actor.id.toLowerCase().includes(q) ||
             (log.target && (log.target.name.toLowerCase().includes(q) || log.target.id.toLowerCase().includes(q))) ||
             log.product.toLowerCase().includes(q);
    });
  });

  updateSearch(event: Event) {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }
}
