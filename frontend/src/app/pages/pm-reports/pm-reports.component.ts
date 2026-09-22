import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';
import { PMTask } from '../../core/models/pm.model';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-pm-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  providers: [DatePipe],
  templateUrl: './pm-reports.component.html',
  styleUrl: './pm-reports.component.scss'
})
export class PmReportsComponent implements OnInit {
  private pmService = inject(PmService);
  private authService = inject(AuthService);

  // Dev-only: lets us preview the PDF export with synthetic data without writing to the real DB.
  // Never populated in production builds (gated by `isDevBuild` / environment.production below).
  isDevBuild = !environment.production;
  mockTasks = signal<PMTask[]>([]);
  tasks = computed(() => [...this.pmService.pmTasks(), ...this.mockTasks()]);
  assets = this.pmService.assets;

  // Filters
  startDate = signal<string>('');
  endDate = signal<string>('');
  selectedProducts = signal<string[]>([]);
  selectedAssets = signal<string[]>([]);
  selectedYear = signal<number | ''>('');

  availableYears = computed(() => {
    const years = new Set<number>();
    for (const t of this.tasks()) {
      if (t.status === 'Done' && t.completedAt) {
        years.add(new Date(t.completedAt).getFullYear());
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  });

  historyLoaded = signal(false);

  ngOnInit() {
    // Lazy load historical data only when visiting reports
    this.pmService.loadHistoricalTasks()
      .then(() => this.historyLoaded.set(true))
      .catch(console.error);
  }

  yearDropdownOpen = signal(false);
  productDropdownOpen = signal(false);
  assetDropdownOpen = signal(false);

  toggleYearDropdown() {
    this.yearDropdownOpen.set(!this.yearDropdownOpen());
    this.productDropdownOpen.set(false);
    this.assetDropdownOpen.set(false);
  }

  toggleProductDropdown() {
    this.productDropdownOpen.set(!this.productDropdownOpen());
    this.yearDropdownOpen.set(false);
    this.assetDropdownOpen.set(false);
  }

  toggleAssetDropdown() {
    this.assetDropdownOpen.set(!this.assetDropdownOpen());
    this.yearDropdownOpen.set(false);
    this.productDropdownOpen.set(false);
  }

  closeDropdowns() {
    this.yearDropdownOpen.set(false);
    this.productDropdownOpen.set(false);
    this.assetDropdownOpen.set(false);
  }

  selectYear(y: number | '') {
    this.selectedYear.set(y);
    this.yearDropdownOpen.set(false);
  }

  toggleSelectedProduct(p: string) {
    const curr = this.selectedProducts();
    this.selectedProducts.set(curr.includes(p) ? curr.filter(x => x !== p) : [...curr, p]);
    this.selectedAssets.set([]);
  }

  toggleAllProducts() {
    const all = this.availableProducts();
    this.selectedProducts.set(this.selectedProducts().length === all.length && all.length > 0 ? [] : [...all]);
    this.selectedAssets.set([]);
  }

  toggleSelectedAsset(a: string) {
    const curr = this.selectedAssets();
    this.selectedAssets.set(curr.includes(a) ? curr.filter(x => x !== a) : [...curr, a]);
  }

  toggleAllAssets() {
    const all = this.availableAssets();
    this.selectedAssets.set(this.selectedAssets().length === all.length && all.length > 0 ? [] : [...all]);
  }

  availableProducts = computed(() =>
    this.authService.getAccessibleProducts('pm.reports.view').sort()
  );

  availableAssets = computed(() => {
    const user = this.authService.currentUser();
    const products = this.availableProducts();
    let assets = this.pmService.assets().filter(a => products.includes(a.location));
    
    if (user && (user.baseRole === 'technician' || user.baseRole === 'engineer')) {
      assets = assets.filter(a => a.department === user.department);
    }
    
    if (this.selectedProducts().length > 0) {
      assets = assets.filter(a => this.selectedProducts().includes(a.location));
    }
    return Array.from(new Set(assets.map(a => a.id))).sort();
  });

  filteredTasks = computed(() => {
    const user = this.authService.currentUser();
    let list = this.tasks().filter(t => t.status === 'Done');

    // M6 fix: enforce role-based scope even if route guard is bypassed
    if (user) {
      if (user.baseRole === 'technician') {
        list = list.filter(t => t.completedBy === user.employeeId);
      } else if (user.baseRole === 'engineer') {
        list = list.filter(t => t.department === user.department);
      }
    }

    if (this.selectedProducts().length > 0) {
      list = list.filter(t => t.productId && this.selectedProducts().includes(t.productId));
    }
    if (this.selectedAssets().length > 0) {
      list = list.filter(t => t.assetId && this.selectedAssets().includes(t.assetId));
    }

    if (this.startDate()) {
      const start = new Date(this.startDate()).getTime();
      list = list.filter(t => t.completedAt && new Date(t.completedAt).getTime() >= start);
    }
    if (this.endDate()) {
      const end = new Date(this.endDate()).setHours(23, 59, 59, 999);
      list = list.filter(t => t.completedAt && new Date(t.completedAt).getTime() <= end);
    }
    if (this.selectedYear() !== '') {
      list = list.filter(t => t.completedAt && new Date(t.completedAt).getFullYear() === this.selectedYear());
    }

    return list.sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
  });

  getTechName(employeeId: string | undefined): string {
    if (!employeeId) return '—';
    const tech = this.authService.getUser(employeeId);
    return tech?.name || employeeId;
  }

  // Dev-only trial data: synthetic "Done" tasks for every PM frequency, attached to one real
  // asset (pulled from the DB-backed asset list) so the export modal's product/asset/type
  // pickers behave exactly as they would with real data — only the task history is fabricated.
  // Purely client-side (this.mockTasks signal) — never sent to the API, never touches the DB,
  // cleared on page refresh or by clicking the toggle button again.
  loadMockPreviewData() {
    if (this.mockTasks().length > 0) {
      this.mockTasks.set([]);
      return;
    }
    const assetId = this.availableAssets()[0] ?? this.pmService.assets()[0]?.id;
    if (!assetId) return;
    const assetInfo = this.pmService.assets().find(a => a.id === assetId);
    const productId = assetInfo?.location ?? 'MOCK-PRODUCT';
    const department = assetInfo?.department ?? 'Mechanic';
    const year = 2026;
    const today = new Date(year, 8, 18); // "now" per this session
    let seq = 0;

    const makeTask = (frequency: string, date: Date, title: string): PMTask => {
      seq++;
      return {
        id: `MOCK-${frequency.replace(/\s+/g, '')}-${seq}`,
        title,
        description: `[MOCK PREVIEW] ${title}`,
        frequency,
        assetId,
        nextDueDate: date,
        estimatedHours: 1,
        status: 'Done',
        productId,
        department,
        checklist: [
          { text: `${frequency} check: lubrication`, done: true },
          { text: `${frequency} check: alignment`, done: true },
          { text: `${frequency} check: safety guard`, done: true },
        ],
        completedBy: 'MOCK-PREVIEW',
        completedAt: date,
      };
    };

    const generated: PMTask[] = [];

    // Monthly: one per finished month, Jan..Sep
    for (let m = 0; m <= today.getMonth(); m++) {
      generated.push(makeTask('Monthly', new Date(year, m, 15), `Monthly PM — ${this.MONTH_NAMES[m]}`));
    }
    // Quarterly: one per finished quarter
    for (const m of [0, 3, 6]) {
      generated.push(makeTask('Quarterly', new Date(year, m, 20), `Quarterly PM — Q${m / 3 + 1}`));
    }
    // Yearly: one for the year
    generated.push(makeTask('Yearly', new Date(year, 5, 1), 'Yearly PM'));
    // Weekly: every 7 days from Jan 1 up to today — exercises the multi-column WW layout
    for (let d = new Date(year, 0, 1); d <= today; d.setDate(d.getDate() + 7)) {
      generated.push(makeTask('Weekly', new Date(d), `Weekly PM — WW${this.getWorkWeek(d)}`));
    }
    // Daily: every day of every finished month so far — exercises the half-month day-column pages
    for (let m = 0; m <= today.getMonth(); m++) {
      const lastDay = m === today.getMonth() ? today.getDate() : new Date(year, m + 1, 0).getDate();
      for (let day = 1; day <= lastDay; day++) {
        const d = new Date(year, m, day);
        generated.push(makeTask('Daily', d, `Daily PM — ${d.toDateString()}`));
      }
    }
    // Short custom intervals — one PM Type per interval (plus bare "Hourly") so you can flip
    // between them in the export modal's PM Type dropdown and see the adaptive N-day chunking
    // (tasksPerDay = round(24/interval) → daysPerChunk) actually change as the interval changes.
    // 6 days of data per interval is enough to fill at least one full chunk window.
    const hourIntervals = [1, 2, 3, 4, 6, 8, 12];
    for (const intervalHours of hourIntervals) {
      const freq = `${intervalHours} Hour(s)`;
      const tasksPerDay = Math.max(1, Math.round(24 / intervalHours));
      const hours = Array.from({ length: tasksPerDay }, (_, i) => Math.floor(i * 24 / tasksPerDay));
      for (let offset = 0; offset < 6; offset++) {
        const day = new Date(today);
        day.setDate(day.getDate() - offset);
        for (const hour of hours) {
          const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0);
          generated.push(makeTask(freq, d, `${freq} PM — ${d.toDateString()} ${hour}:00`));
        }
      }
    }
    // Bare "Hourly" (no explicit number) — exercises the isHourly-without-hourMatch fallback path
    for (let offset = 0; offset < 6; offset++) {
      const day = new Date(today);
      day.setDate(day.getDate() - offset);
      for (let hour = 0; hour < 24; hour++) {
        const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0);
        generated.push(makeTask('Hourly', d, `Hourly PM — ${d.toDateString()} ${hour}:00`));
      }
    }


    this.mockTasks.set(generated);
  }

  printReport() {
    window.print();
  }

  // --- Form Export Feature ---
  exportModalOpen = signal(false);
  exportYear = signal<number>(new Date().getFullYear());
  exportSelectedAssets = signal<string[]>([]);
  exportSelectedType = signal<string>('');
  printMode = signal<'table' | 'form'>('table');

  readonly MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  readonly Math = Math;

  // PM types (frequency values) actually used by the selected machines in the selected year.
  // Each asset can have several concurrent PM types (Monthly, Weekly, ...) — the export always
  // scopes to exactly one type at a time so pages never mix checklists from different PM plans.
  exportAvailableTypes = computed(() => {
    const year = this.exportYear();
    const assetsToExport = this.exportSelectedAssets();
    const types = new Set<string>();
    for (const t of this.tasks()) {
      if (t.status === 'Done' && t.completedAt && assetsToExport.includes(t.assetId) &&
          new Date(t.completedAt).getFullYear() === year) {
        types.add(t.frequency);
      }
    }
    return Array.from(types).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  });

  // Requires an explicit user choice — never auto-picks a type, so an ambiguous
  // "which PM type do they want" selection can't silently export the wrong one.
  // Only passes through a previous selection if it's still valid for the current Year/Machines.
  effectiveExportType = computed(() => {
    const types = this.exportAvailableTypes();
    const sel = this.exportSelectedType();
    return types.includes(sel) ? sel : '';
  });

  exportYearOptions = computed(() => {
    const y = this.exportYear();
    return [y - 1, y, y + 1, y + 2];
  });

  openExportModal() {
    // Default to the currently selected assets in the filter, or all available if none selected
    const defaultAssets = this.selectedAssets().length > 0 ? this.selectedAssets() : this.availableAssets();
    this.exportSelectedAssets.set([...defaultAssets]);
    this.exportYear.set(new Date().getFullYear());
    this.exportSelectedType.set('');
    this.exportModalOpen.set(true);
  }

  closeExportModal() {
    this.exportModalOpen.set(false);
  }

  // Modal's own Year/PM Type dropdowns — same ms-dropdown pattern as the filter bar above,
  // kept separate so opening one here doesn't affect the filter bar's dropdown state.
  modalYearDropdownOpen = signal(false);
  modalTypeDropdownOpen = signal(false);

  toggleModalYearDropdown() {
    this.modalYearDropdownOpen.set(!this.modalYearDropdownOpen());
    this.modalTypeDropdownOpen.set(false);
  }

  toggleModalTypeDropdown() {
    this.modalTypeDropdownOpen.set(!this.modalTypeDropdownOpen());
    this.modalYearDropdownOpen.set(false);
  }

  closeModalDropdowns() {
    this.modalYearDropdownOpen.set(false);
    this.modalTypeDropdownOpen.set(false);
  }

  selectExportYear(y: number) {
    this.exportYear.set(y);
    this.modalYearDropdownOpen.set(false);
  }

  selectExportType(t: string) {
    this.exportSelectedType.set(t);
    this.modalTypeDropdownOpen.set(false);
  }

  toggleExportAsset(asset: string) {
    const curr = this.exportSelectedAssets();
    this.exportSelectedAssets.set(curr.includes(asset) ? curr.filter(a => a !== asset) : [...curr, asset]);
  }

  getAssetName(assetId: string): string {
    const asset = this.assets().find(a => a.id === assetId);
    return asset ? asset.name : assetId;
  }

  // Generate form pages scoped to a single PM type (frequency), 1 asset per page-scope.
  // Every type uses the same grid (checklist rows × period columns, with a per-column
  // Signature/Approved footer) so every occurrence gets its own approval slot — just like Monthly.
  // - Weekly: 1 page/month, 1 column per work-week in that month.
  // - Daily: 1 column per day, chunked into fixed 15-day windows (1-15, 16-end) per month.
  // - Hourly / short Custom (e.g. "4 Hour(s)"): 1 column per completion, chunked into N-day
  //   windows per month where N is picked so a page holds ~15 columns (e.g. a 4-hour interval →
  //   6 completions/day → 2-day windows); never more than 5 days/window. If a single day alone
  //   still exceeds 15 columns (very frequent intervals like hourly), it's split further into
  //   consecutive same-day pages so the next page continues that day instead of skipping ahead.
  // - Everything else (Monthly, Quarterly, Yearly, long Custom): 1 page/month, single column.
  exportFormData = computed(() => {
    const year = this.exportYear();
    const assetsToExport = this.exportSelectedAssets();
    const type = this.effectiveExportType();
    if (!type) return [];
    const monthNames = this.MONTH_NAMES;
    const normalizedType = type.trim().toLowerCase();
    const isWeekly = normalizedType === 'weekly';
    const isDaily = normalizedType === 'daily';
    const hourMatch = normalizedType.match(/(\d+)\s*hour/);
    const isHourly = normalizedType === 'hourly' || !!hourMatch;

    // Chunking + column strategy for types with many occurrences/month. `daysPerChunk === 0`
    // means "no chunking, 1 page per month" (Weekly/Monthly/Quarterly/Yearly/long Custom).
    // MAX_COLUMNS_PER_PAGE is the widest column count that reliably fits the printed page — any
    // window that still ends up wider than this (e.g. a single very-frequent day) gets sliced
    // further below so overflow continues on the SAME day instead of jumping to the next one.
    const MAX_COLUMNS_PER_PAGE = 15;
    let daysPerChunk = 0;
    let columnFor: ((date: Date, idx: number) => { key: number; label: string }) | null = null;
    if (isDaily) {
      daysPerChunk = 15;
      columnFor = date => ({ key: date.getDate(), label: date.getDate().toString() });
    } else if (isHourly) {
      const intervalHours = hourMatch ? Math.max(1, parseInt(hourMatch[1], 10)) : 1;
      const tasksPerDay = Math.max(1, Math.round(24 / intervalHours));
      daysPerChunk = Math.min(5, Math.max(1, Math.floor(MAX_COLUMNS_PER_PAGE / tasksPerDay)));
      columnFor = (date, idx) => ({ key: idx, label: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    }

    const yearTasks = this.tasks().filter(t =>
      t.status === 'Done' &&
      t.completedAt &&
      t.frequency === type &&
      new Date(t.completedAt).getFullYear() === year &&
      assetsToExport.includes(t.assetId)
    );

    const pages: {
      assetId: string;
      assetName: string;
      year: number;
      frequency: string;
      monthLabel: string;
      columnAxisLabel: string;
      showWwRow: boolean;
      columns: { key: number; label: string; ww: string; date: string }[];
      checklistRows: { text: string; marks: { [key: number]: string } }[];
    }[] = [];

    // One page (checklist rows × period columns) built from tasks already scoped to a single
    // month (or a chunk of days within it, for Daily/Hourly).
    const buildGridPage = (assetId: string, pageLabel: string, scopeTasks: PMTask[], colFor: (date: Date, idx: number) => { key: number; label: string }) => {
      const checklistItems: string[] = [];
      const marks = new Map<string, { [key: number]: string }>();
      const columns = new Map<number, { label: string; ww: string; date: string }>();

      scopeTasks.forEach((task, idx) => {
        const date = new Date(task.completedAt!);
        const ww = this.getWorkWeek(date);
        const dateStr = `${date.getDate()} ${monthNames[date.getMonth()]}`;
        const { key, label } = colFor(date, idx);
        columns.set(key, { label, ww: ww.toString(), date: dateStr });

        const items = task.checklist && task.checklist.length > 0
          ? task.checklist
          : [{ text: task.title, done: true }];

        for (const item of items) {
          if (!checklistItems.includes(item.text)) {
            checklistItems.push(item.text);
          }
          if (!marks.has(item.text)) {
            marks.set(item.text, {});
          }
          if (item.requiresValue) {
            if (item.value) {
              marks.get(item.text)![key] = item.value;
            }
          } else if (item.done) {
            marks.get(item.text)![key] = '√';
          }
        }
      });

      pages.push({
        assetId,
        assetName: this.getAssetName(assetId),
        year,
        frequency: type,
        monthLabel: pageLabel,
        columnAxisLabel: isWeekly ? 'Week' : isDaily ? 'Day' : isHourly ? 'Time' : 'Month',
        // Weekly's column header already shows the bare WW number — a separate WW row would just
        // repeat it. Daily/Hourly/Monthly all keep it since it adds real info there (WW can differ
        // across columns on the same page, or pin down one specific day's WW).
        showWwRow: !isWeekly,
        columns: Array.from(columns.entries())
          .sort(([a], [b]) => a - b)
          .map(([key, col]) => ({ key, ...col })),
        checklistRows: checklistItems.map(text => ({ text, marks: marks.get(text) ?? {} })),
      });
    };

    for (const assetId of assetsToExport) {
      const assetTasks = yearTasks.filter(t => t.assetId === assetId);

      for (let month = 0; month < 12; month++) {
        const monthTasks = assetTasks
          .filter(t => new Date(t.completedAt!).getMonth() === month)
          .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime());
        if (monthTasks.length === 0) continue;

        if (daysPerChunk > 0 && columnFor) {
          const lastDay = new Date(year, month + 1, 0).getDate();
          for (let start = 1; start <= lastDay; start += daysPerChunk) {
            const end = Math.min(lastDay, start + daysPerChunk - 1);
            const windowTasks = monthTasks.filter(t => {
              const day = new Date(t.completedAt!).getDate();
              return day >= start && day <= end;
            });
            if (windowTasks.length === 0) continue;
            const label = start === end ? `${monthNames[month]} ${start}` : `${monthNames[month]} ${start}-${end}`;
            // A window can still be wider than the printable page (e.g. a single very-frequent
            // day) — slice it further so the remainder continues on the next page, same day,
            // instead of silently overflowing off the physical page.
            const slices = this.chunkArray(windowTasks, MAX_COLUMNS_PER_PAGE);
            slices.forEach((slice, sliceIdx) => {
              const sliceLabel = slices.length > 1 ? `${label} (${sliceIdx + 1}/${slices.length})` : label;
              buildGridPage(assetId, sliceLabel, slice, columnFor);
            });
          }
        } else {
          const perMonthColumnFor = isWeekly
            ? (date: Date) => ({ key: this.getWorkWeek(date), label: this.getWorkWeek(date).toString() })
            : () => ({ key: 0, label: monthNames[month] });
          buildGridPage(assetId, monthNames[month], monthTasks, perMonthColumnFor);
        }
      }
    }

    return pages;
  });


  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  // Work week = calendar week-of-year, counted from Jan 1 of that date's year (WW1 = days 1-7, ...).
  private getWorkWeek(date: Date): number {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const dayOfYear = Math.round((date.getTime() - startOfYear.getTime()) / 86400000) + 1;
    return Math.ceil(dayOfYear / 7);
  }

  generatePdf() {
    if (this.exportSelectedAssets().length === 0 || !this.effectiveExportType()) return;
    this.printMode.set('form');
    this.closeExportModal();

    // Wait two animation frames to guarantee Angular has rendered the print DOM
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
        this.printMode.set('table');
      });
    });
  }
}
