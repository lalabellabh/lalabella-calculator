/**
 * LALABELLA TOOL EDIT — hide / reorder the tool icons of a page
 * (Flower Tools carousel, Item Inventory carousel). Saved per device.
 *
 * Usage: load this file in <head>, then RIGHT AFTER the tools markup
 * (before the page's own carousel script reads the tools):
 *
 *   <script>LBToolEdit.apply({
 *     container: '#carousel',          // element holding the tools
 *     item: '.tool',                   // one tool
 *     key: el => ...,                  // stable id for a tool (optional)
 *     storageKey: 'lbToolsFlower',     // localStorage key
 *     title: 'Flower Tools'            // shown in the editor
 *   });</script>
 *
 * Hidden tools are removed from the page before the carousel starts, so
 * the page's own code never sees them. A small ✏️ button on the tools area
 * opens the editor; closing it after a change reloads the page.
 *
 * "Add a page": the editor can also add any other page of the system as a new
 * tool (e.g. Flower Admin). The page is built by copying the first tool of the
 * area, so it looks the same. Saved per device with the hide / order settings.
 */
(function () {
  if (window.LBToolEdit) return;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function defaultKey(el) {
    if (el.dataset.tab) return 'tab:' + el.dataset.tab;
    const href = el.getAttribute('href');
    if (href) return href.split('?')[0].split('#')[0];
    return (el.textContent || '').trim();
  }
  function read(k) {
    try { const p = JSON.parse(localStorage.getItem(k) || '{}'); return p && typeof p === 'object' ? p : {}; }
    catch (e) { return {}; }
  }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // Every page that can be added as a tool: [href, icon, label, adminOnly]
  const CATALOG = [
    ['flower-tools.html', '🌸', 'Flower Tools'], ['flower-dashboard.html', '📊', 'Flower Dashboard'], ['flower-receiving.html', '🛒', 'Flower Receiving'],
    ['flower-purchase.html', '🧾', 'Flower Purchase'], ['flower-stock-count.html', '📋', 'Flower Stock Count'], ['flower-catalog.html', '📚', 'Flower Catalog'],
    ['flower-arrangements.html', '💐', 'Flower Arrangements'], ['flower-transfer.html', '🔄', 'Flower Transfer'], ['flower-barcode.html', '🏷️', 'Flower Barcode'],
    ['flower-calc.html', '🧮', 'Flower Calculator'], ['flower-admin.html', '🔐', 'Flower Admin', 1], ['flower-photos.html', '🖼️', 'Flower Photos', 1],
    ['flower-odoo-import.html', '📥', 'Flower Odoo Price Import', 1], ['flower-guide.html', '📖', 'Flower Guide'],
    ['dashboard.html', '📊', 'Chocolate Dashboard'], ['chocolate-receiving.html', '📥', 'Chocolate Receiving'], ['chocolate-release.html', '📤', 'Chocolate Release'],
    ['stock-count.html', '📋', 'Chocolate Stock Count'], ['stock-approval.html', '✅', 'Stock Approval'], ['chocolate-arrangements.html', '🎁', 'Chocolate Arrangements'],
    ['chocolate-barcode.html', '🏷️', 'Chocolate Barcode'], ['chocolate-calc.html', '🍫', 'Chocolate Calculator'], ['chocolate-admin.html', '🔐', 'Chocolate Admin', 1],
    ['chocolate-photos.html', '🖼️', 'Chocolate Photos', 1], ['chocolate-odoo-import.html', '📥', 'Chocolate Odoo Price Import', 1], ['chocolate-guide.html', '📖', 'Chocolate Guide'],
    ['item-inventory.html', '📦', 'Item Inventory'], ['item-dashboard.html', '📊', 'Item Dashboard'], ['item-admin.html', '🔐', 'Item Admin', 1],
    ['item-photos.html', '🖼️', 'Item Photos', 1], ['item-odoo-import.html', '📥', 'Item Odoo Price Import', 1],
    ['nova-command-center.html', '🎙️', 'NOVA'], ['schedule.html', '📆', 'Duty Schedule'], ['attendance.html', '🕒', 'Attendance'],
    ['delivery-admin.html', '🗺️', 'Delivery Map', 1], ['profile.html', '👤', 'My Profile'], ['petty-cash.html', '💰', 'Petty Cash & Cash'],
    ['notes.html', '📝', 'Notes'], ['order-form.html', '🧾', 'Order Form'], ['card-print.html', '💌', 'Card Print'], ['seeds-card.html', '🌱', 'Seeds of Success Card'],
    ['branch-config.html', '📍', 'Branch Config'], ['user-admin.html', '👥', 'User Management', 1], ['brain.html', '🧠', 'Brain Vault', 1],
    ['system-health.html', '🩺', 'System Health', 1], ['index.html', '🏠', 'Main Home']
  ];

  // Builds a new tool by copying an existing one of the same area.
  function makeEl(tpl, x) {
    const el = tpl.cloneNode(true);
    el.classList.remove('active');
    el.removeAttribute('id'); el.removeAttribute('data-edit-key');
    el.querySelectorAll('[data-edit-key]').forEach(n => n.removeAttribute('data-edit-key'));
    el.setAttribute('data-lb-extra', '1');
    if (tpl.tagName === 'A') {
      el.setAttribute('href', x.href);
    } else {
      // a tab button of the page (Item Inventory): turn it into a link button
      el.removeAttribute('data-tab'); el.setAttribute('type', 'button'); el.setAttribute('data-lbhref', x.href);
      el.addEventListener('click', e => { e.preventDefault(); e.stopImmediatePropagation(); location.href = x.href; }, true);
    }
    if (el.hasAttribute('data-card-key')) el.setAttribute('data-card-key', x.href);
    if (el.hasAttribute('data-title')) el.setAttribute('data-title', x.label);
    const ic = el.querySelector('.tool-circle,.card-icon,.carousel-circle,.desktop-tool-icon,.nav-icon,[data-tool-icon]');
    if (ic) ic.textContent = x.icon;
    const tt = el.querySelector('h3,b');
    if (tt) tt.textContent = x.label;
    el.querySelectorAll('p,small').forEach(n => { n.textContent = ''; });
    el.querySelectorAll('.card-kicker').forEach(n => { n.textContent = 'Page'; });
    return el;
  }
  const hrefOf = el => ((el.getAttribute('href') || el.getAttribute('data-lbhref') || '').split('?')[0].split('#')[0]);

  function addStyle() {
    if (document.getElementById('lbte-style')) return;
    const st = document.createElement('style');
    st.id = 'lbte-style';
    st.setAttribute('data-lb-theme-skip', '');
    st.textContent = [
      '.lbte-btn{position:absolute;top:7px;right:7px;z-index:40;width:28px;height:28px;border-radius:50%;border:1px solid rgba(158,47,74,.22);background:rgba(255,255,255,.92);color:#9e2f4a;font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 9px rgba(60,30,40,.12);padding:0}',
      'html[data-lb-theme="dark"] .lbte-btn{background:rgba(39,32,35,.92);border-color:#3a3034;color:#e0879c}',
      '.lbte-back{position:fixed;inset:0;z-index:2147483000;background:rgba(30,15,22,.45);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:"Space Grotesk",system-ui,sans-serif}',
      '.lbte{--s-bg:#fdfbf9;--s-card:#fff;--s-ink:#3a2530;--s-dim:#8a7078;--s-line:#eee2e0;--s-acc:#9e2f4a;background:var(--s-bg);color:var(--s-ink);width:min(420px,100%);max-height:88vh;overflow-y:auto;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.3);padding:18px 16px 16px;text-align:left}',
      'html[data-lb-theme="dark"] .lbte{--s-bg:#1d1719;--s-card:#272023;--s-ink:#f1e6e8;--s-dim:#b3a0a6;--s-line:#3a3034;--s-acc:#e0879c}',
      '.lbte-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.lbte-head b{font-size:17px}',
      '.lbte-list{border:1px solid var(--s-line);border-radius:12px;background:var(--s-card);overflow:hidden}',
      '.lbte-row{display:flex;align-items:center;gap:8px;padding:7px 8px 7px 10px;border-bottom:1px solid var(--s-line);font-size:13.5px}',
      '.lbte-row:last-child{border-bottom:0}.lbte-row.off .lbte-lbl{opacity:.45;text-decoration:line-through}',
      '.lbte-row input{width:18px;height:18px;accent-color:var(--s-acc);margin:0;flex:0 0 auto}',
      '.lbte-lbl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.lbte-mv{width:32px;height:32px;flex:0 0 auto;border:1px solid var(--s-line);background:transparent;color:var(--s-ink);border-radius:8px;cursor:pointer;font-size:13px;padding:0}',
      '.lbte-mv:disabled{opacity:.3;cursor:default}',
      '.lbte-add{margin-top:12px;border:1px dashed var(--s-line);border-radius:12px;padding:10px;background:var(--s-card)}.lbte-add b{font-size:12.5px}.lbte-add-row{display:flex;gap:8px;margin-top:8px}.lbte-add select{flex:1;min-width:0;border:1px solid var(--s-line);border-radius:8px;padding:8px;background:var(--s-bg);color:var(--s-ink);font:inherit;font-size:13px}.lbte-add-btn{border:0;background:var(--s-acc);color:#fff;border-radius:8px;padding:8px 14px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}html[data-lb-theme="dark"] .lbte-add-btn{color:#1d1719}.lbte-add-btn:disabled{opacity:.45;cursor:default}.lbte-addn{font-size:11.5px;color:var(--s-dim)}.lbte-find{width:100%;box-sizing:border-box;margin-top:8px;border:1px solid var(--s-line);border-radius:8px;padding:7px 9px;background:var(--s-bg);color:var(--s-ink);font:inherit;font-size:13px}.lbte-picks{margin-top:8px;max-height:200px;overflow-y:auto;border:1px solid var(--s-line);border-radius:8px;background:var(--s-bg)}.lbte-pick{display:flex;align-items:center;gap:8px;padding:7px 9px;border-bottom:1px solid var(--s-line);font-size:13px;cursor:pointer}.lbte-pick:last-child{border-bottom:0}.lbte-pick input{width:17px;height:17px;accent-color:var(--s-acc);margin:0;flex:0 0 auto}.lbte-pick i{font-style:normal;font-size:10px;font-weight:700;color:var(--s-acc);border:1px solid var(--s-line);border-radius:99px;padding:1px 6px;margin-left:4px}.lbte-all{border:1px solid var(--s-line);background:transparent;color:var(--s-ink);border-radius:8px;padding:7px 10px;font:inherit;font-size:12px;cursor:pointer}.lbte-rm{border:0;background:none;color:var(--s-acc);font-size:15px;cursor:pointer;padding:4px 6px;flex:0 0 auto}',
      '.lbte-note{font-size:11.5px;color:var(--s-dim);margin:8px 0 0;line-height:1.45}',
      '.lbte-foot{display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:8px}',
      '.lbte-reset{background:none;border:0;color:var(--s-acc);font:inherit;font-size:12px;font-weight:600;cursor:pointer;padding:6px 0}',
      '.lbte-done{border:0;background:var(--s-acc);color:#fff;border-radius:10px;padding:10px 20px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}',
      'html[data-lb-theme="dark"] .lbte-done{color:#1d1719}',
      '@media(max-width:600px){.lbte-back{align-items:flex-end;padding:0}.lbte{width:100%;border-radius:18px 18px 0 0;max-height:86vh;padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))}}',
      '@media print{.lbte-btn,.lbte-back{display:none!important}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function apply(opts) {
    const box = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
    if (!box) return;
    const keyOf = opts.key || defaultKey;
    // Pages added from the editor ("Add a page"): build them from the first tool before anything is read.
    const pre = Array.from(box.querySelectorAll(opts.item));
    const extraPrefs = Array.isArray(read(opts.storageKey).extra) ? read(opts.storageKey).extra : [];
    if (pre.length) {
      const have = new Set(pre.map(hrefOf));
      extraPrefs.forEach(x => {
        if (!x || !x.href || have.has(x.href)) return;
        have.add(x.href);
        box.appendChild(makeEl(pre[0], x));
      });
    }
    const els = Array.from(box.querySelectorAll(opts.item));
    // Master list (default order) with label + icon for the editor.
    const master = els.map(el => {
      // Prefer the explicit icon/title elements used by Item Inventory.
      // This prevents the editor from showing the icon and subtitle twice.
      const iconEl = el.querySelector('.desktop-tool-icon, .tool-icon, .nav-icon, [data-tool-icon]');
      const titleEl = el.querySelector('b, h3');
      let label = titleEl ? (titleEl.textContent || '').trim() : '';
      if (!label) {
        const clone = el.cloneNode(true);
        clone.querySelectorAll('.desktop-tool-icon, .tool-icon, .nav-icon, [data-tool-icon], small').forEach(n => n.remove());
        label = (clone.textContent || '').trim();
      }
      return {
        key: keyOf(el),
        href: hrefOf(el),
        extra: el.hasAttribute('data-lb-extra'),
        label,
        icon: iconEl ? (iconEl.textContent || '').trim() : Array.from((el.firstElementChild?.textContent || '').trim()).slice(0, 2).join('')
      };
    });
    const prefs = read(opts.storageKey);
    const hidden = Array.isArray(prefs.hidden) ? prefs.hidden : [];
    const order = Array.isArray(prefs.order) ? prefs.order : [];

    // Reorder, then remove hidden tools (at least one always stays).
    const pos = k => { const i = order.indexOf(k); return i === -1 ? 1e6 : i; };
    const sorted = els.slice().sort((a, b) => (pos(keyOf(a)) - pos(keyOf(b))) || (els.indexOf(a) - els.indexOf(b)));
    sorted.forEach(el => box.appendChild(el));
    let visible = sorted.filter(el => hidden.indexOf(keyOf(el)) === -1);
    if (!visible.length) visible = [sorted[0]];
    const activeClass = opts.activeClass || 'active';
    let activeHidden = false;
    sorted.forEach(el => {
      if (visible.indexOf(el) === -1) {
        if (el.classList.contains(activeClass)) activeHidden = true;
        el.remove();
      }
    });
    if (activeHidden || (opts.activeClass && !visible.some(el => el.classList.contains(activeClass)))) {
      visible.forEach(el => el.classList.remove(activeClass));
      visible[0].classList.add(activeClass);
    }
    if (opts.onApplied) { try { opts.onApplied(visible[0], activeHidden); } catch (e) {} }

    // ✏️ button
    addStyle();
    const shell = opts.buttonIn ? document.querySelector(opts.buttonIn) : box.parentElement;
    if (shell) {
      if (getComputedStyle(shell).position === 'static') shell.style.position = 'relative';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lbte-btn';
      btn.title = 'Edit tools (hide / reorder)';
      btn.setAttribute('aria-label', 'Edit tools');
      btn.textContent = '✏️';
      btn.addEventListener('pointerdown', e => e.stopPropagation());
      btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openEditor(opts, master); });
      shell.appendChild(btn);
    }
  }

  function openEditor(opts, master) {
    let changed = false;
    const back = document.createElement('div');
    back.className = 'lbte-back';
    back.setAttribute('data-lb-theme-skip', '');
    back.innerHTML = '<div class="lbte" role="dialog" aria-modal="true" aria-label="Edit tools">' +
      '<div class="lbte-head"><b>✏️ Edit ' + esc(opts.title || 'Tools') + '</b></div><div id="lbteBody"></div>' +
      '<div class="lbte-foot"><button type="button" class="lbte-reset">↺ Reset to default</button>' +
      '<button type="button" class="lbte-done">Done</button></div></div>';
    document.body.appendChild(back);

    function state() {
      const p = read(opts.storageKey);
      const order = Array.isArray(p.order) ? p.order : [];
      const pos = k => { const i = order.indexOf(k); return i === -1 ? 1e6 : i; };
      const list = master.slice().sort((a, b) => (pos(a.key) - pos(b.key)) || (master.indexOf(a) - master.indexOf(b)));
      return { list, hidden: Array.isArray(p.hidden) ? p.hidden : [] };
    }
    function draw() {
      const s = state();
      const shown = s.list.filter(t => s.hidden.indexOf(t.key) === -1).length;
      back.querySelector('#lbteBody').innerHTML = '<div class="lbte-list">' + s.list.map((t, n) => {
        const off = s.hidden.indexOf(t.key) !== -1;
        const last = !off && shown === 1;
        return '<div class="lbte-row' + (off ? ' off' : '') + '">' +
          '<input type="checkbox" data-k="' + esc(t.key) + '"' + (off ? '' : ' checked') + (last ? ' disabled title="At least one tool must stay"' : '') + '>' +
          '<span class="lbte-lbl">' + esc(t.icon) + ' ' + esc(t.label) + '</span>' +
          (t.extra ? '<button type="button" class="lbte-rm" data-rm="' + esc(t.href) + '" title="Remove this added page" aria-label="Remove">✕</button>' : '') +
          '<button type="button" class="lbte-mv" data-mv="-1" data-k="' + esc(t.key) + '"' + (n === 0 ? ' disabled' : '') + ' aria-label="Move up">▲</button>' +
          '<button type="button" class="lbte-mv" data-mv="1" data-k="' + esc(t.key) + '"' + (n === s.list.length - 1 ? ' disabled' : '') + ' aria-label="Move down">▼</button>' +
          '</div>';
      }).join('') + '</div>' + addBox() + '<div class="lbte-note">Unchecked = hidden. Saved on this device only.</div>';
    }
    function addBox() {
      const present = new Set(master.map(m => m.href));
      // pick several pages at once (checkboxes), with a quick search when the list is long
      const left = CATALOG.filter(c => !present.has(c[0]));
      if (!left.length) return '';
      const items = left.map(c => '<label class="lbte-pick" data-q="' + esc((c[2] + ' ' + c[0]).toLowerCase()) + '"><input type="checkbox" value="' + esc(c[0]) + '"><span>' + esc(c[1] + ' ' + c[2]) + (c[3] ? ' <i>Admin</i>' : '') + '</span></label>').join('');
      return '<div class="lbte-add"><b>➕ Add pages</b> <span class="lbte-addn">— tick one or more</span>' +
        (left.length > 6 ? '<input type="search" class="lbte-find" placeholder="Search pages…">' : '') +
        '<div class="lbte-picks">' + items + '</div>' +
        '<div class="lbte-add-row"><button type="button" class="lbte-all">Select all</button><span style="flex:1"></span><button type="button" class="lbte-add-btn" disabled>Add</button></div></div>';
    }
    function save(fn) {
      const s = state();
      const p = { order: s.list.map(t => t.key), hidden: s.hidden.slice(), extra: (Array.isArray(read(opts.storageKey).extra) ? read(opts.storageKey).extra : []) };
      fn(p);
      write(opts.storageKey, p);
      changed = true;
      draw();
    }
    function close() {
      back.remove();
      document.removeEventListener('keydown', onKey);
      if (changed) location.reload();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    function pickCount() {
      const n = back.querySelectorAll('.lbte-pick input:checked').length, b = back.querySelector('.lbte-add-btn');
      if (b) { b.disabled = !n; b.textContent = n ? 'Add ' + n + ' page' + (n > 1 ? 's' : '') : 'Add'; }
    }
    back.addEventListener('change', e => { if (e.target.closest('.lbte-pick')) pickCount(); });
    back.addEventListener('input', e => {
      if (!e.target.classList.contains('lbte-find')) return;
      const q = e.target.value.trim().toLowerCase();
      back.querySelectorAll('.lbte-pick').forEach(l => { l.style.display = !q || l.dataset.q.indexOf(q) > -1 ? '' : 'none'; });
    });
    back.addEventListener('click', e => {
      if (e.target === back || e.target.closest('.lbte-done')) { close(); return; }
      if (e.target.closest('.lbte-reset')) {
        if (!confirm('Show all tools in the default order? (Pages you added will be removed too.)')) return;
        try { localStorage.removeItem(opts.storageKey); } catch (_) {}
        changed = true; draw(); return;
      }
      const allBtn = e.target.closest('.lbte-all');
      if (allBtn) {
        const boxes = [...back.querySelectorAll('.lbte-pick')].filter(l => l.style.display !== 'none').map(l => l.querySelector('input'));
        const on = boxes.some(b => !b.checked);
        boxes.forEach(b => { b.checked = on; });
        allBtn.textContent = on ? 'Clear' : 'Select all';
        pickCount(); return;
      }
      const addBtn = e.target.closest('.lbte-add-btn');
      if (addBtn) {
        const picked = [...back.querySelectorAll('.lbte-pick input:checked')].map(i => CATALOG.find(x => x[0] === i.value)).filter(Boolean);
        if (!picked.length) return;
        const p = read(opts.storageKey);
        const hrefs = new Set(picked.map(c => c[0]));
        p.extra = (Array.isArray(p.extra) ? p.extra : []).filter(x => x && !hrefs.has(x.href));
        picked.forEach(c => p.extra.push({ href: c[0], icon: c[1], label: c[2] }));
        write(opts.storageKey, p);
        changed = true; close(); return;   // reload: the new tools appear at the end of the list
      }
      const rm = e.target.closest('.lbte-rm');
      if (rm) {
        const h = rm.dataset.rm, p = read(opts.storageKey);
        p.extra = (Array.isArray(p.extra) ? p.extra : []).filter(x => x && x.href !== h);
        write(opts.storageKey, p);
        changed = true; close(); return;
      }
      const cb = e.target.closest('input[data-k]');
      if (cb) {
        const k = cb.dataset.k, on = cb.checked;
        save(p => { p.hidden = p.hidden.filter(x => x !== k); if (!on) p.hidden.push(k); });
        return;
      }
      const mv = e.target.closest('.lbte-mv');
      if (mv) {
        const k = mv.dataset.k, d = parseInt(mv.dataset.mv, 10);
        save(p => {
          const i = p.order.indexOf(k), j = i + d;
          if (i < 0 || j < 0 || j >= p.order.length) return;
          p.order.splice(i, 1); p.order.splice(j, 0, k);
        });
      }
    });
    document.addEventListener('keydown', onKey);
    draw();
  }

  window.LBToolEdit = { apply: apply };
})();
