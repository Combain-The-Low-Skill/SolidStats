// ===== App Router & Init =====

// Global page cleanup registry — pages can register cleanup callbacks here
const PageCleanup = {
  _callbacks: [],
  register(fn) { this._callbacks.push(fn); },
  run() {
    this._callbacks.forEach(fn => { try { fn(); } catch(e) {} });
    this._callbacks = [];
  }
};

const Router = {
  current: null,
  params: {},

  routes: {
    squads:   { title: 'Отряды',  fn: () => Pages.squads() },
    players:  { title: 'Игроки',  fn: () => Pages.players() },
    player:   { title: 'Профиль', fn: (p) => Pages.player(p) },
    settings: { title: 'Настройки', fn: () => Pages.settings() },
  },

  go(page, params = {}) {
    PageCleanup.run(); // cleanup previous page (timers, measurer spans, etc.)
    this.current = page;
    this.params = params;
    return this._render();
  },

  _render() {
    const route = this.routes[this.current] || this.routes.squads;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === this.current);
    });

    // Update title
    document.getElementById('topbarTitle').textContent = route.title;

    // Clear controls
    document.getElementById('topbarControls').innerHTML = '';

    // Render page
    const content = document.getElementById('pageContent');
    content.innerHTML = loadingHTML('Загрузка...');

    return route.fn(this.params).catch(err => {
      content.innerHTML = errorHTML('Ошибка загрузки: ' + (window.API ? API.errorText(err) : err.message));
    });
  }
};

// Nav click handlers
document.querySelectorAll('.nav-item[data-page]').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    Router.go(el.dataset.page);
  });
});

// Parsing status indicator
async function updateStatus() {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  try {
    const s = await API.parsingStatus();
    const d = new Date(s.update_date);
    const fmt = d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' }) + ' ' +
                d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    dot.className = 'status-dot ok';
    txt.textContent = `Обновлено ${fmt}`;
  } catch {
    dot.className = 'status-dot error';
    txt.textContent = 'Нет соединения';
  }
}

// ===== Count Up (reactbits style) =====
function countUp(el, target, opts) {
  opts = opts || {};
  var duration  = opts.duration  || 2000;
  var decimals  = opts.decimals  || 0;
  var separator = opts.separator !== undefined ? opts.separator : ' '; // неразрывный пробел
  var delay     = opts.delay     || 0;
  var easing    = function(t) { return 1 - Math.pow(1 - t, 3); }; // ease-out cubic

  function format(n) {
    var fixed = n.toFixed(decimals);
    if (!separator) return fixed;
    // Разделитель тысяч
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator);
    return parts.join(',');
  }

  var startTime = null;
  function tick(ts) {
    if (!startTime) startTime = ts;
    var elapsed = ts - startTime;
    var progress = Math.min(elapsed / duration, 1);
    var val = easing(progress) * target;
    el.textContent = format(val);
    if (progress < 1) requestAnimationFrame(tick);
    else el.textContent = format(target);
  }

  setTimeout(function() { requestAnimationFrame(tick); }, delay);
}

// ===== Welcome Screen =====
(function initWelcome() {
  const welcome = document.getElementById('welcomeScreen');
  const app     = document.getElementById('appShell');
  const btn     = document.getElementById('enterBtn');
  const overlay = document.getElementById('staggerOverlay');

  // Реальные игроки с 50+ матчами (данные из API, deaths = deaths.total)
  var REAL_PLAYERS = [
    // KD > 3
    { kills: 1148, deaths:  235, kd: 4.80, games:  295 },  // Ferzb
    { kills: 1657, deaths:  407, kd: 4.16, games:  572 },  // Yowa
    { kills: 1219, deaths:  373, kd: 3.35, games:  443 },  // BepTyxau
    { kills:  670, deaths:  206, kd: 3.30, games:  253 },  // Piligrim
    { kills: 2325, deaths:  717, kd: 3.26, games:  947 },  // beda
    // KD 2.5–3
    { kills: 2095, deaths:  814, kd: 2.56, games: 1128 },  // HE4TO
    { kills:  371, deaths:  156, kd: 2.54, games:  172 },  // chifkif
    { kills: 1499, deaths:  590, kd: 2.53, games:  682 },  // Makaka
    { kills:  964, deaths:  383, kd: 2.63, games:  429 },  // Profit
    { kills:  772, deaths:  300, kd: 2.62, games:  408 },  // Kasad
    { kills:  142, deaths:   49, kd: 2.82, games:   54 },  // EDUK
    // KD 1.7–2
    { kills:  952, deaths:  561, kd: 1.74, games:  747 },  // Tundra
    { kills:  280, deaths:  160, kd: 1.77, games:  195 },  // Britly
    { kills:  230, deaths:  129, kd: 1.76, games:  145 },  // Shaxov
    { kills:   98, deaths:   56, kd: 1.76, games:   73 },  // teekly
    { kills:  125, deaths:   76, kd: 1.73, games:  114 },  // Sparky
    { kills:   70, deaths:   45, kd: 1.71, games:   58 },  // anis
    { kills:   69, deaths:   46, kd: 1.70, games:   59 },  // chikon
    // KD ~1
    { kills:  419, deaths:  401, kd: 1.02, games:  468 },  // Neon
    { kills:  676, deaths:  654, kd: 1.02, games:  913 },  // shoroh
    { kills:  200, deaths:  200, kd: 1.03, games:  254 },  // Hugin
    { kills:  325, deaths:  323, kd: 1.03, games:  448 },  // Dibala
    // KD < 1
    { kills:   71, deaths:   91, kd: 0.75, games:  110 },  // Priest
    { kills:  109, deaths:  138, kd: 0.75, games:  191 },  // Panda
    { kills:  159, deaths:  207, kd: 0.75, games:  231 },  // Pensioner
    { kills:  183, deaths:  220, kd: 0.75, games:  304 },  // Anticlop
  ];
  var _lastPlayerIdx = -1;

  function genValues() {
    var idx;
    do { idx = Math.floor(Math.random() * REAL_PLAYERS.length); }
    while (idx === _lastPlayerIdx && REAL_PLAYERS.length > 1);
    _lastPlayerIdx = idx;
    var p = REAL_PLAYERS[idx];
    return [
      { id: 'wv-kd',     target: p.kd,     decimals: 2, separator: ''  },
      { id: 'wv-kills',  target: p.kills,  decimals: 0, separator: ' ' },
      { id: 'wv-deaths', target: p.deaths, decimals: 0, separator: ' ' },
      { id: 'wv-games',  target: p.games,  decimals: 0, separator: ''  },
    ];
  }

  // Запускает CountUp со ступенчатой задержкой
  function runCountUp(values, baseDelay) {
    baseDelay = baseDelay || 0;
    values.forEach(function(p, i) {
      var el = document.getElementById(p.id);
      if (!el) return;
      countUp(el, p.target, {
        duration:  2400,
        decimals:  p.decimals,
        separator: p.separator,
        delay:     baseDelay + i * 100,
      });
    });
  }

  var pillCycleTimer = null;
  var pillCycleActive = true;

  function pillCycle(isFirst) {
    if (!pillCycleActive) return;
    var vals = genValues();
    runCountUp(vals, isFirst ? 300 : 0);
    // анимация: baseDelay + 4*100 + 1400 = ~2200 мс + пауза 3.5 с между игроками
    var animMs  = (isFirst ? 300 : 0) + 3 * 100 + 1400;
    var pauseMs = 5000 + Math.floor(Math.random() * 3000);
    pillCycleTimer = setTimeout(function() { pillCycle(false); }, animMs + pauseMs);
  }

  setTimeout(function() { pillCycle(true); }, 100);

  btn.addEventListener('click', () => {
    btn.disabled = true;
    // Остановить цикл анимации пиллов
    pillCycleActive = false;
    if (pillCycleTimer) clearTimeout(pillCycleTimer);

    // Phase 1: slide in (last layer arrives at ~0.69s)
    overlay.classList.add('slide-in');
    const slideInDone = 720;

    const minHoldTimer = new Promise(r => setTimeout(r, slideInDone));

    // Phase 2: swap screens and start loading data
    setTimeout(() => {
      welcome.style.display = 'none';
      app.classList.add('visible');
      updateStatus();
    }, slideInDone);

    const dataReady = new Promise(r => setTimeout(() => r(Router.go('squads')), slideInDone));

    // Phase 3: slide out only when BOTH min hold and data are ready
    Promise.all([minHoldTimer, dataReady]).then(() => {
      overlay.classList.remove('slide-in');
      overlay.classList.add('slide-out');
      setTimeout(() => {
        overlay.classList.remove('slide-out');
        overlay.classList.add('no-transition');
        requestAnimationFrame(() => requestAnimationFrame(() => {
          overlay.classList.remove('no-transition');
        }));
      }, 750);
    });
  });
})();

function animateCards(container) {
  if (!container) return;
  container.querySelectorAll('.stat-card').forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(10px)';
    setTimeout(() => {
      card.style.transition = 'opacity 0.25s ease, transform 0.25s cubic-bezier(0.22,1,0.36,1)';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, i * 50);
  });
}

function fmt(n) {
  if (n == null) return '—';
  if (Number.isInteger(n)) return n.toLocaleString('ru');
  return n.toFixed(2);
}

// ── Общие UI-фрагменты ───────────────────────────────────────────────
// Раньше эти куски HTML были скопированы по 4 раза в каждой странице.
function loadingHTML(text) {
  return `<div class="loading-screen"><div class="spinner"></div>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
}
function errorHTML(message) {
  return `<div class="empty-state"><p>${esc(message)}</p></div>`;
}

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
