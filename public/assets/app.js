/* WinMend home page: hero search, stats, trending, and the four tools. */
(function () {
  'use strict';
  const { $, $$, esc, md, api, toast, copy, download, ls, history, plan, debounce } = window.WM;
  const root = $('#tool-root');
  const SEV_RANK = { low: 0, medium: 1, high: 2, critical: 3 };
  const FREQ = { rare: 'Rare', uncommon: 'Uncommon', common: 'Common', 'very-common': 'Very common' };
  let CATS = {};
  let current = 'decoder';
  const state = { decoder: { mode: 'single', q: '', log: '' }, lookup: { q: '', category: '', severity: '', sort: '', offset: 0, saved: false }, triage: { step: 0, a: {} } };

  const sevBadge = (s) => `<span class="badge sev-${esc(s)}">${esc(s[0].toUpperCase() + s.slice(1))}</span>`;
  const catBadge = (c) => `<span class="badge cat">${esc(CATS[c] || c)}</span>`;

  // ---------------- tabs ----------------
  function show(tool, params = {}) {
    current = tool;
    $$('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tool)));
    if (tool === 'decoder') { if (params.mode) state.decoder.mode = params.mode; if (params.q !== undefined) state.decoder.q = params.q; renderDecoder(params.q !== undefined && params.q !== ''); }
    else if (tool === 'lookup') { if (params.q !== undefined) state.lookup.q = params.q; if (params.category !== undefined) state.lookup.category = params.category; renderLookup(); }
    else if (tool === 'triage') renderTriage();
    else if (tool === 'plan') { if (params.slug) plan.setCurrent(params.slug); renderPlan(); }
    const u = new URL(location.href);
    u.searchParams.set('tool', tool);
    ['q', 'mode', 'slug'].forEach((k) => u.searchParams.delete(k));
    if (tool === 'decoder' && state.decoder.q) u.searchParams.set('q', state.decoder.q);
    history_replace(u);
  }
  function history_replace(u) { try { window.history.replaceState(null, '', u.pathname + u.search + u.hash); } catch {} }
  $$('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  $('.tabs').addEventListener('keydown', (e) => {
    const tabs = $$('.tabs [data-tab]'); const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === 'ArrowRight') { tabs[(i + 1) % 4].focus(); tabs[(i + 1) % 4].click(); }
    if (e.key === 'ArrowLeft') { tabs[(i + 3) % 4].focus(); tabs[(i + 3) % 4].click(); }
  });

  // ---------------- decoder ----------------
  const EXAMPLES = ['0x80070002', 'CRITICAL_PROCESS_DIED', '0xC000021A', 'Code 43', '0x800F081F', 'wifi keeps disconnecting', '-2147024891'];
  const SAMPLE_LOG = `Log Name:      System\nSource:        Microsoft-Windows-WER-SystemErrorReporting\nEvent ID:      1001\nLevel:         Error\nDescription:\nThe computer has rebooted from a bugcheck. The bugcheck was: 0x0000009f (0x0000000000000003, 0xffffc40a8e2a1060). A dump was saved in: C:\\WINDOWS\\MEMORY.DMP.\n\nInstallation Failure: Windows failed to install the following update with error 0x800f0922: 2024-05 Cumulative Update for Windows 11.\nKernel-Power Event ID 41: The system has rebooted without cleanly shutting down first.`;

  function renderDecoder(autorun) {
    const d = state.decoder;
    root.innerHTML = `<div class="seg" role="group" aria-label="Decoder mode"><button type="button" data-mode="single" aria-pressed="${d.mode === 'single'}">Single code</button><button type="button" data-mode="log" aria-pressed="${d.mode === 'log'}">Paste a log</button></div><div data-body></div>`;
    $$('[data-mode]', root).forEach((b) => b.addEventListener('click', () => { d.mode = b.dataset.mode; renderDecoder(); }));
    const body = $('[data-body]', root);
    if (d.mode === 'single') {
      body.innerHTML = `<form class="field" data-f><input class="input" name="q" placeholder="Error code or message, for example 0x80070005" aria-label="Error code or message" value="${esc(d.q)}" autocomplete="off"><button class="btn primary" type="submit">Decode</button></form>
        <div class="examples"><span class="muted">Examples:</span>${EXAMPLES.map((x) => `<button type="button" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div><div data-out></div>`;
      const f = $('[data-f]', body);
      f.addEventListener('submit', (e) => { e.preventDefault(); d.q = f.q.value.trim(); decode(d.q); });
      $$('[data-ex]', body).forEach((b) => b.addEventListener('click', () => { f.q.value = b.dataset.ex; d.q = b.dataset.ex; decode(d.q); }));
      if (autorun && d.q) decode(d.q);
    } else {
      body.innerHTML = `<div style="position:relative"><textarea class="input" rows="8" maxlength="8000" placeholder="Paste an Event Viewer entry, a blue screen line, part of setupact.log or a forum post...\n\nThe scanner pulls out hex codes, stop code names and phrases like &quot;error 126&quot; or &quot;Event ID 41&quot;, then matches them against the knowledge base." aria-label="Log text to scan">${esc(d.log)}</textarea><span class="small muted" style="position:absolute;right:12px;bottom:10px" data-cnt>${d.log.length}/8000</span></div>
        <div class="row wrap-row" style="margin-top:10px"><button class="btn primary" type="button" data-scan>Scan the log</button><button class="btn ghost sm" type="button" data-sample>Load a sample log</button><button class="btn ghost sm" type="button" data-clear>Clear</button><span class="small muted">Scanned in memory. Your text is never stored.</span></div><div data-out></div>`;
      const ta = $('textarea', body);
      ta.addEventListener('input', () => { d.log = ta.value; $('[data-cnt]', body).textContent = `${ta.value.length}/8000`; });
      $('[data-sample]', body).addEventListener('click', () => { ta.value = SAMPLE_LOG; d.log = SAMPLE_LOG; ta.dispatchEvent(new Event('input')); });
      $('[data-clear]', body).addEventListener('click', () => { ta.value = ''; d.log = ''; ta.dispatchEvent(new Event('input')); $('[data-out]', body).innerHTML = ''; });
      $('[data-scan]', body).addEventListener('click', () => scanLog(ta.value));
    }
  }

  function remember(q) { const r = ls.get('wm-recent', []).filter((x) => x !== q); r.unshift(q); ls.set('wm-recent', r.slice(0, 6)); paintRecent(); }

  async function decode(q) {
    const out = $('[data-out]', root); if (!out || !q) return;
    remember(q);
    out.innerHTML = '<div class="result"><div class="skeleton" style="height:140px"></div></div>';
    try {
      const r = await api('/api/decode?q=' + encodeURIComponent(q));
      const a = r.anatomy;
      const anat = a && a.parts && a.parts.length ? `<div class="anat"><h4>Code anatomy</h4><dl>${a.parts.map((p) => `<dt>${esc(p.label)}</dt><dd>${esc(p.value)}</dd>`).join('')}</dl>${(a.notes || []).map((n) => `<p class="small muted" style="margin:10px 0 0">${md(n)}</p>`).join('')}</div>` : '';
      if (r.match) {
        const e = r.match;
        history.add({ kind: 'decode', query: q, title: e.title, slug: e.slug, severity: e.severity });
        out.innerHTML = `<div class="result"><div class="cols"><div>
          <div class="row" style="margin-bottom:6px">${catBadge(e.category)}${sevBadge(e.severity)}<span class="badge">${FREQ[e.frequency] || ''}</span></div>
          <h3>${esc(e.title)}</h3>
          <div class="codes">${e.codes.slice(0, 5).map((c) => `<button class="code-chip" type="button" data-copy="${esc(c)}" title="Copy">${esc(c)}</button>`).join('')}</div>
          <p>${md(e.summary)}</p>
          <h4>Common causes</h4><ul>${e.commonCauses.slice(0, 4).map((c) => `<li>${md(c)}</li>`).join('')}</ul></div>
          <div>${anat}<h4 style="margin-top:${anat ? '14px' : '0'}">First steps (safest first)</h4><ol class="mini-fixes">${e.fixes.slice(0, 3).map((f, i) => `<li><b>${esc(f.title)}</b>${i === 0 ? ' <span class="badge start">Start here</span>' : ''}<br><span class="small muted">${esc(f.difficulty)} · ${esc(f.timeEstimate)}</span></li>`).join('')}</ol></div></div>
          <div class="row wrap-row" style="margin-top:14px"><a class="btn primary" href="/errors/${esc(e.slug)}">Open the full guide (${e.fixes.length} steps)</a><button class="btn ghost" type="button" data-plan="${esc(e.slug)}">Build a fix plan</button><button class="btn ghost" type="button" data-tri>Not sure? Start triage</button></div></div>`;
      } else {
        history.add({ kind: 'decode', query: q, title: a && a.title ? a.title : q });
        const list = [...(r.didYouMean || []).map((x) => ({ ...x, dym: true })), ...(r.results || [])];
        out.innerHTML = `<div class="result">${a && a.title ? `<h3>${esc(a.title)}</h3>${a.message ? `<p>${esc(a.message)}</p>` : ''}` : `<h3>No exact match for "${esc(q)}"</h3>`}
          ${anat ? `<div style="margin:10px 0">${anat}</div>` : ''}
          ${list.length ? `<h4>${r.didYouMean && r.didYouMean.length ? 'Did you mean...' : 'Closest entries in the knowledge base'}</h4><div class="list-res">${list.map((x) => `<a href="/errors/${esc(x.slug)}"><code>${esc(x.codes[0])}</code><div class="grow"><b>${esc(x.title)}</b><span>${esc(x.summary)}</span></div>${sevBadge(x.severity)}</a>`).join('')}</div>` : '<p class="muted">Nothing in the knowledge base matches yet. Try the exact code from the screen, or describe the symptom in the Triage tool.</p>'}
          <div class="row wrap-row" style="margin-top:12px"><button class="btn ghost sm" type="button" data-look>Search in Lookup</button><button class="btn ghost sm" type="button" data-tri>Start triage</button><button class="btn ghost sm" type="button" data-ask>Ask the assistant</button></div>
          ${wishForm(q)}</div>`;
        wireWish(out, q);
      }
      out.onclick = (ev) => {
        const p = ev.target.closest('[data-plan]'); if (p) { plan.add(p.dataset.plan); show('plan'); toast('Added to your fix plan'); }
        if (ev.target.closest('[data-tri]')) show('triage');
        if (ev.target.closest('[data-look]')) show('lookup', { q });
        if (ev.target.closest('[data-ask]')) window.WM.openAssistant(q);
      };
    } catch (e) { out.innerHTML = `<div class="result"><p>${esc(e.message)}</p></div>`; }
  }

  function wishForm(q) {
    return `<div class="wish"><h4>Missing this error? Ask for it to be covered</h4><p class="small muted">The most requested codes are researched and added first. Requests are anonymous.</p>
      <form class="field" data-wish><input class="input" name="code" maxlength="120" value="${esc(q)}" aria-label="Error code or message"><input class="input" name="note" maxlength="200" placeholder="Context (optional), e.g. after an update" aria-label="Context"><button class="btn primary" type="submit">Request it</button></form><div data-top class="small" style="margin-top:10px"></div></div>`;
  }
  async function wireWish(out, q) {
    const f = $('[data-wish]', out); if (!f) return;
    const top = $('[data-top]', out);
    const loadTop = async () => { try { const r = await api('/api/suggest'); top.innerHTML = r.items.length ? `<span class="muted">Most requested so far:</span> ${r.items.map((i) => `<code>${esc(i.code)}</code> <span class="muted">(${i.votes})</span>`).join(' · ')}` : ''; } catch {} };
    loadTop();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api('/api/suggest', { body: { code: f.code.value.trim(), note: f.note.value.trim() || undefined } });
        if (r.covered) { toast('Good news, that one is covered!', r.title); location.href = '/errors/' + r.slug; return; }
        toast('Added to the request list', r.votes > 1 ? `${r.votes} people have asked for this one.` : 'Thanks, the most requested codes go first.');
        f.querySelector('button').disabled = true; f.querySelector('button').textContent = 'Requested'; loadTop();
      } catch (err) { toast('Request failed', err.message); }
    });
  }

  async function scanLog(text) {
    const out = $('[data-out]', root);
    if (text.trim().length < 8) { out.innerHTML = '<div class="result"><p>Paste at least a line or two of the log first.</p></div>'; return; }
    out.innerHTML = '<div class="result"><div class="skeleton" style="height:120px"></div></div>';
    try {
      const r = await api('/api/scan', { body: { text: text.slice(0, 8000) } });
      const total = r.matches.length + r.unmatched.length;
      const pct = total ? Math.round((r.matches.length / total) * 100) : 0;
      if (r.matches.length) {
        const worst = r.matches.reduce((w, m) => (SEV_RANK[m.severity] > SEV_RANK[w] ? m.severity : w), 'low');
        history.add({ kind: 'scan', query: (text.split('\n').find((l) => l.trim().length > 3) || 'Log scan').trim().slice(0, 48), title: `${r.matches.length} known error${r.matches.length === 1 ? '' : 's'} found in a log`, slug: r.matches[0].slug, severity: worst });
      }
      out.innerHTML = `<div class="result"><div class="row between wrap-row"><h3 style="margin:0">${r.matches.length ? `${r.matches.length} known error${r.matches.length === 1 ? '' : 's'} found` : 'No known errors found'}</h3><span class="small muted">${r.scanned.candidates} candidate code${r.scanned.candidates === 1 ? '' : 's'} · ${pct}% recognized · ${r.scanned.durationMs} ms</span></div>
        ${r.matches.length ? `<div class="list-res">${r.matches.map((m) => `<div class="item"><div class="grow"><b>${esc(m.title)}</b><span>${m.hitCodes.length ? 'Found: ' + m.hitCodes.map(esc).join(', ') + ' · ' : ''}${m.confidence === 'exact' ? 'exact match' : m.confidence === 'contextual' ? 'matched from context' : 'keyword match'}</span></div>${sevBadge(m.severity)}<a class="btn ghost sm" href="/errors/${esc(m.slug)}">Open</a><button class="btn ghost sm" type="button" data-addp="${esc(m.slug)}">+ Plan</button></div>`).join('')}</div>
          <div class="row" style="margin-top:12px"><button class="btn primary sm" type="button" data-addall>Add all to my fix plan</button></div>` : '<p class="muted">The scanner did not recognize any codes. Try pasting the exact error line, or use the single code decoder.</p>'}
        ${r.unmatched.length ? `<p class="small" style="margin-top:12px"><span class="muted">Not in the knowledge base yet:</span> ${r.unmatched.map((u) => `<button class="code-chip" type="button" data-req="${esc(u)}" title="Decode this">${esc(u)}</button>`).join(' ')}</p>` : ''}</div>`;
      out.onclick = (ev) => {
        const a = ev.target.closest('[data-addp]'); if (a) toast(plan.add(a.dataset.addp) ? 'Added to your fix plan' : 'Already in your fix plan');
        if (ev.target.closest('[data-addall]')) { let n = 0; r.matches.forEach((m) => { if (plan.add(m.slug)) n++; }); plan.setCurrent(r.matches[0].slug); toast(n ? `Added ${n} error${n === 1 ? '' : 's'} to your fix plan` : 'Everything was already in your plan', 'Open the Fix plan tab to work through them.'); }
        const q = ev.target.closest('[data-req]'); if (q) { state.decoder.mode = 'single'; state.decoder.q = q.dataset.req; renderDecoder(true); }
      };
    } catch (e) { out.innerHTML = `<div class="result"><p>${esc(e.message)}</p></div>`; }
  }

  // ---------------- lookup ----------------
  function renderLookup() {
    const L = state.lookup;
    const catOpts = Object.entries(CATS).map(([k, v]) => `<option value="${esc(k)}"${L.category === k ? ' selected' : ''}>${esc(v)}</option>`).join('');
    root.innerHTML = `<div class="toolbar"><input class="input" type="search" placeholder="Search titles, codes, tags and summaries" aria-label="Search the database" value="${esc(L.q)}" data-q>
      <select class="input" data-cat aria-label="Category"><option value="">All categories</option>${catOpts}</select>
      <select class="input" data-sev aria-label="Severity"><option value="">All severities</option>${['critical', 'high', 'medium', 'low'].map((s) => `<option value="${s}"${L.severity === s ? ' selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select>
      <select class="input" data-sort aria-label="Sort"><option value="">Relevance</option><option value="common"${L.sort === 'common' ? ' selected' : ''}>Most common</option><option value="severity"${L.sort === 'severity' ? ' selected' : ''}>Most severe</option><option value="az"${L.sort === 'az' ? ' selected' : ''}>A to Z</option></select></div>
      <div class="row between" style="margin-top:10px"><span class="small muted" data-count></span><button class="btn ghost sm${L.saved ? ' on' : ''}" type="button" data-saved>★ Saved (${ls.get('wm-saved', []).length})</button></div>
      <div class="lookup-grid" data-grid></div><div class="pg" data-pg></div>`;
    const load = debounce(fetchLookup, 220);
    $('[data-q]', root).addEventListener('input', (e) => { L.q = e.target.value; L.offset = 0; load(); });
    $('[data-cat]', root).addEventListener('change', (e) => { L.category = e.target.value; L.offset = 0; fetchLookup(); });
    $('[data-sev]', root).addEventListener('change', (e) => { L.severity = e.target.value; L.offset = 0; fetchLookup(); });
    $('[data-sort]', root).addEventListener('change', (e) => { L.sort = e.target.value; L.offset = 0; fetchLookup(); });
    $('[data-saved]', root).addEventListener('click', () => { L.saved = !L.saved; renderLookup(); });
    fetchLookup();
  }
  let lookCtl;
  async function fetchLookup() {
    const L = state.lookup; const grid = $('[data-grid]', root); if (!grid) return;
    const card = (e, views) => `<div class="card"><div class="row"><code class="code">${esc(e.codes ? e.codes[0] : e.code)}</code>${e.severity ? sevBadge(e.severity) : ''}</div><b>${esc(e.title)}</b><p>${esc(e.summary || '')}</p><div class="row"><span class="small muted">${views ? views + ' views' : ''}</span><span class="row"><button class="btn ghost sm" type="button" data-dec="${esc(e.codes ? e.codes[0] : e.code)}">Decode</button><a class="btn ghost sm" href="/errors/${esc(e.slug)}">Open</a></span></div></div>`;
    if (L.saved) {
      const saved = ls.get('wm-saved', []);
      $('[data-count]', root).textContent = `${saved.length} saved error${saved.length === 1 ? '' : 's'}`;
      grid.innerHTML = saved.length ? saved.map((s) => card({ ...s, codes: [s.code] })).join('') : '<div class="empty" style="grid-column:1/-1">Nothing saved yet. Use the Save button on any error page.</div>';
      $('[data-pg]', root).innerHTML = '';
    } else {
      if (lookCtl) lookCtl.abort(); lookCtl = new AbortController();
      const p = new URLSearchParams({ q: L.q, category: L.category, severity: L.severity, sort: L.sort, limit: '9', offset: String(L.offset) });
      try {
        const r = await api('/api/errors?' + p, { signal: lookCtl.signal });
        $('[data-count]', root).textContent = `${r.total} result${r.total === 1 ? '' : 's'}`;
        grid.innerHTML = r.items.length ? r.items.map((e) => card(e, r.views[e.slug])).join('') : `<div class="empty" style="grid-column:1/-1"><p><b>Nothing matches those filters</b></p><button class="btn ghost sm" type="button" data-reset>Reset filters</button></div>`;
        const page = Math.floor(L.offset / 9) + 1, pages = Math.max(1, Math.ceil(r.total / 9));
        $('[data-pg]', root).innerHTML = pages > 1 ? `<button class="btn ghost sm" data-prev ${page <= 1 ? 'disabled' : ''}>Previous</button><span class="small muted">Page ${page} of ${pages}</span><button class="btn ghost sm" data-next ${page >= pages ? 'disabled' : ''}>Next</button>` : '';
      } catch (e) { if (e.name !== 'AbortError') grid.innerHTML = `<p>${esc(e.message)}</p>`; }
    }
    root.onclick = (ev) => {
      const d = ev.target.closest('[data-dec]'); if (d) show('decoder', { q: d.dataset.dec, mode: 'single' });
      if (ev.target.closest('[data-prev]')) { L.offset = Math.max(0, L.offset - 9); fetchLookup(); }
      if (ev.target.closest('[data-next]')) { L.offset += 9; fetchLookup(); }
      if (ev.target.closest('[data-reset]')) { Object.assign(L, { q: '', category: '', severity: '', sort: '', offset: 0 }); renderLookup(); }
    };
  }

  // ---------------- triage ----------------
  const STEPS = [
    { key: 'symptom', q: 'What is happening?', opts: [['bsod', 'Blue screen (BSOD)'], ['no-boot', 'Windows will not start'], ['boot-loop', 'Restart loop'], ['update-fail', 'Updates fail'], ['app-crash', 'App or game crashes'], ['slow', 'Slow system'], ['freeze', 'Freezes or hangs'], ['device-error', 'Device problems'], ['no-network', 'No internet'], ['file-corrupt', 'Corrupted files'], ['activation-fail', 'Activation errors'], ['no-audio', 'No sound'], ['display-glitch', 'Display glitches'], ['driver-error', 'Driver errors'], ['store-fail', 'Store problems'], ['permission-denied', 'Access denied']] },
    { key: 'when', q: 'When does it happen?', opts: [['startup', 'At startup'], ['shutdown', 'At shutdown'], ['under-load', 'Under heavy load'], ['random', 'At random'], ['during-update', 'During updates'], ['install', 'When installing'], ['gaming', 'While gaming'], ['idle', 'When idle'], ['sleep-wake', 'Sleep or wake']] },
    { key: 'change', q: 'What changed recently?', opts: [['windows-update', 'A Windows update'], ['new-hardware', 'New hardware'], ['new-software', 'New software'], ['driver-update', 'A driver update'], ['power-event', 'Power cut or forced shutdown'], ['overclock', 'Overclock or tuning'], ['storage-full', 'Disk almost full'], ['none', 'Nothing I know of']] },
    { key: 'boot', q: 'Can Windows start?', opts: [['yes', 'Yes, normally'], ['safe-mode', 'Only in Safe Mode'], ['recovery', 'Only recovery screens'], ['no', 'Not at all']] },
  ];
  function renderTriage() {
    const T = state.triage;
    if (T.step >= STEPS.length) return runTriage();
    const s = STEPS[T.step];
    root.innerHTML = `<div class="wizard-steps" aria-label="Progress">${STEPS.map((_, i) => `<span class="${i <= T.step ? 'on' : ''}"></span>`).join('')}</div>
      <p class="small muted">Step ${T.step + 1} of ${STEPS.length}</p><h3>${esc(s.q)}</h3>
      <div class="opts">${s.opts.map(([v, l]) => `<button type="button" class="opt" data-v="${v}" aria-pressed="${T.a[s.key] === v}">${esc(l)}</button>`).join('')}</div>
      <div class="row between" style="margin-top:16px"><button class="btn ghost sm" type="button" data-back ${T.step === 0 ? 'disabled' : ''}>Back</button>${T.step > 0 ? '<button class="btn ghost sm" type="button" data-skip>Skip this question</button>' : ''}</div>`;
    $$('.opt', root).forEach((b) => b.addEventListener('click', () => { T.a[s.key] = b.dataset.v; T.step++; renderTriage(); }));
    const back = $('[data-back]', root); if (back) back.addEventListener('click', () => { T.step = Math.max(0, T.step - 1); renderTriage(); });
    const skip = $('[data-skip]', root); if (skip) skip.addEventListener('click', () => { delete T.a[s.key]; T.step++; renderTriage(); });
  }
  async function runTriage() {
    const T = state.triage;
    root.innerHTML = '<div class="skeleton" style="height:220px"></div>';
    try {
      const r = await api('/api/diagnose', { body: T.a });
      const stat = $('[data-stat="sessions"]'); if (stat && r.sessions) stat.textContent = r.sessions.toLocaleString();
      const labels = Object.fromEntries(STEPS.flatMap((s) => s.opts.map(([v, l]) => [s.key + ':' + v, l])));
      const summary = Object.entries(T.a).map(([k, v]) => labels[k + ':' + v]).filter(Boolean).join(' · ');
      if (r.matches.length) history.add({ kind: 'triage', query: summary, title: `Triage: ${r.matches[0].title}`, slug: r.matches[0].slug, severity: r.matches[0].severity });
      const color = (s) => (s >= 8 ? 'var(--acc)' : s >= 5 ? '#f59e0b' : 'var(--line2)');
      const top = r.matches.slice(0, 3);
      root.innerHTML = `<div class="row between wrap-row"><div><p class="eyebrow">Your answers</p><p class="small">${esc(summary)}</p></div><button class="btn ghost sm" type="button" data-restart>Start over</button></div>
        ${r.matches.length ? `<h3>Most likely causes</h3><div class="tri-res">${r.matches.map((m, i) => `<div class="card" style="--sc:${color(m.score)}"><div class="row between wrap-row"><div class="row wrap-row">${i === 0 ? '<span class="badge start">Top match</span>' : ''}<code class="code">${esc(m.code)}</code>${sevBadge(m.severity)}</div><div class="row" title="Match strength ${m.score} out of 10"><div class="meter"><i style="width:${m.score * 10}%;background:${color(m.score)}"></i></div><span class="small">${m.score}/10</span></div></div>
          <h3 style="margin:8px 0 4px">${esc(m.title)}</h3><p class="small muted" style="margin:0">${esc(m.summary)}</p><ul class="reasons">${m.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          <div class="row wrap-row" style="margin-top:10px"><button class="btn primary sm" type="button" data-plan="${esc(m.slug)}">Build fix plan</button><a class="btn ghost sm" href="/errors/${esc(m.slug)}">Full page</a><button class="btn ghost sm" type="button" data-dec="${esc(m.code)}">Decode</button></div></div>`).join('')}</div>
          ${top.length > 1 ? `<h3 style="margin-top:20px">Compare the top causes</h3><div class="table-wrap"><table><thead><tr><th>Attribute</th>${top.map((m, i) => `<th>${i === 0 ? '★ ' : ''}${esc(m.title)}</th>`).join('')}</tr></thead><tbody>
            <tr><td>Match strength</td>${top.map((m) => `<td>${m.score}/10</td>`).join('')}</tr>
            <tr><td>Severity</td>${top.map((m) => `<td>${sevBadge(m.severity)}</td>`).join('')}</tr>
            <tr><td>How common</td>${top.map((m) => `<td>${FREQ[m.frequency] || ''}</td>`).join('')}</tr>
            <tr><td>Category</td>${top.map((m) => `<td>${esc(CATS[m.category] || m.category)}</td>`).join('')}</tr>
            <tr><td>First fix (safest)</td>${top.map((m) => `<td>${esc(m.firstFix || '-')}</td>`).join('')}</tr>
            <tr><td>Documented steps</td>${top.map((m) => `<td>${m.fixCount}</td>`).join('')}</tr>
            <tr><td>Riskiest step flagged</td>${top.map((m) => `<td>${esc(m.riskiest || 'None')}</td>`).join('')}</tr>
            <tr><td>Act on it</td>${top.map((m) => `<td><button class="btn ghost sm" type="button" data-plan="${esc(m.slug)}">Build plan</button></td>`).join('')}</tr></tbody></table></div>` : ''}`
        : '<div class="empty"><p><b>No strong match for that combination.</b></p><p>Try a different symptom, or search the database in Lookup.</p></div>'}
        <div class="note"><b>Before you start</b><ul style="margin:6px 0 0">${r.guidance.map((g) => `<li>${md(g)}</li>`).join('')}</ul></div>`;
      root.onclick = (ev) => {
        if (ev.target.closest('[data-restart]')) { state.triage = { step: 0, a: {} }; renderTriage(); }
        const p = ev.target.closest('[data-plan]'); if (p) { plan.add(p.dataset.plan); show('plan'); }
        const d = ev.target.closest('[data-dec]'); if (d) show('decoder', { q: d.dataset.dec, mode: 'single' });
      };
    } catch (e) { root.innerHTML = `<p>${esc(e.message)}</p><button class="btn ghost" data-restart>Start over</button>`; root.onclick = () => { state.triage = { step: 0, a: {} }; renderTriage(); }; }
  }

  // ---------------- plan ----------------
  const entryCache = {};
  async function getEntry(slug) { if (!entryCache[slug]) entryCache[slug] = api('/api/errors/' + encodeURIComponent(slug)).then((r) => r.entry); return entryCache[slug]; }

  function paintPlanCount() { const c = $('[data-plan-count]'); const n = plan.state().queue.length; if (c) { c.hidden = !n; c.textContent = n; } }
  document.addEventListener('wm:plan', paintPlanCount);

  async function renderPlan() {
    const st = plan.state();
    const cur = st.current || st.queue[0];
    const queueHtml = st.queue.length ? `<div class="queue" aria-label="Fix plan queue">${st.queue.map((s) => `<span class="q${s === cur ? ' on' : ''}" data-pick="${esc(s)}">${esc(s)}<button type="button" data-rm="${esc(s)}" aria-label="Remove from queue">✕</button></span>`).join('')}</div>` : '';
    const picker = `<div class="field" style="position:relative"><input class="input" data-pq placeholder="Pick an error: type a code or a few words" aria-label="Choose an error" autocomplete="off"><ul class="suggest" data-ps hidden></ul></div>`;
    if (!cur) {
      root.innerHTML = `${picker}<div class="empty"><p><b>No fix plan yet</b></p><p>Pick an error above, or use <b>Build a fix plan</b> on any result. The plan turns the fix list into a checklist that remembers your progress on this device.</p></div>`;
      wirePicker(); return;
    }
    root.innerHTML = `${queueHtml}${picker}<div data-plan-body><div class="skeleton" style="height:200px;margin-top:14px"></div></div>`;
    wirePicker();
    root.onclick = (ev) => {
      const rm = ev.target.closest('[data-rm]'); if (rm) { ev.stopPropagation(); plan.remove(rm.dataset.rm); toast('Removed from the queue'); renderPlan(); return; }
      const pk = ev.target.closest('[data-pick]'); if (pk) { plan.setCurrent(pk.dataset.pick); renderPlan(); }
    };
    let e;
    try { e = await getEntry(cur); } catch { $('[data-plan-body]', root).innerHTML = `<div class="empty"><p>That error could not be loaded.</p><button class="btn ghost sm" data-rm="${esc(cur)}">Remove it</button></div>`; return; }
    const body = $('[data-plan-body]', root);
    const draw = () => {
      const checks = plan.checks(e.slug);
      const done = e.fixes.filter((_, i) => checks[i]).length;
      const pct = Math.round((done / e.fixes.length) * 100);
      body.innerHTML = `<div class="plan-head" style="margin-top:14px"><div><div class="row wrap-row">${catBadge(e.category)}${sevBadge(e.severity)}<code class="code">${esc(e.codes[0])}</code></div><h3 style="margin:6px 0 0">${esc(e.title)}</h3></div>
        <div class="row wrap-row"><button class="btn ghost sm" type="button" data-md>Copy as Markdown</button><button class="btn ghost sm" type="button" data-dl>Download .md</button><button class="btn ghost sm" type="button" onclick="print()">Print</button><button class="btn ghost sm" type="button" data-reset>Reset progress</button><a class="btn ghost sm" href="/errors/${esc(e.slug)}">Full page</a></div></div>
        <p class="small muted" style="margin-top:8px">${md(e.summary)}</p>
        <div class="row between"><span class="small"><b>${done}</b> of ${e.fixes.length} steps done</span><span class="small muted">${pct}%</span></div><div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
        ${done === e.fixes.length ? `<div class="note" style="border-color:var(--ok)"><b>Every step is done.</b> If the error is gone, you are finished. If it keeps coming back, back up your files and consider an in-place repair install, or run the <a href="#" data-tri>triage wizard</a> to look for a different cause.</div>` : ''}
        <ol class="checklist">${e.fixes.map((f, i) => `<li class="${checks[i] ? 'done' : ''}"><input type="checkbox" id="pc${i}" data-ck="${i}" ${checks[i] ? 'checked' : ''}><div><label for="pc${i}"><h4>${i + 1}. ${esc(f.title)} ${i === 0 && !checks[i] ? '<span class="badge start">Start here</span>' : ''}</h4></label><p class="small muted">${esc(f.difficulty)} · ${esc(f.timeEstimate)}</p><p>${md(f.detail)}</p>${f.riskNote ? `<div class="caution"><div><b>Caution</b><p>${md(f.riskNote)}</p></div></div>` : ''}</div></li>`).join('')}</ol>
        ${e.prevention.length ? `<h4 style="margin-top:18px">Prevention</h4><ul>${e.prevention.map((p) => `<li>${md(p)}</li>`).join('')}</ul>` : ''}`;
      $$('[data-ck]', body).forEach((c) => c.addEventListener('change', () => {
        const ch = plan.checks(e.slug); ch[c.dataset.ck] = c.checked; plan.setChecks(e.slug, ch);
        if (c.checked && e.fixes.every((_, i) => ch[i])) toast('Plan complete', 'Nice work. Check whether the error is gone.');
        draw();
      }));
      $('[data-md]', body).addEventListener('click', () => copy(toMd(e), 'Copied', 'Fix plan copied as Markdown.'));
      $('[data-dl]', body).addEventListener('click', () => download(`fix-plan-${e.slug}.md`, toMd(e)));
      $('[data-reset]', body).addEventListener('click', () => { plan.setChecks(e.slug, {}); draw(); toast('Progress reset'); });
      const tri = $('[data-tri]', body); if (tri) tri.addEventListener('click', (ev) => { ev.preventDefault(); show('triage'); });
    };
    draw();
    history.add({ kind: 'plan', query: e.codes[0], title: `Fix plan: ${e.title}`, slug: e.slug, severity: e.severity });
  }
  function toMd(e) {
    const ch = plan.checks(e.slug);
    const lines = [`# Fix plan: ${e.title}`, '', e.summary, '', '## Steps (safest first)'];
    e.fixes.forEach((f, i) => { lines.push(`${ch[i] ? '- [x]' : '- [ ]'} **${i + 1}. ${f.title}** (${f.difficulty}, ${f.timeEstimate})`, `   ${f.detail}`); if (f.riskNote) lines.push(`   Caution: ${f.riskNote}`); });
    lines.push('', '## Prevention', ...e.prevention.map((p) => `- ${p}`), '', `Source: ${location.origin}/errors/${e.slug}`);
    return lines.join('\n');
  }
  function wirePicker() {
    const inp = $('[data-pq]', root); const ul = $('[data-ps]', root); if (!inp) return;
    const go = debounce(async () => {
      const q = inp.value.trim();
      const r = await api('/api/errors?limit=8&q=' + encodeURIComponent(q)).catch(() => ({ items: [] }));
      ul.innerHTML = r.items.map((e) => `<li data-s="${esc(e.slug)}"><code>${esc(e.codes[0])}</code><span>${esc(e.title)}</span></li>`).join('') || '<li class="hint">No match</li>';
      ul.hidden = false;
    }, 180);
    inp.addEventListener('input', go); inp.addEventListener('focus', go);
    inp.addEventListener('blur', () => setTimeout(() => (ul.hidden = true), 180));
    ul.addEventListener('mousedown', (e) => { const li = e.target.closest('[data-s]'); if (li) { plan.setCurrent(li.dataset.s); renderPlan(); } });
  }

  // ---------------- hero ----------------
  function paintRecent() {
    const box = $('[data-recent]'); if (!box) return;
    const r = ls.get('wm-recent', []);
    box.hidden = !r.length;
    box.innerHTML = r.length ? `<span class="muted">Recent:</span>${r.map((x) => `<button type="button" data-r="${esc(x)}">${esc(x)}</button>`).join('')}<button type="button" data-rclear title="Clear recent searches">✕</button>` : '';
  }
  function initHero() {
    const form = $('[data-hero-search]'); if (!form) return;
    const input = $('#hero-q'); const ul = $('#hero-suggest');
    let items = [], sel = -1, ctl;
    const close = () => { ul.hidden = true; input.setAttribute('aria-expanded', 'false'); sel = -1; };
    const paint = () => $$('li[data-i]', ul).forEach((li) => li.setAttribute('aria-selected', String(Number(li.dataset.i) === sel)));
    const suggest = debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) return close();
      if (ctl) ctl.abort(); ctl = new AbortController();
      try {
        const r = await api('/api/errors?limit=6&q=' + encodeURIComponent(q), { signal: ctl.signal });
        items = r.items;
        ul.innerHTML = items.map((e, i) => `<li role="option" data-i="${i}"><code>${esc(e.codes[0])}</code><span>${esc(e.title)}</span></li>`).join('') + `<li class="hint">Enter decodes "${esc(q)}" with the full knowledge base</li>`;
        ul.hidden = false; input.setAttribute('aria-expanded', 'true'); sel = -1;
      } catch {}
    }, 160);
    input.addEventListener('input', suggest);
    input.addEventListener('keydown', (e) => {
      if (ul.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(-1, sel - 1); paint(); }
      else if (e.key === 'Escape') close();
      else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); location.href = '/errors/' + items[sel].slug; }
    });
    input.addEventListener('blur', () => setTimeout(close, 150));
    ul.addEventListener('mousedown', (e) => { const li = e.target.closest('li[data-i]'); if (li) location.href = '/errors/' + items[Number(li.dataset.i)].slug; });
    form.addEventListener('submit', (e) => { e.preventDefault(); const q = input.value.trim(); if (!q) return input.focus(); close(); show('decoder', { q, mode: 'single' }); $('#tools').scrollIntoView({ behavior: 'smooth' }); });
    $('[data-surprise]').addEventListener('click', async () => { const r = await api('/api/random'); input.value = r.code; show('decoder', { q: r.code, mode: 'single' }); $('#tools').scrollIntoView({ behavior: 'smooth' }); });
    document.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]'); if (r) { input.value = r.dataset.r; show('decoder', { q: r.dataset.r, mode: 'single' }); $('#tools').scrollIntoView({ behavior: 'smooth' }); }
      if (e.target.closest('[data-rclear]')) { ls.del('wm-recent'); paintRecent(); toast('Recent searches cleared'); }
    });
    paintRecent();
  }

  function countUp(el, to) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to.toLocaleString(); return; }
    const t0 = performance.now(); const dur = 900;
    const step = (t) => { const p = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString(); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  async function initMeta() {
    try {
      const r = await api('/api');
      CATS = Object.fromEntries(r.stats.byCategory.map((c) => [c.category, c.label]));
      $$('[data-count]').forEach((el) => countUp(el, Number(el.dataset.count)));
      const s = $('[data-stat="sessions"]'); if (s) countUp(s, r.community.sessions || 0);
      const tr = r.community.trending || [];
      const box = $('[data-trending]');
      if (box && tr.length) { box.hidden = false; box.innerHTML = `<span class="lbl">🔥 Trending now:</span>${tr.map((t) => `<a href="/errors/${esc(t.slug)}"><code>${esc(t.code)}</code><span class="small muted">${t.views}</span></a>`).join('')}`; }
      if (current === 'lookup') renderLookup();
    } catch {}
    try {
      const d = await api('/api/daily');
      const box = $('[data-daily]');
      if (box && d.entry) { const e = d.entry; box.hidden = false; box.innerHTML = `<div class="card"><div><p class="eyebrow">Error of the day</p><h3 style="margin:0 0 4px">${esc(e.title)}</h3><p class="small muted" style="margin:0">${esc(e.summary)}</p></div><div class="row"><a class="btn primary sm" href="/errors/${esc(e.slug)}">Read it</a><button class="btn ghost sm" type="button" data-dplan="${esc(e.slug)}">Build plan</button></div></div>`; box.addEventListener('click', (ev) => { const b = ev.target.closest('[data-dplan]'); if (b) { plan.add(b.dataset.dplan); show('plan'); $('#tools').scrollIntoView({ behavior: 'smooth' }); } }); }
    } catch {}
  }

  // ---------------- boot ----------------
  window.WMApp = { show };
  initHero();
  paintPlanCount();
  const params = new URLSearchParams(location.search);
  const tool = params.get('tool') || 'decoder';
  if (params.get('q') && !params.get('tool')) { state.decoder.q = params.get('q'); }
  show(['decoder', 'lookup', 'triage', 'plan'].includes(tool) ? tool : 'decoder', { q: params.get('q') || undefined, mode: params.get('mode') || undefined, slug: params.get('slug') || undefined });
  if (params.get('q') && tool === 'decoder') { const i = $('#hero-q'); if (i) i.value = params.get('q'); }
  initMeta();
  if (location.hash === '#tools' && (params.get('tool') || params.get('q'))) setTimeout(() => $('#tools').scrollIntoView({ block: 'start' }), 60);
})();
