/* db.js — IndexedDB wrapper.
   One small promise-based layer over IndexedDB so every page (sales,
   inventory, credit, reports, ai) can read/write without repeating
   boilerplate. Schema is versioned so Firebase sync can be layered on
   later without changing how pages call these functions. */

const DB_NAME = 'myanmarWorkAI';
const DB_VERSION = 2;

const STORES = {
  inventory: 'id',
  sales: 'id',
  credits: 'id',
  expenses: 'id',
  settings: 'key'
};

const DEFAULT_EXPENSE_CATEGORIES = ['ကားခ', 'သုံးစရိတ်', 'ဆိုင်ခ', 'လျှပ်စစ်ခ', 'အခြား'];

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('inventory')) {
        const s = db.createObjectStore('inventory', { keyPath: 'id' });
        s.createIndex('name', 'name', { unique: false });
        s.createIndex('code', 'code', { unique: false });
      }
      if (!db.objectStoreNames.contains('sales')) {
        const s = db.createObjectStore('sales', { keyPath: 'id' });
        s.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('credits')) {
        const s = db.createObjectStore('credits', { keyPath: 'id' });
        s.createIndex('type', 'type', { unique: false });
        s.createIndex('status', 'status', { unique: false });
      }
      if (!db.objectStoreNames.contains('expenses')) {
        const s = db.createObjectStore('expenses', { keyPath: 'id' });
        s.createIndex('date', 'date', { unique: false });
        s.createIndex('category', 'category', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return _dbPromise;
}

function tx(storeName, mode) {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

const DB = {
  /* ---- generic CRUD ---- */
  async put(storeName, obj) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const r = store.put(obj);
      r.onsuccess = () => resolve(obj);
      r.onerror = (e) => reject(e.target.error);
    });
  },

  async get(storeName, key) {
    const store = await tx(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const r = store.get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = (e) => reject(e.target.error);
    });
  },

  async getAll(storeName) {
    const store = await tx(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = (e) => reject(e.target.error);
    });
  },

  async delete(storeName, key) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const r = store.delete(key);
      r.onsuccess = () => resolve(true);
      r.onerror = (e) => reject(e.target.error);
    });
  },

  /* ---- settings helpers ---- */
  async getSetting(key, fallback = null) {
    const row = await DB.get('settings', key);
    return row ? row.value : fallback;
  },
  async setSetting(key, value) {
    return DB.put('settings', { key, value });
  },

  /* ---- domain helpers ---- */
  newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  async addSale(sale) {
    sale.id = sale.id || DB.newId();
    sale.date = sale.date || todayISO();
    sale.paymentType = sale.paymentType || 'cash'; // 'cash' | 'credit'
    await DB.put('sales', sale);
    // decrement stock for each line item
    for (const line of sale.items) {
      const item = await DB.get('inventory', line.itemId);
      if (item) {
        item.stock = Math.max(0, (item.stock || 0) - line.qty);
        item.updatedAt = Date.now();
        await DB.put('inventory', item);
      }
    }
    // credit sale → automatically log a receivable so it shows up in the credit list
    if (sale.paymentType === 'credit' && sale.customer) {
      await DB.put('credits', {
        id: DB.newId(),
        direction: 'receivable',
        type: 'customer',
        person: sale.customer,
        amount: sale.total,
        paidAmount: 0,
        dueDate: '',
        note: `ပစ္စည်းအရောင်း အကြွေး (ရောင်းအား မှတ်တမ်းနှင့် ချိတ်ဆက်)`,
        status: 'ဆိုင်ရာ',
        history: [],
        linkSaleId: sale.id,
        createdAt: Date.now()
      });
    }
    return sale;
  },

  async salesBetween(startISO, endISO) {
    const all = await DB.getAll('sales');
    return all.filter(s => s.date >= startISO && s.date <= endISO);
  },

  async salesTotalsByPayment(startISO, endISO) {
    const rows = await DB.salesBetween(startISO, endISO);
    let cash = 0, credit = 0;
    rows.forEach(s => {
      if (s.paymentType === 'credit') credit += s.total; else cash += s.total;
    });
    return { cash, credit, all: cash + credit, count: rows.length };
  },

  /* ---- expenses ---- */
  async addExpense(exp) {
    exp.id = exp.id || DB.newId();
    exp.date = exp.date || todayISO();
    exp.createdAt = exp.createdAt || Date.now();
    await DB.put('expenses', exp);
    return exp;
  },

  async expensesBetween(startISO, endISO) {
    const all = await DB.getAll('expenses');
    return all.filter(e => e.date >= startISO && e.date <= endISO);
  },

  async expenseCategories() {
    return DB.getSetting('expenseCategories', DEFAULT_EXPENSE_CATEGORIES.slice());
  },
  async addExpenseCategory(name) {
    const cats = await DB.expenseCategories();
    if (!cats.includes(name)) cats.push(name);
    await DB.setSetting('expenseCategories', cats);
    return cats;
  },
  async removeExpenseCategory(name) {
    let cats = await DB.expenseCategories();
    cats = cats.filter(c => c !== name);
    await DB.setSetting('expenseCategories', cats);
    return cats;
  },

  async lowStockItems() {
    const all = await DB.getAll('inventory');
    return all.filter(i => (i.stock || 0) <= (i.lowThreshold || 0));
  },

  async creditsByDirection(direction) {
    const all = await DB.getAll('credits');
    return all.filter(c => c.direction === direction && c.status !== 'ပြီးပြီ');
  },

  async totalCreditOutstanding(direction) {
    const rows = await DB.creditsByDirection(direction);
    return rows.reduce((sum, r) => sum + (r.amount - (r.paidAmount || 0)), 0);
  }
};

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

window.DB = DB;
window.todayISO = todayISO;
