import { Injectable, signal, computed, inject } from '@angular/core';
import { Asset, PMTask, PMTaskFrequency, PMTaskStatus, Template } from '../models/pm.model';
import { AuthService } from './auth.service';

const DB_KEY = 'assetintel_pm_db_v_ng';
const SEED_FLAG = 'assetintel_pm_seeded_v_ng_run_num_abbrev';
const TEMPLATE_DB_KEY = 'assetintel_pm_templates_v_ng';

@Injectable({
  providedIn: 'root'
})
export class PmService {
  private authService = inject(AuthService);
  private assetsSignal = signal<Asset[]>(this.initializeAssets());
  private pmTasksSignal = signal<PMTask[]>([]);
  private templatesSignal = signal<Template[]>([]);

  readonly assets = computed(() => this.assetsSignal());
  readonly pmTasks = computed(() => this.pmTasksSignal());
  readonly templates = computed(() => this.templatesSignal());
  
  viewedTaskGlobal = signal<PMTask | null>(null);

  constructor() {
    this.seedIfNeeded();
    this.loadFromStorage();
  }

  private initializeAssets(): Asset[] {
    const rawCatalog: Record<string, Record<string, { name: string, code: string }[]>> = {
      'CUST-001': { // Precision Tech Co
        'Facility':      [{ name: 'Chiller Unit #1',      code: 'CH-P1-01'  }, { name: 'AHU System #1',       code: 'AHU-P1-01' }],
        'Mechanic':      [{ name: 'Conveyor Motor A',     code: 'CM-P1-01'  }, { name: 'Hydraulic Press #1',   code: 'HYP-P1-01' }],
        'Manufacturing': [{ name: 'CNC Lathe L-100',      code: 'CNC-P1-01' }, { name: 'Packaging Line #1',   code: 'PKG-P1-01' }],
        'Maintenance':   [{ name: 'Emergency Gen Set A',  code: 'GEN-P1-01' }, { name: 'Fire Pump #1',        code: 'FP-P1-01'  }],
        'Test':          [{ name: 'Thermal Chamber TC-1',  code: 'THC-P1-01' }, { name: 'Calibration Bench #1',code: 'CAL-P1-01' }],
      },
      'CUST-002': { // Global Manufacturing Ltd
        'Facility':      [{ name: 'Cooling Tower CT-2',   code: 'CT-P2-01'  }, { name: 'Main Power Panel B',  code: 'MPP-P2-01' }],
        'Mechanic':      [{ name: 'Air Compressor AC-2',  code: 'AC-P2-01'  }, { name: 'Exhaust Fan EF-2',    code: 'EXF-P2-01' }],
        'Manufacturing': [{ name: 'Injection Molder IM-2',code: 'INJ-P2-01' }, { name: 'Stamping Press SP-2', code: 'STP-P2-01' }],
        'Maintenance':   [{ name: 'Overhead Crane OC-2',  code: 'CRN-P2-01' }, { name: 'Boiler Unit BU-2',   code: 'BLR-P2-01' }],
        'Test':          [{ name: 'Server Rack SR-2',     code: 'SRV-P2-01' }, { name: 'ATE Station #2',      code: 'ATE-P2-01' }],
      },
      'CUST-003': { // Apex Solutions
        'Facility':      [{ name: 'Chiller Unit #3',      code: 'CH-P3-01'  }, { name: 'AHU System #3',       code: 'AHU-P3-01' }],
        'Mechanic':      [{ name: 'Conveyor Motor C',     code: 'CM-P3-01'  }, { name: 'Hydraulic Press #3',   code: 'HYP-P3-01' }],
        'Manufacturing': [{ name: 'CNC Mill M-300',       code: 'CNC-P3-01' }, { name: 'Packaging Line #3',   code: 'PKG-P3-01' }],
        'Maintenance':   [{ name: 'Emergency Gen Set C',  code: 'GEN-P3-01' }, { name: 'Fire Pump #3',        code: 'FP-P3-01'  }],
        'Test':          [{ name: 'Thermal Chamber TC-3',  code: 'THC-P3-01' }, { name: 'Calibration Bench #3',code: 'CAL-P3-01' }],
      },
      'CUST-004': { // Starlight Electronics
        'Facility':      [{ name: 'Cooling Tower CT-4',   code: 'CT-P4-01'  }, { name: 'Main Power Panel D',  code: 'MPP-P4-01' }],
        'Mechanic':      [{ name: 'Air Compressor AC-4',  code: 'AC-P4-01'  }, { name: 'Exhaust Fan EF-4',    code: 'EXF-P4-01' }],
        'Manufacturing': [{ name: 'Injection Molder IM-4',code: 'INJ-P4-01' }, { name: 'Stamping Press SP-4', code: 'STP-P4-01' }],
        'Maintenance':   [{ name: 'Overhead Crane OC-4',  code: 'CRN-P4-01' }, { name: 'Boiler Unit BU-4',   code: 'BLR-P4-01' }],
        'Test':          [{ name: 'Server Rack SR-4',     code: 'SRV-P4-01' }, { name: 'ATE Station #4',      code: 'ATE-P4-01' }],
      },
      'CUST-005': { // Titan Heavy Machineries
        'Facility':      [{ name: 'Chiller Unit #5',      code: 'CH-P5-01'  }, { name: 'AHU System #5',       code: 'AHU-P5-01' }],
        'Mechanic':      [{ name: 'Conveyor Motor E',     code: 'CM-P5-01'  }, { name: 'Hydraulic Press #5',   code: 'HYP-P5-01' }],
        'Manufacturing': [{ name: 'CNC Router R-500',     code: 'CNC-P5-01' }, { name: 'Packaging Line #5',   code: 'PKG-P5-01' }],
        'Maintenance':   [{ name: 'Emergency Gen Set E',  code: 'GEN-P5-01' }, { name: 'Fire Pump #5',        code: 'FP-P5-01'  }],
        'Test':          [{ name: 'Thermal Chamber TC-5',  code: 'THC-P5-01' }, { name: 'Calibration Bench #5',code: 'CAL-P5-01' }],
      },
      'CUST-006': { // Quantum Networks
        'Facility':      [{ name: 'Cooling Tower CT-6',   code: 'CT-P6-01'  }, { name: 'Main Power Panel F',  code: 'MPP-P6-01' }],
        'Mechanic':      [{ name: 'Air Compressor AC-6',  code: 'AC-P6-01'  }, { name: 'Exhaust Fan EF-6',    code: 'EXF-P6-01' }],
        'Manufacturing': [{ name: 'Injection Molder IM-6',code: 'INJ-P6-01' }, { name: 'Stamping Press SP-6', code: 'STP-P6-01' }],
        'Maintenance':   [{ name: 'Overhead Crane OC-6',  code: 'CRN-P6-01' }, { name: 'Boiler Unit BU-6',   code: 'BLR-P6-01' }],
        'Test':          [{ name: 'Server Rack SR-6',     code: 'SRV-P6-01' }, { name: 'ATE Station #6',      code: 'ATE-P6-01' }],
      },
    };

    const parsedAssets: Asset[] = [];
    Object.keys(rawCatalog).forEach(location => {
      const depts = rawCatalog[location];
      Object.keys(depts).forEach(dept => {
        depts[dept].forEach(asset => {
          parsedAssets.push({
            id: asset.code,
            name: asset.name,
            type: dept, // Map department to type
            location: location
          });
        });
      });
    });

    return parsedAssets;
  }

  private seedIfNeeded() {
    if (localStorage.getItem(SEED_FLAG)) return;

    const today = new Date();
    const d = (offset: number) => {
      const dt = new Date(today);
      dt.setDate(dt.getDate() + offset);
      return dt.toISOString();
    };

    const seeds = [
      // Pending
      { p:'CUST-001', dept:'Facility',      a:'Chiller Unit #1',      c:'CH-P1-01',  type:'Monthly',    due: d(3),  by:'ENG-FAC-1', est: 2 },
      { p:'CUST-002', dept:'Mechanic',      a:'Air Compressor AC-2',  c:'AC-P2-01',  type:'Weekly',     due: d(5),  by:'ENG-MEC-1', est: 1.5 },
      { p:'CUST-003', dept:'Manufacturing', a:'CNC Mill M-300',       c:'CNC-P3-01', type:'Quarterly',  due: d(7),  by:'ENG-MFG-1', est: 4 },
      { p:'CUST-004', dept:'Test',          a:'Server Rack SR-4',     c:'SRV-P4-01', type:'Monthly',    due: d(2),  by:'ENG-TST-2', est: 2 },
      { p:'CUST-005', dept:'Maintenance',   a:'Emergency Gen Set E',  c:'GEN-P5-01', type:'Weekly',     due: d(4),  by:'ENG-MTN-1', est: 1 },
      { p:'CUST-006', dept:'Facility',      a:'Cooling Tower CT-6',   c:'CT-P6-01',  type:'Daily',      due: d(1),  by:'ENG-FAC-1', est: 0.5 },

      // Assigned (In Progress)
      { p:'CUST-001', dept:'Test',          a:'Thermal Chamber TC-1', c:'THC-P1-01', type:'Monthly',    due: d(2),  by:'ENG-TST-1', tech:'TECH-TST-1', est: 3 },
      { p:'CUST-002', dept:'Mechanic',      a:'Exhaust Fan EF-2',     c:'EXF-P2-01', type:'Weekly',     due: d(1),  by:'ENG-MEC-1', tech:'TECH-MEC-1', est: 1 },
      { p:'CUST-003', dept:'Manufacturing', a:'Packaging Line #3',    c:'PKG-P3-01', type:'Quarterly',  due: d(6),  by:'ENG-MFG-1', tech:'TECH-MFG-1', est: 5 },
      { p:'CUST-005', dept:'Maintenance',   a:'Fire Pump #5',         c:'FP-P5-01',  type:'Monthly',    due: d(3),  by:'ENG-MTN-1', tech:'TECH-MTN-1', est: 2 },

      // Overdue
      { p:'CUST-001', dept:'Mechanic',      a:'Conveyor Motor A',     c:'CM-P1-01',  type:'Weekly',     due: d(-3), by:'ENG-MEC-2', tech:'TECH-MEC-2', est: 1.5 },
      { p:'CUST-004', dept:'Facility',      a:'Cooling Tower CT-4',   c:'CT-P4-01',  type:'Monthly',    due: d(-5), by:'ENG-FAC-2', tech:'TECH-FAC-1', est: 2.5 },
      { p:'CUST-006', dept:'Test',          a:'ATE Station #6',       c:'ATE-P6-01', type:'Daily',      due: d(-1), by:'ENG-TST-3', tech:'TECH-TST-3', est: 0.5 },

      // Completed
      { p:'CUST-002', dept:'Facility',      a:'Main Power Panel B',   c:'MPP-P2-01', type:'Quarterly',  due: d(-7), by:'ENG-FAC-1', tech:'TECH-FAC-2', done: d(-6), est: 4 },
      { p:'CUST-003', dept:'Mechanic',      a:'Hydraulic Press #3',   c:'HYP-P3-01', type:'Monthly',    due: d(-4), by:'ENG-MEC-3', tech:'TECH-MEC-3', done: d(-3), est: 2.5 },
      { p:'CUST-005', dept:'Manufacturing', a:'CNC Router R-500',     c:'CNC-P5-01', type:'Weekly',     due: d(-2), by:'ENG-MFG-3', tech:'TECH-MFG-2', done: d(-1), est: 3 },
    ];

    const deptCounters: Record<string, number> = {};
    
    const pms = seeds.map((s, i) => {
      const deptName = (s.dept || 'General').substring(0, 3).toUpperCase();
      deptCounters[deptName] = (deptCounters[deptName] || 0) + 1;
      const runNum = deptCounters[deptName].toString().padStart(4, '0');

      // Parse dates, we must convert ISO strings to timestamp numbers for local storage to parse correctly or just strings.
      // But PMTask model expects Date objects at runtime. We will store ISO strings in LocalStorage.
      return {
        id: `PM-${deptName}-${runNum}`,
        productId: s.p,
        department: s.dept,
        assetId: s.c,
        title: s.a,
        description: `Perform ${s.type} maintenance.`,
        frequency: s.type as PMTaskFrequency,
        nextDueDate: s.due, // string representation for localStorage
        estimatedHours: s.est,
        status: (s.done ? 'Done' : (s.due < today.toISOString() && !s.done ? 'Overdue' : (s.tech ? 'In Progress' : 'Pending'))) as PMTaskStatus,
        assignedTo: s.tech || undefined,
        createdBy: s.by,
        createdAt: new Date(today.getTime() - (10 - i) * 86400000).toISOString(),
        completedAt: s.done ? s.done : undefined,
        completedBy: s.done ? s.tech : undefined,
        recordNotes: s.done ? 'Completed on schedule. All checks passed.' : undefined,
        partsUsed: [],
        checklist: [
          { text: 'Inspect exterior for damage', done: !!s.done },
          { text: 'Check fluid levels', done: !!s.done },
          { text: 'Perform functional test', done: !!s.done }
        ]
      };
    });

    localStorage.setItem(DB_KEY, JSON.stringify(pms));
    localStorage.setItem(SEED_FLAG, 'true');
  }

  private loadFromStorage() {
    try {
      const dataStr = localStorage.getItem(DB_KEY);
      if (dataStr) {
        const rawTasks = JSON.parse(dataStr);
        // Revive dates
        const parsedTasks = rawTasks.map((t: any) => ({
          ...t,
          nextDueDate: new Date(t.nextDueDate),
          createdAt: t.createdAt ? new Date(t.createdAt) : undefined,
          completedAt: t.completedAt ? new Date(t.completedAt) : undefined,
        })) as PMTask[];
        this.pmTasksSignal.set(parsedTasks);
      } else {
        this.pmTasksSignal.set([]);
      }
    } catch {
      this.pmTasksSignal.set([]);
    }

    try {
      const tplData = localStorage.getItem(TEMPLATE_DB_KEY);
      if (tplData) {
        let parsed = JSON.parse(tplData);
        parsed = parsed.map((t: any) => ({
          ...t,
          checklist: t.checklist.map((item: any) => typeof item === 'string' ? { text: item, requiresPhoto: false } : item)
        }));
        this.templatesSignal.set(parsed);
      }
    } catch {}
  }

  private saveToStorage() {
    // Convert dates back to strings implicitly by JSON.stringify
    localStorage.setItem(DB_KEY, JSON.stringify(this.pmTasksSignal()));
  }

  addPmTask(task: Partial<PMTask>) {
    const user = this.authService.currentUser();
    if (!user || !this.authService.hasPermission('pm.create.submit')) {
      alert("API ERROR: Unauthorized to create PM tasks.");
      throw new Error("Unauthorized to create PM tasks.");
    }
    const accessibleProducts = this.authService.getAccessibleProducts('pm.create.submit');
    if (!accessibleProducts.includes(task.productId || '')) {
      alert("API ERROR: Product access denied.");
      throw new Error("Product access denied.");
    }
    const asset = this.assets().find(a => a.id === task.assetId);
    if (!asset || asset.location !== task.productId || asset.type !== task.department) {
      alert("API ERROR: Invalid Product-Asset combination.");
      throw new Error("Invalid Product-Asset combination.");
    }

    const deptName = (task.department || 'General').substring(0, 3).toUpperCase();
    
    // Determine the next run number for the department
    const deptTasks = this.pmTasksSignal().filter(t => t.id.startsWith(`PM-${deptName}-`));
    let maxRun = 0;
    for (const t of deptTasks) {
      const parts = t.id.split('-');
      if (parts.length >= 3) {
        const num = parseInt(parts[2], 10);
        if (!isNaN(num) && num > maxRun) maxRun = num;
      }
    }
    const nextRun = (maxRun + 1).toString().padStart(4, '0');

    const newTask = {
      ...task,
      id: `PM-${deptName}-${nextRun}`,
      createdAt: new Date(),
    } as PMTask;
    
    this.pmTasksSignal.update(tasks => [newTask, ...tasks]);
    this.saveToStorage();
  }

  updateTask(updatedTask: PMTask) {
    const user = this.authService.currentUser();
    if (!user) throw new Error("Unauthorized.");

    if (user.baseRole === 'engineer' || user.baseRole === 'technician') {
      const allowedProducts = this.authService.getAccessibleProducts('pm.assign.submit');
      if (!allowedProducts.includes(updatedTask.productId || '') && updatedTask.assignedTo !== user.employeeId) {
         alert("API ERROR: Unauthorized to update this task.");
         throw new Error("Unauthorized to update this task.");
      }
    }

    this.pmTasksSignal.update(tasks => tasks.map(t => t.id === updatedTask.id ? updatedTask : t));
    this.saveToStorage();
  }

  deleteTask(id: string) {
    this.pmTasksSignal.update(tasks => tasks.filter(t => t.id !== id));
    this.saveToStorage();
  }

  saveTemplate(tpl: Template) {
    const user = this.authService.currentUser();
    if (!user) throw new Error("Unauthorized.");

    if (user.baseRole === 'engineer') {
      if (tpl.department !== user.department) {
        alert("API ERROR: Engineers can only save templates for their own department.");
        throw new Error("Scope error");
      }
    } else if (user.baseRole === 'technician') {
      if (tpl.department !== user.department) {
        alert("API ERROR: Tech can only save templates within their granted department scope.");
        throw new Error("Scope error");
      }
    }

    this.templatesSignal.update(t => [...t, tpl]);
    localStorage.setItem(TEMPLATE_DB_KEY, JSON.stringify(this.templatesSignal()));
  }

  deleteTemplate(tpl: Template) {
    const user = this.authService.currentUser();
    if (!user) throw new Error("Unauthorized.");

    if (user.baseRole === 'engineer') {
      if (tpl.department !== user.department) {
        alert("API ERROR: Engineers can only delete templates for their own department.");
        throw new Error("Scope error");
      }
    } else if (user.baseRole === 'technician') {
      if (tpl.department !== user.department) {
        alert("API ERROR: Tech can only delete templates within their granted department scope.");
        throw new Error("Scope error");
      }
    }

    this.templatesSignal.update(t => t.filter(x => !(x.name === tpl.name && x.department === tpl.department)));
    localStorage.setItem(TEMPLATE_DB_KEY, JSON.stringify(this.templatesSignal()));
  }
}