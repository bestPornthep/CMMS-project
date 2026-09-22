import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';
import { TranslationService } from '../../core/services/translation.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { PMTask } from '../../core/models/pm.model';
import { environment } from '../../../environments/environment';

interface MasterPlanMark {
  code: string;
  colorClass: string;
}

interface MasterPlanRow {
  assetId: string;
  assetName: string;
  department: string;
  workCenter: string;
  isActive: boolean;
  frequencyLabel: string;
  marks: Record<number, MasterPlanMark[]>;
}

@Component({
  selector: 'app-pm-master-plan',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './pm-master-plan.component.html',
  styleUrl: './pm-master-plan.component.scss'
})
export class PmMasterPlanComponent implements OnInit {
  private pmService = inject(PmService);
  private authService = inject(AuthService);
  private translationService = inject(TranslationService);

  readonly MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  readonly departments = ['Facility', 'Mechanic', 'Manufacturing', 'Maintenance', 'Test'];

  historyLoaded = signal(false);

  ngOnInit() {
    // 'Done' tasks aren't loaded by default — needed so occurrences already completed
    // earlier in the selected year still show their WW mark.
    this.pmService.loadHistoricalTasks()
      .then(() => this.historyLoaded.set(true))
      .catch(console.error);
  }

  // Dev-only: synthetic tasks (one per unit: Hour/Day/Week/Month/Quarter/Year) attached to one
  // real asset, so every color in the legend can be previewed without needing real data of
  // every type. Purely client-side (mockTasks signal) — never sent to the API.
  isDevBuild = !environment.production;
  mockTasks = signal<PMTask[]>([]);
  tasks = computed(() => [...this.pmService.pmTasks(), ...this.mockTasks()]);

  loadMockPreviewData() {
    if (this.mockTasks().length > 0) {
      this.mockTasks.set([]);
      return;
    }
    // Must pick an asset that's actually visible under the current role/department/product/search
    // filters — picking from the full unfiltered asset list could silently target a machine an
    // engineer/technician can't see, making the mock data look like it "did nothing".
    const asset = this.filteredAssets()[0] ?? this.pmService.assets()[0];
    if (!asset) return;
    const year = this.selectedYear();
    let seq = 0;
    const makeTask = (frequency: string, date: Date): PMTask => {
      seq++;
      return {
        id: `MOCK-MP-${seq}`,
        title: `[MOCK PREVIEW] ${frequency}`,
        description: '',
        frequency,
        assetId: asset.id,
        nextDueDate: date,
        estimatedHours: 1,
        status: 'Pending',
        productId: asset.location,
        department: asset.department
      };
    };

    const generated: PMTask[] = [];
    for (let i = 0; i < 5; i++) generated.push(makeTask('4 Hour(s)', new Date(year, 0, 2 + i)));
    for (let i = 0; i < 6; i++) generated.push(makeTask('Daily', new Date(year, 1, 2 + i)));
    for (let w = 0; w < 6; w++) generated.push(makeTask('Weekly', new Date(year, 2, 1 + w * 7)));
    for (let m = 0; m < 12; m++) generated.push(makeTask('Monthly', new Date(year, m, 15)));
    for (const m of [0, 3, 6, 9]) generated.push(makeTask('Quarterly', new Date(year, m, 22)));
    generated.push(makeTask('Yearly', new Date(year, 6, 1)));
    this.mockTasks.set(generated);
  }

  get currentUser() { return this.authService.currentUser(); }

  // ── Filters ──────────────────────────────────────────────────────────────
  selectedYear = signal(new Date().getFullYear());
  selectedDepartments = signal<string[]>([]);
  selectedProducts = signal<string[]>([]);
  searchQuery = signal('');

  yearDropdownOpen = signal(false);
  deptDropdownOpen = signal(false);
  productDropdownOpen = signal(false);

  toggleYearDropdown() {
    this.yearDropdownOpen.set(!this.yearDropdownOpen());
    this.deptDropdownOpen.set(false);
    this.productDropdownOpen.set(false);
  }

  toggleDeptDropdown() {
    this.deptDropdownOpen.set(!this.deptDropdownOpen());
    this.yearDropdownOpen.set(false);
    this.productDropdownOpen.set(false);
  }

  toggleProductDropdown() {
    this.productDropdownOpen.set(!this.productDropdownOpen());
    this.yearDropdownOpen.set(false);
    this.deptDropdownOpen.set(false);
  }

  closeDropdowns() {
    this.yearDropdownOpen.set(false);
    this.deptDropdownOpen.set(false);
    this.productDropdownOpen.set(false);
  }

  selectYear(y: number) {
    this.selectedYear.set(y);
    this.yearDropdownOpen.set(false);
  }

  toggleDept(d: string) {
    const curr = this.selectedDepartments();
    this.selectedDepartments.set(curr.includes(d) ? curr.filter(x => x !== d) : [...curr, d]);
  }

  toggleProduct(p: string) {
    const curr = this.selectedProducts();
    this.selectedProducts.set(curr.includes(p) ? curr.filter(x => x !== p) : [...curr, p]);
  }

  availableProducts = computed(() => this.authService.getAccessibleProducts('pm.reports.view').sort());

  availableYears = computed(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    for (const t of this.tasks()) {
      if (t.nextDueDate) years.add(new Date(t.nextDueDate).getFullYear());
    }
    return Array.from(years).sort((a, b) => b - a);
  });

  // Same machine-visibility rule as Manage Machines: admin/manager see every machine,
  // engineer/technician see every machine in their own department (any customer) — so a
  // newly-added machine (any page) shows up here automatically, no extra plumbing needed.
  private visibleAssets = computed(() => {
    const role = this.currentUser?.baseRole;
    const showAll = role === 'admin' || role === 'manager';
    const userDept = (this.currentUser?.department || '').toLowerCase();
    return this.pmService.assets().filter(a => showAll || a.department?.toLowerCase() === userDept);
  });

  filteredAssets = computed(() => {
    const products = this.selectedProducts();
    const depts = this.selectedDepartments();
    const q = this.searchQuery().trim().toLowerCase();
    return this.visibleAssets()
      .filter(a => products.length === 0 || products.includes(a.location))
      .filter(a => depts.length === 0 || depts.includes(a.department))
      .filter(a => !q || a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  // Week-of-year column layout for the selected year, grouped by month for the header row.
  monthGroups = computed(() => {
    const year = this.selectedYear();
    const groups: { label: string; weeks: number[] }[] = this.MONTH_NAMES.map(label => ({ label, weeks: [] as number[] }));
    const lastWeek = this.weeksInYear(year);
    for (let ww = 1; ww <= lastWeek; ww++) {
      const d = new Date(year, 0, (ww - 1) * 7 + 1);
      groups[d.getMonth()].weeks.push(ww);
    }
    return groups.filter(g => g.weeks.length > 0);
  });

  allWeeks = computed(() => this.monthGroups().flatMap(g => g.weeks));

  // One row per machine, matching the controlled document format — every concurrent PM plan
  // (e.g. Monthly + Yearly) is overlaid on the same row's WW grid, color-coded by period so
  // they stay visually distinguishable. Assets with no PM plan yet still get a row so auditors
  // can see the machine exists.
  rows = computed<MasterPlanRow[]>(() => {
    const year = this.selectedYear();
    const tasks = this.tasks();
    const out: MasterPlanRow[] = [];

    for (const asset of this.filteredAssets()) {
      const assetTasks = tasks.filter(t => t.assetId === asset.id && t.nextDueDate);
      const frequencies = Array.from(new Set(assetTasks.map(t => t.frequency)));
      const marks: Record<number, MasterPlanMark[]> = {};

      for (const frequency of frequencies) {
        const freqTasks = assetTasks.filter(t => t.frequency === frequency);
        const code = this.periodCode(frequency);
        const mark: MasterPlanMark = { code, colorClass: this.freqColorClass(code) };
        const unit = code.slice(-1);

        if (unit === 'D' || unit === 'H') {
          // Daily/Hourly plans recur so often they're effectively "active every week" once
          // started — mark every WW from the plan's first-ever occurrence through year-end,
          // rather than only the specific WWs that happen to have a generated task row.
          const earliest = freqTasks
            .map(t => new Date(t.nextDueDate))
            .sort((a, b) => a.getTime() - b.getTime())[0];
          if (earliest && earliest.getFullYear() <= year) {
            const startWw = earliest.getFullYear() < year ? 1 : this.getWorkWeek(earliest);
            for (let ww = startWw; ww <= this.weeksInYear(year); ww++) {
              (marks[ww] ??= []).push(mark);
            }
          }
        } else {
          for (const t of freqTasks) {
            const due = new Date(t.nextDueDate);
            if (due.getFullYear() !== year) continue;
            (marks[this.getWorkWeek(due)] ??= []).push(mark);
          }
        }
      }

      out.push({
        assetId: asset.id,
        assetName: asset.name,
        department: asset.department,
        workCenter: asset.workCenter || asset.location,
        isActive: asset.isActive !== false,
        frequencyLabel: frequencies.map(f => this.translationService.translate(f)).join(', '),
        marks
      });
    }
    return out;
  });

  private weeksInYear(year: number): number {
    return this.getWorkWeek(new Date(year, 11, 31));
  }

  // Work week = calendar week-of-year, counted from Jan 1 of that date's year (WW1 = days 1-7, ...).
  private getWorkWeek(date: Date): number {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const dayOfYear = Math.round((date.getTime() - startOfYear.getTime()) / 86400000) + 1;
    return Math.ceil(dayOfYear / 7);
  }

  // Short grid legend code, e.g. Monthly -> "1M", "4 Hour(s)" -> "4H" (same style as the
  // period codes in docs/backend_pm_id_format.html).
  private periodCode(frequency: string): string {
    const norm = frequency.trim().toLowerCase();
    const presets: Record<string, string> = { daily: '1D', weekly: '1W', monthly: '1M', quarterly: '3M', yearly: '1Y' };
    if (presets[norm]) return presets[norm];
    const m = norm.match(/^(\d+)\s*(hour|day|week|month|year)/);
    if (m) {
      const unitLetter: Record<string, string> = { hour: 'H', day: 'D', week: 'W', month: 'M', year: 'Y' };
      return `${m[1]}${unitLetter[m[2]]}`;
    }
    return frequency;
  }

  // Color by base unit (last letter of the period code) so e.g. "Monthly" and a custom
  // "1 Month(s)" plan share the same highlight — lets multiple overlaid PM plans on one row
  // stay visually distinguishable at a glance.
  private freqColorClass(code: string): string {
    const unitClass: Record<string, string> = {
      D: 'freq-daily', W: 'freq-weekly', M: 'freq-monthly', Y: 'freq-yearly', H: 'freq-hourly'
    };
    return unitClass[code.slice(-1)] || 'freq-other';
  }

  pad(ww: number): string {
    return String(ww).padStart(2, '0');
  }

  printPlan() {
    window.print();
  }
}
