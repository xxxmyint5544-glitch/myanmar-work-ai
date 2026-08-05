/* sales.js — new sale entry (cart + checkout), sales history filtered
   by today / this week / all, and a simple printable invoice view. */

let cart = [];
let currentTab = 'today';
let inventoryCache = [];
let activeSaleForInvoice = null;

async function populateItemPicker() {
  inventoryCache = await DB.getAll('inventory');
  const sel = document.getElementById('itemPicker');
  sel.innerHTML = '<option value="">-- ပစ္စည်းစာရင်းမှ ရွေးပါ --</option>' +
    '<option value="__manual__">✍️ လက်ဖြင့်ထည့်မည် (စာရင်းမရှိသေးသော ပစ္စည်း)</option>' +
    inventoryCache.map(i => `<option value="${i.id}">${Utils.escapeHtml(i.name)} — လက်ကျန် ${Utils.num(i.stock)}</option>`).join('');
}

document.getElementById('itemPicker')?.addEventListener('change', (e) => {
  const val = e.target.value;
  const priceInput = document.getElementById('pickPrice');
  if (val && val !== '__manual__') {
    const item = inventoryCache.find(i => i.id === val);
    if (item) priceInput.value = item.sellPrice || 0;
  } else {
    priceInput.value = '';
  }
});

function addLineToCart() {
  const sel = document.getElementById('itemPicker');
  const val = sel.value;
  const qty = Number(document.getElementById('pickQty').value) || 1;
  const price = Number(document.getElementById('pickPrice').value) || 0;

  if (!val) { Utils.toast('ပစ္စည်း ရွေးပါ'); return; }

  let line;
  if (val === '__manual__') {
    const name = prompt('ပစ္စည်းအမည် ရေးပါ');
    if (!name) return;
    line = { itemId: null, name, qty, price, cost: 0 };
  } else {
    const item = inventoryCache.find(i => i.id === val);
    if (!item) return;
    if (item.stock < qty) {
      if (!confirm(`"${item.name}" လက်ကျန် ${item.stock} ပဲရှိပါသည်။ ဆက်လုပ်မလား?`)) return;
    }
    line = { itemId: item.id, name: item.name, qty, price, cost: item.buyPrice || 0 };
  }

  cart.push(line);
  renderCart();
  sel.value = '';
  document.getElementById('pickQty').value = 1;
  document.getElementById('pickPrice').value = '';
}

function renderCart() {
  const el = document.getElementById('cartList');
  if (!cart.length) {
    el.innerHTML = `<div class="empty small"><div class="ico">🛒</div><div class="t">ပစ္စည်း မထည့်ရသေးပါ</div></div>`;
  } else {
    el.innerHTML = cart.map((l, idx) => `
      <div class="row-item">
        <div class="swatch">🏷️</div>
        <div class="main">
          <div class="t1">${Utils.escapeHtml(l.name)}</div>
          <div class="t2">${l.qty} × ${Utils.num(l.price)} ကျပ်</div>
        </div>
        <div class="amt">${Utils.num(l.qty * l.price)}</div>
        <button class="icon-btn" style="color:var(--coral);font-size:16px;" onclick="removeCartLine(${idx})">✕</button>
      </div>`).join('');
  }
  const total = cart.reduce((s, l) => s + l.qty * l.price, 0);
  document.getElementById('cartTotal').textContent = Utils.kyat(total);
}

function removeCartLine(idx) {
  cart.splice(idx, 1);
  renderCart();
}
window.removeCartLine = removeCartLine;

async function saveSale() {
  if (!cart.length) { Utils.toast('ပစ္စည်း အနည်းဆုံး တစ်ခု ထည့်ပါ'); return; }
  const total = cart.reduce((s, l) => s + l.qty * l.price, 0);
  const sale = {
    id: DB.newId(),
    date: todayISO(),
    createdAt: Date.now(),
    items: cart.map(l => ({ itemId: l.itemId, name: l.name, qty: l.qty, price: l.price, cost: l.cost })),
    total,
    note: document.getElementById('saleNote').value.trim()
  };
  await DB.addSale(sale);
  Utils.toast('ရောင်းအား သိမ်းဆည်းပြီးပါပြီ ✅');
  cart = [];
  document.getElementById('saleNote').value = '';
  Utils.closeSheets();
  loadSalesList();
}

function openSaleSheet() {
  cart = [];
  renderCart();
  populateItemPicker();
  document.getElementById('overlay').classList.add('open');
  document.getElementById('saleSheet').style.display = 'block';
}

/* ---------- history ---------- */

function periodRange(tab) {
  const now = new Date();
  const end = todayISO();
  if (tab === 'today') return [end, end];
  if (tab === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    const startISO = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    return [startISO, end];
  }
  return ['0000-00-00', '9999-99-99'];
}

async function loadSalesList() {
  const [start, end] = periodRange(currentTab);
  const all = await DB.getAll('sales');
  const filtered = all.filter(s => s.date >= start && s.date <= end)
                       .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const total = filtered.reduce((s, r) => s + r.total, 0);
  document.getElementById('periodTotal').textContent = Utils.kyat(total);

  const el = document.getElementById('salesList');
  if (!filtered.length) {
    el.innerHTML = `<div class="empty"><div class="ico">🧾</div><div class="t">မှတ်တမ်း မရှိသေးပါ</div></div>`;
    return;
  }
  el.innerHTML = filtered.map(s => `
    <div class="row-item" onclick="showInvoice('${s.id}')" style="cursor:pointer;">
      <div class="swatch">🧾</div>
      <div class="main">
        <div class="t1">${Utils.dateLabel(s.date)} · ${s.items.length} မျိုး</div>
        <div class="t2">${Utils.escapeHtml(s.note || '')}</div>
      </div>
      <div class="amt pos">+${Utils.num(s.total)}</div>
    </div>`).join('');
}

async function showInvoice(id) {
  const sale = await DB.get('sales', id);
  if (!sale) return;
  activeSaleForInvoice = sale;
  const body = document.getElementById('invoiceBody');
  body.innerHTML = `
    <div class="small muted">${Utils.dateLabel(sale.date)}</div>
    <div class="stitch mt-8" style="margin-bottom:10px;"></div>
    ${sale.items.map(l => `
      <div class="row-item">
        <div class="main">
          <div class="t1">${Utils.escapeHtml(l.name)}</div>
          <div class="t2">${l.qty} × ${Utils.num(l.price)}</div>
        </div>
        <div class="amt">${Utils.num(l.qty * l.price)}</div>
      </div>`).join('')}
    <div class="flex-between mt-16">
      <span style="font-weight:700;">စုစုပေါင်း</span>
      <span style="font-size:19px;font-weight:800;font-family:var(--font-num);">${Utils.kyat(sale.total)}</span>
    </div>
    ${sale.note ? `<div class="small muted mt-8">မှတ်ချက် — ${Utils.escapeHtml(sale.note)}</div>` : ''}
  `;
  document.getElementById('overlay').classList.add('open');
  document.getElementById('invoiceSheet').style.display = 'block';
}
window.showInvoice = showInvoice;

async function deleteActiveSale() {
  if (!activeSaleForInvoice) return;
  if (!confirm('ဒီရောင်းအားမှတ်တမ်းကို ဖျက်မလား?')) return;
  // restock items
  for (const line of activeSaleForInvoice.items) {
    if (line.itemId) {
      const item = await DB.get('inventory', line.itemId);
      if (item) {
        item.stock = (item.stock || 0) + line.qty;
        await DB.put('inventory', item);
      }
    }
  }
  await DB.delete('sales', activeSaleForInvoice.id);
  Utils.toast('ဖျက်ပြီးပါပြီ');
  Utils.closeSheets();
  loadSalesList();
}

document.addEventListener('DOMContentLoaded', () => {
  Utils.mountChrome('ရောင်းအား', 'sales.html');

  document.getElementById('newSaleBtn').addEventListener('click', openSaleSheet);
  document.getElementById('fabAdd').addEventListener('click', (e) => { e.preventDefault(); openSaleSheet(); });
  document.getElementById('addLineBtn').addEventListener('click', addLineToCart);
  document.getElementById('saveSaleBtn').addEventListener('click', saveSale);
  document.getElementById('cancelSaleBtn').addEventListener('click', Utils.closeSheets);
  document.getElementById('closeInvoiceBtn').addEventListener('click', Utils.closeSheets);
  document.getElementById('overlay').addEventListener('click', Utils.closeSheets);
  document.getElementById('deleteSaleBtn').addEventListener('click', deleteActiveSale);
  document.getElementById('printInvoiceBtn').addEventListener('click', () => window.print());

  document.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      loadSalesList();
    });
  });

  loadSalesList();

  // support being deep-linked from AI assistant with a prefilled action
  const params = new URLSearchParams(location.search);
  if (params.get('new') === '1') openSaleSheet();
});
