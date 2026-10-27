import { Component, computed, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PmService } from '../../core/services/pm.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { NewPmTypeDetail, PMTaskFrequency, Template } from '../../core/models/pm.model';
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
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  // Form Model
  pmType: PMTaskFrequency = 'Monthly';
  customDurationValue: number = 1;
  customDurationUnit: string = 'Month(s)';

  // ISO yyyy-MM-dd, local-date (not UTC) so it matches the user's actual "today"
  // regardless of timezone offset — bound directly to the native date input.
  startDate: string = this.toIsoDate(new Date());
  readonly minStartDate = this.startDate;

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

    // A link such as /pm-create?machine=CNC-014 (used by the machine detail window) preselects that machine.
    const machineId = this.route.snapshot.queryParamMap.get('machine');
    if (machineId) this.preselectMachine(machineId);
  }

  // Fills customer, department and machine from a link. An unknown, inactive or inaccessible machine is
  // ignored with a message and the form stays as it was: a link must never pick a machine the picker would not offer.
  private preselectMachine(id: string) {
    const machine = this.pmService.assets().find(a => a.id === id);
    if (!machine) {
      this.toast.error('Machine not found.');
      return;
    }
    const customerOk = this.products().some(p => p.toLowerCase() === (machine.location || '').toLowerCase());
    const departmentOk = this.canChangeDept || (machine.department || '').toLowerCase() === (this.currentUser?.department || '').toLowerCase();
    if (!customerOk || !departmentOk) {
      this.toast.error('You cannot create PM types for this machine.');
      return;
    }
    if (machine.isActive === false) {
      this.toast.error('Reactivate this machine before adding PM types.');
      return;
    }
    this.productId = machine.location;
    this.department = machine.department;
    this.assetId = machine.id;
  }

  private toIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Dynamic Lists
  checklist = signal<{ text: string, requiresPhoto: boolean, requiresValue: boolean }[]>([
    { text: 'Inspect bearing assembly', requiresPhoto: false, requiresValue: false },
    { text: 'Check lubrication levels', requiresPhoto: false, requiresValue: false },
    { text: 'Test pressure relief valve', requiresPhoto: false, requiresValue: false }
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

  private getEffectiveFrequency(): PMTaskFrequency {
    return this.pmType === 'Custom' ? `${this.customDurationValue} ${this.customDurationUnit}` : this.pmType;
  }

  // Hard block: an asset may only ever have one PM of a given frequency, regardless of status.
  // Drafts and preview tasks count too.
  isDuplicatePm(): boolean {
    if (!this.assetId || !this.pmType) return false;
    return this.pmService.hasPmType(this.assetId, this.getEffectiveFrequency());
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

    // Only active machines are offered here — deactivated machines must be reactivated
    // from the Machines page before a new PM can be created for them.
    return this.pmService.activeAssets().filter(a => {
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
      this.checklist.update(list => [...list, { text: this.newChecklistItem.trim(), requiresPhoto: false, requiresValue: false }]);
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

  toggleValueRequirement(index: number) {
    this.checklist.update(list => {
      const newList = [...list];
      newList[index] = { ...newList[index], requiresValue: !newList[index].requiresValue };
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
    // Make sure we have proper boolean for requiresPhoto/requiresValue when loading
    const mapped = tpl.checklist.map(item => ({ text: item.text, requiresPhoto: !!item.requiresPhoto, requiresValue: !!item.requiresValue }));
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

    // Hard block: one PM per asset+frequency, ever — regardless of status.
    if (this.isDuplicatePm()) {
      const freq = this.getEffectiveFrequency();
      this.toast.error(`This asset already has a ${freq} PM. You cannot create another PM of the same type for this asset.`);
      return;
    }

    if (this.pmService.findPendingPmAdd(this.assetId, this.getEffectiveFrequency())) {
      this.toast.error(`A ${this.getEffectiveFrequency()} PM for this asset is already waiting for approval.`);
      return;
    }

    // Validate custom duration
    if (this.pmType === 'Custom' && (this.customDurationValue <= 0 || !Number.isFinite(this.customDurationValue))) {
      this.toast.error('Custom duration must be a positive number.');
      return;
    }

    // Start date must be today or later — no backdating
    if (!this.startDate || this.startDate < this.minStartDate) {
      this.toast.error('Start date cannot be in the past.');
      return;
    }

    // Warn but don't block if checklist is empty
    if (this.checklist().length === 0) {
      this.toast.warning('No checklist items added — technician will have no steps to follow.');
    }

    const isNewProduct = !this.products().includes(this.productId);
    const selectedAsset = this.pmService.assets().find(a => a.id === this.assetId);
    const isNewAsset = !selectedAsset;

    // Machines are now created via the dedicated "Machines" page, not auto-created here.
    if (isNewProduct || isNewAsset) {
      this.toast.error('Unknown Product or Asset. Add the machine on the Machines page first, then create its PM here.');
      return;
    }

    if (selectedAsset.location !== this.productId || selectedAsset.department !== this.department) {
      this.toast.error('The selected asset does not match the chosen product or department. Action blocked.');
      return;
    }

    // Lock the button before any async work so a rapid double-click can't
    // slip a second submission past the duplicate check above.
    this.isGenerating.set(true);

    // First occurrence is due exactly on the chosen start date — no interval
    // offset applied to it. Later occurrences (recurring only) are computed
    // by the backend as startDate + N×frequency.
    const nextDueDate = new Date(this.startDate);
    const finalFrequency = this.getEffectiveFrequency();

    try {
      const detail: NewPmTypeDetail = {
        title: selectedAsset.name || this.assetId,
        description: this.description,
        estimatedHours: this.estimatedHours,
        partsRequired: [...this.parts()],
        checklist: this.checklist().map(item => ({ text: item.text, requiresPhoto: item.requiresPhoto, requiresValue: item.requiresValue })),
        startDate: nextDueDate,
        isRecurring: this.isRecurring
      };

      // A machine that is not in the Master Plan keeps its PM types as drafts: no approval, no tasks.
      if (!this.pmService.isInMasterPlan(this.assetId)) {
        this.pmService.addDraftPmType(this.assetId, finalFrequency, detail);
        this.toast.success('PM type saved as a draft. Send the machine to the Master Plan when it is ready.');
        this.router.navigate(['/pm-machines'], { queryParams: { machine: this.assetId } });
        return;
      }

      this.pmService.submitMasterPlanChange({
        assetId: this.assetId,
        assetName: selectedAsset.name,
        department: this.department,
        changes: {
          addPmTypes: [finalFrequency],
          newPmTypeDetails: { [finalFrequency]: detail }
        },
        note: this.description.trim() || `New ${finalFrequency} PM via Create PM`
      });
      this.toast.success(`${finalFrequency} PM for "${selectedAsset.name}" submitted for approval.`);
      this.router.navigate([this.pmService.canApproveMasterPlanChange() ? '/pm-approvals' : '/dashboard']);
    } catch (e: any) {
      this.toast.error(e?.message || 'Failed to save the PM. Please try again.');
    } finally {
      this.isGenerating.set(false);
    }
  }
}


