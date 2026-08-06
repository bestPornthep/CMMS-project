import { Component, computed, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { PMTaskFrequency, PMTaskStatus, Template } from '../../core/models/pm.model';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-pm-create',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './pm-create.component.html',
  styleUrl: './pm-create.component.scss'
})
export class PmCreateComponent {
  private pmService = inject(PmService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  // Form Model
  pmType: PMTaskFrequency = 'Monthly';
  customDurationValue: number = 1;
  customDurationUnit: string = 'month(s)';
  
  isRecurring: boolean = true;
  isGenerating = signal(false);

  productId: string = '';
  department: string = '';
  assetId: string = '';
  estimatedHours: number = 2.5;
  description: string = '';

  // Expose auth service properties for UI
  get currentUser() { return this.authService.currentUser(); }
  get canChangeDept() {
    const role = this.currentUser?.baseRole;
    return role === 'admin' || role === 'manager';
  }

  constructor() {
    // Auto-assign department for Eng/Tech
    if (!this.canChangeDept && this.currentUser?.department) {
      this.department = this.currentUser.department;
    }
  }

  // Dynamic Lists
  checklist = signal<{ text: string, requiresPhoto: boolean }[]>([
    { text: 'Inspect bearing assembly', requiresPhoto: false },
    { text: 'Check lubrication levels', requiresPhoto: false },
    { text: 'Test pressure relief valve', requiresPhoto: false }
  ]);
  newChecklistItem = '';

  parts = signal<string[]>([]);
  selectedPart = '';

  // Modals
  showSaveTemplateModal = false;
  showManageTemplateModal = false;
  newTemplateName = '';
  defaultTemplates = computed(() => {
    const all = this.pmService.templates();
    return all.filter(t => t.isDefault && (this.canChangeDept || t.department === 'All' || t.department === this.currentUser?.department));
  });

  personalTemplates = computed(() => {
    const all = this.pmService.templates();
    return all.filter(t => !t.isDefault && t.createdBy === this.currentUser?.employeeId);
  });

  templates = computed(() => [...this.defaultTemplates(), ...this.personalTemplates()]);
  dropdownOpen = false;

  openDropdown: string | null = null;

  @HostListener('document:click')
  closeDropdowns() {
    this.dropdownOpen = false;
    this.openDropdown = null;
  }

  toggleCustomDropdown(dropdown: string, event: Event) {
    event.stopPropagation();
    this.openDropdown = this.openDropdown === dropdown ? null : dropdown;
  }

  selectProduct(p: string, event: Event) {
    event.stopPropagation();
    this.productId = p;
    // If Product changes, reset Asset if it does not belong to the new Product.
    if (this.assetId) {
      const asset = this.pmService.assets().find(a => a.id === this.assetId);
      if (asset && asset.location.toLowerCase() !== p.toLowerCase()) {
        this.assetId = '';
      }
    }
    this.openDropdown = null;
  }

  selectDept(d: string, event: Event) {
    event.stopPropagation();
    this.department = d;
    if (this.assetId) {
      const asset = this.pmService.assets().find(a => a.id === this.assetId);
      if (asset && asset.department.toLowerCase() !== d.toLowerCase()) {
        this.assetId = '';
      }
    }
    this.openDropdown = null;
  }

  selectAsset(a: string, event: Event) {
    event.stopPropagation();
    this.assetId = a;
    if (a) {
      const asset = this.pmService.assets().find(x => x.id === a);
      if (asset) {
        this.productId = asset.location;
        this.department = asset.department;
      }
    }
    this.openDropdown = null;
  }
  selectType(t: string, event: Event) {
    event.stopPropagation();
    this.pmType = t as PMTaskFrequency; 
    this.openDropdown = null;
  }

  togglePart(part: string, event: Event) {
    event.stopPropagation();
    const current = this.parts();
    if (current.includes(part)) {
      this.parts.update(p => p.filter(x => x !== part));
    } else {
      this.parts.update(p => [...p, part]);
    }
  }

  toggleAllParts(event: Event) {
    event.stopPropagation();
    if (this.parts().length === this.availableParts.length) {
      this.parts.set([]);
    } else {
      this.parts.set([...this.availableParts]);
    }
  }

  // Options
  products = computed(() => this.authService.getAccessibleProducts('pm.create.submit'));
  departments = ['Facility', 'Mechanic', 'Manufacturing', 'Maintenance', 'Test'];
  availableParts = ['Bearing Assembly 6205', 'Filter Element HF-04', 'Seal Kit SK-22', 'Lubricant SAE-30 (1L)', 'Drive Belt B-440', 'O-Ring Set OR-12'];

  availableAssets() {
    const accessibleProducts = this.products().map(p => p.toLowerCase());
    const filterProd = this.productId?.toLowerCase() || '';
    const filterDept = this.department?.toLowerCase() || '';

    return this.pmService.assets().filter(a => {
      const aLoc = a.location?.toLowerCase() || '';
      const aDept = a.department?.toLowerCase() || '';

      if (!accessibleProducts.includes(aLoc)) return false;
      if (filterProd && aLoc !== filterProd) return false;
      if (filterDept && aDept !== filterDept) return false;
      return true;
    });
  }

  getFilteredProducts() {
    const val = (this.productId || '').toLowerCase();
    return this.products().filter(p => p.toLowerCase().includes(val));
  }

  getFilteredAssets() {
    const val = (this.assetId || '').toLowerCase();
    return this.availableAssets().filter(a => {
      const idMatch = a.id ? a.id.toLowerCase().includes(val) : false;
      const nameMatch = a.name ? a.name.toLowerCase().includes(val) : false;
      return idMatch || nameMatch;
    });
  }

  getFilteredParts() {
    const val = (this.selectedPart || '').toLowerCase();
    return this.availableParts.filter(p => p.toLowerCase().includes(val));
  }

  // Checklist Methods
  addChecklistItem() {
    if (this.newChecklistItem.trim()) {
      this.checklist.update(list => [...list, { text: this.newChecklistItem.trim(), requiresPhoto: false }]);
      this.newChecklistItem = '';
    }
  }

  removeChecklistItem(index: number) {
    this.checklist.update(list => list.filter((_, i) => i !== index));
  }

  updateChecklistItem(index: number, val: string) {
    this.checklist.update(list => {
      const newList = [...list];
      newList[index] = { ...newList[index], text: val };
      return newList;
    });
  }

  togglePhotoRequirement(index: number) {
    this.checklist.update(list => {
      const newList = [...list];
      newList[index] = { ...newList[index], requiresPhoto: !newList[index].requiresPhoto };
      return newList;
    });
  }

  // Parts Methods
  addPart() {
    if (this.selectedPart && !this.parts().includes(this.selectedPart)) {
      this.parts.update(p => [...p, this.selectedPart]);
      this.selectedPart = '';
    }
  }

  removePart(index: number) {
    this.parts.update(p => p.filter((_, i) => i !== index));
  }

  // Template Methods
  toggleDropdown(event: Event) {
    event.stopPropagation();
    this.dropdownOpen = !this.dropdownOpen;
  }

  loadedTemplateId: string | null = null;
  loadedTemplateName: string | null = null;

  loadTemplate(tpl: Template) {
    this.loadedTemplateId = tpl.id || null;
    this.loadedTemplateName = tpl.name;
    // Make sure we have proper boolean for requiresPhoto when loading
    const mapped = tpl.checklist.map(item => ({ text: item.text, requiresPhoto: !!item.requiresPhoto }));
    this.checklist.set([...mapped]);
    this.dropdownOpen = false;
  }

  clearTemplate() {
    this.loadedTemplateId = null;
    this.loadedTemplateName = null;
    this.checklist.set([]);
    this.dropdownOpen = false;
  }

  async updateTemplate() {
    if (!this.loadedTemplateId) return;
    const tpl = this.templates().find(t => t.id === this.loadedTemplateId);
    if (!tpl) return;
    
    try {
      await this.pmService.updateTemplate({
        ...tpl,
        checklist: [...this.checklist()]
      });
      this.toast.success('Template updated successfully!');
    } catch (err) {
      console.error(err);
      this.toast.error('Failed to update template. Backend might not be ready yet.');
    }
  }

  saveTemplate() {
    if (!this.newTemplateName.trim()) return;
    this.pmService.saveTemplate({
      name: this.newTemplateName,
      department: this.department || 'All',
      checklist: [...this.checklist()]
    });
    this.showSaveTemplateModal = false;
    this.showManageTemplateModal = false;
    this.newTemplateName = '';
    // Clear loaded template state so user doesn't accidentally overwrite the new template
    this.loadedTemplateId = null;
    this.loadedTemplateName = null;
  }

  deleteTemplate(tpl: Template) {
    if (this.loadedTemplateId === tpl.id) {
      this.loadedTemplateId = null;
      this.loadedTemplateName = null;
    }
    this.pmService.deleteTemplate(tpl);
  }

  // Submit
  async submitForm() {
    if (!this.productId || !this.department || !this.assetId || !this.pmType) {
      this.toast.error('Please fill out all required fields (Product, Dept, Asset, Type).');
      return;
    }

    // Validate custom duration
    if (this.pmType === 'Custom' && (this.customDurationValue <= 0 || !Number.isFinite(this.customDurationValue))) {
      this.toast.error('Custom duration must be a positive number.');
      return;
    }

    // Warn but don't block if checklist is empty
    if (this.checklist().length === 0) {
      this.toast.warning('No checklist items added — technician will have no steps to follow.');
    }

    const isNewProduct = !this.products().includes(this.productId);
    const selectedAsset = this.pmService.assets().find(a => a.id === this.assetId);
    const isNewAsset = !selectedAsset;

    if (selectedAsset) {
      if (selectedAsset.location !== this.productId || selectedAsset.department !== this.department) {
        this.toast.error('The selected asset does not match the chosen product or department. Action blocked.');
        return;
      }
    }

    // Create product first if new, then asset
    if (isNewProduct) {
      try {
        await this.pmService.createProduct({ id: this.productId, name: this.productId });
      } catch (e) {
        this.toast.error('Failed to create new product. Please try again.');
        return;
      }
    }
    if (isNewAsset) {
      try {
        await this.pmService.createAsset({
          id: this.assetId,
          name: this.assetId,
          location: this.productId,
          department: this.department
        });
      } catch (e) {
        this.toast.error('Failed to create new asset. Please try again.');
        return;
      }
    }

    const nextDueDate = new Date();
    let finalFrequency = this.pmType;

    switch (this.pmType) {
      case 'Daily': nextDueDate.setDate(nextDueDate.getDate() + 1); break;
      case 'Weekly': nextDueDate.setDate(nextDueDate.getDate() + 7); break;
      case 'Monthly': nextDueDate.setDate(nextDueDate.getDate() + 30); break;
      case 'Quarterly': nextDueDate.setDate(nextDueDate.getDate() + 90); break;
      case 'Yearly': nextDueDate.setDate(nextDueDate.getDate() + 365); break;
      case 'Custom': {
        finalFrequency = `${this.customDurationValue} ${this.customDurationUnit}`;
        const val = this.customDurationValue;
        switch (this.customDurationUnit) {
          case 'hour(s)': nextDueDate.setHours(nextDueDate.getHours() + val); break;
          case 'day(s)': nextDueDate.setDate(nextDueDate.getDate() + val); break;
          case 'month(s)': nextDueDate.setMonth(nextDueDate.getMonth() + val); break;
          case 'Year(s)': nextDueDate.setFullYear(nextDueDate.getFullYear() + val); break;
        }
        break;
      }
    }

    this.isGenerating.set(true);

    try {
      if (this.isRecurring) {
        await this.pmService.addPmSchedule({
          id: '', // Will be ignored by shim
          title: selectedAsset?.name || this.assetId,
          description: this.description,
          frequency: finalFrequency,
          assetId: this.assetId,
          productId: this.productId,
          department: this.department,
          estimatedHours: this.estimatedHours,
          checklist: this.checklist().map(item => ({ text: item.text, requiresPhoto: item.requiresPhoto })),
          partsRequired: [...this.parts()],
          assignedTo: undefined,
          createdBy: this.authService.currentUser()?.employeeId
        });
      } else {
        try {
          await this.pmService.addPmTask({
            productId: this.productId,
            department: this.department,
            assetId: this.assetId,
            title: selectedAsset?.name || this.assetId,
            description: this.description,
            frequency: finalFrequency,
            nextDueDate: nextDueDate,
            estimatedHours: this.estimatedHours,
            status: 'Pending' as PMTaskStatus,
            createdBy: this.authService.currentUser()?.employeeId,
            checklist: this.checklist().map(item => ({ text: item.text, done: false, requiresPhoto: item.requiresPhoto })),
            partsRequired: [...this.parts()]
          });
        } catch (inner) {
          this.isGenerating.set(false);
          this.toast.error('Failed to create PM task. Check your access and try again.');
          return;
        }
      }
      // Only navigate on actual success
      this.router.navigate(['/pm-assign']);
    } catch (e) {
      this.toast.error('Failed to generate PM schedule. Please try again.');
    } finally {
      this.isGenerating.set(false);
    }
  }
}


