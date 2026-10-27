import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { PendingMasterPlanChange } from '../../core/models/pm.model';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-pm-approvals',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './pm-approvals.component.html',
  styleUrl: './pm-approvals.component.scss'
})
export class PmApprovalsComponent {
  private pmService = inject(PmService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  // Dev-only: seeds a couple of pending cards so this page can be reviewed/tested before a
  // backend exists for PendingMasterPlanChange (see docs/backend_fixes_needed_combined.html#masterplan).
  isDevBuild = !environment.production;

  canApprove = computed(() => this.authService.hasPermission('pm.masterplan.approve'));

  pendingChanges = computed(() => this.pmService.pendingMasterPlanChanges().filter(c => c.status === 'pending'));
  resolvedChanges = computed(() => this.pmService.pendingMasterPlanChanges()
    .filter(c => c.status !== 'pending')
    .sort((a, b) => new Date(b.resolvedAt || 0).getTime() - new Date(a.resolvedAt || 0).getTime())
    .slice(0, 10));

  detailId = signal<string | null>(null);
  detailRecord = computed(() => this.pmService.pendingMasterPlanChanges().find(c => c.id === this.detailId()) || null);
  selectedIds = signal<Set<string>>(new Set());
  rejectingId = signal<string | null>(null);
  rejectReason = signal('');
  showResolvedHistory = signal(false);
  // True while an approve/reject runs, so its buttons cannot fire it twice.
  processing = signal(false);

  seedMockData() {
    this.pmService.seedMockMasterPlanChanges();
  }

  openDetail(record: PendingMasterPlanChange) {
    this.detailId.set(record.id);
  }

  closeDetail() {
    this.detailId.set(null);
    this.rejectingId.set(null);
    this.rejectReason.set('');
  }

  // Live asset state to diff a proposal's editFields/setActive against — not a snapshot, so the
  // modal always shows "current vs proposed", same reconcile-not-replay principle as the service.
  currentAssetOf(record: PendingMasterPlanChange) {
    return this.pmService.assets().find(a => a.id === record.assetId);
  }

  // Looks up the real existing PM (title/checklist/hours/parts) a removePmTypes entry refers
  // to, so the approver sees what's actually being removed instead of just a frequency label —
  // there's nothing to look up for addPmTypes, since a proposed new PM type has no definition
  // yet (see handoff: no PM-definition UI exists for proposals).
  existingPmFor(assetId: string, frequency: string) {
    return this.pmService.findExistingPmOfType(assetId, frequency);
  }

  resolveName(employeeId?: string): string {
    if (!employeeId) return '';
    return this.authService.getUser(employeeId)?.name || employeeId;
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleSelection(id: string) {
    this.selectedIds.update(set => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  toggleAllSelection(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedIds.set(checked ? new Set(this.pendingChanges().map(c => c.id)) : new Set());
  }

  isSendRequest(record: PendingMasterPlanChange): boolean {
    return this.pmService.isSendRequest(record);
  }

  // ── Change description tags (green +added / red −removed, reuse pm-audit's pill style) ──
  changeTags(record: PendingMasterPlanChange): { text: string; cls: string }[] {
    const tags: { text: string; cls: string }[] = [];
    const p = record.proposedState;
    if (this.pmService.isSendRequest(record)) tags.push({ text: 'Add to Master Plan', cls: 'tag-send' });
    if (p.setActive === false) tags.push({ text: `− Deactivate machine`, cls: 'tag-removed' });
    if (p.setActive === true) tags.push({ text: `+ Reactivate machine`, cls: 'tag-added' });
    if (p.editFields?.name) tags.push({ text: `Rename → "${p.editFields.name}"`, cls: 'tag-edited' });
    if (p.editFields?.department) tags.push({ text: `Dept → ${p.editFields.department}`, cls: 'tag-edited' });
    if (p.editFields?.location) tags.push({ text: `Customer → ${p.editFields.location}`, cls: 'tag-edited' });
    if (p.editFields?.workCenter) tags.push({ text: `Work Center → ${p.editFields.workCenter}`, cls: 'tag-edited' });
    for (const f of p.addPmTypes || []) tags.push({ text: `+ ${f} PM`, cls: 'tag-added' });
    for (const f of p.removePmTypes || []) tags.push({ text: `− ${f} PM`, cls: 'tag-removed' });
    return tags;
  }

  async approveOne(record: PendingMasterPlanChange) {
    if (this.processing()) return;
    this.processing.set(true);
    try {
      await this.pmService.approveMasterPlanChange(record.id);
      this.toast.success(`Approved changes for ${record.assetId}.`);
      if (this.detailId() === record.id) this.closeDetail();
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to approve. Please try again.');
    } finally {
      this.processing.set(false);
    }
  }

  startReject(id: string) {
    this.rejectingId.set(id);
    this.rejectReason.set('');
  }

  rejectFromRow(record: PendingMasterPlanChange) {
    this.openDetail(record);
    this.startReject(record.id);
  }

  cancelReject() {
    this.rejectingId.set(null);
    this.rejectReason.set('');
  }

  confirmReject(record: PendingMasterPlanChange) {
    if (this.processing()) return;
    if (!this.rejectReason().trim()) {
      this.toast.warning('Please enter a reason for rejecting this change.');
      return;
    }
    try {
      this.pmService.rejectMasterPlanChange(record.id, this.rejectReason());
      this.toast.success(`Rejected changes for ${record.assetId}.`);
      this.cancelReject();
      if (this.detailId() === record.id) this.closeDetail();
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to reject. Please try again.');
    }
  }

  async bulkApprove() {
    if (this.processing()) return;
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) {
      this.toast.warning('Please select at least one item.');
      return;
    }
    // One bulk-approve action = one revision (Rev A -> Rev B), not one per item — and one shared
    // Audit Log timestamp for every row. approveMasterPlanChanges() handles both in a single batch.
    let results: Awaited<ReturnType<PmService['approveMasterPlanChanges']>>;
    this.processing.set(true);
    try {
      results = await this.pmService.approveMasterPlanChanges(ids);
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to approve. Please try again.');
      return;
    } finally {
      this.processing.set(false);
    }
    const failures = results.filter(r => !r.ok);

    if (failures.length === 0) {
      this.toast.success(`${ids.length} change(s) approved.`);
    } else if (failures.length < results.length) {
      this.toast.warning(`${results.length - failures.length} approved, ${failures.length} failed. Please check and retry.`);
    } else {
      this.toast.error(`All ${failures.length} change(s) failed to approve.`);
    }
    // A failed item stays pending in the list; say why, once per distinct reason.
    const reasons = new Set(failures.map(f => f.error?.message || 'Failed to approve. Please try again.'));
    reasons.forEach(reason => this.toast.error(reason));
    this.selectedIds.set(new Set());
  }
}
