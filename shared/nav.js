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
    ['brain.html', '🧠', 'Brain Vault', 'admin'],
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
    // Also end the session on the server, not just in this browser. Calls
    // AUTH_FAST_API directly with its own apikey header (not left to
    // auth-guard.js's fetch wrapper) since nav.js runs on pages that don't
    // always load auth-guard.js.
    if (token && window.LB_CONFIG) {
      try {
        fetch(LB_CONFIG.AUTH_FAST_API + '?action=logout&token=' + encodeURIComponent(token), {
          keepalive: true,
          headers: { apikey: LB_CONFIG.SUPABASE_PUBLISHABLE_KEY || '' }
        }).catch(() => {});
      } catch (e) {}
    }
    ['lalabellaToken', 'lalabellaUser', 'lalabellaVerifiedToken', 'lalabellaVerifiedAt'].forEach(k => {
      sessionStorage.removeItem(k); localStorage.removeItem(k);
    });
    // Saved dashboard snapshots (instant-load cache) belong to this login only.
    try { Object.keys(localStorage).filter(k => k.indexOf('lbDash:') === 0).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    location.href = 'index.html';
  }
  window.lbLogout = logout;

  // Small circular avatar + name + branch at the top of the drawer —
  // the user's own photo comes straight from the cached session object
  // (publicUser() on the backend now includes it), so this never needs
  // its own fetch. Falls back to a plain initial-letter circle when no
  // photo is set, same idea as every avatar fallback elsewhere in the
  // app. Tapping it opens My Profile, same as tapping your name there.
  function profileHeaderHtml() {
    const u = currentUser();
    const name = u.fullName || u.username || '';
    if (!name) return '';
    const sub = [u.branch, u.position].filter(Boolean).join(' · ');
    const initial = esc(name.trim().charAt(0).toUpperCase() || '?');
    const avatar = u.photo
      ? '<img class="lb-menu-avatar" src="' + esc(u.photo) + '" alt="">'
      : '<span class="lb-menu-avatar lb-menu-avatar-fallback">' + initial + '</span>';
    return '<a href="profile.html" class="lb-menu-profile">' + avatar +
      '<span class="lb-menu-profile-text"><span class="lb-menu-profile-name">' + esc(name) + '</span>' +
      (sub ? '<span class="lb-menu-profile-sub">' + esc(sub) + '</span>' : '') + '</span></a>';
  }


  // ---- Weather strip at the very top of the drawer (no box — it sits right on the menu) ----
  // Open-Meteo (free, no key). Bahrain. Cached 15 min so opening the menu never re-fetches needlessly.
  const WX_PLACES = {
    bh:   { n: 'Bahrain',              lat: 26.2285, lon: 50.5860,  tz: 'Asia/Bahrain', f: '🇧🇭' },
    spl:  { n: 'San Pedro, Laguna',    lat: 14.3595, lon: 121.0473, tz: 'Asia/Manila',  f: '🇵🇭' },
    mnl:  { n: 'Manila',               lat: 14.5995, lon: 120.9842, tz: 'Asia/Manila',  f: '🇵🇭' },
    qc:   { n: 'Quezon City',          lat: 14.6760, lon: 121.0437, tz: 'Asia/Manila',  f: '🇵🇭' },
    cebu: { n: 'Cebu City',            lat: 10.3157, lon: 123.8854, tz: 'Asia/Manila',  f: '🇵🇭' },
    davao:{ n: 'Davao City',           lat: 7.1907,  lon: 125.4553, tz: 'Asia/Manila',  f: '🇵🇭' },
    dxb:  { n: 'Dubai',                lat: 25.2048, lon: 55.2708,  tz: 'Asia/Dubai',   f: '🇦🇪' },
    ruh:  { n: 'Riyadh',               lat: 24.7136, lon: 46.6753,  tz: 'Asia/Riyadh',  f: '🇸🇦' }
  };
  function wxOpts(sel) { return Object.keys(WX_PLACES).map(k => '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + WX_PLACES[k].f + ' ' + WX_PLACES[k].n + '</option>').join(''); }
  function wxPick(key, def) { let v = null; try { v = localStorage.getItem(key); } catch (e) {} return WX_PLACES[v] ? v : def; }
  function weatherHtml() {
    const p1 = wxPick('lbWxP1', 'bh'), p2 = wxPick('lbWxP2', 'spl');
    let hid = false; try { hid = localStorage.getItem('lbWxHide') === '1'; } catch (e) {}
    return '<div class="lb-menu-weather' + (hid ? ' lbw-hid' : '') + '"><button type="button" class="lbw-tg" aria-label="Hide or show weather"><span class="lbw-sum"></span><span class="lbw-chev">⌃</span></button><div class="lbw-wrap"><div class="lbw-body"><div class="lbw-place"><span class="lbw-pl">' + WX_PLACES[p1].f + ' <span class="lbw-pn">' + WX_PLACES[p1].n + '</span> ▾</span><select class="lbw-sel" data-k="lbWxP1" aria-label="Change place">' + wxOpts(p1) + '</select></div>' +
      '<div class="lbw-row"><span class="lbw-ico"></span>' +
      '<span class="lbw-main"><span class="lbw-temp"><b class="lbw-t">--</b><span class="lbw-u"><i data-u="c" class="on">°C</i><em>|</em><i data-u="f">°F</i></span></span>' +
      '<span class="lbw-feels">Feels like --</span></span>' +
      '<span class="lbw-det"><span class="lbw-p">Precipitation <b>--</b></span><span class="lbw-h">Humidity <b>--</b></span><span class="lbw-w">Wind <b>--</b></span></span></div>' +
      '<div class="lbw-foot"><span class="lbw-when">Weather</span><span class="lbw-cond"></span></div>' +
      '<div class="lbw-upd"></div>' +
      '<div class="lbw2"><span class="lbw2-ico"></span><span class="lbw2-info"><span class="lbw2-place">' + WX_PLACES[p2].f + ' <span class="lbw2-pn">' + WX_PLACES[p2].n + '</span> ▾<select class="lbw-sel" data-k="lbWxP2" aria-label="Change place">' + wxOpts(p2) + '</select></span><span class="lbw2-time">--</span></span>' +
      '<span class="lbw2-r"><span class="lbw2-t"><b>--</b></span><span class="lbw2-c"></span></span></div></div></div></div>';
  }
  const WX_TXT = { 0: 'Sunny', 1: 'Mostly sunny', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Snow', 73: 'Snow', 75: 'Snow', 80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
  const WX_TTL = 5 * 60000;   // weather is re-fetched when older than 5 minutes
  function wxFetch(pk, force) {
    const P = WX_PLACES[pk], ck = 'lbWxC3_' + pk;
    let c = null; try { c = JSON.parse(localStorage.getItem(ck) || 'null'); } catch (e) {}
    if (!force && c && Date.now() - c.ts < WX_TTL) return Promise.resolve(c);
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + P.lat + '&longitude=' + P.lon + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&hourly=precipitation_probability&forecast_hours=1&timezone=' + encodeURIComponent(P.tz);
    return fetch(url, { cache: 'no-store' }).then(r => r.json()).then(j => {
      const o = { ts: Date.now(), d: { t: j.current.temperature_2m, f: j.current.apparent_temperature, h: j.current.relative_humidity_2m, w: j.current.wind_speed_10m, code: j.current.weather_code,
        p: (j.hourly && j.hourly.precipitation_probability && j.hourly.precipitation_probability[0]) || 0 } };
      try { localStorage.setItem(ck, JSON.stringify(o)); } catch (e) {}
      return o;
    }).catch(err => { if (c) return c; throw err; });
  }
  function isNightIn(tz) { const hr = Number(new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false })) % 24; return hr >= 18 || hr < 5; }
  function condTxt(code, tz) { return (code === 0 && isNightIn(tz)) ? 'Clear' : (WX_TXT[code] || ''); }
  function fillWeather(root) {
    const box = root.querySelector('.lb-menu-weather'); if (!box) return;
    let unit = 'c'; try { unit = localStorage.getItem('lbWxUnit') === 'f' ? 'f' : 'c'; } catch (e) {}
    let p1 = wxPick('lbWxP1', 'bh'), p2 = wxPick('lbWxP2', 'spl');
    let cur = null, cur2 = null, lastIcon = null, lastIcon2 = null;
    const conv = v => Math.round(unit === 'f' ? v * 9 / 5 + 32 : v);
    const withHero = fn => { if (window.LBHero3D) fn(); else { const sc = document.createElement('script'); sc.src = 'shared/hero-3d.js'; sc.onload = fn; document.body.appendChild(sc); } };
    const paint = () => {
      const T1 = WX_PLACES[p1].tz, T2 = WX_PLACES[p2].tz;
      box.querySelector('.lbw-when').textContent = new Date().toLocaleString('en-US', { timeZone: T1, weekday: 'long', hour: 'numeric', minute: '2-digit' });
      box.querySelector('.lbw2-time').textContent = new Date().toLocaleString('en-US', { timeZone: T2, weekday: 'short', hour: 'numeric', minute: '2-digit' });
      if (cur) {
        const d = cur.d;
        box.querySelector('.lbw-t').textContent = conv(d.t);
        box.querySelectorAll('.lbw-u i').forEach(i => i.classList.toggle('on', i.getAttribute('data-u') === unit));
        box.querySelector('.lbw-feels').textContent = 'Feels like ' + conv(d.f) + '°' + unit.toUpperCase();
        box.querySelector('.lbw-p b').textContent = Math.round(d.p) + '%';
        box.querySelector('.lbw-h b').textContent = Math.round(d.h) + '%';
        box.querySelector('.lbw-w b').textContent = Math.round(d.w) + ' km/h';
        box.querySelector('.lbw-cond').textContent = condTxt(d.code, T1);
        box.querySelector('.lbw-upd').textContent = 'Updated ' + new Date(cur.ts).toLocaleTimeString('en-US', { timeZone: T1, hour: 'numeric', minute: '2-digit' });
        const key = d.code + '|' + isNightIn(T1) + '|' + p1;
        if (lastIcon !== key) { lastIcon = key; withHero(() => LBHero3D.weather(box.querySelector('.lbw-ico'), d.code, d.t, T1)); }
      }
      sumPaint();
      if (cur2) {
        const d = cur2.d;
        box.querySelector('.lbw2-t b').textContent = conv(d.t) + '°' + unit.toUpperCase();
        box.querySelector('.lbw2-c').textContent = condTxt(d.code, T2);
        const key = d.code + '|' + isNightIn(T2) + '|' + p2;
        if (lastIcon2 !== key) { lastIcon2 = key; withHero(() => LBHero3D.weather(box.querySelector('.lbw2-ico'), d.code, d.t, T2)); }
      }
      sumPaint();
    };
    const sumPaint = () => {
      const el = box.querySelector('.lbw-sum'); if (!el) return;
      el.textContent = WX_PLACES[p1].f + ' ' + (cur ? conv(cur.d.t) + '°' : '--') + '  ·  ' + WX_PLACES[p2].f + ' ' + (cur2 ? conv(cur2.d.t) + '°' : '--') + '  ' + (cur ? condTxt(cur.d.code, WX_PLACES[p1].tz) : '');
    };
    const tg = box.querySelector('.lbw-tg');
    if (tg) tg.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const h = box.classList.toggle('lbw-hid'); try { localStorage.setItem('lbWxHide', h ? '1' : '0'); } catch (x) {}
    });
    box.querySelectorAll('.lbw-u i').forEach(i => i.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); unit = i.getAttribute('data-u'); try { localStorage.setItem('lbWxUnit', unit); } catch (x) {} paint();
    }));
    const load = force => {
      wxFetch(p1, force).then(o => { cur = o; paint(); }).catch(() => { box.querySelector('.lbw-cond').textContent = 'Weather unavailable'; });
      wxFetch(p2, force).then(o => { cur2 = o; paint(); }).catch(() => { box.querySelector('.lbw2-c').textContent = 'N/A'; });
    };
    box.querySelectorAll('.lbw-sel').forEach(sel => {
      sel.addEventListener('click', e => e.stopPropagation());
      sel.addEventListener('change', () => {
        const k = sel.getAttribute('data-k'), v = sel.value; try { localStorage.setItem(k, v); } catch (x) {}
        const P = WX_PLACES[v], isP1 = k === 'lbWxP1';
        if (isP1) { p1 = v; cur = null; lastIcon = null; box.querySelector('.lbw-pl').innerHTML = P.f + ' <span class="lbw-pn">' + P.n + '</span> ▾'; }
        else { p2 = v; cur2 = null; lastIcon2 = null; const pn = box.querySelector('.lbw2-pn'); pn.parentNode.firstChild.nodeValue = P.f + ' '; pn.textContent = P.n; }
        paint(); load(true);
      });
    });
    let lastTouch = 0;
    const maybe = () => { if (!box.isConnected) return; paint(); if (Date.now() - lastTouch > 30000) { lastTouch = Date.now(); load(false); } };
    document.addEventListener('pointerdown', maybe, true);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) maybe(); });
    setInterval(() => { if (box.isConnected) { paint(); load(false); } }, 60000);
    lastTouch = Date.now(); load(false); paint();
  }

  function render(el) {
    const hubClass = el.getAttribute('data-hub-class') || 'choco-hub-grid';
    const titleClass = el.getAttribute('data-title-class') || 'choco-drawer-title';
    iconClass = el.getAttribute('data-icon-class') || '';
    const modKey = moduleOf(page);
    const mod = moduleAllowed(modKey) ? MODULES[modKey] : null;
    const hub = HUB.filter(h => moduleAllowed(h[3]));
    let html = weatherHtml() + profileHeaderHtml() +
      (hub.length ? '<div class="' + esc(hubClass) + '">' : '') +
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
    fillWeather(el);
    el.style.display = 'contents';   // links stay direct flex children of the drawer
    el.querySelector('[data-lb-logout]').addEventListener('click', e => { e.preventDefault(); logout(); });
    el.querySelector('[data-lb-settings]').addEventListener('click', e => { e.preventDefault(); openSettings(); });
  }

  if (!document.getElementById('lb-nav-style')) {
    const st = document.createElement('style');
    st.id = 'lb-nav-style';
    st.textContent = '[data-lb-menu] a.lb-menu-active{font-weight:700;box-shadow:inset 3px 0 0 currentColor;}' +
      '.lb-menu-profile{display:flex;align-items:center;gap:10px;padding:10px 12px;margin:0 0 10px;border-radius:12px;' +
        'text-decoration:none;color:inherit;background:rgba(127,127,127,.06);}' +
      '.lb-menu-avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;flex:0 0 40px;}' +
      '.lb-menu-avatar-fallback{display:flex;align-items:center;justify-content:center;background:var(--teal,#1f8a8a);color:#fff;font-weight:700;font-size:16px;}' +
      '.lb-menu-profile-text{display:flex;flex-direction:column;min-width:0;}' +
      '.lb-menu-profile-name{font-weight:700;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.lb-menu-profile-sub{font-size:11.5px;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.choco-drawer,.item-drawer,.flower-drawer{width:min(340px,86vw)!important;max-width:86vw!important;}' +
      '.lbw-row{flex-wrap:wrap;row-gap:6px;}.lbw-det{min-width:0;}.lbw-temp{white-space:nowrap;}.lbw-feels{white-space:normal;}' +
      '.lbw2-place{overflow:hidden;text-overflow:ellipsis;max-width:190px;}.lbw2-r{flex:0 0 auto;}' +
      '.lb-menu-weather{display:block;padding:4px 8px 10px;margin:0 0 8px;color:#3a2a2e;font-family:"Space Grotesk",system-ui,-apple-system,"Segoe UI",sans-serif;}' +
      '.lb-menu-weather{position:relative;}' +
      '.lbw-wrap{display:grid;grid-template-rows:1fr;transition:grid-template-rows .32s ease,opacity .25s ease;opacity:1;}.lbw-body{overflow:hidden;min-height:0;}' +
      '.lbw-hid .lbw-wrap{grid-template-rows:0fr;opacity:0;}' +
      '.lbw-tg{position:absolute;top:0;right:4px;z-index:3;display:flex;align-items:center;gap:8px;border:0;background:rgba(128,128,128,.14);color:inherit;border-radius:999px;padding:2px 9px;font:600 12px inherit;cursor:pointer;line-height:1.4;}' +
      '.lbw-sum{display:none;font-size:12.5px;font-weight:600;}.lbw-chev{display:inline-block;transition:transform .3s;font-size:13px;}' +
      '.lbw-hid .lbw-tg{position:static;width:100%;justify-content:space-between;padding:7px 12px;border-radius:12px;}.lbw-hid .lbw-sum{display:inline;}.lbw-hid .lbw-chev{transform:rotate(180deg);}' +
      '.lbw-row{display:flex;align-items:center;gap:10px;}' +
      '.lbw-ico{flex:0 0 54px;width:54px;height:54px;display:block;}' +
      '.lbw-ico .weather-emoji,.lbw-ico .h3-wrap,.lbw-ico svg{width:54px!important;height:54px!important;}' +
      '.lbw-main{display:flex;flex-direction:column;min-width:0;}' +
      '.lbw-temp{display:flex;align-items:flex-start;gap:4px;}' +
      '.lbw-t{font-size:38px;line-height:1;font-weight:600;letter-spacing:-.03em;}' +
      '.lbw-u{font-size:13px;margin-top:4px;display:flex;gap:4px;font-weight:600;}.lbw-u i{font-style:normal;cursor:pointer;opacity:.45;}.lbw-u i.on{opacity:1;}.lbw-u em{font-style:normal;opacity:.3;}' +
      '.lbw-feels{font-size:11.5px;opacity:.7;margin-top:3px;white-space:nowrap;font-weight:500;}' +
      '.lbw-det{display:flex;flex-direction:column;gap:2px;font-size:11.5px;line-height:1.3;margin-left:auto;text-align:left;font-weight:500;}.lbw-det span{opacity:.75;white-space:nowrap;}.lbw-det b{opacity:1;font-weight:700;margin-left:2px;}' +
      '.lbw-foot{display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-top:7px;font-weight:600;}.lbw-when{opacity:.75;}.lbw-cond{opacity:.95;}' +
      '.lbw-place{position:relative;display:inline-block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.75;margin:0 0 4px;}.lbw-sel{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:16px;}.lbw-place .lbw-pl{pointer-events:none;}.lbw2-place .lbw-sel{left:0;top:0;}' +
      '.lbw2{position:relative;display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(128,128,128,.22);}.lbw2-ico{flex:0 0 38px;width:38px;height:38px;display:block;}.lbw2-ico .h3-wrap,.lbw2-ico svg{width:38px!important;height:38px!important;}' +
      '.lbw2-info{display:flex;flex-direction:column;min-width:0;}.lbw2-place{position:relative;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.75;white-space:nowrap;}.lbw2-time{font-size:15px;font-weight:600;margin-top:2px;}' +
      '.lbw2-r{margin-left:auto;text-align:right;display:flex;flex-direction:column;}.lbw2-t b{font-size:22px;font-weight:600;letter-spacing:-.02em;}.lbw2-c{font-size:11.5px;opacity:.8;font-weight:600;}' +
      '.lbw-upd{font-size:10px;opacity:.45;margin-top:2px;letter-spacing:.02em;}' +
      '.lb-menu-profile{position:relative;}' +
      '.lb-menu-profile::after{content:"";position:absolute;left:30px;top:8px;width:11px;height:11px;border-radius:50%;' +
        'background:#e03a3a;border:2px solid #fdfbf7;display:none;}' +
      '.lb-menu-profile.lb-menu-has-unread::after{display:block;}' +
      '@media print{#lbcb-btn,#lbcb-panel,[id^="joyboy-"],.lbnav-btn,.lbnav-backdrop,.lbnav-drawer{display:none!important;}}';
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

  // Joyboy floating chat bubble — loaded here, once, instead of a
  // <script> tag pasted into every page, so turning it on/off (or
  // changing which pages carry it) everywhere is a one-file change.
  // Every page that loads nav.js already loaded shared/config.js first
  // (LB_CONFIG, which joyboy-bubble.js needs, is always script-tag #1),
  // so this is safe to inject unconditionally here.
  if (!document.getElementById('joyboy-bubble-btn') && !document.querySelector('script[src="joyboy-bubble.js"]')) {
    const jb = document.createElement('script');
    jb.src = 'joyboy-bubble.js';
    document.body.appendChild(jb);
  }

  // Staff chat floating bubble — same one-file-change reasoning as
  // Joyboy above. Skipped on chatbox.html itself: that page already
  // IS the full chat, a floating copy of it there would be redundant.
  if (!/chatbox\.html$/i.test(location.pathname) &&
      !document.getElementById('lbcb-btn') && !document.querySelector('script[src="shared/chat-bubble.js"]')) {
    const cb = document.createElement('script');
    cb.src = 'shared/chat-bubble.js';
    document.body.appendChild(cb);
  }

  // Site-wide reminder alarm (floating, keeps ringing until Done/Later). See shared/reminder-alarm.js.
  if (!window.LBReminderAlarm && !document.querySelector('script[src="shared/reminder-alarm.js"]')) {
    const ra = document.createElement('script');
    ra.src = 'shared/reminder-alarm.js';
    document.body.appendChild(ra);
  }

  // System "brain" (reminders + smart alerts) — loaded here once, same
  // one-file-change reasoning as the bubbles above. See shared/brain.js.
  if (!window.LBBrain && !document.querySelector('script[src="shared/brain.js"]')) {
    const br = document.createElement('script');
    br.src = 'shared/brain.js';
    document.body.appendChild(br);
  }

  // Little living animation behind your name in the menu (fish / snow /
  // fire / petals). Self-contained — see shared/profile-fx.js.
  if (!window.LBProfileFx && !document.querySelector('script[src="shared/profile-fx.js"]')) {
    const fx = document.createElement('script');
    fx.src = 'shared/profile-fx.js';
    document.body.appendChild(fx);
  }

  // Unread-chat dot on the hamburger profile header — chat-bubble.js
  // dispatches this event whenever the unread total changes (and so
  // will chatbox.html's own page script, once it's wired the same
  // way), so this is the only place that needs to know how to draw
  // the dot.
  window.addEventListener('lb:chat-unread', e => {
    document.querySelectorAll('.lb-menu-profile').forEach(p => {
      p.classList.toggle('lb-menu-has-unread', !!(e.detail && e.detail.total > 0));
    });
  });
})();
