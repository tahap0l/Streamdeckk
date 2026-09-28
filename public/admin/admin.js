'use strict';
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  };

  // ---------- API ----------
  async function api(method, url, body, raw) {
    const opts = { method, headers: { 'X-StreamDeckk': '1' } };
    if (raw) { opts.body = raw; opts.headers['Content-Type'] = 'application/octet-stream'; }
    else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Hata ${res.status}`);
    return data;
  }

  let toastTimer;
  function toast(text, err = false) {
    const t = $('#toast');
    t.textContent = text;
    t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), err ? 4000 : 2000);
  }

  // ---------- Durum ----------
  const state = { cfg: null, pageIdx: 0, sel: null, sounds: [] };
  const uid = () => Math.random().toString(36).slice(2, 12);
  const page = () => state.cfg.pages[state.pageIdx];
  const slots = () => state.cfg.grid.cols * state.cfg.grid.rows;

  // ---------- Kaydetme ----------
  let saveTimer;
  function changed({ rerender = true } = {}) {
    $('#save-state').textContent = 'Kaydediliyor…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 350);
    if (rerender) renderKeysTab();
  }
  async function save() {
    try {
      const r = await api('PUT', '/api/config', state.cfg);
      $('#save-state').textContent = 'Kaydedildi ✓';
      if (r.restartNeeded) toast("Port değişti: StreamDeckk'i yeniden başlat ve QR'ı tekrar okut.");
    } catch (e) {
      $('#save-state').textContent = 'Kaydedilemedi!';
      toast(e.message, true);
    }
  }

  // ---------- Sekmeler ----------
  function showTab(name) {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
    if (name === 'connect') loadConnect();
    if (name === 'sounds') loadSounds();
    if (name === 'settings') renderSettings();
    history.replaceState(null, '', '#' + name);
  }
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ========== TUŞLAR ==========
  function renderKeysTab() {
    renderPageList();
    renderPreview();
    renderEditor();
  }

  function renderPageList() {
    const ul = $('#page-list');
    ul.textContent = '';
    state.cfg.pages.forEach((p, i) => {
      const count = p.buttons.filter(Boolean).length;
      ul.append(h('li', {
        class: i === state.pageIdx ? 'active' : '',
        onclick: () => { state.pageIdx = i; state.sel = null; renderKeysTab(); },
      },
      h('span', { class: 'pname' }, p.name),
      h('span', { class: 'pcount' }, count),
      h('span', { class: 'acts' },
        h('button', { class: 'icon-btn', title: 'Yukarı', disabled: i === 0, onclick: (e) => { e.stopPropagation(); movePage(i, -1); } }, '↑'),
        h('button', { class: 'icon-btn', title: 'Aşağı', disabled: i === state.cfg.pages.length - 1, onclick: (e) => { e.stopPropagation(); movePage(i, 1); } }, '↓'),
        h('button', { class: 'icon-btn', title: 'Yeniden adlandır', onclick: (e) => { e.stopPropagation(); renamePage(i); } }, '✎'),
        h('button', { class: 'icon-btn', title: 'Sil', disabled: state.cfg.pages.length === 1, onclick: (e) => { e.stopPropagation(); deletePage(i); } }, '🗑'),
      )));
    });
  }

  function movePage(i, d) {
    const pages = state.cfg.pages;
    [pages[i], pages[i + d]] = [pages[i + d], pages[i]];
    if (state.pageIdx === i) state.pageIdx = i + d;
    else if (state.pageIdx === i + d) state.pageIdx = i;
    changed();
  }
  function renamePage(i) {
    const name = prompt('Sayfa adı:', state.cfg.pages[i].name);
    if (name && name.trim()) { state.cfg.pages[i].name = name.trim().slice(0, 40); changed(); }
  }
  function deletePage(i) {
    const p = state.cfg.pages[i];
    if (!confirm(`"${p.name}" sayfası ve içindeki ${p.buttons.filter(Boolean).length} tuş silinsin mi?`)) return;
    state.cfg.pages.splice(i, 1);
    state.pageIdx = Math.min(state.pageIdx, state.cfg.pages.length - 1);
    state.sel = null;
    changed();
  }
  $('#page-add').addEventListener('click', () => {
    const name = prompt('Yeni sayfanın adı:', `Sayfa ${state.cfg.pages.length + 1}`);
    if (!name || !name.trim()) return;
    state.cfg.pages.push({ id: uid(), name: name.trim().slice(0, 40), buttons: Array(slots()).fill(null) });
    state.pageIdx = state.cfg.pages.length - 1;
    state.sel = null;
    changed();
  });

  function actionTag(b) {
    if (b.action?.kind === 'page') return '›';
    if (b.type === 'toggle') return '◐';
    return '';
  }

  function renderPreview() {
    const { cols } = state.cfg.grid;
    const grid = $('#pv-grid');
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    grid.textContent = '';
    $('#pv-page-name').textContent = page().name;
    page().buttons.forEach((b, i) => {
      const el = h('div', {
        class: 'pv-key' + (b ? '' : ' empty') + (state.sel === i ? ' selected' : '') + (b && !b.emoji ? ' no-e' : ''),
        draggable: !!b,
        onclick: () => {
          if (!b) {
            page().buttons[i] = { id: uid(), emoji: '⭐', label: 'Yeni tuş', type: 'normal', action: { kind: 'hotkey', keys: '' } };
            state.sel = i;
            changed();
            setTimeout(() => $('#ed-label')?.select(), 0);
            return;
          }
          state.sel = i;
          renderPreview();
          renderEditor();
        },
        ondragstart: (e) => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; },
        ondragover: (e) => { e.preventDefault(); el.classList.add('drag-over'); },
        ondragleave: () => el.classList.remove('drag-over'),
        ondrop: (e) => {
          e.preventDefault();
          el.classList.remove('drag-over');
          const from = Number(e.dataTransfer.getData('text/plain'));
          if (Number.isNaN(from) || from === i) return;
          const btns = page().buttons;
          [btns[from], btns[i]] = [btns[i], btns[from]];
          if (state.sel === from) state.sel = i;
          else if (state.sel === i) state.sel = from;
          changed();
        },
      });
      if (b) {
        const tag = actionTag(b);
        if (tag) el.append(h('span', { class: 'tag' }, tag));
        if (b.emoji) el.append(h('span', { class: 'e' }, b.emoji));
        el.append(h('span', { class: 'l' }, b.label));
      }
      grid.append(el);
    });
    const dots = $('#pv-dots');
    dots.textContent = '';
    if (state.cfg.pages.length > 1) state.cfg.pages.forEach((_, i) => dots.append(h('i', { class: i === state.pageIdx ? 'active' : '' })));
  }

  // ---------- Düzenleyici ----------
  const EMOJIS = ('🎙️ 🔇 🎤 🎧 📷 🚫 🎬 🎮 🕹️ 💬 ⏸️ ▶️ ⏹️ ⏺️ 🔴 🟣 💜 🖤 🔔 🎉 📯 🤐 😂 🤣 👏 🔥 💯 ❤️ 👋 🎁 ' +
    '🙏 😎 😱 😭 🥳 👍 👎 💀 🤡 👀 🎵 🎶 🔊 🔉 🔈 🔕 🏠 ➡️ ⬅️ ⭐ ✨ ⚡ 💥 💣 🎯 🏆 🥇 🖥️ 📢 📣 ' +
    '🎹 🥁 🎺 🐐 🤖 💤 🍿 ☕ 🌙 ☀️ 🌈 🎲 🃏 🧠 💰 💎 🚀 🛑 ✅ ❌ ❓ ❗ 🔁 🔄 ⏭️ ⏮️ 📌 🧹 🎨 🦄').split(' ');

  const KIND_LABELS = {
    hotkey: '⌨️ Klavye kısayolu',
    text: '✍️ Metin yaz',
    sound: '🔊 Ses çal',
    stopSounds: '⏹️ Tüm sesleri durdur',
    volumeUp: '🔊 Soundboard sesi +10',
    volumeDown: '🔉 Soundboard sesi −10',
    page: '📄 Sayfaya git',
    none: '— Hiçbir şey',
  };

  const SPECIAL_KEYS = [
    ['', 'Özel tuş ekle…'],
    ...Array.from({ length: 12 }, (_, i) => [`f${13 + i}`, `F${13 + i} (klavyede yok, çakışmaz)`]),
    ['mediaplaypause', 'Medya: Oynat/Duraklat'], ['medianext', 'Medya: Sonraki'], ['mediaprev', 'Medya: Önceki'],
    ['volumemute', 'Sistem: Sesi kapat'], ['volumeup', 'Sistem: Ses +'], ['volumedown', 'Sistem: Ses −'],
    ['printscreen', 'Print Screen'],
  ];

  const MOD_ORDER = ['ctrl', 'shift', 'alt', 'win'];
  const PRETTY = { ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', win: 'Win', esc: 'Esc', up: '↑', down: '↓', left: '←', right: '→', space: 'Boşluk', enter: 'Enter', backspace: '⌫', mediaplaypause: '⏯ Medya', medianext: '⏭ Sonraki', mediaprev: '⏮ Önceki', volumemute: '🔇 Sessiz', volumeup: '🔊 Ses+', volumedown: '🔉 Ses−' };
  const pretty = (k) => PRETTY[k] || (k.length === 1 ? k.toUpperCase() : k.replace(/^f(\d+)$/, 'F$1').replace(/^numpad/, 'Num '));

  function codeToKey(code) {
    let m;
    if ((m = code.match(/^Key([A-Z])$/))) return m[1].toLowerCase();
    if ((m = code.match(/^Digit(\d)$/))) return m[1];
    if ((m = code.match(/^F(\d+)$/))) return 'f' + m[1];
    if ((m = code.match(/^Numpad(\d)$/))) return 'numpad' + m[1];
    const map = {
      Space: 'space', Enter: 'enter', NumpadEnter: 'enter', Tab: 'tab', Backspace: 'backspace', Delete: 'delete', Insert: 'insert',
      Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      NumpadAdd: 'numpadadd', NumpadSubtract: 'numpadsubtract', NumpadMultiply: 'numpadmultiply', NumpadDivide: 'numpaddivide', NumpadDecimal: 'numpaddecimal',
      Escape: 'esc', PrintScreen: 'printscreen', Pause: 'pause',
      MediaPlayPause: 'mediaplaypause', MediaTrackNext: 'medianext', MediaTrackPrevious: 'mediaprev',
      AudioVolumeMute: 'volumemute', AudioVolumeUp: 'volumeup', AudioVolumeDown: 'volumedown',
    };
    if (map[code]) return map[code];
    if (/^(Semicolon|Equal|Comma|Minus|Period|Slash|Backquote|BracketLeft|Backslash|BracketRight|Quote|IntlBackslash)$/.test(code)) return code.toLowerCase();
    return null;
  }

  function renderEditor() {
    const form = $('#editor-form');
    const b = state.sel != null ? page().buttons[state.sel] : null;
    $('#editor-empty').hidden = !!b;
    form.hidden = !b;
    form.textContent = '';
    if (!b) return;

    const upd = (fn, rerender = false) => { fn(); changed({ rerender: false }); renderPreview(); if (rerender) renderEditor(); };

    // Görünüm
    const palette = h('div', { class: 'emoji-palette' });
    let paletteTarget = null;
    EMOJIS.forEach((e) => palette.append(h('button', {
      type: 'button',
      onclick: () => { if (paletteTarget) { paletteTarget.value = e; paletteTarget.dispatchEvent(new Event('input')); } palette.classList.remove('open'); },
    }, e)));
    const emojiField = (value, onInput) => {
      const inp = h('input', {
        type: 'text', class: 'emoji-input', value: value || '', maxlength: 16, title: 'Emoji (Win + . ile de seçebilirsin)',
        oninput: () => onInput(inp.value.trim()),
        onfocus: () => { paletteTarget = inp; palette.classList.add('open'); },
      });
      return inp;
    };

    form.append(h('div', { class: 'ed-section' },
      h('div', { class: 'ed-title' }, 'Görünüm'),
      h('div', { class: 'row' },
        h('label', { class: 'field' }, h('span', {}, 'Emoji'), emojiField(b.emoji, (v) => upd(() => (b.emoji = v)))),
        h('label', { class: 'field grow' }, h('span', {}, 'Yazı'),
          h('input', { type: 'text', id: 'ed-label', value: b.label, maxlength: 40, oninput: (e) => upd(() => (b.label = e.target.value)) })),
      ),
      palette,
      h('div', { class: 'field' }, h('span', {}, 'Tuş türü'),
        h('div', { class: 'seg' },
          h('button', { type: 'button', class: b.type !== 'toggle' ? 'active' : '', onclick: () => upd(() => { b.type = 'normal'; delete b.offAction; }, true) }, 'Normal'),
          h('button', { type: 'button', class: b.type === 'toggle' ? 'active' : '', onclick: () => upd(() => { b.type = 'toggle'; }, true) }, 'Aç / Kapa'),
        )),
      b.type === 'toggle' && h('div', {},
        h('p', { class: 'hint', style: 'margin:0 0 8px' }, 'Açıkken tuş parlar ve aşağıdaki görünümü alır. Durum bozulursa telefonda tuşa uzun bas (kısayol göndermeden düzelir).'),
        h('div', { class: 'row' },
          h('label', { class: 'field' }, h('span', {}, 'Açık emoji'), emojiField(b.onEmoji, (v) => upd(() => (b.onEmoji = v)))),
          h('label', { class: 'field grow' }, h('span', {}, 'Açık yazı'),
            h('input', { type: 'text', value: b.onLabel || '', maxlength: 40, placeholder: b.label, oninput: (e) => upd(() => (b.onLabel = e.target.value)) })),
        )),
    ));

    // Aksiyon
    const actSec = h('div', { class: 'ed-section' }, h('div', { class: 'ed-title' }, b.type === 'toggle' ? 'Açarken yapılacak' : 'Basınca yapılacak'));
    actSec.append(actionEditor(b.action, (a) => upd(() => (b.action = a))));
    if (b.type === 'toggle') {
      const sub = h('div', { class: 'sub-action' });
      if (b.offAction) sub.append(actionEditor(b.offAction, (a) => upd(() => (b.offAction = a))));
      actSec.append(
        h('label', { class: 'check', style: 'margin-top:12px' },
          h('input', {
            type: 'checkbox', checked: !!b.offAction,
            onchange: (e) => upd(() => { if (e.target.checked) b.offAction = { kind: 'hotkey', keys: '' }; else delete b.offAction; }, true),
          }),
          'Kapatırken farklı bir şey yap'),
        b.offAction ? sub : h('p', { class: 'hint', style: 'margin:0' }, 'Kapalıyken de aynı işlem yapılır (ör. Live Studio\'daki aynı mikrofon kısayolu).'),
      );
    }
    form.append(actSec);

    // Alt düğmeler
    form.append(h('div', { class: 'ed-section ed-actions' },
      h('button', { class: 'btn', onclick: () => testAction(b.action, 0) }, '▶ Test et'),
      h('button', { class: 'btn ghost', title: 'Kısayolu başka bir programda denemek için: 3 saniye içinde o pencereye tıkla', onclick: () => testAction(b.action, 3) }, '⏱ 3 sn sonra'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn ghost small', title: 'Kopyasını boş bir kareye koy', onclick: duplicateButton }, '⧉'),
      h('button', { class: 'btn danger small', onclick: deleteButton }, 'Sil'),
    ));
  }

  function actionEditor(action, onChange) {
    const a = { ...action };
    const wrap = h('div');
    const emit = () => onChange({ ...a });

    const kindSel = h('select', {
      onchange: (e) => {
        const kind = e.target.value;
        for (const k of Object.keys(a)) delete a[k];
        a.kind = kind;
        if (kind === 'hotkey') a.keys = '';
        if (kind === 'text') { a.text = ''; a.enter = true; }
        if (kind === 'sound') { a.sound = state.sounds[0]?.name || ''; a.volume = 100; }
        if (kind === 'page') a.pageId = state.cfg.pages.find((p) => p.id !== page().id)?.id || '';
        emit();
        renderFields();
      },
    }, Object.entries(KIND_LABELS).map(([k, l]) => h('option', { value: k, selected: a.kind === k }, l)));
    const fields = h('div', { style: 'margin-top:10px' });
    wrap.append(kindSel, fields);

    function renderFields() {
      fields.textContent = '';
      if (a.kind === 'hotkey') fields.append(hotkeyField(a.keys, (k) => { a.keys = k; emit(); }));
      if (a.kind === 'text') {
        fields.append(
          h('label', { class: 'field' }, h('span', {}, 'Yazılacak metin (o an seçili pencereye yazılır)'),
            h('textarea', { maxlength: 2000, value: a.text || '', oninput: (e) => { a.text = e.target.value; emit(); } })),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!a.enter, onchange: (e) => { a.enter = e.target.checked; emit(); } }), 'Sonra Enter\'a bas (gönder)'),
        );
      }
      if (a.kind === 'sound') {
        const has = state.sounds.some((s) => s.name === a.sound);
        const out = h('output', {}, a.volume ?? 100);
        fields.append(
          h('label', { class: 'field' }, h('span', {}, 'Ses dosyası'),
            state.sounds.length
              ? h('select', { onchange: (e) => { a.sound = e.target.value; emit(); } },
                !has && h('option', { value: a.sound || '', selected: true }, a.sound ? `⚠ ${a.sound} (bulunamadı)` : 'Seç…'),
                state.sounds.map((s) => h('option', { value: s.name, selected: s.name === a.sound }, s.name)))
              : h('div', { class: 'hint', style: 'margin:0' }, 'Henüz ses yok. "Sesler" sekmesinden yükle.')),
          h('label', { class: 'field' }, h('span', {}, 'Bu sesin seviyesi'),
            h('div', { class: 'range-row' },
              h('input', { type: 'range', min: 0, max: 100, step: 5, value: a.volume ?? 100, oninput: (e) => { a.volume = Number(e.target.value); out.value = a.volume; emit(); } }),
              out)),
        );
      }
      if (a.kind === 'page') {
        fields.append(h('label', { class: 'field' }, h('span', {}, 'Gidilecek sayfa'),
          h('select', { onchange: (e) => { a.pageId = e.target.value; emit(); } },
            state.cfg.pages.map((p) => h('option', { value: p.id, selected: p.id === a.pageId }, p.name)))));
      }
      if (a.kind === 'stopSounds') fields.append(h('p', { class: 'hint', style: 'margin:0' }, 'Çalan tüm soundboard seslerini anında keser.'));
      if (a.kind === 'volumeUp' || a.kind === 'volumeDown') fields.append(h('p', { class: 'hint', style: 'margin:0' }, 'Sadece StreamDeckk seslerinin genel seviyesini değiştirir (Windows sesini değil).'));
    }
    renderFields();
    return wrap;
  }

  function hotkeyField(value, onChange) {
    let keys = value || '';
    const box = h('div', { class: 'hotkey-box grow' });
    const paint = (capturing) => {
      box.textContent = '';
      box.classList.toggle('capturing', !!capturing);
      if (capturing) { box.append(capturing === true ? 'Tuşlara bas… (iptal: Esc)' : capturing); return; }
      if (!keys) { box.append(h('span', { class: 'muted' }, 'Kısayol yok')); return; }
      keys.split('+').forEach((k, i) => { if (i) box.append('+'); box.append(h('kbd', {}, pretty(k))); });
    };
    paint();

    let listening = false;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'keyup') return;
      if (e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) return stop();
      const mods = [];
      if (e.ctrlKey) mods.push('ctrl');
      if (e.shiftKey) mods.push('shift');
      if (e.altKey) mods.push('alt');
      if (e.metaKey) mods.push('win');
      const main = codeToKey(e.code);
      if (!main) { paint(mods.length ? mods.map(pretty).join(' + ') + ' + …' : true); return; }
      keys = [...mods, main].join('+');
      onChange(keys);
      stop();
    };
    const stop = () => {
      listening = false;
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      recBtn.textContent = '⌨ Kaydet';
      paint();
    };
    const recBtn = h('button', {
      type: 'button', class: 'btn ghost',
      onclick: () => {
        if (listening) return stop();
        listening = true;
        recBtn.textContent = 'İptal';
        paint(true);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('keyup', onKey, true);
      },
    }, '⌨ Kaydet');
    const special = h('select', {
      onchange: (e) => {
        if (!e.target.value) return;
        const mods = keys ? keys.split('+').filter((k) => MOD_ORDER.includes(k)) : [];
        keys = [...mods, e.target.value].join('+');
        e.target.value = '';
        onChange(keys);
        paint();
      },
    }, SPECIAL_KEYS.map(([v, l]) => h('option', { value: v }, l)));
    const manual = h('input', {
      type: 'text', value: keys, placeholder: 'ör. ctrl+shift+m',
      onchange: (e) => { keys = e.target.value.trim().toLowerCase().replace(/\s+/g, ''); onChange(keys); paint(); },
    });
    return h('div', {},
      h('div', { class: 'row' }, box, recBtn),
      h('div', { class: 'row', style: 'margin-top:8px' }, h('div', { class: 'grow' }, special)),
      h('details', { style: 'margin-top:8px' },
        h('summary', { class: 'hint', style: 'margin:0;cursor:pointer' }, 'Elle yaz'),
        h('div', { style: 'margin-top:6px' }, manual),
        h('p', { class: 'hint', style: 'margin:6px 0 0' }, 'Tuş adları: ctrl, shift, alt, win, a–z, 0–9, f1–f24, numpad0–9, space, enter, tab, esc, up/down/left/right, home, end, pageup, pagedown, delete…')),
    );
  }

  async function testAction(action, delay) {
    try {
      if (delay) {
        for (let s = delay; s > 0; s--) { toast(`${s} sn içinde hedef pencereye tıkla…`); await new Promise((r) => setTimeout(r, 1000)); }
      }
      const r = await api('POST', '/api/test', { action });
      if (typeof r.volume === 'number') { state.cfg.volume = r.volume; toast(`Ses seviyesi: %${r.volume}`); } else toast('Gönderildi ✓');
    } catch (e) {
      toast(e.message, true);
    }
  }

  function deleteButton() {
    page().buttons[state.sel] = null;
    state.sel = null;
    changed();
  }
  function duplicateButton() {
    const btns = page().buttons;
    const free = btns.findIndex((x) => !x);
    if (free < 0) return toast('Bu sayfada boş kare yok', true);
    btns[free] = { ...JSON.parse(JSON.stringify(btns[state.sel])), id: uid() };
    state.sel = free;
    changed();
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select') || state.sel == null) return;
    if (e.key === 'Delete' && $('#tab-keys').classList.contains('active') && page().buttons[state.sel]) deleteButton();
  });

  // ========== SESLER ==========
  async function loadSounds() {
    try { state.sounds = await api('GET', '/api/sounds'); } catch (e) { toast(e.message, true); }
    renderSounds();
  }
  const fmtSize = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
  function renderSounds() {
    const ul = $('#sound-list');
    ul.textContent = '';
    if (!state.sounds.length) ul.append(h('li', { class: 'empty' }, 'Henüz ses yok'));
    for (const s of state.sounds) {
      const used = state.cfg.pages.reduce((n, p) => n + p.buttons.filter((b) => b && [b.action, b.offAction].some((a) => a?.kind === 'sound' && a.sound === s.name)).length, 0);
      ul.append(h('li', {},
        h('span', {}, '🎵'),
        h('span', { class: 'sname', title: s.name }, s.name),
        used ? h('span', { class: 'ssize' }, `${used} tuşta`) : null,
        h('span', { class: 'ssize' }, fmtSize(s.size)),
        h('button', { class: 'btn ghost small', onclick: () => testAction({ kind: 'sound', sound: s.name, volume: 100 }) }, '▶ PC\'de çal'),
        h('button', { class: 'btn ghost small', onclick: () => testAction({ kind: 'stopSounds' }) }, '⏹'),
        h('button', {
          class: 'btn danger small',
          onclick: async () => {
            if (!confirm(`"${s.name}" silinsin mi?` + (used ? `\n${used} tuş bu sesi kullanıyor.` : ''))) return;
            await api('DELETE', '/api/sounds/' + encodeURIComponent(s.name)).catch((e) => toast(e.message, true));
            loadSounds();
          },
        }, 'Sil'),
      ));
    }
  }
  async function uploadFiles(files) {
    for (const f of files) {
      try {
        if (f.size > 30e6) throw new Error(`${f.name}: 30 MB'tan büyük`);
        toast(`Yükleniyor: ${f.name}`);
        await api('POST', '/api/sounds?name=' + encodeURIComponent(f.name), undefined, f);
        toast(`Yüklendi ✓ ${f.name}`);
      } catch (e) {
        toast(e.message, true);
      }
    }
    loadSounds();
  }
  $('#sound-input').addEventListener('change', (e) => { uploadFiles([...e.target.files]); e.target.value = ''; });
  const dz = $('#dropzone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); uploadFiles([...e.dataTransfer.files]); });
  $('#open-folder').addEventListener('click', () => api('POST', '/api/open-folder').catch((e) => toast(e.message, true)));

  const mv = $('#master-volume');
  mv.addEventListener('input', () => {
    state.cfg.volume = Number(mv.value);
    $('#master-volume-out').value = mv.value;
    changed({ rerender: false });
  });

  // ========== BAĞLAN ==========
  const KIND_NAMES = { wifi: '📶 Wi-Fi', lan: '🔌 Kablolu ağ', usb: '📱 iPhone (USB / Erişim noktası)', virtual: '🧩 Sanal bağdaştırıcı' };
  async function loadConnect() {
    let data;
    try { data = await api('GET', '/api/connect'); } catch (e) { return toast(e.message, true); }
    let main = data.addresses.filter((a) => a.kind !== 'virtual');
    let other = data.addresses.filter((a) => a.kind === 'virtual');
    // Yalnızca sanal bağdaştırıcı varsa (ör. sanal makine) onları gizleme, doğrudan göster
    if (!main.length) { main = other; other = []; }
    const card = (a, i) => h('div', { class: 'qr-card' + (i === 0 ? ' primary' : '') },
      h('div', { class: 'kind' }, KIND_NAMES[a.kind]),
      h('div', { class: 'iface' }, a.name),
      h('div', { class: 'qr', html: a.qr }),
      h('div', { class: 'url' }, `http://${a.ip}:${data.port}`));
    const grid = $('#qr-grid');
    grid.textContent = '';
    if (!main.length) {
      grid.append(h('div', { class: 'qr-empty card' }, 'Ağ bağlantısı bulunamadı. PC\'yi Wi-Fi\'a bağla veya iPhone\'u USB ile takıp Kişisel Erişim Noktası\'nı aç. Sonra bu sekmeyi yenile.'));
    }
    main.forEach((a, i) => grid.append(card(a, i)));
    if (!main.some((a) => a.kind === 'usb')) {
      grid.append(h('div', { class: 'qr-card' },
        h('div', { class: 'kind' }, KIND_NAMES.usb),
        h('p', { class: 'muted' }, 'Kablo ile bağlamak için iPhone\'u tak ve Ayarlar → Kişisel Erişim Noktası\'nı aç. Birkaç saniye sonra burada ikinci bir QR belirir.'),
        h('button', { class: 'btn ghost small', onclick: loadConnect }, '↻ Yenile')));
    }
    $('#other-adapters').hidden = !other.length;
    $('#qr-grid-other').textContent = '';
    other.forEach((a) => $('#qr-grid-other').append(card(a, 1)));
  }
  $('#regen-token').addEventListener('click', async () => {
    if (!confirm('Tüm bağlı cihazların bağlantısı kesilecek ve eski QR kodlar geçersiz olacak. Devam edilsin mi?')) return;
    try { await api('POST', '/api/token/regenerate'); toast('Eşleştirme sıfırlandı. Yeni QR kodu okut.'); loadConnect(); } catch (e) { toast(e.message, true); }
  });

  // ========== AYARLAR ==========
  function renderSettings() {
    $('#grid-cols').value = state.cfg.grid.cols;
    $('#grid-rows').value = state.cfg.grid.rows;
    mv.value = state.cfg.volume;
    $('#master-volume-out').value = state.cfg.volume;
  }
  function onGridChange() {
    const cols = Math.max(2, Math.min(8, Number($('#grid-cols').value) || 3));
    const rows = Math.max(2, Math.min(10, Number($('#grid-rows').value) || 5));
    const { cols: oc, rows: or } = state.cfg.grid;
    if (cols === oc && rows === or) return;
    const lost = state.cfg.pages.reduce((n, p) => n + p.buttons.filter((b, i) => b && (i % oc >= cols || Math.floor(i / oc) >= rows)).length, 0);
    if (lost && !confirm(`${lost} tuş yeni ızgaranın dışında kalıp silinecek. Devam?`)) return renderSettings();
    // Tuşları satır/sütun konumlarını koruyarak yeni ızgaraya taşı
    for (const p of state.cfg.pages) {
      const next = Array(cols * rows).fill(null);
      p.buttons.forEach((b, i) => {
        const r = Math.floor(i / oc), c = i % oc;
        if (b && r < rows && c < cols) next[r * cols + c] = b;
      });
      p.buttons = next;
    }
    state.cfg.grid = { cols, rows };
    state.sel = null;
    changed();
  }
  $('#grid-cols').addEventListener('change', onGridChange);
  $('#grid-rows').addEventListener('change', onGridChange);
  $('#port').addEventListener('change', (e) => {
    const p = Number(e.target.value);
    if (p >= 1024 && p <= 65535) { state.cfg.port = p; changed({ rerender: false }); }
  });

  // ========== Durum ==========
  async function pollStatus() {
    try {
      const s = await api('GET', '/api/status');
      const be = $('#st-backend');
      const map = {
        ready: ['ok', 'PC yardımcısı hazır'], starting: ['warn', 'PC yardımcısı başlıyor…'],
        error: ['err', 'PC yardımcısı hatası'], simulated: ['warn', 'Simülasyon modu'],
      };
      const [cls, text] = map[s.backend] || ['warn', s.backend];
      be.className = 'pill ' + cls;
      be.title = s.backendError || (s.backend === 'simulated' ? 'Windows dışı sistem: tuşlar yalnızca günlüğe yazılır' : '');
      be.querySelector('span').textContent = text;
      const cl = $('#st-clients');
      cl.className = 'pill ' + (s.clients ? 'ok' : '');
      cl.querySelector('span').textContent = s.clients ? `${s.clients} cihaz bağlı` : 'Cihaz bağlı değil';
      if (!state.about) {
        state.about = true;
        $('#port').value = s.port;
        $('#about').append(
          h('dt', {}, 'Sürüm'), h('dd', {}, s.version),
          h('dt', {}, 'Veri klasörü'), h('dd', {}, s.dataDir),
          h('dt', {}, 'Kontrol paneli'), h('dd', {}, location.origin + '/admin/'),
        );
      }
    } catch {
      const be = $('#st-backend');
      be.className = 'pill err';
      be.querySelector('span').textContent = 'StreamDeckk kapalı';
    }
  }

  // ---------- Başlat ----------
  async function init() {
    try {
      state.cfg = await api('GET', '/api/config');
    } catch (e) {
      document.body.innerHTML = `<p style="padding:40px">Yapılandırma yüklenemedi: ${e.message}</p>`;
      return;
    }
    state.sounds = await api('GET', '/api/sounds').catch(() => []);
    renderKeysTab();
    renderSettings();
    pollStatus();
    setInterval(pollStatus, 3000);
    const tab = location.hash.slice(1);
    if (tab && document.getElementById('tab-' + tab)) showTab(tab);
  }
  init();
})();
