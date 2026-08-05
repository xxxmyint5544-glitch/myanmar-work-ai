/* inventory.js — item CRUD, search/filter, and quick stock in/out
   adjustments (used directly here and also called by the AI assistant). */

let allItems = [];
let stockAdjustMode = 'in';
let stockAdjustItemId = null;

async function loadInventory() {
  allItems = await DB.getAll('inventory');
  allItems.sort((a, b) => a.name.localeCompare(b.name, 'my'));
  document.getElementById('statTotalItems').textContent = allItems.length;
  document.getElementById('statLowItems').textContent = allItems.filter(i => (i.stock||0) <= (i.lowThreshold||0)).length;
  renderList(allItems);
}

function renderList(items) {
  const el = document.getElementById('itemList');
  if (!items.length) {
    el.innerHTML = `<div class="empty"><div class="ico">📦</div><div class="t">ပစ္စည်း မထည့်ရသေးပါ</div></div>`;
    return;
  }
  el.innerHTML = items.map(i => {
    const low = (i.stock || 0) <= (i.lowThreshold || 0);
    return `
    <div class="row-item">
      <div class="swatch ${low ? 'warn' : ''}">📦</div>
      <div class="main" onclick="openItemSheet('${i.id}')" style="cursor:pointer;">
        <div class="t1">${Utils.escapeHtml(i.name)} ${low ? '<span class="badge low">Stock နည်း</span>' : ''}</div>
        <div class="t2">လက်ကျန် ${Utils.num(i.stock)} ${Utils.escapeHtml(i.unit||'')} · ရောင်းဈေး ${Utils.num(i.sellPrice)}</div>
      </div>
      <button class="icon-btn" style="font-size:18px;" onclick="openStockSheet('${i.id}')">⇅</button>
    </div>`;
  }).join('');
}

function openItemSheet(id) {
  const isEdit = !!id;
  document.getElementById('itemSheetTitle').textContent = isEdit ? 'ပစ္စည်း ပြင်ဆင်ရန်' : 'ပစ္စည်းအသစ် ထည့်ရန်';
  document.getElementById('deleteItemBtn').style.display = isEdit ? 'block' : 'none';

  if (isEdit) {
    const item = allItems.find(i => i.id === id);
    document.getElementById('itemId').value = item.id;
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemCode').value = item.code || '';
    document.getElementById('itemUnit').value = item.unit || '';
    document.getElementById('itemBuyPrice').value = item.buyPrice || '';
    document.getElementById('itemSellPrice').value = item.sellPrice || '';
    document.getElementById('itemStock').value = item.stock || 0;
    document.getElementById('itemLowThreshold').value = item.lowThreshold || 0;
  } else {
    ['itemId','itemName','itemCode','itemUnit','itemBuyPrice','itemSellPrice','itemStock','itemLowThreshold'].forEach(f => document.getElementById(f).value = '');
  }
  document.getElementById('overlay').classList.add('open');
  document.getElementById('itemSheet').style.display = 'block';
}
window.openItemSheet = openItemSheet;

async function saveItem() {
  const name = document.getElementById('itemName').value.trim();
  if (!name) { Utils.toast('ပစ္စည်းအမည် ရေးပါ'); return; }
  const id = document.getElementById('itemId').value || DB.newId();
  const item = {
    id,
    name,
    code: document.getElementById('itemCode').value.trim(),
    unit: document.getElementById('itemUnit').value.trim(),
    buyPrice: Number(document.getElementById('itemBuyPrice').value) || 0,
    sellPrice: Number(document.getElementById('itemSellPrice').value) || 0,
    stock: Number(document.getElementById('itemStock').value) || 0,
    lowThreshold: Number(document.getElementById('itemLowThreshold').value) || 0,
    updatedAt: Date.now()
  };
  await DB.put('inventory', item);
  Utils.toast('သိမ်းဆည်းပြီးပါပြီ ✅');
  Utils.closeSheets();
  loadInventory();
}

async function deleteItem() {
  const id = document.getElementById('itemId').value;
  if (!id) return;
  if (!confirm('ဤပစ္စည်းကို ဖျက်မလား?')) return;
  await DB.delete('inventory', id);
  Utils.toast('ဖျက်ပြီးပါပြီ');
  Utils.closeSheets();
  loadInventory();
}

function openStockSheet(id) {
  const item = allItems.find(i => i.id === id);
  if (!item) return;
  stockAdjustItemId = id;
  stockAdjustMode = 'in';
  document.getElementById('stockItemName').textContent = item.name;
  document.getElementById('stockAdjustQty').value = 1;
  document.querySelectorAll('#stockSheet .tabs button').forEach(b => b.classList.remove('active'));
  document.querySelector('#stockSheet .tabs button[data-mode="in"]').classList.add('active');
  document.getElementById('overlay2').classList.add('open');
  document.getElementById('stockSheet').style.display = 'block';
}
window.openStockSheet = openStockSheet;

async function applyStockAdjust() {
  const qty = Number(document.getElementById('stockAdjustQty').value) || 0;
  if (qty <= 0 || !stockAdjustItemId) return;
  const item = await DB.get('inventory', stockAdjustItemId);
  if (!item) return;
  item.stock = Math.max(0, (item.stock || 0) + (stockAdjustMode === 'in' ? qty : -qty));
  item.updatedAt = Date.now();
  await DB.put('inventory', item);
  Utils.toast('Stock ပြင်ဆင်ပြီးပါပြီ ✅');
  document.getElementById('overlay2').classList.remove('open');
  document.getElementById('stockSheet').style.display = 'none';
  loadInventory();
}

document.addEventListener('DOMContentLoaded', () => {
  Utils.mountChrome('ပစ္စည်းစာရင်း', 'inventory.html');
  loadInventory();

  document.getElementById('fabAdd').addEventListener('click', (e) => { e.preventDefault(); openItemSheet(null); });
  document.getElementById('cancelItemBtn').addEventListener('click', Utils.closeSheets);
  document.getElementById('saveItemBtn').addEventListener('click', saveItem);
  document.getElementById('deleteItemBtn').addEventListener('click', deleteItem);
  document.getElementById('overlay').addEventListener('click', Utils.closeSheets);

  document.getElementById('overlay2').addEventListener('click', () => {
    document.getElementById('overlay2').classList.remove('open');
    document.getElementById('stockSheet').style.display = 'none';
  });
  document.querySelectorAll('#stockSheet .tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#stockSheet .tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      stockAdjustMode = btn.dataset.mode;
    });
  });
  document.getElementById('applyStockBtn').addEventListener('click', applyStockAdjust);

  document.getElementById('searchBox').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { renderList(allItems); return; }
    renderList(allItems.filter(i => i.name.toLowerCase().includes(q) || (i.code||'').toLowerCase().includes(q)));
  });
});
