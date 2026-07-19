(() => {
  'use strict';

  const SEARCH_ENGINES = {
    google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    yandex: (q) => `https://ya.ru/search/?text=${encodeURIComponent(q)}`
  };

  const params = new URLSearchParams(window.location.search);

  const accent = params.get('accent') || '#ffb020';
  const bgType = params.get('bgType') || 'gradient';
  const bgValue = params.get('bgValue') || 'linear-gradient(135deg,#14161c,#1f2333 60%,#2a2140)';
  const engine = params.get('engine') || 'google';
  let shortcuts = [];
  try { shortcuts = JSON.parse(params.get('shortcuts') || '[]'); } catch (e) { shortcuts = []; }

  document.documentElement.style.setProperty('--accent', accent);

  if (bgType === 'image') {
    document.body.style.background = `#14161c center/cover no-repeat url("${bgValue}")`;
  } else if (bgType === 'solid') {
    document.body.style.background = bgValue;
  } else {
    document.body.style.background = bgValue; // css gradient string
    document.body.style.backgroundAttachment = 'fixed';
  }

  // ---- Shortcuts ----
  const shortcutsEl = document.getElementById('shortcuts');
  shortcuts.slice(0, 8).forEach((s) => {
    const a = document.createElement('a');
    a.className = 'shortcut';
    a.href = s.url;
    a.innerHTML = `
      <span class="shortcut-icon">${(s.name || '?').trim().charAt(0).toUpperCase()}</span>
      <span class="shortcut-name">${escapeHtml(s.name || s.url)}</span>
    `;
    shortcutsEl.appendChild(a);
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Search ----
  const input = document.getElementById('search-input');
  input.focus();
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = input.value.trim();
    if (!q) return;
    const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(q) || (/^[^\s]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(q) && !q.includes(' '));
    window.location.href = isUrl
      ? (/^[a-z][a-z0-9+.-]*:\/\//i.test(q) ? q : 'https://' + q)
      : (SEARCH_ENGINES[engine] || SEARCH_ENGINES.google)(q);
  });

  // ---- Clock ----
  function tick() {
    const now = new Date();
    document.getElementById('clock-time').textContent =
      now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('clock-date').textContent =
      now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  tick();
  setInterval(tick, 15000);
})();
