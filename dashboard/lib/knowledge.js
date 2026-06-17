// The shared knowledge base (Basic Memory's markdown store, also mounted by Hermes). The dashboard
// reads/searches the markdown directly off the volume and writes imported notes here; Basic Memory
// watches the dir and re-indexes, and serves it to Hermes over MCP.
import fs from 'fs';
import path from 'path';

const KDIR = process.env.KNOWLEDGE_DIR || '/opt/studio/knowledge';
const CHATGPT_DIR = 'chatgpt';

function walk(dir, base = dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'bm-config') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else if (e.name.endsWith('.md')) out.push(path.relative(base, full));
  }
  return out;
}

function parseFrontmatter(text) {
  const fm = {};
  let rest = text;
  // Basic Memory rewrites notes on sync and can PREPEND its own frontmatter block (permalink, …)
  // above the original, leaving two `--- … ---` fences. Consume every leading fence and merge keys
  // (first occurrence wins) so the real title/tags survive.
  for (let guard = 0; guard < 4; guard += 1) {
    const m = /^\s*---\n([\s\S]*?)\n---\n?/.exec(rest);
    if (!m) break;
    const lines = m[1].split('\n');
    for (let li = 0; li < lines.length; li += 1) {
      const i = lines[li].indexOf(':');
      if (i <= 0) continue;
      const k = lines[li].slice(0, i).trim();
      let v = lines[li].slice(i + 1).trim();
      if (!v) {
        // Basic Memory normalises inline `tags: [a, b]` into a YAML block list (`- a` lines).
        // Collect those into a bracketed string so _parseTags still works.
        const items = [];
        while (li + 1 < lines.length && /^\s*-\s+/.test(lines[li + 1])) { items.push(lines[li + 1].replace(/^\s*-\s+/, '').trim()); li += 1; }
        if (items.length) v = `[${items.join(', ')}]`;
      }
      if (!(k in fm)) fm[k] = v;
    }
    rest = rest.slice(m[0].length);
  }
  return { fm, body: rest };
}

export function listNotes() {
  return walk(KDIR).map((rel) => {
    let title = rel.replace(/\.md$/, '');
    let source = '', updated = '';
    try {
      const { fm } = parseFrontmatter(fs.readFileSync(path.join(KDIR, rel), 'utf8').slice(0, 600));
      title = fm.title || title;
      source = fm.source || '';
      updated = fm.updated || fm.created || '';
    } catch {}
    let mtime = 0;
    try { mtime = fs.statSync(path.join(KDIR, rel)).mtimeMs; } catch {}
    return { rel, title, source, updated, mtime };
  }).sort((a, b) => b.mtime - a.mtime);
}

export function readNote(rel) {
  const safe = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
  const full = path.join(KDIR, safe);
  if (!full.startsWith(KDIR)) throw new Error('bad path');
  const text = fs.readFileSync(full, 'utf8');
  const { fm, body } = parseFrontmatter(text);
  return { rel: safe, fm, body, title: fm.title || safe };
}

// Curated principle / "playbook" notes (frontmatter tag 'playbook') — surfaced as a Learnings tab so
// the operator can read the studio's hard-won guidance, not just the auto-captured edit/reject feedback.
export function playbookNotes() {
  const out = [];
  for (const n of listNotes()) {
    try {
      const note = readNote(n.rel);
      const t = note.fm && note.fm.tags;
      const tags = Array.isArray(t) ? t.join(',') : String(t || '');
      if (/\bplaybook\b/i.test(tags)) out.push({ rel: note.rel, title: note.title, body: note.body, updated: n.updated });
    } catch {}
  }
  return out;
}

export function searchNotes(q, limit = 40) {
  const needle = (q || '').toLowerCase().trim();
  if (!needle) return [];
  const hits = [];
  for (const rel of walk(KDIR)) {
    let text = '';
    try { text = fs.readFileSync(path.join(KDIR, rel), 'utf8'); } catch { continue; }
    const lc = text.toLowerCase();
    const at = lc.indexOf(needle);
    if (at === -1) continue;
    const { fm } = parseFrontmatter(text);
    hits.push({ rel, title: fm.title || rel, source: fm.source || '', snippet: text.slice(Math.max(0, at - 60), at + 120).replace(/\s+/g, ' ').trim() });
    if (hits.length >= limit) break;
  }
  return hits;
}

// Learning flywheel (§7): an approved post becomes a brand-tagged "voice example" note in the
// knowledge base, so future generation can retrieve it and stay on-voice. Best-effort; never throws.
export function writeVoiceExample({ brand, platform, topic, body, jobId }) {
  try {
    const text = (body || '').trim();
    if (!text) return;
    const bslug = (brand || 'unassigned').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unassigned';
    const dir = path.join(KDIR, 'voice', bslug);
    fs.mkdirSync(dir, { recursive: true });
    const title = `${(topic || 'post').replace(/\n/g, ' ').slice(0, 80)} — ${platform || 'post'}`;
    const fm = [
      '---', `title: ${title.replace(/"/g, "'")}`, 'type: voice-example',
      `brand: ${brand || 'unassigned'}`, `platform: ${platform || ''}`,
      `approved: ${new Date().toISOString()}`, `tags: [voice, ${bslug}${platform ? `, ${platform}` : ''}]`, '---',
    ].join('\n');
    fs.writeFileSync(path.join(dir, `${String(jobId).slice(0, 8)}-${platform || 'post'}.md`), `${fm}\n\n# ${title}\n\n${text}\n`);
  } catch { /* never break the approval gate */ }
}

const _noteSlug = (s) => (s || 'note').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'note';
const _uniqueFile = (dir, stem, ext = '.md') => {
  let file = path.join(dir, stem + ext), i = 2;
  while (fs.existsSync(file)) file = path.join(dir, `${stem}-${i++}${ext}`);
  return file;
};

// Write a note straight from the dashboard (title + optional tags + markdown body). Lands in the
// shared KB; Basic Memory indexes it and Hermes can then retrieve it.
export function writeNote({ title, body, tags }) {
  const t = (title || '').trim();
  if (!t) throw new Error('title is required');
  const text = (body || '').trim();
  if (!text) throw new Error('note body is empty');
  const dir = path.join(KDIR, 'notes');
  fs.mkdirSync(dir, { recursive: true });
  const tagList = (Array.isArray(tags) ? tags : String(tags || '').split(',')).map((s) => s.trim()).filter(Boolean);
  const fm = ['---', `title: ${t.replace(/"/g, "'")}`, 'type: note', 'source: dashboard',
    `created: ${new Date().toISOString()}`, `tags: [${['note', ...tagList].join(', ')}]`, '---'].join('\n');
  const file = _uniqueFile(dir, _noteSlug(t));
  fs.writeFileSync(file, `${fm}\n\n# ${t}\n\n${text}\n`);
  return { rel: path.relative(KDIR, file) };
}

// Save an uploaded markdown / text file as a note. If it has no frontmatter, give it a minimal one
// (title from filename) so it's titled and tagged in the graph/search.
export function importMarkdownFile(name, text) {
  const dir = path.join(KDIR, 'notes');
  fs.mkdirSync(dir, { recursive: true });
  const stem = _noteSlug((name || 'note').replace(/\.(md|markdown|mdown|txt|text)$/i, ''));
  const file = _uniqueFile(dir, stem);
  let out = text || '';
  if (!/^---\s*\n/.test(out)) {
    const title = stem.replace(/[-_]+/g, ' ');
    out = ['---', `title: ${title}`, 'type: note', 'source: upload', `created: ${new Date().toISOString()}`,
      'tags: [note, upload]', '---', '', out].join('\n');
  }
  fs.writeFileSync(file, out);
  return { rel: path.relative(KDIR, file) };
}

function _parseTags(raw) {
  if (!raw) return [];
  return raw.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

// Build a node/link graph of the knowledge base for the dashboard's force-directed view.
// Nodes = notes (grouped history | voice | note) plus tag hubs; edges = [[wikilinks]] between notes
// and note→tag membership (so even un-linked imports cluster meaningfully). Capped for readability.
export function knowledgeGraph({ maxNodes = 400, maxTags = 40 } = {}) {
  const parsed = [];
  for (const rel of walk(KDIR)) {
    let text = '';
    try { text = fs.readFileSync(path.join(KDIR, rel), 'utf8'); } catch { continue; }
    const { fm, body } = parseFrontmatter(text);
    const type = (fm.type || '').toLowerCase();
    let group = 'note';
    if (type === 'conversation' || fm.source === 'chatgpt' || rel.startsWith('chatgpt/')) group = 'history';
    else if (type === 'voice-example' || rel.startsWith('voice/')) group = 'voice';
    parsed.push({
      rel, title: fm.title || rel.replace(/\.md$/, ''), group, brand: fm.brand || '',
      tags: _parseTags(fm.tags),
      wikilinks: [...body.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].split('|')[0].trim()),
    });
  }
  const dropped = Math.max(0, parsed.length - maxNodes);
  const kept = parsed.slice(0, maxNodes);

  const byTitle = new Map();
  for (const n of kept) {
    byTitle.set(n.title.toLowerCase(), n.rel);
    byTitle.set(n.rel.replace(/\.md$/, '').toLowerCase(), n.rel);
    byTitle.set(path.basename(n.rel).replace(/\.md$/, '').toLowerCase(), n.rel);
  }
  const nodes = kept.map((n) => ({ id: n.rel, title: n.title, group: n.group, brand: n.brand }));
  const links = [];
  const seen = new Set();
  for (const n of kept) {
    for (const w of n.wikilinks) {
      const target = byTitle.get(w.toLowerCase());
      if (target && target !== n.rel) {
        const key = [n.rel, target].sort().join('||');
        if (!seen.has(key)) { seen.add(key); links.push({ source: n.rel, target, kind: 'link' }); }
      }
    }
  }
  const tagCount = new Map();
  for (const n of kept) for (const t of n.tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  const topTags = new Set([...tagCount.entries()].filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1]).slice(0, maxTags).map(([t]) => t));
  for (const t of topTags) nodes.push({ id: `tag:${t}`, title: `#${t}`, group: 'tag', degree: tagCount.get(t) });
  for (const n of kept) for (const t of n.tags) if (topTags.has(t)) links.push({ source: n.rel, target: `tag:${t}`, kind: 'tag' });

  // degree (for node sizing)
  const deg = new Map();
  for (const l of links) { deg.set(l.source, (deg.get(l.source) || 0) + 1); deg.set(l.target, (deg.get(l.target) || 0) + 1); }
  for (const nd of nodes) nd.degree = nd.degree || deg.get(nd.id) || 0;

  return { nodes, links, dropped, counts: { notes: kept.length, tags: topTags.size, edges: links.length } };
}

export function knowledgeStats() {
  const notes = walk(KDIR);
  const chatgpt = notes.filter((r) => r.startsWith(CHATGPT_DIR + '/')).length;
  return { total: notes.length, chatgpt, other: notes.length - chatgpt };
}

// ---------------- enriched ChatGPT importer ----------------
// Preserves what Basic Memory's built-in import drops: model used, attachments, tool calls — plus
// the active conversation thread, timestamps, and code. Dedupes by conversation id (re-import only
// adds new / updates changed), so you can drop a fresh export anytime.

const slug = (s) => (s || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';
const iso = (t) => (t ? new Date(t * 1000).toISOString() : '');
const hhmm = (t) => (t ? new Date(t * 1000).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '');

function mainThread(convo) {
  const map = convo.mapping || {};
  const chain = [];
  let node = convo.current_node;
  const seen = new Set();
  while (node && map[node] && !seen.has(node)) { seen.add(node); chain.push(map[node]); node = map[node].parent; }
  chain.reverse();
  return chain.map((n) => n && n.message).filter(Boolean);
}

function contentToMd(content) {
  if (!content) return '';
  const ct = content.content_type;
  if (ct === 'code') return '```' + (content.language || '') + '\n' + (content.text || (content.parts || []).join('')) + '\n```';
  if (ct === 'execution_output') return '```\n' + (content.text || (content.parts || []).join('')) + '\n```';
  const out = [];
  for (const p of content.parts || []) {
    if (typeof p === 'string') { if (p.trim()) out.push(p); }
    else if (p && typeof p === 'object') {
      if (p.content_type === 'image_asset_pointer') out.push('> 📎 _[image]_');
      else if (p.content_type === 'audio_transcription' && p.text) out.push(p.text);
      else out.push('> 📎 _[' + (p.content_type || 'attachment') + ']_');
    }
  }
  return out.join('\n\n');
}

function convoToMarkdown(convo) {
  const msgs = mainThread(convo);
  const models = new Set();
  const blocks = [];
  for (const m of msgs) {
    if (!m || !m.author) continue;
    if (m.metadata && m.metadata.is_visually_hidden_from_conversation) continue;
    const role = m.author.role;
    let body = contentToMd(m.content);
    const atts = (m.metadata && m.metadata.attachments) || [];
    const attLines = atts.map((a) => `> 📎 attachment: ${a.name || a.id || 'file'}${a.mime_type || a.mimeType ? ` (${a.mime_type || a.mimeType})` : ''}`);
    if (!body.trim() && !attLines.length) continue;
    if (role === 'system') continue; // usually hidden setup
    let label;
    if (role === 'user') label = 'You';
    else if (role === 'assistant') { const mdl = m.metadata && m.metadata.model_slug; if (mdl) models.add(mdl); label = `ChatGPT${mdl ? ` (${mdl})` : ''}`; }
    else if (role === 'tool') label = `🔧 Tool${m.author.name ? ` (${m.author.name})` : ''}`;
    else label = role;
    const when = hhmm(m.create_time);
    blocks.push(`### ${label}${when ? ` · ${when}` : ''}\n\n${[body, ...attLines].filter(Boolean).join('\n\n')}`);
  }
  if (!blocks.length) return null;
  const title = (convo.title || 'Untitled chat').replace(/\n/g, ' ').trim();
  const fm = [
    '---',
    `title: ${title.replace(/"/g, "'")}`,
    'type: conversation',
    'source: chatgpt',
    `conversation_id: ${convo.conversation_id || convo.id || ''}`,
    `created: ${iso(convo.create_time)}`,
    `updated: ${iso(convo.update_time)}`,
    `models: ${[...models].join(', ')}`,
    'tags: [chatgpt, history]',
    '---',
  ].join('\n');
  return { title, body: `${fm}\n\n# ${title}\n\n${blocks.join('\n\n')}\n`, updated: convo.update_time || 0, id: convo.conversation_id || convo.id || slug(title) };
}

export function importChatGPT(conversations) {
  if (!Array.isArray(conversations)) throw new Error('expected a ChatGPT conversations.json array');
  const dir = path.join(KDIR, CHATGPT_DIR);
  fs.mkdirSync(dir, { recursive: true });
  let added = 0, updated = 0, skipped = 0;
  for (const convo of conversations) {
    const doc = convoToMarkdown(convo);
    if (!doc) { skipped++; continue; }
    const file = path.join(dir, `${slug(doc.title)}-${String(doc.id).slice(0, 8)}.md`);
    if (fs.existsSync(file)) {
      // dedupe: only rewrite if this export's conversation is newer
      let prevUpdated = 0;
      try { const { fm } = parseFrontmatter(fs.readFileSync(file, 'utf8')); prevUpdated = fm.updated ? new Date(fm.updated).getTime() / 1000 : 0; } catch {}
      if (doc.updated && prevUpdated && doc.updated <= prevUpdated) { skipped++; continue; }
      fs.writeFileSync(file, doc.body); updated++;
    } else { fs.writeFileSync(file, doc.body); added++; }
  }
  return { added, updated, skipped, total: conversations.length };
}
