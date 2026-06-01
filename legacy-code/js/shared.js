/* AssetIntel CMMS — shared.js — runs on every page */
document.addEventListener('DOMContentLoaded', () => {

  /* Staggered entrance */
  document.querySelectorAll('[data-enter]').forEach((el, i) => {
    el.style.animationDelay = `${i * 55}ms`;
    el.classList.add('anim-enter');
  });

  /* Sidebar: one group open at a time */
  const groups = document.querySelectorAll('.nav-group');
  groups.forEach(g => {
    g.addEventListener('toggle', () => {
      if (g.open) groups.forEach(o => { if (o !== g) o.open = false; });
    });
  });

  /* Live clock in topbar subtitle */
  const tick = () => {
    document.querySelectorAll('[data-last-updated]').forEach(el => {
      const n = new Date();
      el.textContent = `Updated ${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
    });
  };
  tick(); setInterval(tick, 60000);

  /* Relative timestamps */
  const rel = m => m < 1 ? 'Just now' : m < 60 ? `${m}m ago` : `${Math.floor(m/60)} hrs ago`;
  document.querySelectorAll('[data-minutes-ago]').forEach(el => {
    const b = parseInt(el.getAttribute('data-minutes-ago'));
    el.textContent = rel(b);
    setInterval(() => el.textContent = rel(b), 60000);
  });

  /* Shared tooltip for any [data-tip] element */
  const tip = document.createElement('div');
  tip.className = 'tip';
  document.body.appendChild(tip);
  let mh = null;
  document.querySelectorAll('[data-tip]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      tip.textContent = el.getAttribute('data-tip');
      tip.classList.add('visible');
      mh = e => { tip.style.left = (e.clientX+12)+'px'; tip.style.top = (e.clientY-34)+'px'; };
      document.addEventListener('mousemove', mh);
    });
    el.addEventListener('mouseleave', () => {
      tip.classList.remove('visible');
      if (mh) { document.removeEventListener('mousemove', mh); mh = null; }
    });
  });

});
