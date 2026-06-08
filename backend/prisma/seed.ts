import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

function parseConnectionString(url: string) {
  if (!url.startsWith('sqlserver://')) {
    throw new Error('Invalid SQL Server connection URL format.');
  }
  
  const rest = url.substring('sqlserver://'.length);
  const semiIndex = rest.indexOf(';');
  const hostPart = semiIndex === -1 ? rest : rest.substring(0, semiIndex);
  const paramsPart = semiIndex === -1 ? '' : rest.substring(semiIndex + 1);

  let server = hostPart;
  let port: number | undefined;
  if (hostPart.includes(':')) {
    const parts = hostPart.split(':');
    server = parts[0];
    port = parseInt(parts[1], 10);
  }

  const params: Record<string, string> = {};
  if (paramsPart) {
    const kvs = paramsPart.split(';');
    for (const kv of kvs) {
      if (!kv) continue;
      const eqIndex = kv.indexOf('=');
      if (eqIndex !== -1) {
        const k = kv.substring(0, eqIndex).trim();
        const v = kv.substring(eqIndex + 1).trim();
        params[k] = v;
      }
    }
  }

  let instanceName: string | undefined;
  if (server.includes('\\')) {
    const parts = server.split('\\');
    server = parts[0];
    instanceName = parts[1];
  }

  return {
    server,
    port: port || (instanceName ? undefined : 1433),
    database: params.database || 'master',
    user: params.user || '',
    password: params.password || '',
    options: {
      instanceName,
      encrypt: params.encrypt === 'true',
      trustServerCertificate: params.trustServerCertificate === 'true',
    }
  };
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('DATABASE_URL is not defined in environment variables.');
}

const config = parseConnectionString(dbUrl);
const adapter = new PrismaMssql(config);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // 1. Clear existing CMMS data in correct order
  await prisma.auditLog.deleteMany({});
  await prisma.delegation.deleteMany({});
  await prisma.template.deleteMany({});
  await prisma.pmTask.deleteMany({});
  await prisma.asset.deleteMany({});
  await prisma.userOwnedProduct.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.department.deleteMany({});

  // 2. Seed Departments
  const departments = ['Facility', 'Mechanic', 'Manufacturing', 'Maintenance', 'Test'];
  for (const dept of departments) {
    await prisma.department.create({ data: { name: dept } });
  }
  console.log('Departments seeded.');

  // 3. Seed Products
  const products = [
    { id: 'CUST-001', name: 'Precision Tech Co' },
    { id: 'CUST-002', name: 'Global Manufacturing Corp' },
    { id: 'CUST-003', name: 'Apex Test Labs' },
    { id: 'CUST-004', name: 'Summit Dynamics' },
    { id: 'CUST-005', name: 'Logistics Prime' },
    { id: 'CUST-006', name: 'Micro Electronics Inc' },
  ];
  for (const p of products) {
    await prisma.product.create({ data: p });
  }
  console.log('Products seeded.');

  // 4. Seed Users and owned products mapping
  const rawUsers = [
    { employeeId: 'MGR001', name: 'Manager Somporn', initials: 'MS', baseRole: 'manager', roleLabel: 'Manager', department: 'All', owned: ['*'], password: 'mgr123' },
    { employeeId: 'MGR002', name: 'Senior Eng Nattapol', initials: 'SN', baseRole: 'manager', roleLabel: 'Manager', department: 'All', owned: ['*'], password: 'mgr123' },
    { employeeId: 'MGR003', name: 'Senior Eng Wipa', initials: 'SW', baseRole: 'manager', roleLabel: 'Manager', department: 'All', owned: ['*'], password: 'mgr123' },

    { employeeId: 'ENG-TST-1', name: 'Eng Test A', initials: 'TA', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Test', owned: ['CUST-001', 'CUST-002'], password: 'eng123' },
    { employeeId: 'ENG-TST-2', name: 'Eng Test B', initials: 'TB', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Test', owned: ['CUST-003', 'CUST-004'], password: 'eng123' },
    { employeeId: 'ENG-TST-3', name: 'Eng Test C', initials: 'TC', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Test', owned: ['CUST-005', 'CUST-006'], password: 'eng123' },
    { employeeId: 'ENG-MEC-1', name: 'Eng Mech A', initials: 'MA', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Mechanic', owned: ['CUST-002', 'CUST-004'], password: 'eng123' },
    { employeeId: 'ENG-MEC-2', name: 'Eng Mech B', initials: 'MB', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Mechanic', owned: ['CUST-001', 'CUST-006'], password: 'eng123' },
    { employeeId: 'ENG-MEC-3', name: 'Eng Mech C', initials: 'MC', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Mechanic', owned: ['CUST-003', 'CUST-005'], password: 'eng123' },
    { employeeId: 'ENG-MFG-1', name: 'Eng Mfg A', initials: 'FA', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Manufacturing', owned: ['CUST-003', 'CUST-001'], password: 'eng123' },
    { employeeId: 'ENG-MFG-2', name: 'Eng Mfg B', initials: 'FB', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Manufacturing', owned: ['CUST-006', 'CUST-002'], password: 'eng123' },
    { employeeId: 'ENG-MFG-3', name: 'Eng Mfg C', initials: 'FC', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Manufacturing', owned: ['CUST-005', 'CUST-004'], password: 'eng123' },
    { employeeId: 'ENG-MTN-1', name: 'Eng Maint A', initials: 'NA', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Maintenance', owned: ['CUST-005', 'CUST-001'], password: 'eng123' },
    { employeeId: 'ENG-MTN-2', name: 'Eng Maint B', initials: 'NB', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Maintenance', owned: ['CUST-002', 'CUST-003'], password: 'eng123' },
    { employeeId: 'ENG-MTN-3', name: 'Eng Maint C', initials: 'NC', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Maintenance', owned: ['CUST-004', 'CUST-006'], password: 'eng123' },
    { employeeId: 'ENG-FAC-1', name: 'Eng Fac A', initials: 'CA', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Facility', owned: ['CUST-006', 'CUST-001'], password: 'eng123' },
    { employeeId: 'ENG-FAC-2', name: 'Eng Fac B', initials: 'CB', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Facility', owned: ['CUST-003', 'CUST-002'], password: 'eng123' },
    { employeeId: 'ENG-FAC-3', name: 'Eng Fac C', initials: 'CC', baseRole: 'engineer', roleLabel: 'Engineer', department: 'Facility', owned: ['CUST-005', 'CUST-004'], password: 'eng123' },

    { employeeId: 'TECH-TST-1', name: 'Tech Test 1', initials: 'T1', baseRole: 'technician', roleLabel: 'Technician', department: 'Test', owned: [], password: 'tech123' },
    { employeeId: 'TECH-TST-2', name: 'Tech Test 2', initials: 'T2', baseRole: 'technician', roleLabel: 'Technician', department: 'Test', owned: [], password: 'tech123' },
    { employeeId: 'TECH-TST-3', name: 'Tech Test 3', initials: 'T3', baseRole: 'technician', roleLabel: 'Technician', department: 'Test', owned: [], password: 'tech123' },
    { employeeId: 'TECH-TST-4', name: 'Tech Test 4', initials: 'T4', baseRole: 'technician', roleLabel: 'Technician', department: 'Test', owned: [], password: 'tech123' },
    { employeeId: 'TECH-MEC-1', name: 'Tech Mech 1', initials: 'M1', baseRole: 'technician', roleLabel: 'Technician', department: 'Mechanic', owned: [], password: 'tech123' },
    { employeeId: 'TECH-MEC-2', name: 'Tech Mech 2', initials: 'M2', baseRole: 'technician', roleLabel: 'Technician', department: 'Mechanic', owned: [], password: 'tech123' },
    { employeeId: 'TECH-MEC-3', name: 'Tech Mech 3', initials: 'M3', baseRole: 'technician', roleLabel: 'Technician', department: 'Mechanic', owned: [], password: 'tech123' },
    { employeeId: 'TECH-MEC-4', name: 'Tech Mech 4', initials: 'M4', baseRole: 'technician', roleLabel: 'Technician', department: 'Mechanic', owned: [], password: 'tech123' },
    { employeeId: 'TECH-MFG-1', name: 'Tech Mfg 1', initials: 'F1', baseRole: 'technician', roleLabel: 'Technician', department: 'Manufacturing', owned: [], password: 'tech123' },
    { employeeId: 'TECH-MFG-2', name: 'Tech Mfg 2', initials: 'F2', baseRole: 'technician', roleLabel: 'Technician', department: 'Manufacturing', owned: [], password: 'tech123' },
    { employeeId: 'TECH-MFG-3', name: 'Tech Mfg 3', initials: 'F3', baseRole: 'technician', roleLabel: 'Technician', department: 'Manufacturing', owned: [], password: 'tech123' },
    { employeeId: 'TECH-MFG-4', name: 'Tech Mfg 4', initials: 'F4', baseRole: 'technician', roleLabel: 'Technician', department: 'Manufacturing', owned: [], password: 'tech123' },
    { employeeId: 'TECH-MTN-1', name: 'Tech Maint 1', initials: 'N1', baseRole: 'technician', roleLabel: 'Technician', department: 'Maintenance', owned: [], password: 'tech123' },
    { employeeId: 'TECH-MTN-2', name: 'Tech Maint 2', initials: 'N2', baseRole: 'technician', roleLabel: 'Technician', department: 'Maintenance', owned: [], password: 'tech123' },
    { employeeId: 'TECH-MTN-3', name: 'Tech Maint 3', initials: 'N3', baseRole: 'technician', roleLabel: 'Technician', department: 'Maintenance', owned: [], password: 'tech123' },
    { employeeId: 'TECH-MTN-4', name: 'Tech Maint 4', initials: 'N4', baseRole: 'technician', roleLabel: 'Technician', department: 'Maintenance', owned: [], password: 'tech123' },
    { employeeId: 'TECH-FAC-1', name: 'Tech Fac 1', initials: 'C1', baseRole: 'technician', roleLabel: 'Technician', department: 'Facility', owned: [], password: 'tech123' },
    { employeeId: 'TECH-FAC-2', name: 'Tech Fac 2', initials: 'C2', baseRole: 'technician', roleLabel: 'Technician', department: 'Facility', owned: [], password: 'tech123' },
    { employeeId: 'TECH-FAC-3', name: 'Tech Fac 3', initials: 'C3', baseRole: 'technician', roleLabel: 'Technician', department: 'Facility', owned: [], password: 'tech123' },
    { employeeId: 'TECH-FAC-4', name: 'Tech Fac 4', initials: 'C4', baseRole: 'technician', roleLabel: 'Technician', department: 'Facility', owned: [], password: 'tech123' },

    {
      employeeId: 'ADM001',
      name: 'Admin Supachai',
      initials: 'AS',
      baseRole: 'admin',
      roleLabel: 'Admin',
      department: 'All',
      owned: ['*'],
      password: 'adm123',
      permissions: [
        'pm.dashboard.view', 'pm.create.view', 'pm.create.submit', 'pm.assign.view', 'pm.assign.submit',
        'pm.record.view', 'pm.record.submit', 'pm.calendar.view', 'pm.reports.view', 'pm.audit.view',
        'pm.reports.export', 'pm.permission.delegate', 'pm.permission.revoke', 'system.user.manage',
        'system.role.manage', 'system.product.manage'
      ]
    }
  ];

  for (const u of rawUsers) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.create({
      data: {
        employeeId: u.employeeId,
        name: u.name,
        initials: u.initials,
        passwordHash,
        baseRole: u.baseRole,
        roleLabel: u.roleLabel,
        department: u.department,
        permissions: JSON.stringify(u.permissions || [])
      }
    });

    for (const prodId of u.owned) {
      await prisma.userOwnedProduct.create({
        data: {
          employeeId: user.employeeId,
          productId: prodId
        }
      });
    }
  }
  console.log('Users seeded.');

  // 5. Seed Assets
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

  for (const location of Object.keys(catalog)) {
    for (const department of Object.keys(catalog[location])) {
      for (const a of catalog[location][department]) {
        await prisma.asset.create({
          data: {
            id: a.code,
            name: a.name,
            department,
            location
          }
        });
      }
    }
  }
  console.log('Assets seeded.');

  // 6. Seed PM Tasks
  const today = new Date();
  const d = (offset: number) => {
    const dt = new Date(today);
    dt.setDate(dt.getDate() + offset);
    return dt;
  };

  const taskSeeds = [
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
  ];

  const deptCounters: Record<string, number> = {};

  for (let i = 0; i < taskSeeds.length; i++) {
    const s = taskSeeds[i];
    const deptName = s.dept.substring(0, 3).toUpperCase();
    deptCounters[deptName] = (deptCounters[deptName] || 0) + 1;
    const runNum = deptCounters[deptName].toString().padStart(4, '0');
    const taskId = `PM-${deptName}-${runNum}`;

    const status = s.done
      ? 'Done'
      : s.due < today && !s.tech ? 'Overdue'
      : s.tech ? 'In Progress'
      : 'Pending';

    await prisma.pmTask.create({
      data: {
        id: taskId,
        productId: s.p,
        department: s.dept,
        assetId: s.c,
        title: s.a,
        description: `Perform ${s.type} maintenance.`,
        frequency: s.type,
        nextDueDate: s.due,
        estimatedHours: s.est,
        status,
        assignedTo: s.tech,
        createdBy: s.by,
        createdAt: new Date(today.getTime() - (10 - i) * 86400000),
        completedAt: s.done || null,
        completedBy: s.done ? s.tech : null,
        recordNotes: s.done ? 'Completed on schedule. All checks passed.' : null,
        partsUsed: '[]',
        partsRequired: '[]',
        checklist: JSON.stringify([
          { text: 'Inspect exterior for damage', done: !!s.done },
          { text: 'Check fluid levels', done: !!s.done },
          { text: 'Perform functional test', done: !!s.done },
        ])
      }
    });
  }
  console.log('PM Tasks seeded.');
  console.log('Database seeding successfully finished!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
