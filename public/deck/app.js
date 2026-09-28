'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // ---------- Eşleştirme anahtarı ----------
  const params = new URLSearchParams(location.search);
  let token = params.get('t') || store.get('sd.token');
  if (params.get('t')) store.set('sd.token', token);

  const state = {
    config: null,
    toggles: {},
    volume: null,
    pageIndex: store.get('sd.page') || 0,
    ws: null,
    connected: false,
    hosts: [],
    hostIdx: 0,
    pending: new Map(),
    nextId: 1,
    lastPong: 0,
    fatal: false,
    retryTimer: null,
  };

  // ---------- Bağlantı ----------
  function candidateHosts() {
    const saved = store.get('sd.hosts') || [];
    return [...new Set([location.host, ...saved])];
  }

  function connect() {
    if (state.fatal) return;
    clearTimeout(state.retryTimer);
    if (!token) return showPairing();
    state.hosts = candidateHosts();
    const host = state.hosts[state.hostIdx % state.hosts.length];
    let ws;
    try {
      ws = new WebSocket(`ws://${host}/ws?t=${encodeURIComponent(token)}`);
    } catch {
      return scheduleRetry();
    }
    state.ws = ws;
    const openTimer = setTimeout(() => ws.close(), 4000);

    ws.onopen = () => {
      clearTimeout(openTimer);
      state.lastPong = Date.now();
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      state.lastPong = Date.now();
      switch (msg.type) {
        case 'hello':
          setConnected(true);
          if (Array.isArray(msg.addresses)) store.set('sd.hosts', msg.addresses);
          state.toggles = msg.toggles || {};
          applyConfig(msg.config);
          break;
        case 'config': applyConfig(msg.config); break;
        case 'toggles': state.toggles = msg.toggles || {}; refreshKeys(); break;
        case 'volume': setVolume(msg.volume); break;
        case 'result': {
          const p = state.pending.get(msg.id);
          if (p) { state.pending.delete(msg.id); p(msg); }
          break;
        }
      }
    };
    ws.onclose = (ev) => {
      clearTimeout(openTimer);
      if (state.ws !== ws) return;
      state.ws = null;
      setConnected(false);
      for (const p of state.pending.values()) p({ ok: false, error: 'Bağlantı koptu' });
      state.pending.clear();
      if (ev.code === 4001) return showInvalidToken();
      state.hostIdx++;
      scheduleRetry();
    };
  }

  function scheduleRetry() {
    clearTimeout(state.retryTimer);
    state.retryTimer = setTimeout(connect, document.hidden ? 5000 : 1200);
  }

  // Kopmayı hızlı fark etmek için düzenli yoklama
  setInterval(() => {
    const ws = state.ws;
    if (!ws || ws.readyState !== 1) return;
    if (Date.now() - state.lastPong > 9000) { ws.close(); return; }
    ws.send(JSON.stringify({ type: 'ping' }));
  }, 3000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      requestWakeLock();
      if (!state.ws) connect();
      else if (state.ws.readyState === 1) state.ws.send(JSON.stringify({ type: 'ping' }));
    }
  });

  function setConnected(on) {
    state.connected = on;
    const c = $('conn');
    c.className = 'chip conn ' + (on ? 'on' : 'off');
    c.querySelector('span').textContent = on ? 'Bağlı' : 'Bağlanıyor';
    if (on) hideOverlay();
    else if (!state.fatal) {
      // Kısa kopmalarda ekranı kapatma; 2 sn sonra hâlâ bağlı değilse göster
      setTimeout(() => { if (!state.connected && !state.fatal) showConnecting(); }, 2000);
    }
  }

  // ---------- Katman ----------
  function overlay({ spin, icon, title, text, tips, button }) {
    $('ov-spin').hidden = !spin;
    $('ov-icon').hidden = !icon;
    if (icon) $('ov-icon').textContent = icon;
    $('ov-title').textContent = title;
    $('ov-text').textContent = text;
    $('ov-tips').hidden = !tips;
    $('ov-retry').hidden = !button;
    if (button) $('ov-retry').textContent = button;
    $('overlay').classList.add('show');
  }
  const hideOverlay = () => $('overlay').classList.remove('show');
  const showConnecting = () => overlay({
    spin: true, title: "PC'ye bağlanılıyor…", text: 'StreamDeckk bilgisayarda açık olmalı.', tips: true, button: 'Tekrar dene',
  });
  function showPairing() {
    state.fatal = true;
    overlay({
      icon: '📷', title: 'Eşleştirme gerekli',
      text: "PC'deki StreamDeckk kontrol panelinde \"Bağlan\" sekmesindeki QR kodu iPhone kamerasıyla okut.",
    });
  }
  function showInvalidToken() {
    state.fatal = true;
    store.set('sd.token', null);
    overlay({
      icon: '🔒', title: 'Eşleştirme sıfırlandı',
      text: "Bu cihazın anahtarı artık geçerli değil. PC'deki kontrol panelinden yeni QR kodu okut.",
    });
  }
  $('ov-retry').addEventListener('click', () => {
    state.hostIdx = 0;
    if (state.ws) state.ws.close();
    connect();
  });

  // ---------- Çizim ----------
  function applyConfig(cfg) {
    const currentId = state.config?.pages[state.pageIndex]?.id;
    state.config = cfg;
    setVolume(cfg.volume);
    const idx = cfg.pages.findIndex((p) => p.id === currentId);
    state.pageIndex = idx >= 0 ? idx : Math.min(state.pageIndex, cfg.pages.length - 1);
    render();
  }

  function render() {
    const { pages, grid } = state.config;
    const pager = $('pager');
    pager.textContent = '';
    pages.forEach((page, pi) => {
      const sec = document.createElement('section');
      sec.className = 'page';
      sec.style.gridTemplateColumns = `repeat(${grid.cols}, minmax(0, 1fr))`;
      sec.style.gridTemplateRows = `repeat(${grid.rows}, minmax(0, 1fr))`;
      page.buttons.forEach((b) => sec.appendChild(makeKey(b, page, pi)));
      pager.appendChild(sec);
    });
    const dots = $('dots');
    dots.textContent = '';
    if (pages.length > 1) {
      pages.forEach((p, i) => {
        const d = document.createElement('button');
        d.setAttribute('aria-label', p.name);
        d.addEventListener('click', () => goToPage(i));
        dots.appendChild(d);
      });
    }
    goToPage(state.pageIndex, false);
  }

  function makeKey(b, page) {
    const el = document.createElement('div');
    el.className = 'key';
    if (!b) { el.classList.add('empty'); return el; }
    el.dataset.id = b.id;
    el.dataset.page = page.id;
    el.innerHTML = '<span class="emoji"></span><span class="label"></span>';
    if (b.type === 'toggle') el.insertAdjacentHTML('afterbegin', '<span class="toggle-dot"></span>');
    if (b.action?.kind === 'page') el.insertAdjacentHTML('afterbegin', '<span class="corner">›</span>');
    paintKey(el, b);
    bindPress(el, b);
    return el;
  }

  function paintKey(el, b) {
    const on = b.type === 'toggle' && !!state.toggles[b.id];
    el.classList.toggle('on', on);
    const emoji = (on && b.onEmoji) || b.emoji || '';
    const label = (on && b.onLabel) || b.label || '';
    el.querySelector('.emoji').textContent = emoji;
    el.querySelector('.emoji').hidden = !emoji;
    el.querySelector('.label').textContent = label;
    el.classList.toggle('no-emoji', !emoji);
  }

  function refreshKeys() {
    if (!state.config) return;
    const byId = {};
    state.config.pages.forEach((p) => p.buttons.forEach((b) => { if (b) byId[b.id] = b; }));
    document.querySelectorAll('.key[data-id]').forEach((el) => {
      const b = byId[el.dataset.id];
      if (b) paintKey(el, b);
    });
  }

  function goToPage(i, smooth = true) {
    const pager = $('pager');
    const n = state.config.pages.length;
    state.pageIndex = Math.max(0, Math.min(n - 1, i));
    pager.scrollTo({ left: state.pageIndex * pager.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    updatePageUi();
  }

  function updatePageUi() {
    const page = state.config.pages[state.pageIndex];
    $('page-name').textContent = page ? page.name : 'StreamDeckk';
    [...$('dots').children].forEach((d, i) => d.classList.toggle('active', i === state.pageIndex));
    store.set('sd.page', state.pageIndex);
  }

  let scrollTimer;
  $('pager').addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const pager = $('pager');
      const i = Math.round(pager.scrollLeft / Math.max(1, pager.clientWidth));
      if (i !== state.pageIndex) { state.pageIndex = i; updatePageUi(); }
    }, 60);
  }, { passive: true });
  window.addEventListener('resize', () => state.config && goToPage(state.pageIndex, false));

  function setVolume(v) {
    if (typeof v !== 'number') return;
    state.volume = v;
    $('vol').hidden = false;
    $('vol').innerHTML = `${v === 0 ? '🔇' : v < 50 ? '🔉' : '🔊'} <b>${v}</b>`;
  }

  // ---------- Dokunma ----------
  function haptic() {
    if (navigator.vibrate) navigator.vibrate(12);
    else $('haptic').click(); // iOS 18+: anahtar tıklaması hafif titreşim üretir
  }

  function bindPress(el, b) {
    let start = null;
    let longTimer = null;
    let handled = false;

    const cancel = () => {
      if (!start) return;
      start = null;
      clearTimeout(longTimer);
      el.classList.remove('pressed');
    };

    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      start = { x: e.clientX, y: e.clientY };
      handled = false;
      el.classList.add('pressed');
      if (b.type === 'toggle') {
        // Uzun basma: aksiyon göndermeden sadece durumu çevir (senkron bozulursa düzeltmek için)
        longTimer = setTimeout(() => {
          handled = true;
          el.classList.remove('pressed');
          if (navigator.vibrate) navigator.vibrate([10, 40, 10]);
          send({ type: 'toggle-flip', pageId: el.dataset.page, buttonId: b.id });
          toast('Durum değiştirildi (kısayol gönderilmedi)');
        }, 700);
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) cancel();
    });
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('pointerup', () => {
      if (!start) return;
      clearTimeout(longTimer);
      start = null;
      setTimeout(() => el.classList.remove('pressed'), 110);
      if (handled) return;
      haptic();
      requestWakeLock();
      trigger(el, b);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function send(msg) {
    if (state.ws && state.ws.readyState === 1) { state.ws.send(JSON.stringify(msg)); return true; }
    return false;
  }

  function trigger(el, b) {
    if (b.action?.kind === 'page') {
      const idx = state.config.pages.findIndex((p) => p.id === b.action.pageId);
      if (idx >= 0) goToPage(idx);
      else toast('Hedef sayfa bulunamadı', true);
      return;
    }
    if (!b.action || b.action.kind === 'none') return;
    const id = state.nextId++;
    if (!send({ type: 'press', id, pageId: el.dataset.page, buttonId: b.id })) {
      badge(el, false);
      toast("PC'ye bağlı değil", true);
      return;
    }
    const spin = document.createElement('span');
    spin.className = 'spin';
    const spinTimer = setTimeout(() => el.appendChild(spin), 250);
    const timeout = setTimeout(() => done({ ok: false, error: 'PC yanıt vermedi' }), 8000);
    function done(res) {
      clearTimeout(spinTimer);
      clearTimeout(timeout);
      spin.remove();
      state.pending.delete(id);
      badge(el, res.ok);
      if (!res.ok) toast(res.error || 'Hata', true);
      if (typeof res.volume === 'number') { setVolume(res.volume); toast(`Ses seviyesi: %${res.volume}`); }
    }
    state.pending.set(id, done);
  }

  function badge(el, ok) {
    el.querySelector('.badge')?.remove();
    const s = document.createElement('span');
    s.className = 'badge ' + (ok ? 'ok' : 'err');
    s.textContent = ok ? '✓' : '✕';
    el.appendChild(s);
    setTimeout(() => s.remove(), 950);
  }

  let toastTimer;
  function toast(text, err = false) {
    const t = $('toast');
    t.textContent = text;
    t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), err ? 3200 : 1600);
  }

  // ---------- Ekran açık kalsın ----------
  let wakeLock = null;
  async function requestWakeLock() {
    if (wakeLock || !('wakeLock' in navigator) || document.hidden) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch {}
  }

  document.addEventListener('gesturestart', (e) => e.preventDefault());
  connect();
})();
