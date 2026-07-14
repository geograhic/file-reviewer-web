/*
 * api.test.cjs — Integration test for the web backend (api.js).
 * Uses the in-memory DB fallback (no indexedDB global in Node) and the ported scheduler.
 */
const assert = require("assert");
const path = require("path");

const DB = require("../db.js");
const Scheduler = require("../scheduler.js");
const LocalAPI = require("../api.js");

// Fake "File" object usable in Node: provides name/size/type/webkitRelativePath/arrayBuffer().
function FakeFile(name, content, type, webkitRelativePath) {
  const buf = Buffer.from(content, "utf-8");
  return {
    name,
    size: buf.length,
    type: type || "text/plain",
    webkitRelativePath: webkitRelativePath || "",
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  ok  - " + name);
  } catch (e) {
    failed++;
    console.log("  FAIL- " + name + " :: " + (e && e.message));
    console.log(e.stack);
  }
}

async function post(sub, body) {
  return LocalAPI.request("/api/" + sub, { method: "POST", body: JSON.stringify(body || {}) });
}
async function get(sub) {
  return LocalAPI.request("/api/" + sub, { method: "GET" });
}
// helper to unwrap response.json()
// NOTE: get()/post() return Promises (request is async), so await the arg first.
async function j(resp) {
  return (await resp).json();
}

async function main() {
  await DB.init();
  await LocalAPI.ensureDefaultDeck();
  await LocalAPI.ensureConfig();

  await test("import folder creates library + items", async () => {
    const files = [
      FakeFile("a.txt", "hello a", "text/plain", "MyFolder/a.txt"),
      FakeFile("b.md", "# title\nbody", "text/markdown", "MyFolder/sub/b.md"),
      FakeFile("c.pdf", "%PDF-1.4 fake", "application/pdf", "MyFolder/c.pdf"),
    ];
    const res = await LocalAPI.importFolder(files, null);
    assert.strictEqual(res.added, 3, "added 3 items");
    const ov = await j(get("overview"));
    assert.strictEqual(ov.stats.total, 3, "overview total = 3");
    assert.ok(ov.libraries.length >= 1, "library created");
    assert.strictEqual(ov.libraries[0].file_count, 3);
  });

  await test("import single files (no folder)", async () => {
    const files = [FakeFile("standalone.txt", "solo", "text/plain", "")];
    const res = await LocalAPI.importFiles(files, null);
    assert.strictEqual(res.added, 1);
    const ov = await j(get("overview"));
    assert.strictEqual(ov.stats.total, 4);
  });

  await test("query items returns rowItem shape", async () => {
    const q = await j(get("items?status=active&page_size=150"));
    assert.strictEqual(q.items.length, 4);
    const it = q.items[0];
    for (const key of ["id", "file_name", "file_path", "ext", "size", "due_at", "retrievability", "review_count", "preview_url", "exists"]) {
      assert.ok(key in it, "rowItem missing " + key);
    }
    assert.strictEqual(it.exists, true);
  });

  await test("start review returns a due item + session", async () => {
    const res = await j(post("review/start", {}));
    assert.ok(res.item, "item present");
    assert.ok(res.session_id, "session id present");
    assert.strictEqual(res.item.review_count, 0, "new item review_count 0");
    global.__itemId = res.item.id;
    global.__session = res.session_id;
  });

  await test("finish review applies scheduler (FSRS-Lite)", async () => {
    const before = await DB.get("items", global.__itemId);
    const res = await j(post("review/finish", {
      item_id: global.__itemId,
      session_id: global.__session,
      rating: 2,
      duration_seconds: 30,
    }));
    const after = res.item;
    assert.strictEqual(after.review_count, 1, "review_count incremented");
    assert.ok(after.due_at, "due_at set");
    assert.ok(new Date(after.due_at) > new Date(), "due_at in future");
    assert.ok(after.interval_days > 0, "interval_days > 0");
    assert.strictEqual(after.algorithm || (res.schedule && res.schedule.algorithm), "FSRS-Lite");
    // history recorded
    const hist = await DB.getAll("reviewHistory");
    assert.strictEqual(hist.length, 1, "one history row");
    assert.strictEqual(hist[0].rating, 2);
    assert.strictEqual(hist[0].duration_seconds, 30);
  });

  await test("finish review with rating=0 is a lapse", async () => {
    const res = await j(post("review/finish", {
      item_id: global.__itemId,
      session_id: global.__session,
      rating: 0,
      duration_seconds: 5,
    }));
    assert.strictEqual(res.item.lapse_count, 1, "lapse_count incremented");
  });

  await test("notes CRUD", async () => {
    const created = await j(post("notes/create", { title: "My Note", source: "app" }));
    assert.ok(created.note.id, "note id");
    const noteId = created.note.id;
    const saved = await j(post("notes/save", { id: noteId, title: "My Note", content: "# updated" }));
    assert.strictEqual(saved.note.title, "My Note");
    const read = await j(get("notes/" + noteId));
    assert.strictEqual(read.note.content, "# updated", "content persisted");
    const list = await j(get("notes"));
    assert.ok(list.notes.find((n) => n.id === noteId), "note in list");
    const del = await j(post("notes/delete", { ids: [noteId], delete_files: true }));
    assert.strictEqual(del.deleted, 1);
    const list2 = await j(get("notes"));
    assert.ok(!list2.notes.find((n) => n.id === noteId), "note removed");
  });

  await test("links create / list / delete", async () => {
    // create two items to link
    const f1 = [FakeFile("link_src.txt", "src", "text/plain", "L/src.txt")];
    const f2 = [FakeFile("link_tgt.txt", "tgt", "text/plain", "L/tgt.txt")];
    await LocalAPI.importFiles(f1, null);
    await LocalAPI.importFiles(f2, null);
    const items = (await j(get("items?status=active"))).items;
    const src = items.find((i) => i.file_name === "link_src.txt");
    const tgt = items.find((i) => i.file_name === "link_tgt.txt");
    const created = await j(post("links/create", {
      source_type: "item", source_id: src.id,
      target_type: "item", target_id: tgt.id,
      selected_text: "hello", note: "memo",
    }));
    assert.ok(created.link.id, "link created");
    const listed = await j(get("links?source_type=item&source_id=" + src.id));
    assert.ok(listed.links.length >= 1, "link listed");
    assert.ok(listed.links[0].target, "link has target summary");
    const targets = await j(get("link-targets?q=tgt&limit=10"));
    assert.ok(targets.targets.find((t) => t.id === tgt.id), "target search works");
    const del = await j(post("links/delete", { id: created.link.id }));
    assert.strictEqual(del.deleted, 1);
  });

  await test("decks CRUD", async () => {
    const c = await j(post("decks/create", { name: "Deck A", description: "d", parent_id: null }));
    assert.ok(c.deck.id, "deck created");
    const deckId = c.deck.id;
    const u = await j(post("decks/update", { id: deckId, name: "Deck A2" }));
    assert.strictEqual(u.deck.name, "Deck A2");
    const list = await j(get("decks"));
    assert.ok(list.decks.find((d) => d.id === deckId), "deck in list");
    // assign an item to it
    const items = (await j(get("items?status=active"))).items;
    await j(post("items/update", { ids: [items[0].id], fields: { deck_id: deckId } }));
    const after = await DB.get("items", items[0].id);
    assert.strictEqual(after.deck_id, deckId, "item assigned to deck");
    const del = await j(post("decks/delete", { id: deckId }));
    assert.strictEqual(del.deleted, 1);
  });

  await test("settings save/load", async () => {
    const saved = await j(post("settings", { config: { ui: { theme: "dark", language: "en-US" } } }));
    assert.strictEqual(saved.config.ui.theme, "dark");
    const loaded = await j(get("settings"));
    assert.strictEqual(loaded.config.ui.theme, "dark");
    // reset for later
    await j(post("settings", { config: { ui: { theme: "light", language: "zh-CN" } } }));
  });

  await test("export csv / portable returns path (download triggered in browser)", async () => {
    const csv = await j(post("export", { target_path: "x.csv" }));
    assert.ok(csv.export_path, "csv export path");
    const port = await j(post("export-portable", { target_path: "x.json" }));
    assert.ok(port.export_path, "portable export path");
  });

  await test("health check", async () => {
    const h = await j(get("health"));
    assert.strictEqual(h.ok, true);
    assert.ok(Array.isArray(h.checks) && h.checks.length > 0);
  });

  await test("social profile save", async () => {
    const s = await j(post("social/profile", { profile: { display_name: "Kou", handle: "@kou" } }));
    assert.strictEqual(s.profile.display_name, "Kou");
    const card = await j(get("social/card"));
    assert.strictEqual(card.profile.display_name, "Kou");
  });

  await test("router returns JSON for unknown-free endpoints via request()", async () => {
    const ov = await LocalAPI.request("/api/overview");
    assert.strictEqual(ov.ok, true);
    const data = await ov.json();
    assert.ok(data.config, "overview has config");
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
