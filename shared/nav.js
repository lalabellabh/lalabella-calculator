/**
 * LALABELLA NAV — the ONE menu definition for every page's burger drawer.
 *
 * To add a new page to the menu: add ONE line to MODULES or QUICK below.
 * Every page updates automatically.
 *
 * How a page uses it: inside its drawer, put
 *   <div data-lb-menu></div>
 *   <script src="shared/nav.js"></script>
 * right after it (synchronous, so the links exist before the page's own
 * scripts run). Optional attributes on the div adapt it to the page's
 * drawer styling:  data-hub-class="…"  data-title-class="…"  data-icon-class="…"
 * Needs shared/config.js (for Log Out).
 *
 * STANDALONE MODE — for pages without their own drawer, just put
 *   <script src="shared/nav.js" data-standalone></script>
 * right after <body>. nav.js then adds its own ☰ button + drawer.
 * Optional: data-side="right" puts the ☰ button on the right,
 *           data-top="70" moves it down (px) if something sits in the corner,
 *           data-shift=".topbar" adds left padding to those elements so the
 *           ☰ button doesn't cover them. "← Back" links (.back-link / #backLink)
 *           are nudged right automatically.
 */
(function () {
  const selfScript = document.currentScript;
  // ---- Module menus (shown on pages of that module) ----
  const MODULES = {
    chocolate: { title: 'Chocolate Tools', home: 'index.html', homeLabel: 'Chocolate Home', items: [
      ['dashboard.html', '📊', 'Dashboard'],
      ['chocolate-receiving.html', '📥', 'Receiving'],
      ['chocolate-release.html', '📤', 'Release'],
      ['stock-count.html', '📋', 'Stock Count'],
      ['stock-approval.html', '✅', 'Stock Approval'],
      ['chocolate-arrangements.html', '🎁', 'Chocolate Arrangements'],
      ['chocolate-barcode.html', '🏷️', 'Barcode'],
      ['chocolate-calc.html', '🍫', 'Chocolate Calculator'],
      ['chocolate-admin.html', '🔐', 'Chocolate Admin', 'admin'],
      ['chocolate-odoo-import.html', '📥', 'Odoo Price Import'],
      ['chocolate-guide.html', '📖', 'Chocolate Guide']
    ]},
    flower: { title: 'Flower Tools', home: 'flower-tools.html', homeLabel: 'Flower Tools', items: [
      ['flower-dashboard.html', '📊', 'Dashboard'],
      ['flower-receiving.html', '🛒', 'Flower Receiving'],
      ['flower-purchase.html', '🧾', 'Flower Purchase'],
      ['flower-stock-count.html', '📋', 'Stock Count'],
      ['flower-catalog.html', '📚', 'Flower Catalog'],
      ['flower-arrangements.html', '💐', 'Flower Arrangements'],
      ['flower-transfer.html', '🔄', 'Flower Transfer'],
      ['flower-barcode.html', '🏷️', 'Barcode'],
      ['flower-calc.html', '🧮', 'Flower Calculator'],
      ['flower-admin.html', '🔐', 'Flower Admin', 'admin'],
      ['flower-odoo-import.html', '📥', 'Odoo Price Import'],
      ['flower-guide.html', '📖', 'Flower Guide']
    ]},
    item: { title: 'Item Inventory', home: 'item-inventory.html', homeLabel: 'Item Inventory', items: [
      ['item-inventory.html', '📦', 'Item Inventory'],
      ['item-dashboard.html', '📊', 'Item Dashboard'],
      ['item-admin.html', '🔐', 'Item Admin', 'admin'],
      ['item-odoo-import.html', '📥', 'Odoo Price Import']
    ]}
  };

  // ---- Quick tools (shown on every page). 4th value 'admin' = only Admins see it ----
  const QUICK = [
    ['nova-command-center.html', '🎙️', 'NOVA'],
    ['schedule.html', '📆', 'Duty Schedule'],
    ['profile.html', '👤', 'My Profile'],
    ['petty-cash.html', '💰', 'Petty Cash & Cash'],
    ['notes.html', '📝', 'Notes'],
    ['order-form.html', '🧾', 'Order Form'],
    ['card-print.html', '💌', 'Card Print'],
    ['seeds-card.html', '🌱', 'Seeds of Success Card'],
    ['branch-config.html', '📍', 'Branch Config'],
    ['user-admin.html', '👥', 'User Management', 'admin'],
    ['https://web.whatsapp.com/', '💬', 'WhatsApp Web']
  ];

  // Pages that show a "Back" link based on ?from=<page they came from>.
  const FROM_AWARE = ['notes.html', 'order-form.html', 'card-print.html', 'branch-config.html',
    'flower-guide.html', 'chocolate-guide.html'];

  const HUB = [
    ['index.html', '🍫', 'Chocolate', 'chocolate'],
    ['flower-tools.html', '🌸', 'Flower', 'flower'],
    ['item-inventory.html', '📦', 'Item Inv.', 'item']
  ];

  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const stem = page.replace(/\.html$/, '');

  function moduleOf(p) {
    if (p === 'index.html' || p === 'dashboard.html' || p.indexOf('chocolate-') === 0 ||
        p === 'stock-count.html' || p === 'stock-approval.html' || p === 'initial-stock.html') return 'chocolate';
    if (p.indexOf('flower-') === 0) return 'flower';
    if (p.indexOf('item-') === 0) return 'item';
    return null;
  }

  function currentUser() {
    try {
      return window.LALABELLA_USER ||
        JSON.parse(sessionStorage.getItem('lalabellaUser') || localStorage.getItem('lalabellaUser') || '{}') || {};
    } catch (e) { return {}; }
  }
  function isAdmin() { return String(currentUser().role || '').toLowerCase() === 'admin'; }

  // Menu sections for this person's Position (set by an admin in User
  // Management). null/missing = everything. Admins always see everything.
  // Only tidies the menu — it is not a permission.
  function moduleAllowed(key) {
    if (!key || isAdmin()) return true;
    const mods = currentUser().modules;
    return !Array.isArray(mods) || mods.indexOf(key) !== -1;
  }
  // Hiding is only for tidiness — admin pages are also checked on the server.
  const visible = i => i[3] !== 'admin' || isAdmin();

  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  let iconClass = '';
  function icon_(i) { return iconClass ? '<span class="' + esc(iconClass) + '">' + i + '</span>' : i + ' '; }

  function link(href, icon, label, extra) {
    const external = /^https?:/i.test(href);
    let url = href;
    if (!external && FROM_AWARE.indexOf(href) !== -1) url += '?from=' + encodeURIComponent(stem);
    const active = !external && href.toLowerCase() === page;
    return '<a href="' + esc(url) + '"' + (external ? ' target="_blank" rel="noopener"' : '') +
      (active ? ' class="active lb-menu-active" aria-current="page"' : '') + (extra || '') + '>' +
      icon_(icon) + esc(label) + '</a>';
  }

  function logout() {
    const token = sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || '';
    // Also end the session on the server, not just in this browser.
    if (token && window.LB_CONFIG) {
      try { fetch(LB_CONFIG.AUTH_API + '?action=logout&token=' + encodeURIComponent(token), { keepalive: true }).catch(() => {}); } catch (e) {}
    }
    ['lalabellaToken', 'lalabellaUser', 'lalabellaVerifiedToken', 'lalabellaVerifiedAt'].forEach(k => {
      sessionStorage.removeItem(k); localStorage.removeItem(k);
    });
    location.href = 'index.html';
  }
  window.lbLogout = logout;

  function render(el) {
    const hubClass = el.getAttribute('data-hub-class') || 'choco-hub-grid';
    const titleClass = el.getAttribute('data-title-class') || 'choco-drawer-title';
    iconClass = el.getAttribute('data-icon-class') || '';
    const modKey = moduleOf(page);
    const mod = moduleAllowed(modKey) ? MODULES[modKey] : null;
    const hub = HUB.filter(h => moduleAllowed(h[3]));
    let html = (hub.length ? '<div class="' + esc(hubClass) + '">' : '') +
      hub.map(h => '<a href="' + h[0] + '"' + (h[0] === page ? ' class="lb-menu-active"' : '') +
        '><span class="hub-icon">' + h[1] + '</span>' + esc(h[2]) + '</a>').join('') + (hub.length ? '</div>' : '');

    // Home keeps id="chocoHomeLink" — some pages' own scripts look it up.
    const firstHub = hub[0] || HUB[0];
    const home = mod ? [mod.home, mod.homeLabel] : [firstHub[0], 'Home'];
    html += '<a href="' + home[0] + '" id="chocoHomeLink">' + icon_('🏠') + esc(home[1]) + '</a>';

    if (mod) {
      html += '<div class="' + esc(titleClass) + '">' + esc(mod.title) + '</div>';
      html += mod.items.filter(visible).map(i => link(i[0], i[1], i[2])).join('');
    }
    html += '<div class="' + esc(titleClass) + '">Quick Tools</div>';
    html += QUICK.filter(visible).map(i => link(i[0], i[1], i[2])).join('');
    html += '<a href="#" data-lb-logout>' + icon_('🚪') + 'Log Out</a>';

    el.innerHTML = html;
    el.style.display = 'contents';   // links stay direct flex children of the drawer
    el.querySelector('[data-lb-logout]').addEventListener('click', e => { e.preventDefault(); logout(); });
  }

  if (!document.getElementById('lb-nav-style')) {
    const st = document.createElement('style');
    st.id = 'lb-nav-style';
    st.textContent = '[data-lb-menu] a.lb-menu-active{font-weight:700;box-shadow:inset 3px 0 0 currentColor;}';
    document.head.appendChild(st);
  }
  // ---- Standalone drawer (pages that don't have their own) ----
  if (selfScript && selfScript.hasAttribute('data-standalone') && !document.getElementById('lbnavDrawer')) {
    const side = selfScript.getAttribute('data-side') === 'right' ? 'right' : 'left';
    const top = parseInt(selfScript.getAttribute('data-top'), 10) || 14;
    const css = document.createElement('style');
    css.id = 'lbnav-standalone-style';
    css.textContent = [
      '.lbnav-btn{position:fixed;top:' + top + 'px;' + side + ':14px;z-index:99990;width:42px;height:42px;border-radius:12px;border:1px solid rgba(158,47,74,.18);background:rgba(255,255,255,.94);color:#9e2f4a;font-size:20px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 5px 16px rgba(60,30,40,.16);backdrop-filter:blur(6px);padding:0;font-family:inherit}',
      '.lbnav-btn:hover{background:#9e2f4a;color:#fff}',
      '.lbnav-backdrop{position:fixed;inset:0;z-index:99991;background:rgba(40,20,28,.35);backdrop-filter:blur(3px);opacity:0;pointer-events:none;transition:opacity .2s}',
      '.lbnav-backdrop.show{opacity:1;pointer-events:auto}',
      '.lbnav-drawer{position:fixed;top:0;bottom:0;left:0;width:min(310px,82vw);z-index:99992;background:#fdfbf9;border-right:1px solid #eee2e0;box-shadow:12px 0 40px rgba(60,30,40,.18);transform:translateX(-102%);transition:transform .25s ease;padding:18px 14px 24px;display:flex;flex-direction:column;gap:2px;overflow-y:auto;font-family:"Space Grotesk",system-ui,sans-serif;text-align:left}',
      '.lbnav-drawer.show{transform:none}',
      '.lbnav-close{align-self:flex-end;background:none;border:0;font-size:22px;color:#9a8a8e;cursor:pointer;padding:2px 8px;margin-bottom:4px}',
      '.lbnav-drawer .lbnav-hub{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:10px}',
      '.lbnav-drawer .lbnav-hub a{flex-direction:column;justify-content:center;text-align:center;gap:4px;padding:12px 4px;min-height:72px;font-size:11px;background:#fff;border:1px solid #eee2e0}',
      '.lbnav-drawer .hub-icon{font-size:20px}',
      '.lbnav-drawer a{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;color:#3a2a2e;text-decoration:none;font-size:14px;font-weight:600;line-height:1.3}',
      '.lbnav-drawer a:hover{background:rgba(201,80,107,.09);color:#9e2f4a}',
      '.lbnav-drawer a.active{background:#9e2f4a;color:#fff}',
      '.lbnav-drawer .lbnav-title{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#9e2f4a;font-weight:700;margin:10px 12px 4px}',
      '@media print{.lbnav-btn,.lbnav-backdrop,.lbnav-drawer{display:none!important}}',
      // keep the top-left "← Back" link clear of the ☰ button
      (side === 'left' ? '.back-link,#backLink{margin-left:52px!important}' : '')
    ].join('\n');
    const shift = selfScript.getAttribute('data-shift');
    if (shift && side === 'left') css.textContent += '\n' + shift + '{padding-left:60px!important}';
    document.head.appendChild(css);

    const btn = document.createElement('button');
    btn.className = 'lbnav-btn'; btn.type = 'button'; btn.setAttribute('aria-label', 'Open menu'); btn.textContent = '☰';
    const back = document.createElement('div'); back.className = 'lbnav-backdrop';
    const drawer = document.createElement('nav'); drawer.className = 'lbnav-drawer'; drawer.id = 'lbnavDrawer';
    drawer.innerHTML = '<button type="button" class="lbnav-close" aria-label="Close menu">✕</button>' +
      '<div data-lb-menu data-hub-class="lbnav-hub" data-title-class="lbnav-title"></div>';
    const mount = () => { document.body.appendChild(back); document.body.appendChild(drawer); document.body.appendChild(btn); };
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

    const open = () => { drawer.classList.add('show'); back.classList.add('show'); };
    const close = () => { drawer.classList.remove('show'); back.classList.remove('show'); };
    btn.addEventListener('click', () => drawer.classList.contains('show') ? close() : open());
    back.addEventListener('click', close);
    drawer.querySelector('.lbnav-close').addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  function renderAll() { document.querySelectorAll('[data-lb-menu]').forEach(render); }
  window.lbRenderMenu = renderAll;
  renderAll();
  // The menu is drawn before login finishes (e.g. logging in on the home
  // page), so redraw whenever the signed-in user changes — otherwise
  // admin-only links would stay hidden until a full reload.
  window.addEventListener('lb:user-changed', renderAll);
  window.addEventListener('storage', e => { if (e.key === 'lalabellaUser') renderAll(); });
})();
