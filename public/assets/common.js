/* WinMend shared script: theme, palette, shortcuts, history, assistant,
   toasts and the interactive bits of error and guide pages. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const md = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|\s)_([^_]+)_(?=\s|$|[.,])/g, '$1<em>$2</em>');
  /** Block markdown for assistant answers: paragraphs, numbered and bulleted lists. */
  const mdBlock = (s) => String(s).split(/\n\n+/).map((blk) => {
    const lines = blk.split('\n');
    if (lines.every((l) => /^\d+\.\s/.test(l) || !l.trim())) return '<ol>' + lines.filter(Boolean).map((l) => `<li>${md(l.replace(/^\d+\.\s/, ''))}</li>`).join('') + '</ol>';
    if (lines.every((l) => /^-\s/.test(l) || !l.trim())) return '<ul>' + lines.filter(Boolean).map((l) => `<li>${md(l.slice(2))}</li>`).join('') + '</ul>';
    const head = lines[0];
    const rest = lines.slice(1);
    if (rest.length && rest.every((l) => /^\d+\.\s/.test(l))) return `<p>${md(head)}</p><ol>${rest.map((l) => `<li>${md(l.replace(/^\d+\.\s/, ''))}</li>`).join('')}</ol>`;
    if (rest.length && rest.every((l) => /^-\s/.test(l))) return `<p>${md(head)}</p><ul>${rest.map((l) => `<li>${md(l.slice(2))}</li>`).join('')}</ul>`;
    return `<p>${lines.map(md).join('<br>')}</p>`;
  }).join('');

  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const ss = {
    get(k, d) { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  async function api(path, opts = {}) {
    const init = { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: {}, signal: opts.signal, credentials: 'same-origin' };
    if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    const res = await fetch(path, init);
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; e.data = data; throw e; }
    return data;
  }

  function toast(title, desc) {
    const box = $('#toasts'); if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<b>${esc(title)}</b>${desc ? `<span>${esc(desc)}</span>` : ''}`;
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, 3200);
  }

  async function copy(text, title = 'Copied', desc = '') {
    try { await navigator.clipboard.writeText(text); toast(title, desc); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(title, desc); } catch { toast('Copy failed', 'Your browser blocked clipboard access.'); }
      ta.remove();
    }
  }

  function download(name, text, type = 'text/markdown') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- history ----------
  const HKEY = 'wm-history';
  const history = {
    all() { return ls.get(HKEY, []); },
    add(item) {
      const list = history.all().filter((h) => !(h.kind === item.kind && h.query === item.query));
      list.unshift({ ...item, at: Date.now() });
      ls.set(HKEY, list.slice(0, 40));
      updateDot();
    },
    clear() { ls.del(HKEY); updateDot(); },
  };
  function updateDot() { const d = $('[data-open-history] .dot'); if (d) d.hidden = !history.all().length; }

  // ---------- plan queue ----------
  const PKEY = 'wm-plan';
  const plan = {
    state() { return ls.get(PKEY, { queue: [], current: null }); },
    save(s) { ls.set(PKEY, s); document.dispatchEvent(new CustomEvent('wm:plan')); },
    add(slug) { const s = plan.state(); const isNew = !s.queue.includes(slug); if (isNew) s.queue.push(slug); s.current = slug; plan.save(s); return isNew; },
    remove(slug) { const s = plan.state(); s.queue = s.queue.filter((x) => x !== slug); if (s.current === slug) s.current = s.queue[0] || null; plan.save(s); },
    setCurrent(slug) { const s = plan.state(); s.current = slug; if (slug && !s.queue.includes(slug)) s.queue.push(slug); plan.save(s); },
    checks(slug) { return ls.get('wm-checks-' + slug, {}); },
    setChecks(slug, c) { ls.set('wm-checks-' + slug, c); },
  };

  // ---------- overlays ----------
  let openOverlay = null;
  function overlay(inner, { onClose, cls = '' } = {}) {
    closeOverlay();
    const o = document.createElement('div');
    o.className = 'overlay ' + cls;
    o.innerHTML = inner;
    o.addEventListener('mousedown', (e) => { if (e.target === o) closeOverlay(); });
    document.body.appendChild(o);
    const prev = document.activeElement;
    openOverlay = { el: o, onClose, prev };
    document.body.style.overflow = 'hidden';
    return o;
  }
  function closeOverlay() {
    if (!openOverlay) return;
    const { el, onClose, prev } = openOverlay;
    openOverlay = null;
    el.remove();
    document.body.style.overflow = '';
    if (onClose) onClose();
    if (prev && prev.focus) prev.focus();
  }

  // ---------- theme ----------
  function setTheme(t) {
    try { localStorage.setItem('wm-theme', t); } catch {}
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  }
  function toggleTheme() { setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark'); }

  // ---------- tool navigation ----------
  function goTool(tool, params = {}) {
    if (document.body.dataset.page === 'home' && window.WMApp) { window.WMApp.show(tool, params); $('#tools').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const qs = new URLSearchParams({ tool, ...params }).toString();
    location.href = '/?' + qs + '#tools';
  }

  // ---------- command palette ----------
  const TOOLS = [
    { label: 'Decoder: paste any error code', tool: 'decoder', k: '1' },
    { label: 'Lookup: browse and filter the database', tool: 'lookup', k: '2' },
    { label: 'Triage: guided symptom wizard', tool: 'triage', k: '3' },
    { label: 'Fix plan: step-by-step checklist', tool: 'plan', k: '4' },
    { label: 'Log scanner: find codes in pasted text', tool: 'decoder', params: { mode: 'log' } },
    { label: 'Ask the assistant', action: () => openAssistant(), k: 'A' },
    { label: 'Activity history', action: () => openHistory() },
    { label: 'Switch light or dark theme', action: toggleTheme },
    { label: 'Error database', href: '/errors' },
    { label: 'Repair guides', href: '/guides' },
    { label: 'User manual', href: '/manual' },
    { label: 'Admin panel', href: '/admin' },
  ];
  function openPalette(initial = '') {
    const o = overlay(`<div class="palette" role="dialog" aria-label="Search everything"><input type="search" placeholder="Search errors, guides and tools..." aria-label="Search" autocomplete="off"><ul role="listbox"></ul><div class="foot"><span><kbd>Enter</kbd> open</span><span><kbd>Up</kbd> <kbd>Down</kbd> move</span><span><kbd>Esc</kbd> close</span></div></div>`);
    const input = $('input', o); const ul = $('ul', o);
    let items = []; let sel = 0; let ctl; let guides = null;
    const renderList = (groups) => {
      items = []; let h = '';
      for (const [name, list] of groups) {
        if (!list.length) continue;
        h += `<li class="grp" role="presentation">${esc(name)}</li>`;
        for (const it of list) { h += `<li role="option" data-i="${items.length}">${it.html}</li>`; items.push(it); }
      }
      ul.innerHTML = h || '<li class="grp">No match. Try a stop code like 0x124 or a word like "wifi".</li>';
      sel = 0; mark();
    };
    const mark = () => $$('li[role=option]', ul).forEach((li) => { const on = Number(li.dataset.i) === sel; li.setAttribute('aria-selected', on); if (on) li.scrollIntoView({ block: 'nearest' }); });
    const run = (it) => { if (!it) return; closeOverlay(); it.go(); };
    const toolItems = (q) => TOOLS.filter((t) => !q || t.label.toLowerCase().includes(q)).map((t) => ({ html: `<span>${esc(t.label)}</span>${t.k ? `<span class="k"><kbd>${t.k}</kbd></span>` : ''}`, go: () => (t.action ? t.action() : t.href ? (location.href = t.href) : goTool(t.tool, t.params)) }));
    const update = async () => {
      const q = input.value.trim().toLowerCase();
      if (ctl) ctl.abort();
      if (!guides) { try { guides = (await api('/api/guides')).items; } catch { guides = []; } }
      const g = guides.filter((x) => !q || x.title.toLowerCase().includes(q)).slice(0, q ? 4 : 2).map((x) => ({ html: `<span>${esc(x.title)}</span><span class="k">guide</span>`, go: () => (location.href = '/guides/' + x.slug) }));
      let errs = [];
      ctl = new AbortController();
      try {
        const r = q ? await api('/api/errors?limit=7&q=' + encodeURIComponent(q), { signal: ctl.signal }) : await api('/api/trending');
        errs = (r.items || []).map((e) => ({ html: `<code>${esc((e.codes && e.codes[0]) || e.code)}</code><span>${esc(e.title)}</span>`, go: () => (location.href = '/errors/' + e.slug) }));
        if (q && /^(0x)?[0-9a-f]{3,8}$|_/i.test(q) && !errs.length) errs.push({ html: `<span>Decode "${esc(input.value.trim())}" in the Decoder</span>`, go: () => goTool('decoder', { q: input.value.trim() }) });
      } catch (e) { if (e.name === 'AbortError') return; }
      renderList([[q ? 'Errors' : 'Trending errors', errs], ['Guides', g], ['Tools', toolItems(q)]]);
    };
    input.value = initial;
    input.addEventListener('input', debounce(update, 140));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(items[sel]); }
    });
    ul.addEventListener('click', (e) => { const li = e.target.closest('li[role=option]'); if (li) run(items[Number(li.dataset.i)]); });
    ul.addEventListener('mousemove', (e) => { const li = e.target.closest('li[role=option]'); if (li && Number(li.dataset.i) !== sel) { sel = Number(li.dataset.i); mark(); } });
    update();
    setTimeout(() => input.focus(), 10);
  }

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  // ---------- shortcuts help ----------
  function openShortcuts() {
    const o = overlay(`<div class="modal" role="dialog" aria-label="Keyboard shortcuts"><h2>Keyboard shortcuts</h2><div class="table-wrap"><table><tbody>
      <tr><td><kbd>Ctrl</kbd> <kbd>K</kbd></td><td>Search errors, guides and tools</td></tr>
      <tr><td><kbd>/</kbd></td><td>Focus the main search box</td></tr>
      <tr><td><kbd>1</kbd> to <kbd>4</kbd></td><td>Decoder, Lookup, Triage, Fix plan</td></tr>
      <tr><td><kbd>A</kbd></td><td>Ask the assistant</td></tr>
      <tr><td><kbd>H</kbd></td><td>Activity history</td></tr>
      <tr><td><kbd>T</kbd></td><td>Switch theme</td></tr>
      <tr><td><kbd>?</kbd></td><td>This list</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Close any panel</td></tr></tbody></table></div><div class="row end"><button class="btn primary" type="button" data-close>Close</button></div></div>`);
    $('[data-close]', o).addEventListener('click', closeOverlay);
  }

  // ---------- history drawer ----------
  function openHistory() {
    const labels = { decode: 'Decode', scan: 'Log scan', triage: 'Triage', view: 'Viewed', plan: 'Fix plan' };
    const draw = () => {
      const list = history.all();
      return list.length ? list.map((h) => `<a class="hist-item" href="${h.slug ? '/errors/' + encodeURIComponent(h.slug) : '/?tool=decoder&q=' + encodeURIComponent(h.query) + '#tools'}"><div><div class="k">${esc(labels[h.kind] || h.kind)} · ${new Date(h.at).toLocaleString()}</div><b>${esc(h.title || h.query)}</b>${h.title && h.query && h.query !== h.title ? `<div class="small muted">${esc(h.query)}</div>` : ''}</div>${h.severity ? `<span class="badge sev-${esc(h.severity)}" style="margin-left:auto">${esc(h.severity)}</span>` : ''}</a>`).join('')
        : `<div class="empty"><p><b>Nothing here yet</b></p><p class="small">Decode a code, scan a log or run the triage wizard and it will be listed here for quick access.</p><div class="row" style="justify-content:center"><button class="btn ghost sm" data-go="log">Open the log scanner</button><button class="btn ghost sm" data-go="triage">Start triage</button></div></div>`;
    };
    const o = overlay(`<aside class="drawer" role="dialog" aria-label="Activity history"><header><h2>Activity history</h2><button class="icon-btn" data-close aria-label="Close">✕</button></header><div class="body"><p class="small muted">Your decodes, log scans and triage results on this device, newest first. Stored only in this browser.</p><div data-list>${draw()}</div></div><footer><button class="btn ghost sm" data-clear>Clear history</button></footer></aside>`);
    $('[data-close]', o).addEventListener('click', closeOverlay);
    $('[data-clear]', o).addEventListener('click', () => { history.clear(); $('[data-list]', o).innerHTML = draw(); toast('History cleared'); });
    o.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) { closeOverlay(); goTool(b.dataset.go === 'log' ? 'decoder' : 'triage', b.dataset.go === 'log' ? { mode: 'log' } : {}); } });
  }

  // ---------- assistant ----------
  const CHAT_KEY = 'wm-chat';
  function openAssistant(prefill) {
    let msgs = ss.get(CHAT_KEY, []);
    let typing = null;
    const o = overlay(`<aside class="drawer" role="dialog" aria-label="Assistant"><header><h2>Ask the assistant</h2><span class="badge cat">Knowledge base</span><button class="icon-btn" data-export title="Export as Markdown" aria-label="Export conversation">⇩</button><button class="icon-btn" data-new title="New conversation" aria-label="New conversation">↺</button><button class="icon-btn" data-close aria-label="Close">✕</button></header>
      <div class="body"><div class="chat" data-chat></div></div>
      <footer><form class="chat-form" data-form><textarea class="input" rows="1" placeholder="Ask about any Windows error..." aria-label="Your question" maxlength="600"></textarea><button class="btn primary" type="submit" data-send>Send</button></form><p class="small muted" style="margin:8px 0 0">Answers are assembled from this site's error pages, guides and FAQ. Double-check critical steps on the full page.</p></footer></aside>`, { onClose: () => { if (typing) typing.stop = true; } });
    const chat = $('[data-chat]', o); const ta = $('textarea', o); const send = $('[data-send]', o);
    const draw = () => {
      if (!msgs.length) {
        chat.innerHTML = `<div class="msg bot"><p>Hi! Describe what you see, or paste an error code. I will pull the matching explanation and the safest first steps from the knowledge base.</p></div><div class="try"><span class="small muted">Try asking</span>${['What does 0x80070002 mean?', 'My PC blue screens while gaming', 'In what order should I run SFC and DISM?', 'Is CRITICAL_PROCESS_DIED dangerous?'].map((q) => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`;
        return;
      }
      chat.innerHTML = msgs.map((m, i) => m.role === 'user' ? `<div class="msg user">${esc(m.text)}</div>` : `<div class="msg bot" data-i="${i}">${mdBlock(m.text)}${m.sources && m.sources.length ? `<div class="src">Based on: ${m.sources.map((s) => `<a href="${esc(s.url)}">${esc(s.title)}</a>`).join('')}</div>` : ''}<div class="row" style="margin-top:6px"><button class="link-btn small" data-copy-answer="${i}">Copy answer</button></div></div>`).join('');
      chat.parentElement.scrollTop = chat.parentElement.scrollHeight;
    };
    const ask = async (q) => {
      q = q.trim(); if (!q || typing) return;
      msgs.push({ role: 'user', text: q }); ss.set(CHAT_KEY, msgs); draw();
      const bubble = document.createElement('div'); bubble.className = 'msg bot'; bubble.innerHTML = '<p class="muted">Looking that up...</p>'; chat.appendChild(bubble);
      send.textContent = 'Stop'; send.type = 'button';
      typing = { stop: false };
      const me = typing;
      send.onclick = () => { me.stop = true; };
      try {
        const r = await api('/api/ask', { body: { question: q } });
        const full = r.answer || 'No answer came back. Please try again.';
        let shown = 0;
        await new Promise((res) => {
          const step = () => {
            if (me.stop) return res();
            shown = Math.min(full.length, shown + Math.max(4, Math.round(full.length / 90)));
            bubble.innerHTML = mdBlock(full.slice(0, shown));
            chat.parentElement.scrollTop = chat.parentElement.scrollHeight;
            if (shown >= full.length) return res();
            requestAnimationFrame(step);
          };
          step();
        });
        msgs.push({ role: 'bot', text: me.stop ? full.slice(0, shown) + (shown < full.length ? '\n\n_(stopped)_' : '') : full, sources: r.sources });
      } catch (e) {
        msgs.push({ role: 'bot', text: e.message || 'Something went wrong. Please try again.' });
      }
      typing = null; ss.set(CHAT_KEY, msgs); send.textContent = 'Send'; send.type = 'submit'; send.onclick = null; draw();
    };
    $('[data-form]', o).addEventListener('submit', (e) => { e.preventDefault(); const v = ta.value; ta.value = ''; ask(v); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('[data-form]', o).requestSubmit(); } });
    o.addEventListener('click', (e) => {
      const q = e.target.closest('[data-q]'); if (q) ask(q.dataset.q);
      const c = e.target.closest('[data-copy-answer]'); if (c) copy(msgs[Number(c.dataset.copyAnswer)].text, 'Answer copied');
    });
    $('[data-close]', o).addEventListener('click', closeOverlay);
    $('[data-new]', o).addEventListener('click', () => { msgs = []; ss.set(CHAT_KEY, msgs); draw(); });
    $('[data-export]', o).addEventListener('click', () => {
      if (!msgs.length) return toast('Nothing to export yet');
      const md = `# Assistant conversation\n\n${msgs.map((m) => (m.role === 'user' ? `**You:** ${m.text}` : `**Assistant:**\n\n${m.text}`)).join('\n\n---\n\n')}\n\n_Exported ${new Date().toLocaleString()}. Back up important data before attempting system repairs._\n`;
      download('assistant-conversation.md', md); toast('Conversation exported', 'Saved as a Markdown file.');
    });
    if (msgs.length) toast('Previous conversation restored');
    draw();
    if (prefill) ask(prefill);
    setTimeout(() => ta.focus(), 20);
  }

  // ---------- entry page ----------
  function initEntry() {
    const root = $('[data-entry]'); if (!root) return;
    const slug = root.dataset.entry; const title = root.dataset.entryTitle;
    history.add({ kind: 'view', query: root.dataset.entryCode, title, slug, severity: root.dataset.entrySev });
    if (!ss.get('wm-viewed-' + slug)) { api('/api/view', { body: { slug } }).then((r) => { ss.set('wm-viewed-' + slug, 1); showViews(r.views); }).catch(() => {}); }
    else api('/api/view?slug=' + encodeURIComponent(slug)).then((r) => showViews(r.views)).catch(() => {});
    function showViews(n) { const el = $('[data-views]'); if (el && n > 1) el.textContent = `${n.toLocaleString()} views`; }
    api('/api/fixvote?slug=' + encodeURIComponent(slug)).then((r) => paintVotes(r.votes)).catch(() => {});
    function paintVotes(v) { for (const [i, n] of Object.entries(v || {})) { const el = $(`[data-vc="${i}"]`); if (el) el.textContent = `(${n})`; } }
    api('/api/feedback?slug=' + encodeURIComponent(slug)).then((r) => { const t = r.helpful + r.notHelpful; if (t) $('[data-feedback-count]').textContent = `${r.helpful} of ${t} readers found this helpful`; }).catch(() => {});
    document.addEventListener('click', async (e) => {
      const fv = e.target.closest('[data-fixvote]');
      if (fv) {
        if (ss.get('wm-vote-' + slug)) return toast('Already counted', 'You confirmed a fix on this page earlier.');
        try { const r = await api('/api/fixvote', { body: { slug, index: Number(fv.dataset.fixvote) } }); ss.set('wm-vote-' + slug, 1); paintVotes(r.votes); fv.classList.add('on'); toast('Thanks for confirming!', 'It helps other readers pick the right fix.'); }
        catch (err) { toast('Vote not counted', err.message); }
      }
      const fb = e.target.closest('[data-feedback]');
      if (fb) {
        if (ss.get('wm-fb-' + slug)) return toast('Thanks, already noted');
        try { const r = await api('/api/feedback', { body: { slug, helpful: fb.dataset.feedback === 'yes' } }); ss.set('wm-fb-' + slug, 1); fb.classList.add('on'); $('[data-feedback-count]').textContent = `${r.helpful} of ${r.helpful + r.notHelpful} readers found this helpful`; toast('Thanks for the feedback!'); if (fb.dataset.feedback === 'no') setTimeout(() => openAssistant(), 400); }
        catch (err) { toast('Feedback not saved', err.message); }
      }
      if (e.target.closest('[data-add-plan]')) { const isNew = plan.add(slug); toast(isNew ? 'Added to your fix plan' : 'Opening your fix plan'); setTimeout(() => goTool('plan', { slug }), 250); }
      if (e.target.closest('[data-copy-steps]')) {
        const steps = $$('.fix').map((li, i) => `${i + 1}. ${$('h3', li).childNodes[0].textContent.trim()}\n   ${$('.fix-body > p:not(.fix-meta)', li).textContent.trim()}`).join('\n');
        copy(`${title}\n\n${steps}\n\n${location.href}`, 'Steps copied', 'Paste them anywhere for later.');
      }
      if (e.target.closest('[data-share]')) {
        if (navigator.share && matchMedia('(pointer:coarse)').matches) navigator.share({ title, url: location.href }).catch(() => {});
        else copy(location.href, 'Link copied');
      }
      const j = e.target.closest('[data-jump]');
      if (j) { e.preventDefault(); const li = $(`.fix[data-fix="${j.dataset.jump}"]`); li.scrollIntoView({ behavior: 'smooth', block: 'center' }); li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash'); }
      const bm = e.target.closest('[data-bookmark]');
      if (bm) {
        const saved = ls.get('wm-saved', []);
        const i = saved.findIndex((s) => s.slug === slug);
        if (i >= 0) { saved.splice(i, 1); toast('Removed from saved errors'); } else { saved.unshift({ slug, title, code: root.dataset.entryCode }); toast('Saved', 'Find it under Lookup > Saved.'); }
        ls.set('wm-saved', saved.slice(0, 100)); paintBm();
      }
    });
    const paintBm = () => { const b = $('[data-bookmark]'); if (!b) return; const on = ls.get('wm-saved', []).some((s) => s.slug === slug); b.classList.toggle('on', on); $('span', b).textContent = on ? 'Saved' : 'Save'; };
    paintBm();
  }

  // ---------- guides ----------
  function initGuides() {
    const read = ls.get('wm-guides-read', []);
    $$('[data-guide]').forEach((c) => { const on = read.includes(c.dataset.guide); c.classList.toggle('is-read', on); const f = $('.read-flag', c); if (f) f.hidden = !on; });
    const total = $$('[data-guide]').length;
    $$('[data-guide-progress]').forEach((p) => { if (!total) return; const n = $$('[data-guide]').filter((c) => read.includes(c.dataset.guide)).length; p.innerHTML = n ? `${n} of ${total} guides read · <button class="link-btn small" data-reset-read>Reset</button>` : ''; });
    const page = $('[data-guide-page]');
    if (page) {
      const slug = page.dataset.guidePage;
      const btn = $('[data-mark-read]');
      const paint = () => { const on = ls.get('wm-guides-read', []).includes(slug); btn.innerHTML = on ? '✓ Marked as read (undo)' : 'Mark as read'; btn.classList.toggle('ghost', on); btn.classList.toggle('primary', !on); };
      btn.addEventListener('click', () => { let r = ls.get('wm-guides-read', []); r = r.includes(slug) ? r.filter((x) => x !== slug) : [...r, slug]; ls.set('wm-guides-read', r); paint(); toast(r.includes(slug) ? 'Marked as read' : 'Marked as unread'); });
      paint();
      const bar = $('[data-read-bar]'); let auto = false;
      addEventListener('scroll', () => {
        const art = $('.prose'); const rect = art.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (innerHeight - rect.top) / (rect.height + innerHeight * 0.3)));
        bar.style.width = (pct * 100).toFixed(1) + '%';
        if (pct > 0.97 && !auto) { auto = true; const r = ls.get('wm-guides-read', []); if (!r.includes(slug)) { ls.set('wm-guides-read', [...r, slug]); paint(); toast('Guide marked as read'); } }
      }, { passive: true });
    }
    document.addEventListener('click', (e) => { if (e.target.closest('[data-reset-read]')) { ls.del('wm-guides-read'); initGuides(); toast('Reading progress reset'); } });
  }

  // ---------- global wiring ----------
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-open-palette]')) openPalette();
    if (t.closest('[data-open-assistant]')) openAssistant();
    if (t.closest('[data-open-history]')) openHistory();
    if (t.closest('[data-toggle-theme]')) toggleTheme();
    if (t.closest('[data-to-top]')) scrollTo({ top: 0, behavior: 'smooth' });
    if (t.closest('[data-print]')) print();
    const cp = t.closest('[data-copy]'); if (cp) copy(cp.dataset.copy, 'Copied', cp.dataset.copy);
    const menuBtn = t.closest('[data-open-menu]');
    if (menuBtn) { const m = $('.mobile-menu'); m.hidden = !m.hidden; menuBtn.setAttribute('aria-expanded', String(!m.hidden)); }
    const tl = t.closest('[data-tool-link]');
    if (tl) { e.preventDefault(); goTool(tl.dataset.toolLink); }
  });
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openOverlay ? closeOverlay() : openPalette(); return; }
    if (e.key === 'Escape' && openOverlay) { closeOverlay(); return; }
    if (typing || openOverlay || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/') { const i = $('#hero-q') || $('#tool-root input'); if (i) { e.preventDefault(); i.focus(); } else { e.preventDefault(); openPalette(); } }
    else if (['1', '2', '3', '4'].includes(e.key)) goTool(['decoder', 'lookup', 'triage', 'plan'][Number(e.key) - 1]);
    else if (e.key.toLowerCase() === 'a') { e.preventDefault(); openAssistant(); }
    else if (e.key.toLowerCase() === 'h') openHistory();
    else if (e.key.toLowerCase() === 't') toggleTheme();
    else if (e.key === '?') openShortcuts();
  });
  const topBtn = $('[data-to-top]');
  addEventListener('scroll', () => { if (topBtn) topBtn.hidden = scrollY < 700; }, { passive: true });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if ((localStorage.getItem('wm-theme') || '"system"').includes('system')) setTheme('system'); });

  window.WM = { $, $$, esc, md, mdBlock, api, toast, copy, download, ls, ss, history, plan, goTool, openAssistant, openPalette, debounce };
  updateDot();
  initEntry();
  initGuides();
})();
