// ===== Animation Mode Manager =====
// Два режима: 'rich' (по умолчанию) и 'lite' (облегчённый).
// Состояние хранится в localStorage, применяется как data-anim на <body>.
// Liquid Ether (Three.js WebGL) включается/выключается отсюда же.

const AnimMode = (() => {
  const KEY = 'anim_mode';
  const RICH = 'rich';
  const LITE = 'lite';

  function get() {
    return localStorage.getItem(KEY) || RICH;
  }

  function set(mode) {
    localStorage.setItem(KEY, mode);
    _apply(mode);
    _dispatchChange(mode);
  }

  function toggle() {
    set(get() === RICH ? LITE : RICH);
  }

  function isRich() {
    return get() === RICH;
  }

  function _apply(mode) {
    document.body.dataset.anim = mode;
  }

  function _dispatchChange(mode) {
    document.dispatchEvent(new CustomEvent('animModeChange', { detail: { mode } }));
  }

  // Применяем сразу при загрузке (до DOMContentLoaded не нужно ждать — body уже есть)
  _apply(get());

  return { get, set, toggle, isRich, RICH, LITE };
})();
