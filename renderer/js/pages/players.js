// ===== Page: Игроки =====

Pages.players = async function () {
  const content = document.getElementById('pageContent');
  const controls = document.getElementById('topbarControls');

  const gameType = localStorage.getItem('pl_type') || localStorage.getItem('sq_type') || 'sg';
  let search = '';
  let allPlayers = [];
  let currentPage = 1;
  const PAGE_SIZE = parseInt(localStorage.getItem('pl_page_size') || '100', 10);
  let sortCol = 'games', sortDir = -1;

  controls.innerHTML = `
    <input class="search-input" id="playerSearch" placeholder="Поиск по нику..." value="${esc(search)}">
  `;

  document.getElementById('playerSearch').addEventListener('input', (e) => {
    search = e.target.value.trim().toLowerCase();
    currentPage = 1;
    renderTable();
  });

  async function loadPlayers() {
    content.innerHTML = loadingHTML();
    try {
      allPlayers = await API.players(gameType);
      allPlayers.sort((a, b) => (b.totalPlayedGames ?? 0) - (a.totalPlayedGames ?? 0));
      renderTable();
    } catch (e) {
      content.innerHTML = errorHTML(API.errorText(e));
    }
  }

  function sortAllPlayers(col, dir) {
    allPlayers.sort((a, b) => {
      let av, bv;
      switch (col) {
        case 'rank':
        case 'games':     av = a.totalPlayedGames ?? 0;       bv = b.totalPlayedGames ?? 0;       break;
        case 'kills':     av = a.kills ?? 0;                  bv = b.kills ?? 0;                  break;
        case 'vkills':    av = a.killsFromVehicle ?? 0;       bv = b.killsFromVehicle ?? 0;       break;
        case 'vcoef':     av = a.killsFromVehicleCoef ?? 0;   bv = b.killsFromVehicleCoef ?? 0;   break;
        case 'teamkills': av = a.teamkills ?? 0;              bv = b.teamkills ?? 0;              break;
        case 'deaths':    av = a.deaths?.total ?? 0;          bv = b.deaths?.total ?? 0;          break;
        case 'kd':        av = a.kdRatio ?? 0;                bv = b.kdRatio ?? 0;                break;
        case 'score':     av = a.totalScore ?? 0;             bv = b.totalScore ?? 0;             break;
        case 'name':      return a.name.localeCompare(b.name, 'ru') * dir;
        case 'squad':     return (a.lastSquadPrefix||'').localeCompare(b.lastSquadPrefix||'', 'ru') * dir;
        default:          av = 0; bv = 0;
      }
      return (av - bv) * dir;
    });
  }

  function renderTable() {
    const filtered = search
      ? allPlayers.filter(p => p.name.toLowerCase().includes(search) || (p.lastSquadPrefix||'').toLowerCase().includes(search))
      : allPlayers;

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (currentPage > totalPages) currentPage = 1;
    const page = filtered.slice((currentPage-1)*PAGE_SIZE, currentPage*PAGE_SIZE);
    const rankOffset = search ? null : (currentPage-1)*PAGE_SIZE;

    content.innerHTML = `
    <div>
      <div class="table-wrap">
        <table id="playersTable">
          <thead>
            <tr>
              <th ${!search ? 'data-col="rank" data-num="1"' : ''} style="width:40px">#</th>
              <th data-col="name">Игрок</th>
              <th data-col="squad" style="text-align:center">Отряд</th>
              <th data-col="games" data-num="1" class="${sortCol==='games'?(sortDir===-1?'sort-desc':'sort-asc'):''}">Игр</th>
              <th data-col="kills" data-num="1" class="${sortCol==='kills'?(sortDir===-1?'sort-desc':'sort-asc'):''}">Убийств</th>
              <th data-col="vkills" data-num="1" class="${sortCol==='vkills'?(sortDir===-1?'sort-desc':'sort-asc'):''}">Из техники</th>
              <th data-col="vcoef" data-num="1" class="${sortCol==='vcoef'?(sortDir===-1?'sort-desc':'sort-asc'):''}">% из техн.</th>
              <th data-col="teamkills" data-num="1" class="${sortCol==='teamkills'?(sortDir===-1?'sort-desc':'sort-asc'):''}">ТК</th>
              <th data-col="deaths" data-num="1" class="${sortCol==='deaths'?(sortDir===-1?'sort-desc':'sort-asc'):''}">Смертей</th>
              <th data-col="kd" data-num="1" class="${sortCol==='kd'?(sortDir===-1?'sort-desc':'sort-asc'):''}">K/D</th>
              <th data-col="score" data-num="1" class="${sortCol==='score'?(sortDir===-1?'sort-desc':'sort-asc'):''}">Счёт</th>
            </tr>
          </thead>
          <tbody>
            ${page.map((p, i) => {
              const globalRank = rankOffset != null ? rankOffset + i + 1 : i + 1;
              const kd = p.kdRatio ?? 0;
              const score = p.totalScore ?? 0;
              const vcoef = Math.round((p.killsFromVehicleCoef ?? 0) * 100);
              const squad = p.lastSquadPrefix || '';
              const deaths = p.deaths?.total ?? 0;
              const tk = p.teamkills ?? 0;
              return `<tr>
                <td class="rank ${globalRank<=3?'rank-top':''}">${globalRank}</td>
                <td><a class="player-link" href="#" data-nick="${esc(p.name)}">${esc(p.name)}</a></td>
                <td style="text-align:center">${squad ? `<span class="squad-badge">${esc(squad)}</span>` : '<span class="squad-empty">—</span>'}</td>
                <td class="games-val">${p.totalPlayedGames ?? '—'}</td>
                <td>${fmt(p.kills)}</td>
                <td class="muted">${fmt(p.killsFromVehicle)}</td>
                <td class="muted">${vcoef}%</td>
                <td class="tk-col">${tk}</td>
                <td class="muted">${deaths}</td>
                <td class="muted">${fmt(kd)}</td>
                <td class="accent">${fmt(score)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${totalPages > 1 ? renderPagination(currentPage, totalPages, filtered.length) : ''}
    </div>`;

    // Сортировка по клику на заголовок
    const table = document.getElementById('playersTable');
    table.querySelectorAll('thead th[data-col]').forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortCol === col) sortDir *= -1;
        else { sortCol = col; sortDir = th.dataset.num === '1' ? -1 : 1; }
        sortAllPlayers(sortCol, sortDir);
        currentPage = 1;
        renderTable();
      });
    });

    animateRows(table);

    // Player link navigation via data-nick (safe for nicks with quotes)
    table.querySelectorAll('a.player-link[data-nick]').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        Router.go('player', { nick: a.dataset.nick });
      });
    });

    content.querySelectorAll('.page-btn[data-p]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = parseInt(btn.dataset.p);
        renderTable();
        content.scrollTop = 0;
      });
    });
  }

  function renderPagination(current, total, count) {
    const pages = [];
    const range = 2;
    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - range && i <= current + range)) pages.push(i);
      else if (pages[pages.length-1] !== '...') pages.push('...');
    }
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding:0 4px">
      <span style="font-size:11px;color:var(--text-muted)">Всего: ${count.toLocaleString('ru')} игроков</span>
      <div class="pagination">
        ${pages.map(p => p === '...'
          ? `<span style="color:var(--text-muted);padding:0 4px">...</span>`
          : `<button class="page-btn ${p===current?'active':''}" data-p="${p}">${p}</button>`
        ).join('')}
      </div>
    </div>`;
  }

  function animateRows(table) {
    if (!table) return;
    const ANIMATE_LIMIT = 15;
    table.querySelectorAll('tbody tr').forEach((tr, i) => {
      if (i >= ANIMATE_LIMIT) return;
      tr.style.opacity = '0';
      tr.style.transform = 'translateY(8px)';
      setTimeout(() => {
        tr.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        tr.style.opacity = '1';
        tr.style.transform = 'translateY(0)';
      }, i * 18);
    });
  }

  loadPlayers();
};
