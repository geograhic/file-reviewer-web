/*
 * db.js — Self-contained storage layer for the web build.
 * Browser: uses IndexedDB. Node (no indexedDB global): in-memory Maps.
 * Same async API either way, so business logic is testable without a browser.
 */
(function (root, factory) {
  const api = factory(typeof indexedDB !== "undefined" ? indexedDB : null);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DB = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (idb) {
  "use strict";

  const DB_NAME = "LiFileReviewerWeb";
  const DB_VERSION = 1;

  const STORES = [
    "items", "decks", "libraries", "notes", "reviewHistory",
    "reviewSessions", "config", "plugins", "achievements", "activity",
    "social", "links", "meta",
  ];

  let _db = null;
  let _dbReady = null; // Promise that resolves when _db is set (singleton)
  let _mem = null; // { store: Map }

  function clone(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof structuredClone === "function") return structuredClone(obj);
    return JSON.parse(JSON.stringify(obj));
  }

  // ---------- IndexedDB backend ----------
  function openIDB() {
    return new Promise((resolve, reject) => {
      const req = idb.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) {
            const isCfg = s === "config" || s === "social" || s === "meta";
            const store = db.createObjectStore(s, {
              keyPath: isCfg ? "key" : "id",
              autoIncrement: isCfg ? false : true,
            });
            if (s === "items") {
              store.createIndex("guid", "guid", { unique: true });
              store.createIndex("library_id", "library_id", { unique: false });
              store.createIndex("deck_id", "deck_id", { unique: false });
              store.createIndex("file_name", "file_name", { unique: false });
            } else if (s === "libraries") {
              store.createIndex("root_path", "root_path", { unique: true });
            } else if (s === "notes") {
              store.createIndex("guid", "guid", { unique: true });
              store.createIndex("item_id", "item_id", { unique: false });
            } else if (s === "reviewHistory") {
              store.createIndex("item_id", "item_id", { unique: false });
            } else if (s === "links") {
              store.createIndex("source", ["source_type", "source_id"], { unique: false });
              store.createIndex("target", ["target_type", "target_id"], { unique: false });
            }
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode) {
    if (idb && !_db) {
      throw new Error("DB.tx() called before DB.init(). _db is null — did you await DB.init() first?");
    }
    const t = _db.transaction(store, mode);
    return t.objectStore(store);
  }
  function preq(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ---------- In-memory backend ----------
  function memInit() {
    if (!_mem) {
      _mem = {};
      for (const s of STORES) _mem[s] = new Map();
    }
  }

  const api = {
    async init() {
      if (idb) {
        _db = await openIDB();
      } else {
        memInit();
      }
    },

    async add(store, obj) {
      const o = clone(obj);
      if (idb) {
        const key = await preq(tx(store, "readwrite").add(o));
        if (o.id === undefined) o.id = key;
        return o;
      }
      memInit();
      const map = _mem[store];
      if (o.id === undefined || o.id === null) {
        let max = 0;
        for (const v of map.values()) if (typeof v.id === "number" && v.id > max) max = v.id;
        o.id = max + 1;
      }
      map.set(o.id, clone(o));
      return clone(o);
    },

    async put(store, obj) {
      const o = clone(obj);
      if (idb) {
        await preq(tx(store, "readwrite").put(o));
        return o;
      }
      memInit();
      _mem[store].set(o.id, clone(o));
      return clone(o);
    },

    async get(store, id) {
      if (idb) return preq(tx(store, "readonly").get(id));
      memInit();
      return clone(_mem[store].get(id));
    },

    async delete(store, id) {
      if (idb) { await preq(tx(store, "readwrite").delete(id)); return; }
      memInit();
      _mem[store].delete(id);
    },

    async getAll(store) {
      if (idb) return preq(tx(store, "readonly").getAll());
      memInit();
      return Array.from(_mem[store].values()).map(clone);
    },

    async count(store) {
      if (idb) return preq(tx(store, "readonly").count());
      memInit();
      return _mem[store].size;
    },

    async clear(store) {
      if (idb) { await preq(tx(store, "readwrite").clear()); return; }
      memInit();
      _mem[store].clear();
    },
  };

  return api;
});
