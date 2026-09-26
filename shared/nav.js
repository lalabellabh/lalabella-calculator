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
 * ⚙️ SETTINGS (bottom of every menu, per device — saved in localStorage):
 *   - Appearance: Light / Dark / Auto (uses shared/theme.js)
 *   - Edit Menu: hide/show, reorder, or add links to this module's section
 *     and to Quick Tools (key "lbMenuPrefs"). Admin-only links and the
 *     Position filter still apply on top of this.
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

  // ---- Per-device menu customisation (⚙️ Settings → Edit Menu) ----
  // lbMenuPrefs = { <section>: { order:[href…], hidden:[href…], added:[href…] } }
  // sections: 'chocolate' | 'flower' | 'item' | 'quick'
  const PREFS_KEY = 'lbMenuPrefs';
  const REG = {};                               // href -> { item, module }
  Object.keys(MODULES).forEach(k => MODULES[k].items.forEach(i => { if (!REG[i[0]]) REG[i[0]] = { item: i, module: k }; }));
  QUICK.forEach(i => { if (!REG[i[0]]) REG[i[0]] = { item: i, module: null }; });

  function readPrefs() {
    try { const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); return p && typeof p === 'object' ? p : {}; }
    catch (e) { return {}; }
  }
  function writePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {} }
  function sectionDefaults(key) { return key === 'quick' ? QUICK : (MODULES[key] ? MODULES[key].items : []); }
  function itemAllowed(i) { return visible(i) && moduleAllowed(REG[i[0]] ? REG[i[0]].module : null); }

  // The section's items in the user's order, each marked hidden or not
  // (only items this person is allowed to see).
  function arranged(key) {
    const p = readPrefs()[key] || {};
    const defaults = sectionDefaults(key);
    const list = defaults.slice();
    (p.added || []).forEach(h => { if (REG[h] && !list.some(i => i[0] === h)) list.push(REG[h].item); });
    if (Array.isArray(p.order)) {
      const pos = h => { const k = p.order.indexOf(h); return k === -1 ? 1e6 : k; };
      const orig = list.slice();
      list.sort((a, b) => (pos(a[0]) - pos(b[0])) || (orig.indexOf(a) - orig.indexOf(b)));
    }
    const hidden = p.hidden || [];
    return list.filter(itemAllowed).map(i => ({ item: i, hidden: hidden.indexOf(i[0]) !== -1,
      added: !defaults.some(d => d[0] === i[0]) }));
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
    // Saved dashboard snapshots (instant-load cache) belong to this login only.
    try { Object.keys(localStorage).filter(k => k.indexOf('lbDash:') === 0).forEach(k => localStorage.removeItem(k)); } catch (e) {}
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

    const shown = [];
    if (mod) {
      const items = arranged(modKey).filter(x => !x.hidden).map(x => withOrigin(x, modKey));
      items.forEach(i => shown.push(i[0]));
      html += '<div class="' + esc(titleClass) + '">' + esc(mod.title) + '</div>';
      html += items.map(i => link(i[0], i[1], i[2])).join('');
    }
    const quick = arranged('quick').filter(x => !x.hidden && shown.indexOf(x.item[0]) === -1).map(x => withOrigin(x, 'quick'));
    html += '<div class="' + esc(titleClass) + '">Quick Tools</div>';
    html += quick.map(i => link(i[0], i[1], i[2])).join('');
    html += '<a href="#" data-lb-settings>' + icon_('⚙️') + 'Settings</a>';
    html += '<a href="#" data-lb-logout>' + icon_('🚪') + 'Log Out</a>';

    el.innerHTML = html;
    el.style.display = 'contents';   // links stay direct flex children of the drawer
    el.querySelector('[data-lb-logout]').addEventListener('click', e => { e.preventDefault(); logout(); });
    el.querySelector('[data-lb-settings]').addEventListener('click', e => { e.preventDefault(); openSettings(); });
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

  // A link added from another module gets its module name, e.g. "Dashboard (Chocolate)".
  const SHORT = { chocolate: 'Chocolate', flower: 'Flower', item: 'Item' };
  function withOrigin(x, key) {
    const m = REG[x.item[0]] ? REG[x.item[0]].module : null;
    return x.added && m && m !== key ? [x.item[0], x.item[1], x.item[2] + ' (' + SHORT[m] + ')'] : x.item;
  }

  // ---- ⚙️ Settings panel (Appearance + Edit Menu) ----
  const SECTION_TITLES = { chocolate: 'Chocolate Tools', flower: 'Flower Tools', item: 'Item Inventory', quick: 'Quick Tools' };
  let setTab = null;

  function settingsStyle() {
    if (document.getElementById('lb-settings-style')) return;
    const st = document.createElement('style');
    st.id = 'lb-settings-style';
    st.setAttribute('data-lb-theme-skip', '');   // has its own light + dark colours
    st.textContent = [
      '.lbset-back{position:fixed;inset:0;z-index:2147483000;background:rgba(30,15,22,.45);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:"Space Grotesk",system-ui,sans-serif}',
      '.lbset{--s-bg:#fdfbf9;--s-card:#fff;--s-ink:#3a2530;--s-dim:#8a7078;--s-line:#eee2e0;--s-acc:#9e2f4a;--s-acc-soft:rgba(158,47,74,.1);background:var(--s-bg);color:var(--s-ink);width:min(440px,100%);max-height:88vh;overflow-y:auto;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.3);padding:18px 16px 16px;text-align:left}',
      'html[data-lb-theme="dark"] .lbset{--s-bg:#1d1719;--s-card:#272023;--s-ink:#f1e6e8;--s-dim:#b3a0a6;--s-line:#3a3034;--s-acc:#e0879c;--s-acc-soft:rgba(224,135,156,.14)}',
      '.lbset-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}',
      '.lbset-head b{font-size:17px}',
      '.lbset-x{background:none;border:0;font-size:20px;color:var(--s-dim);cursor:pointer;padding:4px 8px}',
      '.lbset h4{margin:16px 0 8px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--s-acc)}',
      '.lbset-seg{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}',
      '.lbset-seg button,.lbset-tabs button{border:1px solid var(--s-line);background:var(--s-card);color:var(--s-ink);border-radius:10px;padding:10px 4px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}',
      '.lbset-seg button.on,.lbset-tabs button.on{background:var(--s-acc);border-color:var(--s-acc);color:#fff}',
      'html[data-lb-theme="dark"] .lbset-seg button.on,html[data-lb-theme="dark"] .lbset-tabs button.on{color:#1d1719}',
      '.lbset-note{font-size:11.5px;color:var(--s-dim);margin-top:7px;line-height:1.45}',
      '.lbset-tabs{display:flex;gap:6px;margin-bottom:8px}.lbset-tabs button{flex:1;padding:8px 4px;font-size:12px}',
      '.lbset-list{border:1px solid var(--s-line);border-radius:12px;background:var(--s-card);overflow:hidden}',
      '.lbset-row{display:flex;align-items:center;gap:8px;padding:7px 8px 7px 10px;border-bottom:1px solid var(--s-line);font-size:13.5px}',
      '.lbset-row:last-child{border-bottom:0}.lbset-row.off .lbset-lbl{opacity:.45;text-decoration:line-through}',
      '.lbset-row input{width:18px;height:18px;accent-color:var(--s-acc);flex:0 0 auto;margin:0}',
      '.lbset-lbl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.lbset-tag{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--s-acc);margin-left:5px}',
      '.lbset-btn{width:32px;height:32px;flex:0 0 auto;border:1px solid var(--s-line);background:transparent;color:var(--s-ink);border-radius:8px;cursor:pointer;font-size:13px;padding:0}',
      '.lbset-btn:disabled{opacity:.3;cursor:default}',
      '.lbset-add{display:flex;gap:6px;margin-top:8px}',
      '.lbset-add select{flex:1;min-width:0;padding:9px 8px;border:1px solid var(--s-line);border-radius:10px;background:var(--s-card);color:var(--s-ink);font:inherit;font-size:13px}',
      '.lbset-add button,.lbset-reset{border:0;background:var(--s-acc-soft);color:var(--s-acc);border-radius:10px;padding:9px 14px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}',
      '.lbset-reset{background:none;padding:10px 0 0;font-size:12px;font-weight:600}',
      '@media(max-width:600px){.lbset-back{align-items:flex-end;padding:0}.lbset{width:100%;border-radius:18px 18px 0 0;max-height:86vh;padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))}}',
      '@media print{.lbset-back{display:none!important}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function updatePrefs(key, fn) {
    const all = readPrefs();
    const p = all[key] || {};
    p.order = p.order || arranged(key).map(x => x.item[0]);
    p.hidden = p.hidden || [];
    p.added = p.added || [];
    fn(p);
    all[key] = p;
    writePrefs(all);
    renderAll();
    drawSettings();
  }

  function drawSettings() {
    const box = document.getElementById('lbsetBody');
    if (!box) return;
    const T = window.LBTheme;
    const mode = T ? T.get() : 'light';
    const modes = [['light', '☀️ Light'], ['dark', '🌙 Dark'], ['auto', '🌓 Auto']];
    let h = '<h4>Appearance</h4><div class="lbset-seg">' +
      modes.map(m => '<button type="button" data-mode="' + m[0] + '" class="' + (mode === m[0] ? 'on' : '') + '">' + m[1] + '</button>').join('') + '</div>';
    if (!T) h += '<div class="lbset-note">Theme file not loaded on this page.</div>';
    else if (T.isNativeDark()) h += '<div class="lbset-note">This page already has its own dark design, so it stays as is. Other pages follow your choice.</div>';
    else if (mode === 'auto') h += '<div class="lbset-note">Auto follows your phone or computer setting.</div>';

    const modKey = moduleOf(page);
    const tabs = [];
    if (modKey && moduleAllowed(modKey)) tabs.push(modKey);
    tabs.push('quick');
    if (tabs.indexOf(setTab) === -1) setTab = tabs[0];

    h += '<h4>Edit Menu</h4>';
    if (tabs.length > 1) h += '<div class="lbset-tabs">' + tabs.map(k =>
      '<button type="button" data-tab="' + k + '" class="' + (k === setTab ? 'on' : '') + '">' + esc(SECTION_TITLES[k]) + '</button>').join('') + '</div>';

    const list = arranged(setTab);
    h += '<div class="lbset-list">' + list.map((x, n) => {
      const i = x.item;
      return '<div class="lbset-row' + (x.hidden ? ' off' : '') + '">' +
        '<input type="checkbox" data-show="' + esc(i[0]) + '"' + (x.hidden ? '' : ' checked') + ' aria-label="Show ' + esc(i[2]) + '">' +
        '<span class="lbset-lbl">' + i[1] + ' ' + esc(withOrigin(x, setTab)[2]) + (x.added ? '<span class="lbset-tag">added</span>' : '') + '</span>' +
        '<button type="button" class="lbset-btn" data-move="-1" data-h="' + esc(i[0]) + '"' + (n === 0 ? ' disabled' : '') + ' aria-label="Move up">▲</button>' +
        '<button type="button" class="lbset-btn" data-move="1" data-h="' + esc(i[0]) + '"' + (n === list.length - 1 ? ' disabled' : '') + ' aria-label="Move down">▼</button>' +
        (x.added ? '<button type="button" class="lbset-btn" data-remove="' + esc(i[0]) + '" aria-label="Remove">✕</button>' : '') +
        '</div>';
    }).join('') + '</div>';

    const inSection = list.map(x => x.item[0]);
    const addable = Object.keys(REG).map(k => REG[k].item).filter(i => inSection.indexOf(i[0]) === -1 && itemAllowed(i));
    if (addable.length) {
      h += '<div class="lbset-add"><select id="lbsetAdd"><option value="">＋ Add a link from another section…</option>' +
        addable.map(i => {
          const m = REG[i[0]].module;
          return '<option value="' + esc(i[0]) + '">' + i[1] + ' ' + esc(i[2]) + (m ? ' (' + esc(SECTION_TITLES[m]) + ')' : '') + '</option>';
        }).join('') + '</select><button type="button" data-add>Add</button></div>';
    }
    h += '<button type="button" class="lbset-reset" data-reset>↺ Reset ' + esc(SECTION_TITLES[setTab]) + ' to default</button>';
    h += '<div class="lbset-note">Unchecked = hidden from the menu. Saved on this device only.</div>';
    box.innerHTML = h;
  }

  function onSettingsClick(e) {
    const t = e.target.closest('button,input');
    if (!t) return;
    if (t.dataset.mode) { if (window.LBTheme) window.LBTheme.set(t.dataset.mode); drawSettings(); return; }
    if (t.dataset.tab) { setTab = t.dataset.tab; drawSettings(); return; }
    if (t.dataset.show) {
      const h = t.dataset.show, on = t.checked;
      updatePrefs(setTab, p => { p.hidden = p.hidden.filter(x => x !== h); if (!on) p.hidden.push(h); });
      return;
    }
    if (t.dataset.move) {
      const h = t.dataset.h, d = parseInt(t.dataset.move, 10);
      updatePrefs(setTab, p => {
        const order = arranged(setTab).map(x => x.item[0]);
        p.order.forEach(x => { if (order.indexOf(x) === -1) order.push(x); });  // keep links hidden from this user
        const k = order.indexOf(h), j = k + d;
        if (k === -1 || j < 0 || j >= order.length) return;
        order.splice(k, 1); order.splice(j, 0, h);
        p.order = order;
      });
      return;
    }
    if (t.dataset.remove) {
      const h = t.dataset.remove;
      updatePrefs(setTab, p => {
        p.added = p.added.filter(x => x !== h);
        p.hidden = p.hidden.filter(x => x !== h);
        p.order = p.order.filter(x => x !== h);
      });
      return;
    }
    if (t.hasAttribute('data-add')) {
      const sel = document.getElementById('lbsetAdd');
      const h = sel && sel.value;
      if (!h) return;
      updatePrefs(setTab, p => {
        if (p.added.indexOf(h) === -1) p.added.push(h);
        p.order = p.order.filter(x => x !== h).concat(h);
      });
      return;
    }
    if (t.hasAttribute('data-reset')) {
      if (!confirm('Reset ' + SECTION_TITLES[setTab] + ' to the default menu?')) return;
      const all = readPrefs(); delete all[setTab]; writePrefs(all);
      renderAll(); drawSettings();
    }
  }

  function closeSettings() {
    const b = document.getElementById('lbsetBack');
    if (b) b.remove();
    document.removeEventListener('keydown', escClose);
  }
  function escClose(e) { if (e.key === 'Escape') closeSettings(); }

  function openSettings() {
    settingsStyle();
    closeSettings();
    const back = document.createElement('div');
    back.className = 'lbset-back'; back.id = 'lbsetBack';
    back.setAttribute('data-lb-theme-skip', '');
    back.innerHTML = '<div class="lbset" role="dialog" aria-modal="true" aria-label="Settings">' +
      '<div class="lbset-head"><b>⚙️ Settings</b><button type="button" class="lbset-x" aria-label="Close">✕</button></div>' +
      '<div id="lbsetBody"></div></div>';
    document.body.appendChild(back);
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('.lbset-x')) closeSettings(); });
    back.querySelector('.lbset').addEventListener('click', onSettingsClick);
    document.addEventListener('keydown', escClose);
    drawSettings();
  }
  window.lbOpenSettings = openSettings;

  function renderAll() { document.querySelectorAll('[data-lb-menu]').forEach(render); }
  window.lbRenderMenu = renderAll;
  renderAll();
  // The menu is drawn before login finishes (e.g. logging in on the home
  // page), so redraw whenever the signed-in user changes — otherwise
  // admin-only links would stay hidden until a full reload.
  window.addEventListener('lb:user-changed', renderAll);
  window.addEventListener('lb:theme-changed', drawSettings);
  window.addEventListener('storage', e => { if (e.key === 'lalabellaUser' || e.key === PREFS_KEY) renderAll(); });
})();
