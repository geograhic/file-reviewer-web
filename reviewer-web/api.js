/*
 * api.js — Client-side backend for the web build.
 *
 * Replaces the Python `app.py` HTTP server. It exposes window.LocalAPI with:
 *   - request(path, options) : fetch-like router for every /api/* endpoint the UI uses.
 *   - importFolder(fileList, deckId) / importFiles(fileList, deckId) : ingest a folder or files.
 *   - openFile(id) / openNoteFile(id) : open content inline / as download.
 *   - exportCsv() / exportPortable() / exportProfile() / exportShare() : client-side downloads.
 *   - importProfilePackage(file) / installPluginFiles(fileList, enable) : client-side ingestion.
 *   - install() : monkeypatch window.fetch so the unchanged app.js api() just works.
 *
 * Storage is IndexedDB in the browser and in-memory Maps under Node (no indexedDB global),
 * via db.js. Scheduling is ported 1:1 in scheduler.js (verified bit-identical to Python).
 *
 * No network calls are made. All data stays on the user's device.
 */
(function (root, factory) {
  const api = factory(
    root.DB,
    root.Scheduler,
    typeof indexedDB !== "undefined" ? indexedDB : null,
    typeof document !== "undefined" ? document : null,
    typeof window !== "undefined" ? window : null,
    typeof navigator !== "undefined" ? navigator : null,
    typeof Blob !== "undefined" ? Blob : null,
    typeof URL !== "undefined" ? URL : null
  );
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.LocalAPI = api;
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function (DB, Scheduler, idb, doc, win, nav, BlobCtor, URLCtor) {
    "use strict";

    const RATING_LABELS = Scheduler.RATING_LABELS;
    const DEFAULT_CONFIG = Scheduler.DEFAULT_CONFIG;
    const APP_NAME = "智能文件复习系统 2.0 WebUI";
    const APP_VERSION = DEFAULT_CONFIG.version;
    const SCHEMA_VERSION = 7;

    // ---------- storage philosophy: INDEX-ONLY by default ----------
    // Mirrors the desktop app: we store metadata + an open handle, never the
    // file bytes. Originals stay on the user's own disk ("只索引、不移动原始资料").
    //   - Chromium: File System Access API -> we persist a FileSystemFileHandle
    //     (structured-cloneable in IndexedDB); re-opening reads the ORIGINAL on
    //     demand. Zero bytes stored.
    //   - Other browsers: <input> gives a File valid only this session; we keep it
    //     in sessionFiles (non-persistent) so open works until reload.
    //   - The only opt-in byte storage is the "导出迁移包 / 离线副本" path.
    const hasFSA = !!(win && (typeof win.showDirectoryPicker === "function" || typeof win.showOpenFilePicker === "function"));
    const sessionFiles = new Map(); // item_id -> File (non-persistent, same session only)

    // ---------- helpers ----------
    function nowIso() {
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      return (
        d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
        "T" + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds())
      );
    }
    function todayIso() {
      return new Date().toISOString().slice(0, 10);
    }
    function clamp(value, low, high) {
      value = parseFloat(value);
      if (Number.isNaN(value)) value = low;
      return Math.max(low, Math.min(high, value));
    }
    function humanSize(num) {
      num = Number(num) || 0;
      if (num < 1024) return num + " B";
      const units = ["KB", "MB", "GB", "TB"];
      let i = -1;
      do {
        num /= 1024;
        i++;
      } while (num >= 1024 && i < units.length - 1);
      return num.toFixed(num < 10 ? 1 : 0) + " " + units[i];
    }
    function extOf(name) {
      const m = /\.[^.\\/]+$/.exec(String(name || ""));
      return m ? m[0].toLowerCase() : "";
    }
    function safeTitle(value, def) {
      const cleaned = String(value || "").trim().replace(/\s+/g, " ");
      return cleaned || def || "note";
    }
    function cleanHex(value) {
      const color = String(value || "#2563eb").trim();
      if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
      return "#2563eb";
    }
    function coerceInt(value) {
      if (value === null || value === undefined || value === "" || value === 0 || value === "0") return null;
      const n = parseInt(value, 10);
      return n > 0 ? n : null;
    }
    function uuid() {
      if (win && win.crypto && win.crypto.randomUUID) return win.crypto.randomUUID();
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    function deepMerge(base, override) {
      const result = Object.assign({}, base);
      for (const key of Object.keys(override || {})) {
        const val = override[key];
        if (val && typeof val === "object" && !Array.isArray(val) && result[key] && typeof result[key] === "object") {
          result[key] = deepMerge(result[key], val);
        } else {
          result[key] = val;
        }
      }
      return result;
    }
    function normalizeConfig(config) {
      config = deepMerge(DEFAULT_CONFIG, config || {});
      config.version = APP_VERSION;
      config.plugins = config.plugins || {};
      config.plugins.core = Object.assign(
        { achievement_core: true, social_profile: true, learning_stats: true },
        config.plugins.core || {}
      );
      config.social = Object.assign({}, DEFAULT_CONFIG.social, config.social || {});
      return config;
    }

    // ---------- time / preview ----------
    function makePreviewUrl(id, kind) {
      // kind: "file" | "note"
      // We can't return a real blob URL synchronously here for lists; for single-item
      // fetches (review start / file open) LocalAPI attaches a real object URL.
      return "__preview__/" + kind + "/" + id;
    }

    function dueState(row, now) {
      const dueAt = row.due_at ? new Date(row.due_at) : now;
      if (parseInt(row.review_count || 0, 10) === 0) return "new";
      return dueAt <= now ? "due" : "future";
    }

    function rowItem(row, now) {
      now = now || new Date();
      const reviewCount = parseInt(row.review_count || 0, 10);
      const dueAt = row.due_at ? new Date(row.due_at) : now;
      const retr = Scheduler.currentRetrievability(row, now);
      return {
        id: row.id,
        guid: row.guid,
        library_id: row.library_id,
        deck_id: row.deck_id,
        root_path: row.root_path,
        relative_path: row.relative_path,
        file_path: row.file_path,
        file_name: row.file_name,
        ext: row.ext,
        size_bytes: row.size_bytes || 0,
        size: humanSize(row.size_bytes || 0),
        modified_at: row.modified_at,
        added_at: row.added_at,
        updated_at: row.updated_at,
        status: row.status || "active",
        tags: row.tags || "",
        priority: parseInt(row.priority || 0, 10),
        notes: row.notes || "",
        due_at: row.due_at,
        due_label: (row.due_at || nowIso()).slice(0, 16).replace("T", " "),
        due_state: dueState(row, now),
        interval_days: parseFloat(row.interval_days || 0),
        ease_factor: parseFloat(row.ease_factor || 2.5),
        stability: parseFloat(row.stability || 2.5),
        difficulty: parseFloat(row.difficulty || 5.0),
        retrievability: Math.round(retr * 1000) / 1000,
        review_count: reviewCount,
        lapse_count: parseInt(row.lapse_count || 0, 10),
        total_read_seconds: parseInt(row.total_read_seconds || 0, 10),
        last_review_at: row.last_review_at,
        pinned: !!row.pinned,
        exists: true,
        preview_available: false,
        preview_url: makePreviewUrl(row.id, "file"),
      };
    }

    function noteRowToDict(row) {
      return {
        id: row.id,
        guid: row.guid,
        item_id: row.item_id,
        title: row.title,
        file_path: row.file_path,
        created_at: row.created_at,
        updated_at: row.updated_at,
        source: row.source || "app",
        exists: true,
        size: "0 B",
      };
    }

    function deckRowToDict(row) {
      return {
        id: row.id,
        name: row.name,
        parent_id: row.parent_id ?? null,
        description: row.description || "",
        color: row.color || "#2563eb",
        is_default: !!row.is_default,
        sort_order: parseInt(row.sort_order || 0, 10),
        created_at: row.created_at,
        updated_at: row.updated_at,
        item_count: parseInt(row.item_count || 0, 10),
        due_count: parseInt(row.due_count || 0, 10),
      };
    }

    function deckFullName(deck, byId) {
      const names = [deck.name];
      let parentId = deck.parent_id;
      let guard = 0;
      while (parentId && byId[parentId] && guard < 50) {
        names.push(byId[parentId].name);
        parentId = byId[parentId].parent_id;
        guard++;
      }
      return names.reverse().join(" / ");
    }

    function orderDeckTree(decks) {
      const byParent = {};
      decks.forEach((d) => {
        const key = d.parent_id ?? null;
        (byParent[key] = byParent[key] || []).push(d);
      });
      Object.values(byParent).forEach((rows) =>
        rows.sort((a, b) =>
          (parseInt(a.sort_order) || 0) - (parseInt(b.sort_order) || 0) ||
          String(a.name).localeCompare(String(b.name), "zh-Hans-CN") ||
          a.id - b.id
        )
      );
      const ordered = [];
      const seen = new Set();
      function visit(parentId, depth) {
        (byParent[parentId] || []).forEach((d) => {
          if (seen.has(d.id)) return;
          seen.add(d.id);
          d.depth = depth;
          ordered.push(d);
          visit(d.id, depth + 1);
        });
      }
      visit(null, 0);
      visit(0, 0);
      decks
        .sort((a, b) =>
          (parseInt(a.sort_order) || 0) - (parseInt(b.sort_order) || 0) ||
          String(a.name).localeCompare(String(b.name), "zh-Hans-CN")
        )
        .forEach((d) => {
          if (!seen.has(d.id)) {
            d.depth = 0;
            ordered.push(d);
          }
        });
      return ordered;
    }

    function libraryRow(row) {
      return {
        id: row.id,
        root_path: row.root_path,
        display_name: row.display_name,
        added_at: row.added_at,
        last_scan_at: row.last_scan_at,
        file_count: parseInt(row.file_count || 0, 10),
        exists: true,
      };
    }

    // ---------- state ----------
    let _config = null;
    let _defaultDeckId = null;

    async function ensureDefaultDeck() {
      let deck = await DB.getAll("decks");
      let def = deck.find((d) => d.is_default);
      if (!def) {
        def = await DB.add("decks", {
          name: "默认牌组",
          parent_id: null,
          description: "",
          color: "#2563eb",
          is_default: 1,
          sort_order: 0,
          created_at: nowIso(),
          updated_at: nowIso(),
        });
      }
      _defaultDeckId = def.id;
      return def.id;
    }

    async function ensureConfig() {
      if (_config) return _config;
      const stored = await DB.get("config", "config");
      _config = normalizeConfig(stored ? stored.value : null);
      return _config;
    }

    async function saveConfig(config) {
      _config = normalizeConfig(config);
      await DB.put("config", { key: "config", value: _config });
      return _config;
    }

    // ---------- import ----------
    async function ingestFiles(fileList, opts) {
      opts = opts || {};
      const deckId = opts.deckId ? parseInt(opts.deckId, 10) : null;
      const rootPath = opts.rootPath || "";
      const displayName = opts.displayName || rootPath || "导入资料";
      await ensureConfig();
      await ensureDefaultDeck();

      // create/reuse library
      let library = null;
      if (rootPath) {
        const libs = await DB.getAll("libraries");
        library = libs.find((l) => l.root_path === rootPath);
        if (!library) {
          library = await DB.add("libraries", {
            root_path: rootPath,
            display_name: displayName,
            added_at: nowIso(),
            last_scan_at: nowIso(),
            file_count: 0,
          });
        }
      }

      const added = [];
      const updated = [];
      const files = Array.from(fileList || []);
      const existing = await DB.getAll("items");
      const byPath = new Map(existing.map((it) => [it.file_path, it]));

      for (const file of files) {
        const rel = file.webkitRelativePath || file.relativePath || file.name;
        const filePath = rootPath ? rootPath + "/" + rel : rel;
        if (byPath.has(filePath)) {
          const it = byPath.get(filePath);
          it.size_bytes = file.size;
          it.file_name = file.name;
          it.updated_at = nowIso();
          await DB.put("items", it);
          sessionFiles.set(it.id, file); // keep this session's File ref (no bytes stored)
          updated.push(it.id);
          continue;
        }
        const item = await DB.add("items", {
          guid: uuid(),
          library_id: library ? library.id : null,
          deck_id: deckId || _defaultDeckId,
          root_path: rootPath,
          relative_path: rel,
          file_path: filePath,
          file_name: file.name,
          ext: extOf(file.name),
          size_bytes: file.size,
          modified_at: nowIso(),
          added_at: nowIso(),
          updated_at: nowIso(),
          status: "active",
          tags: "",
          priority: 0,
          notes: "",
          due_at: nowIso(),
          interval_days: 0,
          ease_factor: 2.5,
          stability: 2.5,
          difficulty: 5.0,
          retrievability: 1.0,
          review_count: 0,
          lapse_count: 0,
          total_read_seconds: 0,
          last_review_at: null,
          pinned: 0,
          content: null,
          content_type: null,
          file_handle: null,
        });
        added.push(item.id);
        byPath.set(filePath, item);
        sessionFiles.set(item.id, file); // keep this session's File ref (no bytes stored)
      }

      if (library) {
        const count = (await DB.getAll("items")).filter(
          (it) => it.library_id === library.id
        ).length;
        library.file_count = count;
        library.last_scan_at = nowIso();
        await DB.put("libraries", library);
      }
      return { added: added.length, updated: updated.length, library_id: library ? library.id : null };
    }

    // ---------- File System Access (Chromium): persist handles, not bytes ----------
    async function walkDir(dirHandle, base) {
      base = base || "";
      const out = [];
      for await (const [name, handle] of dirHandle.entries()) {
        const rel = base ? base + "/" + name : name;
        if (handle.kind === "directory") {
          out.push(...(await walkDir(handle, rel)));
        } else if (handle.kind === "file") {
          out.push({ rel, handle });
        }
      }
      return out;
    }

    async function ingestHandles(handleList, opts) {
      opts = opts || {};
      const deckId = opts.deckId ? parseInt(opts.deckId, 10) : null;
      const rootPath = opts.rootPath || "";
      const displayName = opts.displayName || rootPath || "导入资料";
      await ensureConfig();
      await ensureDefaultDeck();

      let library = null;
      if (rootPath) {
        const libs = await DB.getAll("libraries");
        library = libs.find((l) => l.root_path === rootPath);
        if (!library) {
          library = await DB.add("libraries", {
            root_path: rootPath, display_name: displayName,
            added_at: nowIso(), last_scan_at: nowIso(), file_count: 0,
          });
        }
      }

      const added = [];
      const updated = [];
      const existing = await DB.getAll("items");
      const byPath = new Map(existing.map((it) => [it.file_path, it]));

      for (const _entry of handleList) {
        const rel = _entry.rel;
        const handle = _entry.handle;
        const filePath = rootPath ? rootPath + "/" + rel : rel;
        const meta = await safeGetFileMeta(handle); // name/size/type only; bytes never stored
        if (byPath.has(filePath)) {
          const it = byPath.get(filePath);
          it.size_bytes = meta.size;
          it.file_name = meta.name;
          it.file_handle = handle;
          it.updated_at = nowIso();
          await DB.put("items", it);
          updated.push(it.id);
          continue;
        }
        const item = await DB.add("items", {
          guid: uuid(),
          library_id: library ? library.id : null,
          deck_id: deckId || _defaultDeckId,
          root_path: rootPath,
          relative_path: rel,
          file_path: filePath,
          file_name: meta.name,
          ext: extOf(meta.name),
          size_bytes: meta.size,
          modified_at: nowIso(),
          added_at: nowIso(),
          updated_at: nowIso(),
          status: "active",
          tags: "",
          priority: 0,
          notes: "",
          due_at: nowIso(),
          interval_days: 0,
          ease_factor: 2.5,
          stability: 2.5,
          difficulty: 5.0,
          retrievability: 1.0,
          review_count: 0,
          lapse_count: 0,
          total_read_seconds: 0,
          last_review_at: null,
          pinned: 0,
          content: null,
          content_type: null,
          file_handle: handle,
        });
        added.push(item.id);
        byPath.set(filePath, item);
      }

      if (library) {
        const count = (await DB.getAll("items")).filter((it) => it.library_id === library.id).length;
        library.file_count = count;
        library.last_scan_at = nowIso();
        await DB.put("libraries", library);
      }
      return { added: added.length, updated: updated.length, library_id: library ? library.id : null };
    }

    async function safeGetFileMeta(handle) {
      // Read name/size/type only; we never retain the bytes.
      try {
        const f = await handle.getFile();
        return { name: f.name, size: f.size, type: f.type };
      } catch (e) {
        return { name: (handle && handle.name) || "file", size: 0, type: "application/octet-stream" };
      }
    }

    // Resolve the actual File/Blob for an item, in priority order:
    //   1) persisted File System Access handle (Chromium, survives reload)
    //   2) in-session File reference (other browsers, this session only)
    //   3) opt-in offline copy (content bytes)
    //   4) null -> caller must prompt a re-pick
    async function resolveFile(id) {
      const row = await DB.get("items", parseInt(id, 10));
      if (!row) return null;
      if (row.file_handle && typeof row.file_handle.getFile === "function") {
        try { return await row.file_handle.getFile(); } catch (e) { /* fall through */ }
      }
      if (sessionFiles.has(row.id)) return sessionFiles.get(row.id);
      if (row.content) return new BlobCtor([row.content], { type: row.content_type || "application/octet-stream" });
      return null;
    }

    async function previewUrl(id) {
      const file = await resolveFile(id);
      if (!file || !win || !URLCtor || !BlobCtor) return null;
      return URLCtor.createObjectURL(new BlobCtor([file], { type: file.type || "application/octet-stream" }));
    }

    // ---------- query ----------
    function matchText(haystack, needles) {
      haystack = String(haystack || "").toLowerCase();
      return needles.every((n) => haystack.includes(n.toLowerCase()));
    }

    async function queryItems(params) {
      const search = (params.search || "").trim();
      const status = params.status || "active";
      const due = params.due || "all";
      const tag = (params.tag || "").trim();
      const libraryId = params.library_id || "";
      const deckId = params.deck_id || "";
      const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
      const pageSize = clamp(parseInt(params.page_size || "150", 10) || 150, 10, 500);
      const allowedSort = new Set([
        "file_name", "due_at", "added_at", "last_review_at", "review_count",
        "total_read_seconds", "priority", "size_bytes", "retrievability",
      ]);
      const sort = allowedSort.has(params.sort) ? params.sort : "due_at";
      const direction = String(params.direction || "asc").toLowerCase() === "desc" ? -1 : 1;

      let items = await DB.getAll("items");
      const now = new Date();
      if (status !== "all") items = items.filter((i) => (i.status || "active") === status);
      if (due === "due") items = items.filter((i) => (i.due_at ? new Date(i.due_at) <= now : true) && (i.status || "active") === "active");
      else if (due === "future") items = items.filter((i) => (i.due_at ? new Date(i.due_at) > now : false));
      else if (due === "new") items = items.filter((i) => parseInt(i.review_count || 0, 10) === 0);
      if (tag) items = items.filter((i) => matchText(i.tags, [tag]));
      if (libraryId) items = items.filter((i) => String(i.library_id) === String(libraryId));
      if (deckId) items = items.filter((i) => String(i.deck_id) === String(deckId));
      if (search) items = items.filter((i) => matchText([i.file_name, i.file_path, i.tags, i.notes], [search]));

      const total = items.length;
      items.sort((a, b) => {
        if ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
        let av = a[sort], bv = b[sort];
        if (typeof av === "string") av = av.toLowerCase();
        if (typeof bv === "string") bv = bv.toLowerCase();
        if (av < bv) return -1 * direction;
        if (av > bv) return 1 * direction;
        return a.id - b.id;
      });
      const startIdx = (page - 1) * pageSize;
      const pageItems = items.slice(startIdx, startIdx + pageSize).map((r) => rowItem(r, now));
      return { items: pageItems, total, page, page_size: pageSize };
    }

    async function listDecks() {
      const rows = await DB.getAll("decks");
      const items = await DB.getAll("items");
      const now = new Date();
      const decks = rows.map((d) => {
        const dd = deckRowToDict(d);
        dd.item_count = items.filter((i) => i.deck_id === d.id).length;
        dd.due_count = items.filter(
          (i) => i.deck_id === d.id && (i.status || "active") === "active" && (i.due_at ? new Date(i.due_at) <= now : false)
        ).length;
        return dd;
      });
      const byId = {};
      decks.forEach((d) => (byId[d.id] = d));
      decks.forEach((d) => (d.full_name = deckFullName(d, byId)));
      return { decks: orderDeckTree(decks) };
    }

    // ---------- review ----------
    async function startReview(itemId) {
      await ensureConfig();
      let row = null;
      const now = new Date();
      if (itemId) {
        row = await DB.get("items", parseInt(itemId, 10));
      } else {
        const items = (await DB.getAll("items"))
          .filter((i) => (i.status || "active") === "active" && (i.due_at ? new Date(i.due_at) <= now : true))
          .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(a.due_at) - new Date(b.due_at) || a.id - b.id);
        row = items[0] || null;
      }
      if (!row) return { item: null, session_id: null };
      const sessionId = uuid();
      await DB.add("reviewSessions", {
        id: sessionId,
        item_id: row.id,
        started_at: nowIso(),
        ended_at: null,
      });
      const item = await attachPreview(rowItem(row, now));
      return { item, session_id: sessionId };
    }

    async function finishReview(payload) {
      const itemId = parseInt(payload.item_id, 10);
      const rating = clamp(parseInt(payload.rating ?? 2, 10), 0, 3);
      const sessionId = payload.session_id;
      const clientDuration = parseInt(payload.duration_seconds || 0, 10);
      await ensureConfig();
      const row = await DB.get("items", itemId);
      if (!row) throw new Error("复习项目不存在");
      let startedAt = null;
      if (sessionId) {
        const sess = await DB.get("reviewSessions", sessionId);
        if (sess) startedAt = sess.started_at;
      }
      const now = nowIso();
      let duration = clientDuration;
      if (startedAt) {
        const elapsed = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
        duration = Math.max(duration, elapsed);
      }
      const schedule = Scheduler.calculateSchedule(row, rating, _config);
      const lapseInc = schedule.lapse_inc || 0;
      row.due_at = schedule.due_at;
      row.interval_days = schedule.interval_days;
      row.ease_factor = schedule.ease_factor;
      row.stability = schedule.stability;
      row.difficulty = schedule.difficulty;
      row.retrievability = schedule.retrievability;
      row.review_count = (parseInt(row.review_count || 0, 10)) + 1;
      row.lapse_count = (parseInt(row.lapse_count || 0, 10)) + lapseInc;
      row.total_read_seconds = (parseInt(row.total_read_seconds || 0, 10)) + duration;
      row.last_review_at = now;
      row.updated_at = now;
      await DB.put("items", row);
      if (sessionId) await DB.put("reviewSessions", Object.assign(await DB.get("reviewSessions", sessionId), { ended_at: now }));
      await DB.add("reviewHistory", {
        item_id: itemId,
        session_id: sessionId,
        started_at: startedAt,
        ended_at: now,
        duration_seconds: duration,
        rating,
        rating_label: RATING_LABELS[rating],
        algorithm: schedule.algorithm,
        scheduled_days: schedule.interval_days,
        ease_factor: schedule.ease_factor,
        stability: schedule.stability,
        difficulty: schedule.difficulty,
        retrievability: schedule.retrievability,
      });
      const item = await attachPreview(rowItem(row, new Date()));
      return { item, schedule, duration_seconds: duration };
    }

    // ---------- items update / delete ----------
    async function updateItems(payload) {
      const ids = (payload.ids || []).map((i) => parseInt(i, 10));
      const fields = payload.fields || {};
      const allowed = new Set(["tags", "status", "priority", "notes", "pinned", "due_at", "deck_id"]);
      const now = nowIso();
      let updated = 0;
      for (const id of ids) {
        const row = await DB.get("items", id);
        if (!row) continue;
        for (const key of Object.keys(fields)) {
          if (!allowed.has(key)) continue;
          let v = fields[key];
          if (key === "deck_id") v = parseInt(v, 10);
          if (key === "pinned") v = v ? 1 : 0;
          row[key] = v;
        }
        row.updated_at = now;
        await DB.put("items", row);
        updated++;
      }
      return { updated };
    }

    async function deleteItems(payload) {
      const ids = (payload.ids || []).map((i) => parseInt(i, 10));
      for (const id of ids) await DB.delete("items", id);
      return { deleted: ids.length };
    }

    // ---------- decks CRUD ----------
    async function createDeck(payload) {
      const name = safeTitle(payload.name, "新牌组") || "新牌组";
      const now = nowIso();
      const parentId = coerceInt(payload.parent_id);
      const row = await DB.add("decks", {
        name,
        parent_id: parentId,
        description: String(payload.description || "").slice(0, 500),
        color: cleanHex(payload.color),
        is_default: 0,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      });
      return { deck: deckRowToDict(row) };
    }
    async function updateDeck(payload) {
      const deckId = parseInt(payload.id, 10);
      const row = await DB.get("decks", deckId);
      if (!row) throw new Error("Deck not found");
      if ("name" in payload) row.name = safeTitle(payload.name, row.name);
      if ("description" in payload) row.description = String(payload.description || "").slice(0, 500);
      if ("color" in payload) row.color = cleanHex(payload.color);
      if ("parent_id" in payload) row.parent_id = coerceInt(payload.parent_id);
      if ("sort_order" in payload) row.sort_order = parseInt(payload.sort_order || 0, 10);
      row.updated_at = nowIso();
      await DB.put("decks", row);
      return { updated: 1, deck: deckRowToDict(row) };
    }
    async function reorderDecks(payload) {
      const rows = payload.decks || [];
      const now = nowIso();
      const existing = (await DB.getAll("decks")).map((d) => d.id);
      const seen = new Set();
      for (const raw of rows) {
        const id = parseInt(raw.id, 10);
        if (id <= 0 || seen.has(id) || !existing.includes(id)) continue;
        seen.add(id);
        const row = await DB.get("decks", id);
        if (!row) continue;
        row.parent_id = coerceInt(raw.parent_id);
        row.sort_order = parseInt(raw.sort_order != null ? raw.sort_order : 0, 10);
        row.updated_at = now;
        await DB.put("decks", row);
      }
      return listDecks();
    }
    async function deleteDeck(payload) {
      const deckId = parseInt(payload.id, 10);
      const row = await DB.get("decks", deckId);
      if (!row) throw new Error("Deck not found");
      if (row.is_default) throw new Error("Default deck cannot be deleted");
      await ensureDefaultDeck();
      (await DB.getAll("items"))
        .filter((i) => i.deck_id === deckId)
        .forEach(async (i) => {
          i.deck_id = _defaultDeckId;
          i.updated_at = nowIso();
          await DB.put("items", i);
        });
      await DB.delete("decks", deckId);
      return { deleted: 1, moved_to_deck_id: _defaultDeckId };
    }

    // ---------- libraries ----------
    async function listLibraries() {
      const rows = await DB.getAll("libraries");
      return rows.map(libraryRow);
    }
    async function deleteLibrary(payload) {
      const libraryId = parseInt(payload.id, 10);
      const row = await DB.get("libraries", libraryId);
      if (!row) throw new Error("Library not found");
      const items = await DB.getAll("items");
      const removed = items.filter((i) => i.library_id === libraryId).length;
      for (const i of items.filter((x) => x.library_id === libraryId)) await DB.delete("items", i.id);
      await DB.delete("libraries", libraryId);
      return { deleted: 1, library_id: libraryId, removed_items: removed };
    }
    async function scanAll() {
      const libs = await DB.getAll("libraries");
      const scans = libs.map((l) => ({ library_id: l.id, added: 0, updated: 0 }));
      return { scans, missing: [] };
    }

    // ---------- notes ----------
    async function listNotes(itemId) {
      let rows = await DB.getAll("notes");
      if (itemId) rows = rows.filter((n) => n.item_id === parseInt(itemId, 10));
      rows.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at) || b.id - a.id);
      return { notes: rows.map(noteRowToDict) };
    }
    async function readNote(noteId) {
      const row = await DB.get("notes", parseInt(noteId, 10));
      if (!row) throw new Error("笔记不存在");
      const note = noteRowToDict(row);
      note.content = row.content || "";
      return { note };
    }
    async function createNote(payload) {
      const now = nowIso();
      const itemId = payload.item_id ? parseInt(payload.item_id, 10) : null;
      let title = safeTitle(payload.title, "新建笔记");
      let linkedLine = "";
      if (itemId) {
        const item = await DB.get("items", itemId);
        if (item && (title === "新建笔记" || !title.includes("复习笔记"))) title = item.file_name + " 复习笔记";
      }
      const content = payload.content != null ? payload.content : "# " + title + "\n\n创建时间：" + now + linkedLine + "\n";
      const row = await DB.add("notes", {
        guid: uuid(),
        item_id: itemId,
        title,
        file_path: "notes/" + title + ".md",
        created_at: now,
        updated_at: now,
        source: payload.source || "app",
        content,
      });
      return { note: noteRowToDict(row) };
    }
    async function saveNote(payload) {
      const noteId = parseInt(payload.id, 10);
      const row = await DB.get("notes", noteId);
      if (!row) throw new Error("笔记不存在");
      row.title = safeTitle(payload.title, row.title);
      row.content = payload.content || "";
      row.updated_at = nowIso();
      await DB.put("notes", row);
      return { note: noteRowToDict(row) };
    }
    async function deleteNotes(payload) {
      const ids = (payload.ids || []).map((i) => parseInt(i, 10));
      for (const id of ids) await DB.delete("notes", id);
      return { deleted: ids.length, deleted_files: 0, missing_files: 0, errors: [] };
    }
    async function exportNotes(payload) {
      const ids = (payload.ids || []).map((i) => parseInt(i, 10));
      const rows = (await DB.getAll("notes")).filter((n) => ids.includes(n.id));
      const files = rows.map((n) => ({ name: n.title + ".md", content: n.content || "" }));
      if (BlobCtor && win) triggerDownload(new BlobCtor([files.map((f) => "# " + f.name + "\n\n" + f.content).join("\n\n---\n\n")], { type: "text/markdown" }), "notes_export.md");
      return { export_dir: "(browser-download)", exported: rows.length, missing: 0, files: files.map((f) => f.name) };
    }

    // ---------- links ----------
    function summaryOf(kind, obj) {
      if (!obj) return null;
      if (kind === "note") return { id: obj.id, type: "note", label: obj.title, path: obj.file_path, ext: ".md", preview_url: makePreviewUrl(obj.id, "note"), exists: true };
      return { id: obj.id, type: "item", label: obj.file_name, path: obj.file_path, ext: obj.ext, preview_url: makePreviewUrl(obj.id, "file"), exists: true };
    }
    async function sourceSummary(type, id) {
      return type === "note"
        ? summaryOf("note", await DB.get("notes", parseInt(id, 10)))
        : summaryOf("item", await DB.get("items", parseInt(id, 10)));
    }
    async function createLink(payload) {
      const sourceType = String(payload.source_type || "").trim();
      const targetType = String(payload.target_type || "").trim();
      if (!["item", "note"].includes(sourceType) || !["item", "note"].includes(targetType)) throw new Error("invalid link types");
      const sourceId = parseInt(payload.source_id, 10);
      const targetId = parseInt(payload.target_id, 10);
      if (sourceId <= 0 || targetId <= 0) throw new Error("link source/target required");
      const source = await sourceSummary(sourceType, sourceId);
      const target = await sourceSummary(targetType, targetId);
      if (!source) throw new Error("link source not found");
      if (!target) throw new Error("link target not found");
      const row = await DB.add("links", {
        guid: uuid(),
        source_type: sourceType,
        source_id: sourceId,
        source_label: source.label,
        selected_text: String(payload.selected_text || "").slice(0, 2000),
        target_type: targetType,
        target_id: targetId,
        target_label: target.label,
        note: String(payload.note || "").slice(0, 1000),
        created_at: nowIso(),
      });
      return {
        link: {
          id: row.id, guid: row.guid, source_type: row.source_type, source_id: row.source_id,
          source_label: row.source_label, selected_text: row.selected_text, target_type: row.target_type,
          target_id: row.target_id, target_label: row.target_label, note: row.note, created_at: row.created_at,
          source, target,
        },
      };
    }
    async function listLinks(params) {
      let rows = await DB.getAll("links");
      if (params.source_type) rows = rows.filter((r) => r.source_type === params.source_type);
      if (params.source_id) rows = rows.filter((r) => String(r.source_id) === String(params.source_id));
      if (params.target_type) rows = rows.filter((r) => r.target_type === params.target_type);
      if (params.target_id) rows = rows.filter((r) => String(r.target_id) === String(params.target_id));
      rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id - a.id);
      const links = await Promise.all(
        rows.slice(0, 300).map(async (r) => ({
          id: r.id, guid: r.guid, source_type: r.source_type, source_id: r.source_id,
          source_label: r.source_label, selected_text: r.selected_text, target_type: r.target_type,
          target_id: r.target_id, target_label: r.target_label, note: r.note, created_at: r.created_at,
          source: await sourceSummary(r.source_type, r.source_id),
          target: await sourceSummary(r.target_type, r.target_id),
        }))
      );
      return { links };
    }
    async function deleteLink(payload) {
      const id = parseInt(payload.id, 10);
      await DB.delete("links", id);
      return { deleted: 1 };
    }
    async function searchLinkTargets(params) {
      const q = (params.q || "").trim();
      const limit = clamp(parseInt(params.limit || 30, 10), 1, 80);
      const pattern = q.toLowerCase();
      const items = (await DB.getAll("items"))
        .filter((i) => !q || [i.file_name, i.file_path, i.tags].join(" ").toLowerCase().includes(pattern))
        .slice(0, limit)
        .map((i) => ({ id: i.id, label: i.file_name, path: i.file_path, ext: i.ext, type: "item", exists: true }));
      const notes = (await DB.getAll("notes"))
        .filter((n) => !q || [n.title, n.file_path].join(" ").toLowerCase().includes(pattern))
        .slice(0, limit)
        .map((n) => ({ id: n.id, label: n.title, path: n.file_path, ext: ".md", type: "note", exists: true }));
      return { targets: items.concat(notes).slice(0, limit) };
    }

    // ---------- tree ----------
    async function treeForLibrary(libraryId, rel) {
      rel = rel || "";
      const library = await DB.get("libraries", parseInt(libraryId, 10));
      if (!library) throw new Error("文件库不存在");
      const root = library.root_path;
      const items = (await DB.getAll("items")).filter((i) => i.library_id === parseInt(libraryId, 10));
      const indexed = new Map(items.map((i) => [i.file_path, i.id]));
      const childMap = new Map(); // dir rel -> list
      for (const it of items) {
        const fullRel = it.relative_path || it.file_path.slice(root.length + 1);
        const parts = fullRel.split("/");
        // only list top-level files directly under rel
        if (parts.length === 1) {
          childMap.set(fullRel, { name: it.file_name, path: it.file_path, rel: fullRel, is_dir: false, size: humanSize(it.size_bytes), ext: it.ext, indexed_id: indexed.get(it.file_path) || "" });
        }
      }
      const children = Array.from(childMap.values());
      children.sort((a, b) => (a.is_dir === b.is_dir ? String(a.name).localeCompare(String(b.name), "zh-Hans-CN") : a.is_dir ? -1 : 1));
      return { library: libraryRow(library), rel, children };
    }

    // ---------- overview ----------
    async function getOverview() {
      await ensureConfig();
      await ensureDefaultDeck();
      const now = new Date();
      const nowStr = nowIso();
      const today = todayIso();
      const items = await DB.getAll("items");
      const stats = {
        total: items.length,
        active: items.filter((i) => (i.status || "active") === "active").length,
        due: items.filter((i) => (i.status || "active") === "active" && (i.due_at ? new Date(i.due_at) <= now : false)).length,
        new: items.filter((i) => (i.status || "active") === "active" && parseInt(i.review_count || 0, 10) === 0).length,
        suspended: items.filter((i) => (i.status || "active") === "suspended").length,
        seconds: items.reduce((s, i) => s + (parseInt(i.total_read_seconds || 0, 10)), 0),
        reviewed_today: 0,
        seconds_today: 0,
      };
      const history = await DB.getAll("reviewHistory");
      stats.reviewed_today = history.filter((h) => (h.ended_at || "").slice(0, 10) === today).length;
      stats.seconds_today = history.filter((h) => (h.ended_at || "").slice(0, 10) === today).reduce((s, h) => s + (h.duration_seconds || 0), 0);
      const dueRows = items
        .filter((i) => (i.status || "active") === "active" && (i.due_at ? new Date(i.due_at) <= now : false))
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(a.due_at) - new Date(b.due_at) || a.id - b.id)
        .slice(0, 12);
      const dates = new Set(history.map((h) => (h.ended_at || "").slice(0, 10)));
      let streak = 0;
      let cursor = new Date();
      cursor.setHours(0, 0, 0, 0);
      while (dates.has(cursor.toISOString().slice(0, 10))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }
      const decks = (await listDecks()).decks;
      const libraries = await listLibraries();
      return {
        app: {
          name: APP_NAME,
          version: APP_VERSION,
          app_dir: "browser-local",
          default_app_dir: "browser-local",
          profile_pointer_path: "browser-local",
          config_path: "browser-local (IndexedDB)",
          db_path: "browser-local (IndexedDB)",
          log_path: "browser-local",
          backup_dir: "browser-local",
          plugins_dir: "browser-local",
          default_notes_dir: "browser-local (Notes)",
          notes_dir: "browser-local (Notes)",
          export_dir: "browser-local (downloads)",
        },
        stats: Object.assign(stats, { streak }),
        due_items: dueRows.map((r) => rowItem(r, now)),
        future_due: [],
        libraries,
        decks,
        achievements: { unlocked: 0, total: 0, points: 0, reward: { level: 0, name: "", min_points: 0 } },
        learning_stats: { enabled: true, totals: { items: stats.total, reviews: history.length, seconds: stats.seconds } },
        config: _config,
        plugins: await listPlugins(),
        social: await getSocialProfile(),
        now: nowStr,
      };
    }

    // ---------- plugins ----------
    async function listPlugins() {
      const config = await ensureConfig();
      const plugins = [
        { id: "achievement_core", name: "成就核心", version: APP_VERSION, enabled: !!(config.plugins.core && config.plugins.core.achievement_core), source: "core", category: "core", description: "成就系统核心", path: "core", builtin: true, configurable: false },
        { id: "social_profile", name: "社交资料", version: APP_VERSION, enabled: !!(config.plugins.core && config.plugins.core.social_profile), source: "core", category: "core", description: "本地社交资料卡", path: "core", builtin: true, configurable: false },
        { id: "learning_stats", name: "学习统计", version: APP_VERSION, enabled: !!(config.plugins.core && config.plugins.core.learning_stats), source: "core", category: "core", description: "复习统计", path: "core", builtin: true, configurable: false },
      ];
      const installed = (await DB.getAll("plugins")).map((p) => ({ id: p.id, name: p.name, version: p.version || "", enabled: !!p.enabled, source: p.source || "external", category: p.category || "", description: p.description || p.path || "", path: p.path || "", builtin: false, configurable: true }));
      return { plugins: plugins.concat(installed), plugins_dir: "browser-local" };
    }
    async function togglePlugin(payload) {
      const id = payload.id;
      const enabled = !!payload.enabled;
      const config = await ensureConfig();
      if (!config.plugins.core) config.plugins.core = {};
      if (config.plugins.core[id] !== undefined) {
        config.plugins.core[id] = enabled;
      } else {
        const existing = await DB.get("plugins", id);
        if (existing) {
          existing.enabled = enabled;
          await DB.put("plugins", existing);
        } else {
          await DB.put("plugins", { id, name: id, enabled, source: "external", category: "", description: "" });
        }
      }
      await saveConfig(config);
      return listPlugins();
    }
    async function installPluginFiles(fileList, enable) {
      const files = Array.from(fileList || []);
      for (const f of files) {
        let name = f.name.replace(/\.zip$/i, "").replace(/\.json$/i, "");
        if (f.name.toLowerCase().endsWith(".json")) {
          try { name = (JSON.parse(await f.text()) || {}).id || name; } catch (e) { /* keep name */ }
        }
        await DB.put("plugins", { id: name, name, enabled: !!enable, source: "external", category: "", description: "", path: f.name });
      }
      return listPlugins();
    }

    // ---------- social ----------
    async function getSocialProfile() {
      const config = await ensureConfig();
      const profile = Object.assign({}, DEFAULT_CONFIG.social, config.social || {});
      return { enabled: true, profile };
    }
    async function saveSocialProfile(payload) {
      const config = await ensureConfig();
      const incoming = payload.profile || payload;
      const allowedText = ["display_name", "handle", "bio", "location", "website", "contact"];
      const allowedBool = ["share_stats", "share_achievements", "allow_friend_discovery"];
      if (!config.social) config.social = {};
      allowedText.forEach((k) => { if (k in incoming) config.social[k] = String(incoming[k] || "").slice(0, 500); });
      allowedBool.forEach((k) => { if (k in incoming) config.social[k] = !!incoming[k]; });
      await saveConfig(config);
      return getSocialProfile();
    }
    async function socialCard() {
      const profile = await getSocialProfile();
      const overview = await getOverview();
      return {
        format: "LiFileReviewerSocialCard",
        format_version: 1,
        app_version: APP_VERSION,
        exported_at: nowIso(),
        enabled: profile.enabled,
        profile: {
          display_name: profile.profile.display_name || "",
          handle: profile.profile.handle || "",
          bio: profile.profile.bio || "",
          location: profile.profile.location || "",
          website: profile.profile.website || "",
          contact: profile.profile.contact || "",
          allow_friend_discovery: !!profile.profile.allow_friend_discovery,
        },
        stats: { total: overview.stats.total, reviewed_today: overview.stats.reviewed_today, streak: overview.stats.streak },
      };
    }

    // ---------- health ----------
    async function healthCheck() {
      const items = await DB.getAll("items");
      const checks = [
        { name: "数据存储", ok: true, detail: "IndexedDB (browser-local)" },
        { name: "配置", ok: true, detail: "本地配置已就绪" },
        { name: "索引记录", ok: true, detail: items.length + " 条资料记录" },
        { name: "插件核心", ok: true, detail: "成就/社交/统计 已启用" },
      ];
      const ok = checks.every((c) => c.ok);
      return { ok, checked_at: nowIso(), app_version: APP_VERSION, schema_version: SCHEMA_VERSION, checks, report_path: "browser-local" };
    }

    // ---------- exports ----------
    function triggerDownload(blob, filename) {
      if (!win || !doc || !BlobCtor || !URLCtor) return null;
      const url = URLCtor.createObjectURL(blob);
      const a = doc.createElement("a");
      a.href = url;
      a.download = filename;
      doc.body.appendChild(a);
      a.click();
      setTimeout(() => { try { URLCtor.revokeObjectURL(url); } catch (e) {} doc.body.removeChild(a); }, 1000);
      return url;
    }
    async function exportCsv() {
      const items = await DB.getAll("items");
      const decks = await DB.getAll("decks");
      const deckName = (id) => { const d = decks.find((x) => x.id === id); return d ? d.name : ""; };
      const header = ["file_name", "file_path", "deck", "tags", "status", "due_at", "review_count", "lapse_count", "total_read_seconds", "last_review_at"];
      const lines = [header.join(",")];
      items.forEach((i) => {
        lines.push([
          i.file_name, i.file_path, deckName(i.deck_id), i.tags, i.status || "active", i.due_at, i.review_count || 0, i.lapse_count || 0, i.total_read_seconds || 0, i.last_review_at || "",
        ].map((v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"').join(","));
      });
      const csv = "﻿" + lines.join("\r\n");
      triggerDownload(new BlobCtor([csv], { type: "text/csv;charset=utf-8" }), "review_items_" + todayIso() + ".csv");
      return { export_path: "review_items_" + todayIso() + ".csv (download)" };
    }
    async function exportPortable() {
      const payload = {
        format: "LiFileReviewerPortable",
        format_version: 1,
        exported_at: nowIso(),
        app_version: APP_VERSION,
        schema_version: SCHEMA_VERSION,
        config: await ensureConfig(),
        libraries: await DB.getAll("libraries"),
        decks: await DB.getAll("decks"),
        items: (await DB.getAll("items")).map((i) => { const c = i; delete c.content; return c; }),
        review_history: await DB.getAll("reviewHistory"),
        notes: await DB.getAll("notes"),
        content_links: await DB.getAll("links"),
        achievements: await DB.getAll("achievements"),
        social_profile: [await getSocialProfile()],
        activity_events: await DB.getAll("activity"),
      };
      triggerDownload(new BlobCtor([JSON.stringify(payload, null, 2)], { type: "application/json" }), "review_portable_" + todayIso() + ".json");
      return { export_path: "review_portable_" + todayIso() + ".json (download)" };
    }
    async function exportProfile() {
      return exportPortable();
    }
    async function exportShare(payload) {
      const ids = (payload.ids || []).map((i) => parseInt(i, 10));
      const items = (await DB.getAll("items")).filter((i) => ids.includes(i.id) || (!ids.length && (payload.deck_id ? i.deck_id === parseInt(payload.deck_id, 10) : true)));
      const payloadOut = { format: "LiFileReviewerShare", exported_at: nowIso(), items: items.map((i) => ({ file_name: i.file_name, file_path: i.file_path, tags: i.tags, deck: i.deck_id }) ) };
      triggerDownload(new BlobCtor([JSON.stringify(payloadOut, null, 2)], { type: "application/json" }), "LiFileReviewer_share_" + todayIso() + ".zip.json");
      return { export_path: "LiFileReviewer_share_" + todayIso() + ".zip.json (download)" };
    }
    async function importProfilePackage(file) {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.config) await saveConfig(data.config);
      if (Array.isArray(data.items)) for (const it of data.items) await DB.add("items", Object.assign({ content: new ArrayBuffer(0), content_type: "application/octet-stream" }, it));
      if (Array.isArray(data.decks)) for (const d of data.decks) await DB.put("decks", d);
      if (Array.isArray(data.libraries)) for (const l of data.libraries) await DB.put("libraries", l);
      if (Array.isArray(data.notes)) for (const n of data.notes) await DB.put("notes", n);
      return { backup_before_import: "imported" };
    }

    // ---------- file open / preview ----------
    async function attachPreview(rowItemObj) {
      // Attach a real object URL when a local source is available. Resolves from
      // handle / session File / offline copy — file bytes are read on demand, not
      // pre-stored. If nothing resolvable, leave a placeholder + flag for re-pick.
      rowItemObj.preview_available = false;
      if (!win || !URLCtor || !BlobCtor) return rowItemObj;
      try {
        const url = await previewUrl(rowItemObj.id);
        if (url) {
          rowItemObj.preview_url = url;
          rowItemObj.preview_available = true;
        }
      } catch (e) { /* keep placeholder */ }
      return rowItemObj;
    }
    async function openFile(id) {
      const row = await DB.get("items", parseInt(id, 10));
      if (!row) return { ok: false, error: "文件不存在" };
      if (!win || !URLCtor || !BlobCtor) return { ok: false, error: "当前环境无法打开文件" };
      let file = await resolveFile(id);
      if (!file) {
        // No handle / session ref / offline copy: ask the user to re-point at the
        // original file (index-only model — we never silently copy it anywhere).
        const picked = await openDialog({});
        if (!picked || !picked.length) return { ok: true, cancelled: true };
        file = picked[0];
        sessionFiles.set(row.id, file); // remember for this session
      }
      const blob = new BlobCtor([file], { type: file.type || row.content_type || "application/octet-stream" });
      const url = URLCtor.createObjectURL(blob);
      if (win.open) {
        const tab = win.open(url, "_blank", "noopener");
        if (!tab) triggerDownload(blob, row.file_name);
      } else {
        triggerDownload(blob, row.file_name);
      }
      return { ok: true, url };
    }
    async function openNoteFile(id) {
      const row = await DB.get("notes", parseInt(id, 10));
      if (!row) throw new Error("笔记不存在");
      const content = row.content || "";
      if (!win || !URLCtor || !BlobCtor) return null;
      const blob = new BlobCtor([content], { type: "text/markdown" });
      const url = URLCtor.createObjectURL(blob);
      if (win.open) {
        const tab = win.open(url, "_blank", "noopener");
        if (!tab) triggerDownload(blob, (row.title || "note") + ".md");
      } else {
        triggerDownload(blob, (row.title || "note") + ".md");
      }
      return url;
    }

    // ---------- dialog-based endpoints (replace desktop folder/file pickers) ----------
    function openDialog(attrs) {
      return new Promise((resolve) => {
        if (!doc) { resolve(null); return; }
        const input = doc.createElement("input");
        input.type = "file";
        for (const k of Object.keys(attrs || {})) input.setAttribute(k, attrs[k]);
        input.style.position = "fixed";
        input.style.left = "-9999px";
        input.addEventListener("change", () => resolve(input.files), { once: true });
        input.addEventListener("cancel", () => resolve(null), { once: true });
        doc.body.appendChild(input);
        input.click();
        setTimeout(() => { if (input.parentNode) input.parentNode.removeChild(input); }, 60000);
      });
    }

    // ---------- request router ----------
    function parseBody(options) {
      let body = options.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
      }
      return body || {};
    }

    async function request(path, options = {}) {
      const method = (options.method || "GET").toUpperCase();
      const url = new URL(path, "http://local");
      const params = url.searchParams;
      const p = {};
      for (const k of params.keys()) {
        const all = params.getAll(k);
        p[k] = all.length > 1 ? all : all[0];
      }
      const body = method === "GET" ? p : parseBody(options);
      const seg = url.pathname.replace(/^\//, "").split("/");
      const head = seg[0];
      const sub = seg[1];
      const id = seg[1];

      let data = null;
      switch (true) {
        case head === "api" && sub === "health": data = await healthCheck(); break;
        case head === "api" && sub === "overview": data = await getOverview(); break;
        case head === "api" && sub === "common-paths": data = { paths: [] }; break;
        case head === "api" && sub === "items" && seg[2] === "open": data = await openFile(id); break;
        case head === "api" && sub === "items" && seg[2] === "open-with": data = await openFile(id); break;
        case head === "api" && sub === "items" && seg[2] === "open-folder": data = { ok: true }; break;
        case head === "api" && sub === "items" && seg[2] === "update": data = await updateItems(body); break;
        case head === "api" && sub === "items" && seg[2] === "delete": data = await deleteItems(body); break;
        case head === "api" && sub === "items": data = await queryItems(body); break;
        case head === "api" && sub === "libraries" && seg[2] === "select": {
          if (hasFSA) {
            try {
              const dirHandle = await win.showDirectoryPicker();
              const handles = await walkDir(dirHandle);
              const scan = await ingestHandles(handles, { rootPath: dirHandle.name, displayName: dirHandle.name, deckId: body.deck_id });
              data = { scan };
              break;
            } catch (e) {
              if (e && e.name === "AbortError") { data = { cancelled: true }; break; }
              // otherwise fall through to <input> fallback
            }
          }
          const files = await openDialog({ webkitdirectory: "", directory: "" });
          if (!files || !files.length) { data = { cancelled: true }; break; }
          const root = files[0].webkitRelativePath ? files[0].webkitRelativePath.split("/")[0] : "导入资料";
          const scan = await ingestFiles(files, { rootPath: root, displayName: root, deckId: body.deck_id });
          data = { scan };
          break;
        }
        case head === "api" && sub === "libraries" && seg[2] === "add": {
          const root = String(body.path || "").trim();
          data = { scan: { added: 0, updated: 0 } };
          break;
        }
        case head === "api" && sub === "libraries" && seg[2] === "delete": data = await deleteLibrary(body); break;
        case head === "api" && sub === "libraries" && seg[2] === "scan": data = await scanAll(); break;
        case head === "api" && sub === "libraries": data = { libraries: await listLibraries() }; break;
        case head === "api" && sub === "files" && seg[2] === "select": {
          if (hasFSA) {
            try {
              const handles = await win.showOpenFilePicker({ multiple: true });
              const list = [];
              for (const h of handles) list.push({ rel: h.name, handle: h });
              const scan = await ingestHandles(list, { deckId: body.deck_id });
              data = { file: { item: { file_name: handles[0] ? handles[0].name : "", file_path: handles[0] ? handles[0].name : "" } } };
              break;
            } catch (e) {
              if (e && e.name === "AbortError") { data = { cancelled: true }; break; }
            }
          }
          const files = await openDialog({ multiple: "" });
          if (!files || !files.length) { data = { cancelled: true }; break; }
          const scan = await ingestFiles(files, { deckId: body.deck_id });
          data = { file: { item: { file_name: files[0].name, file_path: files[0].name } } };
          break;
        }
        case head === "api" && sub === "decks" && seg[2] === "create": data = await createDeck(body); break;
        case head === "api" && sub === "decks" && seg[2] === "update": data = await updateDeck(body); break;
        case head === "api" && sub === "decks" && seg[2] === "reorder": data = await reorderDecks(body); break;
        case head === "api" && sub === "decks" && seg[2] === "delete": data = await deleteDeck(body); break;
        case head === "api" && sub === "decks": data = (await listDecks()); break;
        case head === "api" && sub === "review" && seg[2] === "start": data = await startReview(body.item_id); break;
        case head === "api" && sub === "review" && seg[2] === "finish": data = await finishReview(body); break;
        case head === "api" && sub === "history": data = { history: (await DB.getAll("reviewHistory")).filter((h) => h.item_id === parseInt(id, 10)).map((h) => ({ rating_label: h.rating_label, duration_seconds: h.duration_seconds, ended_at: h.ended_at, algorithm: h.algorithm, scheduled_days: h.scheduled_days })) }; break;
        case head === "api" && sub === "links" && seg[2] === "create": data = await createLink(body); break;
        case head === "api" && sub === "links" && seg[2] === "delete": data = await deleteLink(body); break;
        case head === "api" && sub === "links": data = await listLinks(body); break;
        case head === "api" && sub === "link-targets": data = await searchLinkTargets(body); break;
        case head === "api" && sub === "notes" && seg[2] === "create": data = await createNote(body); break;
        case head === "api" && sub === "notes" && seg[2] === "save": data = await saveNote(body); break;
        case head === "api" && sub === "notes" && seg[2] === "open": data = { ok: true }; break;
        case head === "api" && sub === "notes" && seg[2] === "export": data = await exportNotes(body); break;
        case head === "api" && sub === "notes" && seg[2] === "delete": data = await deleteNotes(body); break;
        case head === "api" && sub === "notes" && /^\d+$/.test(seg[2] || ""): data = await readNote(seg[2]); break;
        case head === "api" && sub === "notes": data = await listNotes(body.item_id); break;
        case head === "api" && sub === "tree": data = await treeForLibrary(body.library_id, body.rel); break;
        case head === "api" && sub === "settings": {
          if (method === "POST") { data = { config: await saveConfig(body.config) }; }
          else { data = { config: await ensureConfig() }; }
          break;
        }
        case head === "api" && sub === "export" && seg[2] === "save-as": data = { cancelled: false, path: "download" }; break;
        case head === "api" && sub === "export" && seg[2] === "select-dir": data = { cancelled: false, path: "downloads" }; break;
        case head === "api" && sub === "export": data = await exportCsv(); break;
        case head === "api" && sub === "export-portable": data = await exportPortable(); break;
        case head === "api" && sub === "export-profile": data = await exportProfile(); break;
        case head === "api" && sub === "share" && seg[2] === "export": data = await exportShare(body); break;
        case head === "api" && sub === "backup": data = { backup_path: "browser-local" }; break;
        case head === "api" && sub === "profile" && seg[2] === "select": data = { cancelled: false, path: "browser-local" }; break;
        case head === "api" && sub === "profile" && seg[2] === "move": data = { app: { app_dir: "browser-local" } }; break;
        case head === "api" && sub === "profile" && seg[2] === "select-package": {
          const file = await openDialog({});
          if (!file || !file.length) { data = { cancelled: true }; break; }
          data = { path: file[0].name };
          break;
        }
        case head === "api" && sub === "profile" && seg[2] === "import": data = await importProfilePackage(body._file); break;
        case head === "api" && sub === "plugins" && seg[2] === "import" && seg[3] === "select-folder": {
          const files = await openDialog({ webkitdirectory: "", directory: "" });
          data = files && files.length ? await installPluginFiles(files, body.enable) : { cancelled: true };
          break;
        }
        case head === "api" && sub === "plugins" && seg[2] === "import" && seg[3] === "select-file": {
          const files = await openDialog({ accept: ".zip,.json" });
          data = files && files.length ? await installPluginFiles(files, body.enable) : { cancelled: true };
          break;
        }
        case head === "api" && sub === "plugins" && seg[2] === "toggle": data = await togglePlugin(body); break;
        case head === "api" && sub === "plugins": data = await listPlugins(); break;
        case head === "api" && sub === "social" && seg[2] === "profile": data = await saveSocialProfile(body); break;
        case head === "api" && sub === "social" && seg[2] === "card": data = await socialCard(); break;
        case head === "api" && sub === "social": data = await getSocialProfile(); break;
        case head === "api" && sub === "path" && seg[2] === "open": data = { ok: true }; break;
        case head === "api" && sub === "learning-stats": data = { enabled: true, totals: { items: (await DB.getAll("items")).length } }; break;
        case head === "api" && sub === "achievements": data = { unlocked: 0, total: 0, points: 0 }; break;
        default:
          throw new Error("Unknown endpoint: " + path);
      }
      return makeResponse(data, 200);
    }

    function makeResponse(data, status) {
      const json = typeof data === "string" ? data : JSON.stringify(data);
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (k) => (k.toLowerCase() === "content-type" ? "application/json" : null) },
        json: async () => (typeof data === "string" ? JSON.parse(data) : data),
        text: async () => json,
        blob: async () => (BlobCtor ? new BlobCtor([json], { type: "application/json" }) : json),
      };
    }

    // ---------- install (monkeypatch fetch) ----------
    function install() {
      if (win && win.__localApiInstalled) return; // guard against double-patching
      if (win && typeof win.fetch === "function") {
        win.__localApiInstalled = true;
        const original = win.fetch.bind(win);
        win.fetch = function (input, init) {
          const url = typeof input === "string" ? input : input && input.url;
          if (url && String(url).startsWith("/api/")) return request(url, init || {});
          return original(input, init);
        };
        // Best-effort: ask the browser to keep our IndexedDB (metadata only) out
        // of its automatic eviction. No effect on storage quota, just durability.
        try {
          if (win.navigator && typeof win.navigator.storage === "object" && typeof win.navigator.storage.persist === "function") {
            win.navigator.storage.persist().catch(() => {});
          }
        } catch (e) { /* ignore */ }
      }
    }

    return {
      request,
      install,
      hasFSA,
      // ingestion
      importFolder: (fileList, deckId) => ingestFiles(fileList, { rootPath: fileList && fileList[0] && fileList[0].webkitRelativePath ? fileList[0].webkitRelativePath.split("/")[0] : "导入资料", deckId }),
      importFiles: (fileList, deckId) => ingestFiles(fileList, { deckId }),
      importHandles: (handleList, opts) => ingestHandles(handleList, opts || {}),
      // open / preview (index-only: resolves original on demand)
      openFile,
      openNoteFile,
      previewUrl,
      resolveFile,
      // exports
      exportCsv,
      exportPortable,
      exportProfile,
      exportShare,
      exportNotes,
      importProfilePackage,
      installPluginFiles,
      // internal helpers (used by tests)
      getOverview,
      queryItems,
      startReview,
      finishReview,
      createNote,
      readNote,
      saveNote,
      listNotes,
      deleteNotes,
      createLink,
      listLinks,
      deleteLink,
      searchLinkTargets,
      ensureConfig,
      ensureDefaultDeck,
      triggerDownload,
    };
  }
);
