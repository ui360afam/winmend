/* WinMend admin panel: add, edit and bulk import error entries, run the
   scraper, review visitor requests, export data and download the source. */
(function () {
  'use strict';
  const { $, $$, esc, api, toast, download } = window.WM;
  const root = $('#admin-root');
  const CATS = {};
  let view = 'overview';
  const SIGNALS = {
    symptom: ['bsod', 'no-boot', 'boot-loop', 'update-fail', 'app-crash', 'slow', 'freeze', 'device-error', 'no-network', 'file-corrupt', 'activation-fail', 'no-audio', 'display-glitch', 'driver-error', 'store-fail', 'permission-denied'],
    when: ['startup', 'shutdown', 'under-load', 'random', 'during-update', 'install', 'gaming', 'idle', 'sleep-wake'],
    change: ['windows-update', 'new-hardware', 'new-software', 'driver-update', 'power-event', 'overclock', 'storage-full', 'none'],
    boot: ['yes', 'safe-mode', 'recovery', 'no'],
  };

  async function start() {
    let st;
    try { st = await api('/api/admin/status'); } catch (e) { root.innerHTML = `<p>${esc(e.message)}</p>`; return; }
    if (!st.loggedIn) return loginScreen(st);
    try { const r = await api('/api'); r.stats.byCategory.forEach((c) => (CATS[c.category] = c.label)); } catch {}
    const known = { bsod: 'Blue Screen (BSOD)', update: 'Windows Update', win32: 'System (Win32)', store: 'Microsoft Store', activation: 'Activation', network: 'Network', startup: 'Startup & Boot', driver: 'Drivers', hardware: 'Hardware', performance: 'Performance', 'file-system': 'Files & Disk', audio: 'Audio', security: 'Security' };
    for (const [k, v] of Object.entries(known)) if (!CATS[k]) CATS[k] = v;
    if (new URLSearchParams(location.search).get('next') === 'download') location.href = '/download/source.zip';
    shell();
  }

  function loginScreen(st) {
    const setup = !st.configured;
    root.innerHTML = `<div class="card login"><p class="eyebrow">Admin</p><h1 style="font-size:1.6rem">${setup ? 'Create the admin password' : 'Sign in'}</h1>
      <p class="muted small">${setup ? 'This is the first visit to the admin panel. Choose a password (8 characters or more). Whoever sets it first controls the panel, so do this right after the site goes live.' : 'Enter the admin password to manage error entries.'}</p>
      <form data-f><label class="lbl" for="pw">Password</label><input class="input" id="pw" type="password" autocomplete="${setup ? 'new-password' : 'current-password'}" required minlength="${setup ? 8 : 1}">
      ${setup ? '<label class="lbl" for="pw2">Repeat password</label><input class="input" id="pw2" type="password" autocomplete="new-password" required minlength="8">' : ''}
      <button class="btn primary block-btn" type="submit" style="margin-top:16px">${setup ? 'Create password and sign in' : 'Sign in'}</button></form></div>`;
    $('[data-f]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = $('#pw').value;
      if (setup && pw !== $('#pw2').value) return toast('The passwords do not match');
      try { await api(setup ? '/api/admin/setup' : '/api/admin/login', { body: { password: pw } }); start(); }
      catch (err) { toast(err.message); }
    });
    $('#pw').focus();
  }

  function shell() {
    const tabs = [['overview', 'Overview'], ['entries', 'All entries'], ['edit', 'Add an error'], ['import', 'Bulk import'], ['scraper', 'Scraper'], ['requests', 'Visitor requests'], ['settings', 'Settings']];
    root.innerHTML = `<div class="row between wrap-row"><div><p class="eyebrow">Admin</p><h1 style="font-size:1.7rem;margin:0">Content manager</h1></div><div class="row"><a class="btn ghost sm" href="/manual#adding-new-error-codes">How adding works</a><a class="btn primary sm" href="/download/source.zip">Download source zip</a></div></div>
      <nav class="adm-nav">${tabs.map(([k, l]) => `<button type="button" data-v="${k}">${l}</button>`).join('')}</nav><div data-view></div>`;
    $$('[data-v]').forEach((b) => b.addEventListener('click', () => go(b.dataset.v)));
    go(location.hash.slice(1) || 'overview');
  }
  function go(v, arg) {
    view = v;
    $$('[data-v]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.v === v)));
    try { history.replaceState(null, '', '/admin#' + v); } catch {}
    const box = $('[data-view]');
    box.innerHTML = '<div class="skeleton"></div>';
    ({ overview, entries, edit, import: importView, scraper, requests, settings }[v] || overview)(box, arg);
  }

  // ---------- overview ----------
  async function overview(box) {
    const o = await api('/api/admin/overview');
    const c = o.counts;
    box.innerHTML = `<div class="kpis">
      <div><b>${o.stats.total}</b><span>Published errors</span></div><div><b>${c.builtin}</b><span>Built-in</span></div><div><b>${c.custom}</b><span>Added or edited here</span></div>
      <div><b>${c.drafts}</b><span>Drafts</span></div><div><b>${c.scrapedNew}</b><span>Scraped, waiting</span></div><div><b>${o.wishlist.length}</b><span>Visitor requests</span></div>
      <div><b>${o.community.views}</b><span>Page views counted</span></div><div><b>${o.community.sessions}</b><span>Triage runs</span></div><div><b>${o.community.decodes}</b><span>Decodes</span></div></div>
      <div class="grid g2"><div class="card"><h3>Quick actions</h3><div class="row wrap-row"><button class="btn primary sm" data-go="edit">Add one error</button><button class="btn ghost sm" data-go="import">Import a list</button><button class="btn ghost sm" data-go="scraper">Scrape code lists</button><button class="btn ghost sm" data-export>Export my entries (JSON)</button></div>
      <p class="small muted" style="margin-top:12px">Everything you add here is stored in <code>${esc(o.dataDir)}</code>, which survives deploys. The source zip includes your added entries as <code>content/errors.d/admin-export.json</code>, so a local copy has them too.</p></div>
      <div class="card"><h3>Most viewed</h3>${o.trending.length ? o.trending.map((t) => `<a class="rel" href="/errors/${esc(t.slug)}"><code>${esc(t.code)}</code><span>${esc(t.title)} · ${t.views} views</span></a>`).join('') : '<p class="muted small">No views yet.</p>'}</div></div>
      <div class="card" style="margin-top:16px"><h3>Top visitor requests</h3>${o.wishlist.slice(0, 8).map((w) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span><code>${esc(w.code)}</code> <span class="muted small">${w.votes} request${w.votes === 1 ? '' : 's'}</span></span><button class="btn ghost sm" data-draft="${esc(w.code)}">Create page</button></div>`).join('') || '<p class="muted small">No open requests.</p>'}</div>`;
    box.onclick = (e) => {
      const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go);
      if (e.target.closest('[data-export]')) location.href = '/api/admin/export';
      const d = e.target.closest('[data-draft]'); if (d) go('edit', { code: d.dataset.draft, auto: true });
    };
  }

  // ---------- entries ----------
  async function entries(box) {
    const st = { q: '', source: '', offset: 0 };
    box.innerHTML = `<div class="toolbar" style="grid-template-columns:1fr auto"><input class="input" type="search" placeholder="Filter by code, title or slug" data-q><select class="input" data-src><option value="">Every source</option><option value="builtin">Built-in</option><option value="custom">Added here</option><option value="override">Built-in, edited here</option><option value="repo">Repo files (content/errors.d)</option><option value="auto">Auto-generated</option><option value="draft">Drafts</option><option value="hidden">Hidden</option></select></div><div data-list style="margin-top:12px"></div>`;
    const load = async () => {
      const r = await api(`/api/admin/entries?q=${encodeURIComponent(st.q)}&source=${st.source}&offset=${st.offset}`);
      const page = Math.floor(st.offset / 50) + 1, pages = Math.max(1, Math.ceil(r.total / 50));
      $('[data-list]', box).innerHTML = `<p class="small muted">${r.total} entries</p><div class="table-wrap"><table class="adm-table"><thead><tr><th>Code</th><th>Title</th><th>Category</th><th>Source</th><th>Status</th><th></th></tr></thead><tbody>${r.items.map((e) => `<tr><td><code>${esc(e.code)}</code></td><td>${esc(e.title)}${e.autoDrafted ? ' <span class="badge soft">auto</span>' : ''}</td><td>${esc(CATS[e.category] || e.category)}</td><td>${esc(e.source)}</td><td>${esc(e.status)}</td><td><div class="row"><button class="btn ghost sm" data-edit="${esc(e.slug)}">Edit</button><a class="btn ghost sm" href="/errors/${esc(e.slug)}${e.status === 'draft' ? '?preview=1' : ''}" target="_blank" rel="noopener">View</a>${e.status === 'hidden' ? `<button class="btn ghost sm" data-restore="${esc(e.slug)}">Restore</button>` : `<button class="btn danger sm" data-del="${esc(e.slug)}" data-src="${esc(e.source)}">${e.source === 'builtin' || e.source === 'repo' ? 'Hide' : e.source === 'override' ? 'Revert' : 'Delete'}</button>`}</div></td></tr>`).join('')}</tbody></table></div>
        <div class="pg">${pages > 1 ? `<button class="btn ghost sm" data-p="-1" ${page <= 1 ? 'disabled' : ''}>Previous</button><span class="small">Page ${page} of ${pages}</span><button class="btn ghost sm" data-p="1" ${page >= pages ? 'disabled' : ''}>Next</button>` : ''}</div>`;
    };
    $('[data-q]', box).addEventListener('input', window.WM.debounce((e) => { st.q = e.target.value; st.offset = 0; load(); }, 250));
    $('[data-src]', box).addEventListener('change', (e) => { st.source = e.target.value; st.offset = 0; load(); });
    box.onclick = async (e) => {
      const ed = e.target.closest('[data-edit]'); if (ed) go('edit', { slug: ed.dataset.edit });
      const p = e.target.closest('[data-p]'); if (p) { st.offset = Math.max(0, st.offset + Number(p.dataset.p) * 50); load(); }
      const d = e.target.closest('[data-del]');
      if (d) {
        const src = d.dataset.src;
        const msg = src === 'builtin' || src === 'repo' ? 'Hide this entry from the site? You can restore it later.' : src === 'override' ? 'Throw away your edits and go back to the built-in version?' : 'Delete this entry permanently?';
        if (!confirm(msg)) return;
        await api('/api/admin/entry/' + encodeURIComponent(d.dataset.del), { method: 'DELETE' }); toast('Done'); load();
      }
      const rs = e.target.closest('[data-restore]'); if (rs) { await api('/api/admin/entry/' + encodeURIComponent(rs.dataset.restore) + '?restore=1', { method: 'DELETE' }); toast('Restored'); load(); }
    };
    load();
  }

  // ---------- add / edit ----------
  async function edit(box, arg = {}) {
    let entry = { slug: '', title: '', codes: [], category: 'win32', severity: 'medium', frequency: 'common', windowsVersions: ['Windows 10', 'Windows 11'], summary: '', meaning: '', commonCauses: [], fixes: [], prevention: [], signals: [], relatedSlugs: [], tags: [] };
    let originalSlug = null; let status = 'published';
    if (arg.slug) { const r = await api('/api/admin/entry/' + encodeURIComponent(arg.slug)); entry = r.entry; originalSlug = entry.slug; status = entry.status || 'published'; }
    if (arg.entry) entry = arg.entry;
    const lines = (a) => (a || []).join('\n');
    const opt = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('');
    box.innerHTML = `<form data-f class="card">
      <div class="row between wrap-row"><h2 style="margin:0">${originalSlug ? 'Edit ' + esc(entry.title) : 'Add an error'}</h2>${originalSlug ? `<a class="btn ghost sm" href="/errors/${esc(originalSlug)}${status === 'draft' ? '?preview=1' : ''}" target="_blank" rel="noopener">Open page</a>` : ''}</div>
      ${originalSlug ? '' : `<div class="note"><b>Fastest way:</b> type the code (and a title or the official message if you have it), then press <b>Auto-fill content</b>. Every field below is filled with a complete, safe draft that you can adjust before saving.</div>`}
      <div class="form-grid">
        <div><label class="lbl">Main code (what people see on screen)</label><div class="field"><input class="input" name="code" value="${esc(entry.codes[0] || arg.code || '')}" placeholder="0x80070490, PAGE_FAULT_IN_NONPAGED_AREA, Code 28" required><button class="btn ghost" type="button" data-auto>Auto-fill content</button></div></div>
        <div><label class="lbl">Official message or short description (optional, improves auto-fill)</label><input class="input" name="hint" placeholder="Element not found."></div>
        <div class="full"><label class="lbl">Title</label><input class="input" name="title" value="${esc(entry.title)}" placeholder="Windows Update error 0x80070490 (ERROR_NOT_FOUND)"></div>
        <div><label class="lbl">Slug (address of the page)</label><input class="input" name="slug" value="${esc(entry.slug)}" placeholder="filled in automatically"></div>
        <div><label class="lbl">Other codes and aliases (comma separated)</label><input class="input" name="aliases" value="${esc(entry.codes.slice(1).join(', '))}" placeholder="0x490, ERROR_NOT_FOUND, -2147023728"></div>
        <div><label class="lbl">Category</label><select class="input" name="category">${opt(CATS, entry.category)}</select></div>
        <div class="row" style="gap:12px"><div style="flex:1"><label class="lbl">Severity</label><select class="input" name="severity">${opt({ low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }, entry.severity)}</select></div><div style="flex:1"><label class="lbl">How common</label><select class="input" name="frequency">${opt({ rare: 'Rare', uncommon: 'Uncommon', common: 'Common', 'very-common': 'Very common' }, entry.frequency)}</select></div></div>
        <div class="full"><label class="lbl">Summary (one or two sentences, shown in lists and search)</label><textarea class="input" name="summary" rows="2" style="font-family:var(--font);min-height:60px">${esc(entry.summary)}</textarea></div>
        <div class="full"><label class="lbl">What it means (paragraph)</label><textarea class="input" name="meaning" rows="4" style="font-family:var(--font);min-height:90px">${esc(entry.meaning)}</textarea></div>
        <div><label class="lbl">Common causes (one per line)</label><textarea class="input" name="causes" rows="5" style="font-family:var(--font)">${esc(lines(entry.commonCauses))}</textarea></div>
        <div><label class="lbl">Prevention tips (one per line)</label><textarea class="input" name="prevention" rows="5" style="font-family:var(--font)">${esc(lines(entry.prevention))}</textarea></div>
        <div class="full"><label class="lbl">Fix steps, safest first. Put commands in backticks, for example \`sfc /scannow\`.</label><div data-fixes></div><button class="btn ghost sm" type="button" data-addfix>+ Add a step</button></div>
        <div class="full"><label class="lbl">Triage signals (which answers in the wizard should point to this error)</label>${Object.entries(SIGNALS).map(([g, vals]) => `<div class="pillset" style="margin-bottom:6px"><b class="small" style="width:70px">${g}</b>${vals.map((v) => `<label class="badge"><input type="checkbox" name="sig" value="${g}:${v}" ${entry.signals.includes(g + ':' + v) ? 'checked' : ''}> ${v}</label>`).join('')}</div>`).join('')}</div>
        <div><label class="lbl">Related entries (slugs, comma separated)</label><input class="input" name="related" value="${esc(entry.relatedSlugs.join(', '))}"></div>
        <div><label class="lbl">Tags (comma separated)</label><input class="input" name="tags" value="${esc(entry.tags.join(', '))}"></div>
        <div><label class="lbl">Windows versions (comma separated)</label><input class="input" name="versions" value="${esc(entry.windowsVersions.join(', '))}"></div>
      </div>
      <div class="row wrap-row" style="margin-top:18px"><button class="btn primary" type="submit" data-status="published">Save and publish</button><button class="btn ghost" type="submit" data-status="draft">Save as draft</button><span class="small muted" data-msg></span></div></form>`;
    const f = $('[data-f]', box);
    let fixes = entry.fixes.map((x) => ({ ...x }));
    const drawFixes = () => {
      $('[data-fixes]', box).innerHTML = fixes.map((x, i) => `<div class="fix-row" data-i="${i}"><div class="form-grid"><div><label class="lbl">Step ${i + 1} title</label><input class="input" data-k="title" value="${esc(x.title)}"></div><div><label class="lbl">Difficulty</label><select class="input" data-k="difficulty">${['easy', 'intermediate', 'advanced'].map((d) => `<option${d === x.difficulty ? ' selected' : ''}>${d}</option>`).join('')}</select></div><div><label class="lbl">Time</label><input class="input" data-k="timeEstimate" value="${esc(x.timeEstimate)}"></div></div>
        <label class="lbl">Instructions</label><textarea class="input" data-k="detail" rows="3" style="font-family:var(--font);min-height:70px">${esc(x.detail)}</textarea>
        <label class="lbl">Caution note (optional)</label><input class="input" data-k="riskNote" value="${esc(x.riskNote || '')}">
        <div class="row" style="margin-top:8px"><button class="btn ghost sm" type="button" data-up ${i === 0 ? 'disabled' : ''}>Move up</button><button class="btn ghost sm" type="button" data-down ${i === fixes.length - 1 ? 'disabled' : ''}>Move down</button><button class="btn danger sm" type="button" data-rmfix>Remove</button></div></div>`).join('') || '<p class="small muted">No steps yet. Use Auto-fill or add them by hand.</p>';
    };
    drawFixes();
    $('[data-fixes]', box).addEventListener('input', (e) => { const row = e.target.closest('[data-i]'); const k = e.target.dataset.k; if (row && k) fixes[Number(row.dataset.i)][k] = e.target.value; });
    $('[data-fixes]', box).addEventListener('click', (e) => {
      const row = e.target.closest('[data-i]'); if (!row) return; const i = Number(row.dataset.i);
      if (e.target.closest('[data-rmfix]')) fixes.splice(i, 1);
      else if (e.target.closest('[data-up]')) [fixes[i - 1], fixes[i]] = [fixes[i], fixes[i - 1]];
      else if (e.target.closest('[data-down]')) [fixes[i + 1], fixes[i]] = [fixes[i], fixes[i + 1]];
      else return;
      drawFixes();
    });
    $('[data-addfix]', box).addEventListener('click', () => { fixes.push({ title: '', detail: '', difficulty: 'easy', timeEstimate: '5-10 min' }); drawFixes(); });
    const fill = (e) => {
      f.title.value = e.title; f.slug.value = e.slug; f.aliases.value = e.codes.slice(1).join(', '); f.category.value = e.category; f.severity.value = e.severity; f.frequency.value = e.frequency;
      f.summary.value = e.summary; f.meaning.value = e.meaning; f.causes.value = lines(e.commonCauses); f.prevention.value = lines(e.prevention);
      f.tags.value = e.tags.join(', '); f.versions.value = e.windowsVersions.join(', ');
      $$('[name=sig]', f).forEach((c) => (c.checked = e.signals.includes(c.value)));
      fixes = e.fixes.map((x) => ({ ...x })); drawFixes();
    };
    const auto = async () => {
      const code = f.code.value.trim(); if (!code) return toast('Type the code first');
      try {
        const r = await api('/api/admin/draft', { body: { code, title: originalSlug ? undefined : f.title.value.trim() || undefined, description: f.hint.value.trim() || undefined, category: arg.auto ? undefined : (originalSlug || f.category.dataset.touched ? f.category.value : undefined) } });
        fill(r.entry);
        toast('Draft filled in', r.existing ? `Note: an entry already covers this code (${r.existing}). Saving with the same slug replaces it.` : 'Review the text, then save.');
      } catch (e) { toast('Auto-fill failed', e.message); }
    };
    f.category.addEventListener('change', () => (f.category.dataset.touched = '1'));
    $('[data-auto]', box).addEventListener('click', auto);
    if (arg.auto) auto();
    let submitStatus = 'published';
    $$('[data-status]', f).forEach((b) => b.addEventListener('click', () => (submitStatus = b.dataset.status)));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const split = (s, sep) => s.split(sep).map((x) => x.trim()).filter(Boolean);
      const code = f.code.value.trim();
      const out = {
        slug: f.slug.value.trim() || undefined, title: f.title.value.trim() || code, codes: [code, ...split(f.aliases.value, ',')], category: f.category.value, severity: f.severity.value, frequency: f.frequency.value,
        summary: f.summary.value.trim(), meaning: f.meaning.value.trim(), commonCauses: split(f.causes.value, '\n'), prevention: split(f.prevention.value, '\n'),
        fixes: fixes.filter((x) => x.title.trim()).map((x) => ({ title: x.title.trim(), detail: x.detail.trim(), difficulty: x.difficulty, timeEstimate: x.timeEstimate.trim() || '5-10 min', ...(x.riskNote && x.riskNote.trim() ? { riskNote: x.riskNote.trim() } : {}) })),
        signals: $$('[name=sig]:checked', f).map((c) => c.value), relatedSlugs: split(f.related.value, ','), tags: split(f.tags.value, ','), windowsVersions: split(f.versions.value, ','),
        autoDrafted: false,
      };
      if (!out.summary || !out.meaning || !out.fixes.length) { if (!confirm('Summary, meaning or fix steps are empty. Fill the gaps automatically and save?')) return; }
      try {
        const r = await api('/api/admin/entry', { body: { entry: out, status: submitStatus, originalSlug } });
        toast(submitStatus === 'draft' ? 'Draft saved' : 'Published', r.entry.title);
        go('edit', { slug: r.entry.slug });
      } catch (err) { toast('Could not save', err.message); }
    });
  }

  // ---------- bulk import ----------
  function importView(box) {
    box.innerHTML = `<div class="card"><h2 style="margin-top:0">Bulk import</h2>
      <p class="muted">Paste or upload many errors at once. Three formats work, and anything you leave out is generated automatically in the same style as the rest of the site.</p>
      <ul class="small"><li><b>Plain list:</b> one code per line. Optional extras separated by <code>|</code>: <code>code | title | category | official message</code></li><li><b>CSV</b> with a header row: <code>code,title,category,severity,summary,meaning,description,aliases,causes,fixes,prevention,tags</code> (lists separated by <code>|</code>, fixes as <code>Title: instructions</code>)</li><li><b>JSON:</b> an array of entries in the same shape as the built-in ones (see the manual)</li></ul>
      <p class="small">Samples: <a href="/samples/codes-list.txt">codes-list.txt</a> · <a href="/samples/errors-sample.csv">errors-sample.csv</a> · <a href="/samples/errors-sample.json">errors-sample.json</a></p>
      <textarea class="input" rows="10" data-text placeholder="0x80070490\n0x8024402C | Windows Update error 0x8024402C | update\nKMODE_EXCEPTION_NOT_HANDLED\nCode 28"></textarea>
      <div class="row wrap-row" style="margin-top:10px"><label class="btn ghost sm">Upload a file<input type="file" accept=".json,.csv,.txt" data-file hidden></label><select class="input" data-fmt style="width:auto"><option value="auto">Detect format</option><option value="list">Plain list</option><option value="csv">CSV</option><option value="json">JSON</option></select><button class="btn primary" type="button" data-preview>Preview</button></div></div><div data-out></div>`;
    $('[data-file]', box).addEventListener('change', async (e) => { const file = e.target.files[0]; if (file) { $('[data-text]', box).value = await file.text(); toast('File loaded', file.name); } });
    $('[data-preview]', box).addEventListener('click', async () => {
      const text = $('[data-text]', box).value; if (!text.trim()) return toast('Paste something first');
      try {
        const r = await api('/api/admin/import/preview', { body: { text, format: $('[data-fmt]', box).value } });
        const items = r.items;
        const out = $('[data-out]', box);
        out.innerHTML = `<div class="card" style="margin-top:16px"><div class="row between wrap-row"><h3 style="margin:0">${items.length} entries read as ${esc(r.format)}</h3><label class="small"><input type="checkbox" data-all checked> Select all new</label></div>
          <div class="table-wrap"><table><thead><tr><th></th><th>Code</th><th>Title</th><th>Category</th><th>Severity</th><th>Status</th></tr></thead><tbody>${items.map((it, i) => it.error ? `<tr><td></td><td colspan="5">Could not read: ${esc(it.error)}</td></tr>` : `<tr><td><input type="checkbox" data-i="${i}" ${it.existing ? '' : 'checked'}></td><td><code>${esc(it.entry.codes[0])}</code></td><td>${esc(it.entry.title)}</td><td>${esc(CATS[it.entry.category] || it.entry.category)}</td><td>${esc(it.entry.severity)}</td><td>${it.existing ? `<span class="badge sev-high">exists: ${esc(it.existing)}</span>` : '<span class="badge sev-low">new</span>'}${it.entry.autoDrafted ? ' <span class="badge soft">auto content</span>' : ''}</td></tr>`).join('')}</tbody></table></div>
          <div class="row wrap-row"><select class="input" data-st style="width:auto"><option value="published">Publish right away</option><option value="draft">Save as drafts</option></select><label class="small"><input type="checkbox" data-ow> Replace entries that already exist</label><button class="btn primary" type="button" data-commit>Import selected</button></div></div>`;
        $('[data-all]', out).addEventListener('change', (e) => $$('[data-i]', out).forEach((c) => { if (!items[c.dataset.i].existing) c.checked = e.target.checked; }));
        $('[data-commit]', out).addEventListener('click', async () => {
          const sel = $$('[data-i]:checked', out).map((c) => items[Number(c.dataset.i)].entry);
          if (!sel.length) return toast('Nothing selected');
          const res = await api('/api/admin/import/commit', { body: { entries: sel, status: $('[data-st]', out).value, overwrite: $('[data-ow]', out).checked } });
          toast(`Imported ${res.saved}`, res.skipped ? `${res.skipped} skipped (already existed)` : 'All done');
          out.innerHTML = `<div class="note">Imported ${res.saved} entries${res.skipped ? `, skipped ${res.skipped}` : ''}. <a href="#entries" data-goto>See them in All entries</a>.</div>`;
          $('[data-goto]', out).addEventListener('click', (e) => { e.preventDefault(); go('entries'); });
        });
      } catch (e) { toast('Preview failed', e.message); }
    });
  }

  // ---------- scraper ----------
  async function scraper(box) {
    const pr = await api('/api/admin/scrape/presets');
    const st = { status: 'new', kind: '', q: '', offset: 0 };
    box.innerHTML = `<div class="card"><h2 style="margin-top:0">Scraper</h2><p class="muted">Collect error codes from public reference pages. Results land in the inbox below, where you choose which ones become full pages. Codes the site already covers are detected and set aside automatically.</p>
      <div class="form-grid"><div><label class="lbl">Built-in sources</label><div class="field"><select class="input" data-preset>${pr.presets.map((p) => `<option value="${esc(p.id)}">${esc(p.label)}${p.pages > 1 ? ` (${p.pages} pages)` : ''}</option>`).join('')}</select><button class="btn primary" type="button" data-run-preset>Scrape</button></div></div>
      <div><label class="lbl">Or any page that lists codes in a table</label><div class="field"><input class="input" data-url placeholder="https://..."><select class="input" data-kind style="max-width:150px;flex:none"><option value="auto">Detect type</option><option value="win32">Win32 codes</option><option value="bugcheck">Stop codes</option><option value="update">Update codes</option><option value="device">Device codes</option><option value="generic">Other</option></select><button class="btn ghost" type="button" data-run-url>Scrape</button></div></div></div><div data-res class="small" style="margin-top:10px"></div></div>
      <div class="card" style="margin-top:16px"><div class="row between wrap-row"><h3 style="margin:0">Inbox</h3><div class="row wrap-row"><select class="input" data-fs style="width:auto"><option value="new">Waiting</option><option value="covered">Already covered</option><option value="imported">Imported</option><option value="ignored">Ignored</option><option value="all">All</option></select><select class="input" data-fk style="width:auto"><option value="">All types</option><option value="bugcheck">Stop codes</option><option value="update">Windows Update</option><option value="win32">Win32</option><option value="device">Device Manager</option><option value="generic">Other</option></select><input class="input" type="search" data-fq placeholder="Filter" style="width:170px"></div></div><div data-inbox></div></div>`;
    const res = $('[data-res]', box);
    const run = async (body) => {
      res.innerHTML = '<span class="muted">Fetching and reading pages. Large sources take up to a minute...</span>';
      try {
        const r = await api('/api/admin/scrape', { body });
        res.innerHTML = `<b>${r.found}</b> codes found: <b>${r.added}</b> new in the inbox, ${r.alreadyCovered} already covered by the site.${r.pages.filter((p) => p.error).map((p) => `<br><span style="color:var(--bad)">${esc(p.url)}: ${esc(p.error)}</span>`).join('')}`;
        st.offset = 0; load();
      } catch (e) { res.innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`; }
    };
    $('[data-run-preset]', box).addEventListener('click', () => run({ preset: $('[data-preset]', box).value }));
    $('[data-run-url]', box).addEventListener('click', () => { const u = $('[data-url]', box).value.trim(); if (!u) return toast('Enter a URL'); run({ url: u, kind: $('[data-kind]', box).value }); });
    const inbox = $('[data-inbox]', box);
    const load = async () => {
      const r = await api(`/api/admin/scraped?status=${st.status}&kind=${st.kind}&q=${encodeURIComponent(st.q)}&offset=${st.offset}`);
      const page = Math.floor(st.offset / 100) + 1, pages = Math.max(1, Math.ceil(r.total / 100));
      const counts = r.counts || {};
      inbox.innerHTML = `<p class="small muted">Waiting ${counts.new || 0} · covered ${counts.covered || 0} · imported ${counts.imported || 0} · ignored ${counts.ignored || 0}</p>
        ${r.items.length ? `<div class="row wrap-row" style="margin-bottom:8px"><select class="input" data-ist style="width:auto"><option value="published">Publish</option><option value="draft">As drafts</option></select><button class="btn primary sm" data-imp-sel>Create pages for selected</button>${st.status === 'new' ? `<button class="btn ghost sm" data-imp-all>Create pages for all ${r.total} waiting${st.kind ? ' of this type' : ''}</button><button class="btn ghost sm" data-ign>Ignore selected</button>` : ''}<button class="btn ghost sm" data-clear>Empty inbox</button></div>
        <div class="table-wrap"><table><thead><tr><th><input type="checkbox" data-selall></th><th>Code</th><th>Name</th><th>Description</th><th>Type</th><th>Status</th></tr></thead><tbody>${r.items.map((x) => `<tr><td>${x.status === 'new' ? `<input type="checkbox" data-k="${esc(x.key)}">` : ''}</td><td><code>${esc(x.code)}</code></td><td>${esc(x.name || '')}</td><td class="small">${esc((x.description || '').slice(0, 140))}</td><td>${esc(x.kind)}</td><td>${x.status === 'imported' && x.slug ? `<a href="/errors/${esc(x.slug)}" target="_blank" rel="noopener">imported</a>` : x.status === 'covered' && x.coveredBy ? `<a href="/errors/${esc(x.coveredBy)}" target="_blank" rel="noopener">covered</a>` : esc(x.status)}</td></tr>`).join('')}</tbody></table></div>
        <div class="pg">${pages > 1 ? `<button class="btn ghost sm" data-p="-1" ${page <= 1 ? 'disabled' : ''}>Previous</button><span class="small">Page ${page} of ${pages}</span><button class="btn ghost sm" data-p="1" ${page >= pages ? 'disabled' : ''}>Next</button>` : ''}</div>` : '<p class="muted">Nothing here. Run a scrape above.</p>'}`;
    };
    $('[data-fs]', box).addEventListener('change', (e) => { st.status = e.target.value; st.offset = 0; load(); });
    $('[data-fk]', box).addEventListener('change', (e) => { st.kind = e.target.value; st.offset = 0; load(); });
    $('[data-fq]', box).addEventListener('input', window.WM.debounce((e) => { st.q = e.target.value; st.offset = 0; load(); }, 250));
    inbox.addEventListener('change', (e) => { if (e.target.matches('[data-selall]')) $$('[data-k]', inbox).forEach((c) => (c.checked = e.target.checked)); });
    inbox.addEventListener('click', async (e) => {
      const keys = () => $$('[data-k]:checked', inbox).map((c) => c.dataset.k);
      const status = () => ($('[data-ist]', inbox) || {}).value;
      const p = e.target.closest('[data-p]'); if (p) { st.offset = Math.max(0, st.offset + Number(p.dataset.p) * 100); load(); }
      if (e.target.closest('[data-imp-sel]')) { const k = keys(); if (!k.length) return toast('Select some codes first'); const r = await api('/api/admin/scraped/import', { body: { keys: k, status: status() } }); toast(`Created ${r.saved} pages`, r.skipped ? `${r.skipped} were already covered` : ''); load(); }
      if (e.target.closest('[data-imp-all]')) {
        if (!confirm('Create a page for every waiting code in this view? Large batches take a little while.')) return;
        e.target.disabled = true; e.target.textContent = 'Working...';
        const r = await api('/api/admin/scraped/import', { body: { all: true, kind: st.kind || undefined, status: status() } }); toast(`Created ${r.saved} pages`, r.skipped ? `${r.skipped} skipped` : ''); load();
      }
      if (e.target.closest('[data-ign]')) { const k = keys(); if (!k.length) return toast('Select some codes first'); await api('/api/admin/scraped/ignore', { body: { keys: k } }); load(); }
      if (e.target.closest('[data-clear]')) { if (!confirm('Remove everything from the inbox except codes already imported?')) return; await api('/api/admin/scraped/clear', { body: {} }); load(); }
    });
    load();
  }

  // ---------- requests ----------
  async function requests(box) {
    const o = await api('/api/admin/overview');
    box.innerHTML = `<div class="card"><h2 style="margin-top:0">Visitor requests</h2><p class="muted">Codes visitors searched for and asked you to cover, most requested first. "Create page" opens the editor with everything pre-filled.</p>
      ${o.wishlist.length ? `<div class="table-wrap"><table><thead><tr><th>Code or message</th><th>Requests</th><th>Notes</th><th>Last asked</th><th></th></tr></thead><tbody>${o.wishlist.map((w) => `<tr><td><code>${esc(w.code)}</code></td><td>${w.votes}</td><td class="small">${(w.notes || []).map(esc).join('<br>')}</td><td class="small">${w.last ? new Date(w.last).toLocaleDateString() : ''}</td><td><div class="row"><button class="btn primary sm" data-draft="${esc(w.code)}">Create page</button><button class="btn ghost sm" data-dis="${esc(w.code)}">Dismiss</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No open requests right now.</p>'}</div>`;
    box.onclick = async (e) => {
      const d = e.target.closest('[data-draft]'); if (d) go('edit', { code: d.dataset.draft, auto: true });
      const x = e.target.closest('[data-dis]'); if (x) { await api('/api/admin/wishlist/dismiss', { body: { code: x.dataset.dis } }); requests(box); }
    };
  }

  // ---------- settings ----------
  async function settings(box) {
    const st = await api('/api/admin/status');
    box.innerHTML = `<div class="grid g2"><div class="card"><h3>Change password</h3>${st.envPassword ? '<p class="muted small">The password comes from the ADMIN_PASSWORD environment variable, so it is changed there.</p>' : `<form data-f><label class="lbl">Current password</label><input class="input" type="password" name="current" required><label class="lbl">New password</label><input class="input" type="password" name="password" minlength="8" required><button class="btn primary" style="margin-top:12px">Change password</button></form>`}</div>
      <div class="card"><h3>Data and backups</h3><p class="small">Download your entries as JSON at any time. Import that file on another copy of the site (Bulk import, JSON format) to move content between installations.</p><div class="row wrap-row"><a class="btn ghost sm" href="/api/admin/export">Export my entries</a><a class="btn ghost sm" href="/download/source.zip">Download source zip</a></div><h3 style="margin-top:18px">Session</h3><button class="btn danger sm" data-logout>Sign out</button></div></div>`;
    const f = $('[data-f]', box);
    if (f) f.addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/api/admin/password', { body: { current: f.current.value, password: f.password.value } }); toast('Password changed', 'Other sessions were signed out.'); f.reset(); } catch (err) { toast(err.message); } });
    $('[data-logout]', box).addEventListener('click', async () => { await api('/api/admin/logout', { body: {} }); location.reload(); });
  }

  start();
})();
