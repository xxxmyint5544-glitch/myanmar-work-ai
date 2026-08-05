/* ai.js — a small rule-based Myanmar-language command parser.
   It is NOT a general LLM: it recognises the shapes of common shop
   commands (sales totals, stock lookups, adding credit, reports),
   pulls out numbers/names with regex, and calls the same DB helpers
   the other pages use. This keeps everything working fully offline. */

const MM_DIGITS = '၀၁၂၃၄၅၆၇၈၉';

function mmToArabicDigits(str) {
  return str.replace(/[၀-၉]/g, d => String(MM_DIGITS.indexOf(d)));
}

function extractAmount(text) {
  const norm = mmToArabicDigits(text).replace(/,/g, '');
  // support "5 သောင်း" (50,000) and "2 သိန်း" (200,000) shorthand
  let m = norm.match(/(\d+(?:\.\d+)?)\s*သိန်း/);
  if (m) return Math.round(parseFloat(m[1]) * 100000);
  m = norm.match(/(\d+(?:\.\d+)?)\s*သောင်း/);
  if (m) return Math.round(parseFloat(m[1]) * 10000);
  m = norm.match(/(\d{3,})/); // plain number, at least 3 digits to avoid grabbing stray small numbers
  if (m) return parseInt(m[1], 10);
  m = norm.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return null;
}

function extractPersonName(text) {
  // pattern: "<name>ကို" — take the token(s) right before ကို
  let m = text.match(/([\u1000-\u109F]{2,20}?)\s*ကို/);
  if (m) return m[1].trim();
  return null;
}

function extractItemQuery(text) {
  // strip common trailing question words to leave the item name
  return text
    .replace(/stock/gi, '')
    .replace(/ဘယ်လောက်ကျန်လဲ|ဘယ်လောက်ရှိလဲ|ကျန်လဲ|ရှိလဲ|ဘယ်နှစ်ခုလဲ|ဘယ်လောက်လဲ/g, '')
    .replace(/[?？]/g, '')
    .trim();
}

async function findItemByFuzzyName(query) {
  const items = await DB.getAll('inventory');
  const q = query.toLowerCase();
  if (!q) return null;
  let hit = items.find(i => i.name.toLowerCase() === q);
  if (hit) return hit;
  hit = items.find(i => i.name.toLowerCase().includes(q) || q.includes(i.name.toLowerCase()));
  return hit || null;
}

/* ---------- intent handlers ---------- */

async function handleTodaySales() {
  const today = todayISO();
  const sales = await DB.salesBetween(today, today);
  const total = sales.reduce((s, r) => s + r.total, 0);
  if (!sales.length) return `ယနေ့အတွက် ရောင်းအားမှတ်တမ်း <b>မရှိသေးပါ</b>။`;
  return `ယနေ့ (${Utils.todayLabel()}) ရောင်းအားစုစုပေါင်း <b>${Utils.kyat(total)}</b> ဖြစ်ပါသည်။ (စာရင်း ${sales.length} ခု)`;
}

async function handleWeekSales() {
  const now = new Date();
  const d = new Date(now); d.setDate(d.getDate() - 6);
  const start = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const sales = await DB.salesBetween(start, todayISO());
  const total = sales.reduce((s, r) => s + r.total, 0);
  return `လွန်ခဲ့သော ၇ ရက်အတွင်း ရောင်းအားစုစုပေါင်း <b>${Utils.kyat(total)}</b> ဖြစ်ပါသည်။`;
}

async function handleMonthProfit() {
  const now = new Date();
  const start = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-01';
  const sales = await DB.salesBetween(start, todayISO());
  const total = sales.reduce((s, r) => s + r.total, 0);
  const cost = sales.reduce((sum, sale) => sum + sale.items.reduce((s,l)=>s+(l.cost||0)*l.qty,0), 0);
  const profit = total - cost;
  return `ဒီလအတွက် ရောင်းအား <b>${Utils.kyat(total)}</b>, ကုန်ကျစရိတ် ${Utils.num(cost)} ကျပ်, အသားတင်အမြတ် <b>${Utils.kyat(profit)}</b> ဖြစ်ပါသည်။ <br><a href="reports.html" style="color:var(--gold);">Full report ကြည့်ရန် →</a>`;
}

async function handleStockQuery(text) {
  const q = extractItemQuery(text);
  const item = await findItemByFuzzyName(q);
  if (!item) return `"${Utils.escapeHtml(q)}" ဆိုတဲ့ ပစ္စည်းကို စာရင်းထဲမှာ ရှာမတွေ့ပါ။ <a href="inventory.html" style="color:var(--gold);">ပစ္စည်းစာရင်း ကြည့်ရန်</a>`;
  const low = (item.stock||0) <= (item.lowThreshold||0);
  return `<b>${Utils.escapeHtml(item.name)}</b> လက်ကျန် <b>${Utils.num(item.stock)} ${Utils.escapeHtml(item.unit||'')}</b> ကျန်ပါသည်။${low ? ' ⚠️ Stock နည်းနေပါပြီ။' : ''}`;
}

async function handleAddCredit(text) {
  const person = extractPersonName(text);
  const amount = extractAmount(text);
  if (!person || !amount) {
    return `နာမည်နှင့် ပမာဏကို ရှင်းရှင်းလင်းလင်း ပြောပြပါ။ ဥပမာ — "မောင်အောင်ကို ၅၀,၀၀၀ အကြွေးထည့်"`;
  }
  const record = {
    id: DB.newId(),
    direction: 'receivable',
    type: 'customer',
    person,
    amount,
    paidAmount: 0,
    dueDate: '',
    note: 'AI မှတဆင့် ထည့်သွင်းသည်',
    status: 'ဆိုင်ရာ',
    history: [],
    createdAt: Date.now()
  };
  await DB.put('credits', record);
  return `<b>${Utils.escapeHtml(person)}</b> အတွက် အကြွေး <b>${Utils.kyat(amount)}</b> ထည့်သွင်းပြီးပါပြီ ✅ <br><a href="credit.html" style="color:var(--gold);">အကြွေးစာရင်း ကြည့်ရန် →</a>`;
}

async function handleReceivableTotal() {
  const total = await DB.totalCreditOutstanding('receivable');
  return `လက်ရှိ ရရန်အကြွေး စုစုပေါင်း <b>${Utils.kyat(total)}</b> ကျန်ရှိပါသည်။`;
}

async function handlePayableTotal() {
  const total = await DB.totalCreditOutstanding('payable');
  return `လက်ရှိ ပေးရန်အကြွေး စုစုပေါင်း <b>${Utils.kyat(total)}</b> ကျန်ရှိပါသည်။`;
}

async function handleLowStock() {
  const low = await DB.lowStockItems();
  if (!low.length) return `Stock နည်းနေသော ပစ္စည်း <b>မရှိပါ</b> — အားလုံး လုံလောက်ပါသည် ✅`;
  const list = low.slice(0,6).map(i => `• ${Utils.escapeHtml(i.name)} (${Utils.num(i.stock)} ${Utils.escapeHtml(i.unit||'')})`).join('<br>');
  return `Stock နည်းနေသော ပစ္စည်း ${low.length} မျိုး —<br>${list}`;
}

/* ---------- router ---------- */

async function routeCommand(raw) {
  const text = raw.trim();
  const lower = text;

  if (/ဒီနေ့/.test(lower) && /ရောင်းအား|အရောင်း/.test(lower)) return handleTodaySales();
  if (/ဒီအပတ်|၇ ?ရက်/.test(lower) && /ရောင်းအား|အရောင်း/.test(lower)) return handleWeekSales();
  if (/ဒီလ/.test(lower) && (/အမြတ်|report|ရောင်းအား/.test(lower))) return handleMonthProfit();
  if (/အမြတ်/.test(lower)) return handleMonthProfit();

  if (/ရရန်.*အကြွေး|အကြွေး.*ရရန်/.test(lower)) return handleReceivableTotal();
  if (/ပေးရန်.*အကြွေး|အကြွေး.*ပေးရန်/.test(lower)) return handlePayableTotal();

  if (/အကြွေးထည့်|အကြွေးတင်|ကြွေးထည့်/.test(lower)) return handleAddCredit(text);

  if (/stock ?နည်း|ကုန်တော့|ကုန်နီးပြီ/.test(lower)) return handleLowStock();
  if (/stock|ကျန်|လက်ကျန်/.test(lower)) return handleStockQuery(text);

  if (/မင်္ဂလာပါ|ဟယ်လို|hello|hi\b/i.test(lower)) {
    return `မင်္ဂလာပါ! ကျွန်တော် ကူညီပေးနိုင်တာတွေက — ယနေ့/အပတ်စဉ် ရောင်းအားတွက်ခြင်း၊ ပစ္စည်း stock စစ်ခြင်း၊ အကြွေးထည့်ခြင်း၊ အမြတ် report ကြည့်ခြင်း တို့ပါ။ အောက်က ဥပမာလေးတွေကို နှိပ်ကြည့်နိုင်ပါတယ်။`;
  }

  return `ဒီစာကို ရှင်းရှင်းလင်းလင်း နားမလည်သေးပါ 🙏 ဥပမာများ — "ဒီနေ့ရောင်းအားတွက်ပေး"၊ "ဆန်အိတ် stock ဘယ်လောက်ကျန်လဲ"၊ "မောင်အောင်ကို ၅၀,၀၀၀ အကြွေးထည့်"၊ "ဒီလ အမြတ် report ပြ"`;
}

/* ---------- chat UI ---------- */

function appendBubble(text, who) {
  const wrap = document.getElementById('chatWrap');
  const div = document.createElement('div');
  div.className = 'bubble ' + who;
  div.innerHTML = text;
  wrap.appendChild(div);
  wrap.scrollIntoView({ block: 'end' });
  window.scrollTo(0, document.body.scrollHeight);
}

async function sendMessage(text) {
  if (!text || !text.trim()) return;
  appendBubble(Utils.escapeHtml(text), 'user');
  document.getElementById('chatInput').value = '';
  const thinkingId = 'thinking-' + Date.now();
  appendBubble(`<span id="${thinkingId}">…</span>`, 'ai');
  const reply = await routeCommand(text);
  const el = document.getElementById(thinkingId);
  if (el) el.parentElement.innerHTML = reply;
}

/* ---------- voice input (Web Speech API, best-effort) ---------- */

function setupVoice() {
  const micBtn = document.getElementById('micBtn');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    micBtn.addEventListener('click', () => Utils.toast('ဒီ browser မှာ အသံဖြင့်ရေးခြင်း Support မလုပ်ပါ'));
    return;
  }
  const rec = new SR();
  rec.lang = 'my-MM';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  let listening = false;

  micBtn.addEventListener('click', () => {
    if (listening) { rec.stop(); return; }
    try {
      rec.start();
      listening = true;
      micBtn.classList.add('listening');
    } catch (e) {}
  });

  rec.onresult = (e) => {
    const said = e.results[0][0].transcript;
    document.getElementById('chatInput').value = said;
    sendMessage(said);
  };
  rec.onend = () => { listening = false; micBtn.classList.remove('listening'); };
  rec.onerror = () => { listening = false; micBtn.classList.remove('listening'); Utils.toast('အသံ မမှတ်နိုင်ပါ — ထပ်စမ်းကြည့်ပါ'); };
}

document.addEventListener('DOMContentLoaded', () => {
  Utils.mountChrome('AI လုပ်ငန်းကူ', 'ai.html');

  document.getElementById('sendBtn').addEventListener('click', () => sendMessage(document.getElementById('chatInput').value));
  document.getElementById('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage(e.target.value);
  });
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => sendMessage(chip.textContent));
  });

  setupVoice();

  // if the dashboard's quick-ask box sent us here with a pending query
  const pending = sessionStorage.getItem('pendingAiQuery');
  if (pending) {
    sessionStorage.removeItem('pendingAiQuery');
    sendMessage(pending);
  }
});
