/* ==========================================================
   NOVA / JOYBOY OFFLINE BRAIN  — no AI API, no subscription.
   Runs entirely in the browser. It understands English + Taglish,
   answers from a built-in knowledge base, and reads LIVE data from
   the same Lalabella functions the dashboards already use (using the
   logged-in user's own token) — so "ilan stock ng red rose sa Hamala?"
   still works with no OpenAI.

   Use:
     const r = await LBNovaBrain.ask('stock ng red rose');
     // -> { handled:true, text:'...', navigateTo:'flower-dashboard.html'? }  or { handled:false }
   Teach it new things (any page, any time):
     LBNovaBrain.learn({ keys:['wifi password','password ng wifi'], en:'…', tl:'…' })
   ========================================================== */
(function () {
  if (window.LBNovaBrain) return;
  var CFG = window.LB_CONFIG || {};
  var BRANCHES = { modamall: 'ModaMall', moda: 'ModaMall', hamala: 'Hamala', galali: 'Galali', qalali: 'Galali' };

  /* ---------------------------------------------------------- helpers */
  function token() { try { return window.LALABELLA_TOKEN || sessionStorage.getItem('lalabellaToken') || localStorage.getItem('lalabellaToken') || ''; } catch (e) { return ''; } }
  function me() { try { return JSON.parse(sessionStorage.getItem('lalabellaUser') || localStorage.getItem('lalabellaUser') || '{}') || {}; } catch (e) { return {}; } }
  function norm(t) {
    return String(t || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9ñ%+\-*/×÷.:() ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function words(t) { return norm(t).split(' ').filter(Boolean); }
  var TL_HINT = /\b(ang|ng|sa|mga|ako|ko|mo|ba|po|pa|na|yung|ung|ilan|meron|mayroon|wala|paano|pano|ano|sino|kailan|kelan|saan|nasaan|bukas|ngayon|kanina|pwede|puwede|gusto|buksan|punta|pumunta|ubos|kulang|salamat|kumusta|musta|boss|opo|oo|hindi|di|tulong|paki|pakibukas|dami|konti)\b/;
  function isTl(t) { return TL_HINT.test(norm(t)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function L(raw, en, tl) { return isTl(raw) && tl ? tl : en; }
  function lev(a, b) {
    var m = a.length, n = b.length, i, j, dp = [];
    for (i = 0; i <= m; i++) { dp[i] = [i]; }
    for (j = 0; j <= n; j++) { dp[0][j] = j; }
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return dp[m][n];
  }
  function sim(a, b) { a = norm(a); b = norm(b); if (!a && !b) return 1; return 1 - lev(a, b) / Math.max(a.length, b.length, 1); }
  // how well does the spoken/typed `q` match the item name `name` (0..1)
  function nameScore(q, name) {
    q = norm(q).replace(/s\b/g, ''); var n = norm(name).replace(/s\b/g, '');
    if (!q || !n) return 0;
    if (q === n) return 1;
    var qw = q.split(' '), nw = n.split(' ');
    var allIn = qw.every(function (w) { return n.indexOf(w) >= 0; });
    if (allIn) return 0.9 - Math.min(0.2, (nw.length - qw.length) * 0.03);
    if (n.indexOf(q) >= 0 || q.indexOf(n) >= 0) return 0.8;
    var hit = 0; qw.forEach(function (w) { if (nw.some(function (x) { return x === w || (w.length > 3 && sim(w, x) > 0.8); })) hit++; });
    var part = hit / qw.length;
    return Math.max(part * 0.75, sim(q, n) * 0.85);
  }
  function fmtNum(v) { var n = Number(v); return isFinite(n) ? (Math.round(n * 100) / 100).toLocaleString('en-US') : String(v == null ? '-' : v); }

  /* ---------------------------------------------------------- live data */
  var cache = {};
  function headers() { return { apikey: CFG.SUPABASE_PUBLISHABLE_KEY || '' }; }
  function getJson(base, params, ttl) {
    if (!base) return Promise.reject(new Error('no-endpoint'));
    var p = Object.assign({ token: token() }, params);
    var url = base + '?' + new URLSearchParams(p).toString();
    var key = base + '|' + JSON.stringify(params);
    var c = cache[key]; if (c && Date.now() - c.ts < (ttl || 60000)) return Promise.resolve(c.d);
    return fetch(url, { headers: headers() }).then(function (r) { return r.json(); }).then(function (d) {
      cache[key] = { ts: Date.now(), d: d }; return d;
    });
  }
  function offlineNet() { return typeof navigator !== 'undefined' && navigator.onLine === false; }
  var NO_NET = { handled: true, text: '' };
  function netMsg(raw) { return { handled: true, text: L(raw, "I can't reach the server right now, Boss — check your internet. I can still answer system questions and open pages.", 'Wala akong makuhang data ngayon, Boss — check mo ang internet. Pero nasasagot ko pa rin mga tanong tungkol sa system at nabubuksan ko ang mga page.') }; }

  function stockFlower(branch) { return getJson(CFG.FLOWER_FAST_API, { action: 'getFlowerDashboard', branch: branch || 'All' }, 90000); }
  function stockChoco(branch) { return getJson(CFG.CHOCOLATE_FAST_API || (CFG.SUPABASE_URL + '/functions/v1/chocolate-fast'), { action: 'getDashboardData', branch: branch || 'All' }, 90000); }
  function stockItems(branch) { return getJson(CFG.ITEM_FAST_API, { action: 'getItemInventory', branch: branch || 'All' }, 90000); }

  /* ---------------------------------------------------------- pages */
  var PAGES = [
    ['chocolate-release.html', 'Chocolate Release', /choco(late)?\s*(release|out)|release choco/],
    ['chocolate-receiving.html', 'Chocolate Receiving', /choco(late)?\s*(receiving|receive|in)\b|receive choco/],
    ['chocolate-arrangements.html', 'Chocolate Arrangements', /arrangement|box recipe/],
    ['chocolate-barcode.html', 'Chocolate Barcode', /choco(late)?\s*barcode/],
    ['chocolate-admin.html', 'Chocolate Admin', /choco(late)?\s*admin/],
    ['chocolate-calc.html', 'Chocolate Calculator', /choco(late)?\s*(calc|calculator|price)|price calculator/],
    ['chocolate-odoo-import.html', 'Chocolate Odoo Import', /choco(late)?\s*odoo/],
    ['chocolate-guide.html', 'Chocolate Guide', /choco(late)?\s*guide/],
    ['dashboard.html', 'Chocolate Dashboard', /choco(late)?\s*dashboard|^dashboard$/],
    ['stock-count.html', 'Stock Count', /stock\s*count|bilang ng stock|count stock/],
    ['stock-approval.html', 'Stock Approval', /stock\s*approval|approve stock|approval/],
    ['initial-stock.html', 'Initial Stock', /initial stock/],
    ['flower-dashboard.html', 'Flower Dashboard', /flower\s*dashboard/],
    ['flower-receiving.html', 'Flower Receiving', /flower\s*(receiving|receive)/],
    ['flower-purchase.html', 'Flower Purchase', /flower\s*purchase|purchase flower|bili ng flower/],
    ['flower-stock-count.html', 'Flower Stock Count', /flower\s*stock\s*count/],
    ['flower-transfer.html', 'Flower Transfer', /flower\s*transfer/],
    ['flower-catalog.html', 'Flower Catalog', /flower\s*catalog/],
    ['flower-barcode.html', 'Flower Barcode', /flower\s*barcode/],
    ['flower-admin.html', 'Flower Admin', /flower\s*admin/],
    ['flower-calc.html', 'Flower Calculator', /flower\s*(calc|calculator|price)/],
    ['flower-odoo-import.html', 'Flower Odoo Import', /flower\s*odoo/],
    ['flower-guide.html', 'Flower Guide', /flower\s*guide/],
    ['flower-tools.html', 'Flower Home', /flower\s*(home|tools|system)|^flower$/],
    ['item-dashboard.html', 'Item Dashboard', /item\s*dashboard/],
    ['item-admin.html', 'Item Admin', /item\s*admin/],
    ['item-odoo-import.html', 'Item Odoo Import', /item\s*odoo/],
    ['item-inventory.html', 'Item Inventory', /item\s*(inventory|inv)|supplies|inventory/],
    ['petty-cash.html', 'Petty Cash & Cash', /petty\s*cash|\bcash\b/],
    ['schedule.html', 'Duty Schedule', /duty\s*schedule|schedule|\bduty\b|\bsched\b/],
    ['schedule-admin.html', 'Schedule Admin', /schedule\s*admin|upload schedule/],
    ['card-print.html', 'Card Print', /card\s*print|print (a )?card|\bcards?\b/],
    ['order-form.html', 'Order Form', /order\s*form|\border\b/],
    ['notes.html', 'Notes', /\bnotes?\b/],
    ['chatbox.html', 'Chat', /\bchat(box)?\b|messages?/],
    ['profile.html', 'My Profile', /\bprofile\b/],
    ['branch-config.html', 'Branch Config', /branch\s*config|branch settings/],
    ['user-admin.html', 'User Management', /user\s*(management|admin)|users\b|accounts?/],
    ['brain.html', 'Brain Vault', /brain\s*vault|\bbrain\b/],
    ['nova-command-center.html', 'NOVA Command Center', /\bnova\b|command center|joyboy/],
    ['chocolate-calc.html', 'Chocolate Calculator', /calculator/],
    ['index.html', 'Home', /\bhome\b|main (page|menu)|^menu$/]
  ];
  function findPage(t) {
    for (var i = 0; i < PAGES.length; i++) if (PAGES[i][2].test(t)) return PAGES[i];
    return null;
  }

  /* ---------------------------------------------------------- knowledge base */
  // keys = phrases (any word-overlap scoring); en / tl = answers.  Add more with LBNovaBrain.learn().
  var KB = [
    { id: 'receive', keys: ['how to receive stock', 'receiving', 'receive items', 'paano mag receive', 'mag receive ng stock', 'tanggap ng stock'],
      en: 'To receive stock: open Receiving (Chocolate, Flower or Item), search the item, enter the quantity (and expiry for chocolate), then submit. The total updates right away.',
      tl: 'Para mag-receive: buksan ang Receiving (Chocolate, Flower o Item), hanapin ang item, ilagay ang dami (at expiry kung chocolate), tapos submit. Agad na mag-a-update ang total.', page: 'chocolate-receiving.html' },
    { id: 'release', keys: ['how to release stock', 'release items', 'paano mag release', 'mag release ng stock', 'ilabas ang stock'],
      en: 'To release stock: open Chocolate Release, search or scan the item, enter the quantity and the reason (order, event, etc.), then confirm. It subtracts from the batch with the nearest expiry first.',
      tl: 'Para mag-release: buksan ang Chocolate Release, hanapin o i-scan ang item, ilagay ang dami at dahilan (order, event), tapos confirm. Unang binabawasan ang batch na pinakamalapit mag-expire.', page: 'chocolate-release.html' },
    { id: 'transfer', keys: ['how to transfer', 'transfer items between branches', 'paano mag transfer', 'ilipat sa ibang branch', 'transfer ng stock'],
      en: 'To transfer between branches: use Transfer (Flower Transfer or the Transfer tab in Item Inventory). Pick the item, the From branch, the To branch and the quantity.',
      tl: 'Para mag-transfer sa ibang branch: gamitin ang Transfer (Flower Transfer o Transfer tab sa Item Inventory). Piliin ang item, From branch, To branch at dami.', page: 'flower-transfer.html' },
    { id: 'stockcount', keys: ['how to stock count', 'physical count', 'paano mag stock count', 'bilang ng stock', 'inventory count'],
      en: 'Stock Count: enter the physical quantity you counted per item. The system compares it with the recorded quantity and sends the variance to Stock Approval for an admin to approve.',
      tl: 'Stock Count: ilagay ang aktwal na bilang ng bawat item. Ikukumpara ng system sa nakatala at ipapadala ang pagkakaiba sa Stock Approval para i-approve ng admin.', page: 'stock-count.html' },
    { id: 'approval', keys: ['stock approval', 'approve stock count', 'paano mag approve', 'pending approvals'],
      en: 'Stock Approval is where an admin reviews submitted counts. Approving applies the new quantities; rejecting leaves the stock unchanged.',
      tl: 'Sa Stock Approval nire-review ng admin ang mga na-submit na count. Kapag in-approve, mag-a-apply ang bagong dami; kapag nireject, walang magbabago.', page: 'stock-approval.html' },
    { id: 'barcode', keys: ['barcode', 'print barcode', 'label', 'paano mag print ng barcode', 'sticker label'],
      en: 'Open the Barcode tool (Chocolate, Flower or Item), find the item and print its label from there.',
      tl: 'Buksan ang Barcode tool (Chocolate, Flower o Item), hanapin ang item at i-print ang label doon.', page: 'chocolate-barcode.html' },
    { id: 'card', keys: ['print a card', 'card print', 'greeting card', 'paano mag print ng card', 'card message'],
      en: 'Card Print: paste or type the message, choose size, font, and a background, adjust the print position if needed, then press Print Card. You can also save a card and load it later.',
      tl: 'Card Print: i-paste o i-type ang message, pumili ng size, font at background, ayusin ang print position kung kailangan, tapos Print Card. Pwede mo ring i-save at i-load mamaya.', page: 'card-print.html' },
    { id: 'schedule', keys: ['duty schedule', 'my schedule', 'how schedule works', 'paano makita schedule', 'schedule ko', 'ano ang schedule'],
      en: 'Duty Schedule shows shifts and days off on a calendar. Tap My Schedule to see or edit yours; tap any date to add a note or reminder. Today is shaded.',
      tl: 'Ipinapakita ng Duty Schedule ang shift at day off sa calendar. I-tap ang My Schedule para makita o i-edit ang sa iyo; i-tap ang kahit anong petsa para magdagdag ng note o reminder. May shade ang ngayon.', page: 'schedule.html' },
    { id: 'reminder', keys: ['reminder', 'set reminder', 'alarm', 'paano mag lagay ng reminder', 'paalala'],
      en: 'Open Duty Schedule, tap a date, then fill in the reminder (and time). It will ring on any page while the website is open, until you mark it done or snooze it.',
      tl: 'Buksan ang Duty Schedule, i-tap ang petsa, tapos ilagay ang reminder (at oras). Tutunog ito sa kahit anong page habang bukas ang website, hanggang i-done o i-snooze mo.', page: 'schedule.html' },
    { id: 'dayoff', keys: ['day off alarm', 'day off animation', 'day off sound', 'rooster', 'manok alarm'],
      en: 'On your day off, opening My Schedule plays the day-off animation and sound once per day. Change the sound, GIF and volume with the 🎭 button on the schedule page.',
      tl: 'Pag day off mo at binuksan mo ang My Schedule, tutunog at lalabas ang animation isang beses sa isang araw. Palitan ang sound, GIF at volume sa 🎭 button ng schedule page.', page: 'schedule.html' },
    { id: 'petty', keys: ['petty cash', 'cash count', 'how petty cash works', 'paano petty cash'],
      en: 'Petty Cash & Cash has two tabs: Petty Cash (log expenses and top-ups per branch, with a target float) and Cash (log the end-of-day count by denomination, then mark it as sent). Printing a cash count also prints that branch\'s petty cash history.',
      tl: 'May dalawang tab ang Petty Cash & Cash: Petty Cash (itala ang gastos at top-up kada branch) at Cash (itala ang bilang sa katapusan ng araw kada denomination, tapos i-mark na naipadala). Kasama sa print ng cash count ang petty cash history ng branch.', page: 'petty-cash.html' },
    { id: 'order', keys: ['order form', 'how to make order', 'paano gumawa ng order'],
      en: 'Order Form is where you fill in a customer order. Open it, complete the details and submit — the branch assignment tool picks it up.',
      tl: 'Sa Order Form mo nilalagay ang order ng customer. Buksan, kumpletuhin ang detalye at i-submit.', page: 'order-form.html' },
    { id: 'notes', keys: ['notes', 'how notes work', 'paano mag notes'],
      en: 'Notes lets you keep personal or shared notes. Open Notes, add a new note, and it saves to your account.', tl: 'Sa Notes pwede kang mag-save ng personal o shared na notes. Buksan ang Notes, magdagdag, at mase-save sa account mo.', page: 'notes.html' },
    { id: 'chat', keys: ['chat', 'message coworker', 'send gif', 'paano mag chat', 'group chat'],
      en: 'Use the chat bubble on any page to message coworkers. You can send photos, GIFs and favourites.',
      tl: 'Gamitin ang chat bubble sa kahit anong page para mag-message sa katrabaho. Pwede kang magpadala ng photo, GIF at favourites.', page: 'chatbox.html' },
    { id: 'login', keys: ['login', 'log in', 'logout', 'password', 'forgot password', 'hindi ako makalogin', 'cant login', 'reset password'],
      en: 'You log in once and it works across the whole site for 24 hours. If you cannot log in or forgot your password, ask an admin to reset it in User Management.',
      tl: 'Isang login lang para sa buong site, valid ng 24 oras. Kung hindi ka makalogin o nakalimutan ang password, magpa-reset sa admin sa User Management.' },
    { id: 'users', keys: ['add user', 'new user', 'create account', 'user management', 'paano magdagdag ng user'],
      en: 'Admins add and manage staff accounts, roles and reminders in User Management.', tl: 'Ang admin ang nagdadagdag at nag-aayos ng account, role at reminders sa User Management.', page: 'user-admin.html' },
    { id: 'branches', keys: ['branches', 'how many branches', 'ilang branch', 'anong branch'],
      en: 'Lalabella has three branches: ModaMall, Hamala and Galali.', tl: 'Tatlo ang branch ng Lalabella: ModaMall, Hamala at Galali.' },
    { id: 'systems', keys: ['what is chocolate system', 'what is flower system', 'what is item inventory', 'systems', 'anong system', 'ano ang mga system'],
      en: 'There are three inventory systems: Chocolate (receiving, release, barcode, dashboard, stock count and arrangements), Flower (receiving, purchase, transfer, stock count, catalog, dashboard) and Item Inventory (ribbon, vases, packaging and assets). All track the three branches live.',
      tl: 'May tatlong inventory system: Chocolate (receiving, release, barcode, dashboard, stock count, arrangements), Flower (receiving, purchase, transfer, stock count, catalog, dashboard) at Item Inventory (ribbon, vase, packaging at assets). Live ang tracking sa tatlong branch.' },
    { id: 'arrange', keys: ['chocolate arrangements', 'box recipe', 'scan arrangement', 'deluxe box'],
      en: 'Chocolate Arrangements is a catalog of named box recipes. Scan a recipe\'s barcode on Chocolate Release and it fills the cart with its chocolates, using the batch with the soonest expiry. The catalog itself never changes stock.',
      tl: 'Ang Chocolate Arrangements ay catalog ng mga box recipe. I-scan ang barcode ng recipe sa Chocolate Release at mapupuno ang cart, gamit ang batch na pinakamalapit mag-expire. Hindi nagbabago ang stock hangga\'t hindi nag-Release.', page: 'chocolate-arrangements.html' },
    { id: 'expiry', keys: ['expiry', 'expired', 'near expiry', 'fifo', 'paso na', 'malapit mag expire'],
      en: 'Chocolate is tracked per batch with an expiry date. Release always takes the soonest-expiry batch first, and the Chocolate Dashboard lists near-expiry and expired items. Ask me "near expiry" for the live list.',
      tl: 'Per batch ang chocolate na may expiry date. Laging unang nare-release ang pinakamalapit mag-expire, at nasa Chocolate Dashboard ang near-expiry at expired. Itanong mo "near expiry" para sa live list.' },
    { id: 'theme', keys: ['dark mode', 'theme', 'light mode', 'dark theme'],
      en: 'The theme follows your device. The page menu has the theme toggle too.', tl: 'Sumusunod ang theme sa device mo. Nasa menu din ang toggle.' },
    { id: 'print', keys: ['printer', 'printing problem', 'hindi nagpe print', 'print not full', 'borderless', 'print margin'],
      en: 'For printing: set Margins to None, turn Background graphics ON, scale 100%, and on the Epson choose Borderless with Minimum expansion. Card Print also extends the background 3 mm past the edges.',
      tl: 'Sa printing: Margins None, Background graphics ON, scale 100%, at sa Epson piliin ang Borderless na Minimum ang expansion. Nilalampasan din ng Card Print ang background ng 3 mm sa gilid.' },
    { id: 'nova', keys: ['what is nova', 'who is joyboy', 'what can you do', 'help', 'commands', 'ano kaya mo', 'tulong'],
      en: 'I am Nova / Joyboy, the Lalabella assistant. I work fully offline from my own brain — no AI subscription. Ask me for live stock ("stock of red rose"), low stock, near expiry, my schedule or reminders, open any page, do quick math, the time in Bahrain or the Philippines, or how any tool works.',
      tl: 'Ako si Nova / Joyboy, ang assistant ng Lalabella. Gumagana ako offline gamit ang sarili kong utak — walang AI subscription. Tanungin mo ako ng live stock ("stock ng red rose"), low stock, near expiry, schedule o reminders mo, buksan ang kahit anong page, simpleng computation, oras sa Bahrain o Pilipinas, o kung paano gumagana ang mga tool.' }
  ];
  var learned = [];
  function kbSearch(raw) {
    var q = norm(raw), qw = q.split(' ').filter(function (w) { return w.length > 2; });
    var best = null, bestS = 0;
    KB.concat(learned).forEach(function (e) {
      e.keys.forEach(function (k) {
        var kn = norm(k), s = 0;
        if (q === kn) s = 1.5; else if (q.indexOf(kn) >= 0 && kn.length > 4) s = 1.2;
        else {
          var kw = kn.split(' ').filter(function (w) { return w.length > 2; }); if (!kw.length) return;
          var hit = 0; kw.forEach(function (w) { if (qw.some(function (x) { return x === w || (w.length > 4 && sim(x, w) > 0.82); })) hit++; });
          s = (hit / kw.length) * (hit / Math.max(qw.length, 1)) * 1.1;
        }
        if (s > bestS) { bestS = s; best = e; }
      });
    });
    return bestS >= 0.5 ? { e: best, s: bestS } : null;
  }

  /* ---------------------------------------------------------- small talk */
  var JOKES = [
    'Why did the flower get promoted? It really knew how to bloom under pressure.',
    'What do you call a chocolate that tells secrets? A leaky praline.',
    'Why was the rose so calm? Because it had thorn-ough planning.',
    'My stock count and I have a lot in common — we both come up short when it matters.'
  ];
  var JOKES_TL = ['Bakit hindi nagagalit ang rosas? Kasi marunong siyang mag-bloom ng pasensya.', 'Ano ang paboritong subject ng chocolate? Sweet-ematics.', 'Bakit magaling ang florist sa utang? Kasi lagi siyang may bouquet na pambayad.'];
  function smallTalk(raw, t) {
    var tl = isTl(raw), name = (me().fullName || me().username || '').split(' ')[0];
    if (/^(hi|hello|hey|yo|hola|good (morning|afternoon|evening)|kumusta|musta|magandang (umaga|hapon|gabi))( nova| joyboy| boss)?$/.test(t)) {
      var h = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bahrain', hour: 'numeric', hour12: false })) % 24;
      var part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
      return tl ? 'Hello Boss' + (name ? ' ' + name : '') + '! Anong maitutulong ko?' : 'Good ' + part + ', Boss' + (name ? ' ' + name : '') + '. What can I do for you?';
    }
    if (/^(thanks|thank you|ty|salamat|thanks nova|salamat po)\b/.test(t)) return pick(tl ? ['Walang anuman, Boss.', 'Anytime, Boss!'] : ["You're welcome, Boss.", 'Anytime, Boss!']);
    if (/^(bye|goodbye|see you|paalam|sige na)\b/.test(t)) return tl ? 'Sige Boss, ingat!' : 'See you, Boss!';
    if (/how are you|kumusta ka|musta ka|how r u/.test(t)) return tl ? 'Ayos lang ako, Boss — handa na. Ikaw?' : "Running smoothly, Boss. How about you?";
    if (/who are you|sino ka|what are you|your name|pangalan mo/.test(t)) return tl ? 'Ako si Nova (Joyboy), ang assistant ng Lalabella system.' : "I'm Nova — also called Joyboy — the Lalabella system assistant.";
    if (/who (made|built|created) you|sino gumawa sayo/.test(t)) return tl ? 'Si Bench ang gumawa sa akin para sa Lalabella.' : 'Bench built me for the Lalabella system.';
    if (/joke|patawa|biro/.test(t)) return pick(tl ? JOKES_TL : JOKES);
    if (/i love you|mahal kita/.test(t)) return tl ? 'Aww, salamat Boss! Balik tayo sa stock count. 😄' : 'Aww, thanks Boss! Now, back to the stock count. 😄';
    if (/are you (online|offline)|ai|openai|api/.test(t) && /(offline|online|api|openai|subscription)/.test(t))
      return tl ? 'Offline mode ako ngayon — sarili kong utak ang gamit ko, walang AI API o subscription. Live data lang ang kinukuha ko sa system.' : "I'm in offline mode — I run on my own built-in brain with no AI API or subscription. I only fetch live data from your system.";
    return null;
  }

  /* ---------------------------------------------------------- time / math */
  function tzTime(tz, opts) { return new Date().toLocaleString('en-US', Object.assign({ timeZone: tz }, opts)); }
  function timeIntent(raw, t) {
    if (!/\b(time|oras|date|petsa|day|araw|today|ngayon)\b/.test(t)) return null;
    if (/(what|anong|ano|tell|current|time|oras|date|petsa|day|araw)/.test(t) && !/(stock|schedule|reminder|off|duty|sales|order)/.test(t)) {
      var ph = /(philippines|pilipinas|pinas|manila|laguna|pedro|ph)\b/.test(t), bh = /(bahrain|bh)\b/.test(t);
      var wantDate = /\b(date|petsa|day|araw|today)\b/.test(t) && !/\b(time|oras)\b/.test(t);
      function one(tz, label) { return wantDate ? label + ': ' + tzTime(tz, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : label + ': ' + tzTime(tz, { hour: 'numeric', minute: '2-digit', weekday: 'short' }); }
      if (ph && !bh) return one('Asia/Manila', 'Philippines');
      if (bh && !ph) return one('Asia/Bahrain', 'Bahrain');
      return one('Asia/Bahrain', 'Bahrain') + '  ·  ' + one('Asia/Manila', 'Philippines');
    }
    return null;
  }
  function mathIntent(raw) {
    var s = String(raw).toLowerCase().replace(/,/g, '').replace(/[×x]\s*(?=\d)/g, '*').replace(/÷/g, '/').replace(/\bplus\b/g, '+').replace(/\bminus\b/g, '-').replace(/\b(times|multiplied by)\b/g, '*').replace(/\b(divided by|over)\b/g, '/');
    var m = s.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of|ng)\s*(\d+(?:\.\d+)?)/);
    if (m) return m[1] + '% of ' + m[2] + ' = ' + fmtNum(Number(m[1]) / 100 * Number(m[2]));
    s = s.replace(/^(?:ano ang|what is|what's|whats|compute|calculate|kuwentahin|ilan ang|how much is|magkano ang)\s+/, '').replace(/\?$/, '').trim();
    if (!/^[\d\s+\-*/().]+$/.test(s) || !/\d\s*[+\-*/]\s*[\d(]/.test(s)) return null;
    try { var v = Function('"use strict";return (' + s + ')')(); if (typeof v === 'number' && isFinite(v)) return s.replace(/\s+/g, ' ') + ' = ' + fmtNum(v); } catch (e) {}
    return null;
  }

  /* ---------------------------------------------------------- live: stock */
  function branchIn(t) { for (var k in BRANCHES) if (new RegExp('\\b' + k + '\\b').test(t)) return BRANCHES[k]; return ''; }
  function extractItem(t) {
    var s = ' ' + t + ' ';
    s = s.replace(/\b(modamall|moda|hamala|galali|qalali)\b/g, ' ')
      .replace(/\b(what is|whats|what are|how many|how much|how much is|is there|are there|do we have|do you have|check|show|tell me|get|look up|lookup|search|find|can you|please|pls|paki|pakicheck|pakisabi|sabihin|hanapin|tingnan|check mo|ilan|magkano|meron|mayroon|may|ba|pa|ang|yung|ung|ng|na|ang dami ng|dami ng|dami|stock|stocks|stocked|left|remaining|available|availability|quantity|qty|count|on hand|in stock|sa|at|in|for|of|the|a|an|is|are|do|we|have|there|me|mo|ko|po|nga|natin|namin|natitira|natira|tira|pang|mga|item|items|flower|flowers|chocolate|chocolates|branch|currently|right now|now|ngayon)\b/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }
  function stockLines(list, q, nameKey, qtyKey, unitKey) {
    var scored = (list || []).map(function (it) { return { it: it, s: nameScore(q, it[nameKey]) }; }).filter(function (x) { return x.s >= 0.55; });
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored.slice(0, 5).map(function (x) { return x.it; });
  }
  function stockQuery(raw, t, ctx) {
    var branch = branchIn(t), q = extractItem(t);
    if (!q && ctx.item) q = ctx.item;
    if (!q) return Promise.resolve({ handled: true, text: L(raw, 'Which item, Boss? e.g. "stock of red rose".', 'Anong item, Boss? Hal. "stock ng red rose".') });
    ctx.item = q; if (branch) ctx.branch = branch;
    var wantFlower = /flower|rose|tulip|lily|carnation|baby breath|gypsophila|orchid|sunflower|bulaklak/.test(t) && !/choco/.test(t);
    var wantChoco = /choco|ferrero|kinder|bar\b|praline|truffle/.test(t);
    var wantItem = /\bitem|ribbon|vase|packaging|box|wrap|paper|asset/.test(t);
    var all = !(wantFlower || wantChoco || wantItem);
    var jobs = [];
    if (all || wantFlower) jobs.push(stockFlower(branch).then(function (d) { return { kind: 'Flower', rows: stockLines(d && d.itemStockLevels, q, 'name') }; }).catch(function () { return { kind: 'Flower', err: 1 }; }));
    if (all || wantChoco) jobs.push(stockChoco(branch).then(function (d) { return { kind: 'Chocolate', rows: stockLines(d && d.itemStockLevels, q, 'name') }; }).catch(function () { return { kind: 'Chocolate', err: 1 }; }));
    if (all || wantItem) jobs.push(stockItems(branch).then(function (d) {
      var rows = Array.isArray(d) ? d : (d && d.items) || [];
      var best = stockLines(rows, q, 'Item Name');
      return { kind: 'Item', rows: best.map(function (r) { return { name: r['Item Name'], stock: r['Total Qty'] != null ? r['Total Qty'] : (r['Qty'] != null ? r['Qty'] : r['Stock']), unit: r['Unit'] || '' }; }) };
    }).catch(function () { return { kind: 'Item', err: 1 }; }));
    think('Checking Flower, Chocolate and Item stock for "' + q + '"' + (branch ? ' at ' + branch : '') + '…', 'Chine-check ko ang Flower, Chocolate at Item stock para sa "' + q + '"' + (branch ? ' sa ' + branch : '') + '…', raw);
    return Promise.all(jobs).then(function (res) {
      var lines = [], errs = 0, any = 0;
      res.forEach(function (r) {
        if (r.err) { errs++; return; }
        (r.rows || []).forEach(function (x) { any++; lines.push('• ' + (x.name) + ' — ' + fmtNum(x.stock) + (x.unit ? ' ' + x.unit : '') + ' (' + r.kind + ')'); });
      });
      var where = branch ? ' sa ' + branch : '';
      if (any) {
        var nums = []; res.forEach(function (r) { (r.rows || []).forEach(function (x) { nums.push(Number(x.stock)); }); });
        var mn = Math.min.apply(null, nums), ins = '';
        if (mn <= 0) ins = tip(raw, 'Thought: one of these is out of stock — worth a purchase or a transfer from another branch.', 'Naisip ko: may isang ubos na — baka kailangan nang bumili o mag-transfer sa ibang branch.');
        else if (mn < 10) ins = tip(raw, 'Thought: that is running thin (' + fmtNum(mn) + ' left). Ask me "low stock" to see what else needs topping up.', 'Naisip ko: konti na lang (' + fmtNum(mn) + ' na lang). Itanong mo ang "low stock" para makita ang iba pang kulang.');
        else if (nums.length > 1) ins = tip(raw, 'Thought: several items match — say the full name or the branch if you need one exact number.', 'Naisip ko: marami ang tugma — sabihin ang buong pangalan o branch para isa lang ang lumabas.');
        return { handled: true, text: L(raw, 'Stock for "' + q + '"' + (branch ? ' at ' + branch : ' (all branches)') + ':\n' + lines.slice(0, 6).join('\n'), 'Stock ng "' + q + '"' + where + ':\n' + lines.slice(0, 6).join('\n')) + ins };
      }
      if (errs === res.length) return netMsg(raw);
      return { handled: true, text: L(raw, 'I could not find "' + q + '" in Flower, Chocolate or Item stock. Try another spelling, Boss.', 'Wala akong makitang "' + q + '" sa Flower, Chocolate o Item stock. Subukan ang ibang spelling, Boss.') };
    });
  }
  function lowStock(raw, t, ctx) {
    var branch = branchIn(t) || '';
    var wantF = !/choco/.test(t), wantC = !/flower/.test(t);
    think('Looking for items below their minimum stock…', 'Hinahanap ko ang mga item na below minimum stock…', raw);
    var jobs = [];
    if (wantF) jobs.push(stockFlower(branch).then(function (d) { return { k: 'Flower', rows: (d && d.lowStockList) || [], nf: function (r) { return r.Flower + ' (' + r.Branch + '): ' + fmtNum(r.AvailableQty) + '/' + fmtNum(r.MinStock); } }; }).catch(function () { return { err: 1 }; }));
    if (wantC) jobs.push(stockChoco(branch).then(function (d) { return { k: 'Chocolate', rows: (d && d.lowStockList) || [], nf: function (r) { return (r.name || r.Item || r.Chocolate || r['Chocolate Name']) + (r.branch || r.Branch ? ' (' + (r.branch || r.Branch) + ')' : '') + ': ' + fmtNum(r.stock != null ? r.stock : (r.AvailableQty != null ? r.AvailableQty : r.qty)) + (r.minStock != null || r.MinStock != null ? '/' + fmtNum(r.minStock != null ? r.minStock : r.MinStock) : ''); } }; }).catch(function () { return { err: 1 }; }));
    return Promise.all(jobs).then(function (res) {
      if (res.every(function (r) { return r.err; })) return netMsg(raw);
      var out = [], total = 0;
      res.forEach(function (r) { if (r.err) return; total += r.rows.length; if (r.rows.length) out.push(r.k + ' (' + r.rows.length + '):\n' + r.rows.slice(0, 8).map(function (x) { return '• ' + r.nf(x); }).join('\n') + (r.rows.length > 8 ? '\n…and ' + (r.rows.length - 8) + ' more' : '')); });
      if (!total) return { handled: true, text: L(raw, 'Nothing is below minimum stock right now' + (branch ? ' at ' + branch : '') + ', Boss. 🎉', 'Wala pong below minimum stock ngayon' + (branch ? ' sa ' + branch : '') + ', Boss. 🎉') };
      var worst = null, wd = -1; res.forEach(function (r) { if (r.err) return; r.rows.forEach(function (x) { var a = Number(x.AvailableQty != null ? x.AvailableQty : x.stock), m = Number(x.MinStock != null ? x.MinStock : x.minStock); if (isFinite(a) && isFinite(m) && m - a > wd) { wd = m - a; worst = x; } }); });
      var ins = worst && wd > 0 ? tip(raw, 'Thought: ' + (worst.Flower || worst.name || worst['Chocolate Name'] || 'the first one') + ' is the furthest below its minimum (short by ' + fmtNum(wd) + ') — I would restock that first.', 'Naisip ko: ' + (worst.Flower || worst.name || worst['Chocolate Name'] || 'yung una') + ' ang pinakamalayo sa minimum (kulang ng ' + fmtNum(wd) + ') — ito muna ang i-restock ko.') : tip(raw, 'Thought: ' + total + ' item' + (total > 1 ? 's' : '') + ' need attention — worth planning a purchase or transfer.', 'Naisip ko: ' + total + ' item ang kailangan ng aksyon — magplano na ng bili o transfer.');
      return { handled: true, text: L(raw, 'Low stock' + (branch ? ' at ' + branch : '') + ':\n' + out.join('\n'), 'Mababang stock' + (branch ? ' sa ' + branch : '') + ':\n' + out.join('\n')) + ins, navigateTo: null };
    });
  }
  function expiry(raw, t) {
    think('Checking the chocolate batches for expiry dates…', 'Chine-check ko ang expiry ng mga chocolate batch…', raw);
    return stockChoco(branchIn(t)).then(function (d) {
      var near = (d && d.nearExpiryList) || [], exp = (d && d.expiredList) || [];
      function nm(r) { return (r.name || r.Item || r['Chocolate Name'] || '?') + (r.expiry || r.expiryDate || r.Expiry ? ' — ' + (r.expiry || r.expiryDate || r.Expiry) : '') + (r.qty != null ? ' (' + fmtNum(r.qty) + ')' : ''); }
      var parts = [];
      if (exp.length) parts.push('Expired (' + exp.length + '):\n' + exp.slice(0, 6).map(function (r) { return '• ' + nm(r); }).join('\n'));
      if (near.length) parts.push('Near expiry (' + near.length + '):\n' + near.slice(0, 6).map(function (r) { return '• ' + nm(r); }).join('\n'));
      if (!parts.length) return { handled: true, text: L(raw, 'No expired or near-expiry chocolates right now, Boss.', 'Walang expired o malapit mag-expire na chocolate ngayon, Boss.') };
      return { handled: true, text: parts.join('\n') + tip(raw, exp.length ? 'Thought: pull the expired ones from the shelf now, and release the near-expiry batches first (soonest expiry goes out first).' : 'Thought: release these first — I would promote them or put them in arrangements before they expire.', exp.length ? 'Naisip ko: alisin na sa shelf ang expired, at i-release muna ang near-expiry (unang lumalabas ang pinakamalapit mag-expire).' : 'Naisip ko: i-release o i-promote muna ang mga ito bago mag-expire.') };
    }).catch(function () { return netMsg(raw); });
  }
  function summary(raw, t) {
    think('Pulling the latest numbers from the dashboards…', 'Kinukuha ko ang pinakabagong numbers sa dashboards…', raw);
    var branch = branchIn(t);
    var onlyF = /flower/.test(t) && !/choco/.test(t), onlyC = /choco/.test(t) && !/flower/.test(t);
    var jobs = [];
    if (!onlyF) jobs.push(stockChoco(branch).then(function (d) {
      d = d || {};
      return '🍫 Chocolate' + (branch ? ' (' + branch + ')' : '') + ': ' + fmtNum(d.totalAvailable) + ' pcs in stock · ' + fmtNum(d.lowStockCount || (d.lowStockList || []).length) + ' low · ' + fmtNum(d.nearExpiryCount || 0) + ' near expiry · ' + fmtNum(d.expiredCount || 0) + ' expired · today: ' + fmtNum(d.todayReceiving || 0) + ' received, ' + fmtNum(d.todayReleases || 0) + ' released';
    }).catch(function () { return null; }));
    if (!onlyC) jobs.push(stockFlower(branch).then(function (d) {
      d = d || {}; var q = d.quickStats || {}; var n = (d.itemStockLevels || []).length;
      return '🌸 Flower' + (branch ? ' (' + branch + ')' : '') + ': ' + fmtNum(n) + ' flower types tracked · ' + fmtNum((d.lowStockList || []).length) + ' below minimum' + (q.purchasedThisWeek != null ? ' · purchased this week: ' + fmtNum(q.purchasedThisWeek) : '');
    }).catch(function () { return null; }));
    return Promise.all(jobs).then(function (r) { r = r.filter(Boolean); var bad = r.join(' ').match(/(\d+) low|(\d+) near expiry|(\d+) below minimum/g) || []; var flagged = bad.filter(function (x) { return !/^0 /.test(x); }); return r.length ? { handled: true, text: r.join('\n') + (flagged.length ? tip(raw, 'Thought: heads-up — ' + flagged.join(', ') + '. Ask me "low stock" or "near expiry" for the details.', 'Naisip ko: heads-up — ' + flagged.join(', ') + '. Itanong ang "low stock" o "near expiry" para sa detalye.') : tip(raw, 'Thought: everything looks healthy right now.', 'Naisip ko: maayos ang lahat sa ngayon.')) } : netMsg(raw); });
  }

  /* ---------------------------------------------------------- live: schedule / reminders */
  var DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseYmd(s) { var m = String(s || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function mySchedule() {
    return getJson(CFG.SCHEDULE_FAST_API, { action: 'getMySchedule' }, 120000).then(function (d) {
      var map = {};
      ((d && d.schedule) || []).forEach(function (r) {
        var wk = parseYmd(r.WeekOf); var idx = DAYS.indexOf(String(r.Day).toUpperCase().slice(0, 3)); if (!wk || idx < 0) return;
        var dt = new Date(wk); dt.setDate(wk.getDate() + idx); map[ymd(dt)] = String(r.ScheduleDetail || '').trim();
      });
      return map;
    });
  }
  function bhToday() { var p = new Date(Date.now() + 3 * 3600 * 1000); return new Date(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate()); }
  function dayLabel(d) { return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }); }
  function scheduleIntent(raw, t) {
    think('Reading your duty schedule…', 'Binabasa ko ang duty schedule mo…', raw);
    return mySchedule().then(function (map) {
      var today = bhToday(), tl = isTl(raw);
      function at(off) { var d = new Date(today); d.setDate(d.getDate() + off); return { d: d, v: map[ymd(d)] }; }
      function say(x, when) { if (x.v == null || x.v === '') return (tl ? 'Wala pang naka-set na schedule para sa ' : 'No schedule set for ') + when + '.'; return /^off$/i.test(x.v) ? (tl ? 'Day off mo ' : "You're OFF ") + when + ' 🌴 (' + dayLabel(x.d) + ').' : (tl ? 'Duty mo ' : 'Your shift ') + when + ': ' + x.v + ' (' + dayLabel(x.d) + ').'; }
      if (!Object.keys(map).length) return { handled: true, text: L(raw, 'I could not find a schedule for you yet. Open My Schedule to enter it.', 'Wala pa akong makitang schedule mo. Buksan ang My Schedule para ilagay.'), navigateTo: null };
      if (/tomorrow|bukas/.test(t)) return { handled: true, text: say(at(1), tl ? 'bukas' : 'tomorrow') };
      if (/next off|susunod na (day )?off|next day off|kailan (ang )?(next |susunod )?(day )?off|when.*off/.test(t) || (/day ?off|\boff\b/.test(t) && !/today|ngayon/.test(t))) {
        for (var i = 0; i < 60; i++) { var x = at(i); if (/^off$/i.test(x.v || '')) return { handled: true, text: (i === 0 ? (tl ? 'Day off mo ngayon! 🌴' : "You're off today! 🌴") : (tl ? 'Susunod na day off mo: ' : 'Your next day off: ') + dayLabel(x.d) + (i === 1 ? (tl ? ' (bukas)' : ' (tomorrow)') : ' (in ' + i + ' days)')) + (i <= 2 ? tip(raw, 'Thought: almost there — rest up! 😄', 'Naisip ko: malapit na, konting tiis pa! 😄') : '') }; }
        return { handled: true, text: L(raw, 'No day off found in your schedule for the next 60 days.', 'Walang day off sa schedule mo sa susunod na 60 araw.') };
      }
      if (/this week|week|linggo|buong/.test(t)) {
        var lines = []; for (var j = 0; j < 7; j++) { var y = at(j); lines.push('• ' + dayLabel(y.d) + ': ' + (y.v ? (/^off$/i.test(y.v) ? 'OFF 🌴' : y.v) : '—')); }
        return { handled: true, text: L(raw, 'Your next 7 days:\n', 'Susunod na 7 araw mo:\n') + lines.join('\n') };
      }
      return { handled: true, text: say(at(0), tl ? 'ngayon' : 'today') };
    }).catch(function () { return netMsg(raw); });
  }
  function reminderIntent(raw) {
    think('Checking your reminders…', 'Chine-check ko ang mga reminder mo…', raw);
    return getJson(CFG.SCHEDULE_FAST_API, { action: 'getMyReminders' }, 30000).then(function (d) {
      var list = ((d && d.reminders) || []).filter(function (r) { return !r.done; });
      if (!list.length) return { handled: true, text: L(raw, 'You have no pending reminders, Boss. ✅', 'Wala kang pending na reminder, Boss. ✅') };
      return { handled: true, text: L(raw, 'You have ' + list.length + ' reminder' + (list.length > 1 ? 's' : '') + ':\n', 'May ' + list.length + ' kang reminder:\n') + list.slice(0, 6).map(function (r) { return '• ' + r.date + (r.remindTime ? ' ' + r.remindTime : '') + ' — ' + (r.reminder || r.note || ''); }).join('\n') + tip(raw, 'Thought: they ring on any page while the site is open — mark them done in Duty Schedule when finished.', 'Naisip ko: tutunog ang mga ito sa kahit anong page habang bukas ang site — i-done sa Duty Schedule kapag tapos na.') };
    }).catch(function () { return netMsg(raw); });
  }

  /* ---------------------------------------------------------- main */

  // ---------- weather (same places + cache as the nav drawer) ----------
  var WXP = {
    bh: { n: 'Bahrain', lat: 26.2285, lon: 50.5860, tz: 'Asia/Bahrain', k: /\b(bahrain|bh|manama|muharraq|riffa)\b/ },
    spl: { n: 'San Pedro, Laguna', lat: 14.3595, lon: 121.0473, tz: 'Asia/Manila', k: /\b(san pedro|laguna|spl)\b/ },
    mnl: { n: 'Manila', lat: 14.5995, lon: 120.9842, tz: 'Asia/Manila', k: /\b(manila|maynila)\b/ },
    qc: { n: 'Quezon City', lat: 14.6760, lon: 121.0437, tz: 'Asia/Manila', k: /\b(quezon|qc)\b/ },
    cebu: { n: 'Cebu City', lat: 10.3157, lon: 123.8854, tz: 'Asia/Manila', k: /\bcebu\b/ },
    davao: { n: 'Davao City', lat: 7.1907, lon: 125.4553, tz: 'Asia/Manila', k: /\bdavao\b/ },
    dxb: { n: 'Dubai', lat: 25.2048, lon: 55.2708, tz: 'Asia/Dubai', k: /\bdubai\b/ },
    ruh: { n: 'Riyadh', lat: 24.7136, lon: 46.6753, tz: 'Asia/Riyadh', k: /\b(riyadh|saudi)\b/ }
  };
  var WXT = { 0: ['Sunny', 'Maaraw'], 1: ['Mostly sunny', 'Halos maaraw'], 2: ['Partly cloudy', 'May ulap'], 3: ['Cloudy', 'Makulimlim'], 45: ['Foggy', 'May fog'], 48: ['Foggy', 'May fog'], 51: ['Light drizzle', 'Ambon'], 53: ['Drizzle', 'Ambon'], 55: ['Drizzle', 'Ambon'], 61: ['Light rain', 'Mahinang ulan'], 63: ['Rain', 'Umuulan'], 65: ['Heavy rain', 'Malakas na ulan'], 80: ['Rain showers', 'Pag-ulan'], 81: ['Rain showers', 'Pag-ulan'], 82: ['Heavy showers', 'Malakas na ulan'], 95: ['Thunderstorm', 'Bagyo/kidlat'], 96: ['Thunderstorm', 'Bagyo/kidlat'], 99: ['Thunderstorm', 'Bagyo/kidlat'] };
  function wxPlace(key) { var v = null; try { v = localStorage.getItem(key); } catch (e) {} return WXP[v] ? v : null; }
  function wxGet(pk) {
    var P = WXP[pk], ck = 'lbWxC3_' + pk, c = null;
    try { c = JSON.parse(localStorage.getItem(ck) || 'null'); } catch (e) {}
    if (c && c.d && Date.now() - c.ts < 300000) return Promise.resolve(c.d);
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + P.lat + '&longitude=' + P.lon + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&hourly=precipitation_probability&forecast_hours=1&timezone=' + encodeURIComponent(P.tz);
    return fetch(url, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      var d = { t: j.current.temperature_2m, f: j.current.apparent_temperature, h: j.current.relative_humidity_2m, w: j.current.wind_speed_10m, code: j.current.weather_code,
        p: (j.hourly && j.hourly.precipitation_probability && j.hourly.precipitation_probability[0]) || 0 };
      try { localStorage.setItem(ck, JSON.stringify({ ts: Date.now(), d: d })); } catch (e) {}
      return d;
    }).catch(function () { return c && c.d ? c.d : null; });
  }
  function wxFeel(raw, f, h) {
    if (f >= 45) return L(raw, 'Extreme heat 🥵 — avoid being outside, drink lots of water.', 'Sobrang init 🥵 — iwasan ang lumabas, uminom ng maraming tubig.');
    if (f >= 38) return L(raw, 'Very hot 🔥 — stay hydrated.', 'Sobrang mainit 🔥 — uminom ng tubig.');
    if (f >= 32) return L(raw, 'Hot ☀️' + (h >= 65 ? ' and humid.' : '.'), 'Mainit ☀️' + (h >= 65 ? ' at maalinsangan.' : '.'));
    if (f >= 26) return L(raw, 'Warm and comfortable.', 'Medyo mainit pero ok lang.');
    if (f >= 18) return L(raw, 'Cool and pleasant 😌', 'Presko at maganda ang panahon 😌');
    return L(raw, 'Cold 🥶 — bring a jacket.', 'Malamig 🥶 — magdala ng jacket.');
  }
  function wxLine(raw, pk, d) {
    var P = WXP[pk], x = WXT[d.code] || ['', ''], tl = isTl(raw);
    return '• ' + P.n + ': ' + Math.round(d.t) + '°C (' + (tl ? 'pakiramdam' : 'feels like') + ' ' + Math.round(d.f) + '°), ' + (tl ? x[1] : x[0]) + ', ' + (tl ? 'halumigmig ' : 'humidity ') + Math.round(d.h) + '%, ' + (tl ? 'ulan ' : 'rain ') + Math.round(d.p) + '%\n   ' + wxFeel(raw, d.f, d.h);
  }
  function weatherIntent(raw, t) {
    var keys = Object.keys(WXP).filter(function (k) { return WXP[k].k.test(t); });
    if (!keys.length) {
      if (/\b(philippines|pilipinas|pinas|ph)\b/.test(t)) keys = [wxPlace('lbWxP2') || 'spl'];
      else keys = [wxPlace('lbWxP1') || 'bh', wxPlace('lbWxP2') || 'spl'];
      if (keys[0] === keys[1]) keys = [keys[0]];
    }
    think('Checking the live weather for ' + keys.map(function (k) { return WXP[k].n; }).join(' & ') + '…', 'Chine-check ko ang live na panahon sa ' + keys.map(function (k) { return WXP[k].n; }).join(' at ') + '…', raw);
    return Promise.all(keys.map(function (k) { return wxGet(k); })).then(function (arr) {
      var lines = [], hot = false, rain = false;
      arr.forEach(function (d, i) { if (d) { lines.push(wxLine(raw, keys[i], d)); if (d.f >= 38) hot = true; if (d.p >= 50 || d.code >= 61) rain = true; } else lines.push('• ' + WXP[keys[i]].n + ': ' + L(raw, 'weather unavailable right now.', 'walang makuhang weather ngayon.')); });
      var out = lines.join('\n');
      if (hot) out += tip(raw, 'Heat is high — keep the flowers out of direct sun and check the cooler/delivery timing.', 'Mataas ang init — ilayo sa direktang araw ang mga bulaklak at i-check ang cooler/oras ng delivery.');
      else if (rain) out += tip(raw, 'Rain is likely — protect deliveries and bouquets.', 'Posibleng umulan — protektahan ang mga delivery at bouquet.');
      return { handled: true, text: out, navigateTo: null };
    });
  }

  // ---------- paste a flower count -> draft for Flower Stock Count ----------
  function parseCountText(raw) {
    var txt = String(raw || '').replace(/\r/g, '');
    var lines = txt.split('\n');
    if (lines.length < 2) lines = txt.split(/(?<=\d)\s+(?=[A-Za-z])/); // single-line paste fallback
    var rows = [];
    lines.forEach(function (ln) {
      var l = ln.replace(/^[\s\-*•·>]+/, '').replace(/^\d{1,2}[.)]\s+(?=[A-Za-z])/, '').trim();
      if (!l || l.length > 80) return;
      var waste = 0, w = l.match(/[\s,(]*(?:waste|wastage|wst|w)\s*[:=]?\s*(\d+(?:\.\d+)?)\)?\s*$/i);
      if (w) { waste = Number(w[1]); l = l.slice(0, w.index).trim(); }
      var m = l.match(/^(.*?[A-Za-z][A-Za-z .&'\/\-]*?)\s*[:=\-–—]*\s*(\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)*)\s*(?:stems?|stem|pcs?|pieces?|bunch(?:es)?|bundles?|bd|x)?\.?$/i)
        || l.match(/^(\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)*)\s*(?:x|×|pcs?|stems?)?\s+([A-Za-z].*)$/i);
      if (!m) return;
      var name, num;
      if (/^\d/.test(m[1])) { num = m[1]; name = m[2]; } else { name = m[1]; num = m[2]; }
      name = name.replace(/[\s:=\-–—]+$/, '').trim();
      if (name.length < 2 || /^(date|total|branch|count|stock count|week|weekly)$/i.test(name)) return;
      var cnt = num.split('+').reduce(function (a, b) { return a + Number(b); }, 0);
      if (!isFinite(cnt)) return;
      rows.push({ raw: name, count: cnt, waste: waste });
    });
    return rows;
  }
  function countIntent(raw, t) {
    var rows = parseCountText(raw);
    var kw = /\b(stock count|count|bilang|i-?input|input|ilagay|ilista|enter|encode)\b/.test(norm(raw));
    if (!(rows.length >= 3 || (kw && rows.length >= 1))) return null;
    var branch = branchIn(t) || 'ModaMall';
    think('That looks like a flower count (' + rows.length + ' lines) — matching the names to the flower list…', 'Mukhang flower count ito (' + rows.length + ' linya) — ima-match ko ang mga pangalan sa flower list…', raw);
    return getJson(CFG.FLOWER_FAST_API, { action: 'getFlowerStockList' }, 120000).then(function (list) {
      var names = (Array.isArray(list) ? list : []).map(function (x) { return String(x.flowerName || x.Flower || '').trim(); }).filter(Boolean);
      if (!names.length) return { handled: true, text: L(raw, "I couldn't load the flower list, Boss — try again in a moment.", 'Hindi ko ma-load ang flower list, Boss — subukan ulit mamaya.') };
      var merged = {}, order = [], bad = [], guess = [];
      rows.forEach(function (r) {
        var best = '', sc = 0;
        names.forEach(function (n) { var v = nameScore(r.raw, n); if (v > sc) { sc = v; best = n; } });
        if (sc < 0.62) { bad.push(r.raw + ' ' + r.count); return; }
        if (!merged[best]) { merged[best] = { name: best, count: 0, waste: 0 }; order.push(best); }
        merged[best].count += r.count; merged[best].waste += r.waste;
        if (sc < 0.85) guess.push(r.raw + ' → ' + best);
      });
      var items = order.map(function (k) { return merged[k]; });
      if (!items.length) return { handled: true, text: L(raw, "I couldn't match any of those names to the flower list, Boss.", 'Walang nag-match sa flower list, Boss.') };
      try { sessionStorage.setItem('lbNovaCountDraft', JSON.stringify({ branch: branch, items: items, ts: Date.now(), by: me().fullName || '' })); } catch (e) {}
      var out = L(raw, '📋 Got it! ' + items.length + ' flowers for ' + branch + ':\n', '📋 Nakuha ko! ' + items.length + ' na bulaklak para sa ' + branch + ':\n') +
        items.map(function (i) { return '• ' + i.name + ' — ' + fmtNum(i.count) + (i.waste ? ' (' + L(raw, 'waste', 'waste') + ' ' + fmtNum(i.waste) + ')' : ''); }).join('\n');
      if (guess.length) out += '\n\n❓ ' + L(raw, 'Not 100% sure (please check): ', 'Hindi ako sigurado (paki-check): ') + guess.join('; ');
      if (bad.length) out += '\n\n⚠️ ' + L(raw, "Couldn't match: ", 'Hindi nahanap: ') + bad.join('; ');
      out += tip(raw, 'Tap "Open Stock Count" — I will fill it in for you. Nothing is saved until you press Save.', 'I-tap ang "Open Stock Count" — ako na ang magpupuno. Walang masi-save hangga\'t hindi mo pinipindot ang Save.');
      return { handled: true, text: out, navigateTo: null, offerPage: 'flower-stock-count.html', offerLabel: '📋 Open Stock Count' };
    }).catch(function () { return netMsg(raw); });
  }

  var ctx = { item: '', branch: '', last: '' };
  var thoughtCb = null;
  function think(en, tl, raw) { try { if (thoughtCb) thoughtCb(L(raw || '', en, tl)); } catch (e) {} }
  function tip(raw, en, tl) { return '\n💡 ' + L(raw, en, tl); }
  function ok(text, nav) { return Promise.resolve({ handled: true, text: text, navigateTo: nav || null }); }

  function ask(raw) {
    raw = String(raw || '').trim();
    var t = norm(raw);
    if (!t) return Promise.resolve({ handled: false });

    if (/\n/.test(raw) || /\d\s+[A-Za-z].*\d/.test(raw)) { var ci = countIntent(raw, t); if (ci) return ci; }
    var st = smallTalk(raw, t); if (st) return ok(st);
    if (/\b(weather|panahon|temperature|temp|init|mainit|malamig|lamig|ulan|umuulan|maulan|rain(ing)?|hot|cold|humidity|forecast|bagyo|maaraw|sunny|heat)\b/.test(t) && !/\b(stock|schedule|reminder|expiry|order|sales)\b/.test(t)) return weatherIntent(raw, t);
    var tm = timeIntent(raw, t); if (tm) return ok(tm);
    var mt = mathIntent(raw); if (mt) return ok(mt);

    // open / go to a page
    if (/^(please |paki )?(open|go to|show me|show|take me to|navigate to|launch|buksan|buksan mo|punta|pumunta|dalhin mo ako sa|pakibukas|pakibuksan|tara sa|i-?open)\b/.test(t) || /^(pakibukas|buksan)/.test(t)) {
      var pg = findPage(t.replace(/^(please |paki )?(open|go to|show me|show|take me to|navigate to|launch|buksan( mo)?|punta( sa)?|pumunta( sa)?|dalhin mo ako sa|pakibuksan|pakibukas|tara sa|i-?open)\s*(the |ang |yung |sa )?/, ''));
      if (pg && !/\b(stock|low|near|reminder|schedule ko|day off)\b/.test(t.replace(/duty schedule|schedule/g, ''))) return ok(L(raw, 'Opening ' + pg[1] + '.', 'Binubuksan ko ang ' + pg[1] + '.'), pg[0]);
      if (pg) return ok(L(raw, 'Opening ' + pg[1] + '.', 'Binubuksan ko ang ' + pg[1] + '.'), pg[0]);
    }

    if (offlineNet() && /(stock|schedule|reminder|expiry|low|summary)/.test(t)) return Promise.resolve(netMsg(raw));


    // live data
    if (/\b(low stock|lowstock|below min|minimum stock|running low|paubos|nauubos|ubos na|kulang na|kulang ang stock|mababa ang stock|need(s)? restock|restock)\b/.test(t)) return lowStock(raw, t, ctx);
    if (/\b(near expiry|nearly expired|expir(ed|ing|y)|malapit mag ?expire|paso na|expired na)\b/.test(t)) return expiry(raw, t);
    if (/\b(reminders?|paalala|pending reminders?)\b/.test(t) && /\b(my|ko|ano|what|any|may|meron|show|check|list|pending)\b/.test(t)) return reminderIntent(raw);
    if (/\b(day ?off|off ko|my schedule|schedule ko|duty ko|shift ko|my shift|am i off|off ba ako|duty ba ako|may duty|anong (shift|schedule)|what.?s my (shift|schedule)|when.*off|kailan.*off|next off)\b/.test(t) || (/\b(schedule|shift|duty)\b/.test(t) && /\b(today|tomorrow|ngayon|bukas|this week|my|ko)\b/.test(t))) return scheduleIntent(raw, t);
    if (/\b(summary|overview|status|report|buod|kumusta ang (stock|inventory|branch)|how.?s (the )?(stock|inventory|business))\b/.test(t) && /\b(stock|inventory|chocolate|flower|branch|dashboard|today|ngayon|business|buod|summary|overview|status|report)\b/.test(t)) return summary(raw, t);
    if (/\b(stock|stocks|ilan|how many|how much|dami|meron|mayroon|may .* ba|available|natitira|tira|left|quantity|qty|on hand|in stock|count of)\b/.test(t) && !/\b(how to|paano|pano)\b/.test(t)) {
      var item = extractItem(t);
      if (item || ctx.item) return stockQuery(raw, t, ctx);
    }
    // follow-up: "how about hamala?" / "sa galali?"
    if (ctx.item && /^(how about|what about|e |eh |paano |kumusta |sa )?\s*(modamall|moda|hamala|galali|qalali)\??$/.test(t)) return stockQuery(raw, norm(ctx.item + ' ' + branchIn(t)), ctx);

    // knowledge base
    var kb = kbSearch(raw);
    if (kb) { var e = kb.e; ctx.last = e.id; think('That sounds like a question about ' + e.id + ' — let me recall how it works…', 'Parang tanong ito tungkol sa ' + e.id + ' — inaalala ko kung paano…', raw); return ok(L(raw, e.en, e.tl), null).then(function (r) { r.offerPage = e.page || null; return r; }); }

    // bare page name e.g. "flower dashboard"
    var pg2 = findPage(t); if (pg2 && t.split(' ').length <= 4) return ok(L(raw, 'Opening ' + pg2[1] + '.', 'Binubuksan ko ang ' + pg2[1] + '.'), pg2[0]);

    // a lone item name -> treat as a stock lookup
    if (t.split(' ').length <= 4 && /[a-z]{3}/.test(t)) {
      return stockQuery(raw, t, ctx).then(function (r) { return /could not find|Wala akong makitang/.test(r.text) ? { handled: false } : r; });
    }
    return Promise.resolve({ handled: false });
  }

  var SORRY_EN = ["I didn't quite get that, Boss. Try: \"stock of red rose\", \"weather today\", \"low stock\", \"near expiry\", \"my day off\", \"open flower dashboard\", or \"how to receive stock\".",
    "Hmm, I'm not sure about that one. I can check stock, schedule, reminders, open pages or explain how any tool works — what do you need?"];
  var SORRY_TL = ['Hindi ko masyadong naintindihan, Boss. Subukan: "stock ng red rose", "low stock", "near expiry", "day off ko", "buksan ang flower dashboard", o "paano mag receive".',
    'Hmm, hindi ako sigurado diyan. Kaya kong mag-check ng stock, schedule, reminders, magbukas ng page o magpaliwanag ng mga tool — ano ang kailangan mo?'];
  function fallback(raw) { return isTl(raw) ? pick(SORRY_TL) : pick(SORRY_EN); }

  window.LBNovaBrain = {
    ask: function (text, onThought) { thoughtCb = onThought || null; return ask(text).catch(function () { return { handled: true, text: netMsg(text).text }; }); },
    fallback: fallback,
    learn: function (e) { if (e && e.keys && (e.en || e.tl)) learned.push({ id: e.id || 'learned' + learned.length, keys: e.keys, en: e.en || e.tl, tl: e.tl || e.en, page: e.page }); },
    // true by default: Nova should NEVER call the paid AI API. Set localStorage lbNovaUseApi=1 to re-enable it as a last resort.
    useApi: function () { try { return localStorage.getItem('lbNovaUseApi') === '1'; } catch (e) { return false; } },
    _t: { norm: norm, nameScore: nameScore, mathIntent: mathIntent, extractItem: extractItem, kbSearch: kbSearch }
  };
})();
