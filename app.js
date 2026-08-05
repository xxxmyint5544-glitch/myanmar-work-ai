/* app.js — dashboard page: today's sales/expense/profit, stock,
   receivable/payable summary, quick AI question box. */

async function loadDashboard() {
  const today = todayISO();
  const todaySales = await DB.salesBetween(today, today);

  const todayTotal = todaySales.reduce((s, r) => s + (r.total || 0), 0);
  const todayCost = todaySales.reduce((sum, sale) => {
    return sum + sale.items.reduce((s, l) => s + (l.cost || 0) * l.qty, 0);
  }, 0);
  const todayProfit = todayTotal - todayCost;

  document.getElementById('ledgerAmount').textContent = Utils.kyat(todayTotal);
  document.getElementById('miniProfit').textContent = Utils.kyat(todayProfit);
  document.getElementById('miniCount').textContent = todaySales.length + ' စာရင်း';

  const receivable = await DB.totalCreditOutstanding('receivable');
  const payable = await DB.totalCreditOutstanding('payable');
  document.getElementById('statReceivable').textContent = Utils.kyat(receivable);
  document.getElementById('statPayable').textContent = Utils.kyat(payable);

  const inv = await DB.getAll('inventory');
  document.getElementById('statStock').textContent = inv.length + ' မျိုး';

  const low = await DB.lowStockItems();
  document.getElementById('statLow').textContent = low.length + ' မျိုး';

  renderLowStockList(low);
  renderRecentSales(todaySales);
}

function renderLowStockList(items) {
  const el = document.getElementById('lowStockList');
  if (!items.length) {
    el.innerHTML = `<div class="empty"><div class="ico">✅</div><div class="t">stock နည်းနေသော ပစ္စည်း မရှိပါ</div></div>`;
    return;
  }
  el.innerHTML = items.slice(0, 5).map(i => `
    <div class="row-item">
      <div class="swatch warn">📦</div>
      <div class="main">
        <div class="t1">${Utils.escapeHtml(i.name)}</div>
        <div class="t2">လက်ကျန် ${Utils.num(i.stock)} ${Utils.escapeHtml(i.unit || '')}</div>
      </div>
      <span class="badge low">Stock နည်း</span>
    </div>`).join('');
}

function renderRecentSales(sales) {
  const el = document.getElementById('recentSalesList');
  if (!sales.length) {
    el.innerHTML = `<div class="empty"><div class="ico">🧾</div><div class="t">ယနေ့ ရောင်းအား မှတ်တမ်း မရှိသေးပါ</div></div>`;
    return;
  }
  const sorted = [...sales].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  el.innerHTML = sorted.slice(0, 6).map(s => `
    <div class="row-item">
      <div class="swatch">🧾</div>
      <div class="main">
        <div class="t1">${s.items.length} မျိုး ရောင်းခဲ့သည်</div>
        <div class="t2">${new Date(s.createdAt || Date.now()).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'})}</div>
      </div>
      <div class="amt pos">+${Utils.num(s.total)}</div>
    </div>`).join('');
}

async function handleQuickAsk() {
  const input = document.getElementById('quickAsk');
  const q = input.value.trim();
  if (!q) return;
  sessionStorage.setItem('pendingAiQuery', q);
  window.location.href = 'ai.html';
}

document.addEventListener('DOMContentLoaded', () => {
  Utils.mountChrome('ပင်မစာမျက်နှာ', 'dashboard.html');
  document.getElementById('dateLabel').textContent = Utils.todayLabel();
  loadDashboard();

  document.getElementById('quickAskBtn').addEventListener('click', handleQuickAsk);
  document.getElementById('quickAsk').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleQuickAsk();
  });
});
