/**
 * RotatingText - vanilla JS, reactbits.dev style
 *
 * opts.badgeEl  — элемент-обёртка, ширина которого анимируется под текст
 * opts.splitBy  — 'line' | 'words' | 'characters'
 *
 * rt._rtNext()           -- следующий текст
 * rt._rtSetTexts([...])  -- сменить список и показать первый
 * rt._rtStop()           -- уничтожить
 */
function createRotatingText(texts, opts) {
  opts = opts || {};
  var stagger     = opts.stagger     !== undefined ? opts.stagger : 0.025;
  var staggerFrom = opts.staggerFrom || 'last';
  var splitBy     = opts.splitBy     || 'characters';
  var badgeEl     = opts.badgeEl     || null;

  var wrap = document.createElement('span');
  wrap.className = 'rt-wrap';

  var currentIdx  = 0;
  var activeTexts = texts.slice();
  var destroyed   = false;

  // Скрытый элемент для измерения ширины
  var measurer = null;
  if (badgeEl) {
    measurer = document.createElement('span');
    measurer.className = 'rt-measurer';
    measurer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(measurer);
  }

  function getSlots(text) {
    if (splitBy === 'line') return [text];
    if (splitBy === 'words') {
      return text.split(' ').map(function(w, i, arr) {
        return w + (i < arr.length - 1 ? ' ' : '');
      });
    }
    // characters
    return Array.from(text).map(function(ch) { return ch === ' ' ? '\u00a0' : ch; });
  }

  function staggerDelay(i, total) {
    if (staggerFrom === 'last')   return (total - 1 - i) * stagger;
    if (staggerFrom === 'center') return Math.abs(i - Math.floor(total / 2)) * stagger;
    return i * stagger;
  }

  function measureWidth(text) {
    if (!measurer) return null;
    measurer.textContent = text;
    return measurer.offsetWidth;
  }

  function animateBadgeWidth(text) {
    if (!badgeEl || !measurer) return;
    if (!badgeEl.style.width) {
      badgeEl.style.width = badgeEl.offsetWidth + 'px';
    }
    var targetW = measureWidth(text);
    if (targetW === null) return;
    var style = getComputedStyle(badgeEl);
    var pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    badgeEl.style.transition = 'width 0.28s cubic-bezier(0.4,0,0.2,1)';
    badgeEl.style.width = (targetW + pad) + 'px';
  }

  function enterChars(text) {
    wrap.innerHTML = '';
    var slots = getSlots(text);
    var total = slots.length;
    slots.forEach(function(ch, i) {
      var span = document.createElement('span');
      span.className   = 'rt-char';
      span.textContent = ch;
      span.style.cssText = 'display:inline-block;transform:translateY(105%);opacity:0;';
      wrap.appendChild(span);
      var d = staggerDelay(i, total);
      requestAnimationFrame(function() { requestAnimationFrame(function() {
        span.style.transition = 'transform 0.22s cubic-bezier(0,0.55,0.45,1) ' + d + 's, opacity 0.15s ease ' + d + 's';
        span.style.transform  = 'translateY(0)';
        span.style.opacity    = '1';
      }); });
    });
  }

  function exitAndEnter(nextText) {
    animateBadgeWidth(nextText);

    var existing = wrap.querySelectorAll('.rt-char');
    var total    = existing.length;
    var maxMs    = 0;
    existing.forEach(function(span, i) {
      var d = staggerDelay(i, total);
      span.style.transition = 'transform 0.15s cubic-bezier(0.55,0,1,0.45) ' + d + 's, opacity 0.15s ease ' + d + 's';
      span.style.transform  = 'translateY(-120%)';
      span.style.opacity    = '0';
      maxMs = Math.max(maxMs, (d + 0.15) * 1000);
    });
    setTimeout(function() {
      if (!destroyed) enterChars(nextText);
    }, Math.max(maxMs, 60));
  }

  wrap._rtNext = function() {
    if (destroyed || activeTexts.length < 2) return;
    currentIdx = (currentIdx + 1) % activeTexts.length;
    exitAndEnter(activeTexts[currentIdx]);
  };

  wrap._rtSetTexts = function(newTexts) {
    activeTexts = newTexts.slice();
    currentIdx  = 0;
    exitAndEnter(activeTexts[0]);
  };

  wrap._rtStop = function() {
    destroyed = true;
    if (measurer && measurer.parentNode) measurer.parentNode.removeChild(measurer);
  };

  // Начальная ширина без анимации
  if (badgeEl) {
    requestAnimationFrame(function() {
      var w   = measureWidth(activeTexts[0]);
      var st  = getComputedStyle(badgeEl);
      var pad = parseFloat(st.paddingLeft) + parseFloat(st.paddingRight);
      badgeEl.style.transition = 'none';
      badgeEl.style.width = (w + pad) + 'px';
    });
  }

  enterChars(activeTexts[0]);
  return wrap;
}
