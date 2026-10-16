(() => {
  'use strict';

  /* ---------- Variables remplaçables dans les requêtes : {{nom}} ---------- */
  const VARS = {
    prefix:   { label: 'Préfixe des tables', def: 'ps_', clean: v => v.replace(/[^\w]/g, '') },
    id_lang:  { label: 'id_lang', def: '1', clean: v => v.replace(/\D/g, '') },
    id_shop:  { label: 'id_shop', def: '1', clean: v => v.replace(/\D/g, '') },
    langs:    { label: 'Langues', hint: 'ex. 1:fr, 2:en', def: '1:fr', clean: v => v.replace(/[^\w:,; -]/g, '') },
    // Saisies dans le générateur de kit (assets/js/kit.js), pas dans Réglages.
    theme:    { label: 'Nom du thème', def: 'mon-theme', hidden: true, clean: v => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/g, '-') },
    theme_parent: { label: 'Thème parent', def: 'hummingbird', hidden: true, clean: v => v.toLowerCase().replace(/[^a-z0-9_-]/g, '') },
    shop_url: { label: 'URL de la boutique', hint: 'pour construire les liens et les URL des images', def: 'https://www.ma-boutique.fr', clean: v => v.trim().replace(/\/+$/, ''), wide: true },
  };
  const TYPES = { sql: 'Requête', note: 'Note', snippet: 'Snippet', builder: 'Générateur' };
  // Catégories = ce qu'on veut faire. L'ordre ici est celui de l'accueil ; une catégorie inconnue passe à la fin.
  const CATS = [
    ['Exporter des données', 'Sortir clients, commandes ou produits dans un tableau'],
    ['Migrer une boutique', 'Préparer les fichiers d’import d’une autre boutique'],
    ['Comprendre PrestaShop', 'Comment c’est rangé dans la base et sur le disque'],
    ['Développer un thème', 'Thème enfant, compilation SCSS, outillage'],
  ];
  const catDesc = c => (CATS.find(x => x[0] === c) || [])[1] || '';
  const catRank = c => { const i = CATS.findIndex(x => x[0] === c); return i < 0 ? CATS.length : i; };
  // Où lancer la requête (champ `run` d'une fiche).
  const RUN = {
    bo: { label: 'Gestionnaire SQL du BO', long: 'À coller dans le Gestionnaire SQL du BO', side: 'Dans le back-office', title: 'Passe dans Paramètres avancés > Base de données > Gestionnaire SQL' },
    db: { label: 'phpMyAdmin, Adminer…', long: 'À lancer dans phpMyAdmin, Adminer…', side: 'Dans phpMyAdmin, Adminer…', title: 'Refusée par le Gestionnaire SQL du BO : à lancer dans phpMyAdmin, Adminer, DBeaver…' },
  };
  const VAR_RE = /\{\{(\w+)\}\}/g;

  /* ---------- Versions PrestaShop ----------
     `major` sert au filtre et aux "versions" des fiches ; `full` sert aux conditions
     -- @if ps >= x.y.z (version de la base source) et -- @if cible >= x.y.z (version de l'import). */
  const PS_VERSIONS = [
    { key: '1.6', major: '1.6', full: '1.6.1', label: '1.6' },
    { key: '1.7.0', major: '1.7', full: '1.7.2', label: '1.7.0 – 1.7.2' },
    { key: '1.7.3', major: '1.7', full: '1.7.4', label: '1.7.3 – 1.7.4' },
    { key: '1.7.5', major: '1.7', full: '1.7.6', label: '1.7.5 – 1.7.6' },
    { key: '1.7.7', major: '1.7', full: '1.7.8', label: '1.7.7 – 1.7.8' },
    { key: '8', major: '8', full: '8.2', label: '8.x' },
    { key: '9', major: '9', full: '9.0', label: '9.x' },
  ];
  const MAJORS = [['1.6', '1.6'], ['1.7', '1.7'], ['8', '8.x'], ['9', '9.x']];
  const majorLabel = k => (MAJORS.find(m => m[0] === k) || [k, k])[1];
  const verKey = v => String(v).trim().replace(/\.x$/i, '');
  const verInfo = k => PS_VERSIONS.find(p => p.key === k);
  const DIR_RE = /^\s*--\s*@(if|elif|else|endif)\b\s*(.*)$/;
  const HAS_DIR_RE = /^\s*--(?:\s*@if\b|!)/m;
  const HAS_TARGET_RE = /^\s*--\s*@(?:if|elif)\b.*\bcible\b/m;

  function cmpVer(a, b) {
    const x = a.split('.').map(Number), y = b.split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  // "ps >= 1.7.3", "cible < 9", "ps == 1.7" (égalité sur le préfixe), combinables avec "and".
  function testCond(cond, ctx) {
    return cond.split(/\s+(?:and|&&)\s+/i).every(part => {
      const m = part.trim().match(/^(ps|source|cible)\s*(>=|<=|!=|==|=|>|<)\s*([\d.]+)$/i);
      if (!m) return true;
      const [, who, op, v] = m;
      const full = /^cible$/i.test(who) ? ctx.cible : ctx.ps;
      if (/^(==|=|!=)$/.test(op)) {
        const same = cmpVer(full.split('.').slice(0, v.split('.').length).join('.'), v) === 0;
        return op === '!=' ? !same : same;
      }
      const c = cmpVer(full, v);
      return { '>=': c >= 0, '<=': c <= 0, '>': c > 0, '<': c < 0 }[op];
    });
  }
  const human = c => c.trim().replace(/\bps\b/gi, 'source').replace(/>=/g, '≥').replace(/<=/g, '≤');

  // Garde les lignes des branches qui correspondent aux versions ; `marks` signale les lignes conditionnelles.
  function applyVersion(src, ctx) {
    if (!ctx || !HAS_DIR_RE.test(src)) return { text: src, marks: [] };
    const out = [], marks = [], stack = [];
    for (const line of src.split('\n')) {
      if (/^\s*--!/.test(line)) continue; // commentaire réservé au fichier brut
      const d = line.match(DIR_RE);
      if (d) {
        const [, kw, cond] = d;
        const top = stack[stack.length - 1];
        if (kw === 'if') {
          const on = testCond(cond, ctx);
          stack.push({ on, done: on, label: human(cond), first: human(cond) });
        } else if (top && kw === 'elif') {
          top.on = !top.done && testCond(cond, ctx);
          top.done = top.done || top.on;
          top.label = human(cond);
        } else if (top && kw === 'else') {
          top.on = !top.done;
          top.done = true;
          top.label = `pas (${top.first})`;
        } else if (top && kw === 'endif') stack.pop();
        continue;
      }
      if (stack.every(s => s.on)) {
        out.push(line);
        marks.push(stack.map(s => s.label).join(' et '));
      }
    }
    return { text: out.join('\n'), marks };
  }

  const store = {
    get(k, d) { try { const v = localStorage.getItem('prestabook:' + k); return v === null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('prestabook:' + k, v); } catch { /* stockage indisponible */ } },
  };
  const vals = {};
  for (const k in VARS) vals[k] = store.get('var:' + k, VARS[k].def);
  const valueOf = k => (k in VARS ? (vals[k] || VARS[k].def) : null);
  const resolve = s => s.replace(VAR_RE, (m, k) => valueOf(k) ?? m);

  const stored = k => store.get(k, '') || null;
  const state = {
    entries: [], q: '', cat: null, run: null, tag: null,
    ver: MAJORS.some(m => m[0] === stored('ver')) ? stored('ver') : null, // filtre (version majeure)
    src: verInfo(stored('src')) ? stored('src') : null, // version de la base source
    dst: verInfo(stored('dst')) ? stored('dst') : null, // version de l'import cible
  };
  let blocks = [];
  let curCtx = null; // versions appliquées aux blocs de code de la fiche affichée

  const $ = (s, el = document) => el.querySelector(s);
  const view = $('#view');
  const sidebar = $('#sidebar');
  const input = $('#q');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const tokens = () => norm(state.q).split(/\s+/).filter(Boolean);

  const ICON = {
    copy: '<svg viewBox="0 0 24 24"><path d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1Zm3 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H10V7h9v14Z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5v2Zm14-9h-4V3H9v8H5l7 7 7-7Z"/></svg>',
    expand: '<svg viewBox="0 0 24 24"><path d="M12 5.8 15.2 9l1.4-1.4L12 3 7.4 7.6 8.8 9 12 5.8Zm0 12.4L8.8 15l-1.4 1.4L12 21l4.6-4.6-1.4-1.4-3.2 3.2Z"/></svg>',
  };

  /* ---------- Chargement ---------- */
  async function fetchText(url) {
    if (!url) return '';
    try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.text() : ''; } catch { return ''; }
  }

  async function load() {
    const res = await fetch('data/entries.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('data/entries.json introuvable');
    const list = await res.json();
    await Promise.all(list.map(async e => {
      e.tags = e.tags || [];
      e.keywords = e.keywords || [];
      e.versions = e.versions || [];
      e.notes = Array.isArray(e.notes) ? e.notes.join('\n') : (e.notes || '');
      e.content = await fetchText(e.file);
      if (e.doc) e.notes = [e.notes, await fetchText(e.doc)].filter(Boolean).join('\n\n');
      e.vkeys = e.versions.map(verKey);
      e.hasVariants = e.type === 'builder' || HAS_DIR_RE.test(e.content + '\n' + e.notes);
      e.hay = {
        title: norm(e.title), tags: norm(e.tags.concat(e.keywords, e.run ? RUN[e.run].label : []).join(' ')), cat: norm(e.category || ''),
        summary: norm(e.summary || ''), body: norm(e.content + '\n' + e.notes),
      };
      // Mots du titre, des tags et du résumé, pour tolérer les fautes de frappe.
      const words = s => [...new Set(s.split(/[^a-z0-9_]+/).filter(w => w.length > 2))];
      e.words = { title: words(e.hay.title), tags: words(e.hay.tags + ' ' + e.hay.cat), summary: words(e.hay.summary) };
    }));
    if (list.some(e => e.type === 'builder')) {
      const r = await fetch('data/schema-catalog.json', { cache: 'no-cache' });
      state.catalog = r.ok ? await r.json() : {};
    }
    state.entries = list;
  }

  /* ---------- Recherche ---------- */
  // Distance d'édition bornée (une inversion de deux lettres compte pour 1) : renvoie max + 1 dès que l'écart dépasse max.
  function editDist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let pp = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (pp && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], pp[j - 2] + 1);
        best = Math.min(best, cur[j]);
      }
      if (best > max) return max + 1;
      pp = prev;
      prev = cur;
    }
    return prev[b.length];
  }
  // « comande » ≈ « commandes » : on compare aussi au début du mot (préfixe de même longueur, ou +1).
  function near(w, list) {
    if (w.length < 4) return false;
    const max = w.length >= 7 ? 2 : 1;
    return list.some(x => editDist(w, x, max) <= max || editDist(w, x.slice(0, w.length), max) <= max
      || editDist(w, x.slice(0, w.length + 1), max) <= max);
  }
  function wordScore(e, w) {
    const h = e.hay;
    const s = (h.title.includes(w) ? 10 : 0) + (h.tags.includes(w) ? 5 : 0) + (h.cat.includes(w) ? 4 : 0)
      + (h.summary.includes(w) ? 3 : 0) + (h.body.includes(w) ? 1 : 0);
    if (s) return s;
    return near(w, e.words.title) ? 6 : near(w, e.words.tags) ? 3 : near(w, e.words.summary) ? 2 : 0;
  }
  // Onglet du générateur évoqué par la recherche (« export commande » → Commandes).
  function entityFromQuery() {
    if (!window.PBBuilder) return null;
    for (const w of tokens()) {
      for (const [k, x] of Object.entries(window.PBBuilder.ENTITIES)) {
        const l = norm(x.label);
        if (w.length >= 4 && (l.startsWith(w.slice(0, w.length - 1)) || near(w, [l]))) return k;
      }
    }
    return null;
  }
  function openEntry(e) {
    const ent = e.type === 'builder' && entityFromQuery();
    if (ent) { bstate.entity = ent; bSave(); }
    location.hash = '#/e/' + encodeURIComponent(e.id);
  }

  function results(t = tokens()) {
    const out = [];
    for (const e of state.entries) {
      if (state.cat && e.category !== state.cat) continue;
      if (state.run && e.run !== state.run) continue;
      if (state.tag && !e.tags.includes(state.tag)) continue;
      if (state.ver && e.vkeys.length && !e.vkeys.includes(state.ver)) continue;
      let score = 0;
      for (const w of t) {
        const s = wordScore(e, w);
        if (!s) { score = -1; break; }
        score += s;
      }
      if (score >= 0) out.push({ e, score });
    }
    if (t.length) out.sort((a, b) => b.score - a.score);
    return out.map(r => r.e);
  }

  // Surlignage insensible aux accents et à la casse.
  function mark(text, t) {
    text = String(text);
    if (!t.length) return esc(text);
    let ns = '';
    const map = [];
    for (let i = 0; i < text.length; i++) for (const ch of norm(text[i])) { ns += ch; map.push(i); }
    const hit = new Array(text.length).fill(false);
    for (const w of t) {
      let p = 0;
      while ((p = ns.indexOf(w, p)) !== -1) { for (let j = p; j < p + w.length; j++) hit[map[j]] = true; p += w.length; }
    }
    let out = '', open = false;
    for (let i = 0; i < text.length; i++) {
      if (hit[i] !== open) { out += open ? '</mark>' : '<mark>'; open = hit[i]; }
      out += esc(text[i]);
    }
    return out + (open ? '</mark>' : '');
  }

  // Ligne du contenu qui correspond, quand le titre/résumé ne suffit pas à expliquer le résultat.
  function snippetFor(e, t) {
    if (!t.length) return '';
    const head = norm(e.title + ' ' + e.summary + ' ' + e.tags.join(' '));
    if (t.every(w => head.includes(w))) return '';
    const lines = (e.content + '\n' + e.notes).split('\n').filter(l => !DIR_RE.test(l));
    const line = lines.find(l => t.some(w => norm(l).includes(w)));
    return line ? resolve(line.trim()) : '';
  }

  /* ---------- Coloration SQL ---------- */
  const KW = new Set(('select from where and or not in is null as on inner left right outer full cross join group by order having limit offset '
    + 'distinct case when then else end union all insert into values update set delete create table alter drop index primary key exists '
    + 'between like asc desc with interval if separator char unsigned signed session true false').split(' '));
  const TOKEN_RE = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.|'')*')|(`[^`]*`)|(\{\{\w+\}\})|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w$]*)/g;

  const varSpan = k => `<span class="tok-var" data-var="${k}" title="{{${k}}}">${esc(valueOf(k))}</span>`;
  const withVars = html => html.replace(VAR_RE, (m, k) => (k in VARS ? varSpan(k) : m));

  function highlightSql(src) {
    let out = '', last = 0, m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(src))) {
      out += withVars(esc(src.slice(last, m.index)));
      const txt = withVars(esc(m[0]));
      if (m[1]) out += `<span class="tok-com">${txt}</span>`;
      else if (m[2]) out += `<span class="tok-str">${txt}</span>`;
      else if (m[3]) out += `<span class="tok-id">${txt}</span>`;
      else if (m[4]) out += txt;
      else if (m[5]) out += `<span class="tok-num">${txt}</span>`;
      else {
        const isFn = /^\s*\(/.test(src.slice(TOKEN_RE.lastIndex));
        const low = m[0].toLowerCase();
        out += isFn ? `<span class="tok-fn">${txt}</span>` : KW.has(low) ? `<span class="tok-kw">${txt}</span>` : txt;
      }
      last = TOKEN_RE.lastIndex;
    }
    return out + withVars(esc(src.slice(last)));
  }

  function codeBlock(src, lang, name, at) {
    src = src.replace(/\s+$/, '');
    let idx = at;
    if (idx == null) idx = blocks.push({ src, lang, name }) - 1;
    else blocks[idx] = { src, lang, name };
    const { text, marks } = applyVersion(src, curCtx);
    const n = text.split('\n').length;
    const html = lang === 'sql' ? highlightSql(text) : withVars(esc(text));
    const gutter = Array.from({ length: n }, (_, i) => (marks[i]
      ? `<span class="is-ver" title="Ligne présente si ${esc(marks[i])}">${i + 1}</span>`
      : `<span>${i + 1}</span>`)).join('');
    const long = n > 28;
    return `<figure class="code${n < 4 ? ' code--short' : ''}" data-block="${idx}">
      <figcaption class="code__bar">
        <span class="code__name">${esc(name || lang || 'code')}</span>
        <span class="code__lines">· ${n} ligne${n > 1 ? 's' : ''}</span>
        <span class="code__actions">
          ${long ? `<button class="btn btn--ghost" data-act="expand" type="button" title="Déplier / replier">${ICON.expand}<span>Déplier</span></button>` : ''}
          ${name ? `<button class="btn btn--ghost" data-act="download" type="button" title="Télécharger">${ICON.down}<span>.${esc(lang || 'txt')}</span></button>` : ''}
          <button class="btn btn--primary" data-act="copy" type="button">${ICON.copy}<span>Copier</span></button>
        </span>
      </figcaption>
      <div class="code__body"><div class="code__gutter" aria-hidden="true">${gutter}</div><pre><code>${html}</code></pre></div>
    </figure>`;
  }

  /* ---------- Mini Markdown (titres, listes, tableaux, citations, code) ---------- */
  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => (/^(https?:|#|\/)/.test(u)
        ? `<a href="${u}" target="_blank" rel="noopener">${t}</a>`
        : /^[\w./-]+$/.test(u) && !u.includes('..')
          ? `<a href="${u}"${/\.zip$/.test(u) ? ' download class="dl-link"' : ''}>${t}</a>` : `<a href="#">${t}</a>`));
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${withVars(esc(codes[i]))}</code>`);
  }

  function md(src) {
    const L = src.replace(/\r/g, '').split('\n');
    const out = [];
    const special = l => /^(```|#{1,4}\s|>|\s*[-*]\s+|\s*\d+\.\s+|\|)/.test(l);
    let i = 0;
    while (i < L.length) {
      const l = L[i];
      if (/^```/.test(l)) {
        const lang = l.slice(3).trim().toLowerCase(), buf = [];
        i++;
        while (i < L.length && !/^```/.test(L[i])) buf.push(L[i++]);
        i++;
        // ```kit``` : générateur de kit téléchargeable (assets/js/kit.js)
        out.push(lang === 'kit' ? `<div class="kit" data-kit="${esc(buf.join('').trim())}"><p class="loading">Chargement du générateur…</p></div>`
          : codeBlock(buf.join('\n'), lang));
      } else if (/^#{1,4}\s/.test(l)) {
        const n = Math.min(l.match(/^#+/)[0].length + 1, 4);
        out.push(`<h${n}>${inline(l.replace(/^#+\s*/, ''))}</h${n}>`);
        i++;
      } else if (/^>/.test(l)) {
        const buf = [];
        while (i < L.length && /^>/.test(L[i])) buf.push(L[i++].replace(/^>\s?/, ''));
        out.push(`<div class="callout">${md(buf.join('\n'))}</div>`);
      } else if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
        const ordered = /^\s*\d+\./.test(l), buf = [];
        while (i < L.length && /^\s*([-*]|\d+\.)\s+/.test(L[i])) buf.push(L[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        const tag = ordered ? 'ol' : 'ul';
        // Une liste coupée par un bloc de code reprend à son numéro (« 4. » après le code).
        const start = ordered ? parseInt(l, 10) : 1;
        out.push(`<${tag}${start > 1 ? ` start="${start}"` : ''}>${buf.map(x => `<li>${inline(x)}</li>`).join('')}</${tag}>`);
      } else if (/^\|/.test(l)) {
        const rows = [];
        while (i < L.length && /^\|/.test(L[i])) rows.push(L[i++]);
        // Découpe sur les | hors `code`, pour pouvoir écrire `a|b` dans une cellule.
        const cells = r => {
          const out = [];
          let cur = '', inCode = false;
          for (const ch of r.trim().replace(/^\||\|$/g, '')) {
            if (ch === '`') inCode = !inCode;
            if (ch === '|' && !inCode) { out.push(cur.trim()); cur = ''; } else cur += ch;
          }
          return [...out, cur.trim()];
        };
        const body = rows.filter((r, k) => !(k === 1 && /^[\s|:-]+$/.test(r)));
        const [h, ...rest] = body;
        out.push(`<div class="table-wrap"><table><thead><tr>${cells(h).map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead>`
          + `<tbody>${rest.map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      } else if (!l.trim()) {
        i++;
      } else {
        const buf = [];
        while (i < L.length && L[i].trim() && !special(L[i])) buf.push(L[i++]);
        out.push(`<p>${inline(buf.join(' '))}</p>`);
      }
    }
    return out.join('\n');
  }

  /* ---------- Vues ---------- */
  function counts(key) {
    const c = new Map();
    for (const e of state.entries) for (const v of [].concat(e[key] || [])) c.set(v, (c.get(v) || 0) + 1);
    return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  }

  function renderSidebar() {
    const link = (kind, value, label, n, desc) =>
      `<button class="side-link${state[kind] === value ? ' is-active' : ''}" data-filter="${kind}" data-value="${esc(value ?? '')}" type="button"><span class="side-link__text">${esc(label)}${desc ? `<small>${esc(desc)}</small>` : ''}</span><span class="count">${n}</span></button>`;
    const cats = counts('category').sort((a, b) => catRank(a[0]) - catRank(b[0]));
    const runs = Object.keys(RUN).map(k => [k, state.entries.filter(e => e.run === k).length]).filter(r => r[1]);
    const tags = counts('tags');
    sidebar.innerHTML = `
      <div class="side-group">
        <p class="side-title">Que veux-tu faire ?</p>
        ${link('cat', null, 'Tout voir', state.entries.length)}
        ${cats.map(([c, n]) => link('cat', c, c, n, catDesc(c))).join('')}
      </div>
      ${runs.length ? `<div class="side-group">
        <p class="side-title">Où lancer la requête ?</p>
        ${runs.map(([k, n]) => link('run', k, RUN[k].side, n)).join('')}
      </div>` : ''}
      <div class="side-group side-group--tags">
        <p class="side-title">Sujet</p>
        <div class="tag-cloud">${tags.map(([t]) => `<button class="tag${state.tag === t ? ' is-active' : ''}" data-filter="tag" data-value="${esc(t)}" type="button">${esc(t)}</button>`).join('')}</div>
      </div>
      <div class="side-group side-group--ver">
        <label class="side-title" for="my-ver">Ma version de PrestaShop</label>
        <div class="field"><select id="my-ver" data-my-ver>
          <option value="">Je ne sais pas / toutes</option>
          ${MAJORS.map(([k, l]) => `<option value="${k}"${state.ver === k ? ' selected' : ''}>PrestaShop ${esc(l)}</option>`).join('')}
        </select></div>
        <small class="side-hint">Masque les fiches qui ne s'appliquent pas et pré-règle les requêtes.</small>
      </div>`;
  }

  const runPill = (e, long) => (e.run && RUN[e.run]
    ? `<span class="bo-pill bo-pill--${e.run === 'bo' ? 'ok' : 'ko'}" title="${esc(RUN[e.run].title)}">${e.run === 'bo' ? '✓ ' : ''}${esc(RUN[e.run][long ? 'long' : 'label'])}</span>` : '');
  const badge = type => `<span class="badge badge--${esc(type)}">${esc(TYPES[type] || type)}</span>`;
  const status = s => (s ? `<span class="status${/v[ée]rifier|todo|brouillon/i.test(s) ? ' status--warn' : ''}">${esc(s)}</span>` : '');
  // Versions affichées seulement quand une fiche ne couvre pas tout.
  const verNote = e => (e.vkeys.length && MAJORS.some(([k]) => !e.vkeys.includes(k)) ? `PS ${e.versions.join(' · ')}` : '');

  /* ---------- Assistant (assets/js/assistant.js) ----------
     La recherche est aussi lue comme une demande : « commandes ref, client depuis 01/01/2025 ».
     Le plan s'affiche au-dessus des résultats ; Entrée (ou le bouton) l'applique. */
  let curPlan = null;
  const frDate = d => d.split('-').reverse().join('/');
  const verLabelOf = k => (verInfo(k) || { label: k }).label;
  function assistPlan() {
    if (!state.q.trim() || !window.PBAssistant || !window.PBBuilder || !state.catalog) return null;
    try {
      return window.PBAssistant.parse(state.q, {
        builder: window.PBBuilder, catalog: state.catalog, entries: state.entries, langs: valueOf('langs'),
        version: verInfo(state.src) ? state.src : PS_VERSIONS[PS_VERSIONS.length - 1].key,
        search: q => results(norm(q).split(/\s+/).filter(Boolean)),
      });
    } catch (err) { console.error(err); return null; }
  }
  function assistHTML() {
    const p = curPlan = assistPlan();
    if (!p) return '';
    const chip = (txt, cls = '') => `<span class="assist__chip${cls}">${txt}</span>`;
    const vars = Object.entries(p.vars || {}).map(([k, v]) => chip(`${esc(VARS[k] ? VARS[k].label : k)} = <code>${esc(v)}</code>`, ' assist__chip--opt'));
    const notes = p.notes.length ? `<ul class="assist__notes">${p.notes.map(n => `<li class="${n.warn ? 'is-warn' : ''}">${esc(n.text)}</li>`).join('')}</ul>` : '';
    let title, chips = [];
    if (p.kind === 'entry') {
      const v = p.versions || {};
      title = `Ouvrir « ${esc(p.entry.title)} »`;
      if (v.src) chips.push(chip(v.dst ? `Base PS ${esc(verLabelOf(v.src))} → boutique PS ${esc(verLabelOf(v.dst))}` : `PS ${esc(verLabelOf(v.src))}`, ' assist__chip--opt'));
      chips = chips.concat(vars);
    } else {
      const E = window.PBBuilder.ENTITIES[p.entity];
      const n = p.fields.length;
      title = `Préparer l’export ${esc(E.label)}`;
      if (p.preset === 'preset') chips.push(chip('Sélection Essentiel', ' assist__chip--opt'));
      if (p.preset === 'all') chips.push(chip('Toutes les colonnes', ' assist__chip--opt'));
      chips = chips.concat(p.fields.map(x => chip(x.field.raw ? `<code>${esc(x.field.col)}</code><small>${esc(x.group.label)}</small>` : esc(x.field.label))));
      const fl = id => (E.filters.find(f => f.id === id) || { label: id }).label;
      for (const [id, on] of Object.entries(p.filterOn)) chips.push(chip(`${on ? '' : 'Sans le filtre : '}${esc(fl(id))}`, ' assist__chip--filter'));
      if (p.fv.from || p.fv.to) chips.push(chip(`Date de la commande ${p.fv.from ? 'du ' + frDate(p.fv.from) : ''}${p.fv.to ? ' au ' + frDate(p.fv.to) : ''}`, ' assist__chip--filter'));
      if (p.fv.state) chips.push(chip(`État actuel = ${esc(p.fv.state)}`, ' assist__chip--filter'));
      if (p.limit) chips.push(chip(`${esc(p.limit)} lignes max.`, ' assist__chip--filter'));
      if (p.version) chips.push(chip(`PS ${esc(verLabelOf(p.version))}`, ' assist__chip--opt'));
      if (p.headers) chips.push(chip(p.headers === 'tech' ? 'En-têtes : noms techniques' : 'En-têtes : libellés', ' assist__chip--opt'));
      if (p.method) chips.push(chip(p.method === 'sub' ? 'Sous-requêtes' : 'Jointures', ' assist__chip--opt'));
      chips = chips.concat(vars);
      if (!n && !p.preset) chips.unshift(chip('colonnes actuelles conservées', ' assist__chip--muted'));
      title += n || p.preset ? ` · ${p.preset ? (p.preset === 'all' ? 'tout' : 'Essentiel') + (n ? ' + ' + n : '') : n} colonne${n > 1 || p.preset ? 's' : ''}` : '';
    }
    return `<section class="assist" aria-label="Assistant">
      <div class="assist__head"><span class="assist__icon" aria-hidden="true">⚡</span><strong>${title}</strong>
        <button class="btn btn--primary assist__go" data-act="assist" type="button">Ouvrir <kbd>Entrée</kbd></button></div>
      ${chips.length ? `<div class="assist__chips">${chips.join('')}</div>` : ''}
      ${notes}
    </section>`;
  }
  function applyPlan(p) {
    for (const [k, v] of Object.entries(p.vars || {})) {
      if (!VARS[k]) continue;
      vals[k] = VARS[k].clean(String(v));
      store.set('var:' + k, vals[k]);
    }
    const setVer = (k, key) => { if (key && verInfo(key)) { state[k] = key; store.set(k, key); } };
    if (p.kind === 'entry') {
      setVer('src', p.versions && p.versions.src);
      setVer('dst', p.versions && (p.versions.dst || p.versions.src));
    } else {
      setVer('src', p.version);
      const ent = p.entity, E = window.PBBuilder.ENTITIES[ent], conf = bConf(ent);
      const ver = verInfo(state.src) ? state.src : PS_VERSIONS[PS_VERSIONS.length - 1].key;
      const ids = p.fields.map(x => x.id);
      if (p.method) conf.method = p.method;
      if (p.headers) conf.headers = p.headers;
      if (p.preset === 'preset') conf.selected = [...new Set(E.preset.concat(ids))];
      else if (p.preset === 'all') {
        const ok = usableFor(conf);
        conf.selected = window.PBBuilder.fieldsOf(ent, state.catalog, ver).flatMap(g => g.fields).filter(ok).map(f => f.id);
      } else if (ids.length) conf.selected = ids;
      // Filtres : ceux par défaut, corrigés par la demande ; dates, état et limite remplacés.
      const on = new Set(E.filters.filter(f => f.on && !f.input).map(f => f.id));
      for (const [id, v] of Object.entries(p.filterOn)) v ? on.add(id) : on.delete(id);
      conf.filters = [...on];
      conf.fv = { ...p.fv };
      conf.limit = p.limit || '';
      bstate.entity = ent;
      bSave();
    }
    input.value = state.q = '';
    const n = p.kind === 'builder' ? bConf(p.entity).selected.length : 0;
    location.hash = '#/e/' + encodeURIComponent(p.entry.id);
    toast(p.kind === 'builder' ? `Assistant : ${n} colonne${n > 1 ? 's' : ''} cochée${n > 1 ? 's' : ''}, filtres réglés` : 'Fiche ouverte avec tes réglages');
  }

  function card(e, t, showCat) {
    const snip = snippetFor(e, t), vn = verNote(e);
    return `<article class="card">
      <div class="card__top">${badge(e.type)}${runPill(e)}${showCat && e.category ? `<span>${esc(e.category)}</span>` : ''}${vn ? `<span class="versions">${esc(vn)}</span>` : ''}</div>
      <h3><a href="#/e/${encodeURIComponent(e.id)}">${mark(e.title, t)}</a></h3>
      ${e.summary ? `<p>${mark(e.summary, t)}</p>` : ''}
      ${snip ? `<div class="snippet">${mark(snip, t)}</div>` : ''}
      ${e.tags.length ? `<div class="tags">${e.tags.map(g => `<button class="tag${state.tag === g ? ' is-active' : ''}" data-filter="tag" data-value="${esc(g)}" type="button">${mark(g, t)}</button>`).join('')}</div>` : ''}
    </article>`;
  }

  function renderList() {
    const t = tokens();
    const assist = assistHTML();
    const list = results();
    const filters = [
      state.cat && ['cat', state.cat], state.run && ['run', RUN[state.run].side], state.tag && ['tag', state.tag], state.ver && ['ver', 'PS ' + majorLabel(state.ver)],
    ].filter(Boolean);
    const title = state.q ? `Résultats pour « ${esc(state.q)} »` : state.cat ? esc(state.cat) : 'Toutes les fiches';
    // Sans recherche ni catégorie : une section par catégorie, dans l'ordre de CATS.
    const sections = !state.q && !state.cat
      ? [...new Set(list.map(e => e.category || 'Divers'))].sort((a, b) => catRank(a) - catRank(b))
        .map(c => [c, list.filter(e => (e.category || 'Divers') === c)])
      : null;

    view.innerHTML = `
      ${assist}
      ${assist && !list.length ? '' : `<div class="list-head"><h1>${assist ? 'Fiches liées' : title}</h1><span class="meta">${list.length} fiche${list.length > 1 ? 's' : ''}</span></div>`}
      ${state.cat && catDesc(state.cat) ? `<p class="list-desc">${esc(catDesc(state.cat))}</p>` : ''}
      ${filters.length ? `<div class="active-filters">${filters.map(([k, v]) => `<button class="tag is-active" data-filter="${k}" data-value="" type="button" title="Retirer ce filtre">${esc(v)} ✕</button>`).join('')}<button class="chip-clear" data-act="clear" type="button">Tout effacer</button></div>` : ''}
      ${!list.length ? (assist ? '' : `<div class="empty"><strong>Aucune fiche trouvée</strong>Essaie un autre mot-clé, un nom de table (ex. <code>specific_price</code>) ou retire les filtres.</div>`)
        : sections ? sections.map(([c, l]) => `<section class="cat-section">
            <div class="cat-section__head"><h2><button data-filter="cat" data-value="${esc(c)}" type="button">${esc(c)}</button></h2>${catDesc(c) ? `<p>${esc(catDesc(c))}</p>` : ''}</div>
            <div class="grid">${l.map(e => card(e, t, false)).join('')}</div>
          </section>`).join('')
        : `<div class="grid">${list.map(e => card(e, t, !state.cat)).join('')}</div>`}`;
  }

  function renderDetail(id) {
    const e = state.entries.find(x => x.id === id);
    if (!e) {
      view.innerHTML = `<div class="empty"><strong>Fiche introuvable</strong><a href="#/">Retour à l'accueil</a></div>`;
      return;
    }
    blocks = [];
    // Versions appliquées : celles choisies si la fiche les couvre, sinon la plus récente couverte.
    const supported = PS_VERSIONS.filter(p => !e.vkeys.length || e.vkeys.includes(p.major));
    const latestOf = major => supported.filter(p => p.major === major).pop();
    const src = supported.find(p => p.key === state.src) || (state.ver && latestOf(state.ver)) || supported[supported.length - 1] || null;
    const hasTarget = HAS_TARGET_RE.test(e.content + '\n' + e.notes);
    const dst = hasTarget ? (supported.find(p => p.key === state.dst) || src) : src;
    curCtx = src ? { ps: src.full, cible: dst.full, srcLabel: src.label, dstLabel: dst.label, hasTarget } : null;
    // Liste déroulante groupée par version majeure (une seule option = pas de groupe).
    const select = (k, cur) => {
      const opts = p => `<option value="${p.key}"${p === cur ? ' selected' : ''}>${esc(p.major === p.label || p.label.endsWith('.x') ? 'PrestaShop ' + p.label : p.label)}</option>`;
      return `<select id="ver-${k}" data-ver-select="${k}">${MAJORS.map(([m, l]) => {
        const g = supported.filter(p => p.major === m);
        return g.length > 1 ? `<optgroup label="PrestaShop ${esc(l)}">${g.map(opts).join('')}</optgroup>` : g.map(opts).join('');
      }).join('')}</select>`;
    };
    const verField = e.hasVariants && src ? `<div class="pgroup">
        <p class="pgroup__title">Versions PrestaShop</p>
        ${hasTarget ? `<div class="ver-flow">
          <div class="field"><label for="ver-src">Base source</label>${select('src', src)}<small class="field__hint">où tu lances la requête</small></div>
          <span class="ver-flow__arrow" aria-hidden="true">→</span>
          <div class="field"><label for="ver-dst">Boutique cible</label>${select('dst', dst)}<small class="field__hint">où tu importes le CSV</small></div>
        </div>
        <p class="pgroup__foot">${src === dst
          ? '<span class="ver-badge">Même version des deux côtés</span>'
          : `<span class="ver-badge ver-badge--mig">Migration ${esc(src.label)} → ${esc(dst.label)}</span><button class="link-btn" data-act="same" data-key="${src.key}" type="button">Aligner la cible sur la source</button>`}</p>`
        : `<div class="field"><label for="ver-src">${e.type === 'builder' ? 'Version de la base (où tu lances la requête)' : 'Version'}</label>${select('src', src)}</div>`}
        ${e.type === 'builder'
          ? '<p class="pgroup__foot pgroup__foot--muted">Seuls les champs qui existent dans cette version sont proposés : les autres sont grisés.</p>'
          : '<p class="pgroup__foot pgroup__foot--muted"><span class="ln-sample">12</span> Les n° de ligne en rose changent selon la version (survol = condition).</p>'}
      </div>` : '';
    const offVer = state.ver && src && !supported.some(p => p.major === state.ver)
      ? `<p class="ver-warn">Cette fiche n'est pas marquée compatible PS ${esc(majorLabel(state.ver))} : affichage en PS ${esc(src.label)}.</p>` : '';
    bctx = e.type === 'builder' && src ? { version: src.key, label: src.label } : null;
    const body = bctx ? builderHTML()
      : e.type === 'note' ? `<div class="prose">${md(e.content)}</div>`
      : codeBlock(e.content, e.type === 'sql' ? 'sql' : (e.lang || ''), e.file ? e.file.split('/').pop() : e.id);
    const notes = e.notes ? `<div class="prose">${md(e.notes)}</div>` : '';
    const found = new Set([...(e.content + e.notes).matchAll(VAR_RE)].map(m => m[1]));
    const used = bctx ? ['prefix', 'id_shop', 'langs', 'shop_url'] : Object.keys(VARS).filter(k => found.has(k) && !VARS[k].hidden);
    const field = k => `<div class="field${VARS[k].wide ? ' field--wide' : ''}"><label for="v-${k}">${esc(VARS[k].label)}</label>
          <input id="v-${k}" data-var-input="${k}" value="${esc(vals[k])}" placeholder="${esc(VARS[k].def)}" spellcheck="false" autocomplete="off"${k === 'prefix' ? ' list="prefixes"' : ''}>${VARS[k].hint ? `<small class="field__hint">${esc(VARS[k].hint)}</small>` : ''}</div>`;
    const dbField = used.length ? `<div class="pgroup">
        <p class="pgroup__title">Ta boutique <button class="link-btn" data-act="reset" type="button">Réinitialiser</button></p>
        <div class="db-grid">${used.map(field).join('')}</div>
        <datalist id="prefixes">${recentPrefixes().map(p => `<option value="${esc(p)}">`).join('')}</datalist>
      </div>` : '';
    const params = dbField || verField ? `<section class="params" aria-label="Paramètres">
        <div class="params__head"><h2>Réglages</h2><small>La requête s'adapte à ces valeurs (mémorisées dans ce navigateur)</small></div>
        <div class="params__grid">${verField}${dbField}</div>
      </section>` : '';

    view.innerHTML = `<article class="detail">
      <nav class="crumb"><a href="#/">Accueil</a><span>/</span><button data-filter="cat" data-value="${esc(e.category || '')}" type="button">${esc(e.category || '')}</button></nav>
      <h1>${esc(e.title)}</h1>
      <div class="detail__meta">${badge(e.type)}${runPill(e, true)}${status(e.status)}${e.versions.length ? `<span class="versions">PS ${esc(e.versions.join(' · '))}</span>` : ''}${e.updated ? `<span class="versions">mis à jour le ${esc(e.updated.split('-').reverse().join('/'))}</span>` : ''}</div>
      ${e.summary ? `<p class="detail__summary">${esc(e.summary)}</p>` : ''}
      ${offVer}
      ${params}
      ${body}
      ${notes}
      ${e.tags.length ? `<div class="tags"><span class="tags__label">Autres fiches sur :</span>${e.tags.map(g => `<button class="tag" data-filter="tag" data-value="${esc(g)}" type="button">${esc(g)}</button>`).join('')}</div>` : ''}
    </article>`;
    document.title = `${e.title} · PrestaBook`;
    if (window.PBKit) view.querySelectorAll('[data-kit]').forEach(window.PBKit.mount);
  }


  /* ---------- Générateur de requêtes (Gestionnaire SQL) ---------- */
  const bstate = (() => { try { return JSON.parse(store.get('builder', '{}')) || {}; } catch { return {}; } })();
  let bctx = null; // { version, label } quand une fiche générateur est affichée
  const bSave = () => store.set('builder', JSON.stringify(bstate));
  const bEnt = () => (window.PBBuilder.ENTITIES[bstate.entity] ? bstate.entity : 'product');
  function bConf(ent) {
    const E = window.PBBuilder.ENTITIES[ent];
    if (!bstate[ent]) bstate[ent] = { selected: E.preset.slice(), filters: E.filters.filter(f => f.on).map(f => f.id), method: 'join', headers: 'label', limit: '' };
    return bstate[ent];
  }
  const bOpen = () => (bstate.open = bstate.open || {});
  // "1.7.3+", "≤ 8.x" ou liste, à partir des tranches où la colonne existe
  function verRange(vs) {
    const keys = PS_VERSIONS.map(p => p.key);
    if (!vs || vs.length === keys.length) return '';
    const idx = vs.map(k => keys.indexOf(k)).sort((a, b) => a - b);
    const contiguous = idx.every((v, i) => !i || v === idx[i - 1] + 1);
    const first = PS_VERSIONS[idx[0]].label.split('–')[0].trim();
    const last = PS_VERSIONS[idx[idx.length - 1]].label.split('–').pop().trim();
    if (contiguous && idx[idx.length - 1] === keys.length - 1) return `${first}+`;
    if (contiguous && idx[0] === 0) return `≤ ${last}`;
    return contiguous ? `${first} → ${last}` : vs.map(k => verInfo(k).label).join(', ');
  }
  // Filtres à valeur (date, nombre) : actifs dès qu'une valeur est saisie, sans case à cocher.
  function bFilters(E, conf) {
    const fv = conf.fv || {};
    return E.filters.filter(f => (f.input ? !!fv[f.id] : conf.filters.includes(f.id))).map(f => f.id);
  }
  function bOptions() {
    const ent = bEnt(), E = window.PBBuilder.ENTITIES[ent], conf = bConf(ent);
    return { version: bctx.version, selected: conf.selected, filters: bFilters(E, conf), filterValues: conf.fv || {}, method: conf.method, headers: conf.headers, limit: conf.limit, langs: valueOf('langs') };
  }
  const bGroups = ent => window.PBBuilder.fieldsOf(ent, state.catalog, bctx.version);
  const usableFor = conf => f => f.available && !(f.subOnly && conf.method !== 'sub');
  // Bandeau des champs cochés, dans l'ordre des colonnes de la requête (celui de la sélection).
  function pickedHTML() {
    const ent = bEnt(), conf = bConf(ent), sel = new Set(conf.selected), ok = usableFor(conf);
    const byId = new Map(bGroups(ent).flatMap(g => g.fields.map(f => [f.id, [f, g]])));
    const picked = conf.selected.map(id => byId.get(id)).filter(x => x && ok(x[0]));
    if (!picked.length) return '<p class="b-picked__empty">Aucune colonne pour l’instant : coche des champs ci-dessous ou pars de la sélection <strong>Essentiel</strong>.</p>';
    return picked.map(([f, g]) => `<button type="button" class="b-chip" data-b-act="unpick" data-id="${esc(f.id)}" title="${esc(g.label)} · cliquer pour retirer">${f.raw ? `<code>${esc(f.col)}</code>` : esc(f.label)}<span aria-hidden="true">✕</span></button>`).join('');
  }
  const isRaw = g => g.fields.some(f => f.raw);
  /* Compteurs : par groupe (cochés / cochables), par section, et « +N en clair » sur le groupe brut
     d'où vient un champ lisible : celui dont la jointure est utilisée par le champ, sinon la table principale. */
  function bCounts(ent) {
    const conf = bConf(ent), sel = new Set(conf.selected), ok = usableFor(conf);
    const joins = window.PBBuilder.ENTITIES[ent].joins;
    const groups = bGroups(ent), raws = groups.filter(isRaw);
    const main = raws.find(g => !g.join);
    const closure = list => { const out = new Set(); const add = j => { if (out.has(j) || !joins[j]) return; out.add(j); (joins[j].after || []).forEach(add); }; list.forEach(add); return out; };
    const c = { group: {}, rel: {}, cur: 0, raw: 0 };
    for (const g of groups) {
      const n = g.fields.filter(f => sel.has(f.id) && ok(f)).length;
      c.group[g.id] = [n, g.fields.filter(ok).length];
      c[isRaw(g) ? 'raw' : 'cur'] += n;
      if (isRaw(g)) continue;
      for (const f of g.fields.filter(x => sel.has(x.id) && ok(x))) {
        const used = closure(f.joins);
        const target = raws.find(r => r.join && used.has(r.join)) || main;
        if (target) c.rel[target.id] = (c.rel[target.id] || 0) + 1;
      }
    }
    return c;
  }
  const relText = n => (n ? `+${n} en clair` : '');
  const secText = n => `${n} coché${n > 1 ? 's' : ''}`;
  function dockText(cols) {
    const ent = bEnt();
    return `<strong>${cols}</strong> colonne${cols > 1 ? 's' : ''} · ${esc(window.PBBuilder.ENTITIES[ent].label)} · PS ${esc(bctx.label)}`;
  }
  function builderHTML() {
    const ent = bEnt(), E = window.PBBuilder.ENTITIES[ent], conf = bConf(ent), open = bOpen();
    const groups = bGroups(ent);
    const sel = new Set(conf.selected);
    const sub = conf.method === 'sub';
    const fieldHTML = f => {
      const off = !f.available || (f.subOnly && !sub);
      const why = !f.available ? `Absent en PS ${bctx.label}` : f.subOnly && !sub ? 'Disponible avec l’option avancée « sous-requêtes »' : '';
      const vr = f.raw ? verRange(f.versions) : '';
      return `<label class="b-field${off ? ' is-off' : ''}" data-search="${esc(norm(f.label + ' ' + (f.col || '') + ' ' + f.id))}"${why ? ` title="${esc(why)}"` : ''}>
        <input type="checkbox" data-b-field="${esc(f.id)}"${sel.has(f.id) && !off ? ' checked' : ''}${off ? ' disabled' : ''}>
        <span class="b-name">${f.raw ? `<code>${esc(f.col)}</code>` : esc(f.label)}</span>
        <span class="b-badges">${f.lang ? '<i class="b-badge b-badge--lang" title="Une colonne par langue choisie dans les réglages">par langue</i>' : ''}${f.agg ? '<i class="b-badge b-badge--agg" title="Plusieurs valeurs dans la même cellule, séparées par |">liste</i>' : ''}${vr ? `<i class="b-badge b-badge--ver" title="Existe en PS ${esc(vr)}">${esc(vr)}</i>` : ''}</span>
      </label>`;
    };
    const cnt = bCounts(ent);
    const groupHTML = g => {
      const [n, total] = cnt.group[g.id];
      const rel = cnt.rel[g.id] || 0;
      const isOpen = open[ent + ':' + g.id] ?? !isRaw(g);
      return `<details class="b-group" data-b-group="${esc(g.id)}"${isOpen ? ' open' : ''}>
        <summary><span class="b-gtitle">${esc(g.label)}</span>${g.table ? `<code class="b-gtable" title="Table ${esc(g.table)}">${esc(g.table)}</code>` : ''}<span class="b-gcount">${n} / ${total}</span>${isRaw(g) ? `<span class="b-grel" title="Champs « en clair » cochés plus haut qui viennent de cette table">${relText(rel)}</span>` : ''}
          <span class="b-gacts"><button type="button" class="link-btn" data-b-act="group-all" data-g="${esc(g.id)}">tout cocher</button><button type="button" class="link-btn" data-b-act="group-none" data-g="${esc(g.id)}">tout décocher</button></span></summary>
        <div class="b-fields">${g.fields.map(fieldHTML).join('')}</div>
      </details>`;
    };
    const radio = (name, v, label, hint) => `<label class="b-radio"><input type="radio" name="b-${name}" data-b-opt="${name}" value="${v}"${conf[name] === v ? ' checked' : ''}><span><strong>${label}</strong>${hint ? `<small>${hint}</small>` : ''}</span></label>`;
    const has = n => { const [t, c] = n.split('.'); return !!(state.catalog[t] && state.catalog[t][c] && state.catalog[t][c].includes(bctx.version)); };
    const fv = conf.fv || {};
    const valInput = (f, ph) => `<input class="b-fv" data-b-opt="fv" data-f="${f.id}" type="${f.input === 'date' ? 'date' : 'number'}" min="1" value="${esc(fv[f.id] || '')}"${ph ? ` placeholder="${ph}"` : ''} aria-label="${esc(f.label)}">`;
    // Filtres : cases (oui/non), puis plages de dates (deux filtres du même `range`) et valeurs.
    const done = new Set();
    const filterRows = E.filters.map(f => {
      if (done.has(f.id)) return '';
      const ok = (f.needs || []).every(has);
      if (f.range) {
        const pair = E.filters.filter(x => x.range === f.range);
        pair.forEach(x => done.add(x.id));
        return `<div class="b-frow"><span class="b-frow__label">${esc(f.range)}</span><span class="b-frow__ctl">${pair.map(x => `<span>${esc(x.short)}</span>${valInput(x)}`).join('')}${f.rangeHint ? `<small>${esc(f.rangeHint)}</small>` : ''}</span></div>`;
      }
      if (f.input) return `<label class="b-frow"><span class="b-frow__label">${esc(f.label)}</span><span class="b-frow__ctl">${valInput(f, 'tous')}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</span></label>`;
      return `<label class="b-check${ok ? '' : ' is-off'}"${ok ? '' : ` title="Pas disponible en PS ${esc(bctx.label)}"`}><input type="checkbox" data-b-opt="filter" value="${f.id}"${conf.filters.includes(f.id) && ok ? ' checked' : ''}${ok ? '' : ' disabled'}> ${esc(f.label)}</label>`;
    }).join('');
    const step = (n, title, hint, body, aside = '') => `<div class="b-step">
        <div class="b-step__head"><span class="b-num">${n}</span><div><h2>${title}</h2>${hint ? `<p>${hint}</p>` : ''}</div>${aside}</div>
        ${body}
      </div>`;
    const curated = groups.filter(g => !isRaw(g)), raw = groups.filter(isRaw);
    return `<section class="builder" id="b-panel">
      ${step(1, 'Quoi exporter ?', '', `<div class="b-entities" role="tablist">${Object.entries(window.PBBuilder.ENTITIES).map(([k, x]) =>
        `<button type="button" role="tab" data-b-entity="${k}" aria-selected="${k === ent}" class="${k === ent ? 'is-active' : ''}">${esc(x.label)}</button>`).join('')}</div>`)}
      ${step(2, 'Quelles colonnes ?', 'Une colonne cochée = une colonne du fichier exporté. Clique sur une colonne du bandeau pour la retirer.', `
        <div class="b-picked" id="b-picked">${pickedHTML()}</div>
        <input type="search" class="b-search" data-b-search placeholder="Chercher un champ (ex. ean, email, ville, meta…)" autocomplete="off" spellcheck="false">
        ${raw.length ? `<p class="b-subhead">Champs prêts à lire <span class="b-scount" data-sec="cur">${secText(cnt.cur)}</span><small>noms, libellés et listes à la place des identifiants</small></p>` : ''}
        <div class="b-groups">${curated.map(groupHTML).join('')}</div>
        ${raw.length ? `<div class="b-raw">
          <p class="b-subhead">Colonnes brutes de la base <span class="b-scount" data-sec="raw">${secText(cnt.raw)}</span><small>valeurs stockées telles quelles : identifiants, codes, montants</small></p>
          <div class="b-groups">${raw.map(groupHTML).join('')}</div>
        </div>` : ''}`,
        `<span class="b-presets"><button type="button" class="btn btn--soft" data-b-act="preset" title="Une sélection de colonnes courantes">Essentiel</button><button type="button" class="btn btn--soft" data-b-act="all">Tout</button><button type="button" class="btn btn--soft" data-b-act="none">Vider</button></span>`)}
      ${step(3, 'Quelles lignes ?', 'Laisse vide pour tout exporter.', `<div class="b-filters">${filterRows}
          <label class="b-frow"><span class="b-frow__label">Nombre maximum de lignes</span><span class="b-frow__ctl"><input type="number" min="0" step="100" class="b-fv" data-b-opt="limit" value="${esc(conf.limit || '')}" placeholder="toutes"></span></label>
        </div>`)}
      <details class="b-adv"${bstate.adv ? ' open' : ''}>
        <summary>Options avancées</summary>
        <div class="b-options">
          <div class="b-opt"><p class="pgroup__title">En-têtes des colonnes</p>
            ${radio('headers', 'label', 'Libellés', 'ex. « Marque », « name [fr] »')}
            ${radio('headers', 'tech', 'Noms techniques', 'ex. « manufacturer », « name_fr »')}</div>
          <div class="b-opt"><p class="pgroup__title">Calcul des listes (catégories, images…)</p>
            ${radio('method', 'join', 'Jointures (recommandé)', 'toujours acceptées par le Gestionnaire SQL')}
            ${radio('method', 'sub', 'Sous-requêtes', 'plus rapides sur un gros catalogue, mais refusées si le mode debug est actif')}</div>
        </div>
      </details>
      <div class="b-dock">
        <span class="b-dock__sum" id="b-dock-sum"></span>
        <button type="button" class="btn btn--soft" data-b-act="goto">Voir la requête ↓</button>
        <button type="button" class="btn btn--primary" data-b-act="copy">${ICON.copy}<span>Copier la requête</span></button>
      </div>
    </section>
    <div id="b-out">${builderOutput()}</div>`;
  }
  function builderOutput() {
    const ent = bEnt(), g = window.PBBuilder.generate(ent, state.catalog, bOptions());
    bctx.columns = g.columns;
    queueMicrotask(() => { const d = $('#b-dock-sum'); if (d) d.innerHTML = dockText(g.columns); });
    return `<div class="b-out-head"><h2>La requête</h2><p>À coller dans <strong>Paramètres avancés > Base de données > Gestionnaire SQL > Ajouter une requête SQL</strong>. Le bouton « Exporter » de la liste télécharge ensuite le CSV.</p><p class="b-out-sum">${dockText(g.columns)}${g.grouped ? ' · regroupée (GROUP BY)' : ''}</p></div>
      ${g.warnings.length ? `<ul class="b-warn">${g.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      ${codeBlock(g.sql, 'sql', `export-${ent}.sql`, 0)}`;
  }
  function refreshBuilder(full) {
    if (!bctx) return;
    if (full) {
      const panel = $('#b-panel'), out = $('#b-out');
      if (!panel) return;
      const q = (panel.querySelector('[data-b-search]') || {}).value || '';
      const tmp = document.createElement('div');
      tmp.innerHTML = builderHTML();
      panel.replaceWith(tmp.firstElementChild);
      out.replaceWith(tmp.lastElementChild);
      if (q) { const s = $('[data-b-search]'); s.value = q; filterFields(q); }
      return;
    }
    $('#b-out').innerHTML = builderOutput();
    $('#b-picked').innerHTML = pickedHTML();
    // compteurs des groupes et des sections
    const cnt = bCounts(bEnt());
    document.querySelectorAll('.b-group').forEach(d => {
      const id = d.dataset.bGroup, [n, total] = cnt.group[id] || [0, 0];
      d.querySelector('.b-gcount').textContent = `${n} / ${total}`;
      const rel = d.querySelector('.b-grel');
      if (rel) rel.textContent = relText(cnt.rel[id] || 0);
    });
    document.querySelectorAll('[data-sec]').forEach(x => { x.textContent = secText(cnt[x.dataset.sec]); });
  }
  function filterFields(q) {
    const t = norm(q.trim());
    document.querySelectorAll('.b-group').forEach(d => {
      let n = 0;
      d.querySelectorAll('.b-field').forEach(l => { const show = !t || l.dataset.search.includes(t); l.hidden = !show; if (show) n++; });
      d.hidden = !n;
      if (t && n) d.open = true;
    });
    const raw = $('.b-raw');
    if (raw) raw.hidden = ![...raw.querySelectorAll('.b-group')].some(d => !d.hidden);
    const none = !document.querySelector('.b-group:not([hidden])');
    let msg = $('.b-nomatch');
    if (none && !msg) { msg = Object.assign(document.createElement('p'), { className: 'b-nomatch' }); $('.b-search').after(msg); }
    if (msg) { msg.hidden = !none; msg.textContent = `Aucun champ ne contient « ${q.trim()} ».`; }
  }
  function builderClick(ev) {
    const tab = ev.target.closest('[data-b-entity]');
    if (tab) { bstate.entity = tab.dataset.bEntity; bSave(); refreshBuilder(true); return true; }
    const b = ev.target.closest('[data-b-act]');
    if (!b) return false;
    ev.preventDefault();
    const act = b.dataset.bAct;
    if (act === 'goto') { $('#b-out').scrollIntoView({ behavior: 'smooth', block: 'start' }); return true; }
    if (act === 'copy') { copyBlock(blocks[0], b); return true; }
    const ent = bEnt(), E = window.PBBuilder.ENTITIES[ent], conf = bConf(ent);
    const groups = bGroups(ent);
    const usable = usableFor(conf);
    const set = new Set(conf.selected);
    if (act === 'preset') conf.selected = E.preset.slice();
    else if (act === 'all') conf.selected = groups.flatMap(g => g.fields).filter(usable).map(f => f.id);
    else if (act === 'none') conf.selected = [];
    else if (act === 'unpick') { set.delete(b.dataset.id); conf.selected = [...set]; }
    else {
      const g = groups.find(x => x.id === b.dataset.g);
      g.fields.filter(usable).forEach(f => (act === 'group-all' ? set.add(f.id) : set.delete(f.id)));
      conf.selected = [...set];
    }
    bSave();
    refreshBuilder(true);
    return true;
  }
  function builderChange(ev) {
    const t = ev.target, conf = bctx && bConf(bEnt());
    if (!conf) return false;
    if (t.dataset.bField) {
      const set = new Set(conf.selected);
      t.checked ? set.add(t.dataset.bField) : set.delete(t.dataset.bField);
      conf.selected = [...set];
    } else if (t.dataset.bOpt === 'method' || t.dataset.bOpt === 'headers') {
      conf[t.dataset.bOpt] = t.value;
      if (t.dataset.bOpt === 'method') { bSave(); refreshBuilder(true); return true; }
    } else if (t.dataset.bOpt === 'filter') {
      const set = new Set(conf.filters);
      t.checked ? set.add(t.value) : set.delete(t.value);
      conf.filters = [...set];
    } else if (t.dataset.bOpt === 'limit') {
      conf.limit = t.value;
    } else if (t.dataset.bOpt === 'fv') {
      conf.fv = conf.fv || {};
      conf.fv[t.dataset.f] = t.value;
    } else return false;
    bSave();
    refreshBuilder(false);
    return true;
  }
  document.addEventListener('toggle', ev => {
    const d = ev.target;
    if (bctx && d.matches && d.matches('.b-group')) { bOpen()[bEnt() + ':' + d.dataset.bGroup] = d.open; bSave(); }
    else if (bctx && d.matches && d.matches('.b-adv')) { bstate.adv = d.open; bSave(); }
  }, true);

  function recentPrefixes() {
    try { return JSON.parse(store.get('prefixes', '[]')); } catch { return []; }
  }
  function rememberPrefix(p) {
    if (!p) return;
    store.set('prefixes', JSON.stringify([p, ...recentPrefixes().filter(x => x !== p)].slice(0, 8)));
  }

  function route() {
    const m = location.hash.match(/^#\/e\/(.+)$/);
    if (m) {
      renderDetail(decodeURIComponent(m[1]));
      window.scrollTo(0, 0);
    } else {
      bctx = null;
      document.title = 'PrestaBook';
      renderList();
    }
    renderSidebar();
  }
  const isDetail = () => location.hash.startsWith('#/e/');
  const showList = () => (isDetail() ? (location.hash = '#/') : route());

  /* ---------- Actions ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-visible'), 1800);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  document.addEventListener('click', async ev => {
    if (bctx && builderClick(ev)) return;
    const open = state.q && ev.target.closest('.card h3 a');
    if (open) {
      const e = state.entries.find(x => '#/e/' + encodeURIComponent(x.id) === open.getAttribute('href'));
      if (e) { ev.preventDefault(); openEntry(e); return; }
    }
    const f = ev.target.closest('[data-filter]');
    if (f) {
      const k = f.dataset.filter, v = f.dataset.value || null;
      // Depuis une fiche, un clic applique le filtre ; dans la liste, il le bascule.
      state[k] = state[k] === v && !isDetail() ? null : v;
      if (k === 'ver') store.set('ver', state.ver || '');
      return showList();
    }
    const a = ev.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'assist') { if (curPlan && state.q.trim()) applyPlan(curPlan); return; }
    if (act === 'clear') {
      state.cat = state.run = state.tag = state.ver = null;
      state.q = input.value = '';
      store.set('ver', '');
      return showList();
    }
    if (act === 'same') { setVersion('dst', a.dataset.key); return; }
    if (act === 'reset') {
      for (const k in VARS) { vals[k] = VARS[k].def; store.set('var:' + k, vals[k]); }
      document.querySelectorAll('[data-var-input]').forEach(i => { i.value = vals[i.dataset.varInput]; });
      refreshVars();
      return refreshBuilder(false);
    }
    const fig = a.closest('.code');
    const b = fig && blocks[fig.dataset.block];
    if (!b) return;
    const final = resolve(applyVersion(b.src, curCtx).text);
    if (act === 'expand') {
      fig.classList.toggle('is-expanded');
      a.querySelector('span').textContent = fig.classList.contains('is-expanded') ? 'Replier' : 'Déplier';
    } else if (act === 'copy') {
      copyBlock(b, a);
    } else if (act === 'download') {
      const url = URL.createObjectURL(new Blob([final + '\n'], { type: 'text/plain;charset=utf-8' }));
      Object.assign(document.createElement('a'), { href: url, download: b.name || 'export.' + (b.lang || 'txt') }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });

  async function copyBlock(b, btn) {
    if (!b) return;
    const final = resolve(applyVersion(b.src, curCtx).text);
    const verLabel = HAS_DIR_RE.test(b.src) && curCtx
      ? (curCtx.hasTarget ? ` (base PS ${curCtx.srcLabel} → import PS ${curCtx.dstLabel})` : ` (PS ${curCtx.srcLabel})`) : '';
    if (!(await copy(final))) return toast('Copie impossible dans ce navigateur');
    rememberPrefix(vals.prefix);
    const label = btn.querySelector('span').textContent;
    btn.classList.add('is-done');
    btn.innerHTML = `${ICON.check}<span>Copié</span>`;
    toast(b.src.includes('{{prefix}}') ? `Requête copiée avec le préfixe « ${valueOf('prefix')} »${verLabel}` : 'Copié dans le presse-papier');
    setTimeout(() => { btn.classList.remove('is-done'); btn.innerHTML = `${ICON.copy}<span>${esc(label)}</span>`; }, 1600);
  }

  function refreshVars() {
    document.querySelectorAll('.tok-var').forEach(s => { s.textContent = valueOf(s.dataset.var); });
  }

  // « Ma version » : filtre la liste et règle la base source des fiches sur la dernière tranche de cette version.
  function setMyVersion(major) {
    state.ver = major;
    store.set('ver', major || '');
    const latest = major && PS_VERSIONS.filter(p => p.major === major).pop();
    if (latest) { state.src = latest.key; store.set('src', latest.key); }
    const y = window.scrollY;
    route();
    window.scrollTo(0, y);
  }
  function setVersion(k, key) {
    state[k] = key;
    store.set(k, key);
    const y = window.scrollY;
    route();
    window.scrollTo(0, y);
  }
  document.addEventListener('change', ev => {
    if (ev.target.matches('[data-my-ver]')) return setMyVersion(ev.target.value || null);
    const k = ev.target.dataset && ev.target.dataset.verSelect;
    if (k) setVersion(k, ev.target.value);
    else if (bctx) builderChange(ev);
  });

  document.addEventListener('input', ev => {
    if (bctx && ev.target.matches('[data-b-search]')) return filterFields(ev.target.value);
    if (bctx && (ev.target.dataset.bOpt === 'limit' || ev.target.dataset.bOpt === 'fv')) return builderChange(ev);
    const k = ev.target.dataset && ev.target.dataset.varInput;
    if (!k) return;
    const clean = VARS[k].clean(ev.target.value);
    if (k !== 'shop_url' && clean !== ev.target.value) ev.target.value = clean;
    vals[k] = clean;
    store.set('var:' + k, clean);
    refreshVars();
    if (k === 'langs') refreshBuilder(false);
  });

  input.addEventListener('input', () => { state.q = input.value; showList(); });
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') {
      if (curPlan && state.q.trim()) { applyPlan(curPlan); input.blur(); return; }
      const first = results()[0];
      if (first) { openEntry(first); input.blur(); }
    } else if (ev.key === 'Escape') {
      if (input.value) { input.value = state.q = ''; showList(); } else input.blur();
    }
  });
  document.addEventListener('keydown', ev => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((ev.key === '/' && !typing) || (ev.key.toLowerCase() === 'k' && (ev.ctrlKey || ev.metaKey))) {
      ev.preventDefault();
      input.focus();
      input.select();
    }
  });

  $('#theme').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    store.set('theme', root.dataset.theme);
  });

  window.addEventListener('hashchange', route);
  load().then(route).catch(err => {
    view.innerHTML = `<div class="empty"><strong>Impossible de charger les fiches</strong>${esc(err.message)}<br>En local, lance un serveur : <code>python3 -m http.server</code></div>`;
  });
})();
