// ===== API Layer =====
// Слой доступа к публичному REST API проекта SolidGames.
// Данные на сервере обновляются раз в неделю (после игр), поэтому кэш
// агрессивный и переживает перезапуск приложения (localStorage).
const API_BASE = 'https://solid-stats.ru';

// Версия схемы кэша. Поднять, если формат хранимых данных изменится —
// старые записи будут проигнорированы.
const CACHE_VERSION = 'v2';
const CACHE_PREFIX = `ss_cache_${CACHE_VERSION}:`;

// In-memory слой поверх localStorage: убирает повторную (де)сериализацию
// JSON в рамках одной сессии.
const _mem = new Map();

// ── Тип ошибки сети/API ──────────────────────────────────────────────
// Позволяет в UI отличать «нет соединения» от «сервер вернул 500».
class ApiError extends Error {
  constructor(message, { kind, status, path } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;        // 'network' | 'http' | 'parse'
    this.status = status;    // HTTP-код, если есть
    this.path = path;
  }
}

function _userMessage(err) {
  if (err instanceof ApiError) {
    if (err.kind === 'network') return 'Нет соединения с сервером';
    if (err.kind === 'http')    return `Сервер вернул ошибку ${err.status}`;
    if (err.kind === 'parse')   return 'Сервер вернул некорректные данные';
  }
  return err?.message || 'Неизвестная ошибка';
}

// ── localStorage helpers (с защитой от переполнения/приватного режима) ─
function _lsGet(key) {
  if (_mem.has(key)) return _mem.get(key);
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    _mem.set(key, parsed);
    return parsed;
  } catch { return null; }
}

function _lsSet(key, entry) {
  _mem.set(key, entry);
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Квота переполнена — чистим устаревшие записи и пробуем один раз снова.
    _evictOldest();
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry)); } catch {}
  }
}

// Удаляет половину самых старых записей кэша при переполнении квоты.
function _evictOldest() {
  const entries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) {
      try { entries.push([k, JSON.parse(localStorage.getItem(k)).ts || 0]); } catch {}
    }
  }
  entries.sort((a, b) => a[1] - b[1]);
  entries.slice(0, Math.ceil(entries.length / 2)).forEach(([k]) => {
    try { localStorage.removeItem(k); } catch {}
  });
}

// ── Низкоуровневый запрос ────────────────────────────────────────────
async function _request(path) {
  let res;
  try {
    res = await fetch(API_BASE + path);
  } catch (e) {
    throw new ApiError(`Сеть недоступна: ${path}`, { kind: 'network', path });
  }
  if (!res.ok) {
    throw new ApiError(`HTTP ${res.status} для ${path}`, { kind: 'http', status: res.status, path });
  }
  try {
    return await res.json();
  } catch (e) {
    throw new ApiError(`Невалидный JSON: ${path}`, { kind: 'parse', path });
  }
}

// ── Кэширующий fetch ─────────────────────────────────────────────────
// ttlMs — срок жизни записи. Если запрос упал, но в кэше есть просроченные
// данные — возвращаем их (stale-while-error), чтобы UI не падал из-за сети.
async function apiFetch(path, ttlMs = 6 * 60 * 60 * 1000) {
  const cached = _lsGet(path);
  if (cached && (Date.now() - cached.ts) < ttlMs) return cached.data;

  try {
    const data = await _request(path);
    _lsSet(path, { data, ts: Date.now() });
    return data;
  } catch (err) {
    if (cached) return cached.data; // отдаём устаревшее, лишь бы не пустой экран
    throw err;
  }
}

// ── Параллельный запрос с лимитом конкурентности ─────────────────────
// Не даёт залить сервер сотнями одновременных соединений.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  const pool = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(pool);
  return results;
}

const API = {
  /** Статус парсинга: { status, update_date }. Короткий TTL — это «свежесть». */
  parsingStatus: () => apiFetch('/parsing_status', 30000),

  /** Список ротаций для типа игры. Меняется редко. */
  rotations: (type) => apiFetch(`/rotations_info/${type}`, 6 * 60 * 60 * 1000),

  /** Статистика отрядов по ротации (rotationIdx == null => за всё время) */
  squads: (type, rotationIdx) => {
    const path = rotationIdx != null
      ? `/global_stats/squads/${type}/rotation/${rotationIdx}`
      : `/global_stats/squads/${type}`;
    return apiFetch(path);
  },

  /** Все игроки с полной статистикой */
  players: (type) => apiFetch(`/global_stats/players/${type}`),

  /** Недельная статистика игрока */
  playerWeeks: (type, nick) => apiFetch(`/player_stats/${type}/weeks_statistics/${encodeURIComponent(nick)}`),

  /** Статистика по оружию и технике */
  playerWeapons: (type, nick) => apiFetch(`/player_stats/${type}/weapons_statistics/${encodeURIComponent(nick)}`),

  /** Статистика взаимодействий (убитые/убийцы/ТК) */
  playerOthers: (type, nick) => apiFetch(`/player_stats/${type}/other_players_statistics/${encodeURIComponent(nick)}`),

  /** Параллельные запросы с ограничением (для массовых выборок) */
  mapLimit,

  /** Преобразовать ошибку в человекочитаемый текст для UI */
  errorText: _userMessage,

  /** Очистить весь кэш (in-memory + localStorage) */
  clearCache: () => {
    _mem.clear();
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
    } catch {}
  },
};
