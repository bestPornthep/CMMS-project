/* ═══════════════════════════════════════════════════════════════
   AssetIntel PM — permissions.js
   Core permission engine (Concept §2–§10)
   
   Role Hierarchy:  Technician < Engineer < Manager < Admin
   Access Model:    Base Role + Product Ownership + Product-Scoped Delegation
   ═══════════════════════════════════════════════════════════════ */

const AssetIntelPermissions = (() => {

  /* ── Permission Keys (Concept §9) ─────────────────────────── */
  const KEYS = {
    DASHBOARD_VIEW:      'pm.dashboard.view',
    CREATE_VIEW:         'pm.create.view',
    CREATE_SUBMIT:       'pm.create.submit',
    ASSIGN_VIEW:         'pm.assign.view',
    ASSIGN_SUBMIT:       'pm.assign.submit',
    RECORD_VIEW:         'pm.record.view',
    RECORD_SUBMIT:       'pm.record.submit',
    CALENDAR_VIEW:       'pm.calendar.view',
    REPORTS_VIEW:        'pm.reports.view',
    AUDIT_VIEW:          'pm.audit.view',
    REPORTS_EXPORT:      'pm.reports.export',
    PERMISSION_DELEGATE: 'pm.permission.delegate',
    PERMISSION_REVOKE:   'pm.permission.revoke',
    USER_MANAGE:         'system.user.manage',
    ROLE_MANAGE:         'system.role.manage',
    PRODUCT_MANAGE:      'system.product.manage',
  };

  /* ── Default Permissions per Role (Concept §10) ───────────── */
  const ROLE_DEFAULTS = {
    technician: [
      KEYS.RECORD_VIEW,
      KEYS.RECORD_SUBMIT,
      KEYS.CALENDAR_VIEW,
    ],
    engineer: [
      KEYS.CREATE_VIEW,
      KEYS.CREATE_SUBMIT,
      KEYS.ASSIGN_VIEW,
      KEYS.ASSIGN_SUBMIT,
      KEYS.RECORD_VIEW,
      KEYS.RECORD_SUBMIT,
      KEYS.CALENDAR_VIEW,
      KEYS.REPORTS_VIEW,
      KEYS.AUDIT_VIEW,
      KEYS.REPORTS_EXPORT,
      KEYS.PERMISSION_DELEGATE,
    ],
    manager: [
      KEYS.DASHBOARD_VIEW,
      KEYS.CREATE_VIEW,
      KEYS.CREATE_SUBMIT,
      KEYS.ASSIGN_VIEW,
      KEYS.ASSIGN_SUBMIT,
      KEYS.RECORD_VIEW,
      KEYS.RECORD_SUBMIT,
      KEYS.CALENDAR_VIEW,
      KEYS.REPORTS_VIEW,
      KEYS.AUDIT_VIEW,
      KEYS.REPORTS_EXPORT,
      KEYS.PERMISSION_DELEGATE,
      KEYS.PERMISSION_REVOKE,
    ],
    admin: [
      KEYS.DASHBOARD_VIEW,
      KEYS.CREATE_VIEW,
      KEYS.CREATE_SUBMIT,
      KEYS.ASSIGN_VIEW,
      KEYS.ASSIGN_SUBMIT,
      KEYS.RECORD_VIEW,
      KEYS.RECORD_SUBMIT,
      KEYS.CALENDAR_VIEW,
      KEYS.REPORTS_VIEW,
      KEYS.AUDIT_VIEW,
      KEYS.REPORTS_EXPORT,
      KEYS.PERMISSION_DELEGATE,
      KEYS.PERMISSION_REVOKE,
      KEYS.USER_MANAGE,
      KEYS.ROLE_MANAGE,
      KEYS.PRODUCT_MANAGE,
    ],
  };

  /* ── Demo Products ────────────────────────────────────────── */
    const PRODUCTS = [
    { productId: 'CUST-001', productName: 'TechCorp Industries' },
    { productId: 'CUST-002', productName: 'Global Manufacturing Ltd' },
    { productId: 'CUST-003', productName: 'Apex Solutions' },
    { productId: 'CUST-004', productName: 'Starlight Electronics' },
    { productId: 'CUST-005', productName: 'Titan Heavy Machineries' },
    { productId: 'CUST-006', productName: 'Quantum Networks' },
  ];

  /* ── Demo Users (Concept §11) ─────────────────────────────── */
  const DEMO_USERS = {
    // ── Managers (3) ─────────────────────────────────────────────────────────
    'MGR001': { employeeId: 'MGR001', name: 'Manager Somporn', initials: 'MS', baseRole: 'manager', department: 'All', ownedProducts: ['*'], delegatedProducts: [], password: 'mgr123' },
    'MGR002': { employeeId: 'MGR002', name: 'Senior Eng Nattapol', initials: 'SN', baseRole: 'manager', department: 'All', ownedProducts: ['*'], delegatedProducts: [], password: 'mgr123' },
    'MGR003': { employeeId: 'MGR003', name: 'Senior Eng Wipa', initials: 'SW', baseRole: 'manager', department: 'All', ownedProducts: ['*'], delegatedProducts: [], password: 'mgr123' },

    // ── Engineers (15) ───────────────────────────────────────────────────────
    // Test Department
    'ENG-TST-1': { employeeId: 'ENG-TST-1', name: 'Eng Test A', initials: 'TA', baseRole: 'engineer', department: 'Test', ownedProducts: ['CUST-001', 'CUST-002'], delegatedProducts: [], password: 'eng123' },
    'ENG-TST-2': { employeeId: 'ENG-TST-2', name: 'Eng Test B', initials: 'TB', baseRole: 'engineer', department: 'Test', ownedProducts: ['CUST-003', 'CUST-004'], delegatedProducts: [], password: 'eng123' },
    'ENG-TST-3': { employeeId: 'ENG-TST-3', name: 'Eng Test C', initials: 'TC', baseRole: 'engineer', department: 'Test', ownedProducts: ['CUST-005', 'CUST-006'], delegatedProducts: [], password: 'eng123' },

    // Mechanic Department
    'ENG-MEC-1': { employeeId: 'ENG-MEC-1', name: 'Eng Mech A', initials: 'MA', baseRole: 'engineer', department: 'Mechanic', ownedProducts: ['CUST-002', 'CUST-004'], delegatedProducts: [], password: 'eng123' },
    'ENG-MEC-2': { employeeId: 'ENG-MEC-2', name: 'Eng Mech B', initials: 'MB', baseRole: 'engineer', department: 'Mechanic', ownedProducts: ['CUST-001', 'CUST-006'], delegatedProducts: [], password: 'eng123' },
    'ENG-MEC-3': { employeeId: 'ENG-MEC-3', name: 'Eng Mech C', initials: 'MC', baseRole: 'engineer', department: 'Mechanic', ownedProducts: ['CUST-003', 'CUST-005'], delegatedProducts: [], password: 'eng123' },

    // Manufacturing Department
    'ENG-MFG-1': { employeeId: 'ENG-MFG-1', name: 'Eng Mfg A', initials: 'FA', baseRole: 'engineer', department: 'Manufacturing', ownedProducts: ['CUST-003', 'CUST-001'], delegatedProducts: [], password: 'eng123' },
    'ENG-MFG-2': { employeeId: 'ENG-MFG-2', name: 'Eng Mfg B', initials: 'FB', baseRole: 'engineer', department: 'Manufacturing', ownedProducts: ['CUST-006', 'CUST-002'], delegatedProducts: [], password: 'eng123' },
    'ENG-MFG-3': { employeeId: 'ENG-MFG-3', name: 'Eng Mfg C', initials: 'FC', baseRole: 'engineer', department: 'Manufacturing', ownedProducts: ['CUST-005', 'CUST-004'], delegatedProducts: [], password: 'eng123' },

    // Maintenance Department
    'ENG-MTN-1': { employeeId: 'ENG-MTN-1', name: 'Eng Maint A', initials: 'NA', baseRole: 'engineer', department: 'Maintenance', ownedProducts: ['CUST-005', 'CUST-001'], delegatedProducts: [], password: 'eng123' },
    'ENG-MTN-2': { employeeId: 'ENG-MTN-2', name: 'Eng Maint B', initials: 'NB', baseRole: 'engineer', department: 'Maintenance', ownedProducts: ['CUST-002', 'CUST-003'], delegatedProducts: [], password: 'eng123' },
    'ENG-MTN-3': { employeeId: 'ENG-MTN-3', name: 'Eng Maint C', initials: 'NC', baseRole: 'engineer', department: 'Maintenance', ownedProducts: ['CUST-004', 'CUST-006'], delegatedProducts: [], password: 'eng123' },

    // Facility Department
    'ENG-FAC-1': { employeeId: 'ENG-FAC-1', name: 'Eng Fac A', initials: 'CA', baseRole: 'engineer', department: 'Facility', ownedProducts: ['CUST-006', 'CUST-001'], delegatedProducts: [], password: 'eng123' },
    'ENG-FAC-2': { employeeId: 'ENG-FAC-2', name: 'Eng Fac B', initials: 'CB', baseRole: 'engineer', department: 'Facility', ownedProducts: ['CUST-003', 'CUST-002'], delegatedProducts: [], password: 'eng123' },
    'ENG-FAC-3': { employeeId: 'ENG-FAC-3', name: 'Eng Fac C', initials: 'CC', baseRole: 'engineer', department: 'Facility', ownedProducts: ['CUST-005', 'CUST-004'], delegatedProducts: [], password: 'eng123' },

    // ── Technicians (20) ─────────────────────────────────────────────────────
    // Test Department (4)
    'TECH-TST-1': { employeeId: 'TECH-TST-1', name: 'Tech Test 1', initials: 'T1', baseRole: 'technician', department: 'Test', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
    'TECH-TST-2': { employeeId: 'TECH-TST-2', name: 'Tech Test 2', initials: 'T2', baseRole: 'technician', department: 'Test', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
    'TECH-TST-3': { employeeId: 'TECH-TST-3', name: 'Tech Test 3', initials: 'T3', baseRole: 'technician', department: 'Test', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
    'TECH-TST-4': { employeeId: 'TECH-TST-4', name: 'Tech Test 4', initials: 'T4', baseRole: 'technician', department: 'Test', ownedProducts: [], delegatedProducts: [], password: 'tech123' },

    // Mechanic Department (4)
    'TECH-MEC-1': { employeeId: 'TECH-MEC-1', name: 'Tech Mech 1', initials: 'M1', baseRole: 'technician', department: 'Mechanic', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
    'TECH-MEC-2': { employeeId: 'TECH-MEC-2', name: 'Tech Mech 2', initials: 'M2', baseRole: 'technician', department: 'Mechanic', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
    'TECH-MEC-3': { employeeId: 'TECH-MEC-3', name: 'Tech Mech 3', initials: 'M3', baseRole: 'technician', department: 'Mechanic', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
    'TECH-MEC-4': { employeeId: 'TECH-MEC-4', name: 'Tech Mech 4', initials: 'M4', baseRole: 'technician', department: 'Mechanic', ownedProducts: [], delegatedProducts: [], password: 'tech123' },

    // Manufacturing Department (4)
    'TECH-MFG-1': { employeeId: 'TECH-MFG-1', name: 'Tech Mfg 1', initials: 'F1', baseRole: 'technician', department: 'Manufacturing', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
    'TECH-MFG-2': { employeeId: 'TECH-MFG-2', name: 'Tech Mfg 2', initials: 'F2', baseRole: 'technician', department: 'Manufacturing', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
    'TECH-MFG-3': { employeeId: 'TECH-MFG-3', name: 'Tech Mfg 3', initials: 'F3', baseRole: 'technician', department: 'Manufacturing', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
    'TECH-MFG-4': { employeeId: 'TECH-MFG-4', name: 'Tech Mfg 4', initials: 'F4', baseRole: 'technician', department: 'Manufacturing', ownedProducts: [], delegatedProducts: [], password: 'tech123' },

    // Maintenance Department (4)
    'TECH-MTN-1': { employeeId: 'TECH-MTN-1', name: 'Tech Maint 1', initials: 'N1', baseRole: 'technician', department: 'Maintenance', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
    'TECH-MTN-2': { employeeId: 'TECH-MTN-2', name: 'Tech Maint 2', initials: 'N2', baseRole: 'technician', department: 'Maintenance', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
    'TECH-MTN-3': { employeeId: 'TECH-MTN-3', name: 'Tech Maint 3', initials: 'N3', baseRole: 'technician', department: 'Maintenance', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
    'TECH-MTN-4': { employeeId: 'TECH-MTN-4', name: 'Tech Maint 4', initials: 'N4', baseRole: 'technician', department: 'Maintenance', ownedProducts: [], delegatedProducts: [], password: 'tech123' },

    // Facility Department (4)
    'TECH-FAC-1': { employeeId: 'TECH-FAC-1', name: 'Tech Fac 1', initials: 'C1', baseRole: 'technician', department: 'Facility', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
    'TECH-FAC-2': { employeeId: 'TECH-FAC-2', name: 'Tech Fac 2', initials: 'C2', baseRole: 'technician', department: 'Facility', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
    'TECH-FAC-3': { employeeId: 'TECH-FAC-3', name: 'Tech Fac 3', initials: 'C3', baseRole: 'technician', department: 'Facility', ownedProducts: [], delegatedProducts: [], password: 'tech123' },
    'TECH-FAC-4': { employeeId: 'TECH-FAC-4', name: 'Tech Fac 4', initials: 'C4', baseRole: 'technician', department: 'Facility', ownedProducts: [], delegatedProducts: [], password: 'tech123' },

    // ── Admin (1) ────────────────────────────────────────────────────────────
    'ADM001': { employeeId: 'ADM001', name: 'Admin Supachai', initials: 'AS', baseRole: 'admin', department: 'All', ownedProducts: ['*'], delegatedProducts: [], password: 'adm123' },
  };

  /* ── Role Display Names ───────────────────────────────────── */
  const ROLE_LABELS = {
    technician: 'Technician',
    engineer:   'Engineer',
    manager:    'Manager',
    admin:      'Admin',
  };

  /* ── Role Hierarchy (numeric rank for comparison) ──────────── */
  const ROLE_RANK = {
    technician: 1,
    engineer:   2,
    manager:    3,
    admin:      4,
  };

  /* ── Build Effective Permissions (Concept §8) ─────────────── */
  function buildEffectivePermissions(user) {
    const base = ROLE_DEFAULTS[user.baseRole] || [];
    const effective = new Set(base);

    // Delegated permissions (product-scoped, added globally for menu visibility)
    if (user.delegatedProducts && user.delegatedProducts.length > 0) {
      user.delegatedProducts.forEach(dp => {
        if (dp.status === 'active' && dp.permissions) {
          dp.permissions.forEach(p => effective.add(p));
        }
      });
    }

    // Manager/Admin always get dashboard
    if (ROLE_RANK[user.baseRole] >= ROLE_RANK.manager) {
      effective.add(KEYS.DASHBOARD_VIEW);
    }

    // Engineer gets dashboard if they own products
    if (user.baseRole === 'engineer' && user.ownedProducts && user.ownedProducts.length > 0) {
      effective.add(KEYS.DASHBOARD_VIEW);
    }

    return [...effective];
  }

  /* ═══════════════════════════════════════════════════════════
     can(user, permission, productId?)
     Core permission check (Concept §8)
     ═══════════════════════════════════════════════════════════ */
  function can(user, permission, productId) {
    if (!user) return false;

    // Admin can do everything
    if (user.baseRole === 'admin') return true;

    // Manager can do everything PM-related (all products)
    if (user.baseRole === 'manager') {
      const managerPerms = ROLE_DEFAULTS.manager;
      return managerPerms.includes(permission);
    }

    // Engineer — check product ownership scope
    if (user.baseRole === 'engineer') {
      const engineerPerms = ROLE_DEFAULTS.engineer;
      if (!engineerPerms.includes(permission)) return false;
      
      // If no productId specified, check if they have any ownership
      if (!productId) return user.ownedProducts && user.ownedProducts.length > 0;
      
      // Check if owns this product
      return user.ownedProducts && (
        user.ownedProducts.includes('*') || 
        user.ownedProducts.includes(productId)
      );
    }

    // Technician — check base + delegated
    if (user.baseRole === 'technician') {
      // Base technician permissions (no product scope needed)
      const techPerms = ROLE_DEFAULTS.technician;
      if (techPerms.includes(permission)) return true;

      // Check delegated permissions
      if (user.delegatedProducts && user.delegatedProducts.length > 0) {
        for (const dp of user.delegatedProducts) {
          if (dp.status !== 'active') continue;
          if (!dp.permissions || !dp.permissions.includes(permission)) continue;

          // If no productId specified, delegation grants the permission
          if (!productId) return true;
          
          // Check product match
          if (dp.productId === productId) return true;
        }
      }

      return false;
    }

    return false;
  }

  /* ── hasAnyPermission (for menu visibility) ───────────────── */
  function hasAnyPermission(user, permission) {
    // This is a simplified check for UI visibility
    // It checks if the user has this permission for ANY product
    return can(user, permission, null);
  }

  /* ── Get products user can access for a given permission ──── */
  function getAccessibleProducts(user, permission) {
    if (!user) return [];

    // Admin/Manager — all products
    if (user.baseRole === 'admin' || user.baseRole === 'manager') {
      return PRODUCTS.map(p => p.productId);
    }

    // Engineer — owned products
    if (user.baseRole === 'engineer') {
      if (user.ownedProducts.includes('*')) return PRODUCTS.map(p => p.productId);
      return user.ownedProducts.filter(id => 
        PRODUCTS.some(p => p.productId === id)
      );
    }

    // Technician — base permissions have no product scope, delegated have scope
    const techBase = ROLE_DEFAULTS.technician;
    const accessible = new Set();

    // Base permissions — accessible for all products
    if (techBase.includes(permission)) {
      PRODUCTS.forEach(p => accessible.add(p.productId));
    }

    // Delegated permissions — specific products
    if (user.delegatedProducts) {
      user.delegatedProducts.forEach(dp => {
        if (dp.status === 'active' && dp.permissions && dp.permissions.includes(permission)) {
          accessible.add(dp.productId);
        }
      });
    }

    return [...accessible];
  }

  /* ── Delegation (Concept §5–§7) ───────────────────────────── */
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  const DELEGATION_STORAGE_KEY = 'assetintel_delegations';
  const AUDIT_STORAGE_KEY = 'assetintel_audit_log';

  function loadDelegations() {
    try {
      let data = JSON.parse(localStorage.getItem(DELEGATION_STORAGE_KEY) || '[]');
      
      // Graceful Deduplication (Production-safe)
      const seen = new Set();
      const cleanedData = [];
      let hasDupes = false;
      
      for (const d of data) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          cleanedData.push(d);
        } else {
          hasDupes = true; // Found a duplicate ID
        }
      }
      
      // If corrupted data was found, quietly heal the database by saving the cleaned version
      // We NEVER wipe the entire database. We only discard the duplicate rows.
      if (hasDupes) {
        localStorage.setItem(DELEGATION_STORAGE_KEY, JSON.stringify(cleanedData));
      }
      
      return cleanedData;
    } catch { return []; }
  }

  function saveDelegations(delegations) {
    localStorage.setItem(DELEGATION_STORAGE_KEY, JSON.stringify(delegations));
  }

  function loadAuditLog() {
    try {
      return JSON.parse(localStorage.getItem(AUDIT_STORAGE_KEY) || '[]');
    } catch { return []; }
  }

  function addAuditEntry(entry) {
    const log = loadAuditLog();
    log.unshift({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(log));
  }

  function delegatePermission(delegator, targetId, productId) {
    // Validate: delegator must own the product
    if (delegator.baseRole === 'engineer') {
      if (!delegator.ownedProducts.includes(productId) && !delegator.ownedProducts.includes('*')) {
        return { success: false, error: 'You can only delegate within your owned products.' };
      }
    } else if (delegator.baseRole !== 'manager' && delegator.baseRole !== 'admin') {
      return { success: false, error: 'Only Engineer, Manager, or Admin can delegate.' };
    }

    // Validate: target role and department based on delegator role
    const targetUser = DEMO_USERS[targetId];
    if (!targetUser) return { success: false, error: 'Target user not found.' };

    if (delegator.baseRole === 'engineer') {
      if (targetUser.baseRole !== 'technician') {
        return { success: false, error: 'Engineers can only delegate to technicians.' };
      }
      if (delegator.department !== targetUser.department) {
        return { success: false, error: 'Engineers can only delegate to technicians within their own department.' };
      }
    }
    if ((delegator.baseRole === 'manager' || delegator.baseRole === 'admin') && 
        targetUser.baseRole !== 'technician' && targetUser.baseRole !== 'engineer') {
      return { success: false, error: 'Managers can only delegate to technicians or engineers.' };
    }

    // Validate: target doesn't already own the product
    if (targetUser.ownedProducts && (targetUser.ownedProducts.includes('*') || targetUser.ownedProducts.includes(productId))) {
      return { success: false, error: 'Target user already owns this product natively. No delegation needed.' };
    }

    // Create delegation
    const delegation = {
      id: `DEL-${generateUUID()}`,
      targetId,
      productId,
      delegatedBy: delegator.employeeId,
      permissionLevel: 'engineer_equivalent',
      permissions: [
        KEYS.CREATE_VIEW,
        KEYS.CREATE_SUBMIT,
        KEYS.ASSIGN_VIEW,
        KEYS.ASSIGN_SUBMIT,
        KEYS.RECORD_VIEW,
        KEYS.RECORD_SUBMIT,
        KEYS.CALENDAR_VIEW,
        KEYS.REPORTS_VIEW,
      ],
      validFrom: (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })(),
      validTo: (() => { const n = new Date(Date.now() + 30 * 86400000); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })(),
      status: 'active',
    };

    const delegations = loadDelegations();
    delegations.push(delegation);
    saveDelegations(delegations);

    // Audit log
    addAuditEntry({
      action: 'delegate_permission',
      delegatedBy: delegator.employeeId,
      delegatedTo: targetId,
      productId,
      permissions: delegation.permissions,
    });

    return { success: true, delegation };
  }

  function revokePermission(revoker, delegationId) {
    if (ROLE_RANK[revoker.baseRole] < ROLE_RANK.manager && revoker.baseRole !== 'engineer') {
      return { success: false, error: 'Insufficient permission to revoke.' };
    }

    const delegations = loadDelegations();
    const idx = delegations.findIndex(d => d.id === delegationId);
    if (idx === -1) return { success: false, error: 'Delegation not found.' };

    const del = delegations[idx];

    // Engineer can only revoke within owned products
    if (revoker.baseRole === 'engineer') {
      if (!revoker.ownedProducts.includes(del.productId) && !revoker.ownedProducts.includes('*')) {
        return { success: false, error: 'You can only revoke delegations within your owned products.' };
      }
    }

    delegations[idx].status = 'revoked';
    saveDelegations(delegations);

    // Audit log
    addAuditEntry({
      action: 'revoke_permission',
      revokedBy: revoker.employeeId,
      delegationId,
      targetId: del.targetId,
      productId: del.productId,
    });

    return { success: true };
  }

  /* ── Build Auth Response (Concept §11) ────────────────────── */
  function buildAuthResponse(employeeId) {
    const user = DEMO_USERS[employeeId];
    if (!user) return null;

    // Merge runtime delegations from localStorage
    const storedDelegations = loadDelegations().filter(
      d => d.targetId === employeeId && d.status === 'active'
    );
    
    const allDelegated = [
      ...(user.delegatedProducts || []),
      ...storedDelegations,
    ];

    const profile = {
      employeeId: user.employeeId,
      name: user.name,
      initials: user.initials,
      baseRole: user.baseRole,
      roleLabel: ROLE_LABELS[user.baseRole],
      department: user.department,
      ownedProducts: user.ownedProducts,
      delegatedProducts: allDelegated,
      permissions: buildEffectivePermissions({
        ...user,
        delegatedProducts: allDelegated,
      }),
    };

    return profile;
  }

  /* ── Authenticate (for login page) ────────────────────────── */
  function authenticate(employeeId, password) {
    const user = DEMO_USERS[employeeId];
    if (!user) return null;
    if (user.password !== password) return null;
    return buildAuthResponse(employeeId);
  }

  /* ── Public API ───────────────────────────────────────────── */
  return {
    KEYS,
    ROLE_DEFAULTS,
    ROLE_LABELS,
    ROLE_RANK,
    PRODUCTS,
    DEMO_USERS,
    can,
    hasAnyPermission,
    getAccessibleProducts,
    buildEffectivePermissions,
    buildAuthResponse,
    authenticate,
    delegatePermission,
    revokePermission,
    loadDelegations,
    loadAuditLog,
    addAuditEntry,
  };

})();
