/**
 * LALABELLA ADMIN GATE — one shared lock for every admin page
 * (Chocolate Admin, Flower Admin, Item Admin).
 *
 * Put in <head>, after shared/config.js and auth-guard.js:
 *   <script src="shared/admin-gate.js" data-title="Flower Admin"></script>
 *
 * - Only accounts with the Admin role get past it (checked on the server).
 * - The Admin must type their own login password (no shared "12345").
 * - Unlocking is shared with User Management and lasts 15 minutes after
 *   the last admin action, so moving between admin pages doesn't keep
 *   asking. Uses the Auth backend: adminPing / adminUnlock.
 */
(function () {
  const me = document.currentScript;
  const title = (me && me.getAttribute('data-title')) || 'Admin';

  const css = document.createElement('style');
  css.textContent = [
    'html.lbgate-locked body > *:not(.lbgate){visibility:hidden!important}',
    '.lbgate{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:18px;background:linear-gradient(160deg,#fdf1f0,#eef5f0);font-family:"Space Grotesk",system-ui,sans-serif}',
    '.lbgate-card{background:#fff;border:1px solid #efe0df;border-radius:18px;padding:30px 26px;width:min(360px,100%);text-align:center;box-shadow:0 14px 40px rgba(158,47,74,.14)}',
    '.lbgate-card h2{font-family:"Fraunces",Georgia,serif;margin:6px 0 4px;color:#3a2a2e;font-size:21px}',
    '.lbgate-card p{font-size:12.5px;color:#8a7078;margin:0 0 16px;line-height:1.5}',
    '.lbgate-card input{width:100%;box-sizing:border-box;border:1px solid #ecdcdc;border-radius:10px;padding:11px 12px;font-size:14px;text-align:center;margin-bottom:10px;font-family:inherit;outline:none}',
    '.lbgate-card input:focus{border-color:#9e2f4a}',
    '.lbgate-card button{width:100%;border:0;border-radius:10px;padding:11px;font-weight:700;font-size:14px;cursor:pointer;background:linear-gradient(135deg,#c9506b,#9e2f4a);color:#fff;font-family:inherit}',
    '.lbgate-card button:disabled{opacity:.6;cursor:default}',
    '.lbgate-msg{font-size:12px;color:#c0392b;margin-top:10px;min-height:1em}',
    '.lbgate-home{display:inline-block;margin-top:14px;font-size:12px;color:#8a7078}'
  ].join('\n');
  document.head.appendChild(css);
  document.documentElement.classList.add('lbgate-locked');

  function token() { return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; }
  function user() {
    try { return window.LALABELLA_USER || JSON.parse(sessionStorage.getItem('lalabellaUser') || localStorage.getItem('lalabellaUser') || '{}') || {}; }
    catch (e) { return {}; }
  }
  // Never wait forever: Apps Script can be slow to wake up, so give up
  // after 20s and let the person retry instead of staring at "Checking…".
  async function call(params) {
    const p = new URLSearchParams(Object.assign({}, params, { token: token() }));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(LB_CONFIG.AUTH_API + '?' + p.toString(), { signal: ctrl.signal });
      const text = await res.text();
      try { return JSON.parse(text); }
      catch (e) { throw new Error('bad-response'); }
    } finally { clearTimeout(timer); }
  }

  let gate;
  function unlock() {
    document.documentElement.classList.remove('lbgate-locked');
    if (gate) gate.remove();
  }
  function card(html) {
    if (!gate) { gate = document.createElement('div'); gate.className = 'lbgate'; document.body.appendChild(gate); }
    gate.innerHTML = '<div class="lbgate-card">' + html + '<br><a class="lbgate-home" href="index.html">← Back to Home</a></div>';
  }
  function showDenied() {
    card('<div style="font-size:36px">🔒</div><h2>' + title + '</h2><p>Admins only. Ask an admin if you need access.</p>');
  }
  function showPassword() {
    card('<div style="font-size:36px">🔐</div><h2>' + title + '</h2><p>Enter your own login password to continue. It stays unlocked for 15 minutes while you work.</p>' +
      '<input type="password" id="lbgatePw" placeholder="Your password" autocomplete="current-password">' +
      '<button type="button" id="lbgateBtn">Unlock</button><div class="lbgate-msg" id="lbgateMsg"></div>');
    const pw = document.getElementById('lbgatePw'), btn = document.getElementById('lbgateBtn'), msg = document.getElementById('lbgateMsg');
    async function go() {
      if (!pw.value) { msg.textContent = 'Enter your password.'; return; }
      btn.disabled = true; btn.textContent = 'Checking…'; msg.textContent = '';
      try {
        const d = await call({ action: 'adminUnlock', password: pw.value });
        if (d.success) { unlock(); return; }
        if (/admins only/i.test(d.error || '')) { showDenied(); return; }
        msg.textContent = d.error || 'Could not unlock.'; pw.value = ''; pw.focus();
      } catch (e) { msg.textContent = e && e.name === 'AbortError' ? 'The server is taking too long — please try again.' : 'Could not reach the server — please try again.'; }
      btn.disabled = false; btn.textContent = 'Unlock';
    }
    btn.addEventListener('click', go);
    pw.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    setTimeout(() => pw.focus(), 50);
  }

  async function start() {
    const u = user();
    if (u.role && String(u.role).toLowerCase() !== 'admin') { showDenied(); return; }
    // Show the password box right away (no waiting on a slow server), and
    // check in the background — if this login is already unlocked (e.g.
    // from User Management a few minutes ago) the page just opens.
    showPassword();
    try {
      const d = await call({ action: 'adminPing' });
      if (d.success) { unlock(); return; }
      if (/admins only/i.test(d.error || '')) { showDenied(); return; }
      if (d.error && !d.reauth) console.warn('[admin-gate] adminPing:', d.error);
    } catch (e) { console.warn('[admin-gate]', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
