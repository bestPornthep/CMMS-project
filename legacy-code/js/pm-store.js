/**
 * PM Data Store v2.0
 * Handles CRUD operations for PM Work Orders using localStorage.
 * Includes a complete hardcoded Asset Catalog and seed data.
 */
const AssetIntelPMStore = (function() {
  const STORAGE_KEY = 'assetintel_pm_db';
  const TEMPLATE_KEY = 'assetintel_pm_templates';
  const SEED_FLAG   = 'assetintel_pm_seeded_v4'; // Bumped seed version

  // ══════════════════════════════════════════════════════════
  //  ASSET CATALOG — 2 machines × 5 depts × 6 products = 60
  //  Each dept has its own type of equipment.
  //  Each product line uses different unit numbers.
  // ══════════════════════════════════════════════════════════
  const ASSET_CATALOG = {
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

  // ══════════════════════════════════════════════════════════
  //  DATABASE METHODS
  // ══════════════════════════════════════════════════════════

  function getPMs() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  }

  function savePMs(pms) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pms));
  }

  function getTemplates() {
    try {
      return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '[]');
    } catch { return []; }
  }

  function saveTemplates(templates) {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
  }

  function createTemplate(data) {
    const tpls = getTemplates();
    const idNum = tpls.length > 0 ? Math.max(...tpls.map(t => parseInt(t.id.replace('TPL-','')) || 0)) + 1 : 100;
    const newTpl = {
      id: `TPL-${idNum}`,
      name: data.name,
      department: data.department,
      items: data.items || [],
      createdBy: data.createdBy,
      createdAt: new Date().toISOString()
    };
    tpls.push(newTpl);
    saveTemplates(tpls);
    return newTpl;
  }

  function deleteTemplate(id) {
    const tpls = getTemplates();
    const filtered = tpls.filter(t => t.id !== id);
    saveTemplates(filtered);
  }

  function nextId() {
    const pms = getPMs();
    if (pms.length === 0) return 1000;
    const maxNum = Math.max(...pms.map(p => parseInt(p.id.replace('PM-','')) || 999));
    return maxNum + 1;
  }

  function createPM(data) {
    const pms = getPMs();
    const idNum = nextId();

    const newPM = {
      id: `PM-${idNum}`,
      productId: data.productId,
      department: data.department,
      asset: data.assetName,
      code: data.assetCode,
      type: data.type,
      due: data.dueDate, // ISO format YYYY-MM-DD
      status: 'pending',
      assignee: null,
      createdBy: data.createdBy,
      createdAt: new Date().toISOString(),
      completedAt: null,
      completedBy: null,
      recordNotes: '',
      partsUsed: [],
      checklist: data.checklist || [] // [{ text: '...', done: false }]
    };

    pms.push(newPM);
    savePMs(pms);

    if (window.AssetIntelPermissions) {
      AssetIntelPermissions.addAuditEntry({
        action: 'create_pm',
        createdBy: data.createdBy,
        productId: data.productId,
        targetId: '-'
      });
    }
    return newPM;
  }

  function assignPM(pmId, techId, managerId) {
    const pms = getPMs();
    const pm = pms.find(p => p.id === pmId);
    if (pm) {
      pm.status = 'assigned';
      pm.assignee = techId;
      savePMs(pms);
      if (window.AssetIntelPermissions) {
        AssetIntelPermissions.addAuditEntry({
          action: 'delegate_permission',
          delegatedBy: managerId,
          delegatedTo: techId,
          productId: pm.productId,
          targetId: techId
        });
      }
      return true;
    }
    return false;
  }

  function recordPM(pmId, techId, notes, parts, checklistStatus) {
    const pms = getPMs();
    const pm = pms.find(p => p.id === pmId);
    if (pm) {
      pm.status = 'completed';
      pm.completedBy = techId;
      pm.completedAt = new Date().toISOString();
      pm.recordNotes = notes || '';
      pm.partsUsed = parts || [];
      if (checklistStatus) pm.checklist = checklistStatus;
      savePMs(pms);
      return true;
    }
    return false;
  }

  function deletePM(pmId, currentUser) {
    if (currentUser.baseRole !== 'admin') {
      return { success: false, error: 'Unauthorized: Only Admins can delete PMs.' };
    }
    const pms = getPMs();
    const filtered = pms.filter(p => p.id !== pmId);
    if (filtered.length !== pms.length) {
      savePMs(filtered);
      if (window.AssetIntelPermissions) {
        AssetIntelPermissions.addAuditEntry({
          action: 'revoke_permission',
          revokedBy: currentUser.employeeId,
          productId: '-',
          targetId: pmId
        });
      }
      return { success: true };
    }
    return { success: false, error: 'PM not found.' };
  }

  // ══════════════════════════════════════════════════════════
  //  SEED DATA — runs once on first load, never again
  // ══════════════════════════════════════════════════════════
  function seedIfNeeded() {
    if (localStorage.getItem(SEED_FLAG)) return;

    const today = new Date();
    const d = (offset) => {
      const dt = new Date(today);
      dt.setDate(dt.getDate() + offset);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };
    const types = ['Daily','Weekly','Monthly','Quarterly'];
    const creators = ['ENG-TST-1','ENG-MEC-1','ENG-MFG-1','ENG-MTN-1','ENG-FAC-1'];
    const depts = ['Test','Mechanic','Manufacturing','Maintenance','Facility'];
    const prods = ['CUST-001','CUST-002','CUST-003','CUST-004','CUST-005','CUST-006'];

    const seeds = [
      // ── Pending (unassigned) — spread across depts ──
      { p:'CUST-001', dept:'Facility',      a:'Chiller Unit #1',      c:'CH-P1-01',  type:'Monthly',    due: d(3),  by:'ENG-FAC-1' },
      { p:'CUST-002', dept:'Mechanic',      a:'Air Compressor AC-2',  c:'AC-P2-01',  type:'Weekly',     due: d(5),  by:'ENG-MEC-1' },
      { p:'CUST-003', dept:'Manufacturing', a:'CNC Mill M-300',       c:'CNC-P3-01', type:'Quarterly',  due: d(7),  by:'ENG-MFG-1' },
      { p:'CUST-004', dept:'Test',          a:'Server Rack SR-4',     c:'SRV-P4-01', type:'Monthly',    due: d(2),  by:'ENG-TST-2' },
      { p:'CUST-005', dept:'Maintenance',   a:'Emergency Gen Set E',  c:'GEN-P5-01', type:'Weekly',     due: d(4),  by:'ENG-MTN-1' },
      { p:'CUST-006', dept:'Facility',      a:'Cooling Tower CT-6',   c:'CT-P6-01',  type:'Daily',      due: d(1),  by:'ENG-FAC-1' },

      // ── Assigned (in progress) ──
      { p:'CUST-001', dept:'Test',          a:'Thermal Chamber TC-1', c:'THC-P1-01', type:'Monthly',    due: d(2),  by:'ENG-TST-1', tech:'TECH-TST-1' },
      { p:'CUST-002', dept:'Mechanic',      a:'Exhaust Fan EF-2',    c:'EXF-P2-01', type:'Weekly',     due: d(1),  by:'ENG-MEC-1', tech:'TECH-MEC-1' },
      { p:'CUST-003', dept:'Manufacturing', a:'Packaging Line #3',   c:'PKG-P3-01', type:'Quarterly',  due: d(6),  by:'ENG-MFG-1', tech:'TECH-MFG-1' },
      { p:'CUST-005', dept:'Maintenance',   a:'Fire Pump #5',        c:'FP-P5-01',  type:'Monthly',    due: d(3),  by:'ENG-MTN-1', tech:'TECH-MTN-1' },

      // ── Overdue (past due, not completed) ──
      { p:'CUST-001', dept:'Mechanic',      a:'Conveyor Motor A',    c:'CM-P1-01',  type:'Weekly',     due: d(-3), by:'ENG-MEC-2', tech:'TECH-MEC-2' },
      { p:'CUST-004', dept:'Facility',      a:'Cooling Tower CT-4',  c:'CT-P4-01',  type:'Monthly',    due: d(-5), by:'ENG-FAC-2', tech:'TECH-FAC-1' },
      { p:'CUST-006', dept:'Test',          a:'ATE Station #6',      c:'ATE-P6-01', type:'Daily',      due: d(-1), by:'ENG-TST-3', tech:'TECH-TST-3' },

      // ── Completed ──
      { p:'CUST-002', dept:'Facility',      a:'Main Power Panel B',  c:'MPP-P2-01', type:'Quarterly',  due: d(-7), by:'ENG-FAC-1', tech:'TECH-FAC-2', done: d(-6) },
      { p:'CUST-003', dept:'Mechanic',      a:'Hydraulic Press #3',  c:'HYP-P3-01', type:'Monthly',    due: d(-4), by:'ENG-MEC-3', tech:'TECH-MEC-3', done: d(-3) },
      { p:'CUST-005', dept:'Manufacturing', a:'CNC Router R-500',    c:'CNC-P5-01', type:'Weekly',     due: d(-2), by:'ENG-MFG-3', tech:'TECH-MFG-2', done: d(-1) },
    ];

    const pms = [];
    seeds.forEach((s, i) => {
      const pm = {
        id: `PM-${1000 + i}`,
        productId: s.p,
        department: s.dept,
        asset: s.a,
        code: s.c,
        type: s.type,
        due: s.due,
        status: s.done ? 'completed' : (s.tech ? 'assigned' : 'pending'),
        assignee: s.tech || null,
        createdBy: s.by,
        createdAt: new Date(today.getTime() - (10 - i) * 86400000).toISOString(),
        completedAt: s.done ? new Date(s.done + 'T10:00:00').toISOString() : null,
        completedBy: s.done ? s.tech : null,
        recordNotes: s.done ? 'Completed on schedule. All checks passed.' : '',
        partsUsed: [],
        checklist: [
          { text: 'Inspect exterior for damage', done: !!s.done },
          { text: 'Check fluid levels', done: !!s.done },
          { text: 'Perform functional test', done: !!s.done }
        ]
      };
      pms.push(pm);
    });

    savePMs(pms);

    // Seed Templates
    const templates = [
      { id: 'TPL-101', name: 'Standard HVAC Check', department: 'Facility', createdBy: 'ENG-FAC-1', createdAt: new Date().toISOString(), items: ['Check air filters', 'Inspect coils', 'Test thermostat', 'Check belts'] },
      { id: 'TPL-102', name: 'Motor Inspection', department: 'Mechanic', createdBy: 'ENG-MEC-1', createdAt: new Date().toISOString(), items: ['Check vibration', 'Lubricate bearings', 'Test voltage'] },
      { id: 'TPL-103', name: 'ATE Daily Setup', department: 'Test', createdBy: 'ENG-TST-1', createdAt: new Date().toISOString(), items: ['Verify power supply', 'Run self-test', 'Calibrate probes'] }
    ];
    saveTemplates(templates);

    localStorage.setItem(SEED_FLAG, 'true');
    console.log(`[PMStore] Seeded ${pms.length} sample PMs and ${templates.length} templates.`);
  }

  // Run seed on module init
  seedIfNeeded();

  return {
    ASSET_CATALOG,
    getPMs,
    createPM,
    assignPM,
    recordPM,
    deletePM,
    getTemplates,
    createTemplate,
    deleteTemplate
  };
})();
