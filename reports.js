/* reports.js — aggregates sales by day/week/month, shows top-selling
   items, and exports the current view to CSV (Excel) or print (PDF). */

let reportRange = 'day';
let reportRows = [];

function rangeDates(range) {
  const now = new Date();
  const end = todayISO();
  let start;
  if (range === 'day') {
    start = end;
  } else if (range === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    start = isoOf(d);
  } else {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    start = isoOf(d);
  }
  return [start, end];
}

function isoOf(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

async function loadReport() {
  const [start, end] = rangeDates(reportRange);
  reportRows = await DB.salesBetween(start, end);
  reportRows.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

  const label = { day: 'ယနေ့', week: 'ဒီရက် ၇ ရက်', month: 'ဒီလ' }[reportRange];
  document.getElementById('reportRangeLabel').textContent = label + ` (${Utils.dateLabel(start)} — ${Utils.dateLabel(end)})`;

  const total = reportRows.reduce((s, r) => s + r.total, 0);
  const cost = reportRows.reduce((sum, sale) => sum + sale.items.reduce((s,l) => s + (l.cost||0)*l.qty, 0), 0);
  document.getElementById('reportTotal').textContent = Utils.kyat(total);
  document.getElementById('reportCost').textContent = Utils.num(cost);
  document.getElementById('reportProfit').textContent = Utils.num(total - cost);

  renderTopItems();
  renderSalesList();
}

function renderTopItems() {
  const tally = {};
  reportRows.forEach(sale => {
    sale.items.forEach(l => {
      const key = l.name;
      tally[key] = tally[key] || { name: l.name, qty: 0, revenue: 0 };
      tally[key].qty += l.qty;
      tally[key].revenue += l.qty * l.price;
    });
  });
  const top = Object.values(tally).sort((a,b) => b.revenue - a.revenue).slice(0, 5);
  const el = document.getElementById('topItemsList');
  if (!top.length) {
    el.innerHTML = `<div class="empty small"><div class="ico">🏆</div><div class="t">ဒေတာ မရှိသေးပါ</div></div>`;
    return;
  }
  el.innerHTML = top.map((t, idx) => `
    <div class="row-item">
      <div class="swatch gold">${idx+1}</div>
      <div class="main">
        <div class="t1">${Utils.escapeHtml(t.name)}</div>
        <div class="t2">${t.qty} ခု ရောင်းခဲ့သည်</div>
      </div>
      <div class="amt pos">${Utils.num(t.revenue)}</div>
    </div>`).join('');
}

function renderSalesList() {
  const el = document.getElementById('reportSalesList');
  if (!reportRows.length) {
    el.innerHTML = `<div class="empty"><div class="ico">🧾</div><div class="t">ဤကာလအတွင်း ရောင်းအား မရှိပါ</div></div>`;
    return;
  }
  el.innerHTML = reportRows.map(s => `
    <div class="row-item">
      <div class="swatch">🧾</div>
      <div class="main">
        <div class="t1">${Utils.dateLabel(s.date)} · ${s.items.length} မျိုး</div>
        <div class="t2">${Utils.escapeHtml(s.note || '')}</div>
      </div>
      <div class="amt pos">+${Utils.num(s.total)}</div>
    </div>`).join('');
}

function exportExcel() {
  if (!reportRows.length) { Utils.toast('Export လုပ်ရန် ဒေတာ မရှိပါ'); return; }
  const lines = [['ရက်စွဲ','ပစ္စည်းအမည်','အရေအတွက်','ဈေးနှုန်း','စုစုပေါင်း']];
  reportRows.forEach(s => {
    s.items.forEach(l => {
      lines.push([s.date, l.name, l.qty, l.price, l.qty * l.price]);
    });
  });
  const csv = lines.map(row => row.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report-${reportRange}-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  Utils.toast('Excel (CSV) ဖိုင် ရယူပြီးပါပြီ');
}

document.addEventListener('DOMContentLoaded', () => {
  Utils.mountChrome('Report', 'reports.html');
  loadReport();

  document.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      reportRange = btn.dataset.range;
      loadReport();
    });
  });

  document.getElementById('exportPdfBtn').addEventListener('click', () => window.print());
  document.getElementById('exportExcelBtn').addEventListener('click', exportExcel);
});
