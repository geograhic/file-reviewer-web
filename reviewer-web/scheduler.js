/*
 * scheduler.js — Spaced-repetition algorithms ported 1:1 from app.py
 * (FSRS-Lite, SM-2, Fixed). Pure functions, no DOM / IndexedDB dependency.
 * Works both in the browser (window.Scheduler) and in Node (module.exports).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Scheduler = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RATING_LABELS = { 0: "忘记", 1: "困难", 2: "良好", 3: "简单" };

  function clamp(value, low, high) {
    value = parseFloat(value);
    if (Number.isNaN(value)) value = low;
    return Math.max(low, Math.min(high, value));
  }

  function parseDt(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    let s = String(value).trim();
    // strip trailing Z handled by Date; also accept 'YYYY-MM-DD'
    let d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
    d = new Date(s.replace(" ", "T"));
    if (!Number.isNaN(d.getTime())) return d;
    return null;
  }

  function fmt(dt) {
    // Local-time 'YYYY-MM-DDTHH:MM:SS' to match Python isoformat(microsecond=0)
    const p = (n) => String(n).padStart(2, "0");
    return (
      dt.getFullYear() +
      "-" + p(dt.getMonth() + 1) +
      "-" + p(dt.getDate()) +
      "T" + p(dt.getHours()) +
      ":" + p(dt.getMinutes()) +
      ":" + p(dt.getSeconds())
    );
  }

  function round4(n) {
    return Math.round((parseFloat(n) + Number.EPSILON) * 10000) / 10000;
  }

  function currentRetrievability(row, now) {
    now = now || new Date();
    const lastReview = parseDt(row.last_review_at);
    if (!lastReview) {
      return parseInt(row.review_count || 0, 10) === 0 ? 1.0 : 0.75;
    }
    const elapsedDays = Math.max(0.0, (now - lastReview) / 86400000);
    const stability = Math.max(0.1, parseFloat(row.stability || 2.5));
    return clamp(Math.pow(1 + (19 / 81) * (elapsedDays / stability), -0.5), 0.0, 1.0);
  }

  function intervalForRetention(stability, desiredRetention) {
    const retention = clamp(parseFloat(desiredRetention), 0.7, 0.97);
    const factor = 19 / 81;
    const decay = -0.5;
    const interval = (stability / factor) * (Math.pow(retention, 1 / decay) - 1);
    return clamp(interval, 0.01, 3650);
  }

  function scheduleFsrsLite(row, rating, config) {
    const now = new Date();
    const desired = (config && config.scheduler && config.scheduler.desired_retention) || 0.9;
    const stability = Math.max(0.5, parseFloat(row.stability || 2.5));
    let difficulty = clamp(parseFloat(row.difficulty || 5.0), 1.0, 10.0);
    const oldInterval = Math.max(0.0, parseFloat(row.interval_days || 0));
    const retrievability = currentRetrievability(row, now);
    const reviewedBefore = parseInt(row.review_count || 0, 10) > 0;

    let newStability, intervalDays, lapseInc;
    if (rating === 0) {
      newStability = Math.max(0.35, stability * (0.42 + 0.08 * retrievability));
      difficulty = clamp(difficulty + 0.85, 1.0, 10.0);
      intervalDays = reviewedBefore ? 0.03 : 0.02;
      lapseInc = 1;
    } else if (rating === 1) {
      newStability = Math.max(0.7, stability * (0.92 + 0.03 * (10 - difficulty)));
      difficulty = clamp(difficulty + 0.35, 1.0, 10.0);
      intervalDays = Math.max(
        1.0,
        Math.min(Math.max(oldInterval * 1.2, 1.0), intervalForRetention(newStability, desired) * 0.65)
      );
      lapseInc = 0;
    } else if (rating === 3) {
      const boost = 2.4 + (10 - difficulty) * 0.1 + (1 - retrievability) * 0.3;
      newStability = stability * boost + 0.5;
      difficulty = clamp(difficulty - 0.55, 1.0, 10.0);
      intervalDays = intervalForRetention(newStability, desired) * 1.25;
      lapseInc = 0;
    } else {
      const boost = 1.7 + (10 - difficulty) * 0.07 + (1 - retrievability) * 0.2;
      newStability = stability * boost + 0.25;
      difficulty = clamp(difficulty - 0.15, 1.0, 10.0);
      intervalDays = intervalForRetention(newStability, desired);
      lapseInc = 0;
    }

    intervalDays = clamp(intervalDays, 0.02, 3650);
    const dueAt = new Date(now.getTime() + intervalDays * 86400000);
    return {
      algorithm: "FSRS-Lite",
      due_at: fmt(dueAt),
      interval_days: round4(intervalDays),
      ease_factor: parseFloat(row.ease_factor || 2.5),
      stability: round4(newStability),
      difficulty: round4(difficulty),
      retrievability: round4(currentRetrievability(row, now)),
      lapse_inc: lapseInc,
    };
  }

  function scheduleSm2(row, rating, config) {
    const now = new Date();
    let ease = Math.max(1.3, parseFloat(row.ease_factor || 2.5));
    let interval = Math.max(0.0, parseFloat(row.interval_days || 0));
    let lapseInc = 0;
    if (rating === 0) {
      interval = 1;
      ease = Math.max(1.3, ease - 0.2);
      lapseInc = 1;
    } else if (rating === 1) {
      interval = Math.max(1, interval * 1.2);
      ease = Math.max(1.3, ease - 0.15);
    } else if (rating === 3) {
      interval = interval < 1 ? 6 : interval * ease * 1.3;
      ease += 0.15;
    } else {
      interval = interval < 1 ? 6 : interval * ease;
    }
    const s = row.stability;
    const stability = s === null || s === undefined || s === "" || s === 0 ? interval : parseFloat(s);
    return {
      algorithm: "SM-2",
      due_at: fmt(new Date(now.getTime() + interval * 86400000)),
      interval_days: round4(interval),
      ease_factor: round4(ease),
      stability: parseFloat(stability),
      difficulty: parseFloat(row.difficulty || 5.0),
      retrievability: currentRetrievability(row, now),
      lapse_inc: lapseInc,
    };
  }

  function scheduleFixed(row, rating, config) {
    const now = new Date();
    const stages = [1, 2, 4, 8, 15, 30, 60, 120, 240, 365];
    const reviewCount = parseInt(row.review_count || 0, 10);
    let idx = Math.min(reviewCount, stages.length - 1);
    let lapseInc = 0;
    if (rating === 0) {
      idx = 0;
      lapseInc = 1;
    } else if (rating === 3) {
      idx = Math.min(idx + 1, stages.length - 1);
    }
    const interval = stages[idx];
    return {
      algorithm: "Fixed",
      due_at: fmt(new Date(now.getTime() + interval * 86400000)),
      interval_days: parseFloat(interval),
      ease_factor: parseFloat(row.ease_factor || 2.5),
      stability: parseFloat(interval),
      difficulty: parseFloat(row.difficulty || 5.0),
      retrievability: currentRetrievability(row, now),
      lapse_inc: lapseInc,
    };
  }

  function calculateSchedule(row, rating, config) {
    const algorithm = (config && config.scheduler && config.scheduler.algorithm) || "FSRS-Lite";
    if (algorithm === "SM-2") return scheduleSm2(row, rating, config);
    if (algorithm === "Fixed") return scheduleFixed(row, rating, config);
    return scheduleFsrsLite(row, rating, config);
  }

  const DEFAULT_CONFIG = {
    app_name: "智能文件复习系统 2.0 WebUI",
    version: "2.14.0",
    library_roots: [],
    scan_extensions: [
      ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
      ".txt", ".md", ".html", ".htm", ".rtf", ".epub",
      ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp",
      ".mp4", ".mkv", ".mov", ".avi", ".wmv", ".mp3", ".wav", ".m4a",
    ],
    ignore_dirs: [
      ".git", ".svn", ".hg", "__pycache__", "node_modules", ".obsidian",
      ".trash", "$RECYCLE.BIN", "System Volume Information",
    ],
    follow_hidden_dirs: false,
    scheduler: {
      algorithm: "FSRS-Lite",
      desired_retention: 0.9,
      max_reviews_per_day: 120,
      max_new_per_day: 40,
      new_item_due_immediately: true,
    },
    review: {
      auto_open_file: false,
      external_open_on_review_start: false,
      show_preview: true,
      default_rating: 2,
    },
    notes: { storage_dir: "", default_extension: ".md", open_local_note_after_create: false },
    exports: { default_dir: "" },
    reminders: { enabled: true, time: "20:30", repeat_minutes: 90, browser_notifications: true },
    ui: {
      language: "zh-CN",
      theme: "light",
      density: "comfortable",
      accent: "#2563eb",
      surface: "#ffffff",
      background: "#f4f6f8",
      text: "#172033",
      sidebar: "#111827",
      custom_css: "",
    },
    maintenance: { auto_backup_before_migration: true, keep_backup_count: 30 },
    plugins: {
      enabled: true,
      auto_load: false,
      installed: [],
      achievement_plugins_enabled: true,
      core: { achievement_core: true, social_profile: true, learning_stats: true },
    },
    social: {
      display_name: "", handle: "", bio: "", location: "", website: "", contact: "",
      share_stats: true, share_achievements: true, allow_friend_discovery: false,
    },
  };

  return {
    RATING_LABELS,
    clamp,
    parseDt,
    fmt,
    round4,
    currentRetrievability,
    intervalForRetention,
    scheduleFsrsLite,
    scheduleSm2,
    scheduleFixed,
    calculateSchedule,
    DEFAULT_CONFIG,
  };
});
