'use strict';
// "Ask the Lab" assistant. Fully local and grounded: it finds the most
// relevant knowledge-base entries, guides and FAQ answers for a question and
// composes a structured answer from them. No external AI service, no keys.

const kb = require('./kb');
const { anatomy } = require('./decode');

const TOOL_TEXT = {
  sfc: 'Run `DISM /Online /Cleanup-Image /RestoreHealth` first, then `sfc /scannow`, both from Terminal (Admin). DISM repairs the component store that SFC copies good files from, so that order matters. Let each one finish, then restart.',
  safe: 'Hold Shift while you click Restart (from the Start menu or the sign-in screen), then pick Troubleshoot > Advanced options > Startup Settings > Restart, and press 4 for Safe Mode or 5 for Safe Mode with Networking.',
};

function words(s) { return String(s || '').toLowerCase().match(/[a-z0-9_]{3,}/g) || []; }

function rankText(items, q, fields) {
  const w = new Set(words(q));
  return items.map((it) => {
    let s = 0;
    const hay = fields.map((f) => String(f(it) || '').toLowerCase()).join(' ');
    for (const t of w) if (hay.includes(t)) s += 1;
    return { it, s };
  }).filter((x) => x.s >= 2).sort((a, b) => b.s - a.s).map((x) => x.it);
}

function answer(question) {
  const q = String(question || '').trim().slice(0, 600);
  if (q.length < 3) return { answer: 'Ask me about a Windows error code, a blue screen, an update failure or a repair step.', sources: [] };
  const sources = [];
  const parts = [];

  // 1. Explicit codes in the question
  const codeHits = [];
  const cands = q.match(/0x[0-9a-f]{1,8}|\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b|\bcode\s*\d{1,2}\b|\b8007[0-9a-f]{4}\b/gi) || [];
  for (const c of cands) { const e = kb.byCode(c); if (e && !codeHits.includes(e)) codeHits.push(e); }
  let entries = codeHits;
  const lower = q.toLowerCase();
  const toolIntent = !codeHits.length && (/\b(sfc|dism)\b/.test(lower) || /safe mode/.test(lower));
  if (!entries.length && !toolIntent) entries = kb.search(q, { limit: 3 }).items.slice(0, 2);

  if (/\b(sfc|dism)\b/.test(lower) && !codeHits.length) parts.push('**Repairing system files**\n' + TOOL_TEXT.sfc);
  if (/safe mode/.test(lower) && !codeHits.length) parts.push('**Getting into Safe Mode**\n' + TOOL_TEXT.safe);

  for (const e of entries.slice(0, 2)) {
    sources.push({ type: 'error', slug: e.slug, title: e.title, url: `/errors/${e.slug}` });
    const steps = e.fixes.slice(0, 3).map((f, i) => `${i + 1}. **${f.title}** (${f.difficulty}, ${f.timeEstimate}): ${f.detail}${f.riskNote ? ' Caution: ' + f.riskNote : ''}`).join('\n');
    parts.push(`**${e.title}**\n${e.summary}\n\nMost likely causes: ${e.commonCauses.slice(0, 3).join('; ')}.\n\nStart with these steps (safest first):\n${steps}\n\nThe full page has ${e.fixes.length} steps and a printable checklist.`);
  }

  if (!codeHits.length && cands.length) {
    const a = anatomy(cands[0]);
    if (a && a.parts) parts.unshift(`I do not have a dedicated page for **${cands[0]}** yet, but here is what the number itself says:\n` + a.parts.map((p) => `- ${p.label}: ${p.value}`).join('\n') + (a.notes && a.notes.length ? '\n\n' + a.notes.join(' ') : ''));
  }

  const faq = rankText(kb.FAQ, q, [(f) => f.question, (f) => f.answer]).slice(0, 1);
  for (const f of faq) { parts.push(`**${f.question}**\n${f.answer}`); sources.push({ type: 'faq', title: f.question, url: '/#faq' }); }

  const guides = rankText(kb.GUIDES, q, [(g) => g.title, (g) => g.description, (g) => g.sections.map((s) => s.heading).join(' ')]).slice(0, 1);
  for (const g of guides) { parts.push(`For a full walkthrough, read the guide **${g.title}**.`); sources.push({ type: 'guide', slug: g.slug, title: g.title, url: `/guides/${g.slug}` }); }

  if (!parts.length) {
    parts.push('I could not match that to anything in the knowledge base yet. Try including the exact code (for example `0x80070002` or `CRITICAL_PROCESS_DIED`), or run the Triage wizard: it ranks likely causes from your symptoms, timing and recent changes.');
  }
  parts.push('_Back up important files before repairs that touch disks, drivers or the registry._');
  return { answer: parts.join('\n\n'), sources };
}

module.exports = { answer };
