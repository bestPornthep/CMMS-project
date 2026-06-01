import { Component, computed, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PmService } from '../../core/services/pm.service';
import { PMTask, PMTaskFrequency, PMTaskStatus } from '../../core/models/pm.model';

interface Template {
  name: string;
  department: string;
  checklist: string[];
}

@Component({
  selector: 'app-pm-create',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pm-create.component.html',
  styleUrl: './pm-create.component.scss'
})
export class PmCreateComponent {
  private pmService = inject(PmService);
  private router = inject(Router);

  // Form Model
  pmType: PMTaskFrequency = 'Monthly';
  productId: string = '';
  department: string = '';
  assetId: string = '';
  dueDate: string = '';
  estimatedHours: number = 2.5;
  description: string = '';

  // Dynamic Lists
  checklist = signal<string[]>(['Inspect bearing assembly', 'Check lubrication levels', 'Test pressure relief valve']);
  newChecklistItem = '';
  
  parts = signal<string[]>([]);
  selectedPart = '';

  // Modals
  showSaveTemplateModal = false;
  showManageTemplateModal = false;
  newTemplateName = '';
  templates = signal<Template[]>([]);
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

  selectProduct(p: string) { this.productId = p; }
  selectDept(d: string) { this.department = d; }
  selectAsset(a: string) { this.assetId = a; }
  selectType(t: string) { this.pmType = t as PMTaskFrequency; }
  selectPart(p: string) { this.selectedPart = p; }

  // Options
  products = ['CUST-001', 'CUST-002', 'CUST-003', 'CUST-004', 'CUST-005', 'CUST-006'];
  departments = ['Facility', 'Mechanic', 'Manufacturing', 'Maintenance', 'Test'];
  availableParts = ['Bearing Assembly 6205', 'Filter Element HF-04', 'Seal Kit SK-22', 'Lubricant SAE-30 (1L)', 'Drive Belt B-440', 'O-Ring Set OR-12'];
  
  // Computed Assets based on selection
  availableAssets = computed(() => {
    // In real app, filter by product/dept. Mocking here for simplicity
    return this.pmService.assets();
  });

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
  toggleDropdown() {
    this.dropdownOpen = !this.dropdownOpen;
  }

  loadTemplate(tpl: Template) {
    this.checklist.set([...tpl.checklist]);
    this.dropdownOpen = false;
  }

  saveTemplate() {
    if (!this.newTemplateName.trim()) return;
    this.templates.update(t => [...t, {
      name: this.newTemplateName,
      department: this.department || 'All',
      checklist: [...this.checklist()]
    }]);
    this.showSaveTemplateModal = false;
    this.showManageTemplateModal = false;
    this.newTemplateName = '';
  }

  deleteTemplate(index: number) {
    this.templates.update(t => t.filter((_, i) => i !== index));
  }

  // Submit
  submitForm() {
    if (!this.productId || !this.department || !this.assetId || !this.pmType) {
      alert("Please fill out all required fields (Product, Dept, Asset, Type).");
      return;
    }

    const selectedAsset = this.pmService.assets().find(a => a.id === this.assetId);
    
    this.pmService.addPmTask({
      productId: this.productId,
      department: this.department,
      assetId: this.assetId,
      title: selectedAsset?.name || 'New Asset PM',
      description: this.description,
      frequency: this.pmType,
      nextDueDate: this.dueDate ? new Date(this.dueDate) : new Date(),
      estimatedHours: this.estimatedHours,
      status: 'Pending' as PMTaskStatus,
      createdBy: 'CURRENT-USER',
      checklist: this.checklist().map(text => ({ text, done: false }))
    });

    this.router.navigate(['/pm-assign']);
  }
}

