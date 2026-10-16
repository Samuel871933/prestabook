/* PrestaBook — générateur de kits téléchargeables (dossier kits/).
   Dans une note, un bloc ```kit``` contenant le nom d'un kit (ex. dev) affiche un formulaire :
   nom du thème et parent (variables {{theme}} et {{theme_parent}} des exemples de la fiche),
   config/theme.yml ou non, puis composants sans / vide / pré-rempli.
   Le zip <thème>/ (config/theme.yml + _dev/) est assemblé dans le navigateur à partir de
   kits/<kit>.json et des fichiers de kits/<kit>/, sans serveur. */
(function () {
  'use strict';

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cleanName = v => String(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  const RESERVED = ['hummingbird', 'classic'];
  const MODES = [['none', 'Sans'], ['empty', 'Vide'], ['prefill', 'Pré-rempli']];

  // Valeurs partagées avec les exemples de la fiche (variables de app.js, mémorisées sous prestabook:var:…).
  const varOf = (k, d) => { try { return localStorage.getItem('prestabook:var:' + k) || d; } catch { return d; } };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem('prestabook:kit:' + k)) || {}; } catch { return {}; } },
    set(k, v) { try { localStorage.setItem('prestabook:kit:' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
  };

  /* ---------- ZIP (sans compression) ---------- */
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = data => { let c = 0xFFFFFFFF; for (let i = 0; i < data.length; i++) c = CRC[(c ^ data[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : new Uint8Array(f.data);
      const crc = crc32(data);
      const head = new DataView(new ArrayBuffer(30));
      head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true);
      head.setUint16(8, 0, true); head.setUint16(10, time, true); head.setUint16(12, date, true);
      head.setUint32(14, crc, true); head.setUint32(18, data.length, true); head.setUint32(22, data.length, true);
      head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
      parts.push(head, name, data);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true); cd.setUint16(12, time, true); cd.setUint16(14, date, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
      cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
      central.push(cd, name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((n, p) => n + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }

  /* ---------- Assemblage ---------- */
  async function get(url, binary) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${url} introuvable (${r.status})`);
    return binary ? r.arrayBuffer() : r.text();
  }
  // config/theme.yml d'un thème enfant : parent, nom, et chargement du CSS et du JS compilés du _dev.
  function themeYml(opt) {
    return [
      `parent: ${opt.parent}`, `name: ${opt.theme}`, `display_name: ${opt.theme}`, 'version: 1.0.0',
      'assets:', '  use_parent_assets: true',
      '  css:', '    all:', '      - id: theme-dev', `        path: ${opt.root}/css/theme.css`, '        media: all', '        priority: 200',
      '  js:', '    all:', '      - id: theme-dev-js', `        path: ${opt.root}/js/theme.js`, '        priority: 200', '        position: bottom',
    ].join('\n') + '\n';
  }

  // Fichiers du kit : [{ name, data }] sous <thème>/ : config/theme.yml (option) et _dev/.
  async function build(kit, m, opt) {
    const base = `kits/${m.folder}/`;
    const comp = Object.fromEntries(m.components.map(c => [c.file, c]));
    const files = [];
    for (const path of m.files) {
      const c = comp[path], mode = c ? opt.modes[c.id] || 'empty' : null;
      if (mode === 'none') continue;
      let data = await get(c && mode === 'prefill' ? `kits/${c.prefill}` : base + path, m.binary.includes(path));
      if (path === 'css/theme.scss') {
        for (const x of m.components) {
          if ((opt.modes[x.id] || 'empty') !== 'none') continue;
          data = data.replace(new RegExp(`^@use "components/${x.id}";`, 'm'), `// @use "components/${x.id}";`);
        }
      }
      files.push({ name: `${opt.theme}/${m.root}/${path}`, data });
    }
    if (opt.yml) files.unshift({ name: `${opt.theme}/config/theme.yml`, data: themeYml({ ...opt, root: m.root }) });
    return files;
  }

  /* ---------- Formulaire ---------- */
  function render(el, kit, m) {
    const st = store.get(kit);
    const opt = { modes: { ...(st.modes || {}) }, yml: st.yml !== false };
    const save = () => store.set(kit, opt);
    const modeOf = id => opt.modes[id] || 'empty';
    const theme = () => cleanName(varOf('theme', 'mon-theme'));
    el.innerHTML = `
      <div class="kit__grid">
        <div class="field"><label for="kit-theme-${kit}">Nom du dossier du thème</label>
          <input id="kit-theme-${kit}" data-var-input="theme" value="${esc(theme())}" spellcheck="false" autocomplete="off">
          <small class="field__hint">le dossier dans <code>themes/</code>, existant ou à créer</small></div>
        <div class="field"><label for="kit-parent-${kit}">Thème parent</label>
          <input id="kit-parent-${kit}" data-var-input="theme_parent" value="${esc(varOf('theme_parent', 'hummingbird'))}" list="kit-parents-${kit}" spellcheck="false" autocomplete="off">
          <datalist id="kit-parents-${kit}"><option value="hummingbird"><option value="classic"></datalist>
          <small class="field__hint">hummingbird, classic ou le dossier d'un autre thème</small></div>
      </div>
      <div class="kit__opts">
        <label class="b-check"><input type="checkbox" data-kit-yml${opt.yml ? ' checked' : ''}> Inclure <code>config/theme.yml</code> (nouveau thème enfant)</label>
        <small class="field__hint">Il déclare le parent et charge le CSS et le JS du <code>_dev</code>. Décoche si le thème existe déjà : le zip ne contient que son <code>_dev</code>.</small>
      </div>
      <div class="kit__head"><p class="pgroup__title">Composants du _dev</p>
        <span class="kit__all"><button type="button" class="link-btn" data-kit-all="prefill">tout pré-remplir</button><button type="button" class="link-btn" data-kit-all="empty">tout vide</button></span></div>
      <div class="kit__comps">${m.components.map(c => `<div class="kit__comp">
          <div class="kit__label"><strong>${esc(c.label)}</strong><small>${esc(c.desc)}</small></div>
          <div class="kit__modes" role="radiogroup" aria-label="${esc(c.label)}">${MODES.map(([v, l]) =>
            `<label><input type="radio" name="kit-${kit}-${c.id}" value="${v}" data-kit-mode="${c.id}"${modeOf(c.id) === v ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>
        </div>`).join('')}</div>
      <p class="kit__hint"><strong>Vide</strong> : les sélecteurs de Hummingbird et de Classic sont posés, à remplir. <strong>Pré-rempli</strong> : un style de départ, avec les couleurs de <code>_variables.scss</code>. <strong>Sans</strong> : pas de fichier.</p>
      <div class="kit__foot"><span class="kit__msg" aria-live="polite"></span>
        <button type="button" class="btn btn--primary" data-kit-go><span></span></button></div>`;
    const msg = el.querySelector('.kit__msg'), go = el.querySelector('[data-kit-go]');
    const file = () => `${theme() || 'theme'}.zip`;
    const refresh = () => {
      const t = theme();
      const bad = !t ? 'Donne le nom du dossier du thème.' : RESERVED.includes(t) ? `Ne modifie pas « ${t} » directement : crée un thème enfant.` : '';
      const n = m.components.filter(c => modeOf(c.id) === 'prefill').length;
      msg.textContent = bad || `${t}/${opt.yml ? 'config/theme.yml + ' : ''}_dev/ · ${n ? `${n} composant${n > 1 ? 's' : ''} pré-rempli${n > 1 ? 's' : ''}` : 'composants vides'}`;
      msg.classList.toggle('is-warn', !!bad);
      go.disabled = !!bad;
      go.querySelector('span').textContent = `Télécharger ${file()}`;
    };
    // La saisie est enregistrée par app.js (variables) ; ici on rafraîchit le bouton.
    el.addEventListener('input', ev => { if (ev.target.dataset.varInput) setTimeout(refresh); });
    el.addEventListener('change', ev => {
      if (ev.target.matches('[data-kit-yml]')) { opt.yml = ev.target.checked; save(); refresh(); return; }
      const id = ev.target.dataset.kitMode;
      if (id) { opt.modes[id] = ev.target.value; save(); refresh(); }
    });
    el.addEventListener('click', async ev => {
      const all = ev.target.closest('[data-kit-all]');
      if (all) {
        m.components.forEach(c => { opt.modes[c.id] = all.dataset.kitAll; });
        el.querySelectorAll('[data-kit-mode]').forEach(r => { r.checked = r.value === all.dataset.kitAll; });
        save(); refresh(); return;
      }
      if (!ev.target.closest('[data-kit-go]') || go.disabled) return;
      go.disabled = true;
      msg.textContent = 'Préparation du zip…';
      try {
        const blob = zip(await build(kit, m, { ...opt, theme: theme(), parent: cleanName(varOf('theme_parent', 'hummingbird')) || 'hummingbird' }));
        const url = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), { href: url, download: file() }).click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        refresh();
        msg.textContent = `${file()} téléchargé : dézippe-le dans themes/.`;
      } catch (err) {
        refresh();
        msg.textContent = `Échec : ${err.message}`;
        msg.classList.add('is-warn');
      }
    });
    refresh();
  }

  async function mount(el) {
    if (el.dataset.kitReady) return;
    el.dataset.kitReady = '1';
    const kit = el.dataset.kit;
    try { render(el, kit, JSON.parse(await get(`kits/${kit}.json`))); }
    catch (err) { el.innerHTML = `<p class="kit__msg is-warn">Kit « ${esc(kit)} » indisponible : ${esc(err.message)}</p>`; }
  }

  window.PBKit = { mount, zip, build, cleanName };
})();
