import { Injectable, computed, inject, signal } from '@angular/core';
import { Template } from '../models/pm.model';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class TemplateService {
  private api = inject(ApiService);
  private authService = inject(AuthService);

  private templatesSignal = signal<Template[]>([]);

  readonly templates = computed(() => this.templatesSignal());

  // Called by PmStore.loadData with the templates the backend returned; the built-in defaults are added here.
  setLoadedTemplates(templates: Template[]): void {
    const mockDefaultTemplates: Template[] = [
      { id: 'def-fac-1', name: 'Standard HVAC Inspection', department: 'Facility', isDefault: true, checklist: [{text: 'Check filters', requiresPhoto: true}, {text: 'Measure airflow', requiresPhoto: false}] },
      { id: 'def-fac-2', name: 'Monthly Boiler PM', department: 'Facility', isDefault: true, checklist: [{text: 'Check pressure valve', requiresPhoto: true}, {text: 'Inspect burner', requiresPhoto: false}] },
      { id: 'def-mech-1', name: 'CNC Daily Calibration', department: 'Mechanic', isDefault: true, checklist: [{text: 'Check spindle alignment', requiresPhoto: true}, {text: 'Lubricate guideways', requiresPhoto: false}] },
      { id: 'def-mech-2', name: 'Conveyor Belt Tension', department: 'Mechanic', isDefault: true, checklist: [{text: 'Check belt tension', requiresPhoto: true}, {text: 'Inspect rollers', requiresPhoto: false}] },
      { id: 'def-manu-1', name: 'Assembly Line Start-up', department: 'Manufacturing', isDefault: true, checklist: [{text: 'Test emergency stops', requiresPhoto: true}, {text: 'Verify sensor alignment', requiresPhoto: false}] },
      { id: 'def-manu-2', name: 'Weekly SMT Maintenance', department: 'Manufacturing', isDefault: true, checklist: [{text: 'Clean nozzles', requiresPhoto: true}, {text: 'Check feeder tension', requiresPhoto: false}] },
      { id: 'def-main-1', name: 'General Motor Lubrication', department: 'Maintenance', isDefault: true, checklist: [{text: 'Apply grease to bearings', requiresPhoto: true}, {text: 'Check for abnormal noise', requiresPhoto: false}] },
      { id: 'def-main-2', name: 'Hydraulic System Check', department: 'Maintenance', isDefault: true, checklist: [{text: 'Check fluid levels', requiresPhoto: true}, {text: 'Inspect hoses for leaks', requiresPhoto: false}] },
      { id: 'def-test-1', name: 'Tester Calibration Matrix', department: 'Test', isDefault: true, checklist: [{text: 'Run self-test diagnostic', requiresPhoto: true}, {text: 'Verify calibration certs', requiresPhoto: false}] },
      { id: 'def-test-2', name: 'Probe Pin Inspection', department: 'Test', isDefault: true, checklist: [{text: 'Check for bent pins', requiresPhoto: true}, {text: 'Clean fixture surface', requiresPhoto: false}] },
    ];

    // Deduplicate: if backend returns a template with same id as a default, API wins
    const apiIds = new Set(templates.map(t => t.id));
    const dedupedDefaults = mockDefaultTemplates.filter(t => !apiIds.has(t.id));
    this.templatesSignal.set([...dedupedDefaults, ...templates]);
  }

  saveTemplate(tpl: Template): Promise<Template> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Unauthorized.');
    if ((user.baseRole === 'engineer' || user.baseRole === 'technician') && tpl.department !== user.department) {
      throw new Error('Can only save templates for your own department.');
    }

    tpl.isDefault = false;
    tpl.createdBy = user.employeeId;

    return this.api.createTemplate(tpl).then(saved => {
      this.templatesSignal.update(t => [...t, saved]);
      return saved;
    });
  }

  updateTemplate(tpl: Template): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Unauthorized.');
    if (!tpl.id) throw new Error('Cannot update template without an id.');
    if (tpl.isDefault) throw new Error('Cannot modify default templates.');
    if ((user.baseRole === 'engineer' || user.baseRole === 'technician') && tpl.department !== user.department) {
      throw new Error('Can only update templates for your own department.');
    }

    return this.api.updateTemplate(tpl.id, tpl).then(updated => {
      this.templatesSignal.update(t => t.map(x => x.id === updated.id ? updated : x));
    });
  }

  deleteTemplate(tpl: Template): Promise<void> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Unauthorized.');
    if (tpl.isDefault) throw new Error('Cannot delete default templates.');
    if ((user.baseRole === 'engineer' || user.baseRole === 'technician') && tpl.department !== user.department) {
      throw new Error('Can only delete templates for your own department.');
    }

    if (!tpl.id) throw new Error('Cannot delete template without an id.');

    return this.api.deleteTemplate(tpl.id).then(() => {
      this.templatesSignal.update(t => t.filter(x => x.id !== tpl.id));
    });
  }
}
