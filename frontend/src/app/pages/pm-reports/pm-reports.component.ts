import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-pm-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [DatePipe],
  templateUrl: './pm-reports.component.html',
  styleUrl: './pm-reports.component.scss'
})
export class PmReportsComponent implements OnInit {
  private pmService = inject(PmService);
  private authService = inject(AuthService);

  tasks = this.pmService.pmTasks;

  // Filters
  startDate = signal<string>('');
  endDate = signal<string>('');
  selectedProducts = signal<string[]>([]);
  selectedAssets = signal<string[]>([]);

  ngOnInit() {
    // Lazy load historical data only when visiting reports
    this.pmService.loadHistoricalTasks().catch(console.error);
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
    const products = this.availableProducts();
    let assets = this.pmService.assets().filter(a => products.includes(a.location));
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
}
