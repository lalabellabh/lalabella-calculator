/* ==========================================================
   LALABELLA SCHEDULE PDF READER
   Reads the weekly "Duty Schedule" PDF (Word/Excel export) and returns
   one record per person, with a shift for every day SUN–SAT.

   Handles what the real PDF looks like:
   - three branch sections (Galali / Moda Mall / Hamala), each with its
     own SUN–SAT header; the same person can appear in more than one
     section (a cell then says just a branch name, e.g. "Galali", and the
     hours are written in the other section) — these are merged per day
   - merged cells that span several days (e.g. one "8AM to 8PM" across
     SUN–THU): worked out from where the text is centred on the page
   - shifts split over several lines, role notes in brackets, and extra
     notes under a shift ("Pray time", "Assigned to Galali ...")

   Needs pdf.js (window.pdfjsLib) only for lbSchedulePdf.readFile().
   lbSchedulePdf.parsePages(pages) is pure — pages = [{items:[{str,x,y,w}]}].

   Result: { employees:[{name, role, branch, days:{SUN:'..',...}}], warnings:[..] }
   A day's text is "SHIFT" or "Off", then optional "; @ OtherBranch" and
   "; note" parts (schedule.html shows the first part as the shift).
   ========================================================== */
(function(root){
  const DAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const DAY_TOK = { SUN:'SUN', MON:'MON', TUE:'TUE', TUES:'TUE', WED:'WED', THU:'THU', THUR:'THU', THURS:'THU', FRI:'FRI', SAT:'SAT' };
  const BRANCH_WORD = /^(moda\s*mall|modamall|galali|hamala)$/i;
  const normBranch = s => { const t = String(s || '').toLowerCase().replace(/\s+/g, ''); return t === 'galali' ? 'Galali' : t === 'hamala' ? 'Hamala' : /moda/.test(t) ? 'ModaMall' : ''; };
  const hasTime = s => /\d\s*(?:\.\d+)?\s*(?:AM|PM)/i.test(s);

  // ---- 1. text items -> lines -> pieces ----
  function buildLines(items){
    const its = items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.x, y: i.y, w: i.w || 0 }));
    its.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    its.forEach(it => {
      const l = lines.find(l => Math.abs(l.y - it.y) <= 4);
      if (l) l.items.push(it); else lines.push({ y: it.y, items: [it] });
    });
    lines.sort((a, b) => b.y - a.y);
    return lines.map(l => {
      l.items.sort((a, b) => a.x - b.x);
      const pieces = [];
      l.items.forEach(it => {
        const p = pieces[pieces.length - 1];
        if (p && it.x - p.x2 < 8) {
          p.text += (it.x - p.x2 > 1.5 && !/^\s/.test(it.s) && !/\s$/.test(p.text) ? ' ' : '') + it.s.replace(/^\s+/, p.text.endsWith(' ') ? '' : ' ').replace(/\s+/g, ' ');
          p.x2 = Math.max(p.x2, it.x + it.w);
        } else pieces.push({ text: it.s.replace(/\s+/g, ' '), x: it.x, x2: it.x + it.w });
      });
      pieces.forEach(p => { p.text = p.text.replace(/\s+/g, ' ').trim(); p.cx = (p.x + p.x2) / 2; });
      return { y: l.y, pieces: pieces.filter(p => p.text) };
    }).filter(l => l.pieces.length);
  }

  // ---- 2. one cell's lines -> {kind, text, notes} ----
  function joinLines(lines){
    let out = '';
    lines.forEach(t => {
      if (!out) { out = t; return; }
      if (/\bto$/i.test(out)) out += ' ' + t;
      else if (hasTime(out) && hasTime(t) && !/^\(/.test(t)) out += ' / ' + t;
      else out += ' ' + t;
    });
    return out.replace(/\s+/g, ' ').trim();
  }
  function classifyCell(lines){
    const flat = lines.map(s => s.trim()).filter(Boolean);
    if (!flat.length) return null;
    const one = flat.join(' ').replace(/\s+/g, ' ').trim();
    if (/^off$/i.test(one)) return { kind: 'off' };
    if (BRANCH_WORD.test(one)) return { kind: 'branch', branch: normBranch(one) };
    // shift = lines up to and including the first "(… break)" line; the rest are notes
    let cut = flat.findIndex(t => /break\s*\)?\s*$/i.test(t));
    if (cut < 0) cut = flat.length - 1;
    const shift = joinLines(flat.slice(0, cut + 1));
    const notes = joinLines(flat.slice(cut + 1));
    if (/^off$/i.test(shift)) return { kind: 'off', notes };
    if (!hasTime(shift) && BRANCH_WORD.test(shift)) return { kind: 'branch', branch: normBranch(shift), notes };
    return { kind: 'shift', shift, notes };
  }

  // ---- 3. spread a row's cells over the 7 day columns (handles merged cells) ----
  function assignColumns(clusters, edges){
    const k = clusters.length, N = 7;
    if (!k) return [];
    const nearest = cx => { let b = 0, bd = 1e9; for (let i = 0; i < N; i++) { const c = (edges[i] + edges[i + 1]) / 2, d = Math.abs(c - cx); if (d < bd) { bd = d; b = i; } } return b; };
    if (k >= N) return clusters.map(c => [nearest(c.cx)]);
    // dp[j][e]: best cost covering clusters 0..j-1 with columns 0..e-1
    const INF = 1e12, dp = Array.from({ length: k + 1 }, () => Array(N + 1).fill(INF)), prev = Array.from({ length: k + 1 }, () => Array(N + 1).fill(-1));
    dp[0][0] = 0;
    for (let j = 1; j <= k; j++) for (let e = j; e <= N; e++) for (let s = j - 1; s < e; s++) {
      if (dp[j - 1][s] >= INF) continue;
      const cost = dp[j - 1][s] + Math.abs(clusters[j - 1].cx - (edges[s] + edges[e]) / 2);
      if (cost < dp[j][e]) { dp[j][e] = cost; prev[j][e] = s; }
    }
    const spans = []; let e = N;
    for (let j = k; j >= 1; j--) { const s = prev[j][e]; spans[j - 1] = Array.from({ length: e - s }, (_, i) => s + i); e = s; }
    return spans;
  }

  // ---- 4. read the pages ----
  function parsePages(pages){
    const rows = [];     // {name, role, branch(section), cells:[{cols,kind,...}]}
    pages.forEach(page => {
      const lines = buildLines(page.items || []);
      let secBranch = '', cols = null, edges = null, cur = null;
      const finish = () => {
        if (!cur) return;
        const cl = [];
        cur.pieces.sort((a, b) => a.cx - b.cx);
        cur.pieces.forEach(p => {
          const c = cl.find(c => Math.abs(c.cx - p.cx) <= 8);
          if (c) { c.parts.push(p); c.cx = c.parts.reduce((a, q) => a + q.cx, 0) / c.parts.length; } else cl.push({ cx: p.cx, parts: [p] });
        });
        cl.sort((a, b) => a.cx - b.cx);
        const spans = assignColumns(cl, edges);
        const cells = [];
        cl.forEach((c, i) => {
          c.parts.sort((a, b) => b.y - a.y);
          const k = classifyCell(c.parts.map(p => p.text));
          if (k) cells.push(Object.assign({ cols: spans[i] }, k));
        });
        rows.push({ name: cur.name, role: cur.role.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim(), branch: secBranch, cells });
        cur = null;
      };
      lines.forEach(line => {
        const text = line.pieces.map(p => p.text).join(' ');
        if (/duty hours/i.test(text)) {
          finish();
          const m = /(galali|moda\s*mall|modamall|hamala)/i.exec(text); if (m) secBranch = normBranch(m[1]);
          cols = null; edges = null; return;
        }
        const heads = line.pieces.map(p => ({ cx: p.cx, day: DAY_TOK[p.text.toUpperCase().replace(/[^A-Z]/g, '')] })).filter(h => h.day);
        if (heads.length >= 5) {
          finish();
          cols = DAYS.map(d => (heads.find(h => h.day === d) || {}).cx);
          // fill any missing header by even spacing
          const known = cols.map((c, i) => c == null ? null : i).filter(i => i != null);
          if (known.length >= 2) {
            const step = (cols[known[known.length - 1]] - cols[known[0]]) / (known[known.length - 1] - known[0]);
            cols = cols.map((c, i) => c != null ? c : cols[known[0]] + step * (i - known[0]));
          }
          edges = [cols[0] - (cols[1] - cols[0]) / 2];
          for (let i = 1; i < 7; i++) edges.push((cols[i - 1] + cols[i]) / 2);
          edges.push(cols[6] + (cols[6] - cols[5]) / 2);
          return;
        }
        if (!cols) return;
        if (/^note\s*:/i.test(text) || /drivers?\s+cars?\s*:/i.test(text)) { finish(); return; }
        const left = line.pieces.filter(p => p.cx < edges[0] - 4), right = line.pieces.filter(p => p.cx >= edges[0] - 4);
        if (left.length) {
          const t = left.map(p => p.text).join(' ').trim();
          if (cur && cur.roleOpen) { cur.role += ' ' + t; if (t.includes(')')) cur.roleOpen = false; }
          else if (/^\(/.test(t)) { if (cur) { cur.role += ' ' + t; cur.roleOpen = !t.includes(')'); } }
          else if (/^[A-Za-z]/.test(t) && !/^employee\b/i.test(t)) { finish(); cur = { name: t.replace(/\s+/g, ' '), role: '', roleOpen: false, pieces: [] }; }
        }
        if (cur) right.forEach(p => { if (!/^duty timing$/i.test(p.text)) cur.pieces.push({ text: p.text, cx: p.cx, y: line.y }); });
      });
      finish();
    });
    return merge(rows);
  }

  // ---- 5. merge a person's rows from all sections into one week ----
  function merge(rows){
    const people = new Map(), warnings = [];
    rows.forEach(r => {
      const key = r.name.toLowerCase();
      if (!people.has(key)) people.set(key, { name: r.name, role: '', entries: Object.fromEntries(DAYS.map(d => [d, []])) });
      const p = people.get(key);
      if (r.role && !p.role) p.role = r.role;
      r.cells.forEach(c => c.cols.forEach(ci => p.entries[DAYS[ci]].push(Object.assign({}, c, { section: r.branch }))));
    });
    const employees = [];
    people.forEach(p => {
      const days = {}, branchCount = {};
      const chosen = {};
      DAYS.forEach(d => {
        const es = p.entries[d]; if (!es.length) return;
        if (es.some(e => e.kind === 'off')) { chosen[d] = { off: true }; return; }
        const shifts = es.filter(e => e.kind === 'shift'), locs = es.filter(e => e.kind === 'branch');
        const locBranch = locs.length ? locs[0].branch : '';
        let pick = null;
        if (shifts.length) {
          pick = shifts.find(s => locBranch && s.section === locBranch) || shifts[0];
          const others = shifts.filter(s => s !== pick && s.shift.toLowerCase() !== pick.shift.toLowerCase());
          if (others.length) warnings.push(p.name + ' ' + d + ': the sections disagree — "' + pick.shift + '" (' + pick.section + ') vs "' + others.map(o => o.shift + '" (' + o.section + ')').join(', "') + '. Kept the first; please check.');
          chosen[d] = { shift: pick.shift, notes: pick.notes || '', branch: locBranch || pick.section };
        } else if (locs.length) {
          chosen[d] = { shift: '', notes: locs[0].notes || '', branch: locBranch };
        }
        if (chosen[d] && chosen[d].branch) branchCount[chosen[d].branch] = (branchCount[chosen[d].branch] || 0) + 1;
      });
      const home = Object.keys(branchCount).sort((a, b) => branchCount[b] - branchCount[a])[0] || '';
      DAYS.forEach(d => {
        const c = chosen[d]; if (!c) return;
        if (c.off) { days[d] = 'Off'; return; }
        const parts = [c.shift || ('@ ' + c.branch)];
        if (c.shift && c.branch && c.branch !== home) parts.push('@ ' + c.branch);
        if (c.notes) parts.push(c.notes);
        days[d] = parts.join('; ');
      });
      if (Object.keys(days).length < 7) warnings.push(p.name + ': only ' + Object.keys(days).length + ' of 7 days were read — fill in the rest by hand.');
      employees.push({ name: p.name, role: p.role, branch: home, days });
    });
    return { employees, warnings };
  }

  async function readFile(file){
    const buf = await file.arrayBuffer();
    const pdf = await root.pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      pages.push({ items: content.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width })) });
    }
    if (!pages.some(p => p.items.some(i => i.str && i.str.trim()))) throw new Error('No selectable text was found in this PDF — it may be a scan. Export it from Word/Excel as a PDF instead.');
    return parsePages(pages);
  }

  const api = { parsePages, readFile, DAYS };
  root.lbSchedulePdf = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
