/* =============================================================
   AssetIntel CMMS — Dashboard JS  v1.0.1
   Lexus concept: every detail deliberate, nothing accidental.
   ============================================================= */

document.addEventListener('DOMContentLoaded', () => {

  // ── 1. Staggered page entrance ──────────────────────────
  // Cards reveal sequentially — like Lexus ambient lighting
  // coming on one zone at a time when you unlock the car.
  const enterEls = document.querySelectorAll('[data-enter]');
  enterEls.forEach((el, i) => {
    el.style.animationDelay = `${i * 60}ms`;
    el.classList.add('anim-enter');
  });


  // ── 2. Health bar fill animation ────────────────────────
  // Bars fill left-to-right on load with staggered delay.
  // Target widths are set as data-width attributes in HTML.
  const healthBars = document.querySelectorAll('.health-bar-fill[data-width]');
  healthBars.forEach((bar, i) => {
    const targetWidth = bar.getAttribute('data-width');
    const pct = parseInt(targetWidth);
    const color = pct >= 70 ? 'var(--success-mid)' : pct >= 50 ? 'var(--warning-mid)' : 'var(--error-mid)';
    bar.style.background = color;

    setTimeout(() => {
      bar.style.transition = `width 700ms cubic-bezier(0.16, 1, 0.3, 1)`;
      bar.style.width = targetWidth;
    }, 400 + i * 80);
  });


  // ── 3. Sidebar: one group open at a time ────────────────
  const navGroups = document.querySelectorAll('.nav-group');
  navGroups.forEach(group => {
    group.addEventListener('toggle', () => {
      if (group.open) {
        navGroups.forEach(other => {
          if (other !== group) other.open = false;
        });
      }
    });
  });


  // ── 4. Bar chart tooltips ────────────────────────────────
  // One shared tooltip element, repositions on mousemove.
  const tip = document.createElement('div');
  tip.className = 'bar-tip';
  document.body.appendChild(tip);

  let tipMoveHandler = null;

  document.querySelectorAll('.bar[data-tip]').forEach(bar => {
    bar.addEventListener('mouseenter', () => {
      tip.textContent = bar.getAttribute('data-tip');
      tip.classList.add('visible');

      tipMoveHandler = (e) => {
        tip.style.left = (e.clientX + 12) + 'px';
        tip.style.top  = (e.clientY - 34) + 'px';
      };
      document.addEventListener('mousemove', tipMoveHandler);
    });
    bar.addEventListener('mouseleave', () => {
      tip.classList.remove('visible');
      if (tipMoveHandler) {
        document.removeEventListener('mousemove', tipMoveHandler);
        tipMoveHandler = null;
      }
    });
  });


  // ── 5. Live timestamp ────────────────────────────────────
  const updateTime = () => {
    const el = document.querySelector('[data-last-updated]');
    if (!el) return;
    const now  = new Date();
    const hh   = now.getHours().toString().padStart(2, '0');
    const mm   = now.getMinutes().toString().padStart(2, '0');
    el.textContent = `Updated ${hh}:${mm}`;
  };
  updateTime();
  setInterval(updateTime, 60_000);


  // ── 6. Relative timestamps in activity stream ────────────
  const relTime = (minutesAgo) => {
    if (minutesAgo < 1)  return 'Just now';
    if (minutesAgo < 60) return `${minutesAgo}m ago`;
    const h = Math.floor(minutesAgo / 60);
    return h === 1 ? '1 hr ago' : `${h} hrs ago`;
  };

  document.querySelectorAll('[data-minutes-ago]').forEach(el => {
    const base = parseInt(el.getAttribute('data-minutes-ago'));
    const update = () => { el.textContent = relTime(base); };
    update();
    setInterval(update, 60_000);
  });


  // ── 7. New Work Order CTA ────────────────────────────────
  document.querySelector('[data-action="new-wo"]')?.addEventListener('click', () => {
    // TODO: open slide-over panel in v1.1.0
    console.log('New WO modal — v1.1.0');
  });


  // ── 8. WO table row — navigate on click ──────────────────
  document.querySelectorAll('.wo-table tbody tr[data-wo-id]').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.getAttribute('data-wo-id');
      // TODO: navigate to work-order-detail.html?id= in v1.1.0
      console.log(`Navigate to WO: ${id}`);
    });
  });

});
