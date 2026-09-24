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
 */
(function () {
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
      ['chocolate-admin.html', '🔐', 'Chocolate Admin'],
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
      ['flower-admin.html', '🔐', 'Flower Admin'],
      ['flower-odoo-import.html', '📥', 'Odoo Price Import'],
      ['flower-guide.html', '📖', 'Flower Guide']
    ]},
    item: { title: 'Item Inventory', home: 'item-inventory.html', homeLabel: 'Item Inventory', items: [
      ['item-inventory.html', '📦', 'Item Inventory'],
      ['item-dashboard.html', '📊', 'Item Dashboard'],
      ['item-admin.html', '🔐', 'Item Admin'],
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
    ['index.html', '🍫', 'Chocolate'],
    ['flower-tools.html', '🌸', 'Flower'],
    ['item-inventory.html', '📦', 'Item Inv.']
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

  function isAdmin() {
    try {
      const u = JSON.parse(sessionStorage.getItem('lalabellaUser') || localStorage.getItem('lalabellaUser') || '{}') || {};
      return String(u.role || '').toLowerCase() === 'admin';
    } catch (e) { return false; }
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
    const mod = MODULES[moduleOf(page)];
    let html = '<div class="' + esc(hubClass) + '">' +
      HUB.map(h => '<a href="' + h[0] + '"' + (h[0] === page ? ' class="lb-menu-active"' : '') +
        '><span class="hub-icon">' + h[1] + '</span>' + esc(h[2]) + '</a>').join('') + '</div>';

    // Home keeps id="chocoHomeLink" — some pages' own scripts look it up.
    const home = mod ? [mod.home, mod.homeLabel] : ['index.html', 'Home'];
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
  document.querySelectorAll('[data-lb-menu]').forEach(render);
})();
