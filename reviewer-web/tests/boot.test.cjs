/*
 * boot.test.cjs — Headless DOM boot test (jsdom, no real browser).
 *
 * Boots the actual frontend (db.js -> scheduler.js -> api.js -> app.js) inside a
 * jsdom window, lets app.js's init() run through the LocalAPI fetch patch, and
 * asserts the end-to-end chain (script load order + fetch interception +
 * getOverview shape + renderDashboard) completes without throwing.
 *
 * db.js auto-falls back to in-memory Maps because jsdom has no indexedDB, which
 * still exercises the exact code paths app.js uses via LocalAPI.
 */
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf-8");
// Remove <script src> tags; we eval the files ourselves in the right order.
const htmlNoScripts = html.replace(/<script[^>]*src=[^>]*><\/script>/g, "");

const dom = new JSDOM(htmlNoScripts, {
  runScripts: "outside-only",
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const { window } = dom;

// Capture any real failure.
const errors = [];
window.addEventListener("error", (e) => errors.push("window.error: " + (e.error && e.error.stack || e.message)));
window.addEventListener("unhandledrejection", (e) => errors.push("unhandledrejection: " + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
const origErr = window.console.error.bind(window.console);
window.console.error = (...a) => {
  errors.push("console.error: " + a.map((x) => (x && x.stack) || String(x)).join(" "));
  origErr(...a);
};

// Polyfill a stub fetch so LocalAPI.install() activates its /api/* interception.
// Any non-/api/ call would hit this and reject loudly (none happen during init).
window.fetch = function () {
  return Promise.reject(new Error("unexpected real network fetch in boot test"));
};

// Load scripts in dependency order, in the window's global scope.
for (const f of ["db.js", "scheduler.js", "api.js", "app.js"]) {
  window.eval(fs.readFileSync(path.join(ROOT, f), "utf-8"));
}

// init() runs synchronously at the end of app.js, but its awaits resolve on microtasks.
setTimeout(() => {
  const doc = window.document;
  const realErrors = errors.filter((e) =>
    /TypeError|ReferenceError|is not a function|Cannot read|undefined is not/.test(e)
  );

  const checks = [
    ["window.LocalAPI defined", typeof window.LocalAPI !== "undefined"],
    ["window.DB defined", typeof window.DB !== "undefined"],
    ["window.Scheduler defined", typeof window.Scheduler !== "undefined"],
    ["fetch patch installed (__localApiInstalled)", !!window.__localApiInstalled],
    ["#metricTotal rendered", !!doc.getElementById("metricTotal") && doc.getElementById("metricTotal").textContent.trim().length > 0],
    ["#metricDue rendered", !!doc.getElementById("metricDue") && doc.getElementById("metricDue").textContent.trim().length > 0],
    ["no fatal JS errors", realErrors.length === 0],
  ];

  let ok = true;
  for (const [name, pass] of checks) {
    console.log((pass ? "  ok  - " : "  FAIL- ") + name);
    if (!pass) ok = false;
  }
  if (errors.length) {
    console.log("\n-- captured logs/errors --");
    errors.forEach((e) => console.log("   " + e.slice(0, 300)));
  }
  console.log("\n" + (ok ? "BOOT PASS" : "BOOT FAIL"));
  process.exit(ok ? 0 : 1);
}, 600);
