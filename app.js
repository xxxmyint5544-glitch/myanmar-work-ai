/* app.js — dashboard page: today's sales/expense/profit, stock,
   receivable/payable summary, quick AI question box. */

async function loadDashboard() {
  const today = todayISO();
  const todaySales = await DB.salesBetween(today, today);
  const todayExpenses = await DB.expensesBetween(today, today);

  const totals = await DB.salesTotalsByPayment(today, today);
  const todayTotal = totals.all;
  const todayCost = todaySales.reduce((sum, sale) => {
    return sum + sale.items.reduce((s, l) => s + (l.cost || 0) * l.qty, 0);
  }, 0);
  const expenseTotal = todayExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const todayProfit = todayTotal - todayCost - expenseTotal;

  document.getElementById('ledgerAmount').textContent = Utils.kyat(todayTotal);
  document.getElementById('miniCash').textContent = Utils.num(totals.cash);
  document.getElementById('miniCredit').textContent = Utils.num(totals.credit);
  document.getElementById('miniExpense').textContent = Utils.num(expenseTotal);
  document.getElementById('miniProfit').textContent = Utils.num(todayProfit);

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

/* ---------- expense entry ---------- */

let selectedExpenseCategory = null;

async function renderCategoryChips() {
  const cats = await DB.expenseCategories();
  if (!selectedExpenseCategory || !cats.includes(selectedExpenseCategory)) {
    selectedExpenseCategory = cats[0] || null;
  }
  const el = document.getElementById('expenseCategoryChips');
  el.innerHTML = cats.map(c => `
    <button type="button" class="chip" data-cat="${Utils.escapeHtml(c)}" style="${c === selectedExpenseCategory ? 'background:var(--ink-teal);color:#fff;' : ''}">
      ${Utils.escapeHtml(c)} <span data-del="${Utils.escapeHtml(c)}" style="margin-left:4px;opacity:0.7;">✕</span>
    </button>`).join('');

  el.querySelectorAll('button[data-cat]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.dataset.del) {
        e.stopPropagation();
        removeCategory(e.target.dataset.del);
        return;
      }
      selectedExpenseCategory = btn.dataset.cat;
      renderCategoryChips();
    });
  });
}

async function removeCategory(name) {
  const cats = await DB.expenseCategories();
  if (cats.length <= 1) { Utils.toast('အနည်းဆုံး အမျိုးအစားတစ်ခု ကျန်ရှိရပါမည်'); return; }
  if (!confirm(`"${name}" ကို ဖျက်မလား?`)) return;
  await DB.removeExpenseCategory(name);
  renderCategoryChips();
}

async function addNewCategory() {
  const input = document.getElementById('newCategoryInput');
  const name = input.value.trim();
  if (!name) return;
  await DB.addExpenseCategory(name);
  selectedExpenseCategory = name;
  input.value = '';
  renderCategoryChips();
}

function openExpenseSheet() {
  document.getElementById('expenseAmount').value = '';
  document.getElementById('expenseNote').value = '';
  renderCategoryChips();
  document.getElementById('overlay').classList.add('open');
  document.getElementById('expenseSheet').style.display = 'block';
}

async function saveExpense() {
  const amount = Number(document.getElementById('expenseAmount').value) || 0;
  if (amount <= 0) { Utils.toast('ပမာဏ ထည့်ပါ'); return; }
  if (!selectedExpenseCategory) { Utils.toast('အမျိုးအစား ရွေးပါ'); return; }
  await DB.addExpense({
    category: selectedExpenseCategory,
    amount,
    note: document.getElementById('expenseNote').value.trim()
  });
  Utils.toast('သုံးစရိတ် သိမ်းဆည်းပြီးပါပြီ ✅');
  Utils.closeSheets();
  loadDashboard();
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

  document.getElementById('addExpenseBtn').addEventListener('click', openExpenseSheet);
  document.getElementById('cancelExpenseBtn').addEventListener('click', Utils.closeSheets);
  document.getElementById('saveExpenseBtn').addEventListener('click', saveExpense);
  document.getElementById('addCategoryBtn').addEventListener('click', addNewCategory);
  document.getElementById('newCategoryInput').addEventListener('keydown', e => { if (e.key === 'Enter') addNewCategory(); });
  document.getElementById('overlay').addEventListener('click', Utils.closeSheets);
});
