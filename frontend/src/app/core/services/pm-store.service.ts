import { Injectable, computed, inject, signal } from '@angular/core';
import { Asset, PMTask } from '../models/pm.model';
import { ApiService } from './api.service';
import { TemplateService } from './template.service';
import { normalizeFrequency } from './pm-frequency.util';
import { mergeLoadedAssets } from './pm-plan.util';

// Machines, real tasks and preview tasks live together because approving a Master Plan request
// writes all three. Only the PM domain services call the update methods; components read the views.
@Injectable({ providedIn: 'root' })
export class PmStore {
  private api = inject(ApiService);
  private templateService = inject(TemplateService);

  private assetsSignal = signal<Asset[]>([]);
  private pmTasksSignal = signal<PMTask[]>([]);

  // In-memory preview tasks (see PMTask.isPreview). Kept apart from real tasks so no execution page
  // (Assign PM, Record PM, Calendar, Dashboard, Reports) ever sees them; only plan views read both.
  private previewTasksSignal = signal<PMTask[]>([]);

  readonly assets = computed(() => this.assetsSignal());
  // Hides machines that have been deactivated — use for pickers (Create PM, etc.), not for
  // history/reporting views, which must still show inactive machines' past data.
  readonly activeAssets = computed(() => this.assetsSignal().filter(a => a.isActive !== false));
  readonly pmTasks = computed(() => this.pmTasksSignal());
  readonly previewTasks = computed(() => this.previewTasksSignal());
  // Real tasks plus preview tasks — for the Master Plan grid and the machine detail only.
  readonly planTasks = computed(() => [...this.pmTasksSignal(), ...this.previewTasksSignal()]);

  viewedTaskGlobal = signal<PMTask | null>(null);

  loadData(): Promise<void> {
    return Promise.all([
      this.api.getAssets(),
      this.api.getTasks(undefined, undefined, undefined, undefined, 'Done'), // Exclude 'Done' tasks on initial load
      this.api.getTemplates(),
    ]).then(([assets, tasks, templates]) => {
      this.assetsSignal.set(mergeLoadedAssets(assets, this.assetsSignal(), tasks));
      this.pmTasksSignal.set(tasks);
      this.templateService.setLoadedTemplates(templates);
    });
  }

  loadHistoricalTasks(): Promise<void> {
    // Only fetch 'Done' tasks
    return this.api.getTasks('Done').then(tasks => {
      // Merge with existing tasks (avoiding duplicates)
      this.pmTasksSignal.update(existing => {
        const existingIds = new Set(existing.map(t => t.id));
        const newTasks = tasks.filter(t => !existingIds.has(t.id));
        return [...existing, ...newTasks];
      });
    });
  }

  // Hard-block guard: an asset may only ever have one PM of a given frequency, regardless of status.
  // Preview tasks count too: a PM type approved into the plan is a PM type even before it is saved.
  findExistingPmOfType(assetId: string, frequency: string): PMTask | undefined {
    const target = normalizeFrequency(frequency);
    return this.planTasks().find(t => t.assetId === assetId && normalizeFrequency(t.frequency) === target);
  }

  updateAssets(fn: (assets: Asset[]) => Asset[]): void {
    this.assetsSignal.update(fn);
  }

  setPmTasks(tasks: PMTask[]): void {
    this.pmTasksSignal.set(tasks);
  }

  updatePmTasks(fn: (tasks: PMTask[]) => PMTask[]): void {
    this.pmTasksSignal.update(fn);
  }

  updatePreviewTasks(fn: (tasks: PMTask[]) => PMTask[]): void {
    this.previewTasksSignal.update(fn);
  }
}
