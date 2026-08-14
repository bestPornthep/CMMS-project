import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';
import { PMTask } from '../../core/models/pm.model';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

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

  tasks = this.pmService.pmTasks;
  assets = this.pmService.assets;

  // Filters
  startDate = signal<string>('');
  endDate = signal<string>('');
  selectedProducts = signal<string[]>([]);
  selectedAssets = signal<string[]>([]);

  historyLoaded = signal(false);

  ngOnInit() {
    // Lazy load historical data only when visiting reports
    this.pmService.loadHistoricalTasks()
      .then(() => this.historyLoaded.set(true))
      .catch(console.error);
  }

  productDropdownOpen = signal(false);
  assetDropdownOpen = signal(false);

  toggleProductDropdown() {
    this.productDropdownOpen.set(!this.productDropdownOpen());
    this.assetDropdownOpen.set(false);
  }

  toggleAssetDropdown() {
    this.assetDropdownOpen.set(!this.assetDropdownOpen());
    this.productDropdownOpen.set(false);
  }

  closeDropdowns() {
    this.productDropdownOpen.set(false);
    this.assetDropdownOpen.set(false);
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

    return list.sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime());
  });

  getTechName(employeeId: string | undefined): string {
    if (!employeeId) return '—';
    const tech = this.authService.getUser(employeeId);
    return tech?.name || employeeId;
  }

  printReport() {
    window.print();
  }

  // --- Form Export Feature ---
  exportModalOpen = signal(false);
  exportYear = signal<number>(new Date().getFullYear());
  exportSelectedAssets = signal<string[]>([]);
  printMode = signal<'table' | 'form'>('table');

  readonly MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  readonly FORM_HALVES: { label: string; months: number[] }[] = [
    { label: 'Jan–Jun', months: [0, 1, 2, 3, 4, 5] },
    { label: 'Jul–Dec', months: [6, 7, 8, 9, 10, 11] },
  ];

  readonly Math = Math;

  openExportModal() {
    // Default to the currently selected assets in the filter, or all available if none selected
    const defaultAssets = this.selectedAssets().length > 0 ? this.selectedAssets() : this.availableAssets();
    this.exportSelectedAssets.set([...defaultAssets]);
    this.exportYear.set(new Date().getFullYear());
    this.exportModalOpen.set(true);
  }

  closeExportModal() {
    this.exportModalOpen.set(false);
  }

  toggleExportAsset(asset: string) {
    const curr = this.exportSelectedAssets();
    this.exportSelectedAssets.set(curr.includes(asset) ? curr.filter(a => a !== asset) : [...curr, asset]);
  }

  getAssetName(assetId: string): string {
    const asset = this.assets().find(a => a.id === assetId);
    return asset ? asset.name : assetId;
  }

  // Generate 2 form pages per asset: Jan–Jun and Jul–Dec.
  // Each page has a union checklist, per-item per-month marks (√ or ''), and WW/date per month.
  exportFormData = computed(() => {
    const year = this.exportYear();
    const assetsToExport = this.exportSelectedAssets();
    const monthNames = this.MONTH_NAMES;

    const yearTasks = this.tasks().filter(t =>
      t.status === 'Done' &&
      t.completedAt &&
      new Date(t.completedAt).getFullYear() === year &&
      assetsToExport.includes(t.assetId)
    );

    // Per-asset: collect union checklist items and per-month data
    const dataByAsset = new Map<string, {
      checklistItems: string[];
      marks: Map<string, { [month: number]: string }>;
      wwByMonth: { [month: number]: string };
      dateByMonth: { [month: number]: string };
    }>();

    for (const assetId of assetsToExport) {
      dataByAsset.set(assetId, { checklistItems: [], marks: new Map(), wwByMonth: {}, dateByMonth: {} });
    }

    for (const task of yearTasks) {
      const d = dataByAsset.get(task.assetId);
      if (!d) continue;

      const date = new Date(task.completedAt!);
      const month = date.getMonth();
      const firstDayOfMonth = new Date(year, month, 1).getDay();
      const ww = Math.ceil((date.getDate() + firstDayOfMonth) / 7).toString();
      const dateStr = `${date.getDate()} ${monthNames[month]}`;

      d.wwByMonth[month] = ww;
      d.dateByMonth[month] = dateStr;

      const items = task.checklist && task.checklist.length > 0
        ? task.checklist
        : [{ text: task.title, done: true }];

      for (const item of items) {
        if (!d.checklistItems.includes(item.text)) {
          d.checklistItems.push(item.text);
        }
        if (!d.marks.has(item.text)) {
          d.marks.set(item.text, {});
        }
        if (item.requiresValue) {
          if (item.value) {
            d.marks.get(item.text)![month] = item.value;
          }
        } else if (item.done) {
          d.marks.get(item.text)![month] = '√';
        }
      }
    }

    // Flatten into 2 pages per asset
    const pages: {
      assetId: string;
      assetName: string;
      year: number;
      halfLabel: string;
      months: number[];
      checklistRows: { text: string; marks: { [month: number]: string } }[];
      wwByMonth: { [month: number]: string };
      dateByMonth: { [month: number]: string };
    }[] = [];

    for (const assetId of assetsToExport) {
      const d = dataByAsset.get(assetId)!;
      const checklistRows = d.checklistItems.map(text => ({
        text,
        marks: d.marks.get(text) ?? {}
      }));

      for (const half of this.FORM_HALVES) {
        pages.push({
          assetId,
          assetName: this.getAssetName(assetId),
          year,
          halfLabel: half.label,
          months: half.months,
          checklistRows,
          wwByMonth: d.wwByMonth,
          dateByMonth: d.dateByMonth,
        });
      }
    }

    return pages;
  });

  generatePdf() {
    if (this.exportSelectedAssets().length === 0) return;
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
