// ===== Page: Настройки =====

Pages.settings = async function () {
  const content = document.getElementById('pageContent');
  document.getElementById('topbarControls').innerHTML = '';

  content.innerHTML = `
    <div class="page-enter">
      <div class="settings-section">
        <h2>Данные</h2>
        <div class="settings-row">
          <div>
            <div class="settings-label">Обновить кэш</div>
            <div class="settings-desc">Сбросить локально сохранённые данные</div>
          </div>
          <button class="btn-outline" id="refreshBtn">Обновить кэш</button>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Последнее обновление</div>
            <div class="settings-desc" id="lastUpdate">Загрузка...</div>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h2>Интерфейс</h2>
        <div class="settings-row">
          <div>
            <div class="settings-label">Строк на странице (игроки)</div>
            <div class="settings-desc">Количество игроков в таблице</div>
          </div>
          <select class="filter-select" id="pageSizeSelect">
            <option value="50">50</option>
            <option value="100" selected>100</option>
            <option value="200">200</option>
          </select>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Тип игры по умолчанию</div>
          </div>
          <div class="filter-group">
            <button class="filter-btn" data-def="sg">SG</button>
            <button class="filter-btn" data-def="mace">MACE</button>
            <button class="filter-btn" data-def="sm">SM</button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h2>О программе</h2>
        <div class="settings-row">
          <div>
            <div class="settings-label">SolidStats</div>
            <div class="settings-desc">Статистика проекта SolidGames Arma 3</div>
          </div>
          <span class="badge badge-green">v0.2.0</span>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-label">Electron</div>
            <div class="settings-desc" id="electronVer">...</div>
          </div>
        </div>
      </div>
    </div>`;

  // Load status
  try {
    const s = await API.parsingStatus();
    const d = new Date(s.update_date);
    document.getElementById('lastUpdate').textContent =
      d.toLocaleDateString('ru', {day:'2-digit',month:'long',year:'numeric'}) + ', ' +
      d.toLocaleTimeString('ru', {hour:'2-digit',minute:'2-digit'});
  } catch {
    document.getElementById('lastUpdate').textContent = 'Нет соединения';
  }

  // Electron version
  if (window.versions) {
    document.getElementById('electronVer').textContent = `Node ${window.versions.node()}, Electron ${window.versions.electron()}`;
  }

  // Refresh cache
  document.getElementById('refreshBtn').addEventListener('click', () => {
    API.clearCache();
    const btn = document.getElementById('refreshBtn');
    btn.textContent = 'Кэш очищен ✓';
    btn.style.color = 'var(--accent)';
    btn.style.borderColor = 'var(--accent)';
    setTimeout(() => { btn.textContent = 'Обновить кэш'; btn.style.color = ''; btn.style.borderColor = ''; }, 2000);
  });

  // Page size select
  const savedPageSize = localStorage.getItem('pl_page_size') || '100';
  const pageSizeSelect = document.getElementById('pageSizeSelect');
  pageSizeSelect.value = savedPageSize;
  pageSizeSelect.addEventListener('change', () => {
    localStorage.setItem('pl_page_size', pageSizeSelect.value);
  });

  // Default type.
  // Важно: при смене типа игры данные другого типа в кэше неактуальны, поэтому
  // сбрасываем кэш — иначе страницы покажут статистику предыдущего типа.
  const defType = localStorage.getItem('sq_type') || 'sg';
  content.querySelectorAll('[data-def]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.def === defType);
    btn.addEventListener('click', () => {
      if (btn.dataset.def === (localStorage.getItem('sq_type') || 'sg')) return; // без изменений
      content.querySelectorAll('[data-def]').forEach(b => b.classList.toggle('active', b.dataset.def === btn.dataset.def));
      localStorage.setItem('sq_type', btn.dataset.def);
      localStorage.setItem('pl_type', btn.dataset.def);
      API.clearCache(); // данные нового типа подтянутся при следующем заходе на страницу
    });
  });
};
