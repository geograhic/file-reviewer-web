/**
 * _browser_sim.cjs — Browser-like simulation test.
 *
 * jsdom lacks indexedDB → db.js falls back to memory Maps → never hits
 * _db===null crash. This test mocks window.indexedDB so db.js takes the
 * REAL IndexedDB code path, catching bugs only visible in real browsers.
 *
 * Checks:
 *   1. DB.init() IS called during init() (prevents null.transaction crash)
 *   2. No fatal errors during full init chain
 *   3. Onboarding tour auto-shows for first-time users
 *
 * Run: NODE_PATH=<managed_node_modules> node tests/browser-sim.test.cjs
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const htmlNoScripts = fs.readFileSync(path.join(ROOT, "index.html"), "utf-8")
  .replace(/<script[^>]*src=[^>]*><\/script>/g, "");

const dom = new JSDOM(htmlNoScripts, {
  runScripts: "outside-only",
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const w = dom.window;

// ---- Mock indexedDB so db.js uses the REAL IndexedDB code path ----
let idbOpenCallCount = 0;
const mockIDB = {
  open(name, ver) {
    idbOpenCallCount++;
    const req = {
      result: null,
      error: null,
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
    };
    // Simulate async open success
    setTimeout(() => {
      req.result = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => ({ createIndex: () => {} }),
        transaction(store, mode) {
          return {
            objectStore() {
              return {
                get: () => mkReq(),
                getAll: () => mkReq([]),
                count: () => mkReq(0),
                add: () => mkReq(1),
                put: () => mkReq(),
                delete: () => mkReq(),
                clear: () => mkReq(),
              };
              function mkReq(val) {
                const r = { result: val, error: null, onsuccess: null, onerror: null };
                setTimeout(() => { if (r.onsuccess) r.onsuccess(); }, 0);
                return r;
              }
            },
          };
        },
      };
      if (req.onsuccess) req.onsuccess();
    }, 5); // small async delay like real IDB
    return req;
  },
};
w.indexedDB = mockIDB;

// ---- Standard polyfills ----
w.requestAnimationFrame = (cb) => setTimeout(cb, 10);
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
w.alert = () => {};
w.localStorage.clear();
w.localStorage.removeItem("fileReviewerOnboardingDone");
w.localStorage.setItem("fileReviewerLanguage", "zh-CN");

// ---- Error capture ----
const errors = [];
w.addEventListener("error", (e) => errors.push("error: " + (e.error?.message || e.message)));
w.addEventListener("unhandledrejection", (e) => errors.push("rejection: " + String(e.reason?.message || e.reason)));

// ---- Fetch stub (return realistic config shape) ----
w.fetch = function () {
  return Promise.resolve({
    ok: true, status: 200,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve({
      config: { ui: { language: "zh-CN" }, scheduler: { algorithm: "fsrs-lite" } },
      libraries: [], items: [], notes: [], decks: [],
      dueToday: 0, totalCards: 0, reviewedToday: 0, studyTimeToday: 0, streakDays: 0,
    }),
    text: () => Promise.resolve(""),
    blob: () => Promise.resolve(new w.Blob([])),
  });
};

// ---- Load scripts in order (same as HTML) ----
for (const f of ["db.js", "scheduler.js", "api.js", "app.js"]) {
  w.eval(fs.readFileSync(path.join(ROOT, f), "utf-8"));
}

// ---- Wait for all async init to settle, then assert ----
setTimeout(() => {
  const $ = (sel) => w.document.querySelector(sel);

  const checks = [
    ["DB.init() was called (idb.open invoked)", idbOpenCallCount >= 1],
    ["No fatal JS errors during init", errors.length === 0],
    ["#onboarding element exists", !!$("#onboarding")],
    ["Onboarding NOT hidden (auto-showed)", $("#onboarding") && !$("#onboarding").classList.contains("hidden")],
    ["Onboarding has title text", !!$("#onboardingTitle") && $("#onboardingTitle").textContent.trim().length > 0],
    ["Step counter shows 1/6",
      $("#onboardingStepNum")?.textContent === "1" &&
      $("#onboardingStepTotal")?.textContent === "6"],
    ["localStorage not yet marked done",
      w.localStorage.getItem("fileReviewerOnboardingDone") !== "1"],
  ];

  let ok = true;
  for (const [name, pass] of checks) {
    console.log((pass ? "  OK  " : "  FAIL ") + name);
    if (!pass) ok = false;
  }

  if (errors.length) {
    console.log("\n  -- captured errors --");
    errors.forEach((e) => console.log("    " + e.slice(0, 300)));
  }

  console.log("\n" + (ok ? "BROWSER-SIM PASS" : "BROWSER-SIM FAIL"));
  process.exit(ok ? 0 : 1);
}, 800);
