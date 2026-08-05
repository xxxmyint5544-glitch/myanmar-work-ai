/* utils.js — formatting, toasts, shared chrome (topbar / bottom nav),
   theme switching. Loaded on every page before the page-specific script. */

const Utils = {
  kyat(n) {
    n = Math.round(Number(n) || 0);
    return n.toLocaleString('en-US') + ' ကျပ်';
  },

  num(n) {
    return Math.round(Number(n) || 0).toLocaleString('en-US');
  },

  todayLabel() {
    const d = new Date();
    const months = ['ဇန်နဝါရီ','ဖေဖော်ဝါရီ','မတ်','ဧပြီ','မေ','ဇွန်','ဇူလိုင်','သြဂုတ်','စက်တင်ဘာ','အောက်တိုဘာ','နိုဝင်ဘာ','ဒီဇင်ဘာ'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  },

  dateLabel(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const months = ['ဇန်','ဖေ','မတ်','ဧပြီ','မေ','ဇွန်','ဇူ','သြ','စက်','အောက်','နို','ဒီ'];
    return `${d} ${months[m - 1]} ${y}`;
  },

  toast(msg, ms = 2200) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), ms);
  },

  uid() { return DB.newId(); },

  escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },

  /* ---- theme ---- */
  async initTheme() {
    const theme = await DB.getSetting('theme', 'light');
    document.documentElement.setAttribute('data-theme', theme);
    return theme;
  },
  async toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    await DB.setSetting('theme', next);
    return next;
  },

  /* ---- chrome: topbar + bottom nav injected on every page ---- */
  NAV_ITEMS: [
    { href: 'dashboard.html', ico: '🏠', label: 'ပင်မ' },
    { href: 'sales.html', ico: '🧾', label: 'ရောင်းအား' },
    { href: 'inventory.html', ico: '📦', label: 'ပစ္စည်း' },
    { href: 'credit.html', ico: '🤝', label: 'အကြွေး' },
    { href: 'ai.html', ico: '✨', label: 'AI' }
  ],

  mountChrome(title, activeHref) {
    const app = document.querySelector('.app');
    if (!app) return;

    const bar = document.createElement('div');
    bar.className = 'topbar';
    bar.innerHTML = `
      <span class="title">${title}</span>
      <div class="flex gap-8">
        <button class="icon-btn" id="themeBtn" title="Dark mode">🌙</button>
        <a class="icon-btn" href="reports.html" style="text-decoration:none;display:flex" title="Reports">📊</a>
      </div>`;
    app.prepend(bar);

    const nav = document.createElement('div');
    nav.className = 'bottom-nav';
    nav.innerHTML = Utils.NAV_ITEMS.map(item => `
      <a href="${item.href}" class="${item.href === activeHref ? 'active' : ''}">
        <span class="nav-ico">${item.ico}</span>
        <span>${item.label}</span>
      </a>`).join('');
    app.appendChild(nav);

    bar.querySelector('#themeBtn').addEventListener('click', async () => {
      const t = await Utils.toggleTheme();
      bar.querySelector('#themeBtn').textContent = t === 'dark' ? '☀️' : '🌙';
    });

    Utils.initTheme().then(t => {
      bar.querySelector('#themeBtn').textContent = t === 'dark' ? '☀️' : '🌙';
    });
  },

  openSheet(id) {
    document.getElementById('overlay')?.classList.add('open');
    document.getElementById(id)?.style.setProperty('display', 'block');
  },
  closeSheets() {
    document.getElementById('overlay')?.classList.remove('open');
    document.querySelectorAll('.sheet').forEach(s => s.style.display = 'none');
  }
};

window.Utils = Utils;

/* Register service worker for offline use (runs on every page) */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
