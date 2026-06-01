/* ═══════════════════════════════════════════════════════════════
   AssetIntel PM — auth-guard.js
   Runs on every page (except login). Handles:
   1. Auth check — redirect to login if not authenticated
   2. Sidebar visibility — hide/show nav items based on permissions
   3. User card — display current user info + sign out
   4. Action buttons — hide/show based on permissions
   5. Role badge — show current role in topbar
   ═══════════════════════════════════════════════════════════════ */

const AssetIntelAuth = (() => {
  const AUTH_KEY = 'assetintel_auth';
  const REDIRECT_KEY = 'assetintel_redirect_after_login';

  /* ── Get Login Page Path (relative to current page) ───────── */
  function getLoginPath() {
    const path = window.location.pathname;
    if (path.includes('/Login_page/') || path.endsWith('Login_page') || path.endsWith('login.html')) {
      return 'login.html';
    }
    return 'Login_page/login.html';
  }

  /* ── Check Auth ───────────────────────────────────────────── */
  function getStoredAuth() {
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function requireAuth() {
    const auth = getStoredAuth();
    if (!auth?.loggedIn) {
      localStorage.setItem(REDIRECT_KEY, window.location.pathname.split('/').pop());
      window.location.href = getLoginPath();
      return null;
    }
    return auth;
  }

  /* ── Get Current User Profile (with full permissions) ─────── */
  function getCurrentUser() {
    const auth = getStoredAuth();
    if (!auth?.loggedIn || !auth.employeeId) return null;

    // Build full profile using permission engine
    if (typeof AssetIntelPermissions !== 'undefined') {
      return AssetIntelPermissions.buildAuthResponse(auth.employeeId);
    }

    // Fallback: return stored auth data
    return auth;
  }

  /* ── Sign Out ─────────────────────────────────────────────── */
  function signOut() {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(REDIRECT_KEY);
    window.location.href = getLoginPath();
  }

  /* ── Apply Sidebar Permissions ────────────────────────────── */
  function applySidebarPermissions(user) {
    if (!user) return;

    const permissionMap = {
      'pm.dashboard.view': ['dashboard.html'],
      'pm.create.view':    ['pm-create.html'],
      'pm.assign.view':    ['pm-assign.html'],
      'pm.record.view':    ['pm-record.html'],
      'pm.calendar.view':  ['pm-calendar.html'],
      'pm.reports.view':   ['pm-reports.html'],
      'pm.audit.view':     ['pm-audit.html'],
    };

    // Find all nav links in sidebar
    const navLinks = document.querySelectorAll('.sidebar-nav a');

    navLinks.forEach(link => {
      const href = link.getAttribute('href') || '';
      const filename = href.split('/').pop();

      // Check if this link has a permission requirement
      // First check data-permission attribute
      const dataPerm = link.getAttribute('data-permission');
      if (dataPerm) {
        if (!user.permissions.includes(dataPerm)) {
          link.style.display = 'none';
        } else {
          link.style.display = '';
        }
        return;
      }

      // Fallback: match by href filename
      for (const [perm, files] of Object.entries(permissionMap)) {
        if (files.some(f => filename === f || filename.endsWith(f))) {
          if (!user.permissions.includes(perm)) {
            link.style.display = 'none';
          } else {
            link.style.display = '';
          }
          break;
        }
      }
    });

    // Also hide section labels if all their items are hidden
    const navLabels = document.querySelectorAll('.nav-label');
    navLabels.forEach(label => {
      let nextEl = label.nextElementSibling;
      let hasVisible = false;

      while (nextEl && !nextEl.classList.contains('nav-label') && !nextEl.classList.contains('nav-divider')) {
        if (nextEl.style.display !== 'none' && (nextEl.classList.contains('nav-item') || nextEl.classList.contains('pm-subitem'))) {
          hasVisible = true;
        }
        nextEl = nextEl.nextElementSibling;
      }

      // Don't hide Overview label, always show it if Dashboard is visible
      if (!hasVisible && label.textContent.trim() !== 'Overview') {
        // Check items after divider too
      }
    });
  }

  /* ── Update User Card in Sidebar Footer ───────────────────── */
  function updateUserCard(user) {
    if (!user) return;

    document.querySelectorAll('.user-card').forEach(card => {
      const avatarEl = card.querySelector('.user-avatar');
      const nameEl = card.querySelector('.user-name');
      const roleEl = card.querySelector('.user-role');

      if (avatarEl) avatarEl.textContent = user.initials || user.name?.charAt(0) || '?';
      if (nameEl) nameEl.textContent = user.name || 'Unknown';
      if (roleEl) roleEl.textContent = user.roleLabel || user.baseRole || 'User';

      card.dataset.label = `${user.name} · ${user.roleLabel} · Click to sign out`;

      // Add sign-out handler (only once)
      if (!card.dataset.authBound) {
        card.dataset.authBound = 'true';
        card.addEventListener('click', () => {
          if (confirm('Sign out?')) signOut();
        });
      }
    });
  }

  /* ── Hide Action Buttons Based on Permissions ─────────────── */
  function applyActionPermissions(user) {
    if (!user) return;

    // Hide elements with data-require-permission
    document.querySelectorAll('[data-require-permission]').forEach(el => {
      const perm = el.getAttribute('data-require-permission');
      if (!user.permissions.includes(perm)) {
        el.style.display = 'none';
      }
    });

    // Hide "New PM" button on dashboard for technicians without create permission
    if (!user.permissions.includes('pm.create.view')) {
      document.querySelectorAll('a[href*="pm-create"]').forEach(btn => {
        if (btn.classList.contains('btn')) {
          btn.style.display = 'none';
        }
      });
    }
  }

  /* ── Add Role Badge to Topbar ─────────────────────────────── */
  function addRoleBadge(user) {
    if (!user) return;

    const topbarRight = document.querySelector('.topbar-right');
    if (!topbarRight) return;

    // Don't add if already exists
    if (document.getElementById('roleBadge')) return;

    const badgeColors = {
      technician: 'badge-info',
      engineer:   'badge-blue',
      manager:    'badge-warning',
      admin:      'badge-error',
    };

    const badge = document.createElement('span');
    badge.id = 'roleBadge';
    badge.className = `badge ${badgeColors[user.baseRole] || 'badge-neutral'}`;
    badge.style.marginRight = '4px';
    badge.style.fontSize = '10px';
    badge.style.letterSpacing = '0.5px';
    badge.style.textTransform = 'uppercase';
    badge.style.fontWeight = '700';
    badge.textContent = user.roleLabel || user.baseRole;

    // Add delegation indicator
    if (user.delegatedProducts && user.delegatedProducts.length > 0) {
      const delCount = user.delegatedProducts.filter(d => d.status === 'active').length;
      if (delCount > 0) {
        badge.textContent += ` +${delCount} delegated`;
      }
    }

    topbarRight.insertBefore(badge, topbarRight.firstChild);
  }

  /* ── Page-Level Guard ─────────────────────────────────────── */
  function guardPage(requiredPermission) {
    const user = getCurrentUser();
    if (!user) return false;

    if (requiredPermission && !user.permissions.includes(requiredPermission)) {
      // Redirect to a page the user CAN access
      const fallbacks = [
        { perm: 'pm.record.view',   page: 'pm-record.html' },
        { perm: 'pm.calendar.view', page: 'pm-calendar.html' },
        { perm: 'pm.dashboard.view', page: 'dashboard.html' },
      ];

      for (const fb of fallbacks) {
        if (user.permissions.includes(fb.perm)) {
          window.location.href = fb.page;
          return false;
        }
      }

      // Last resort
      signOut();
      return false;
    }

    return true;
  }

  /* ── Initialize (call on DOMContentLoaded) ────────────────── */
  function init(pagePermission) {
    const auth = requireAuth();
    if (!auth) return null;

    const user = getCurrentUser();
    if (!user) {
      // Inconsistent state: loggedIn is true but profile is invalid.
      // Force sign out to clean localStorage and redirect to login.
      signOut();
      return null;
    }

    // Guard the current page
    if (pagePermission && !guardPage(pagePermission)) return null;

    // Apply UI changes
    applySidebarPermissions(user);
    updateUserCard(user);
    applyActionPermissions(user);
    addRoleBadge(user);

    return user;
  }

  /* ── Public API ───────────────────────────────────────────── */
  return {
    AUTH_KEY,
    REDIRECT_KEY,
    getStoredAuth,
    requireAuth,
    getCurrentUser,
    signOut,
    applySidebarPermissions,
    updateUserCard,
    applyActionPermissions,
    addRoleBadge,
    guardPage,
    init,
  };

})();
