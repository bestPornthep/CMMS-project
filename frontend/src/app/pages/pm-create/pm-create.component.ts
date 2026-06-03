import { Component, computed, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';
import { PMTask, PMTaskFrequency, PMTaskStatus, Template } from '../../core/models/pm.model';

@Component({
  selector: 'app-pm-create',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pm-create.component.html',
  styleUrl: './pm-create.component.scss'
})
export class PmCreateComponent {
  private pmService = inject(PmService);
  private authService = inject(AuthService);
  private router = inject(Router);

  // Form Model
  pmType: PMTaskFrequency = 'Monthly';
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
  checklist = signal<string[]>(['Inspect bearing assembly', 'Check lubrication levels', 'Test pressure relief valve']);
  newChecklistItem = '';
  
  parts = signal<string[]>([]);
  selectedPart = '';

  // Modals
  showSaveTemplateModal = false;
  showManageTemplateModal = false;
  newTemplateName = '';
  templates = computed(() => {
    const all = this.pmService.templates();
    if (this.canChangeDept) return all;
    return all.filter(t => t.department === 'All' || t.department === this.currentUser?.department);
  });
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

  selectProduct(p: string) { 
    this.productId = p; 
    // If Product changes, reset Asset if it does not belong to the new Product.
    if (this.assetId) {
      const asset = this.pmService.assets().find(a => a.id === this.assetId);
      if (asset && asset.location !== p) {
        this.assetId = '';
      }
    }
  }

  selectDept(d: string) { 
    this.department = d; 
    if (this.assetId) {
      const asset = this.pmService.assets().find(a => a.id === this.assetId);
      if (asset && asset.type !== d) {
        this.assetId = '';
      }
    }
  }

  selectAsset(a: string) { 
    this.assetId = a; 
    if (a) {
      const asset = this.pmService.assets().find(x => x.id === a);
      if (asset) {
        // Enforce the asset's location and type
        this.productId = asset.location;
        this.department = asset.type;
      }
    }
  }
  selectType(t: string) { this.pmType = t as PMTaskFrequency; }
  
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
  
  // Computed Assets based on selection
  availableAssets() {
    const accessibleProducts = this.products();
    return this.pmService.assets().filter(a => {
      // Must be in user's scope
      if (!accessibleProducts.includes(a.location)) return false;
      // If a specific product is selected, must match it
      if (this.productId && a.location !== this.productId) return false;
      // If a department is selected, must match it
      if (this.department && a.type !== this.department) return false;
      return true;
    });
  }

  // Checklist Methods
  addChecklistItem() {
    if (this.newChecklistItem.trim()) {
      this.checklist.update(list => [...list, this.newChecklistItem.trim()]);
      this.newChecklistItem = '';
    }
  }

  removeChecklistItem(index: number) {
    this.checklist.update(list => list.filter((_, i) => i !== index));
  }

  updateChecklistItem(index: number, val: string) {
    this.checklist.update(list => {
      const newList = [...list];
      newList[index] = val;
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

  loadTemplate(tpl: Template) {
    this.checklist.set([...tpl.checklist]);
    this.dropdownOpen = false;
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
  }

  deleteTemplate(tpl: Template) {
    this.pmService.deleteTemplate(tpl);
  }

  // Submit
  submitForm() {
    if (!this.productId || !this.department || !this.assetId || !this.pmType) {
      alert("Please fill out all required fields (Product, Dept, Asset, Type).");
      return;
    }

    const selectedAsset = this.pmService.assets().find(a => a.id === this.assetId);
    if (!selectedAsset) {
      alert("Invalid asset selected.");
      return;
    }
    
    if (selectedAsset.location !== this.productId || selectedAsset.type !== this.department) {
      alert("The selected asset does not match the chosen product or department. Action blocked.");
      return;
    }
    
    const nextDueDate = new Date();
    switch(this.pmType) {
      case 'Daily': nextDueDate.setDate(nextDueDate.getDate() + 1); break;
      case 'Weekly': nextDueDate.setDate(nextDueDate.getDate() + 7); break;
      case 'Monthly': nextDueDate.setDate(nextDueDate.getDate() + 30); break;
      case 'Quarterly': nextDueDate.setDate(nextDueDate.getDate() + 90); break;
      case 'Yearly': nextDueDate.setDate(nextDueDate.getDate() + 365); break;
    }

    this.pmService.addPmTask({
      productId: this.productId,
      department: this.department,
      assetId: this.assetId,
      title: selectedAsset?.name || 'New Asset PM',
      description: this.description,
      frequency: this.pmType,
      nextDueDate: nextDueDate,
      estimatedHours: this.estimatedHours,
      status: 'Pending' as PMTaskStatus,
      createdBy: this.authService.currentUser()?.employeeId,
      checklist: this.checklist().map(text => ({ text, done: false })),
      partsRequired: [...this.parts()]
    });

    this.router.navigate(['/pm-assign']);
  }
}

