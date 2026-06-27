// ===== Page: Профиль игрока =====

Pages.player = async function ({ nick }) {
  const content = document.getElementById('pageContent');
  const controls = document.getElementById('topbarControls');
  document.getElementById('topbarTitle').textContent = nick;

  controls.innerHTML = `
    <button class="back-btn" id="backBtn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      Назад
    </button>
    <button class="btn-outline" id="sgProfileBtn">
      Профиль на SG
    </button>
  `;
  document.getElementById('backBtn').addEventListener('click', () => Router.go('players'));
  document.getElementById('sgProfileBtn').addEventListener('click', () => window.open('https://sg.zone/users?search=' + encodeURIComponent(nick)));

  const gameType = 'sg'; // MACE/SM not collected
  let playerData = null;
  let weeksData = null;
  let weaponsData = null;
  let othersData = null;

  async function loadAndRender() {
    content.innerHTML = loadingHTML();
    try {
      // Load all players to find this one
      const allPlayers = await API.players(gameType);
      playerData = allPlayers.find(p => p.name.toLowerCase() === nick.toLowerCase() || p.id === nick.toLowerCase());

      if (!playerData) {
        content.innerHTML = errorHTML(`Игрок «${nick}» не найден в типе ${gameType.toUpperCase()}`);
        return;
      }

      // Load additional data in parallel
      [weeksData, weaponsData, othersData] = await Promise.all([
        API.playerWeeks(gameType, playerData.name),
        API.playerWeapons(gameType, playerData.name),
        API.playerOthers(gameType, playerData.name),
      ]);

      // Rank
      const sorted = [...allPlayers].sort((a,b) => (b.totalScore??0)-(a.totalScore??0));
      const rank = sorted.findIndex(p => p.id === playerData.id) + 1;

      renderProfile(rank);
    } catch (e) {
      content.innerHTML = errorHTML(API.errorText(e));
    }
  }

  function renderProfile(rank) {
    const p = playerData;
    const squad = p.lastSquadPrefix || '';
    const initial = (p.name || '?')[0].toUpperCase();
    const deaths = p.deaths?.total ?? 0;
    const vcoef = Math.round((p.killsFromVehicleCoef ?? 0) * 100);

    content.innerHTML = `
    <div class="page-enter">
      <!-- Header -->
      <div class="player-header">
        <div class="player-avatar">${initial}</div>
        <div class="player-info">
          <h1>${esc(p.name)}</h1>
          <div class="player-squad">
            Отряд: ${squad ? `<span>${esc(squad)}</span>` : '<span style="color:var(--text-muted)">нет</span>'}
            &nbsp;·&nbsp; Место в рейтинге: <span>#${rank}</span>
          </div>
        </div>
      </div>

      <!-- Stats cards -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-card-label">Игр</div>
          <div class="stat-card-value games-val">${p.totalPlayedGames ?? 0}</div>
          <div class="stat-card-sub">&nbsp;</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Убийств</div>
          <div class="stat-card-value">${fmt(p.kills)}</div>
          <div class="stat-card-sub">${fmt(p.killsFromVehicle)} из техники (${vcoef}%)</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">K/D</div>
          <div class="stat-card-value accent">${fmt(p.kdRatio)}</div>
          <div class="stat-card-sub">${deaths} смертей</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Счёт</div>
          <div class="stat-card-value accent">${fmt(p.totalScore)}</div>
          <div class="stat-card-sub">&nbsp;</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Техника выбита</div>
          <div class="stat-card-value">${p.vehicleKills ?? 0}</div>
          <div class="stat-card-sub">&nbsp;</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs" id="playerTabs">
        <button class="tab-btn active" data-tab="chart">График</button>
        <button class="tab-btn" data-tab="weapons">Оружие</button>
        <button class="tab-btn" data-tab="vehicles">Техника</button>
        <button class="tab-btn" data-tab="versus">Противники</button>
        <button class="tab-btn" data-tab="weeks">Подробно по неделям</button>
      </div>

      <!-- Tab panels -->
      <div id="tab-chart" class="tab-panel active"></div>
      <div id="tab-weapons" class="tab-panel"></div>
      <div id="tab-vehicles" class="tab-panel"></div>
      <div id="tab-versus" class="tab-panel"></div>
      <div id="tab-weeks" class="tab-panel"></div>
    </div>`;

    // Tab switching
    content.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Сохраняем позицию прокрутки, чтобы клик по вкладке не бросал страницу вверх.
        const scroller = content.closest('.page-content') || content;
        const keepScroll = scroller.scrollTop;
        const tab = btn.dataset.tab;
        content.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        content.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
        const activePanel = document.getElementById(`tab-${tab}`);
        if (activePanel) { activePanel.style.animation = 'none'; void activePanel.offsetWidth; activePanel.style.animation = 'fadeIn 0.28s cubic-bezier(0.22,1,0.36,1)'; }
        renderTab(tab);
        scroller.scrollTop = keepScroll;
      });
    });

    renderTab('chart');

    // Animate stat cards
    animateCards(content.querySelector('.stats-grid'));
  }

  const renderedTabs = new Set();

  function renderTab(tab) {
    if (renderedTabs.has(tab)) return;
    renderedTabs.add(tab);
    const panel = document.getElementById(`tab-${tab}`);

    switch (tab) {
      case 'chart': renderChartTab(panel); break;
      case 'weapons': renderWeaponsTab(panel); break;
      case 'vehicles': renderVehiclesTab(panel); break;
      case 'versus': renderVersusTab(panel); break;
      case 'weeks': renderWeeksTab(panel); break;
    }
  }

  function renderChartTab(panel) {
    if (!weeksData || !weeksData.length) {
      panel.innerHTML = '<div class="empty-state"><p>Нет недельных данных</p></div>';
      return;
    }
    const weeks = [...weeksData].reverse().slice(-24); // last 24 weeks
    const labels = weeks.map(w => {
      const d = new Date(w.startDate);
      return d.toLocaleDateString('ru', { day:'2-digit', month:'2-digit' });
    });

    panel.innerHTML = `
      <div class="chart-wrap chart-strict">
        <div class="chart-title">Убийства по неделям (последние ${weeks.length} недель)</div>
        <canvas id="chartKills" height="80"></canvas>
      </div>
      <div class="two-col">
        <div class="chart-wrap chart-strict">
          <div class="chart-title">K/D по неделям</div>
          <canvas id="chartKD" height="120"></canvas>
        </div>
        <div class="chart-wrap chart-strict">
          <div class="chart-title">Счёт по неделям</div>
          <canvas id="chartScore" height="120"></canvas>
        </div>
      </div>`;

    const ACCENT = '#2ed9a0';
    const VIOLET = '#7c6af5';

    makeLineChart('chartKills', labels, weeks.map(w => w.kills), ACCENT);
    makeLineChart('chartKD',    labels, weeks.map(w => w.kdRatio), ACCENT);
    makeLineChart('chartScore', labels, weeks.map(w => w.score),  VIOLET);
  }

  // Строгий линейный график с анимацией «отрисовки» слева направо.
  function makeLineChart(canvasId, labels, data, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Вертикальный градиент заливки под линией.
    const fill = ctx.createLinearGradient(0, 0, 0, canvas.height || 200);
    fill.addColorStop(0, hexToRgba(color, 0.18));
    fill.addColorStop(1, hexToRgba(color, 0));

    new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: color,
          backgroundColor: fill,
          fill: true,
          tension: 0,                 // строгие, не «мягкие» линии
          borderWidth: 2,
          pointRadius: 0,             // чистая линия без точек
          pointHoverRadius: 4,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: '#090b0a',
          pointHoverBorderWidth: 2,
        }]
      },
      plugins: [revealLeftToRight()],
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        // Анимацию делает плагин revealLeftToRight (clip), встроенную выключаем.
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#101412',
            borderColor: hexToRgba(color, 0.5),
            borderWidth: 1,
            titleColor: 'rgba(255,255,255,0.45)',
            bodyColor: '#fff',
            padding: 10,
            cornerRadius: 6,
            displayColors: false,
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: 'rgba(255,255,255,0.10)' },
            ticks: { color: 'rgba(255,255,255,0.30)', maxTicksLimit: 8, font: { size: 10 } }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            border: { display: false },
            ticks: { color: 'rgba(255,255,255,0.30)', font: { size: 10 } },
            beginAtZero: true
          }
        }
      }
    });
  }

  // Плагин: рисует ВСЮ линию сразу, но показывает её через прямоугольную
  // маску (clip), которая плавно расширяется слева направо. Это даёт ровную,
  // непрерывную отрисовку без «ломаности» покадровой анимации точек.
  function revealLeftToRight() {
    const DURATION = 1100;
    let start = null;
    let progress = 0;
    let running = false;
    return {
      id: 'revealLeftToRight',
      beforeDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const { left, top, right, bottom } = chartArea;
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, (right - left) * progress, bottom - top);
        ctx.clip();
      },
      afterDatasetsDraw(chart) {
        chart.ctx.restore();
        // Запускаем rAF-цикл один раз; chart.draw() внутри него снова вызовет
        // этот хук, поэтому флаг running защищает от дублирования циклов.
        if (progress >= 1 || running) return;
        running = true;
        const tick = (ts) => {
          if (start === null) start = ts;
          const t = Math.min((ts - start) / DURATION, 1);
          progress = 1 - Math.pow(1 - t, 3); // плавное замедление к концу
          if (t < 1) {
            chart.draw();
            requestAnimationFrame(tick);
          } else {
            running = false;
            chart.draw();
          }
        };
        requestAnimationFrame(tick);
      }
    };
  }

  function hexToRgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
  }

  function renderWeaponsTab(panel) {
    renderArsenalTab(panel, weaponsData?.firearms ?? [], 'оружия', '#2ed9a0');
  }

  function renderVehiclesTab(panel) {
    renderArsenalTab(panel, weaponsData?.vehicles ?? [], 'техники', '#7c6af5');
  }

  // Общий рендер для вкладок «Оружие» и «Техника»:
  // столбчатая диаграмма убийств + детальная таблица.
  function renderArsenalTab(panel, items, noun, color) {
    if (!items.length) { panel.innerHTML = '<div class="empty-state"><p>Нет данных</p></div>'; return; }

    const top = [...items].sort((a, b) => (b.kills ?? 0) - (a.kills ?? 0)).slice(0, 12);
    const canvasId = `bar-${noun}`;

    panel.innerHTML = `
      <div class="chart-wrap chart-strict">
        <div class="chart-title">Убийства по видам ${noun} (топ ${top.length})</div>
        <canvas id="${canvasId}" height="120"></canvas>
      </div>
      <div class="mini-table-wrap">
        <div class="mini-table-title">Топ ${noun} (${items.length})</div>
        ${items.map((w, i) => `
          <div class="mini-table-row">
            <span class="mini-row-rank">${i+1}</span>
            <span class="mini-row-name" data-tooltip="${esc(w.name)}">${esc(w.name)}</span>
            <span class="mini-row-kills">${w.kills} убийств</span>
            <span class="mini-row-dist">${w.maxDistance}м</span>
          </div>`).join('')}
      </div>`;

    makeBarChart(canvasId, top.map(w => w.name), top.map(w => w.kills ?? 0), color);
  }

  // Вертикальная диаграмма со столбцами, вырастающими по очереди слева направо.
  function makeBarChart(canvasId, labels, data, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const fill = ctx.createLinearGradient(0, 0, 0, canvas.height || 240);
    fill.addColorStop(0, color);
    fill.addColorStop(1, hexToRgba(color, 0.35));

    const BAR_DUR = 520;
    const STEP = 70; // задержка между столбцами

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: fill,
          hoverBackgroundColor: color,
          borderRadius: 3,
          borderSkipped: false,
          maxBarThickness: 46,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        // Поочерёдное «вырастание» столбцов снизу вверх, слева направо.
        animation: {
          duration: BAR_DUR,
          easing: 'easeOutCubic',
          delay: (c) => c.type === 'data' && c.mode === 'default' ? c.dataIndex * STEP : 0,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#101412',
            borderColor: hexToRgba(color, 0.5),
            borderWidth: 1,
            titleColor: 'rgba(255,255,255,0.45)',
            bodyColor: '#fff',
            padding: 10,
            cornerRadius: 6,
            displayColors: false,
            callbacks: { label: (i) => `${i.formattedValue} убийств` }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: 'rgba(255,255,255,0.10)' },
            ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 10 }, maxRotation: 50, minRotation: 0 }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            border: { display: false },
            ticks: { color: 'rgba(255,255,255,0.30)', font: { size: 10 } },
            beginAtZero: true
          }
        }
      }
    });
  }

  function renderVersusTab(panel) {
    const d = othersData || {};
    panel.innerHTML = `
      <div class="versus-grid">
        ${versusBlock('🎯 Убивал чаще всего', d.killed || [], 'count', 'раз')}
        ${versusBlock('💀 Убивал меня', d.killers || [], 'count', 'раз')}
        ${versusBlock('⚠️ Тимкиллил', d.teamkilled || [], 'count', 'ТК')}
        ${versusBlock('☠️ ТК по мне', d.teamkillers || [], 'count', 'ТК')}
      </div>`;
    panel.querySelectorAll('a.player-link[data-nick]').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        Router.go('player', { nick: a.dataset.nick });
      });
    });
  }

  function versusBlock(title, items, key, unit) {
    if (!items.length) return `<div class="mini-table-wrap"><div class="mini-table-title">${title}</div><div style="padding:20px;color:var(--text-muted);font-size:12px;text-align:center">Нет данных</div></div>`;
    return `
      <div class="mini-table-wrap">
        <div class="mini-table-title">${title}</div>
        ${items.slice(0,10).map((item, i) => `
          <div class="mini-table-row">
            <span class="mini-row-rank">${i+1}</span>
            <span class="mini-row-name">
              <a class="player-link" href="#" data-nick="${esc(item.name)}">${esc(item.name)}</a>
            </span>
            <span class="mini-row-kills">${item[key]} ${unit}</span>
          </div>`).join('')}
      </div>`;
  }

  function renderWeeksTab(panel) {
    if (!weeksData || !weeksData.length) {
      panel.innerHTML = '<div class="empty-state"><p>Нет данных</p></div>'; return;
    }
    panel.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Неделя</th>
            <th>Игр</th>
            <th>Убийств</th>
            <th>Из техники</th>
            <th>% из техн.</th>
            <th>Выбито техники</th>
            <th>ТК</th>
            <th>Смертей</th>
            <th>K/D</th>
            <th>Счёт</th>
          </tr></thead>
          <tbody>
            ${weeksData.map(w => {
              const sd = new Date(w.startDate).toLocaleDateString('ru',{day:'2-digit',month:'2-digit',year:'2-digit'});
              const ed = new Date(w.endDate).toLocaleDateString('ru',{day:'2-digit',month:'2-digit',year:'2-digit'});
              const vcoef = Math.round((w.killsFromVehicleCoef??0)*100);
              return `
              <tr>
                <td class="muted" style="font-size:11px">${sd}–${ed}</td>
                <td class="games-val">${w.totalPlayedGames}</td>
                <td>${w.kills}</td>
                <td class="muted">${w.killsFromVehicle}</td>
                <td class="muted">${vcoef}%</td>
                <td class="muted">${w.vehicleKills}</td>
                <td class="tk-col">${w.teamkills ?? 0}</td>
                <td class="muted">${w.deaths?.total??0}</td>
                <td class="${(w.kdRatio??0)>=3?'accent':''}">${fmt(w.kdRatio)}</td>
                <td class="accent">${fmt(w.score)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  loadAndRender();
};
