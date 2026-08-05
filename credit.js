/* credit.js — receivable (customer owes us) and payable (we owe
   supplier) tracking, with partial-payment history per record. */

let currentDir = 'receivable';
let creditCache = [];
let activeCreditId = null;

async function loadCredits() {
  const all = await DB.getAll('credits');
  creditCache = all.filter(c => c.direction === currentDir)
                    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const total = creditCache.filter(c => c.status !== 'ပြီးပြီ')
                            .reduce((s, c) => s + (c.amount - (c.paidAmount || 0)), 0);
  document.getElementById('dirTotal').textContent = Utils.kyat(total);
  document.getElementById('totalLabel').textContent = currentDir === 'receivable' ? 'စုစုပေါင်း ရရန်ငွေ' : 'စုစုပေါင်း ပေးရန်ငွေ';

  renderCreditList();
}

function renderCreditList() {
  const el = document.getElementById('creditList');
  if (!creditCache.length) {
    el.innerHTML = `<div class="empty"><div class="ico">🤝</div><div class="t">အကြွေးမှတ်တမ်း မရှိသေးပါ</div></div>`;
    return;
  }
  el.innerHTML = creditCache.map(c => {
    const remain = c.amount - (c.paidAmount || 0);
    const done = c.status === 'ပြီးပြီ';
    return `
    <div class="row-item" onclick="openDetail('${c.id}')" style="cursor:pointer;">
      <div class="swatch ${done ? '' : 'warn'}">${done ? '✅' : '👤'}</div>
      <div class="main">
        <div class="t1">${Utils.escapeHtml(c.person)}</div>
        <div class="t2">${c.dueDate ? Utils.dateLabel(c.dueDate) + ' အထိ' : Utils.escapeHtml(c.note || '')}</div>
      </div>
      <div class="amt ${done ? '' : 'neg'}">${done ? 'ပြီးပြီ' : Utils.num(remain)}</div>
    </div>`;
  }).join('');
}

function openCreditSheet() {
  document.getElementById('creditSheetTitle').textContent = currentDir === 'receivable' ? 'ရရန်အကြွေး ထည့်ရန်' : 'ပေးရန်အကြွေး ထည့်ရန်';
  document.getElementById('creditId').value = '';
  document.getElementById('creditDirection').value = currentDir;
  document.getElementById('creditPerson').value = '';
  document.getElementById('creditAmount').value = '';
  document.getElementById('creditDueDate').value = '';
  document.getElementById('creditNote').value = '';
  document.getElementById('overlay').classList.add('open');
  document.getElementById('creditSheet').style.display = 'block';
}

async function saveCredit() {
  const person = document.getElementById('creditPerson').value.trim();
  const amount = Number(document.getElementById('creditAmount').value) || 0;
  if (!person || amount <= 0) { Utils.toast('နာမည်နှင့် ပမာဏ ထည့်ပါ'); return; }

  const record = {
    id: DB.newId(),
    direction: document.getElementById('creditDirection').value,
    type: document.getElementById('creditDirection').value === 'receivable' ? 'customer' : 'supplier',
    person,
    amount,
    paidAmount: 0,
    dueDate: document.getElementById('creditDueDate').value,
    note: document.getElementById('creditNote').value.trim(),
    status: 'ဆိုင်ရာ',
    history: [],
    createdAt: Date.now()
  };
  await DB.put('credits', record);
  Utils.toast('သိမ်းဆည်းပြီးပါပြီ ✅');
  Utils.closeSheets();
  loadCredits();
}

async function openDetail(id) {
  const c = await DB.get('credits', id);
  if (!c) return;
  activeCreditId = id;
  const remain = c.amount - (c.paidAmount || 0);
  document.getElementById('detailName').textContent = c.person;
  document.getElementById('detailBody').innerHTML = `
    <div class="stat-row">
      <div class="stat">
        <div class="l">စုစုပေါင်း</div>
        <div class="v">${Utils.num(c.amount)}</div>
      </div>
      <div class="stat gold">
        <div class="l">ပေးပြီးငွေ</div>
        <div class="v">${Utils.num(c.paidAmount||0)}</div>
      </div>
      <div class="stat warn">
        <div class="l">ကျန်ငွေ</div>
        <div class="v">${Utils.num(remain)}</div>
      </div>
      <div class="stat">
        <div class="l">ပေးရမည့်ရက်</div>
        <div class="v" style="font-size:14px;">${c.dueDate ? Utils.dateLabel(c.dueDate) : '—'}</div>
      </div>
    </div>
    ${c.note ? `<div class="small muted mt-12">မှတ်ချက် — ${Utils.escapeHtml(c.note)}</div>` : ''}
    ${(c.history && c.history.length) ? `
      <div class="section-title"><span>ပေးချေမှတ်တမ်း</span></div>
      <div class="card">${c.history.map(h => `
        <div class="row-item">
          <div class="main">
            <div class="t1">${Utils.num(h.amount)} ကျပ် ပေးချေ</div>
            <div class="t2">${Utils.dateLabel(h.date)}</div>
          </div>
        </div>`).join('')}</div>` : ''}
  `;
  document.getElementById('paymentAmount').value = '';
  document.getElementById('overlay2').classList.add('open');
  document.getElementById('detailSheet').style.display = 'block';
}
window.openDetail = openDetail;

async function applyPayment() {
  const amt = Number(document.getElementById('paymentAmount').value) || 0;
  if (amt <= 0 || !activeCreditId) return;
  const c = await DB.get('credits', activeCreditId);
  if (!c) return;
  c.paidAmount = (c.paidAmount || 0) + amt;
  c.history = c.history || [];
  c.history.push({ date: todayISO(), amount: amt });
  if (c.paidAmount >= c.amount) c.status = 'ပြီးပြီ';
  await DB.put('credits', c);
  Utils.toast('ပေးချေငွေ မှတ်တမ်းတင်ပြီးပါပြီ ✅');
  document.getElementById('overlay2').classList.remove('open');
  document.getElementById('detailSheet').style.display = 'none';
  loadCredits();
}

async function deleteCredit() {
  if (!activeCreditId) return;
  if (!confirm('ဤအကြွေးမှတ်တမ်းကို ဖျက်မလား?')) return;
  await DB.delete('credits', activeCreditId);
  Utils.toast('ဖျက်ပြီးပါပြီ');
  document.getElementById('overlay2').classList.remove('open');
  document.getElementById('detailSheet').style.display = 'none';
  loadCredits();
}

document.addEventListener('DOMContentLoaded', () => {
  Utils.mountChrome('အကြွေးစာရင်း', 'credit.html');
  loadCredits();

  document.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDir = btn.dataset.dir;
      loadCredits();
    });
  });

  document.getElementById('fabAdd').addEventListener('click', (e) => { e.preventDefault(); openCreditSheet(); });
  document.getElementById('cancelCreditBtn').addEventListener('click', Utils.closeSheets);
  document.getElementById('saveCreditBtn').addEventListener('click', saveCredit);
  document.getElementById('overlay').addEventListener('click', Utils.closeSheets);

  document.getElementById('overlay2').addEventListener('click', () => {
    document.getElementById('overlay2').classList.remove('open');
    document.getElementById('detailSheet').style.display = 'none';
  });
  document.getElementById('closeDetailBtn').addEventListener('click', () => {
    document.getElementById('overlay2').classList.remove('open');
    document.getElementById('detailSheet').style.display = 'none';
  });
  document.getElementById('applyPaymentBtn').addEventListener('click', applyPayment);
  document.getElementById('deleteCreditBtn').addEventListener('click', deleteCredit);
});
