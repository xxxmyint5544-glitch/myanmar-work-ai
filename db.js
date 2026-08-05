/* db.js — IndexedDB wrapper.
   One small promise-based layer over IndexedDB so every page (sales,
   inventory, credit, reports, ai) can read/write without repeating
   boilerplate. Schema is versioned so Firebase sync can be layered on
   later without changing how pages call these functions. */

const DB_NAME = 'myanmarWorkAI';
const DB_VERSION = 1;

const STORES = {
  inventory: 'id',
  sales: 'id',
  credits: 'id',
  settings: 'key'
};

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
    return sale;
  },

  async salesBetween(startISO, endISO) {
    const all = await DB.getAll('sales');
    return all.filter(s => s.date >= startISO && s.date <= endISO);
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
