'use strict';
// Server-rendered HTML for every crawlable page. Interactive parts are
// enhanced by /assets/common.js (all pages) and /assets/app.js (home tools).

const kb = require('./kb');
const C = require('./config');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** Inline markup: `code`, **bold**. Input is escaped first. */
const md = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const strip = (s) => String(s || '').replace(/`/g, '');
const asset = (f) => `/assets/${f}?v=${C.ASSET_V}`;
const catLabel = (c) => kb.CATEGORIES[c]?.label || c;
const SEV = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
const FREQ = { rare: 'Rare', uncommon: 'Uncommon', common: 'Common', 'very-common': 'Very common' };

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  wrench: '<path d="M14.5 6.5a4 4 0 0 0 5 5l-8.5 8.5a2.1 2.1 0 0 1-3-3l8.5-8.5a4 4 0 0 0-2-2z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/><path d="m16 16-1.8-1.8"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2"/><circle cx="16" cy="16" r="1.2"/><circle cx="12" cy="12" r="1.2"/>',
  flame: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  thumbsUp: '<path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/>',
  thumbsDown: '<path d="M17 13V4h3v9zM17 13l-4 8a2 2 0 0 1-2-2v-4H5a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 6.2 4H17"/>',
};
const icon = (n, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

function logo() {
  return `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14b8a6"/><stop offset="1" stop-color="#0f766e"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#lg)"/><path d="M9 10.5h14M9 16h8M9 21.5h5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="22" cy="20" r="3.4" fill="none" stroke="#fde68a" stroke-width="2.2"/></svg>`;
}

function layout({ title, description, path, body, jsonld = [], page = '', scripts = [], noindex = false }) {
  const url = C.BASE_URL + path;
  const ld = jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('');
  const nav = [['/', 'Tools', 'home'], ['/errors', 'Error database', 'errors'], ['/guides', 'Guides', 'guides'], ['/#faq', 'FAQ', 'faq']];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(url)}">`}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(C.SITE_NAME)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#f7faf9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#071412" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${asset('style.css')}">
<script>(function(){try{var t=localStorage.getItem('wm-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()</script>
${ld}
</head>
<body data-page="${esc(page)}">
<a class="skip" href="#main">Skip to content</a>
<header class="site-header" data-noprint>
  <div class="wrap hdr">
    <a class="brand" href="/" aria-label="${esc(C.SITE_NAME)} home">${logo()}<span>${esc(C.SITE_NAME_A)}<b>${esc(C.SITE_NAME_B)}</b></span></a>
    <nav class="main-nav" aria-label="Main">${nav.map(([h, l, k]) => `<a href="${h}"${k === page ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    <div class="hdr-actions">
      <button class="icon-btn" type="button" data-open-palette aria-label="Search everything (Ctrl K)" title="Search everything (Ctrl K)">${icon('search')}</button>
      <button class="icon-btn accent" type="button" data-open-assistant aria-label="Ask the assistant" title="Ask the assistant (A)">${icon('spark')}</button>
      <button class="icon-btn" type="button" data-open-history aria-label="Activity history" title="Activity history">${icon('history')}<span class="dot" hidden></span></button>
      <button class="icon-btn" type="button" data-toggle-theme aria-label="Switch light or dark theme" title="Switch light or dark theme">${icon('moon')}</button>
      <button class="icon-btn only-mobile" type="button" data-open-menu aria-label="Open menu" aria-expanded="false">${icon('menu')}</button>
    </div>
  </div>
  <nav class="mobile-menu" hidden aria-label="Mobile">${nav.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')}<a href="/admin">Admin</a></nav>
</header>
<main id="main">${body}</main>
<footer class="site-footer" data-noprint>
  <div class="wrap foot">
    <div>
      <a class="brand small" href="/">${logo()}<span>${esc(C.SITE_NAME_A)}<b>${esc(C.SITE_NAME_B)}</b></span></a>
      <p class="muted">${esc(C.TAGLINE)} An independent reference for blue screens, update failures and Windows system errors, with every fix list ordered from safest to riskiest.</p>
      <p class="kbd-row"><span><kbd>Ctrl</kbd> <kbd>K</kbd> search</span><span><kbd>/</kbd> focus box</span><span><kbd>1</kbd>-<kbd>4</kbd> tools</span><span><kbd>A</kbd> assistant</span><span><kbd>?</kbd> all shortcuts</span></p>
    </div>
    <div class="foot-links">
      <div><h4>Tools</h4><a href="/#tools" data-tool-link="decoder">Decoder</a><a href="/#tools" data-tool-link="lookup">Lookup</a><a href="/#tools" data-tool-link="triage">Triage</a><a href="/#tools" data-tool-link="plan">Fix plan</a></div>
      <div><h4>Learn</h4><a href="/errors">Error database</a><a href="/guides">Guides</a><a href="/#faq">FAQ</a><a href="/manual">User manual</a></div>
    </div>
  </div>
  <div class="wrap fine">${esc(C.SITE_NAME)} is an independent educational reference. It is not affiliated with or endorsed by Microsoft. ${kb.stats().total} errors in ${kb.stats().categories} categories, ${kb.GUIDES.length} guides and ${kb.FAQ.length} FAQ answers. Back up important data before attempting system repairs.</div>
</footer>
<nav class="bottom-nav" data-noprint aria-label="Quick tools">
  <a href="/#tools" data-tool-link="decoder">${icon('scan')}<span>Decode</span></a>
  <a href="/#tools" data-tool-link="lookup">${icon('search')}<span>Lookup</span></a>
  <a href="/#tools" data-tool-link="triage">${icon('list')}<span>Triage</span></a>
  <a href="/#tools" data-tool-link="plan">${icon('wrench')}<span>Plan</span></a>
</nav>
<button class="to-top" type="button" data-to-top aria-label="Back to top" hidden>${icon('up')}</button>
<div id="toasts" class="toasts" aria-live="polite"></div>
<script src="${asset('common.js')}" defer></script>
${scripts.map((s) => `<script src="${asset(s)}" defer></script>`).join('')}
</body>
</html>`;
}

const sevBadge = (s) => `<span class="badge sev-${esc(s)}">${SEV[s] || esc(s)}</span>`;
const catBadge = (c) => `<a class="badge cat" href="/errors/category/${esc(c)}">${esc(catLabel(c))}</a>`;

function errorCard(e) {
  return `<a class="card err-card" href="/errors/${esc(e.slug)}"><div class="row"><code class="code">${esc(e.codes[0])}</code>${sevBadge(e.severity)}</div><h3>${esc(e.title)}</h3><p>${md(e.summary)}</p></a>`;
}

function guideCard(g) {
  return `<article class="card guide-card" data-guide="${esc(g.slug)}"><div class="row"><span class="badge cat">${esc(catLabel(g.category))}</span><span class="muted small">${g.readMinutes} min read</span><span class="read-flag" hidden>${icon('check')} Read</span></div><h3><a href="/guides/${esc(g.slug)}">${esc(g.title)}</a></h3><p>${md(g.description)}</p><div class="row end"><a class="btn ghost sm" href="/guides/${esc(g.slug)}">Read the guide</a></div></article>`;
}

function crumbs(items) {
  return `<nav class="crumbs" aria-label="Breadcrumb">${items.map(([h, l], i) => (i < items.length - 1 ? `<a href="${h}">${esc(l)}</a><span>/</span>` : `<span aria-current="page">${esc(l)}</span>`)).join('')}</nav>`;
}
const crumbLd = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([h, l], i) => ({ '@type': 'ListItem', position: i + 1, name: l, item: C.BASE_URL + h })) });

function commandsIn(text) { return [...String(text).matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((c) => /[a-z]/i.test(c) && c.length < 140); }

// ---------------- pages ----------------
function home() {
  const st = kb.stats();
  const chips = st.byCategory.slice(0, 7).map((c) => `<a class="chip" href="/errors/category/${c.category}">${esc(c.label)} <span>${c.count}</span></a>`).join('');
  const faq = kb.FAQ.map((f, i) => `<details class="faq-item"${i === 0 ? ' open' : ''}><summary><span class="num">${String(i + 1).padStart(2, '0')}</span>${esc(f.question)}</summary><div class="faq-a">${md(f.answer)}</div></details>`).join('');
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: kb.FAQ.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: strip(f.answer) } })) };
  const siteLd = { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite', name: C.SITE_NAME, url: C.BASE_URL, potentialAction: { '@type': 'SearchAction', target: C.BASE_URL + '/?q={query}', 'query-input': 'required name=query' } }, { '@type': 'WebApplication', name: `${C.SITE_NAME} error decoder`, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }] };
  const body = `
<section class="hero" data-noprint>
  <div class="hero-bg" aria-hidden="true"></div>
  <div class="wrap hero-in">
    <p class="pill"><span class="pulse"></span>${esc(C.TAGLINE)}</p>
    <h1>Any Windows error, <span class="grad">explained in plain words</span></h1>
    <p class="lead">Type a stop code, a hex number or the message you saw. You get what it means, the likely causes ranked, and a step-by-step fix list that starts with the safest move.</p>
    <form class="hero-search" role="search" data-hero-search>
      ${icon('search', 'ic lead-ic')}
      <input id="hero-q" type="search" name="q" autocomplete="off" placeholder="Try 0x80070002, CRITICAL_PROCESS_DIED or &quot;update stuck at 0%&quot;" aria-label="Search Windows errors" role="combobox" aria-expanded="false" aria-controls="hero-suggest">
      <button class="btn primary" type="submit">Decode</button>
      <ul id="hero-suggest" class="suggest" role="listbox" hidden></ul>
    </form>
    <div class="hero-meta">
      <span class="muted small">Stop codes, HRESULTs, Win32, Update and Store codes. Whole sentences work too.</span>
      <button class="link-btn" type="button" data-surprise>${icon('dice')} Surprise me</button>
      <span class="muted small only-desktop">Jump anywhere with <kbd>Ctrl</kbd> <kbd>K</kbd></span>
    </div>
    <div class="recent" data-recent hidden></div>
    <div class="stats" data-stats>
      <div><b data-count="${st.total}">${st.total}</b><span>Errors documented</span></div>
      <div><b data-count="${st.categories}">${st.categories}</b><span>Categories</span></div>
      <div><b data-count="${kb.GUIDES.length}">${kb.GUIDES.length}</b><span>Repair guides</span></div>
      <div><b data-stat="sessions">0</b><span>Diagnoses run</span></div>
    </div>
    <div class="chips">${chips}</div>
  </div>
</section>
<section class="trending wrap" data-trending hidden></section>
<section id="tools" class="wrap tools-sec">
  <div class="tools-card">
    <div class="tabs" role="tablist" aria-label="Tools">
      <button role="tab" data-tab="decoder" aria-selected="true">${icon('scan')}<span>Decoder</span><kbd>1</kbd></button>
      <button role="tab" data-tab="lookup" aria-selected="false">${icon('search')}<span>Lookup</span><kbd>2</kbd></button>
      <button role="tab" data-tab="triage" aria-selected="false">${icon('list')}<span>Triage</span><kbd>3</kbd></button>
      <button role="tab" data-tab="plan" aria-selected="false">${icon('wrench')}<span>Fix plan</span><kbd>4</kbd><em class="qcount" data-plan-count hidden></em></button>
    </div>
    <div class="tab-panel" id="tool-root"><noscript><p>The interactive tools need JavaScript. You can still browse the <a href="/errors">error database</a>.</p></noscript><div class="skeleton"></div></div>
  </div>
</section>
<section class="wrap daily" data-daily hidden></section>
<section id="guides" class="wrap sec">
  <div class="sec-head"><p class="eyebrow">Learn</p><h2>Repair guides</h2><p class="muted">Longer walkthroughs meant to be followed in order: reading a blue screen, Safe Mode, the SFC and DISM sequence, update repair, hardware tests and driver fixes.</p><p class="small" data-guide-progress></p></div>
  <div class="grid g3">${kb.GUIDES.map(guideCard).join('')}</div>
</section>
<section id="faq" class="wrap sec">
  <div class="sec-head"><p class="eyebrow">FAQ</p><h2>Before you start fixing</h2><p class="muted">Short, honest answers about stop codes, data safety, cleanup tools and when a repair beats a reinstall.</p></div>
  <div class="faq">${faq}</div>
</section>
<section class="wrap sec why">
  <div class="grid g3">
    <div class="card"><span class="num">01</span><h3>Ranked, explained triage</h3><p>Every entry is scored against your symptom, timing, recent changes and whether Windows still starts, and you see why each result ranked where it did.</p></div>
    <div class="card"><span class="num">02</span><h3>Safest steps first</h3><p>Fix lists begin with reversible checks. Anything that touches the registry, boot records or your data carries a clear caution note.</p></div>
    <div class="card"><span class="num">03</span><h3>Only real tools</h3><p>sfc, DISM, chkdsk, mdsched, wsreset and other built-in Microsoft tools. No miracle downloads, no invented KB numbers.</p></div>
  </div>
</section>`;
  return layout({ title: `${C.SITE_NAME}: Windows error decoder, BSOD stop codes and fix guides`, description: `Decode Windows blue screen stop codes, Windows Update, Win32 and Store errors. Search, guided triage, log scanning and step-by-step fix plans for ${st.total} documented errors.`, path: '/', body, jsonld: [faqLd, siteLd], page: 'home', scripts: ['app.js'] });
}

function errorPage(e, extra = {}) {
  const related = e.relatedSlugs.map((s) => kb.get(s)).filter(Boolean);
  const sameCat = related.length < 3 ? kb.list().filter((x) => x.category === e.category && x.slug !== e.slug && !e.relatedSlugs.includes(x.slug)).slice(0, 3 - related.length) : [];
  const fixes = e.fixes.map((f, i) => {
    const cmds = commandsIn(f.detail);
    return `<li class="fix" data-fix="${i}">
  <div class="fix-n">${i + 1}</div>
  <div class="fix-body">
    <h3>${esc(f.title)} ${i === 0 ? '<span class="badge start">Start here</span>' : ''}</h3>
    <p class="fix-meta"><span class="badge diff-${esc(f.difficulty)}">${esc(f.difficulty)}</span><span class="muted small">${esc(f.timeEstimate)}</span></p>
    <p>${md(f.detail)}</p>
    ${cmds.length ? `<div class="cmds"><p class="small muted">Commands in this step</p>${cmds.map((c) => `<button class="cmd" type="button" data-copy="${esc(c)}" title="Copy">${icon('copy')}<code>${esc(c)}</code></button>`).join('')}</div>` : ''}
    ${f.riskNote ? `<div class="caution">${icon('alert')}<div><b>Caution</b><p>${md(f.riskNote)}</p></div></div>` : ''}
    <div class="fix-actions"><button class="btn ghost sm" type="button" data-fixvote="${i}">${icon('check')} This fixed it <span class="vc" data-vc="${i}"></span></button></div>
  </div>
</li>`;
  }).join('');
  const crumbItems = [['/', 'Home'], ['/errors', 'Error database'], [`/errors/category/${e.category}`, catLabel(e.category)], [`/errors/${e.slug}`, e.codes[0]]];
  const howTo = { '@context': 'https://schema.org', '@type': 'HowTo', name: `How to fix ${e.title}`, description: strip(e.summary), step: e.fixes.map((f, i) => ({ '@type': 'HowToStep', position: i + 1, name: f.title, text: strip(f.detail) })) };
  const article = { '@context': 'https://schema.org', '@type': 'TechArticle', headline: `${e.title}: meaning and fixes`, description: strip(e.summary), about: e.codes.join(', '), keywords: e.tags.join(', '), ...(e.updatedAt ? { dateModified: e.updatedAt } : {}) };
  const body = `
<div class="wrap page" data-entry="${esc(e.slug)}" data-entry-title="${esc(e.title)}" data-entry-code="${esc(e.codes[0])}" data-entry-sev="${esc(e.severity)}">
  ${crumbs(crumbItems)}
  ${extra.preview ? '<div class="note warn">Preview of an unpublished draft. Visitors cannot see this page yet.</div>' : ''}
  <header class="entry-head">
    <div class="codes">${e.codes.slice(0, 6).map((c) => `<button class="code-chip" type="button" data-copy="${esc(c)}" title="Copy code">${esc(c)}</button>`).join('')}</div>
    <h1>${esc(e.title)}</h1>
    <p class="lead">${md(e.summary)}</p>
    <div class="row wrap-row">${catBadge(e.category)}${sevBadge(e.severity)} <span class="badge">${FREQ[e.frequency] || ''}</span>${e.windowsVersions.map((v) => `<span class="badge soft">${esc(v)}</span>`).join('')}<span class="muted small" data-views></span></div>
    <div class="row wrap-row actions" data-noprint>
      <button class="btn primary" type="button" data-add-plan>${icon('wrench')} Build a fix plan</button>
      <button class="btn ghost" type="button" data-copy-steps>${icon('copy')} Copy all steps</button>
      <button class="btn ghost" type="button" data-share>${icon('link')} Copy link</button>
      <button class="btn ghost" type="button" data-print>${icon('print')} Print</button>
      <button class="btn ghost" type="button" data-bookmark>${icon('star')} <span>Save</span></button>
    </div>
  </header>
  ${e.autoDrafted ? '<div class="note">This page was compiled from the official code reference. The steps are general, proven repairs for this kind of error, ordered safest first.</div>' : ''}
  <div class="entry-grid">
    <article class="entry-main">
      <section class="block"><h2>What ${esc(e.codes[0])} means</h2><p>${md(e.meaning)}</p></section>
      <section class="block"><h2>Common causes</h2><ul class="causes">${e.commonCauses.map((c) => `<li>${md(c)}</li>`).join('')}</ul></section>
      <section class="block"><h2>How to fix it</h2><p class="muted">${e.fixes.length} steps, safest first. Work down the list and stop as soon as the error is gone.</p><ol class="fixes">${fixes}</ol>
      <div class="note">Still getting ${esc(e.codes[0])} after every step? Back up your files and consider an in-place repair install, which keeps your apps and data. The <a href="/guides/fix-windows-update-guide">Windows Update repair playbook</a> explains how.</div></section>
      <section class="block"><h2>Prevention</h2><ul class="prevent">${e.prevention.map((p) => `<li>${icon('check')}<span>${md(p)}</span></li>`).join('')}</ul></section>
      <section class="block feedback" data-noprint><h2>Was this page helpful?</h2><div class="row"><button class="btn ghost" type="button" data-feedback="yes">${icon('thumbsUp')} Yes</button><button class="btn ghost" type="button" data-feedback="no">${icon('thumbsDown')} No</button><span class="muted small" data-feedback-count></span></div></section>
    </article>
    <aside class="entry-side" data-noprint>
      <div class="card sticky"><h3>On this page</h3><ol class="toc">${e.fixes.map((f, i) => `<li><a href="#" data-jump="${i}">${esc(f.title)}</a></li>`).join('')}</ol><button class="btn primary block-btn" type="button" data-add-plan>${icon('wrench')} Open as checklist</button></div>
      ${related.length + sameCat.length ? `<div class="card"><h3>Related errors</h3>${[...related, ...sameCat].map((r) => `<a class="rel" href="/errors/${esc(r.slug)}"><code>${esc(r.codes[0])}</code><span>${esc(r.title)}</span></a>`).join('')}</div>` : ''}
      <div class="card"><h3>Tags</h3><p class="tags">${e.tags.map((t) => `<a href="/?q=${encodeURIComponent(t)}#tools">${esc(t)}</a>`).join(' ')}</p></div>
    </aside>
  </div>
  <p class="muted center"><a href="/errors">Browse all ${kb.stats().total} errors</a> or read the <a href="/guides">repair guides</a>.</p>
</div>`;
  return layout({ title: `${e.title} fix: ${catLabel(e.category)} error explained | ${C.SITE_NAME}`, description: strip(e.summary).slice(0, 300), path: `/errors/${e.slug}`, body, jsonld: [article, howTo, crumbLd(crumbItems)], page: 'errors', noindex: !!extra.preview });
}

function errorsIndex() {
  const st = kb.stats();
  const groups = st.byCategory.map(({ category, count, label }) => {
    const items = kb.list().filter((e) => e.category === category);
    const shown = items.slice(0, 12);
    return `<section class="sec cat-sec" id="cat-${esc(category)}"><div class="row between"><h2>${esc(label)} <span class="muted">${count}</span></h2><a class="btn ghost sm" href="/errors/category/${esc(category)}">View all</a></div><p class="muted">${esc(kb.CATEGORIES[category]?.description || '')}</p><div class="grid g3">${shown.map(errorCard).join('')}</div></section>`;
  }).join('');
  const crumbItems = [['/', 'Home'], ['/errors', 'Error database']];
  const body = `<div class="wrap page">${crumbs(crumbItems)}
  <header class="page-head"><p class="eyebrow">Error database</p><h1>Every documented Windows error, by category</h1><p class="lead">All ${st.total} entries in the knowledge base. Each page explains the code, lists the likely causes and walks through fixes from the safest step up. Use the <a href="/#tools" data-tool-link="lookup">Lookup tool</a> to filter by code, category and severity.</p>
  <nav class="chips">${st.byCategory.map((c) => `<a class="chip" href="#cat-${c.category}">${esc(c.label)} <span>${c.count}</span></a>`).join('')}</nav></header>
  ${groups}</div>`;
  return layout({ title: `Windows error database: ${st.total} errors by category | ${C.SITE_NAME}`, description: `Browse ${st.total} Windows errors grouped by category: blue screens, Windows Update, Win32, Store, activation, network, startup, drivers and more.`, path: '/errors', body, jsonld: [crumbLd(crumbItems)], page: 'errors' });
}

function categoryPage(cat, page = 1) {
  const items = kb.list().filter((e) => e.category === cat);
  const per = 60;
  const pages = Math.max(1, Math.ceil(items.length / per));
  const p = Math.min(Math.max(1, page), pages);
  const label = catLabel(cat);
  const crumbItems = [['/', 'Home'], ['/errors', 'Error database'], [`/errors/category/${cat}`, label]];
  const pager = pages > 1 ? `<nav class="pager">${Array.from({ length: pages }, (_, i) => `<a href="/errors/category/${cat}${i ? '?page=' + (i + 1) : ''}"${i + 1 === p ? ' aria-current="page"' : ''}>${i + 1}</a>`).join('')}</nav>` : '';
  const body = `<div class="wrap page">${crumbs(crumbItems)}<header class="page-head"><p class="eyebrow">Category</p><h1>${esc(label)} errors</h1><p class="lead">${esc(kb.CATEGORIES[cat]?.description || '')} ${items.length} documented entries.</p></header><div class="grid g3">${items.slice((p - 1) * per, p * per).map(errorCard).join('')}</div>${pager}</div>`;
  return layout({ title: `${label} errors (${items.length}) | ${C.SITE_NAME}`, description: `${items.length} ${label} errors explained with causes and safe, ordered fixes.`, path: `/errors/category/${cat}${p > 1 ? '?page=' + p : ''}`, body, jsonld: [crumbLd(crumbItems)], page: 'errors' });
}

function guidesIndex() {
  const crumbItems = [['/', 'Home'], ['/guides', 'Guides']];
  const tools = { decoder: 'Decoder', lookup: 'Lookup', triage: 'Triage', plan: 'Fix plan' };
  const body = `<div class="wrap page">${crumbs(crumbItems)}<header class="page-head"><p class="eyebrow">Learn</p><h1>Windows repair guides</h1><p class="lead">Step-by-step walkthroughs for the repairs that come up again and again. Every command is real and safe to type as written, and anything risky carries a back-up-first note.</p><p class="small" data-guide-progress></p></header>
  <div class="grid g2">${kb.GUIDES.map((g) => guideCard(g).replace('</p><div class="row end">', `</p><p class="small muted">Works well with: ${(g.tools || []).map((t) => tools[t] || t).join(', ')}</p><div class="row end">`)).join('')}</div></div>`;
  return layout({ title: `Windows repair guides (${kb.GUIDES.length} walkthroughs) | ${C.SITE_NAME}`, description: 'Safe Mode, SFC and DISM in the right order, Windows Update repair, RAM and disk tests, and driver fixes, explained step by step.', path: '/guides', body, jsonld: [crumbLd(crumbItems)], page: 'guides' });
}

function guidePage(g) {
  const related = (g.relatedSlugs || []).map((s) => kb.get(s)).filter(Boolean);
  const crumbItems = [['/', 'Home'], ['/guides', 'Guides'], [`/guides/${g.slug}`, g.title]];
  const others = kb.GUIDES.filter((x) => x.slug !== g.slug).slice(0, 3);
  const body = `<div class="wrap page narrow" data-guide-page="${esc(g.slug)}">${crumbs(crumbItems)}
  <header class="page-head"><p class="row"><span class="badge cat">${esc(catLabel(g.category))}</span><span class="muted small">${g.readMinutes} min read</span></p><h1>${esc(g.title)}</h1><p class="lead">${md(g.description)}</p></header>
  <div class="read-bar" aria-hidden="true"><span data-read-bar></span></div>
  <nav class="card toc-card"><h3>In this guide</h3><ol>${g.sections.map((s, i) => `<li><a href="#s${i + 1}">${esc(s.heading)}</a></li>`).join('')}</ol></nav>
  <article class="prose">${g.sections.map((s, i) => `<section id="s${i + 1}"><h2>${esc(s.heading)}</h2>${String(s.body).split(/\n\n+/).map((p) => `<p>${md(p)}</p>`).join('')}</section>`).join('')}</article>
  <div class="row" data-noprint><button class="btn primary" type="button" data-mark-read>${icon('check')} Mark as read</button><button class="btn ghost" type="button" data-print>${icon('print')} Print</button></div>
  ${related.length ? `<section class="sec"><h2>Errors this guide helps with</h2><div class="grid g3">${related.map(errorCard).join('')}</div></section>` : ''}
  <section class="sec"><h2>More guides</h2><div class="grid g3">${others.map(guideCard).join('')}</div></section></div>`;
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: strip(g.description), timeRequired: `PT${g.readMinutes}M` };
  return layout({ title: `${g.title} | ${C.SITE_NAME}`, description: strip(g.description), path: `/guides/${g.slug}`, body, jsonld: [ld, crumbLd(crumbItems)], page: 'guides' });
}

/** Very small Markdown renderer for the user manual. */
function markdown(src) {
  const lines = String(src).replace(/\r/g, '').split('\n');
  let html = '', inList = null, inCode = false, code = [], table = [];
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((r) => !/^\|\s*-/.test(r)).map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
    html += `<div class="table-wrap"><table><thead><tr>${rows[0].map((c) => `<th>${md(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${md(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    table = [];
  };
  const closeList = () => { if (inList) { html += `</${inList}>`; inList = null; } };
  for (const line of lines) {
    if (line.startsWith('```')) { if (inCode) { html += `<pre><code>${esc(code.join('\n'))}</code></pre>`; code = []; inCode = false; } else { closeList(); flushTable(); inCode = true; } continue; }
    if (inCode) { code.push(line); continue; }
    if (/^\|/.test(line)) { closeList(); table.push(line); continue; } else flushTable();
    let m;
    if ((m = /^(#{1,4})\s+(.*)/.exec(line))) { closeList(); const id = m[2].toLowerCase().replace(/[^a-z0-9]+/g, '-'); html += `<h${m[1].length} id="${id}">${md(m[2])}</h${m[1].length}>`; continue; }
    if ((m = /^\s*[-*]\s+(.*)/.exec(line))) { if (inList !== 'ul') { closeList(); html += '<ul>'; inList = 'ul'; } html += `<li>${md(m[1])}</li>`; continue; }
    if ((m = /^\s*\d+\.\s+(.*)/.exec(line))) { if (inList !== 'ol') { closeList(); html += '<ol>'; inList = 'ol'; } html += `<li>${md(m[1])}</li>`; continue; }
    if (!line.trim()) { closeList(); continue; }
    closeList();
    html += `<p>${md(line).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, h) => `<a href="${h.replace(/"/g, '')}">${t}</a>`)}</p>`;
  }
  closeList(); flushTable();
  return html;
}

function manualPage(src) {
  const body = `<div class="wrap page narrow">${crumbs([['/', 'Home'], ['/manual', 'User manual']])}<article class="prose manual">${markdown(src)}</article></div>`;
  return layout({ title: `User manual | ${C.SITE_NAME}`, description: `How to use and run ${C.SITE_NAME}, and how to add new error codes.`, path: '/manual', body, page: 'manual' });
}

function adminPage() {
  const body = `<div class="wrap page" id="admin-root"><div class="skeleton"></div></div>`;
  return layout({ title: `Admin | ${C.SITE_NAME}`, description: 'Content administration', path: '/admin', body, page: 'admin', scripts: ['admin.js'], noindex: true });
}

function notFound(path) {
  const body = `<div class="wrap page center nf"><p class="eyebrow">404</p><h1>That page is not here</h1><p class="lead">The address <code>${esc(path)}</code> does not match any page. If you were looking for an error code, try the decoder.</p><form class="hero-search small" action="/" method="get"><input type="search" name="q" placeholder="Paste the code or message" aria-label="Search"><button class="btn primary">Decode</button></form></div>`;
  return layout({ title: `Page not found | ${C.SITE_NAME}`, description: 'Page not found', path, body, noindex: true });
}

module.exports = { home, errorPage, errorsIndex, categoryPage, guidesIndex, guidePage, manualPage, adminPage, notFound, esc, markdown };
