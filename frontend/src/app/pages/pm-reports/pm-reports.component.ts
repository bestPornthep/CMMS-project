import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { PmService } from '../../core/services/pm.service';

@Component({
  selector: 'app-pm-reports',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './pm-reports.component.html',
  styleUrl: './pm-reports.component.scss'
})
export class PmReportsComponent {
  private pmService = inject(PmService);

  // Compute live data for reports
  tasks = this.pmService.pmTasks;

  totalCompleted = computed(() => {
    return this.tasks().filter(t => t.status === 'Done').length;
  });

  complianceRate = computed(() => {
    const total = this.tasks().length;
    if (total === 0) return 0;
    return Math.round((this.totalCompleted() / total) * 100);
  });

  avgCompletionTime = computed(() => {
    // Mock value based on completion
    return '1.8 hrs';
  });

  // Example table data
  reportData = computed(() => {
    return [
      { dept: 'Facility', completed: this.tasks().filter(t => t.department === 'Facility' && t.status === 'Done').length, comp: 95, avg: '1.2h' },
      { dept: 'Mechanic', completed: this.tasks().filter(t => t.department === 'Mechanic' && t.status === 'Done').length, comp: 88, avg: '2.1h' },
      { dept: 'Manufacturing', completed: this.tasks().filter(t => t.department === 'Manufacturing' && t.status === 'Done').length, comp: 100, avg: '0.8h' },
      { dept: 'Maintenance', completed: this.tasks().filter(t => t.department === 'Maintenance' && t.status === 'Done').length, comp: 72, avg: '3.4h' }
    ];
  });

  // Modal properties to fix compilation
  modalOpen = signal(false);
  activeReport = signal<string>('compliance');
  selectedPeriod = signal('Last 30 Days');
  downloadState = signal('idle');
  exportState = signal('idle');
  periods = ['Last 7 Days', 'Last 30 Days', 'This Quarter', 'This Year'];
  reportTitles: Record<string, string> = {};
  reportContents: Record<string, string> = {};
  private sanitizer = inject(DomSanitizer);

  openModal(reportId: string) {
    this.activeReport.set(reportId);
    this.modalOpen.set(true);
  }

  closeModal() {
    this.modalOpen.set(false);
  }

  downloadModalPdf() {
    this.downloadState.set('exporting');
    setTimeout(() => this.downloadState.set('done'), 1000);
  }

  exportPdf() {
    this.exportState.set('exporting');
    setTimeout(() => this.exportState.set('done'), 1000);
  }

  onPeriodChange(event: any) {
    this.selectedPeriod.set(event.target.value);
  }

  getSafeHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html || '');
  }
}

