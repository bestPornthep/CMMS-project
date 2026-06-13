import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-pm-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pm-reports.component.html',
  styleUrl: './pm-reports.component.scss'
})
export class PmReportsComponent {
  private pmService = inject(PmService);
  private authService = inject(AuthService);

  tasks = this.pmService.pmTasks;

  // Filters
  startDate = signal<string>('');
  endDate = signal<string>('');
  selectedProducts = signal<string[]>([]);
  selectedAssets = signal<string[]>([]);

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
    let list = this.tasks().filter(t => t.status === 'Done');

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
      const end = new Date(this.endDate()).getTime();
      list = list.filter(t => t.completedAt && new Date(t.completedAt).getTime() <= end + 86400000);
    }

    return list.sort((a, b) => {
      const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return timeB - timeA;
    });
  });

  printReport() {
    window.print();
  }
}
