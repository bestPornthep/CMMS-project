import { Injectable } from '@angular/core';
import { Asset, AuditLog, PMTask, PMTaskFrequency, PMTaskStatus, Template, User } from '../models/pm.model';

// ── Seed Data ────────────────────────────────────────────────────────────────
// Replaces localStorage. When connecting a real backend, delete this block and
// implement each method body with: firstValueFrom(this.http.get<T>('/api/...'))

const SEED_ASSETS: Asset[] = (() => {
  const catalog: Record<string, Record<string, { name: string; code: string }[]>> = {
    'CUST-001': {
      Facility:      [{ name: 'Chiller Unit #1',      code: 'CH-P1-01'  }, { name: 'AHU System #1',        code: 'AHU-P1-01' }],
      Mechanic:      [{ name: 'Conveyor Motor A',     code: 'CM-P1-01'  }, { name: 'Hydraulic Press #1',   code: 'HYP-P1-01' }],
      Manufacturing: [{ name: 'CNC Lathe L-100',      code: 'CNC-P1-01' }, { name: 'Packaging Line #1',    code: 'PKG-P1-01' }],
      Maintenance:   [{ name: 'Emergency Gen Set A',  code: 'GEN-P1-01' }, { name: 'Fire Pump #1',         code: 'FP-P1-01'  }],
      Test:          [{ name: 'Thermal Chamber TC-1', code: 'THC-P1-01' }, { name: 'Calibration Bench #1', code: 'CAL-P1-01' }],
    },
    'CUST-002': {
      Facility:      [{ name: 'Cooling Tower CT-2',    code: 'CT-P2-01'  }, { name: 'Main Power Panel B',  code: 'MPP-P2-01' }],
      Mechanic:      [{ name: 'Air Compressor AC-2',   code: 'AC-P2-01'  }, { name: 'Exhaust Fan EF-2',    code: 'EXF-P2-01' }],
      Manufacturing: [{ name: 'Injection Molder IM-2', code: 'INJ-P2-01' }, { name: 'Stamping Press SP-2', code: 'STP-P2-01' }],
      Maintenance:   [{ name: 'Overhead Crane OC-2',   code: 'CRN-P2-01' }, { name: 'Boiler Unit BU-2',   code: 'BLR-P2-01' }],
      Test:          [{ name: 'Server Rack SR-2',      code: 'SRV-P2-01' }, { name: 'ATE Station #2',      code: 'ATE-P2-01' }],
    },
    'CUST-003': {
      Facility:      [{ name: 'Chiller Unit #3',      code: 'CH-P3-01'  }, { name: 'AHU System #3',        code: 'AHU-P3-01' }],
      Mechanic:      [{ name: 'Conveyor Motor C',     code: 'CM-P3-01'  }, { name: 'Hydraulic Press #3',   code: 'HYP-P3-01' }],
      Manufacturing: [{ name: 'CNC Mill M-300',       code: 'CNC-P3-01' }, { name: 'Packaging Line #3',    code: 'PKG-P3-01' }],
      Maintenance:   [{ name: 'Emergency Gen Set C',  code: 'GEN-P3-01' }, { name: 'Fire Pump #3',         code: 'FP-P3-01'  }],
      Test:          [{ name: 'Thermal Chamber TC-3', code: 'THC-P3-01' }, { name: 'Calibration Bench #3', code: 'CAL-P3-01' }],
    },
    'CUST-004': {
      Facility:      [{ name: 'Cooling Tower CT-4',    code: 'CT-P4-01'  }, { name: 'Main Power Panel D',  code: 'MPP-P4-01' }],
      Mechanic:      [{ name: 'Air Compressor AC-4',   code: 'AC-P4-01'  }, { name: 'Exhaust Fan EF-4',    code: 'EXF-P4-01' }],
      Manufacturing: [{ name: 'Injection Molder IM-4', code: 'INJ-P4-01' }, { name: 'Stamping Press SP-4', code: 'STP-P4-01' }],
      Maintenance:   [{ name: 'Overhead Crane OC-4',   code: 'CRN-P4-01' }, { name: 'Boiler Unit BU-4',   code: 'BLR-P4-01' }],
      Test:          [{ name: 'Server Rack SR-4',      code: 'SRV-P4-01' }, { name: 'ATE Station #4',      code: 'ATE-P4-01' }],
    },
    'CUST-005': {
      Facility:      [{ name: 'Chiller Unit #5',      code: 'CH-P5-01'  }, { name: 'AHU System #5',        code: 'AHU-P5-01' }],
      Mechanic:      [{ name: 'Conveyor Motor E',     code: 'CM-P5-01'  }, { name: 'Hydraulic Press #5',   code: 'HYP-P5-01' }],
      Manufacturing: [{ name: 'CNC Router R-500',     code: 'CNC-P5-01' }, { name: 'Packaging Line #5',    code: 'PKG-P5-01' }],
      Maintenance:   [{ name: 'Emergency Gen Set E',  code: 'GEN-P5-01' }, { name: 'Fire Pump #5',         code: 'FP-P5-01'  }],
      Test:          [{ name: 'Thermal Chamber TC-5', code: 'THC-P5-01' }, { name: 'Calibration Bench #5', code: 'CAL-P5-01' }],
    },
    'CUST-006': {
      Facility:      [{ name: 'Cooling Tower CT-6',    code: 'CT-P6-01'  }, { name: 'Main Power Panel F',  code: 'MPP-P6-01' }],
      Mechanic:      [{ name: 'Air Compressor AC-6',   code: 'AC-P6-01'  }, { name: 'Exhaust Fan EF-6',    code: 'EXF-P6-01' }],
      Manufacturing: [{ name: 'Injection Molder IM-6', code: 'INJ-P6-01' }, { name: 'Stamping Press SP-6', code: 'STP-P6-01' }],
      Maintenance:   [{ name: 'Overhead Crane OC-6',   code: 'CRN-P6-01' }, { name: 'Boiler Unit BU-6',   code: 'BLR-P6-01' }],
      Test:          [{ name: 'Server Rack SR-6',      code: 'SRV-P6-01' }, { name: 'ATE Station #6',      code: 'ATE-P6-01' }],
    },
  };

  const assets: Asset[] = [];
  for (const location of Object.keys(catalog)) {
    for (const department of Object.keys(catalog[location])) {
      for (const a of catalog[location][department]) {
        assets.push({ id: a.code, name: a.name, department, location });
      }
    }
  }
  return assets;
})();

const SEED_USERS: Record<string, User & { password?: string }> = {
  'MGR001': { employeeId: 'MGR001', name: 'Manager Somporn',    initials: 'MS', baseRole: 'manager',    roleLabel: 'Manager',    department: 'All', ownedProducts: ['*'], delegatedProducts: [], permissions: [], password: 'mgr123' },
  'MGR002': { employeeId: 'MGR002', name: 'Senior Eng Nattapol', initials: 'SN', baseRole: 'manager',   roleLabel: 'Manager',    department: 'All', ownedProducts: ['*'], delegatedProducts: [], permissions: [], password: 'mgr123' },
  'MGR003': { employeeId: 'MGR003', name: 'Senior Eng Wipa',    initials: 'SW', baseRole: 'manager',    roleLabel: 'Manager',    department: 'All', ownedProducts: ['*'], delegatedProducts: [], permissions: [], password: 'mgr123' },

  'ENG-TST-1': { employeeId: 'ENG-TST-1', name: 'Eng Test A', initials: 'TA', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Test', ownedProducts: ['CUST-001', 'CUST-002'], delegatedProducts: [], permissions: [], password: 'eng123' },
  'ENG-TST-2': { employeeId: 'ENG-TST-2', name: 'Eng Test B', initials: 'TB', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Test', ownedProducts: ['CUST-003', 'CUST-004'], delegatedProducts: [], permissions: [], password: 'eng123' },
  'ENG-TST-3': { employeeId: 'ENG-TST-3', name: 'Eng Test C', initials: 'TC', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Test', ownedProducts: ['CUST-005', 'CUST-006'], delegatedProducts: [], permissions: [], password: 'eng123' },
  'ENG-MEC-1': { employeeId: 'ENG-MEC-1', name: 'Eng Mech A', initials: 'MA', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Mechanic', ownedProducts: ['CUST-002', 'CUST-004'], delegatedProducts: [], permissions: [], password: 'eng123' },
  'ENG-MEC-2': { employeeId: 'ENG-MEC-2', name: 'Eng Mech B', initials: 'MB', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Mechanic', ownedProducts: ['CUST-001', 'CUST-006'], delegatedProducts: [], permissions: [], password: 'eng123' },
  'ENG-MEC-3': { employeeId: 'ENG-MEC-3', name: 'Eng Mech C', initials: 'MC', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Mechanic', ownedProducts: ['CUST-003', 'CUST-005'], delegatedProducts: [], permissions: [], password: 'eng123' },
  'ENG-MFG-1': { employeeId: 'ENG-MFG-1', name: 'Eng Mfg A',  initials: 'FA', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Manufacturing', ownedProducts: ['CUST-003', 'CUST-001'], delegatedProducts: [], permissions: [], password: 'eng123' },
  'ENG-MFG-2': { employeeId: 'ENG-MFG-2', name: 'Eng Mfg B',  initials: 'FB', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Manufacturing', ownedProducts: ['CUST-006', 'CUST-002'], delegatedProducts: [], permissions: [], password: 'eng123' },
  'ENG-MFG-3': { employeeId: 'ENG-MFG-3', name: 'Eng Mfg C',  initials: 'FC', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Manufacturing', ownedProducts: ['CUST-005', 'CUST-004'], delegatedProducts: [], permissions: [], password: 'eng123' },
  'ENG-MTN-1': { employeeId: 'ENG-MTN-1', name: 'Eng Maint A', initials: 'NA', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Maintenance', ownedProducts: ['CUST-005', 'CUST-001'], delegatedProducts: [], permissions: [], password: 'eng123' },
  'ENG-MTN-2': { employeeId: 'ENG-MTN-2', name: 'Eng Maint B', initials: 'NB', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Maintenance', ownedProducts: ['CUST-002', 'CUST-003'], delegatedProducts: [], permissions: [], password: 'eng123' },
  'ENG-MTN-3': { employeeId: 'ENG-MTN-3', name: 'Eng Maint C', initials: 'NC', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Maintenance', ownedProducts: ['CUST-004', 'CUST-006'], delegatedProducts: [], permissions: [], password: 'eng123' },
  'ENG-FAC-1': { employeeId: 'ENG-FAC-1', name: 'Eng Fac A',   initials: 'CA', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Facility', ownedProducts: ['CUST-006', 'CUST-001'], delegatedProducts: [], permissions: [], password: 'eng123' },
  'ENG-FAC-2': { employeeId: 'ENG-FAC-2', name: 'Eng Fac B',   initials: 'CB', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Facility', ownedProducts: ['CUST-003', 'CUST-002'], delegatedProducts: [], permissions: [], password: 'eng123' },
  'ENG-FAC-3': { employeeId: 'ENG-FAC-3', name: 'Eng Fac C',   initials: 'CC', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Facility', ownedProducts: ['CUST-005', 'CUST-004'], delegatedProducts: [], permissions: [], password: 'eng123' },

  'TECH-TST-1': { employeeId: 'TECH-TST-1', name: 'Tech Test 1',  initials: 'T1', baseRole: 'technician', roleLabel: 'Technician', department: 'Test',          ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-TST-2': { employeeId: 'TECH-TST-2', name: 'Tech Test 2',  initials: 'T2', baseRole: 'technician', roleLabel: 'Technician', department: 'Test',          ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-TST-3': { employeeId: 'TECH-TST-3', name: 'Tech Test 3',  initials: 'T3', baseRole: 'technician', roleLabel: 'Technician', department: 'Test',          ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-TST-4': { employeeId: 'TECH-TST-4', name: 'Tech Test 4',  initials: 'T4', baseRole: 'technician', roleLabel: 'Technician', department: 'Test',          ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-MEC-1': { employeeId: 'TECH-MEC-1', name: 'Tech Mech 1',  initials: 'M1', baseRole: 'technician', roleLabel: 'Technician', department: 'Mechanic',     ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-MEC-2': { employeeId: 'TECH-MEC-2', name: 'Tech Mech 2',  initials: 'M2', baseRole: 'technician', roleLabel: 'Technician', department: 'Mechanic',     ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-MEC-3': { employeeId: 'TECH-MEC-3', name: 'Tech Mech 3',  initials: 'M3', baseRole: 'technician', roleLabel: 'Technician', department: 'Mechanic',     ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-MEC-4': { employeeId: 'TECH-MEC-4', name: 'Tech Mech 4',  initials: 'M4', baseRole: 'technician', roleLabel: 'Technician', department: 'Mechanic',     ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-MFG-1': { employeeId: 'TECH-MFG-1', name: 'Tech Mfg 1',   initials: 'F1', baseRole: 'technician', roleLabel: 'Technician', department: 'Manufacturing', ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-MFG-2': { employeeId: 'TECH-MFG-2', name: 'Tech Mfg 2',   initials: 'F2', baseRole: 'technician', roleLabel: 'Technician', department: 'Manufacturing', ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-MFG-3': { employeeId: 'TECH-MFG-3', name: 'Tech Mfg 3',   initials: 'F3', baseRole: 'technician', roleLabel: 'Technician', department: 'Manufacturing', ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-MFG-4': { employeeId: 'TECH-MFG-4', name: 'Tech Mfg 4',   initials: 'F4', baseRole: 'technician', roleLabel: 'Technician', department: 'Manufacturing', ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-MTN-1': { employeeId: 'TECH-MTN-1', name: 'Tech Maint 1', initials: 'N1', baseRole: 'technician', roleLabel: 'Technician', department: 'Maintenance',  ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-MTN-2': { employeeId: 'TECH-MTN-2', name: 'Tech Maint 2', initials: 'N2', baseRole: 'technician', roleLabel: 'Technician', department: 'Maintenance',  ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-MTN-3': { employeeId: 'TECH-MTN-3', name: 'Tech Maint 3', initials: 'N3', baseRole: 'technician', roleLabel: 'Technician', department: 'Maintenance',  ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-MTN-4': { employeeId: 'TECH-MTN-4', name: 'Tech Maint 4', initials: 'N4', baseRole: 'technician', roleLabel: 'Technician', department: 'Maintenance',  ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-FAC-1': { employeeId: 'TECH-FAC-1', name: 'Tech Fac 1',   initials: 'C1', baseRole: 'technician', roleLabel: 'Technician', department: 'Facility',     ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-FAC-2': { employeeId: 'TECH-FAC-2', name: 'Tech Fac 2',   initials: 'C2', baseRole: 'technician', roleLabel: 'Technician', department: 'Facility',     ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-FAC-3': { employeeId: 'TECH-FAC-3', name: 'Tech Fac 3',   initials: 'C3', baseRole: 'technician', roleLabel: 'Technician', department: 'Facility',     ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },
  'TECH-FAC-4': { employeeId: 'TECH-FAC-4', name: 'Tech Fac 4',   initials: 'C4', baseRole: 'technician', roleLabel: 'Technician', department: 'Facility',     ownedProducts: [], delegatedProducts: [], permissions: [], password: 'tech123' },

  'ADM001': {
    employeeId: 'ADM001', name: 'Admin Supachai', initials: 'AS', baseRole: 'admin', roleLabel: 'Admin',
    department: 'All', ownedProducts: ['*'], delegatedProducts: [], password: 'adm123',
    permissions: ['pm.dashboard.view', 'pm.create.view', 'pm.create.submit', 'pm.assign.view', 'pm.assign.submit',
      'pm.record.view', 'pm.record.submit', 'pm.calendar.view', 'pm.reports.view', 'pm.audit.view',
      'pm.reports.export', 'pm.permission.delegate', 'pm.permission.revoke', 'system.user.manage',
      'system.role.manage', 'system.product.manage']
  },
};

function buildSeedTasks(): PMTask[] {
  const today = new Date();
  const d = (offset: number) => {
    const dt = new Date(today);
    dt.setDate(dt.getDate() + offset);
    return dt;
  };

  const seeds = [
    { p: 'CUST-001', dept: 'Facility',      a: 'Chiller Unit #1',      c: 'CH-P1-01',  type: 'Monthly',   due: d(3),  by: 'ENG-FAC-1', est: 2 },
    { p: 'CUST-002', dept: 'Mechanic',      a: 'Air Compressor AC-2',  c: 'AC-P2-01',  type: 'Weekly',    due: d(5),  by: 'ENG-MEC-1', est: 1.5 },
    { p: 'CUST-003', dept: 'Manufacturing', a: 'CNC Mill M-300',       c: 'CNC-P3-01', type: 'Quarterly', due: d(7),  by: 'ENG-MFG-1', est: 4 },
    { p: 'CUST-004', dept: 'Test',          a: 'Server Rack SR-4',     c: 'SRV-P4-01', type: 'Monthly',   due: d(2),  by: 'ENG-TST-2', est: 2 },
    { p: 'CUST-005', dept: 'Maintenance',   a: 'Emergency Gen Set E',  c: 'GEN-P5-01', type: 'Weekly',    due: d(4),  by: 'ENG-MTN-1', est: 1 },
    { p: 'CUST-006', dept: 'Facility',      a: 'Cooling Tower CT-6',   c: 'CT-P6-01',  type: 'Daily',     due: d(1),  by: 'ENG-FAC-1', est: 0.5 },
    { p: 'CUST-001', dept: 'Test',          a: 'Thermal Chamber TC-1', c: 'THC-P1-01', type: 'Monthly',   due: d(2),  by: 'ENG-TST-1', tech: 'TECH-TST-1', est: 3 },
    { p: 'CUST-002', dept: 'Mechanic',      a: 'Exhaust Fan EF-2',     c: 'EXF-P2-01', type: 'Weekly',    due: d(1),  by: 'ENG-MEC-1', tech: 'TECH-MEC-1', est: 1 },
    { p: 'CUST-003', dept: 'Manufacturing', a: 'Packaging Line #3',    c: 'PKG-P3-01', type: 'Quarterly', due: d(6),  by: 'ENG-MFG-1', tech: 'TECH-MFG-1', est: 5 },
    { p: 'CUST-005', dept: 'Maintenance',   a: 'Fire Pump #5',         c: 'FP-P5-01',  type: 'Monthly',   due: d(3),  by: 'ENG-MTN-1', tech: 'TECH-MTN-1', est: 2 },
    { p: 'CUST-001', dept: 'Mechanic',      a: 'Conveyor Motor A',     c: 'CM-P1-01',  type: 'Weekly',    due: d(-3), by: 'ENG-MEC-2', tech: 'TECH-MEC-2', est: 1.5 },
    { p: 'CUST-004', dept: 'Facility',      a: 'Cooling Tower CT-4',   c: 'CT-P4-01',  type: 'Monthly',   due: d(-5), by: 'ENG-FAC-2', tech: 'TECH-FAC-1', est: 2.5 },
    { p: 'CUST-006', dept: 'Test',          a: 'ATE Station #6',       c: 'ATE-P6-01', type: 'Daily',     due: d(-1), by: 'ENG-TST-3', tech: 'TECH-TST-3', est: 0.5 },
    { p: 'CUST-002', dept: 'Facility',      a: 'Main Power Panel B',   c: 'MPP-P2-01', type: 'Quarterly', due: d(-7), by: 'ENG-FAC-1', tech: 'TECH-FAC-2', done: d(-6), est: 4 },
    { p: 'CUST-003', dept: 'Mechanic',      a: 'Hydraulic Press #3',   c: 'HYP-P3-01', type: 'Monthly',   due: d(-4), by: 'ENG-MEC-3', tech: 'TECH-MEC-3', done: d(-3), est: 2.5 },
    { p: 'CUST-005', dept: 'Manufacturing', a: 'CNC Router R-500',     c: 'CNC-P5-01', type: 'Weekly',    due: d(-2), by: 'ENG-MFG-3', tech: 'TECH-MFG-2', done: d(-1), est: 3 },
  ] as Array<{ p: string; dept: string; a: string; c: string; type: string; due: Date; by: string; tech?: string; done?: Date; est: number }>;

  const deptCounters: Record<string, number> = {};

  return seeds.map((s, i) => {
    const deptName = s.dept.substring(0, 3).toUpperCase();
    deptCounters[deptName] = (deptCounters[deptName] || 0) + 1;
    const runNum = deptCounters[deptName].toString().padStart(4, '0');

    const status: PMTaskStatus = s.done
      ? 'Done'
      : s.due < today && !s.tech ? 'Overdue'
      : s.tech ? 'In Progress'
      : 'Pending';

    return {
      id: `PM-${deptName}-${runNum}`,
      productId: s.p,
      department: s.dept,
      assetId: s.c,
      title: s.a,
      description: `Perform ${s.type} maintenance.`,
      frequency: s.type as PMTaskFrequency,
      nextDueDate: s.due,
      estimatedHours: s.est,
      status,
      assignedTo: s.tech,
      createdBy: s.by,
      createdAt: new Date(today.getTime() - (10 - i) * 86400000),
      completedAt: s.done,
      completedBy: s.done ? s.tech : undefined,
      recordNotes: s.done ? 'Completed on schedule. All checks passed.' : undefined,
      partsUsed: [],
      checklist: [
        { text: 'Inspect exterior for damage', done: !!s.done },
        { text: 'Check fluid levels', done: !!s.done },
        { text: 'Perform functional test', done: !!s.done },
      ],
    } as PMTask;
  });
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ApiService {
  // In-memory stores — replace with HttpClient calls when backend is ready
  private tasks: PMTask[] = buildSeedTasks();
  private templates: Template[] = [];
  private users: Record<string, User & { password?: string }> = { ...SEED_USERS };

  // ── Assets ──────────────────────────────────────────────────────────────
  // TODO: Replace with firstValueFrom(this.http.get<Asset[]>('/api/assets'))
  getAssets(): Promise<Asset[]> {
    return Promise.resolve([...SEED_ASSETS]);
  }

  // ── PM Tasks ─────────────────────────────────────────────────────────────
  // TODO: Replace with firstValueFrom(this.http.get<PMTask[]>('/api/pm-tasks'))
  getTasks(): Promise<PMTask[]> {
    return Promise.resolve(this.tasks.map(t => ({ ...t })));
  }

  // TODO: Replace with firstValueFrom(this.http.post<PMTask>('/api/pm-tasks', task))
  createTask(task: Omit<PMTask, 'id'>): Promise<PMTask> {
    const dept = (task.department || 'General').substring(0, 3).toUpperCase();
    const existing = this.tasks.filter(t => t.id.startsWith(`PM-${dept}-`));
    let maxRun = 0;
    for (const t of existing) {
      const n = parseInt(t.id.split('-')[2], 10);
      if (!isNaN(n) && n > maxRun) maxRun = n;
    }
    const newTask: PMTask = { ...task, id: `PM-${dept}-${(maxRun + 1).toString().padStart(4, '0')}` };
    this.tasks.unshift(newTask);
    return Promise.resolve({ ...newTask });
  }

  // TODO: Replace with firstValueFrom(this.http.put<PMTask>(`/api/pm-tasks/${task.id}`, task))
  updateTask(task: PMTask): Promise<PMTask> {
    const idx = this.tasks.findIndex(t => t.id === task.id);
    if (idx === -1) return Promise.reject(new Error(`Task ${task.id} not found`));
    this.tasks[idx] = { ...task, updatedAt: new Date() };
    return Promise.resolve({ ...this.tasks[idx] });
  }

  // TODO: Replace with firstValueFrom(this.http.delete(`/api/pm-tasks/${id}`))
  deleteTask(id: string): Promise<void> {
    this.tasks = this.tasks.filter(t => t.id !== id);
    return Promise.resolve();
  }

  // ── Templates ────────────────────────────────────────────────────────────
  // TODO: Replace with firstValueFrom(this.http.get<Template[]>('/api/templates'))
  getTemplates(): Promise<Template[]> {
    return Promise.resolve(this.templates.map(t => ({ ...t })));
  }

  // TODO: Replace with firstValueFrom(this.http.post<Template>('/api/templates', template))
  createTemplate(template: Template): Promise<Template> {
    this.templates.push(template);
    return Promise.resolve({ ...template });
  }

  // TODO: Replace with firstValueFrom(this.http.delete('/api/templates', { body: { name, department } }))
  deleteTemplate(name: string, department: string): Promise<void> {
    this.templates = this.templates.filter(t => !(t.name === name && t.department === department));
    return Promise.resolve();
  }

  // ── Auth / Users ─────────────────────────────────────────────────────────
  // TODO: Replace with firstValueFrom(this.http.post<User>('/api/auth/login', { employeeId, password }))
  verifyLogin(employeeId: string, password: string): Promise<User | null> {
    const u = this.users[employeeId];
    if (!u || u.password !== password) return Promise.resolve(null);
    const { password: _, ...clean } = u;
    return Promise.resolve(clean as User);
  }

  // TODO: Replace with firstValueFrom(this.http.get<User>(`/api/users/${id}`))
  getUser(id: string): Promise<User | undefined> {
    const u = this.users[id];
    if (!u) return Promise.resolve(undefined);
    const { password: _, ...clean } = u;
    return Promise.resolve(clean as User);
  }

  // TODO: Replace with firstValueFrom(this.http.get<User[]>('/api/users'))
  getAllUsers(): Promise<User[]> {
    return Promise.resolve(
      Object.values(this.users).map(({ password: _, ...u }) => u as User)
    );
  }

  // TODO: Replace with firstValueFrom(this.http.patch<User>(`/api/users/${id}`, patch))
  updateUser(id: string, patch: Partial<User & { password?: string }>): Promise<User> {
    if (!this.users[id]) return Promise.reject(new Error(`User ${id} not found`));
    this.users[id] = { ...this.users[id], ...patch };
    const { password: _, ...clean } = this.users[id];
    return Promise.resolve(clean as User);
  }

  // TODO: Replace with firstValueFrom(this.http.get<AuditLog[]>('/api/audit-logs'))
  getAuditLogs(userId: string, role: string, department?: string): Promise<AuditLog[]> {
    const user = this.users[userId];
    const userName = user?.name || userId;
    const now = Date.now();
    const min = (n: number) => new Date(now - n * 60000);

    const logs: AuditLog[] = [
      { id: 'AL-1001', timestamp: min(5),       action: 'Delegated Product Access', actor: { name: 'Admin Supachai', id: 'ADM001' }, target: { name: userName, id: userId, isUser: true }, product: 'CUST-001', type: 'security' },
      { id: 'AL-1002', timestamp: min(45),      action: 'Revoked Product Access',   actor: { name: 'Admin Supachai', id: 'ADM001' }, target: { name: userName, id: userId, isUser: true }, product: 'CUST-002', type: 'security' },
      { id: 'AL-1003', timestamp: min(120),     action: 'Granted View Permission',  actor: { name: userName, id: userId }, target: { name: 'Tech Test 1', id: 'TECH-TST-1', isUser: true }, product: 'CUST-001', type: 'security' },
    ];

    if (role === 'manager') {
      logs.push(
        { id: 'AL-1004', timestamp: min(1440), action: 'Created PM Template', actor: { name: 'Eng SMT B', id: 'ENG-SMT-2' }, target: { name: 'best', id: 'TMPL-042', isUser: false }, product: 'SMT Shared Asset', type: 'system' },
        { id: 'AL-1005', timestamp: min(2880), action: 'Deleted PM Template', actor: { name: 'Eng Test C', id: 'ENG-TST-3' }, target: { name: 'Weekly Calibration', id: 'TMPL-018', isUser: false }, product: 'Test Shared Asset', type: 'system' }
      );
    } else {
      const dept = department || 'Test';
      const pfx = dept.substring(0, 3).toUpperCase();
      logs.push(
        { id: 'AL-1004', timestamp: min(1440), action: 'Created PM Template', actor: { name: `Eng ${dept} B`, id: `ENG-${pfx}-2` }, target: { name: 'best', id: 'TMPL-042', isUser: false }, product: `${dept} Shared Asset`, type: 'system' },
        { id: 'AL-1005', timestamp: min(2880), action: 'Created PM Template', actor: { name: `Tech ${dept} 1`, id: `TECH-${pfx}-1 (Delegated)` }, target: { name: 'Monthly Inspection', id: 'TMPL-088', isUser: false }, product: `${dept} Shared Asset`, type: 'system' }
      );
    }

    return Promise.resolve(logs);
  }
}
