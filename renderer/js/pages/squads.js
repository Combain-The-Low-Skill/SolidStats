// ===== Page: Отряды =====

Pages.squads = async function () {
  const content  = document.getElementById('pageContent');
  const controls = document.getElementById('topbarControls');

  const gameType = 'sg';
  let rotationIdx  = parseInt(localStorage.getItem('sq_rot') ?? '-1');
  let cardTimers   = [];   // setInterval IDs for cycling cards
  let rtInstances  = [];   // RotatingText instances for cleanup

  // Two-section layout: cards stay, table re-renders
  content.innerHTML = `
    <div id="sqCards" class="sq-cards-wrap"></div>
    <div id="sqTable"></div>
  `;

  // Load rotations
  const rotations = await API.rotations(gameType);

  // Controls — custom dropdown
  controls.innerHTML = '';

  function buildRotItems(rots) {
    const items = [{
      value: '-1',
      label: 'За всё время',
      sub: null,
      isCurrent: false
    }];
    rots.forEach((r, i) => {
      const sd = new Date(r.startDate).toLocaleDateString('ru', {day:'2-digit',month:'2-digit',year:'2-digit'});
      const ed = r.endDate
        ? new Date(r.endDate).toLocaleDateString('ru', {day:'2-digit',month:'2-digit',year:'2-digit'})
        : 'н.вр.';
      items.push({
        value: String(i),
        label: `${sd} – ${ed}`,
        sub: `${r.totalGames} игр`,
        isCurrent: !r.endDate   // текущий (незакрытый) период
      });
    });
    return items;
  }

  const rotItems = buildRotItems(rotations);
  const rotDropdown = createCustomDropdown({
    items: rotItems,
    selected: String(rotationIdx),
    onChange: (v) => {
      rotationIdx = parseInt(v);
      localStorage.setItem('sq_rot', rotationIdx);
      renderTable();
    },
    container: controls
  });

  // Sync dropdown if rotationIdx adjusted externally
  function syncRotDropdown() { rotDropdown.setValue(String(rotationIdx)); }

  // ═══════════════════════════════════════════════════════
  // STAT CARDS
  // ═══════════════════════════════════════════════════════

  function sumStats(squads) {
    const kills   = squads.reduce((s, sq) => s + (sq.kills || 0), 0);
    const players = squads.flatMap(sq => sq.players || []);
    const deaths  = players.reduce((s, p) => s + (p.deaths?.total ?? 0), 0);
    const top5 = [...players]
      .sort((a, b) => (b.kills || 0) - (a.kills || 0))
      .slice(0, 5);
    return { kills, deaths, top5, playerCount: players.length };
  }

  function rotLabel(rots, idx) {
    if (idx === null || idx < 0 || !rots[idx]) return '';
    const r  = rots[idx];
    const sd = new Date(r.startDate).toLocaleDateString('ru', {day:'2-digit',month:'2-digit',year:'2-digit'});
    const ed = r.endDate
      ? new Date(r.endDate).toLocaleDateString('ru', {day:'2-digit',month:'2-digit',year:'2-digit'})
      : 'н.вр.';
    return `${sd} – ${ed}`;
  }

  // ── Weekend cache helpers ──────────────────────────────
  const WK_CACHE_KEY = 'ss_weekend_sg_v1';

  // Returns the timestamp of the most recent Sunday 19:00 (local time)
  // — the point after which the API has finished parsing the weekend games
  function lastRefreshTime() {
    const now = new Date();
    const sun = new Date(now);
    sun.setDate(now.getDate() - now.getDay()); // rewind to this Sunday
    sun.setHours(19, 0, 0, 0);
    if (sun > now) sun.setDate(sun.getDate() - 7); // if today is Sun before 19:00 → prev Sun
    return sun.getTime();
  }

  function weekendCacheValid(cached) {
    return cached && cached.cachedAt >= lastRefreshTime();
  }

  // Load last-weekend stats — uses localStorage cache, fetches only when stale
  async function loadWeekendStats(squads) {
    // Check local cache first
    try {
      const cached = JSON.parse(localStorage.getItem(WK_CACHE_KEY) || 'null');
      if (weekendCacheValid(cached)) return cached;
    } catch (e) {}

    // Cache miss — нужно собрать недельную статистику по всем игрокам ротации.
    // Раньше тут улетало по запросу НА КАЖДОГО игрока одновременно (Promise.all
    // на 300-500 имён) — сервер получал залп в сотни соединений. Теперь шлём
    // пачками с ограничением конкурентности через API.mapLimit.
    const names = [...new Set(squads.flatMap(sq => (sq.players || []).map(p => p.name)))];
    if (!names.length) return null;

    const WEEKEND_FETCH_CONCURRENCY = 6;
    const settled = await API.mapLimit(names, WEEKEND_FETCH_CONCURRENCY, async (name) => {
      try {
        const weeks = await API.playerWeeks('sg', name);
        return { name, week: weeks?.[0] };
      } catch {
        return null; // отдельный игрок не должен ронять всю выборку
      }
    });

    const weekData = settled.filter(v => v && v.week);

    if (!weekData.length) return null;

    // Find the most recent ISO week across all players
    const latestStart = weekData.reduce(
      (max, d) => new Date(d.week.startDate) > new Date(max) ? d.week.startDate : max,
      weekData[0].week.startDate
    );

    const thisWeek = weekData.filter(d => d.week.startDate === latestStart);
    const kills  = thisWeek.reduce((s, d) => s + (d.week.kills  || 0), 0);
    const deaths = thisWeek.reduce((s, d) => {
      const dv = d.week.deaths;
      return s + (dv != null ? (typeof dv === 'object' ? (dv.total ?? 0) : dv) : 0);
    }, 0);
    const top5   = [...thisWeek]
      .sort((a, b) => (b.week.kills || 0) - (a.week.kills || 0))
      .slice(0, 5)
      .map(d => ({ name: d.name, kills: d.week.kills || 0 }));

    const weekStart = new Date(latestStart); // Monday (ISO week start)
    const fri = new Date(weekStart); fri.setDate(weekStart.getDate() + 4); // Friday
    const sat = new Date(weekStart); sat.setDate(weekStart.getDate() + 5); // Saturday
    const fmt2 = d => d.toLocaleDateString('ru', { day:'2-digit', month:'2-digit' });
    const sub = `${fmt2(fri)} – ${fmt2(sat)}`;

    const result = { kills, deaths, top5, sub, cachedAt: Date.now() };
    try { localStorage.setItem(WK_CACHE_KEY, JSON.stringify(result)); } catch (e) {}
    return result;
  }

  async function initCards(type, rots) {
    // Kill existing timers and RotatingText instances
    cardTimers.forEach(id => { clearInterval(id); clearTimeout(id); });
    cardTimers = [];
    rtInstances.forEach(rt => rt._rtStop && rt._rtStop());
    rtInstances = [];

    const wrap = document.getElementById('sqCards');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="stat-card sq-card-placeholder">
        <div class="stat-card-label">Загрузка статистики…</div>
      </div>`.repeat(4);

    const lastIdx = rots.length > 0 ? rots.length - 1 : null;

    try {
      const [curData, aPlayers] = await Promise.all([
        lastIdx !== null ? API.squads(type, lastIdx) : Promise.resolve([]),
        API.players(type),
      ]);

      const curSt = sumStats(curData);
      const aSt = {
        kills:       aPlayers.reduce((s, p) => s + (p.kills || 0), 0),
        deaths:      aPlayers.reduce((s, p) => s + (p.deaths?.total || 0), 0),
        top5:        [...aPlayers].sort((a, b) => (b.kills || 0) - (a.kills || 0)).slice(0, 5),
        playerCount: aPlayers.length,
      };

      wrap.innerHTML = '';

      const killsStates = [
        { label: 'Убийств за уикенд',    value: '…',              color: 'accent', sub: 'загрузка…' },
        { label: 'Убийств за ротацию',   value: fmt(curSt.kills), color: 'accent', sub: rotLabel(rots, lastIdx) },
        { label: 'Убийств за всё время', value: fmt(aSt.kills),   color: 'accent', sub: 'за всё время' },
      ];
      const deathsStates = [
        { label: 'Смертей за уикенд',    value: '…',               color: 'red', sub: 'загрузка…' },
        { label: 'Смертей за ротацию',   value: fmt(curSt.deaths), color: 'red', sub: rotLabel(rots, lastIdx) },
        { label: 'Смертей за всё время', value: fmt(aSt.deaths),   color: 'red', sub: 'за всё время' },
      ];

      // ── Kills card ──────────────────────────────────────
      const killsCard = makeCycleCard(killsStates, 10000, { rotatingLabel: true });

      // ── Deaths card ─────────────────────────────────────
      const deathsCard = makeCycleCard(deathsStates, 10000, { rotatingLabel: true, delayMs: 5000 });

      // ── Top killers card ────────────────────────────────
      const topCycles = curSt.top5.length
        ? curSt.top5.map((p, i) => ({
            label: 'Топ убийц за ротацию',
            value: fmt(p.kills),
            color: 'accent',
            sub:   `#${i + 1}  ${esc(p.name)}`,
          }))
        : [{ label: 'Топ убийц', value: '—', color: 'accent', sub: 'нет данных' }];
      const topCard = makeCycleCard(topCycles, 8000);

      wrap.appendChild(killsCard);
      wrap.appendChild(deathsCard);
      wrap.appendChild(topCard);
      wrap.appendChild(makeStaticCard('Игроков', fmt(aSt.playerCount), 'white', 'в статистике'));

      // ── Weekend stats (async, updates cards when ready) ─
      loadWeekendStats(curData).then(wk => {
        if (!wk || !document.getElementById('sqCards')) return;
        killsCard.refreshCycles([
          { label: 'Убийств за уикенд',      value: fmt(wk.kills),    color: 'accent', sub: wk.sub },
          { label: 'Убийств за ротацию', value: fmt(curSt.kills), color: 'accent', sub: rotLabel(rots, lastIdx) },
          { label: 'Убийств за всё время',   value: fmt(aSt.kills),   color: 'accent', sub: 'за всё время' },
        ]);
        deathsCard.refreshCycles([
          { label: 'Смертей за уикенд',      value: fmt(wk.deaths),    color: 'red', sub: wk.sub },
          { label: 'Смертей за ротацию', value: fmt(curSt.deaths), color: 'red', sub: rotLabel(rots, lastIdx) },
          { label: 'Смертей за всё время',   value: fmt(aSt.deaths),   color: 'red', sub: 'за всё время' },
        ]);
        if (wk.top5.length) {
          topCard.refreshCycles(wk.top5.map((p, i) => ({
            label: 'Топ убийц за уикенд',
            value: fmt(p.kills),
            color: 'accent',
            sub:   `#${i + 1}  ${esc(p.name)}`,
          })));
        }
      });

    } catch (e) {
      wrap.innerHTML = '';
      console.error('initCards error:', e);
    }
  }

  // ── Card builders ───────────────────────────────────────

  // Длительности/кривые анимации значения и подписи карточки — в одном месте,
  // чтобы не дублировать «магические» cubic-bezier по коду.
  const CARD_ANIM = {
    outValue: 'transform 0.18s cubic-bezier(0.55,0,1,0.45)',
    outSub:   'transform 0.16s cubic-bezier(0.55,0,1,0.45) 0.02s',
    inValue:  'transform 0.22s cubic-bezier(0,0.55,0.45,1)',
    inSub:    'transform 0.20s cubic-bezier(0,0.55,0.45,1) 0.03s',
    swapDelayMs: 200,
  };

  // Цикличная карточка статистики.
  // opts.rotatingLabel === true  → меняющаяся часть лейбла ("за уикенд" /
  //   "за ротацию" / "за всё время") анимируется через RotatingText, а первое
  //   слово ("Убийств" / "Смертей") остаётся статичным.
  // opts.rotatingLabel === false → лейбл просто меняется текстом.
  function makeCycleCard(cycles, intervalMs, opts = {}) {
    const { delayMs = 0, rotatingLabel = false } = opts;
    const card = document.createElement('div');
    card.className = 'stat-card';

    let idx = 0;
    const first = cycles[0];

    // Разбор лейбла на статичную и вращающуюся части (только для rotatingLabel).
    const staticWord = (label) => label.split(/\s+за\s+/i)[0];
    const labelParts = (cyc) => cyc.map(c => (c.label.match(/за\s+.+$/i) || [c.label])[0]);

    if (rotatingLabel) {
      card.innerHTML = `
        <div class="stat-card-label cycle-label">
          <span class="rt-static">${staticWord(first.label)}</span>
          <span class="rt-badge"></span>
        </div>
        <div class="cycle-slot">
          <div class="stat-card-value ${first.color} cycle-value">${first.value}</div>
        </div>
        <div class="cycle-slot cycle-slot-sub">
          <div class="stat-card-sub cycle-sub">${first.sub}</div>
        </div>`;
    } else {
      card.innerHTML = `
        <div class="stat-card-label cycle-label">${first.label}</div>
        <div class="cycle-slot">
          <div class="stat-card-value ${first.color} cycle-value">${first.value}</div>
        </div>
        <div class="cycle-slot cycle-slot-sub">
          <div class="stat-card-sub cycle-sub">${first.sub}</div>
        </div>`;
    }

    const labelEl = card.querySelector('.cycle-label');
    const valueEl = card.querySelector('.cycle-value');
    const subEl   = card.querySelector('.cycle-sub');

    // RotatingText создаётся только в режиме вращающегося лейбла.
    let rt = null;
    if (rotatingLabel) {
      const badgeEl = card.querySelector('.rt-badge');
      rt = createRotatingText(labelParts(cycles), {
        stagger: 0, staggerFrom: 'last', splitBy: 'line', badgeEl,
      });
      badgeEl.appendChild(rt);
      rtInstances.push(rt);
    }

    function tick() {
      if (!document.getElementById('sqCards')) return;
      idx = (idx + 1) % cycles.length;
      const next = cycles[idx];

      if (rt) rt._rtNext();

      valueEl.style.transition = CARD_ANIM.outValue;
      valueEl.style.transform  = 'translateY(-100%)';
      subEl.style.transition   = CARD_ANIM.outSub;
      subEl.style.transform    = 'translateY(-100%)';

      setTimeout(() => {
        valueEl.style.transition = 'none';
        valueEl.style.transform  = 'translateY(100%)';
        valueEl.textContent      = next.value;
        valueEl.className        = `stat-card-value ${next.color} cycle-value`;
        if (!rt) labelEl.textContent = next.label;
        subEl.style.transition   = 'none';
        subEl.style.transform    = 'translateY(100%)';
        subEl.textContent        = next.sub;

        requestAnimationFrame(() => requestAnimationFrame(() => {
          valueEl.style.transition = CARD_ANIM.inValue;
          valueEl.style.transform  = 'translateY(0)';
          subEl.style.transition   = CARD_ANIM.inSub;
          subEl.style.transform    = 'translateY(0)';
        }));
      }, CARD_ANIM.swapDelayMs);
    }

    const dt = setTimeout(() => {
      tick();
      cardTimers.push(setInterval(tick, intervalMs));
    }, delayMs);
    cardTimers.push(dt);

    card.refreshCycles = (newCycles) => {
      cycles.splice(0, cycles.length, ...newCycles);
      idx = 0;
      const sNew = newCycles[0];
      if (rt) rt._rtSetTexts(labelParts(newCycles));
      else    labelEl.textContent = sNew.label;
      valueEl.style.transition = 'none';
      valueEl.style.transform  = 'translateY(0)';
      valueEl.style.opacity    = '1';
      valueEl.textContent      = sNew.value;
      valueEl.className        = `stat-card-value ${sNew.color} cycle-value`;
      subEl.style.transition   = 'none';
      subEl.style.transform    = 'translateY(0)';
      subEl.style.opacity      = '1';
      subEl.textContent        = sNew.sub;
    };

    return card;
  }

  function makeStaticCard(label, value, color, sub) {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `
      <div class="stat-card-label">${esc(label)}</div>
      <div class="stat-card-value ${color}">${value}</div>
      <div class="stat-card-sub">${sub}</div>
    `;
    return card;
  }

  // ═══════════════════════════════════════════════════════
  // TABLE
  // ═══════════════════════════════════════════════════════

  async function renderTable() {
    const tbl = document.getElementById('sqTable');
    if (!tbl) return;
    tbl.innerHTML = loadingHTML();
    try {
      const data = await API.squads(gameType, rotationIdx >= 0 ? rotationIdx : null);
      renderSquadsTable(data, tbl);
    } catch (e) {
      tbl.innerHTML = errorHTML(API.errorText(e));
    }
  }

  function renderSquadsTable(squads, container) {
    const html = `
    <div class="page-enter">
      <div class="table-wrap">
        <table id="squadsTable">
          <thead>
            <tr>
              <th data-col="rank" data-num="1">#</th>
              <th data-col="prefix">Отряд</th>
              <th data-col="players" data-num="1">Игроков</th>
              <th data-col="avgplayers" data-num="1">Ср. явка</th>
              <th data-col="kills" data-num="1">Убийств</th>
              <th data-col="avgkills" data-num="1">Ср. убийств</th>
              <th data-col="teamkills" data-num="1">ТК</th>
              <th data-col="avgtk" data-num="1">Ср. ТК</th>
              <th data-col="score" data-num="1">Счёт</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${squads.map((sq, i) => {
              const score      = sq.score ?? sq.averageScore ?? 0;
              const avgPlayers = sq.averagePlayersCount ?? 0;
              const avgKills   = sq.averageKills ?? 0;
              const avgTk      = sq.averageTeamkills ?? 0;
              const playerCount = sq.players?.length ?? 0;
              return `
              <tr class="squad-row" data-rank="${i+1}" data-prefix="${esc(sq.prefix)}" data-players="${playerCount}"
                  data-avgplayers="${avgPlayers}" data-kills="${sq.kills}" data-avgkills="${avgKills}"
                  data-teamkills="${sq.teamkills}" data-avgtk="${avgTk}" data-score="${score}">
                <td class="rank ${i<3?'rank-top':''}">${i+1}</td>
                <td><span class="squad-badge">${esc(sq.prefix)}</span></td>
                <td class="muted">${playerCount}</td>
                <td class="muted">${fmt(avgPlayers)}</td>
                <td>${fmt(sq.kills)}</td>
                <td>${fmt(avgKills)}</td>
                <td class="tk-col">${fmt(sq.teamkills)}</td>
                <td class="tk-col">${fmt(avgTk)}</td>
                <td class="accent">${fmt(score)}</td>
                <td>
                  <button class="squad-expand-btn" data-idx="${i}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                    Игроки
                  </button>
                </td>
              </tr>
              <tr class="squad-players-row" data-idx="${i}" style="display:none">
                <td colspan="10">
                  <div class="squad-players-inner">
                    ${renderSquadPlayers(sq.players || [])}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

    container.innerHTML = html;

    // ── Expand player list ONLY via the dedicated row button ──
    container.querySelectorAll('.squad-expand-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = container.querySelector(`.squad-players-row[data-idx="${btn.dataset.idx}"]`);
        if (!row) return;
        const open = row.style.display !== 'none';
        row.style.display = open ? 'none' : 'table-row';
        btn.classList.toggle('open', !open);
        if (!open) {
          const inner = row.querySelector('.squad-players-table');
          makePlayersSortable(inner);
          // Player link navigation via data-nick (safe for nicks with quotes)
          row.querySelectorAll('a.player-link[data-nick]').forEach(a => {
            if (a._nickBound) return;
            a._nickBound = true;
            a.addEventListener('click', (e) => {
              e.preventDefault();
              Router.go('player', { nick: a.dataset.nick });
            });
          });
        }
      });
    });

    // ── Sortable headers (keeps each squad row paired with its player row) ──
    makeSquadsSortable(document.getElementById('squadsTable'));
  }

  // Sort that keeps each squad's hidden player-row attached beneath it.
  function makeSquadsSortable(table) {
    if (!table) return;
    const headers = table.querySelectorAll(':scope > thead th[data-col]');
    let sortCol = null, sortDir = 1;
    headers.forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        const numeric = th.dataset.num === '1';
        if (sortCol === col) sortDir *= -1;
        else { sortCol = col; sortDir = numeric ? -1 : 1; }
        headers.forEach(h => h.classList.remove('sort-asc','sort-desc'));
        th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');

        const tbody = table.querySelector('tbody');

        // Collapse any open player lists before reordering
        tbody.querySelectorAll('.squad-players-row').forEach(r => { r.style.display = 'none'; });
        table.querySelectorAll('.squad-expand-btn.open').forEach(b => b.classList.remove('open'));

        // Pair each squad row with its player-row by data-idx
        const squadRows = Array.from(tbody.querySelectorAll('tr.squad-row'));
        const pairs = squadRows.map(r => ({
          row: r,
          players: tbody.querySelector(`.squad-players-row[data-idx="${r.querySelector('.squad-expand-btn')?.dataset.idx}"]`)
        }));

        pairs.sort((a, b) => {
          const av = a.row.dataset[col] ?? '';
          const bv = b.row.dataset[col] ?? '';
          const cmp = numeric ? (+av - +bv) : av.localeCompare(bv, 'ru');
          return cmp * sortDir;
        });

        pairs.forEach(p => {
          tbody.appendChild(p.row);
          if (p.players) tbody.appendChild(p.players);
        });
      });
    });
  }

  function renderSquadPlayers(players) {
    if (!players.length) return '<p class="sp-empty">Нет данных</p>';
    return `<table class="squad-players-table">
      <thead><tr>
        <th class="sp-c-rank">#</th>
        <th data-col="name"  class="sp-th sp-l">Ник</th>
        <th data-col="games" data-num="1" class="sp-th sp-r sort-desc">Игр</th>
        <th data-col="kills" data-num="1" class="sp-th sp-r">Убийств</th>
        <th data-col="kd"    data-num="1" class="sp-th sp-r">K/D</th>
        <th data-col="score" data-num="1" class="sp-th sp-r">Счёт</th>
      </tr></thead>
      <tbody>
        ${players.slice().sort((a,b) => (b.totalPlayedGames??0)-(a.totalPlayedGames??0)).map((p, i) => `
          <tr data-name="${esc(p.name)}" data-games="${p.totalPlayedGames ?? 0}"
              data-kills="${p.kills ?? 0}" data-kd="${p.kdRatio ?? 0}" data-score="${p.totalScore ?? 0}">
            <td class="pl-rank sp-c-rank">${i + 1}</td>
            <td class="sp-name">
              <a class="player-link" href="#" data-nick="${esc(p.name)}">${esc(p.name)}</a>
            </td>
            <td class="sp-r sp-games">${p.totalPlayedGames ?? '—'}</td>
            <td class="sp-r">${p.kills ?? '—'}</td>
            <td class="sp-r">${fmt(p.kdRatio)}</td>
            <td class="sp-r sp-score">${fmt(p.totalScore)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  }

  // Re-number the #-column of an inner player table
  function renumberPlayers(table) {
    table.querySelectorAll('tbody tr').forEach((tr, i) => {
      const c = tr.querySelector('.pl-rank');
      if (c) c.textContent = i + 1;
    });
  }

  // Make an inner player table sortable (called once per table, on first expand)
  function makePlayersSortable(table) {
    if (!table || table.dataset.sortable) return;
    table.dataset.sortable = '1';
    renumberPlayers(table);
    let sortCol = 'games', sortDir = -1; // already rendered sorted by games desc
    table.querySelectorAll('thead th[data-col]').forEach(th => {
      th.addEventListener('click', (e) => {
        e.stopPropagation();
        const col = th.dataset.col;
        const numeric = th.dataset.num === '1';
        if (sortCol === col) sortDir *= -1;
        else { sortCol = col; sortDir = numeric ? -1 : 1; }
        table.querySelectorAll('thead th[data-col]').forEach(h => h.classList.remove('sort-asc','sort-desc'));
        th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        rows.sort((a, b) => {
          const av = a.dataset[col] ?? '', bv = b.dataset[col] ?? '';
          const cmp = numeric ? (+av - +bv) : av.localeCompare(bv, 'ru');
          return cmp * sortDir;
        });
        rows.forEach(r => tbody.appendChild(r));
        renumberPlayers(table);
      });
    });
  }

  // ── Init ──────────────────────────────────────────────────────
  // Register cleanup so timers and measurer spans are freed on page navigation
  PageCleanup.register(() => {
    cardTimers.forEach(id => { clearInterval(id); clearTimeout(id); });
    cardTimers = [];
    rtInstances.forEach(rt => rt._rtStop && rt._rtStop());
    rtInstances = [];
  });

  initCards(gameType, rotations);
  renderTable();
};
