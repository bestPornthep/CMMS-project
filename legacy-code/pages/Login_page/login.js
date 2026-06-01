document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-enter]').forEach((el, i) => {
    el.style.animationDelay = `${i * 55}ms`;
    el.classList.add('anim-enter');
  });

  const AUTH_KEY = 'assetintel_auth';
  const REDIRECT_KEY = 'assetintel_redirect_after_login';

  /*
    IMPORTANT PATH RULE:
    login.html is inside /Login_page/
    PM pages and dashboard are one level above /Login_page/
  */
  const APP_ROOT = new URL('../', window.location.href);
  const DEFAULT_REDIRECT = new URL('pm-assign.html', APP_ROOT).href;

  const form = document.getElementById('loginForm');
  const user = document.getElementById('user');
  const pass = document.getElementById('pass');
  const alertBox = document.getElementById('alert');
  const togglePassword = document.getElementById('togglePassword');

  function safeParse(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function resolveRedirectTarget(savedTarget) {
    if (!savedTarget) return DEFAULT_REDIRECT;

    /*
      If saved target is "/pm-assign.html",
      resolve from origin.
    */
    if (savedTarget.startsWith('/')) {
      return new URL(savedTarget, window.location.origin).href;
    }

    /*
      If saved target is "pm-assign.html",
      resolve from APP_ROOT, not from /Login_page/
    */
    return new URL(savedTarget, APP_ROOT).href;
  }

  const existingAuth = safeParse(localStorage.getItem(AUTH_KEY));

  if (existingAuth?.loggedIn) {
    const savedTarget = localStorage.getItem(REDIRECT_KEY);
    localStorage.removeItem(REDIRECT_KEY);

    // Rebuild profile to get latest permissions
    if (typeof AssetIntelPermissions !== 'undefined') {
      const profile = AssetIntelPermissions.buildAuthResponse(existingAuth.employeeId);
      if (profile) {
        // Determine best redirect based on role
        const target = resolveRedirectForRole(profile, savedTarget);
        window.location.href = target;
        return;
      }
    }

    window.location.href = resolveRedirectTarget(savedTarget);
    return;
  }

  /* ── Determine best default page for role ───────────────── */
  function resolveRedirectForRole(profile, savedTarget) {
    // If there's a saved target, validate user can access it
    if (savedTarget) {
      const pagePermMap = {
        'dashboard.html': 'pm.dashboard.view',
        'pm-create.html': 'pm.create.view',
        'pm-assign.html': 'pm.assign.view',
        'pm-record.html': 'pm.record.view',
        'pm-calendar.html': 'pm.calendar.view',
        'pm-reports.html': 'pm.reports.view',
      };

      const filename = savedTarget.split('/').pop();
      const requiredPerm = pagePermMap[filename];

      if (!requiredPerm || profile.permissions.includes(requiredPerm)) {
        return resolveRedirectTarget(savedTarget);
      }
    }

    // Default page by role
    const defaults = {
      admin:      'dashboard.html',
      manager:    'dashboard.html',
      engineer:   'pm-create.html',
      technician: 'pm-record.html',
    };

    const defaultPage = defaults[profile.baseRole] || 'pm-record.html';
    return new URL(defaultPage, APP_ROOT).href;
  }

  function showAlert(message, type = 'error') {
    alertBox.classList.remove('show');

    alertBox.style.background =
      type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)';

    alertBox.style.color =
      type === 'success' ? 'var(--success-text)' : 'var(--error-text)';

    alertBox.textContent = message;

    requestAnimationFrame(() => {
      alertBox.classList.add('show');
    });
  }

  togglePassword?.addEventListener('click', () => {
    const isHidden = pass.type === 'password';

    pass.type = isHidden ? 'text' : 'password';

    togglePassword.innerHTML = `
      <span class="material-symbols-outlined">
        ${isHidden ? 'visibility_off' : 'visibility'}
      </span>
    `;

    togglePassword.setAttribute(
      'aria-label',
      isHidden ? 'Hide password' : 'Show password'
    );

    togglePassword.setAttribute(
      'title',
      isHidden ? 'Hide password' : 'Show password'
    );
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const employeeId = user.value.trim();
    const password = pass.value.trim();

    if (!employeeId || !password) {
      showAlert('Please enter Employee ID and Password.', 'error');
      return;
    }

    /* ── Use Permission Engine to authenticate ───────────── */
    let profile = null;

    if (typeof AssetIntelPermissions !== 'undefined') {
      profile = AssetIntelPermissions.authenticate(employeeId, password);
    }

    if (!profile) {
      showAlert('Invalid Employee ID or Password.', 'error');
      pass.value = '';
      pass.focus();
      return;
    }

    /* ── Store rich auth data (Concept §11) ──────────────── */
    localStorage.setItem(
      AUTH_KEY,
      JSON.stringify({
        loggedIn: true,
        employeeId: profile.employeeId,
        name: profile.name,
        initials: profile.initials,
        baseRole: profile.baseRole,
        roleLabel: profile.roleLabel,
        role: profile.roleLabel,
        ownedProducts: profile.ownedProducts,
        delegatedProducts: profile.delegatedProducts,
        permissions: profile.permissions,
        loginAt: new Date().toISOString()
      })
    );

    showAlert(`Welcome, ${profile.name}! Redirecting...`, 'success');

    const savedTarget = localStorage.getItem(REDIRECT_KEY);
    const target = resolveRedirectForRole(profile, savedTarget);

    localStorage.removeItem(REDIRECT_KEY);

    setTimeout(() => {
      window.location.href = target;
    }, 600);
  });
});