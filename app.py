import argparse
from contextlib import contextmanager
import csv
import json
import math
import mimetypes
import os
import platform
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.parse
import uuid
import webbrowser
import zipfile
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


APP_NAME = "智能文件复习系统 2.0 WebUI"
APP_VERSION = "2.14.0"
SCHEMA_VERSION = 7
DEFAULT_PORT = 8765
WEBVIEW_WINDOW = None


def user_documents_dir() -> Path:
    return Path.home() / "Documents"


DEFAULT_APP_DIR = user_documents_dir() / "LiFileReviewer2"
PROFILE_POINTER_PATH = DEFAULT_APP_DIR / "profile_location.json"


def fs_path(path: str | Path) -> str:
    value = str(Path(path).expanduser())
    if platform.system() != "Windows":
        return value
    absolute = os.path.abspath(value)
    if absolute.startswith("\\\\?\\"):
        return absolute
    if absolute.startswith("\\\\"):
        return "\\\\?\\UNC\\" + absolute.lstrip("\\")
    return "\\\\?\\" + absolute


def user_path(path: str | Path) -> str:
    value = str(path)
    if value.startswith("\\\\?\\UNC\\"):
        return "\\\\" + value[8:]
    if value.startswith("\\\\?\\"):
        return value[4:]
    return value


def path_exists(path: str | Path) -> bool:
    return os.path.exists(fs_path(path))


def path_is_file(path: str | Path) -> bool:
    return os.path.isfile(fs_path(path))


def path_is_dir(path: str | Path) -> bool:
    return os.path.isdir(fs_path(path))


def path_stat(path: str | Path):
    return os.stat(fs_path(path))


def ensure_dir(path: str | Path) -> None:
    os.makedirs(fs_path(path), exist_ok=True)


def read_text_file(path: str | Path) -> str:
    with open(fs_path(path), "r", encoding="utf-8") as handle:
        return handle.read()


def write_text_file(path: str | Path, content: str) -> None:
    ensure_dir(Path(path).parent)
    with open(fs_path(path), "w", encoding="utf-8") as handle:
        handle.write(content)


def copy_file(src: str | Path, dst: str | Path) -> None:
    ensure_dir(Path(dst).parent)
    shutil.copy2(fs_path(src), fs_path(dst))


def unlink_file(path: str | Path) -> None:
    os.unlink(fs_path(path))


def resolve_profile_dir() -> Path:
    env_path = os.environ.get("LI_FILE_REVIEWER_PROFILE")
    if env_path:
        return Path(env_path).expanduser().resolve()
    try:
        if path_exists(PROFILE_POINTER_PATH):
            payload = json.loads(read_text_file(PROFILE_POINTER_PATH))
            app_dir = payload.get("app_dir")
            if app_dir:
                return Path(app_dir).expanduser().resolve()
    except Exception:
        pass
    return DEFAULT_APP_DIR


def set_app_dir(path: str | Path) -> None:
    global APP_DIR, CONFIG_PATH, DB_PATH, LOG_PATH, BACKUP_DIR, PLUGINS_DIR, DEFAULT_NOTES_DIR, EXPORT_DIR
    APP_DIR = Path(path).expanduser().resolve()
    CONFIG_PATH = APP_DIR / "config.json"
    DB_PATH = APP_DIR / "review_data.sqlite"
    LOG_PATH = APP_DIR / "app.log"
    BACKUP_DIR = APP_DIR / "backups"
    PLUGINS_DIR = APP_DIR / "plugins"
    DEFAULT_NOTES_DIR = APP_DIR / "notes"
    EXPORT_DIR = APP_DIR / "exports"


set_app_dir(resolve_profile_dir())


DEFAULT_CONFIG = {
    "app_name": APP_NAME,
    "version": APP_VERSION,
    "library_roots": [],
    "scan_extensions": [
        ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
        ".txt", ".md", ".html", ".htm", ".rtf", ".epub",
        ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp",
        ".mp4", ".mkv", ".mov", ".avi", ".wmv", ".mp3", ".wav", ".m4a",
    ],
    "ignore_dirs": [
        ".git", ".svn", ".hg", "__pycache__", "node_modules", ".obsidian",
        ".trash", "$RECYCLE.BIN", "System Volume Information",
    ],
    "follow_hidden_dirs": False,
    "scheduler": {
        "algorithm": "FSRS-Lite",
        "desired_retention": 0.90,
        "max_reviews_per_day": 120,
        "max_new_per_day": 40,
        "new_item_due_immediately": True,
    },
    "review": {
        "auto_open_file": False,
        "external_open_on_review_start": False,
        "show_preview": True,
        "default_rating": 2,
    },
    "notes": {
        "storage_dir": "",
        "default_extension": ".md",
        "open_local_note_after_create": False,
    },
    "exports": {
        "default_dir": "",
    },
    "reminders": {
        "enabled": True,
        "time": "20:30",
        "repeat_minutes": 90,
        "browser_notifications": True,
    },
    "ui": {
        "language": "zh-CN",
        "theme": "light",
        "density": "comfortable",
        "accent": "#2563eb",
        "surface": "#ffffff",
        "background": "#f4f6f8",
        "text": "#172033",
        "sidebar": "#111827",
        "custom_css": "",
    },
    "maintenance": {
        "auto_backup_before_migration": True,
        "keep_backup_count": 30,
    },
    "plugins": {
        "enabled": True,
        "auto_load": False,
        "installed": [],
        "achievement_plugins_enabled": True,
        "core": {
            "achievement_core": True,
            "social_profile": True,
            "learning_stats": True,
        },
    },
    "social": {
        "display_name": "",
        "handle": "",
        "bio": "",
        "location": "",
        "website": "",
        "contact": "",
        "share_stats": True,
        "share_achievements": True,
        "allow_friend_discovery": False,
    },
}


RATING_LABELS = {
    0: "忘记",
    1: "困难",
    2: "良好",
    3: "简单",
}


def ensure_app_dirs() -> None:
    ensure_dir(APP_DIR)
    ensure_dir(BACKUP_DIR)
    ensure_dir(PLUGINS_DIR)
    ensure_dir(DEFAULT_NOTES_DIR)
    ensure_dir(EXPORT_DIR)
    manifest_path = PLUGINS_DIR / "README.md"
    if not path_exists(manifest_path):
        write_text_file(
            manifest_path,
            "# Plugins\n\n"
            "Put future plugin folders here. Each plugin can provide a `plugin.json` manifest.\n"
            "The current stable app records plugin metadata but does not execute plugin code by default.\n",
        )


def log_error(message: str) -> None:
    ensure_app_dirs()
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(fs_path(LOG_PATH), "a", encoding="utf-8") as handle:
        handle.write(f"[{stamp}] {message}\n")


def deep_merge(base, override):
    result = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def version_tuple(value: str) -> tuple[int, int, int]:
    parts = []
    for piece in str(value or "0").split(".")[:3]:
        try:
            parts.append(int(piece))
        except ValueError:
            parts.append(0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts)  # type: ignore[return-value]


def normalize_config(config: dict) -> tuple[dict, bool]:
    changed = False
    previous_version = version_tuple(config.get("version", "0.0.0"))
    if previous_version < (2, 4, 0):
        review = config.setdefault("review", {})
        review["auto_open_file"] = False
        review["external_open_on_review_start"] = False
        changed = True
    plugins = config.setdefault("plugins", {})
    if "achievement_plugins_enabled" in plugins and "core" not in plugins:
        plugins["core"] = {
            "achievement_core": bool(plugins.get("achievement_plugins_enabled", True)),
            "social_profile": True,
        }
        changed = True
    core_plugins = plugins.setdefault("core", {})
    for plugin_id, default_enabled in {"achievement_core": True, "social_profile": True, "learning_stats": True}.items():
        if plugin_id not in core_plugins:
            core_plugins[plugin_id] = default_enabled
            changed = True
    social = config.setdefault("social", {})
    for key, value in DEFAULT_CONFIG["social"].items():
        if key not in social:
            social[key] = value
            changed = True
    if config.get("version") != APP_VERSION:
        config["version"] = APP_VERSION
        changed = True
    return config, changed


def load_config() -> dict:
    ensure_app_dirs()
    if path_exists(CONFIG_PATH):
        try:
            with open(fs_path(CONFIG_PATH), "r", encoding="utf-8") as handle:
                merged = deep_merge(DEFAULT_CONFIG, json.load(handle))
            merged, changed = normalize_config(merged)
            if changed:
                save_config(merged)
            return merged
        except Exception:
            log_error("配置读取失败：\n" + traceback.format_exc())
    save_config(DEFAULT_CONFIG)
    return dict(DEFAULT_CONFIG)


def save_config(config: dict) -> None:
    ensure_app_dirs()
    merged = deep_merge(DEFAULT_CONFIG, config)
    merged["version"] = APP_VERSION
    temp_path = CONFIG_PATH.with_suffix(".json.tmp")
    with open(fs_path(temp_path), "w", encoding="utf-8") as handle:
        json.dump(merged, handle, ensure_ascii=False, indent=2)
    os.replace(fs_path(temp_path), fs_path(CONFIG_PATH))


def write_profile_pointer() -> None:
    ensure_dir(DEFAULT_APP_DIR)
    payload = {
        "app_dir": str(APP_DIR),
        "updated_at": iso_now(),
        "app_version": APP_VERSION,
    }
    if PROFILE_POINTER_PATH.resolve() != (APP_DIR / "profile_location.json").resolve():
        write_text_file(PROFILE_POINTER_PATH, json.dumps(payload, ensure_ascii=False, indent=2))


def profile_paths() -> dict:
    return {
        "app_dir": str(APP_DIR),
        "default_app_dir": str(DEFAULT_APP_DIR),
        "profile_pointer_path": str(PROFILE_POINTER_PATH),
        "config_path": str(CONFIG_PATH),
        "db_path": str(DB_PATH),
        "log_path": str(LOG_PATH),
        "backup_dir": str(BACKUP_DIR),
        "plugins_dir": str(PLUGINS_DIR),
        "default_notes_dir": str(DEFAULT_NOTES_DIR),
        "notes_dir": str(notes_dir()),
        "export_dir": str(export_dir()),
    }


def resource_path(relative: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base / relative


def notes_dir(config: dict | None = None) -> Path:
    if config is None and path_exists(CONFIG_PATH):
        try:
            config = load_config()
        except Exception:
            config = {}
    config = config or {}
    configured = config.get("notes", {}).get("storage_dir") or ""
    return Path(configured).expanduser().resolve() if configured else DEFAULT_NOTES_DIR


def ensure_notes_dir(config: dict | None = None) -> Path:
    target = notes_dir(config)
    ensure_dir(target)
    return target


def export_dir(config: dict | None = None) -> Path:
    if config is None and path_exists(CONFIG_PATH):
        try:
            config = load_config()
        except Exception:
            config = {}
    config = config or {}
    configured = config.get("exports", {}).get("default_dir") or ""
    return Path(configured).expanduser().resolve() if configured else EXPORT_DIR


def ensure_export_dir(config: dict | None = None, target_dir: str | Path | None = None) -> Path:
    target = Path(target_dir).expanduser().resolve() if target_dir else export_dir(config)
    ensure_dir(target)
    return target


CORE_PLUGINS = {
    "achievement_core": {
        "id": "achievement_core",
        "name": "成就系统",
        "version": "1.0.0",
        "category": "achievement",
        "description": "把 XP、等级、成就奖励和外部成就包作为可开关插件管理。",
        "builtin": True,
    },
    "social_profile": {
        "id": "social_profile",
        "name": "社交资料",
        "version": "0.1.0",
        "category": "social",
        "description": "保存用户昵称、简介、主页和分享偏好，为好友、动态、协作学习等社交扩展预留接口。",
        "builtin": True,
    },
    "learning_stats": {
        "id": "learning_stats",
        "name": "Learning Stats",
        "version": "1.0.0",
        "category": "analytics",
        "description": "Visual learning analytics for review volume, study time, retention, decks, streaks, and progress trends.",
        "builtin": True,
    },
}


def plugin_enabled(plugin_id: str, config: dict | None = None) -> bool:
    config = config or load_config()
    plugins = config.get("plugins", {})
    if not plugins.get("enabled", True):
        return False
    core = plugins.get("core", {})
    if plugin_id in CORE_PLUGINS:
        return bool(core.get(plugin_id, True))
    installed = plugins.get("installed", {})
    if isinstance(installed, dict) and plugin_id in installed:
        return bool(installed.get(plugin_id))
    return True


def plugin_slug(value: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in str(value).strip())
    cleaned = cleaned.strip("._-")
    return cleaned[:80] or f"plugin_{uuid.uuid4().hex[:8]}"


def iso_now() -> str:
    return datetime.now().replace(microsecond=0).isoformat()


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        try:
            return datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            return None


def human_size(num: int | None) -> str:
    if not num:
        return "0 B"
    value = float(num)
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if value < 1024 or unit == "TB":
            return f"{value:.1f} {unit}" if unit != "B" else f"{int(value)} B"
        value /= 1024
    return f"{value:.1f} TB"


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


@contextmanager
def get_conn(db_path: Path | None = None):
    ensure_app_dirs()
    conn = sqlite3.connect(fs_path(db_path or DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
    finally:
        conn.close()


def ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    if column not in {row["name"] for row in rows}:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def db_user_version(conn: sqlite3.Connection) -> int:
    return int(conn.execute("PRAGMA user_version").fetchone()[0])


def set_db_user_version(conn: sqlite3.Connection, version: int) -> None:
    conn.execute(f"PRAGMA user_version = {int(version)}")


def backup_file(path: Path, reason: str = "manual") -> Path:
    ensure_app_dirs()
    if not path_exists(path):
        raise FileNotFoundError(f"无法备份，文件不存在：{path}")
    safe_reason = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in reason)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target = BACKUP_DIR / f"{path.stem}_{safe_reason}_{stamp}{path.suffix}"
    copy_file(path, target)
    rotate_backups()
    return target


def backup_sqlite_database(source: Path, reason: str = "manual") -> Path:
    ensure_app_dirs()
    return backup_sqlite_database_to(source, BACKUP_DIR, reason)


def backup_sqlite_database_to(source: Path, target_dir: Path, reason: str = "manual") -> Path:
    ensure_dir(target_dir)
    if not path_exists(source):
        raise FileNotFoundError(f"无法备份，数据库不存在：{source}")
    safe_reason = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in reason)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target = target_dir / f"{source.stem}_{safe_reason}_{stamp}{source.suffix}"
    snapshot_sqlite_database(source, target)
    if target_dir.resolve() == BACKUP_DIR.resolve():
        rotate_backups()
    return target


def snapshot_sqlite_database(source: Path, target: Path) -> Path:
    ensure_dir(target.parent)
    if not path_exists(source):
        raise FileNotFoundError(f"无法备份，数据库不存在：{source}")
    src = sqlite3.connect(fs_path(source))
    try:
        dst = sqlite3.connect(fs_path(target))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    return target


def rotate_backups() -> None:
    config = load_config()
    keep = int(config.get("maintenance", {}).get("keep_backup_count", 30) or 30)
    if keep <= 0 or not path_exists(BACKUP_DIR):
        return
    backups = sorted(BACKUP_DIR.glob("*.sqlite"), key=lambda p: path_stat(p).st_mtime, reverse=True)
    for old in backups[keep:]:
        try:
            unlink_file(old)
        except OSError:
            log_error(f"旧备份清理失败：{old}")


def record_activity(
    event_type: str,
    amount: int = 1,
    metadata: dict | None = None,
    conn: sqlite3.Connection | None = None,
) -> None:
    payload = json.dumps(metadata or {}, ensure_ascii=False)
    values = (event_type, int(amount or 1), payload, iso_now())
    if conn is not None:
        conn.execute(
            "INSERT INTO activity_events(event_type, amount, metadata, created_at) VALUES(?, ?, ?, ?)",
            values,
        )
        return
    with get_conn() as local_conn:
        local_conn.execute(
            "INSERT INTO activity_events(event_type, amount, metadata, created_at) VALUES(?, ?, ?, ?)",
            values,
        )
        local_conn.commit()


def record_migration(conn: sqlite3.Connection, from_version: int, to_version: int, note: str) -> None:
    conn.execute(
        """
        INSERT INTO schema_migrations(from_version, to_version, app_version, migrated_at, note)
        VALUES(?, ?, ?, ?, ?)
        """,
        (from_version, to_version, APP_VERSION, iso_now(), note),
    )


def migrate_decks_to_hierarchy(conn: sqlite3.Connection) -> None:
    indexes = conn.execute("PRAGMA index_list(decks)").fetchall()
    has_unique_name = False
    for index in indexes:
        if not int(index["unique"] or 0):
            continue
        name = str(index["name"])
        columns = [
            row["name"]
            for row in conn.execute(f"PRAGMA index_info({name})").fetchall()
        ]
        if columns == ["name"]:
            has_unique_name = True
    if not has_unique_name:
        return

    columns = {row["name"] for row in conn.execute("PRAGMA table_info(decks)").fetchall()}
    parent_expr = "parent_id" if "parent_id" in columns else "NULL"
    conn.commit()
    conn.execute("PRAGMA foreign_keys=OFF")
    conn.executescript(
        f"""
        CREATE TABLE IF NOT EXISTS decks_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_id INTEGER,
            description TEXT DEFAULT '',
            color TEXT DEFAULT '#2563eb',
            is_default INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(parent_id) REFERENCES decks_new(id) ON DELETE SET NULL
        );
        INSERT INTO decks_new(
            id, name, parent_id, description, color, is_default, sort_order, created_at, updated_at
        )
        SELECT id, name, {parent_expr}, description, color, is_default, sort_order, created_at, updated_at
          FROM decks;
        DROP TABLE decks;
        ALTER TABLE decks_new RENAME TO decks;
        """
    )
    conn.execute("PRAGMA foreign_keys=ON")


def ensure_default_deck(conn: sqlite3.Connection) -> int:
    now = iso_now()
    row = conn.execute("SELECT id FROM decks WHERE is_default=1 ORDER BY id LIMIT 1").fetchone()
    if row:
        return int(row["id"])
    row = conn.execute("SELECT id FROM decks WHERE name=?", ("默认",)).fetchone()
    if row:
        conn.execute("UPDATE decks SET is_default=1, updated_at=? WHERE id=?", (now, row["id"]))
        return int(row["id"])
    cur = conn.execute(
        """
        INSERT INTO decks(name, parent_id, description, color, is_default, sort_order, created_at, updated_at)
        VALUES(?, NULL, ?, ?, 1, 0, ?, ?)
        """,
        ("默认", "默认复习卡组", "#2563eb", now, now),
    )
    return int(cur.lastrowid)


def init_db(db_path: Path | None = None) -> None:
    target_db = db_path or DB_PATH
    existing_version = 0
    if path_exists(target_db):
        with get_conn(target_db) as pre_conn:
            existing_version = db_user_version(pre_conn)
        config = load_config()
        should_backup = config.get("maintenance", {}).get("auto_backup_before_migration", True)
        if should_backup and existing_version < SCHEMA_VERSION:
            backup_sqlite_database(target_db, f"before_schema_{existing_version}_to_{SCHEMA_VERSION}")
    with get_conn(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS app_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS schema_migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_version INTEGER NOT NULL,
                to_version INTEGER NOT NULL,
                app_version TEXT NOT NULL,
                migrated_at TEXT NOT NULL,
                note TEXT
            );

            CREATE TABLE IF NOT EXISTS libraries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                root_path TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                added_at TEXT NOT NULL,
                last_scan_at TEXT,
                file_count INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS decks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                parent_id INTEGER,
                description TEXT DEFAULT '',
                color TEXT DEFAULT '#2563eb',
                is_default INTEGER DEFAULT 0,
                sort_order INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(parent_id) REFERENCES decks(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guid TEXT NOT NULL UNIQUE,
                library_id INTEGER,
                deck_id INTEGER,
                root_path TEXT,
                relative_path TEXT,
                file_path TEXT NOT NULL UNIQUE,
                file_name TEXT NOT NULL,
                ext TEXT,
                size_bytes INTEGER DEFAULT 0,
                modified_at TEXT,
                added_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_seen_at TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                tags TEXT DEFAULT '',
                priority INTEGER DEFAULT 0,
                notes TEXT DEFAULT '',
                due_at TEXT NOT NULL,
                interval_days REAL DEFAULT 0,
                ease_factor REAL DEFAULT 2.5,
                stability REAL DEFAULT 2.5,
                difficulty REAL DEFAULT 5.0,
                retrievability REAL DEFAULT 1.0,
                review_count INTEGER DEFAULT 0,
                lapse_count INTEGER DEFAULT 0,
                total_read_seconds INTEGER DEFAULT 0,
                last_review_at TEXT,
                pinned INTEGER DEFAULT 0,
                FOREIGN KEY(library_id) REFERENCES libraries(id) ON DELETE SET NULL,
                FOREIGN KEY(deck_id) REFERENCES decks(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS review_sessions (
                id TEXT PRIMARY KEY,
                item_id INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS review_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL,
                session_id TEXT,
                started_at TEXT,
                ended_at TEXT NOT NULL,
                duration_seconds INTEGER DEFAULT 0,
                rating INTEGER NOT NULL,
                rating_label TEXT,
                algorithm TEXT,
                scheduled_days REAL,
                ease_factor REAL,
                stability REAL,
                difficulty REAL,
                retrievability REAL,
                FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guid TEXT NOT NULL UNIQUE,
                item_id INTEGER,
                title TEXT NOT NULL,
                file_path TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                source TEXT DEFAULT 'app',
                FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS achievements (
                id TEXT PRIMARY KEY,
                unlocked_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS activity_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                amount INTEGER DEFAULT 1,
                metadata TEXT DEFAULT '{}',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS social_profile (
                id INTEGER PRIMARY KEY CHECK (id=1),
                display_name TEXT DEFAULT '',
                handle TEXT DEFAULT '',
                bio TEXT DEFAULT '',
                location TEXT DEFAULT '',
                website TEXT DEFAULT '',
                contact TEXT DEFAULT '',
                share_stats INTEGER DEFAULT 1,
                share_achievements INTEGER DEFAULT 1,
                allow_friend_discovery INTEGER DEFAULT 0,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS content_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guid TEXT NOT NULL UNIQUE,
                source_type TEXT NOT NULL,
                source_id INTEGER NOT NULL,
                source_label TEXT DEFAULT '',
                selected_text TEXT DEFAULT '',
                target_type TEXT NOT NULL,
                target_id INTEGER NOT NULL,
                target_label TEXT DEFAULT '',
                note TEXT DEFAULT '',
                created_at TEXT NOT NULL
            );

            """
        )
        migrations = [
            ("items", "guid", "TEXT"),
            ("items", "library_id", "INTEGER"),
            ("items", "deck_id", "INTEGER"),
            ("items", "root_path", "TEXT"),
            ("items", "relative_path", "TEXT"),
            ("items", "priority", "INTEGER DEFAULT 0"),
            ("items", "notes", "TEXT DEFAULT ''"),
            ("items", "stability", "REAL DEFAULT 2.5"),
            ("items", "difficulty", "REAL DEFAULT 5.0"),
            ("items", "retrievability", "REAL DEFAULT 1.0"),
            ("items", "lapse_count", "INTEGER DEFAULT 0"),
            ("items", "pinned", "INTEGER DEFAULT 0"),
            ("decks", "parent_id", "INTEGER"),
        ]
        for table, column, definition in migrations:
            ensure_column(conn, table, column, definition)
        migrate_decks_to_hierarchy(conn)
        default_deck_id = ensure_default_deck(conn)
        conn.execute("UPDATE items SET deck_id=? WHERE deck_id IS NULL", (default_deck_id,))
        conn.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_items_due ON items(status, due_at);
            CREATE INDEX IF NOT EXISTS idx_items_file_name ON items(file_name);
            CREATE INDEX IF NOT EXISTS idx_items_library ON items(library_id);
            CREATE INDEX IF NOT EXISTS idx_items_deck ON items(deck_id);
            CREATE INDEX IF NOT EXISTS idx_history_item ON review_history(item_id, ended_at);
            CREATE INDEX IF NOT EXISTS idx_notes_item ON notes(item_id, updated_at);
            CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_events(event_type, created_at);
            CREATE INDEX IF NOT EXISTS idx_decks_parent ON decks(parent_id, sort_order);
            CREATE INDEX IF NOT EXISTS idx_content_links_source ON content_links(source_type, source_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_content_links_target ON content_links(target_type, target_id, created_at);
            """
        )
        current_version = db_user_version(conn)
        if current_version < 1:
            record_migration(conn, current_version, 1, "初始化 2.0 基础数据结构")
            current_version = 1
        if current_version < 2:
            record_migration(conn, current_version, 2, "加入长期维护元数据与可迁移 schema 版本")
            current_version = 2
        if current_version < 3:
            record_migration(conn, current_version, 3, "加入本地 Markdown 笔记与复习资料关联")
            current_version = 3
        if current_version < 4:
            record_migration(conn, current_version, 4, "Add decks, single-file items, achievements, and share packages")
            current_version = 4
        if current_version < 5:
            record_migration(conn, current_version, 5, "Add activity events for plugin achievement rewards")
            current_version = 5
        if current_version < 6:
            record_migration(conn, current_version, 6, "Add plugin-managed social profile foundation")
            current_version = 6
        if current_version < 7:
            record_migration(conn, current_version, 7, "Add hierarchical decks, content links, and learning stats plugin")
            current_version = 7
        set_db_user_version(conn, SCHEMA_VERSION)
        conn.execute(
            """
            INSERT INTO app_meta(key, value, updated_at)
            VALUES('schema_version', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
            """,
            (str(SCHEMA_VERSION), iso_now()),
        )
        conn.execute(
            """
            INSERT INTO app_meta(key, value, updated_at)
            VALUES('app_version', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
            """,
            (APP_VERSION, iso_now()),
        )
        conn.commit()


def normalize_path(path: str | Path) -> str:
    return str(Path(path).expanduser().resolve())


def is_probably_hidden(path: Path) -> bool:
    return any(part.startswith(".") for part in path.parts)


def valid_file_ext(path: Path, config: dict) -> bool:
    exts = {ext.lower() for ext in config.get("scan_extensions", [])}
    return not exts or path.suffix.lower() in exts


def safe_filename(value: str, default: str = "note") -> str:
    cleaned = "".join(ch for ch in value.strip() if ch not in '<>:"/\\|?*')
    cleaned = " ".join(cleaned.split())
    return cleaned or default


def clean_note_title(value: str, default: str = "新建笔记") -> str:
    cleaned = " ".join(str(value or "").strip().split())
    return cleaned or default


def unique_file_path(base_dir: Path, title: str, ext: str = ".md", max_stem: int | None = None) -> Path:
    ext = ext if ext.startswith(".") else f".{ext}"
    stem = safe_filename(title, "note")
    if max_stem is not None:
        stem = stem[:max_stem]
    candidate = base_dir / f"{stem}{ext}"
    if not path_exists(candidate):
        return candidate
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    candidate = base_dir / f"{stem}_{stamp}{ext}"
    counter = 2
    while path_exists(candidate):
        candidate = base_dir / f"{stem}_{stamp}_{counter}{ext}"
        counter += 1
    return candidate


def unique_note_path(base_dir: Path, title: str, ext: str = ".md") -> Path:
    return unique_file_path(base_dir, title, ext, max_stem=None)


def unique_note_path_resilient(base_dir: Path, title: str, ext: str = ".md") -> Path:
    # First try the full user-visible title. Only shorten the file name when
    # the filesystem rejects the path or component length.
    candidates = [None, 240, 220, 200, 180, 160, 120, 90, 60, 36]
    last_error = None
    for max_stem in candidates:
        candidate = unique_file_path(base_dir, title, ext, max_stem=max_stem)
        try:
            ensure_dir(candidate.parent)
            with open(fs_path(candidate), "x", encoding="utf-8"):
                pass
            unlink_file(candidate)
            return candidate
        except FileExistsError:
            continue
        except OSError as exc:
            last_error = exc
    fallback = unique_file_path(base_dir, f"note_{uuid.uuid4().hex[:12]}", ext, max_stem=32)
    try:
        ensure_dir(fallback.parent)
        with open(fs_path(fallback), "x", encoding="utf-8"):
            pass
        unlink_file(fallback)
        return fallback
    except OSError:
        if last_error:
            raise last_error
        raise


def note_row_to_dict(row: sqlite3.Row) -> dict:
    path = Path(row["file_path"])
    exists = path_exists(path)
    return {
        "id": row["id"],
        "guid": row["guid"],
        "item_id": row["item_id"],
        "title": row["title"],
        "file_path": row["file_path"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "source": row["source"],
        "exists": exists,
        "size": human_size(path_stat(path).st_size) if exists else "0 B",
    }


def deck_row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "parent_id": row["parent_id"] if "parent_id" in row.keys() else None,
        "description": row["description"] or "",
        "color": row["color"] or "#2563eb",
        "is_default": bool(row["is_default"]),
        "sort_order": int(row["sort_order"] or 0),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "item_count": int(row["item_count"] or 0) if "item_count" in row.keys() else 0,
        "due_count": int(row["due_count"] or 0) if "due_count" in row.keys() else 0,
    }


def list_decks() -> dict:
    with get_conn() as conn:
        ensure_default_deck(conn)
        rows = conn.execute(
            """
            SELECT d.*,
                   COUNT(i.id) AS item_count,
                   SUM(CASE WHEN i.status='active' AND i.due_at<=? THEN 1 ELSE 0 END) AS due_count
              FROM decks d
              LEFT JOIN items i ON i.deck_id=d.id
             GROUP BY d.id
             ORDER BY COALESCE(d.parent_id, 0) ASC, d.sort_order ASC, d.name COLLATE NOCASE ASC
            """,
            (iso_now(),),
        ).fetchall()
        conn.commit()
    decks = [deck_row_to_dict(row) for row in rows]
    by_id = {int(deck["id"]): deck for deck in decks}
    for deck in decks:
        deck["full_name"] = deck_full_name(deck, by_id)
    return {"decks": order_deck_tree(decks)}


def clean_deck_name(value: str) -> str:
    name = " ".join(str(value or "").strip().split())
    if not name:
        raise ValueError("Deck name is required")
    return name[:80]


def clean_hex_color(value: str | None) -> str:
    color = str(value or "#2563eb").strip()
    if len(color) == 7 and color.startswith("#") and all(ch in "0123456789abcdefABCDEF" for ch in color[1:]):
        return color
    return "#2563eb"


def coerce_optional_int(value) -> int | None:
    if value in (None, "", 0, "0"):
        return None
    parsed = int(value)
    return parsed if parsed > 0 else None


def child_deck_ids(conn: sqlite3.Connection, deck_id: int) -> list[int]:
    result: list[int] = []
    stack = [deck_id]
    seen = {deck_id}
    while stack:
        current = stack.pop()
        rows = conn.execute("SELECT id FROM decks WHERE parent_id=?", (current,)).fetchall()
        for row in rows:
            child_id = int(row["id"])
            if child_id in seen:
                continue
            seen.add(child_id)
            result.append(child_id)
            stack.append(child_id)
    return result


def validate_deck_parent(conn: sqlite3.Connection, deck_id: int | None, parent_id: int | None) -> int | None:
    if parent_id is None:
        return None
    if deck_id is not None and parent_id == deck_id:
        raise ValueError("Deck cannot be its own parent")
    parent = conn.execute("SELECT id FROM decks WHERE id=?", (parent_id,)).fetchone()
    if not parent:
        raise ValueError("Parent deck not found")
    if deck_id is not None and parent_id in child_deck_ids(conn, deck_id):
        raise ValueError("Deck cannot be moved below one of its children")
    return parent_id


def deck_full_name(deck: dict, by_id: dict[int, dict]) -> str:
    names = [deck["name"]]
    parent_id = deck.get("parent_id")
    guard = 0
    while parent_id and parent_id in by_id and guard < 50:
        parent = by_id[parent_id]
        names.append(parent["name"])
        parent_id = parent.get("parent_id")
        guard += 1
    return " / ".join(reversed(names))


def order_deck_tree(decks: list[dict]) -> list[dict]:
    by_parent: dict[int | None, list[dict]] = {}
    for deck in decks:
        by_parent.setdefault(deck.get("parent_id"), []).append(deck)
    for rows in by_parent.values():
        rows.sort(key=lambda item: (int(item.get("sort_order") or 0), str(item.get("name") or "").lower(), int(item["id"])))
    ordered: list[dict] = []
    seen: set[int] = set()

    def visit(parent_id: int | None, depth: int) -> None:
        for deck in by_parent.get(parent_id, []):
            deck_id = int(deck["id"])
            if deck_id in seen:
                continue
            seen.add(deck_id)
            deck["depth"] = depth
            ordered.append(deck)
            visit(deck_id, depth + 1)

    visit(None, 0)
    visit(0, 0)
    for deck in sorted(decks, key=lambda item: (int(item.get("sort_order") or 0), str(item.get("name") or "").lower())):
        if int(deck["id"]) not in seen:
            deck["depth"] = 0
            ordered.append(deck)
    return ordered


def create_deck(payload: dict) -> dict:
    now = iso_now()
    name = clean_deck_name(payload.get("name"))
    description = str(payload.get("description") or "").strip()[:500]
    color = clean_hex_color(payload.get("color"))
    parent_id = coerce_optional_int(payload.get("parent_id"))
    with get_conn() as conn:
        parent_id = validate_deck_parent(conn, None, parent_id)
        cur = conn.execute(
            """
            INSERT INTO decks(name, parent_id, description, color, is_default, sort_order, created_at, updated_at)
            VALUES(
                ?, ?, ?, ?, 0,
                COALESCE((SELECT MAX(sort_order)+1 FROM decks WHERE parent_id IS ?), 1),
                ?, ?
            )
            """,
            (name, parent_id, description, color, parent_id, now, now),
        )
        record_activity("create_deck", conn=conn)
        conn.commit()
        row = conn.execute("SELECT *, 0 AS item_count, 0 AS due_count FROM decks WHERE id=?", (cur.lastrowid,)).fetchone()
    return {"deck": deck_row_to_dict(row)}


def update_deck(payload: dict) -> dict:
    deck_id = int(payload.get("id") or 0)
    if deck_id <= 0:
        raise ValueError("Deck id is required")
    fields = []
    values = []
    if "name" in payload:
        fields.append("name=?")
        values.append(clean_deck_name(payload.get("name")))
    if "description" in payload:
        fields.append("description=?")
        values.append(str(payload.get("description") or "").strip()[:500])
    if "color" in payload:
        fields.append("color=?")
        values.append(clean_hex_color(payload.get("color")))
    if "parent_id" in payload:
        fields.append("parent_id=?")
        values.append(coerce_optional_int(payload.get("parent_id")))
    if "sort_order" in payload:
        fields.append("sort_order=?")
        values.append(int(payload.get("sort_order") or 0))
    if not fields:
        return {"updated": 0}
    fields.append("updated_at=?")
    values.append(iso_now())
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM decks WHERE id=?", (deck_id,)).fetchone()
        if not row:
            raise ValueError("Deck not found")
        if "parent_id" in payload:
            parent_index = fields.index("parent_id=?")
            values[parent_index] = validate_deck_parent(conn, deck_id, values[parent_index])
        conn.execute(f"UPDATE decks SET {', '.join(fields)} WHERE id=?", values + [deck_id])
        conn.commit()
        updated = conn.execute("SELECT *, 0 AS item_count, 0 AS due_count FROM decks WHERE id=?", (deck_id,)).fetchone()
    return {"updated": 1, "deck": deck_row_to_dict(updated)}


def reorder_decks(payload: dict) -> dict:
    rows = payload.get("decks") or []
    if not isinstance(rows, list) or not rows:
        raise ValueError("Deck order is required")
    normalized = []
    seen: set[int] = set()
    for index, raw in enumerate(rows):
        deck_id = int(raw.get("id") or 0)
        if deck_id <= 0 or deck_id in seen:
            continue
        seen.add(deck_id)
        normalized.append({
            "id": deck_id,
            "parent_id": coerce_optional_int(raw.get("parent_id")),
            "sort_order": int(raw.get("sort_order", index) or index),
        })
    now = iso_now()
    with get_conn() as conn:
        existing = {int(row["id"]) for row in conn.execute("SELECT id FROM decks").fetchall()}
        for row in normalized:
            if row["id"] not in existing:
                raise ValueError("Deck not found")
            validate_deck_parent(conn, row["id"], row["parent_id"])
        for row in normalized:
            conn.execute(
                "UPDATE decks SET parent_id=?, sort_order=?, updated_at=? WHERE id=?",
                (row["parent_id"], row["sort_order"], now, row["id"]),
            )
        record_activity("reorder_decks", 1, conn=conn)
        conn.commit()
    return list_decks()


def delete_deck(payload: dict) -> dict:
    deck_id = int(payload.get("id") or 0)
    if deck_id <= 0:
        raise ValueError("Deck id is required")
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM decks WHERE id=?", (deck_id,)).fetchone()
        if not row:
            raise ValueError("Deck not found")
        if int(row["is_default"] or 0):
            raise ValueError("Default deck cannot be deleted")
        child_ids = child_deck_ids(conn, deck_id)
        if child_ids:
            placeholders = ",".join(["?"] * len(child_ids))
            conn.execute(
                f"UPDATE decks SET parent_id=NULL, updated_at=? WHERE id IN ({placeholders})",
                [iso_now()] + child_ids,
            )
        default_deck_id = ensure_default_deck(conn)
        conn.execute("UPDATE items SET deck_id=?, updated_at=? WHERE deck_id=?", (default_deck_id, iso_now(), deck_id))
        cur = conn.execute("DELETE FROM decks WHERE id=?", (deck_id,))
        conn.commit()
    return {"deleted": cur.rowcount, "moved_to_deck_id": default_deck_id}


def ensure_library(conn: sqlite3.Connection, root_path: str) -> int:
    now = iso_now()
    display_name = Path(root_path).name or root_path
    row = conn.execute("SELECT id FROM libraries WHERE root_path=?", (root_path,)).fetchone()
    if row:
        return int(row["id"])
    cur = conn.execute(
        "INSERT INTO libraries(root_path, display_name, added_at) VALUES(?, ?, ?)",
        (root_path, display_name, now),
    )
    return int(cur.lastrowid)


def upsert_item(
    conn: sqlite3.Connection,
    file_path: Path,
    root_path: str | None = None,
    library_id: int | None = None,
    deck_id: int | None = None,
    tags: str | None = None,
) -> str:
    now = iso_now()
    file_path = Path(file_path).expanduser().resolve()
    root = Path(root_path).expanduser().resolve() if root_path else file_path.parent
    default_deck_id = ensure_default_deck(conn)
    requested_deck_id = int(deck_id) if deck_id else None
    new_item_deck_id = requested_deck_id or default_deck_id
    try:
        stat = path_stat(file_path)
    except OSError:
        return "skipped"
    try:
        relative = str(file_path.relative_to(root))
    except ValueError:
        relative = file_path.name
    modified_at = datetime.fromtimestamp(stat.st_mtime).replace(microsecond=0).isoformat()
    due_at = now if load_config()["scheduler"].get("new_item_due_immediately", True) else (
        datetime.now() + timedelta(days=1)
    ).replace(microsecond=0).isoformat()
    existing = conn.execute("SELECT * FROM items WHERE file_path=?", (str(file_path),)).fetchone()
    if existing:
        update_library_id = library_id if library_id is not None else existing["library_id"]
        update_root = str(root) if library_id is not None or not existing["root_path"] else existing["root_path"]
        update_relative = relative if library_id is not None or not existing["relative_path"] else existing["relative_path"]
        update_deck_id = requested_deck_id or existing["deck_id"] or default_deck_id
        assignments = [
            "library_id=?",
            "root_path=?",
            "relative_path=?",
            "file_name=?",
            "ext=?",
            "size_bytes=?",
            "modified_at=?",
            "updated_at=?",
            "last_seen_at=?",
            "deck_id=?",
        ]
        values: list = [
            update_library_id,
            update_root,
            update_relative,
            file_path.name,
            file_path.suffix.lower(),
            int(stat.st_size),
            modified_at,
            now,
            now,
            update_deck_id,
        ]
        if tags is not None:
            assignments.append("tags=?")
            values.append(tags)
        values.append(existing["id"])
        conn.execute(
            f"UPDATE items SET {', '.join(assignments)} WHERE id=?",
            values,
        )
        return "updated"
    conn.execute(
        """
        INSERT INTO items(
            guid, library_id, root_path, relative_path, file_path, file_name, ext,
            size_bytes, modified_at, added_at, updated_at, last_seen_at, due_at, deck_id, tags
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(uuid.uuid4()),
            library_id,
            str(root),
            relative,
            str(file_path),
            file_path.name,
            file_path.suffix.lower(),
            int(stat.st_size),
            modified_at,
            now,
            now,
            now,
            due_at,
            new_item_deck_id,
            tags or "",
        ),
    )
    return "added"


def scan_library(root_path: str, config: dict | None = None, deck_id: int | None = None, tags: str | None = None) -> dict:
    config = config or load_config()
    root = Path(root_path).expanduser().resolve()
    if not path_exists(root) or not path_is_dir(root):
        raise ValueError(f"文件库路径不存在：{root}")
    ignore_dirs = set(config.get("ignore_dirs", []))
    follow_hidden = bool(config.get("follow_hidden_dirs", False))
    added = updated = skipped = scanned = 0
    with get_conn() as conn:
        library_id = ensure_library(conn, str(root))
        for dirpath, dirnames, filenames in os.walk(fs_path(root)):
            current = Path(user_path(dirpath))
            kept_dirs = []
            for dirname in dirnames:
                child = current / dirname
                if dirname in ignore_dirs:
                    continue
                if not follow_hidden and is_probably_hidden(child.relative_to(root)):
                    continue
                kept_dirs.append(dirname)
            dirnames[:] = kept_dirs
            for filename in filenames:
                file_path = current / filename
                if not valid_file_ext(file_path, config):
                    skipped += 1
                    continue
                result = upsert_item(conn, file_path, str(root), library_id, deck_id=deck_id, tags=tags)
                scanned += 1
                if result == "added":
                    added += 1
                elif result == "updated":
                    updated += 1
                else:
                    skipped += 1
        conn.execute(
            "UPDATE libraries SET last_scan_at=?, file_count=(SELECT COUNT(*) FROM items WHERE library_id=?) WHERE id=?",
            (iso_now(), library_id, library_id),
        )
        if added:
            record_activity("add_item", added, {"source": "library", "root_path": str(root)}, conn)
        if scanned:
            record_activity("scan_library", scanned, {"root_path": str(root)}, conn)
        conn.commit()
    config_roots = [normalize_path(p) for p in config.get("library_roots", [])]
    if str(root) not in config_roots:
        config["library_roots"] = config_roots + [str(root)]
        save_config(config)
    return {
        "root_path": str(root),
        "deck_id": deck_id,
        "added": added,
        "updated": updated,
        "skipped": skipped,
        "scanned": scanned,
    }


def library_row_to_dict(row: sqlite3.Row) -> dict:
    data = dict(row)
    root = Path(data["root_path"]).expanduser()
    data["exists"] = path_exists(root) and path_is_dir(root)
    return data


def list_libraries(conn: sqlite3.Connection | None = None) -> list[dict]:
    if conn is not None:
        rows = conn.execute("SELECT * FROM libraries ORDER BY display_name ASC, root_path ASC").fetchall()
        return [library_row_to_dict(row) for row in rows]
    with get_conn() as owned_conn:
        rows = owned_conn.execute("SELECT * FROM libraries ORDER BY display_name ASC, root_path ASC").fetchall()
        return [library_row_to_dict(row) for row in rows]


def delete_library(payload: dict) -> dict:
    library_id = int(payload.get("id") or 0)
    if library_id <= 0:
        raise ValueError("Library id is required")
    remove_items = bool(payload.get("remove_items", True))
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM libraries WHERE id=?", (library_id,)).fetchone()
        if not row:
            raise ValueError("Library not found")
        root_path = row["root_path"]
        item_count = conn.execute("SELECT COUNT(*) AS c FROM items WHERE library_id=?", (library_id,)).fetchone()["c"]
        if remove_items:
            conn.execute("DELETE FROM items WHERE library_id=?", (library_id,))
        else:
            conn.execute(
                "UPDATE items SET library_id=NULL, updated_at=? WHERE library_id=?",
                (iso_now(), library_id),
            )
        cur = conn.execute("DELETE FROM libraries WHERE id=?", (library_id,))
        conn.commit()

    config = load_config()
    roots = [normalize_path(path) for path in config.get("library_roots", [])]
    normalized_root = normalize_path(root_path)
    config["library_roots"] = [path for path in roots if path != normalized_root]
    save_config(config)
    return {
        "deleted": cur.rowcount,
        "library_id": library_id,
        "root_path": root_path,
        "removed_items": int(item_count) if remove_items else 0,
        "detached_items": 0 if remove_items else int(item_count),
        "libraries": list_libraries(),
    }


def scan_all_libraries() -> dict:
    config = load_config()
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM libraries ORDER BY display_name ASC, root_path ASC").fetchall()
    scans = []
    missing = []
    for row in rows:
        root_path = row["root_path"]
        if not path_exists(root_path) or not path_is_dir(root_path):
            missing.append({"id": row["id"], "root_path": root_path, "display_name": row["display_name"]})
            continue
        scans.append(scan_library(root_path, config))
    return {"scans": scans, "missing": missing}


def add_single_file(file_path: str, deck_id: int | None = None, tags: str | None = None) -> dict:
    path = Path(file_path).expanduser().resolve()
    if not path_exists(path) or not path_is_file(path):
        raise ValueError(f"File does not exist: {path}")
    with get_conn() as conn:
        result = upsert_item(conn, path, path.parent, None, deck_id=deck_id, tags=tags)
        if result == "added":
            record_activity("add_item", 1, {"source": "single_file", "file_path": str(path)}, conn)
        conn.commit()
        row = conn.execute("SELECT * FROM items WHERE file_path=?", (str(path),)).fetchone()
    return {"file_path": str(path), "result": result, "item": row_item(row)}


def current_retrievability(row: sqlite3.Row, now: datetime | None = None) -> float:
    now = now or datetime.now()
    last_review = parse_dt(row["last_review_at"])
    if not last_review:
        return 1.0 if int(row["review_count"] or 0) == 0 else 0.75
    elapsed_days = max(0.0, (now - last_review).total_seconds() / 86400)
    stability = max(0.1, float(row["stability"] or 2.5))
    return clamp((1 + (19 / 81) * elapsed_days / stability) ** -0.5, 0.0, 1.0)


def interval_for_retention(stability: float, desired_retention: float) -> float:
    retention = clamp(float(desired_retention), 0.70, 0.97)
    factor = 19 / 81
    decay = -0.5
    interval = stability / factor * (retention ** (1 / decay) - 1)
    return clamp(interval, 0.01, 3650)


def schedule_fsrs_lite(row: sqlite3.Row, rating: int, config: dict) -> dict:
    now = datetime.now()
    desired = config["scheduler"].get("desired_retention", 0.9)
    stability = max(0.5, float(row["stability"] or 2.5))
    difficulty = clamp(float(row["difficulty"] or 5.0), 1.0, 10.0)
    old_interval = max(0.0, float(row["interval_days"] or 0))
    retrievability = current_retrievability(row, now)
    reviewed_before = int(row["review_count"] or 0) > 0

    if rating == 0:
        new_stability = max(0.35, stability * (0.42 + 0.08 * retrievability))
        difficulty = clamp(difficulty + 0.85, 1.0, 10.0)
        interval_days = 0.03 if reviewed_before else 0.02
        lapse_inc = 1
    elif rating == 1:
        new_stability = max(0.7, stability * (0.92 + 0.03 * (10 - difficulty)))
        difficulty = clamp(difficulty + 0.35, 1.0, 10.0)
        interval_days = max(1.0, min(max(old_interval * 1.2, 1.0), interval_for_retention(new_stability, desired) * 0.65))
        lapse_inc = 0
    elif rating == 3:
        boost = 2.40 + (10 - difficulty) * 0.10 + (1 - retrievability) * 0.30
        new_stability = stability * boost + 0.5
        difficulty = clamp(difficulty - 0.55, 1.0, 10.0)
        interval_days = interval_for_retention(new_stability, desired) * 1.25
        lapse_inc = 0
    else:
        boost = 1.70 + (10 - difficulty) * 0.07 + (1 - retrievability) * 0.20
        new_stability = stability * boost + 0.25
        difficulty = clamp(difficulty - 0.15, 1.0, 10.0)
        interval_days = interval_for_retention(new_stability, desired)
        lapse_inc = 0

    interval_days = clamp(interval_days, 0.02, 3650)
    due_at = now + timedelta(days=interval_days)
    return {
        "algorithm": "FSRS-Lite",
        "due_at": due_at.replace(microsecond=0).isoformat(),
        "interval_days": round(interval_days, 4),
        "ease_factor": float(row["ease_factor"] or 2.5),
        "stability": round(new_stability, 4),
        "difficulty": round(difficulty, 4),
        "retrievability": round(current_retrievability(row, now), 4),
        "lapse_inc": lapse_inc,
    }


def schedule_sm2(row: sqlite3.Row, rating: int, config: dict) -> dict:
    now = datetime.now()
    ease = max(1.3, float(row["ease_factor"] or 2.5))
    interval = max(0.0, float(row["interval_days"] or 0))
    if rating == 0:
        interval = 1
        ease = max(1.3, ease - 0.2)
        lapse_inc = 1
    elif rating == 1:
        interval = max(1, interval * 1.2)
        ease = max(1.3, ease - 0.15)
        lapse_inc = 0
    elif rating == 3:
        interval = 6 if interval < 1 else interval * ease * 1.3
        ease += 0.15
        lapse_inc = 0
    else:
        interval = 6 if interval < 1 else interval * ease
        lapse_inc = 0
    return {
        "algorithm": "SM-2",
        "due_at": (now + timedelta(days=interval)).replace(microsecond=0).isoformat(),
        "interval_days": round(interval, 4),
        "ease_factor": round(ease, 4),
        "stability": float(row["stability"] or interval or 2.5),
        "difficulty": float(row["difficulty"] or 5.0),
        "retrievability": current_retrievability(row, now),
        "lapse_inc": lapse_inc,
    }


def schedule_fixed(row: sqlite3.Row, rating: int, config: dict) -> dict:
    stages = [1, 2, 4, 8, 15, 30, 60, 120, 240, 365]
    review_count = int(row["review_count"] or 0)
    idx = min(review_count, len(stages) - 1)
    if rating == 0:
        idx = 0
        lapse_inc = 1
    elif rating == 3:
        idx = min(idx + 1, len(stages) - 1)
        lapse_inc = 0
    else:
        lapse_inc = 0
    interval = stages[idx]
    return {
        "algorithm": "Fixed",
        "due_at": (datetime.now() + timedelta(days=interval)).replace(microsecond=0).isoformat(),
        "interval_days": float(interval),
        "ease_factor": float(row["ease_factor"] or 2.5),
        "stability": float(interval),
        "difficulty": float(row["difficulty"] or 5.0),
        "retrievability": current_retrievability(row),
        "lapse_inc": lapse_inc,
    }


def calculate_schedule(row: sqlite3.Row, rating: int, config: dict) -> dict:
    algorithm = config.get("scheduler", {}).get("algorithm", "FSRS-Lite")
    if algorithm == "SM-2":
        return schedule_sm2(row, rating, config)
    if algorithm == "Fixed":
        return schedule_fixed(row, rating, config)
    return schedule_fsrs_lite(row, rating, config)


def row_item(row: sqlite3.Row) -> dict:
    now = datetime.now()
    due_at = parse_dt(row["due_at"]) or now
    review_count = int(row["review_count"] or 0)
    status = row["status"] or "active"
    exists = path_exists(row["file_path"])
    return {
        "id": row["id"],
        "guid": row["guid"],
        "library_id": row["library_id"],
        "deck_id": row["deck_id"],
        "root_path": row["root_path"],
        "relative_path": row["relative_path"],
        "file_path": row["file_path"],
        "file_name": row["file_name"],
        "ext": row["ext"],
        "size_bytes": row["size_bytes"],
        "size": human_size(row["size_bytes"]),
        "modified_at": row["modified_at"],
        "added_at": row["added_at"],
        "updated_at": row["updated_at"],
        "status": status,
        "tags": row["tags"] or "",
        "priority": int(row["priority"] or 0),
        "notes": row["notes"] or "",
        "due_at": row["due_at"],
        "due_label": due_at.strftime("%Y-%m-%d %H:%M"),
        "due_state": "new" if review_count == 0 else ("due" if due_at <= now else "future"),
        "interval_days": float(row["interval_days"] or 0),
        "ease_factor": float(row["ease_factor"] or 2.5),
        "stability": float(row["stability"] or 2.5),
        "difficulty": float(row["difficulty"] or 5.0),
        "retrievability": round(current_retrievability(row), 3),
        "review_count": review_count,
        "lapse_count": int(row["lapse_count"] or 0),
        "total_read_seconds": int(row["total_read_seconds"] or 0),
        "last_review_at": row["last_review_at"],
        "pinned": bool(row["pinned"]),
        "exists": exists,
        "preview_url": f"/api/file/{row['id']}",
    }


def item_summary(conn: sqlite3.Connection, item_id: int) -> dict | None:
    row = conn.execute("SELECT id, file_name, file_path, ext FROM items WHERE id=?", (item_id,)).fetchone()
    if not row:
        return None
    return {
        "id": int(row["id"]),
        "type": "item",
        "label": row["file_name"],
        "path": row["file_path"],
        "ext": row["ext"] or "",
        "preview_url": f"/api/file/{row['id']}",
        "exists": path_exists(row["file_path"]),
    }


def note_summary(conn: sqlite3.Connection, note_id: int) -> dict | None:
    row = conn.execute("SELECT id, title, file_path FROM notes WHERE id=?", (note_id,)).fetchone()
    if not row:
        return None
    return {
        "id": int(row["id"]),
        "type": "note",
        "label": row["title"],
        "path": row["file_path"],
        "ext": Path(row["file_path"]).suffix.lower(),
        "preview_url": f"/api/note-file/{row['id']}",
        "exists": path_exists(row["file_path"]),
    }


def source_summary(conn: sqlite3.Connection, source_type: str, source_id: int) -> dict | None:
    if source_type == "note":
        return note_summary(conn, source_id)
    if source_type == "item":
        return item_summary(conn, source_id)
    return None


def target_summary(conn: sqlite3.Connection, target_type: str, target_id: int) -> dict | None:
    return source_summary(conn, target_type, target_id)


def link_row_to_dict(row: sqlite3.Row, conn: sqlite3.Connection | None = None) -> dict:
    close_conn = False
    if conn is None:
        close_conn = True
        conn = sqlite3.connect(fs_path(DB_PATH), timeout=30)
        conn.row_factory = sqlite3.Row
    try:
        source = source_summary(conn, row["source_type"], int(row["source_id"]))
        target = target_summary(conn, row["target_type"], int(row["target_id"]))
    finally:
        if close_conn:
            conn.close()
    return {
        "id": int(row["id"]),
        "guid": row["guid"],
        "source_type": row["source_type"],
        "source_id": int(row["source_id"]),
        "source_label": row["source_label"] or "",
        "selected_text": row["selected_text"] or "",
        "target_type": row["target_type"],
        "target_id": int(row["target_id"]),
        "target_label": row["target_label"] or "",
        "note": row["note"] or "",
        "created_at": row["created_at"],
        "source": source,
        "target": target,
    }


def create_content_link(payload: dict) -> dict:
    source_type = str(payload.get("source_type") or "").strip()
    target_type = str(payload.get("target_type") or "").strip()
    if source_type not in {"item", "note"} or target_type not in {"item", "note"}:
        raise ValueError("Link source and target must be item or note")
    source_id = int(payload.get("source_id") or 0)
    target_id = int(payload.get("target_id") or 0)
    if source_id <= 0 or target_id <= 0:
        raise ValueError("Link source and target are required")
    selected_text = str(payload.get("selected_text") or "").strip()[:2000]
    note = str(payload.get("note") or "").strip()[:1000]
    now = iso_now()
    with get_conn() as conn:
        source = source_summary(conn, source_type, source_id)
        target = target_summary(conn, target_type, target_id)
        if not source:
            raise ValueError("Link source not found")
        if not target:
            raise ValueError("Link target not found")
        cur = conn.execute(
            """
            INSERT INTO content_links(
                guid, source_type, source_id, source_label, selected_text,
                target_type, target_id, target_label, note, created_at
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                source_type,
                source_id,
                source["label"],
                selected_text,
                target_type,
                target_id,
                target["label"],
                note,
                now,
            ),
        )
        record_activity("create_content_link", 1, {"source_type": source_type, "target_type": target_type}, conn)
        conn.commit()
        row = conn.execute("SELECT * FROM content_links WHERE id=?", (cur.lastrowid,)).fetchone()
        link = link_row_to_dict(row, conn)
    return {"link": link}


def list_content_links(params: dict) -> dict:
    clauses = []
    values: list = []
    source_type = (params.get("source_type") or [""])[0].strip()
    target_type = (params.get("target_type") or [""])[0].strip()
    source_id = (params.get("source_id") or [""])[0].strip()
    target_id = (params.get("target_id") or [""])[0].strip()
    if source_type:
        clauses.append("source_type=?")
        values.append(source_type)
    if source_id:
        clauses.append("source_id=?")
        values.append(int(source_id))
    if target_type:
        clauses.append("target_type=?")
        values.append(target_type)
    if target_id:
        clauses.append("target_id=?")
        values.append(int(target_id))
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT * FROM content_links{where} ORDER BY created_at DESC, id DESC LIMIT 300",
            values,
        ).fetchall()
        links = [link_row_to_dict(row, conn) for row in rows]
    return {"links": links}


def delete_content_link(payload: dict) -> dict:
    link_id = int(payload.get("id") or 0)
    if link_id <= 0:
        raise ValueError("Link id is required")
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM content_links WHERE id=?", (link_id,))
        conn.commit()
    return {"deleted": cur.rowcount}


def search_link_targets(params: dict) -> dict:
    query = (params.get("q") or [""])[0].strip()
    limit = min(80, max(1, int((params.get("limit") or ["30"])[0])))
    pattern = f"%{query}%"
    with get_conn() as conn:
        item_rows = conn.execute(
            """
            SELECT id, file_name AS label, file_path AS path, ext, 'item' AS type
              FROM items
             WHERE ?='' OR file_name LIKE ? OR file_path LIKE ? OR tags LIKE ?
             ORDER BY updated_at DESC, file_name ASC
             LIMIT ?
            """,
            (query, pattern, pattern, pattern, limit),
        ).fetchall()
        note_rows = conn.execute(
            """
            SELECT id, title AS label, file_path AS path, '' AS ext, 'note' AS type
              FROM notes
             WHERE ?='' OR title LIKE ? OR file_path LIKE ?
             ORDER BY updated_at DESC, title ASC
             LIMIT ?
            """,
            (query, pattern, pattern, limit),
        ).fetchall()
    targets = []
    for row in list(item_rows) + list(note_rows):
        data = dict(row)
        data["exists"] = path_exists(data["path"])
        targets.append(data)
    return {"targets": targets[:limit]}


def learning_stats_summary() -> dict:
    config = load_config()
    if not plugin_enabled("learning_stats", config):
        return {"enabled": False}
    today = datetime.now().date()
    start = today - timedelta(days=29)
    with get_conn() as conn:
        totals = {
            "items": conn.execute("SELECT COUNT(*) AS c FROM items").fetchone()["c"],
            "active": conn.execute("SELECT COUNT(*) AS c FROM items WHERE status='active'").fetchone()["c"],
            "done": conn.execute("SELECT COUNT(*) AS c FROM items WHERE status='done'").fetchone()["c"],
            "reviews": conn.execute("SELECT COUNT(*) AS c FROM review_history").fetchone()["c"],
            "seconds": conn.execute("SELECT COALESCE(SUM(duration_seconds),0) AS s FROM review_history").fetchone()["s"],
            "links": conn.execute("SELECT COUNT(*) AS c FROM content_links").fetchone()["c"],
        }
        daily_rows = {
            row["day"]: dict(row)
            for row in conn.execute(
                """
                SELECT substr(ended_at,1,10) AS day,
                       COUNT(*) AS reviews,
                       COALESCE(SUM(duration_seconds),0) AS seconds,
                       AVG(rating) AS avg_rating
                  FROM review_history
                 WHERE substr(ended_at,1,10)>=?
                 GROUP BY day
                 ORDER BY day ASC
                """,
                (start.isoformat(),),
            ).fetchall()
        }
        deck_rows = conn.execute(
            """
            SELECT d.id, d.name, d.parent_id, d.color,
                   COUNT(i.id) AS item_count,
                   COALESCE(SUM(i.total_read_seconds),0) AS seconds,
                   COALESCE(SUM(i.review_count),0) AS reviews,
                   AVG(CASE WHEN i.review_count>0 THEN i.retrievability ELSE NULL END) AS avg_retention
              FROM decks d
              LEFT JOIN items i ON i.deck_id=d.id
             GROUP BY d.id
             ORDER BY seconds DESC, reviews DESC, item_count DESC, d.sort_order ASC
             LIMIT 12
            """
        ).fetchall()
        rating_rows = conn.execute(
            "SELECT rating, COUNT(*) AS count FROM review_history GROUP BY rating ORDER BY rating ASC"
        ).fetchall()
        status_rows = conn.execute(
            "SELECT status, COUNT(*) AS count FROM items GROUP BY status"
        ).fetchall()
        added_rows = conn.execute(
            """
            SELECT substr(added_at,1,10) AS day, COUNT(*) AS count
              FROM items
             WHERE substr(added_at,1,10)>=?
             GROUP BY day
             ORDER BY day ASC
            """,
            (start.isoformat(),),
        ).fetchall()
    added_by_day = {row["day"]: row["count"] for row in added_rows}
    daily = []
    for offset in range(30):
        day = (start + timedelta(days=offset)).isoformat()
        row = daily_rows.get(day, {})
        daily.append({
            "day": day,
            "reviews": int(row.get("reviews") or 0),
            "seconds": int(row.get("seconds") or 0),
            "avg_rating": round(float(row.get("avg_rating") or 0), 2),
            "added": int(added_by_day.get(day, 0) or 0),
        })
    best_day = max(daily, key=lambda row: (row["reviews"], row["seconds"]), default=None)
    totals["hours"] = round((totals["seconds"] or 0) / 3600, 2)
    totals["avg_seconds_per_review"] = round((totals["seconds"] or 0) / max(1, totals["reviews"]), 1)
    totals["completion_rate"] = round(totals["done"] / max(1, totals["items"]), 3)
    totals["best_day"] = best_day
    return {
        "enabled": True,
        "totals": totals,
        "daily": daily,
        "decks": [dict(row) for row in deck_rows],
        "ratings": [dict(row) for row in rating_rows],
        "statuses": [dict(row) for row in status_rows],
        "generated_at": iso_now(),
    }


def get_overview() -> dict:
    now = iso_now()
    today = datetime.now().date().isoformat()
    with get_conn() as conn:
        stats = {
            "total": conn.execute("SELECT COUNT(*) AS c FROM items").fetchone()["c"],
            "active": conn.execute("SELECT COUNT(*) AS c FROM items WHERE status='active'").fetchone()["c"],
            "due": conn.execute(
                "SELECT COUNT(*) AS c FROM items WHERE status='active' AND due_at<=?", (now,)
            ).fetchone()["c"],
            "new": conn.execute(
                "SELECT COUNT(*) AS c FROM items WHERE status='active' AND review_count=0"
            ).fetchone()["c"],
            "suspended": conn.execute("SELECT COUNT(*) AS c FROM items WHERE status='suspended'").fetchone()["c"],
            "seconds": conn.execute("SELECT COALESCE(SUM(total_read_seconds),0) AS s FROM items").fetchone()["s"],
            "reviewed_today": conn.execute(
                "SELECT COUNT(*) AS c FROM review_history WHERE substr(ended_at,1,10)=?", (today,)
            ).fetchone()["c"],
            "seconds_today": conn.execute(
                "SELECT COALESCE(SUM(duration_seconds),0) AS s FROM review_history WHERE substr(ended_at,1,10)=?",
                (today,),
            ).fetchone()["s"],
        }
        due_rows = conn.execute(
            """
            SELECT * FROM items
             WHERE status='active' AND due_at<=?
             ORDER BY pinned DESC, due_at ASC, priority DESC, file_name ASC
             LIMIT 12
            """,
            (now,),
        ).fetchall()
        future = conn.execute(
            """
            SELECT substr(due_at, 1, 10) AS day, COUNT(*) AS count
              FROM items
             WHERE status='active'
             GROUP BY day
             ORDER BY day ASC
             LIMIT 21
            """
        ).fetchall()
        libraries = list_libraries(conn)
        deck_rows = conn.execute(
            """
            SELECT d.*,
                   COUNT(i.id) AS item_count,
                   SUM(CASE WHEN i.status='active' AND i.due_at<=? THEN 1 ELSE 0 END) AS due_count
              FROM decks d
              LEFT JOIN items i ON i.deck_id=d.id
             GROUP BY d.id
             ORDER BY COALESCE(d.parent_id, 0) ASC, d.sort_order ASC, d.name COLLATE NOCASE ASC
            """,
            (now,),
        ).fetchall()
        history_dates = [
            row["day"]
            for row in conn.execute(
                "SELECT DISTINCT substr(ended_at,1,10) AS day FROM review_history ORDER BY day DESC LIMIT 120"
            ).fetchall()
        ]
    streak = 0
    cursor = datetime.now().date()
    date_set = set(history_dates)
    while cursor.isoformat() in date_set:
        streak += 1
        cursor -= timedelta(days=1)
    return {
        "app": {
            "name": APP_NAME,
            "version": APP_VERSION,
            **profile_paths(),
        },
        "stats": {**stats, "streak": streak},
        "due_items": [row_item(row) for row in due_rows],
        "future_due": [dict(row) for row in future],
        "libraries": libraries,
        "decks": list_decks()["decks"],
        "achievements": achievement_summary(),
        "learning_stats": learning_stats_summary(),
        "config": load_config(),
        "plugins": list_plugins()["plugins"],
        "social": get_social_profile(),
        "now": now,
    }


def query_items(params: dict) -> dict:
    search = (params.get("search") or [""])[0].strip()
    status = (params.get("status") or ["active"])[0]
    due = (params.get("due") or ["all"])[0]
    tag = (params.get("tag") or [""])[0].strip()
    library_id = (params.get("library_id") or [""])[0].strip()
    deck_id = (params.get("deck_id") or [""])[0].strip()
    page = max(1, int((params.get("page") or ["1"])[0]))
    page_size = min(500, max(10, int((params.get("page_size") or ["80"])[0])))
    sort = (params.get("sort") or ["due_at"])[0]
    direction = (params.get("direction") or ["asc"])[0].lower()
    allowed_sort = {
        "file_name", "due_at", "added_at", "last_review_at", "review_count",
        "total_read_seconds", "priority", "size_bytes", "retrievability",
    }
    sort = sort if sort in allowed_sort else "due_at"
    direction = "DESC" if direction == "desc" else "ASC"
    clauses = []
    values: list = []
    if status != "all":
        clauses.append("status=?")
        values.append(status)
    if due == "due":
        clauses.append("due_at<=?")
        values.append(iso_now())
    elif due == "future":
        clauses.append("due_at>?")
        values.append(iso_now())
    elif due == "new":
        clauses.append("review_count=0")
    if tag:
        clauses.append("tags LIKE ?")
        values.append(f"%{tag}%")
    if library_id:
        clauses.append("library_id=?")
        values.append(library_id)
    if deck_id:
        clauses.append("deck_id=?")
        values.append(deck_id)
    if search:
        clauses.append("(file_name LIKE ? OR file_path LIKE ? OR tags LIKE ? OR notes LIKE ?)")
        values.extend([f"%{search}%"] * 4)
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    with get_conn() as conn:
        total = conn.execute(f"SELECT COUNT(*) AS c FROM items{where}", values).fetchone()["c"]
        rows = conn.execute(
            f"""
            SELECT * FROM items
            {where}
            ORDER BY pinned DESC, {sort} {direction}, id ASC
            LIMIT ? OFFSET ?
            """,
            values + [page_size, (page - 1) * page_size],
        ).fetchall()
    return {"items": [row_item(row) for row in rows], "total": total, "page": page, "page_size": page_size}


def choose_folder_dialog() -> str:
    global WEBVIEW_WINDOW
    if WEBVIEW_WINDOW is not None:
        try:
            import webview

            dialog_type = getattr(getattr(webview, "FileDialog", None), "FOLDER", None)
            if dialog_type is None:
                dialog_type = getattr(webview, "FOLDER_DIALOG", 20)
            result = WEBVIEW_WINDOW.create_file_dialog(
                dialog_type=dialog_type,
                directory=str(Path.home()),
                allow_multiple=False,
            )
            if isinstance(result, (list, tuple)):
                return str(result[0]) if result else ""
            return str(result or "")
        except Exception:
            log_error("WebView 文件夹选择失败，尝试 Tk 回退：\n" + traceback.format_exc())

    import tkinter as tk
    from tkinter import filedialog
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    root.update()
    selected = filedialog.askdirectory(title="选择本地文件库")
    root.destroy()
    return selected


def tk_filetypes(file_types: tuple[str, ...]) -> list[tuple[str, str]]:
    parsed = []
    for item in file_types:
        text = str(item)
        if "(" in text and ")" in text:
            label = text.split("(", 1)[0].strip() or text
            pattern = text.rsplit("(", 1)[1].split(")", 1)[0].strip() or "*.*"
            parsed.append((label, pattern))
        else:
            parsed.append((text, "*.*"))
    return parsed or [("All files", "*.*")]


def normalize_dialog_result(result) -> str:
    if isinstance(result, (list, tuple)):
        return str(result[0]) if result else ""
    return str(result or "")


def choose_file_dialog(file_types: tuple[str, ...] = ("All files (*.*)",), title: str = "选择文件") -> str:
    global WEBVIEW_WINDOW
    if WEBVIEW_WINDOW is not None:
        try:
            import webview

            dialog_type = getattr(getattr(webview, "FileDialog", None), "OPEN", None)
            if dialog_type is None:
                dialog_type = getattr(webview, "OPEN_DIALOG", 10)
            result = WEBVIEW_WINDOW.create_file_dialog(
                dialog_type=dialog_type,
                directory=str(Path.home()),
                allow_multiple=False,
                file_types=file_types,
            )
            return normalize_dialog_result(result)
        except Exception:
            log_error("WebView 文件选择失败，尝试 Tk 回退：\n" + traceback.format_exc())

    import tkinter as tk
    from tkinter import filedialog
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    root.update()
    selected = filedialog.askopenfilename(title=title, filetypes=tk_filetypes(file_types))
    root.destroy()
    return selected


def choose_save_file_dialog(
    default_name: str,
    file_types: tuple[str, ...] = ("All files (*.*)",),
    title: str = "保存文件",
    initial_dir: str | Path | None = None,
) -> str:
    global WEBVIEW_WINDOW
    directory = str(Path(initial_dir).expanduser().resolve()) if initial_dir else str(export_dir())
    if WEBVIEW_WINDOW is not None:
        try:
            import webview

            dialog_type = getattr(getattr(webview, "FileDialog", None), "SAVE", None)
            if dialog_type is None:
                dialog_type = getattr(webview, "SAVE_DIALOG", 30)
            result = WEBVIEW_WINDOW.create_file_dialog(
                dialog_type=dialog_type,
                directory=directory,
                allow_multiple=False,
                save_filename=default_name,
                file_types=file_types,
            )
            return normalize_dialog_result(result)
        except Exception:
            log_error("WebView 保存位置选择失败，尝试 Tk 回退：\n" + traceback.format_exc())

    import tkinter as tk
    from tkinter import filedialog
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    root.update()
    selected = filedialog.asksaveasfilename(
        title=title,
        initialdir=directory,
        initialfile=default_name,
        filetypes=tk_filetypes(file_types),
    )
    root.destroy()
    return selected


def timestamped_name(prefix: str, suffix: str) -> str:
    return f"{prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}{suffix}"


def resolve_output_file(
    target_path: str | Path | None,
    target_dir: str | Path | None,
    default_name: str,
) -> Path:
    if target_path:
        target = Path(target_path).expanduser().resolve()
    else:
        target_root = ensure_export_dir(target_dir=target_dir)
        target = target_root / default_name
    ensure_dir(target.parent)
    return target


def open_path(path: str) -> None:
    target = user_path(path)
    if platform.system() == "Windows":
        os.startfile(target)  # type: ignore[attr-defined]
    elif platform.system() == "Darwin":
        subprocess.Popen(["open", target])
    else:
        subprocess.Popen(["xdg-open", target])


def open_with_dialog(path: str) -> None:
    target = user_path(path)
    if platform.system() == "Windows":
        subprocess.Popen(["rundll32.exe", "shell32.dll,OpenAs_RunDLL", target])
    elif platform.system() == "Darwin":
        subprocess.Popen(["open", "-a", "Finder", target])
    else:
        subprocess.Popen(["xdg-open", target])


def open_parent(path: str) -> None:
    target = user_path(path)
    parent = str(Path(target).parent)
    if platform.system() == "Windows":
        subprocess.Popen(["explorer", "/select,", target])
    else:
        open_path(parent)


def start_review(item_id: int | None = None) -> dict:
    with get_conn() as conn:
        if item_id:
            row = conn.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
        else:
            row = conn.execute(
                """
                SELECT * FROM items
                 WHERE status='active' AND due_at<=?
                 ORDER BY pinned DESC, due_at ASC, priority DESC, file_name ASC
                 LIMIT 1
                """,
                (iso_now(),),
            ).fetchone()
        if not row:
            return {"item": None, "session_id": None}
        session_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO review_sessions(id, item_id, started_at) VALUES(?, ?, ?)",
            (session_id, row["id"], iso_now()),
        )
        conn.commit()
    config = load_config()
    if config.get("review", {}).get("auto_open_file", False) and path_exists(row["file_path"]):
        try:
            open_path(row["file_path"])
        except Exception:
            log_error("打开文件失败：\n" + traceback.format_exc())
    return {"item": row_item(row), "session_id": session_id}


def finish_review(payload: dict) -> dict:
    item_id = int(payload["item_id"])
    rating = int(payload.get("rating", 2))
    rating = max(0, min(3, rating))
    session_id = payload.get("session_id")
    client_duration = int(payload.get("duration_seconds") or 0)
    now = iso_now()
    config = load_config()
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
        if not row:
            raise ValueError("复习项目不存在")
        started_at = None
        if session_id:
            session = conn.execute("SELECT * FROM review_sessions WHERE id=?", (session_id,)).fetchone()
            if session:
                started_at = session["started_at"]
        started_dt = parse_dt(started_at)
        duration = client_duration
        if started_dt:
            duration = max(duration, int((datetime.now() - started_dt).total_seconds()))
        schedule = calculate_schedule(row, rating, config)
        conn.execute(
            """
            UPDATE items
               SET due_at=?, interval_days=?, ease_factor=?, stability=?, difficulty=?,
                   retrievability=?, review_count=review_count+1,
                   lapse_count=lapse_count+?, total_read_seconds=total_read_seconds+?,
                   last_review_at=?, updated_at=?
             WHERE id=?
            """,
            (
                schedule["due_at"],
                schedule["interval_days"],
                schedule["ease_factor"],
                schedule["stability"],
                schedule["difficulty"],
                schedule["retrievability"],
                schedule["lapse_inc"],
                duration,
                now,
                now,
                item_id,
            ),
        )
        if session_id:
            conn.execute("UPDATE review_sessions SET ended_at=? WHERE id=?", (now, session_id))
        conn.execute(
            """
            INSERT INTO review_history(
                item_id, session_id, started_at, ended_at, duration_seconds, rating,
                rating_label, algorithm, scheduled_days, ease_factor, stability,
                difficulty, retrievability
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item_id,
                session_id,
                started_at,
                now,
                duration,
                rating,
                RATING_LABELS[rating],
                schedule["algorithm"],
                schedule["interval_days"],
                schedule["ease_factor"],
                schedule["stability"],
                schedule["difficulty"],
                schedule["retrievability"],
            ),
        )
        record_activity("review", 1, {"rating": rating, "duration_seconds": duration}, conn)
        if duration:
            record_activity("study_seconds", duration, {"item_id": item_id}, conn)
        conn.commit()
        updated = conn.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
    return {"item": row_item(updated), "schedule": schedule, "duration_seconds": duration}


def update_items(payload: dict) -> dict:
    ids = [int(i) for i in payload.get("ids", [])]
    if not ids:
        raise ValueError("没有选择文件")
    fields = payload.get("fields", {})
    allowed = {"tags", "status", "priority", "notes", "pinned", "due_at", "deck_id"}
    assignments = []
    values = []
    for key, value in fields.items():
        if key in allowed:
            if key == "due_at" and isinstance(value, str) and value.endswith("Z"):
                value = value[:-1]
            if key == "deck_id":
                value = int(value)
            assignments.append(f"{key}=?")
            values.append(value)
    if not assignments:
        return {"updated": 0}
    assignments.append("updated_at=?")
    values.append(iso_now())
    placeholders = ",".join(["?"] * len(ids))
    with get_conn() as conn:
        cur = conn.execute(
            f"UPDATE items SET {', '.join(assignments)} WHERE id IN ({placeholders})",
            values + ids,
        )
        conn.commit()
    return {"updated": cur.rowcount}


def delete_items(payload: dict) -> dict:
    ids = [int(i) for i in payload.get("ids", [])]
    if not ids:
        raise ValueError("没有选择文件")
    placeholders = ",".join(["?"] * len(ids))
    with get_conn() as conn:
        cur = conn.execute(f"DELETE FROM items WHERE id IN ({placeholders})", ids)
        conn.commit()
    return {"deleted": cur.rowcount}


def note_rows_by_ids(conn: sqlite3.Connection, ids: list[int]) -> list[sqlite3.Row]:
    if not ids:
        return []
    placeholders = ",".join(["?"] * len(ids))
    return conn.execute(f"SELECT * FROM notes WHERE id IN ({placeholders})", ids).fetchall()


def list_notes(item_id: int | None = None) -> dict:
    where = ""
    values: list = []
    if item_id:
        where = "WHERE item_id=?"
        values.append(item_id)
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT * FROM notes {where} ORDER BY updated_at DESC, id DESC LIMIT 300",
            values,
        ).fetchall()
    return {"notes": [note_row_to_dict(row) for row in rows], "notes_dir": str(ensure_notes_dir())}


def read_note(note_id: int) -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
    if not row:
        raise ValueError("笔记不存在")
    note = note_row_to_dict(row)
    path = Path(note["file_path"])
    note["content"] = read_text_file(path) if path_exists(path) else ""
    return {"note": note}


def create_note(payload: dict) -> dict:
    config = load_config()
    base_dir = ensure_notes_dir(config)
    item_id = payload.get("item_id")
    item_id = int(item_id) if item_id else None
    title = clean_note_title(payload.get("title") or "新建笔记", "新建笔记")
    ext = config.get("notes", {}).get("default_extension", ".md") or ".md"
    now = iso_now()
    linked_line = ""
    if item_id:
        with get_conn() as conn:
            item = conn.execute("SELECT file_name, file_path FROM items WHERE id=?", (item_id,)).fetchone()
        if item:
            if title == "新建笔记" or "复习笔记" not in title:
                title = f"{item['file_name']} 复习笔记"
            linked_line = f"\n关联资料：{item['file_name']}\n路径：{item['file_path']}\n"
    path = unique_note_path_resilient(base_dir, title, ext)
    content = payload.get("content")
    if content is None:
        content = f"# {title}\n\n创建时间：{now}{linked_line}\n"
    write_text_file(path, content)
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO notes(guid, item_id, title, file_path, created_at, updated_at, source)
            VALUES(?, ?, ?, ?, ?, ?, ?)
            """,
            (str(uuid.uuid4()), item_id, title, str(path), now, now, payload.get("source") or "app"),
        )
        record_activity("create_note", 1, {"source": payload.get("source") or "app"}, conn)
        conn.commit()
        row = conn.execute("SELECT * FROM notes WHERE id=?", (cur.lastrowid,)).fetchone()
    if payload.get("open_local"):
        open_parent(str(path))
    return {"note": note_row_to_dict(row)}


def save_note(payload: dict) -> dict:
    note_id = int(payload["id"])
    content = payload.get("content", "")
    title = clean_note_title(payload.get("title") or "未命名笔记", "未命名笔记")
    now = iso_now()
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
        if not row:
            raise ValueError("笔记不存在")
        path = Path(row["file_path"])
        write_text_file(path, content)
        conn.execute("UPDATE notes SET title=?, updated_at=? WHERE id=?", (title, now, note_id))
        conn.commit()
        updated = conn.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
    return {"note": note_row_to_dict(updated)}


def open_note(note_id: int, choose_app: bool = False) -> dict:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
    if not row:
        raise ValueError("笔记不存在")
    path = row["file_path"]
    if choose_app:
        open_with_dialog(path)
    else:
        open_path(path)
    return {"ok": True}


def delete_notes(payload: dict) -> dict:
    ids = [int(i) for i in payload.get("ids", [])]
    if not ids:
        raise ValueError("没有选择笔记")
    delete_files = bool(payload.get("delete_files", True))
    deleted_files = 0
    missing_files = 0
    errors: list[str] = []
    with get_conn() as conn:
        rows = note_rows_by_ids(conn, ids)
        for row in rows:
            path = Path(row["file_path"])
            if delete_files:
                try:
                    if path_exists(path) and path_is_file(path):
                        unlink_file(path)
                        deleted_files += 1
                    else:
                        missing_files += 1
                except Exception as exc:
                    errors.append(f"{path}: {exc}")
        placeholders = ",".join(["?"] * len(ids))
        cur = conn.execute(f"DELETE FROM notes WHERE id IN ({placeholders})", ids)
        conn.commit()
    return {
        "deleted": cur.rowcount,
        "deleted_files": deleted_files,
        "missing_files": missing_files,
        "errors": errors,
    }


def export_notes(payload: dict) -> dict:
    ids = [int(i) for i in payload.get("ids", [])]
    if not ids:
        raise ValueError("没有选择笔记")
    target_dir = ensure_export_dir(target_dir=payload.get("target_dir") or None)
    copied = 0
    missing = 0
    exported: list[str] = []
    with get_conn() as conn:
        rows = note_rows_by_ids(conn, ids)
    for row in rows:
        src = Path(row["file_path"])
        if not path_exists(src) or not path_is_file(src):
            missing += 1
            continue
        target = target_dir / src.name
        if path_exists(target):
            target = unique_note_path(target_dir, target.stem, target.suffix)
        copy_file(src, target)
        copied += 1
        exported.append(str(target))
    record_activity("export_notes", copied, {"missing": missing})
    return {"export_dir": str(target_dir), "exported": copied, "missing": missing, "files": exported}


def tag_list(value: str | None) -> list[str]:
    seen = set()
    tags = []
    for raw in str(value or "").replace("，", ",").split(","):
        tag = raw.strip()
        key = tag.lower()
        if tag and key not in seen:
            tags.append(tag)
            seen.add(key)
    return tags


def core_achievement_templates() -> list[dict]:
    templates = [
        {
            "id": "first_item",
            "title": "第一份资料",
            "description": "添加任意一个文件或文件库资料",
            "metric": "items",
            "target": 1,
            "points": 10,
            "tier": "bronze",
        },
        {
            "id": "first_single_file",
            "title": "单文件入口",
            "description": "添加一个不依赖文件夹扫描的单独文件",
            "metric": "single_files",
            "target": 1,
            "points": 10,
            "tier": "bronze",
        },
        {
            "id": "first_deck",
            "title": "建立卡组",
            "description": "创建自己的复习分类",
            "metric": "custom_decks",
            "target": 1,
            "points": 15,
            "tier": "bronze",
        },
        {
            "id": "first_tag",
            "title": "标签整理",
            "description": "给资料贴上标签",
            "metric": "tagged_items",
            "target": 1,
            "points": 10,
            "tier": "bronze",
        },
        {
            "id": "first_review",
            "title": "第一次复习",
            "description": "完成一次复习评价",
            "metric": "reviews",
            "target": 1,
            "points": 15,
            "tier": "bronze",
        },
        {
            "id": "streak_3",
            "title": "三日连续",
            "description": "连续 3 天有复习记录",
            "metric": "streak",
            "target": 3,
            "points": 25,
            "tier": "silver",
        },
        {
            "id": "first_note",
            "title": "第一篇笔记",
            "description": "创建自己的复习笔记",
            "metric": "notes",
            "target": 1,
            "points": 10,
            "tier": "bronze",
        },
    ]
    for target in [10, 25, 50, 100, 250, 500, 1000]:
        templates.append({
            "id": f"review_{target}",
            "title": f"复习 {target} 次",
            "description": f"累计完成 {target} 次复习",
            "metric": "reviews",
            "target": target,
            "points": max(20, int(math.sqrt(target) * 12)),
            "tier": tier_for_target(target),
        })
    for target in [10, 25, 50, 100, 250, 500, 1000]:
        templates.append({
            "id": f"completion_{target}",
            "title": f"完成 {target} 份资料",
            "description": f"标记 {target} 个资料为完成",
            "metric": "done_items",
            "target": target,
            "points": max(20, int(math.sqrt(target) * 10)),
            "tier": tier_for_target(target),
        })
    for target in [5, 10, 20, 50, 100, 200]:
        templates.append({
            "id": f"notes_{target}",
            "title": f"写下 {target} 篇笔记",
            "description": f"累计创建 {target} 篇复习笔记",
            "metric": "notes",
            "target": target,
            "points": max(20, int(math.sqrt(target) * 10)),
            "tier": tier_for_target(target),
        })
    return templates


def tier_for_target(target: int) -> str:
    if target >= 500:
        return "legend"
    if target >= 100:
        return "diamond"
    if target >= 50:
        return "gold"
    if target >= 10:
        return "silver"
    return "bronze"


def metric_value(stats: dict, metric: str):
    if metric in stats:
        return stats[metric]
    if metric.startswith("event:"):
        events = stats.get("events", {})
        return events.get(metric.split(":", 1)[1], 0)
    return 0


def normalize_achievement_definition(raw: dict, source: str) -> dict | None:
    try:
        achievement_id = str(raw.get("id") or "").strip()
        metric = str(raw.get("metric") or "").strip()
        target = int(raw.get("target") or 1)
        if not achievement_id or not metric or target <= 0:
            return None
        return {
            "id": achievement_id,
            "title": str(raw.get("title") or achievement_id),
            "description": str(raw.get("description") or ""),
            "metric": metric,
            "target": target,
            "points": max(0, int(raw.get("points") or 0)),
            "tier": str(raw.get("tier") or tier_for_target(target)),
            "source": source,
        }
    except Exception:
        return None


def load_achievement_plugins() -> list[dict]:
    config = load_config()
    if not plugin_enabled("achievement_core", config):
        return []
    ensure_app_dirs()
    definitions: list[dict] = []
    for entry in sorted(PLUGINS_DIR.iterdir(), key=lambda p: p.name.lower()):
        if not path_is_dir(entry):
            continue
        manifest = entry / "plugin.json"
        if not path_exists(manifest):
            continue
        try:
            payload = json.loads(read_text_file(manifest).lstrip("\ufeff"))
        except Exception:
            log_error(f"成就插件清单读取失败：{manifest}\n" + traceback.format_exc())
            continue
        plugin_id = plugin_slug(payload.get("id") or entry.name)
        if not plugin_enabled(plugin_id, config):
            continue
        for raw in payload.get("achievements", []) or []:
            definition = normalize_achievement_definition(raw, plugin_id)
            if definition:
                definition["id"] = f"plugin:{plugin_id}:{definition['id']}"
                definitions.append(definition)
    return definitions


def achievement_definitions(stats: dict) -> list[dict]:
    config = load_config()
    if not plugin_enabled("achievement_core", config):
        return []
    definitions = []
    for raw in core_achievement_templates() + load_achievement_plugins():
        definition = dict(raw)
        current = int(metric_value(stats, definition["metric"]) or 0)
        target = int(definition.get("target") or 1)
        definition["current"] = current
        definition["target"] = target
        definition["progress"] = min(1.0, current / target) if target else 1.0
        definition["unlocked"] = current >= target
        definitions.append(definition)
    definitions.sort(key=lambda item: (item["unlocked"], item.get("points", 0), item["target"], item["id"]))
    return definitions


def reward_level(points: int) -> dict:
    level = max(1, int(math.sqrt(max(points, 0) / 60)) + 1)
    current_floor = 60 * (level - 1) * (level - 1)
    next_floor = 60 * level * level
    span = max(1, next_floor - current_floor)
    progress = min(1.0, max(0.0, (points - current_floor) / span))
    titles = ["见习整理者", "资料骑手", "记忆工匠", "知识策展人", "长期主义者", "大师档案官"]
    title = titles[min(len(titles) - 1, (level - 1) // 5)]
    return {
        "level": level,
        "title": title,
        "points": points,
        "next_level_points": next_floor,
        "level_progress": progress,
    }


def achievement_summary() -> dict:
    config = load_config()
    if not plugin_enabled("achievement_core", config):
        return {
            "enabled": False,
            "stats": {},
            "total": 0,
            "unlocked": 0,
            "points": 0,
            "reward": reward_level(0),
            "achievements": [],
        }
    today = datetime.now().date()
    with get_conn() as conn:
        history_dates = [
            row["day"]
            for row in conn.execute(
                "SELECT DISTINCT substr(ended_at,1,10) AS day FROM review_history ORDER BY day DESC LIMIT 120"
            ).fetchall()
        ]
        date_set = set(history_dates)
        streak = 0
        cursor = today
        while cursor.isoformat() in date_set:
            streak += 1
            cursor -= timedelta(days=1)
        stats = {
            "items": conn.execute("SELECT COUNT(*) AS c FROM items").fetchone()["c"],
            "single_files": conn.execute("SELECT COUNT(*) AS c FROM items WHERE library_id IS NULL").fetchone()["c"],
            "custom_decks": conn.execute("SELECT COUNT(*) AS c FROM decks WHERE is_default=0").fetchone()["c"],
            "tagged_items": conn.execute("SELECT COUNT(*) AS c FROM items WHERE TRIM(COALESCE(tags,''))<>''").fetchone()["c"],
            "reviews": conn.execute("SELECT COUNT(*) AS c FROM review_history").fetchone()["c"],
            "notes": conn.execute("SELECT COUNT(*) AS c FROM notes").fetchone()["c"],
            "done_items": conn.execute("SELECT COUNT(*) AS c FROM items WHERE status='done'").fetchone()["c"],
            "streak": streak,
        }
        stats["events"] = {
            row["event_type"]: int(row["total"] or 0)
            for row in conn.execute(
                "SELECT event_type, SUM(amount) AS total FROM activity_events GROUP BY event_type"
            ).fetchall()
        }
        definitions = achievement_definitions(stats)
        for achievement in definitions:
            if achievement["unlocked"]:
                conn.execute(
                    "INSERT OR IGNORE INTO achievements(id, unlocked_at) VALUES(?, ?)",
                    (achievement["id"], iso_now()),
                )
        unlocked_rows = {
            row["id"]: row["unlocked_at"]
            for row in conn.execute("SELECT * FROM achievements").fetchall()
        }
        conn.commit()
    achievements = []
    for item in definitions:
        unlocked_at = unlocked_rows.get(item["id"])
        achievements.append({**item, "unlocked_at": unlocked_at, "unlocked": bool(unlocked_at or item["unlocked"])})
    achievements.sort(key=lambda item: (not item["unlocked"], item.get("source", ""), item.get("target", 0), item["id"]))
    points = sum(int(item.get("points") or 0) for item in achievements if item["unlocked"])
    return {
        "enabled": True,
        "stats": stats,
        "total": len(achievements),
        "unlocked": sum(1 for item in achievements if item["unlocked"]),
        "points": points,
        "reward": reward_level(points),
        "achievements": achievements,
    }


def rows_for_share_payload(conn: sqlite3.Connection, payload: dict) -> list[sqlite3.Row]:
    ids = [int(i) for i in payload.get("ids", [])]
    deck_id = payload.get("deck_id")
    if ids:
        placeholders = ",".join(["?"] * len(ids))
        return conn.execute(f"SELECT * FROM items WHERE id IN ({placeholders}) ORDER BY file_name ASC", ids).fetchall()
    if deck_id:
        return conn.execute("SELECT * FROM items WHERE deck_id=? ORDER BY file_name ASC", (int(deck_id),)).fetchall()
    return conn.execute("SELECT * FROM items ORDER BY file_name ASC").fetchall()


def export_share_package(payload: dict) -> dict:
    include_files = bool(payload.get("include_files", False))
    target = resolve_output_file(
        payload.get("target_path") or None,
        payload.get("target_dir") or None,
        timestamped_name("LiFileReviewer_share", ".zip"),
    )
    with get_conn() as conn:
        item_rows = rows_for_share_payload(conn, payload)
        item_ids = [row["id"] for row in item_rows]
        deck_rows = conn.execute("SELECT * FROM decks ORDER BY id").fetchall()
        note_rows: list[sqlite3.Row] = []
        if item_ids:
            placeholders = ",".join(["?"] * len(item_ids))
            note_rows = conn.execute(f"SELECT * FROM notes WHERE item_id IN ({placeholders}) ORDER BY id", item_ids).fetchall()
    manifest = {
        "format": "LiFileReviewerShare",
        "format_version": 1,
        "exported_at": iso_now(),
        "app_version": APP_VERSION,
        "include_files": include_files,
        "item_count": len(item_rows),
        "note_count": len(note_rows),
    }
    with zipfile.ZipFile(fs_path(target), "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("share_manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        archive.writestr("decks.json", json.dumps([dict(row) for row in deck_rows], ensure_ascii=False, indent=2))
        archive.writestr("items.json", json.dumps([dict(row) for row in item_rows], ensure_ascii=False, indent=2))
        archive.writestr("notes.json", json.dumps([dict(row) for row in note_rows], ensure_ascii=False, indent=2))
        if item_ids:
            placeholders = ",".join(["?"] * len(item_ids))
            with get_conn() as conn:
                link_rows = conn.execute(
                    f"""
                    SELECT * FROM content_links
                     WHERE (source_type='item' AND source_id IN ({placeholders}))
                        OR (target_type='item' AND target_id IN ({placeholders}))
                    ORDER BY id
                    """,
                    item_ids + item_ids,
                ).fetchall()
            archive.writestr("content_links.json", json.dumps([dict(row) for row in link_rows], ensure_ascii=False, indent=2))
        for note in note_rows:
            path = Path(note["file_path"])
            if path_exists(path) and path_is_file(path):
                archive.write(fs_path(path), str(Path("notes") / path.name))
        if include_files:
            used_names = set()
            for row in item_rows:
                source = Path(row["file_path"])
                if not path_exists(source) or not path_is_file(source):
                    continue
                safe_name = safe_filename(row["file_name"], f"item_{row['id']}") or f"item_{row['id']}"
                arcname = Path("files") / safe_name
                counter = 2
                while str(arcname) in used_names:
                    arcname = Path("files") / f"{Path(safe_name).stem}_{counter}{Path(safe_name).suffix}"
                    counter += 1
                used_names.add(str(arcname))
                archive.write(fs_path(source), str(arcname))
    record_activity("export_share", 1, {"item_count": len(item_rows), "include_files": include_files})
    return {"export_path": str(target), "item_count": len(item_rows), "include_files": include_files}


def repair_imported_note_paths() -> None:
    ensure_notes_dir()
    with get_conn() as conn:
        rows = conn.execute("SELECT id, file_path FROM notes").fetchall()
        for row in rows:
            original = Path(row["file_path"])
            candidate = DEFAULT_NOTES_DIR / original.name
            if path_exists(candidate):
                conn.execute("UPDATE notes SET file_path=? WHERE id=?", (str(candidate), row["id"]))
        conn.commit()


def tree_for_library(library_id: int, rel: str = "") -> dict:
    with get_conn() as conn:
        library = conn.execute("SELECT * FROM libraries WHERE id=?", (library_id,)).fetchone()
        if not library:
            raise ValueError("文件库不存在")
        root = Path(library["root_path"]).resolve()
        target = (root / rel).resolve()
        if not str(target).lower().startswith(str(root).lower()):
            raise ValueError("路径越界")
        indexed = {
            row["file_path"]: row["id"]
            for row in conn.execute("SELECT id, file_path FROM items WHERE library_id=?", (library_id,)).fetchall()
        }
    children = []
    if path_exists(target) and path_is_dir(target):
        for child in target.iterdir():
            try:
                stat = path_stat(child)
            except OSError:
                continue
            children.append(
                {
                    "name": child.name,
                    "path": str(child),
                    "rel": str(child.relative_to(root)),
                    "is_dir": path_is_dir(child),
                    "size": human_size(stat.st_size if path_is_file(child) else 0),
                    "ext": child.suffix.lower(),
                    "indexed_id": indexed.get(str(child)),
                }
            )
    children.sort(key=lambda node: (not node["is_dir"], node["name"].lower()))
    return {"library": dict(library), "rel": rel, "children": children}


def backup_database(target_dir: str | Path | None = None, target_path: str | Path | None = None) -> dict:
    if target_path:
        target = Path(target_path).expanduser().resolve()
        snapshot_sqlite_database(DB_PATH, target)
    else:
        target = backup_sqlite_database_to(DB_PATH, ensure_export_dir(target_dir=target_dir), "manual") if target_dir else backup_sqlite_database(DB_PATH, "manual")
    record_activity("backup_database")
    return {"backup_path": str(target)}


def export_csv(target_dir: str | Path | None = None, target_path: str | Path | None = None) -> Path:
    target = resolve_output_file(target_path, target_dir, timestamped_name("review_items", ".csv"))
    with get_conn() as conn, open(fs_path(target), "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "file_name", "file_path", "deck", "tags", "status", "due_at",
            "review_count", "lapse_count", "total_read_seconds", "last_review_at",
        ])
        for row in conn.execute(
            """
            SELECT i.*, d.name AS deck_name
              FROM items i
              LEFT JOIN decks d ON d.id=i.deck_id
             ORDER BY i.file_name ASC
            """
        ):
            writer.writerow([
                row["file_name"], row["file_path"], row["deck_name"] or "", row["tags"], row["status"], row["due_at"],
                row["review_count"], row["lapse_count"], row["total_read_seconds"], row["last_review_at"],
            ])
    record_activity("export_csv")
    return target


def export_portable_json(target_dir: str | Path | None = None, target_path: str | Path | None = None) -> Path:
    target = resolve_output_file(target_path, target_dir, timestamped_name("review_portable", ".json"))
    with get_conn() as conn:
        payload = {
            "format": "LiFileReviewerPortable",
            "format_version": 1,
            "exported_at": iso_now(),
            "app_version": APP_VERSION,
            "schema_version": db_user_version(conn),
            "config": load_config(),
            "libraries": [dict(row) for row in conn.execute("SELECT * FROM libraries ORDER BY id")],
            "decks": [dict(row) for row in conn.execute("SELECT * FROM decks ORDER BY id")],
            "items": [dict(row) for row in conn.execute("SELECT * FROM items ORDER BY id")],
            "review_history": [
                dict(row) for row in conn.execute("SELECT * FROM review_history ORDER BY id")
            ],
            "notes": [dict(row) for row in conn.execute("SELECT * FROM notes ORDER BY id")],
            "content_links": [dict(row) for row in conn.execute("SELECT * FROM content_links ORDER BY id")],
            "achievements": [dict(row) for row in conn.execute("SELECT * FROM achievements ORDER BY id")],
            "social_profile": [dict(row) for row in conn.execute("SELECT * FROM social_profile ORDER BY id")],
            "activity_events": [
                dict(row) for row in conn.execute("SELECT * FROM activity_events ORDER BY id")
            ],
            "schema_migrations": [
                dict(row) for row in conn.execute("SELECT * FROM schema_migrations ORDER BY id")
            ],
        }
    write_text_file(target, json.dumps(payload, ensure_ascii=False, indent=2))
    record_activity("export_json")
    return target


def export_profile_package(target_dir: str | Path | None = None, target_path: str | Path | None = None) -> Path:
    ensure_app_dirs()
    target = resolve_output_file(target_path, target_dir, timestamped_name("LiFileReviewer2_profile", ".zip"))
    included: list[tuple[Path, str]] = []
    temp_snapshot_dir = None
    for path in [CONFIG_PATH, LOG_PATH]:
        if path_exists(path):
            included.append((path, path.name))
    if path_exists(DB_PATH):
        temp_snapshot_dir = tempfile.TemporaryDirectory(prefix="lfr_profile_")
        backup_path = snapshot_sqlite_database(DB_PATH, Path(temp_snapshot_dir.name) / DB_PATH.name)
        included.append((backup_path, DB_PATH.name))
    try:
        for folder, arc_prefix in [(BACKUP_DIR, "backups"), (PLUGINS_DIR, "plugins"), (ensure_notes_dir(), "notes")]:
            if path_exists(folder):
                for file_path in folder.rglob("*"):
                    if path_is_file(file_path):
                        included.append((file_path, str(Path(arc_prefix) / file_path.relative_to(folder))))
        with zipfile.ZipFile(fs_path(target), "w", compression=zipfile.ZIP_DEFLATED) as archive:
            manifest = {
                "format": "LiFileReviewerProfile",
                "format_version": 1,
                "exported_at": iso_now(),
                "app_version": APP_VERSION,
                "source_app_dir": str(APP_DIR),
            }
            archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
            seen = set()
            for src, arcname in included:
                if arcname in seen or src.resolve() == target.resolve() or src.suffix.lower() == ".zip":
                    continue
                seen.add(arcname)
                archive.write(fs_path(src), arcname)
    finally:
        if temp_snapshot_dir is not None:
            temp_snapshot_dir.cleanup()
    record_activity("export_profile")
    return target


def import_profile_package(
    package_path: str,
    backup_target_dir: str | Path | None = None,
    backup_target_path: str | Path | None = None,
) -> dict:
    package = Path(package_path).expanduser().resolve()
    if not path_exists(package) or not path_is_file(package):
        raise ValueError(f"迁移包不存在：{package}")
    ensure_app_dirs()
    backup = export_profile_package(target_dir=backup_target_dir, target_path=backup_target_path)
    with tempfile.TemporaryDirectory() as tmp_name:
        tmp_dir = Path(tmp_name)
        with zipfile.ZipFile(fs_path(package), "r") as archive:
            names = archive.namelist()
            if "manifest.json" not in names:
                raise ValueError("这不是有效的 LiFileReviewer 迁移包")
            for name in names:
                normalized = Path(name)
                if normalized.is_absolute() or ".." in normalized.parts:
                    raise ValueError(f"迁移包包含不安全路径：{name}")
            archive.extractall(tmp_dir)
        for name in ["config.json", "review_data.sqlite", "app.log"]:
            src = tmp_dir / name
            if path_exists(src):
                copy_file(src, APP_DIR / name)
        for folder_name in ["backups", "plugins", "notes"]:
            src_dir = tmp_dir / folder_name
            dst_dir = APP_DIR / folder_name
            if path_exists(src_dir):
                ensure_dir(dst_dir)
                for src in src_dir.rglob("*"):
                    if path_is_file(src):
                        dst = dst_dir / src.relative_to(src_dir)
                        copy_file(src, dst)
    config = load_config()
    config.setdefault("notes", {})["storage_dir"] = ""
    config.setdefault("exports", {})["default_dir"] = ""
    save_config(config)
    init_db()
    repair_imported_note_paths()
    return {"imported_from": str(package), "backup_before_import": str(backup), "app": profile_paths()}


def move_profile_dir(target_dir: str) -> dict:
    global APP_DIR
    requested_dir = Path(target_dir).expanduser().resolve()
    new_dir = requested_dir
    if not str(new_dir):
        raise ValueError("缺少新的配置目录")
    old_dir = APP_DIR.resolve()
    if new_dir == old_dir:
        return {"moved": False, "app": profile_paths()}
    if old_dir in new_dir.parents:
        raise ValueError("新的配置目录不能放在当前配置目录内部")
    ensure_app_dirs()
    ensure_dir(new_dir)
    allowed = {
        "backups", "plugins", "notes", "exports", "README.md", "profile_location.json",
        "config.json", "review_data.sqlite", "app.log", "last_health_check.json", "runtime.json",
    }
    if any(new_dir.iterdir()):
        if path_exists(new_dir / "config.json") or path_exists(new_dir / "review_data.sqlite"):
            unexpected = [path.name for path in new_dir.iterdir() if path.name not in allowed]
            if unexpected:
                raise ValueError("目标目录已有其它文件，请选择空文件夹、已有软件数据目录，或它下面的专用文件夹")
        else:
            new_dir = new_dir / "LiFileReviewer2"
            if new_dir == old_dir or old_dir in new_dir.parents:
                raise ValueError("新的配置目录不能放在当前配置目录内部")
            ensure_dir(new_dir)
            if any(new_dir.iterdir()):
                unexpected = [path.name for path in new_dir.iterdir() if path.name not in allowed]
                if unexpected:
                    raise ValueError("目标目录下的 LiFileReviewer2 子目录已有其它文件，请选择空文件夹或专用配置文件夹")
    for item in old_dir.iterdir():
        if item.resolve() == PROFILE_POINTER_PATH.resolve():
            continue
        destination = new_dir / item.name
        if path_exists(destination):
            continue
        shutil.move(fs_path(item), fs_path(destination))
    set_app_dir(new_dir)
    ensure_app_dirs()
    write_profile_pointer()
    pointer_inside_profile = APP_DIR / "profile_location.json"
    write_text_file(
        pointer_inside_profile,
        json.dumps({"app_dir": str(APP_DIR), "updated_at": iso_now(), "app_version": APP_VERSION}, ensure_ascii=False, indent=2),
    )
    init_db()
    return {"moved": True, "requested_dir": str(requested_dir), "app": profile_paths()}


def core_plugin_rows(config: dict | None = None) -> list[dict]:
    config = config or load_config()
    rows = []
    for plugin_id, plugin in CORE_PLUGINS.items():
        rows.append({
            **plugin,
            "enabled": plugin_enabled(plugin_id, config),
            "path": "",
            "has_manifest": False,
            "source": "builtin",
            "configurable": True,
        })
    return rows


def set_plugin_enabled(plugin_id: str, enabled: bool) -> dict:
    config = load_config()
    plugins = config.setdefault("plugins", {})
    if plugin_id in CORE_PLUGINS:
        plugins.setdefault("core", {})[plugin_id] = bool(enabled)
    else:
        installed = plugins.setdefault("installed", {})
        if isinstance(installed, list):
            installed = {name: True for name in installed}
            plugins["installed"] = installed
        installed[plugin_id] = bool(enabled)
    save_config(config)
    return {"plugin": plugin_id, "enabled": bool(enabled), "plugins": list_plugins()["plugins"]}


def read_plugin_manifest(plugin_dir: Path) -> dict:
    manifest = plugin_dir / "plugin.json"
    if not path_exists(manifest):
        raise ValueError("插件缺少 plugin.json 清单文件")
    try:
        payload = json.loads(read_text_file(manifest).lstrip("\ufeff"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"plugin.json 格式错误：{exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError("plugin.json 必须是 JSON 对象")
    plugin_id = plugin_slug(payload.get("id") or plugin_dir.name)
    payload["id"] = plugin_id
    payload.setdefault("name", plugin_id)
    return payload


def unique_plugin_destination(plugin_id: str) -> Path:
    base = PLUGINS_DIR / plugin_slug(plugin_id)
    if not path_exists(base):
        return base
    for index in range(2, 1000):
        candidate = PLUGINS_DIR / f"{base.name}_{index}"
        if not path_exists(candidate):
            return candidate
    raise ValueError("无法创建唯一插件目录，请清理 plugins 目录后重试")


def copy_plugin_folder(source_dir: Path, destination: Path) -> None:
    if path_exists(destination):
        shutil.rmtree(fs_path(destination))
    shutil.copytree(fs_path(source_dir), fs_path(destination), ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))


def safe_extract_zip(archive: zipfile.ZipFile, destination: Path) -> None:
    root = destination.resolve()
    for member in archive.infolist():
        member_path = (root / member.filename).resolve()
        if os.path.commonpath([str(root), str(member_path)]) != str(root):
            raise ValueError(f"插件 zip 包含不安全路径：{member.filename}")
    archive.extractall(fs_path(root))


def import_plugin(source_path: str | Path, enable: bool = True) -> dict:
    ensure_app_dirs()
    source = Path(source_path).expanduser().resolve()
    if not path_exists(source):
        raise ValueError(f"插件来源不存在：{source}")

    temp_dir: tempfile.TemporaryDirectory | None = None
    try:
        if path_is_file(source):
            if source.suffix.lower() != ".zip":
                raise ValueError("插件文件目前支持 .zip 包；也可以选择插件文件夹导入")
            temp_dir = tempfile.TemporaryDirectory()
            extracted = Path(temp_dir.name)
            with zipfile.ZipFile(fs_path(source), "r") as archive:
                safe_extract_zip(archive, extracted)
            candidates = [entry for entry in extracted.iterdir() if entry.is_dir()]
            if path_exists(extracted / "plugin.json"):
                plugin_source = extracted
            elif len(candidates) == 1 and path_exists(candidates[0] / "plugin.json"):
                plugin_source = candidates[0]
            else:
                raise ValueError("zip 插件包根目录或唯一子目录中必须包含 plugin.json")
        elif path_is_dir(source):
            plugin_source = source
        else:
            raise ValueError("插件来源必须是文件夹或 .zip 文件")

        manifest = read_plugin_manifest(plugin_source)
        if manifest["id"] in CORE_PLUGINS:
            raise ValueError("不能覆盖内置插件 ID")
        destination = unique_plugin_destination(manifest["id"])
        copy_plugin_folder(plugin_source, destination)
        copied_manifest = destination / "plugin.json"
        write_text_file(copied_manifest, json.dumps(manifest, ensure_ascii=False, indent=2))

        config = load_config()
        installed = config.setdefault("plugins", {}).setdefault("installed", {})
        if isinstance(installed, list):
            installed = {name: True for name in installed}
            config["plugins"]["installed"] = installed
        installed[manifest["id"]] = bool(enable)
        save_config(config)

        return {
            "plugin": {
                "id": manifest["id"],
                "name": manifest.get("name") or manifest["id"],
                "version": manifest.get("version", ""),
                "path": str(destination),
                "enabled": bool(enable),
            },
            "plugins": list_plugins()["plugins"],
            "plugins_dir": str(PLUGINS_DIR),
        }
    finally:
        if temp_dir is not None:
            temp_dir.cleanup()


def list_plugins() -> dict:
    ensure_app_dirs()
    config = load_config()
    plugins = core_plugin_rows(config)
    for entry in sorted(PLUGINS_DIR.iterdir(), key=lambda p: p.name.lower()):
        if not path_is_dir(entry):
            continue
        manifest = entry / "plugin.json"
        data = {
            "id": entry.name,
            "name": entry.name,
            "version": "",
            "enabled": False,
            "path": str(entry),
            "has_manifest": path_exists(manifest),
            "source": "external",
            "builtin": False,
            "configurable": True,
        }
        if path_exists(manifest):
            try:
                payload = json.loads(read_text_file(manifest).lstrip("\ufeff"))
                data.update({key: payload.get(key, data.get(key)) for key in ["id", "name", "version", "description", "category"]})
                data["id"] = plugin_slug(data["id"])
                data["enabled"] = plugin_enabled(data["id"], config)
            except Exception:
                data["error"] = "plugin.json 读取失败"
        plugins.append(data)
    return {"plugins": plugins, "plugins_dir": str(PLUGINS_DIR)}


def social_profile_from_config(config: dict | None = None) -> dict:
    config = config or load_config()
    social = dict(DEFAULT_CONFIG["social"])
    social.update(config.get("social", {}))
    return social


def get_social_profile() -> dict:
    config = load_config()
    if not plugin_enabled("social_profile", config):
        return {"enabled": False, "profile": social_profile_from_config(config)}
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM social_profile WHERE id=1").fetchone()
    profile = social_profile_from_config(config)
    if row:
        profile.update({
            "display_name": row["display_name"] or profile["display_name"],
            "handle": row["handle"] or profile["handle"],
            "bio": row["bio"] or profile["bio"],
            "location": row["location"] or profile["location"],
            "website": row["website"] or profile["website"],
            "contact": row["contact"] or profile["contact"],
            "share_stats": bool(row["share_stats"]),
            "share_achievements": bool(row["share_achievements"]),
            "allow_friend_discovery": bool(row["allow_friend_discovery"]),
            "updated_at": row["updated_at"],
        })
    return {"enabled": True, "profile": profile}


def save_social_profile(payload: dict) -> dict:
    config = load_config()
    if not plugin_enabled("social_profile", config):
        raise ValueError("社交资料插件已关闭")
    allowed_text = ["display_name", "handle", "bio", "location", "website", "contact"]
    allowed_bool = ["share_stats", "share_achievements", "allow_friend_discovery"]
    current = social_profile_from_config(config)
    incoming = payload.get("profile", payload)
    for key in allowed_text:
        if key in incoming:
            current[key] = str(incoming.get(key) or "").strip()[:500]
    for key in allowed_bool:
        if key in incoming:
            current[key] = bool(incoming.get(key))
    config["social"] = current
    save_config(config)
    now = iso_now()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO social_profile(
                id, display_name, handle, bio, location, website, contact,
                share_stats, share_achievements, allow_friend_discovery, updated_at
            ) VALUES(1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                display_name=excluded.display_name,
                handle=excluded.handle,
                bio=excluded.bio,
                location=excluded.location,
                website=excluded.website,
                contact=excluded.contact,
                share_stats=excluded.share_stats,
                share_achievements=excluded.share_achievements,
                allow_friend_discovery=excluded.allow_friend_discovery,
                updated_at=excluded.updated_at
            """,
            (
                current["display_name"],
                current["handle"],
                current["bio"],
                current["location"],
                current["website"],
                current["contact"],
                int(bool(current["share_stats"])),
                int(bool(current["share_achievements"])),
                int(bool(current["allow_friend_discovery"])),
                now,
            ),
        )
        record_activity("update_social_profile", conn=conn)
        conn.commit()
    return get_social_profile()


def social_card() -> dict:
    config = load_config()
    enabled = plugin_enabled("social_profile", config)
    profile = get_social_profile()["profile"]
    card = {
        "format": "LiFileReviewerSocialCard",
        "format_version": 1,
        "app_version": APP_VERSION,
        "exported_at": iso_now(),
        "enabled": enabled,
        "profile": {
            "display_name": profile.get("display_name", ""),
            "handle": profile.get("handle", ""),
            "bio": profile.get("bio", ""),
            "location": profile.get("location", ""),
            "website": profile.get("website", ""),
            "contact": profile.get("contact", ""),
            "allow_friend_discovery": bool(profile.get("allow_friend_discovery")),
        },
    }
    if enabled and profile.get("share_stats"):
        overview = get_overview()
        card["stats"] = {
            "total": overview["stats"]["total"],
            "reviewed_today": overview["stats"]["reviewed_today"],
            "streak": overview["stats"]["streak"],
        }
    if enabled and profile.get("share_achievements") and plugin_enabled("achievement_core", config):
        achievements = achievement_summary()
        card["achievements"] = {
            "unlocked": achievements["unlocked"],
            "total": achievements["total"],
            "points": achievements["points"],
            "reward": achievements["reward"],
        }
    return card


def health_check() -> dict:
    ensure_app_dirs()
    load_config()
    checks = []

    def add(name: str, ok: bool, detail: str = "") -> None:
        checks.append({"name": name, "ok": bool(ok), "detail": detail})

    add("数据目录", path_exists(APP_DIR) and os.access(fs_path(APP_DIR), os.W_OK), str(APP_DIR))
    add("配置文件", path_exists(CONFIG_PATH), str(CONFIG_PATH))
    add("数据库文件", path_exists(DB_PATH), str(DB_PATH))
    add("插件目录", path_exists(PLUGINS_DIR) and os.access(fs_path(PLUGINS_DIR), os.W_OK), str(PLUGINS_DIR))
    add("笔记目录", path_exists(ensure_notes_dir()) and os.access(fs_path(ensure_notes_dir()), os.W_OK), str(ensure_notes_dir()))
    add("WebUI 资源", path_exists(resource_path("web/index.html")), str(resource_path("web/index.html")))

    try:
        with get_conn() as conn:
            integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
            foreign_keys = conn.execute("PRAGMA foreign_key_check").fetchall()
            version = db_user_version(conn)
            item_count = conn.execute("SELECT COUNT(*) AS c FROM items").fetchone()["c"]
            missing_count = 0
            for row in conn.execute("SELECT file_path FROM items WHERE status!='done'").fetchall():
                if not path_exists(row["file_path"]):
                    missing_count += 1
        add("SQLite 完整性", integrity == "ok", integrity)
        add("外键一致性", len(foreign_keys) == 0, f"{len(foreign_keys)} 个外键问题")
        add("Schema 版本", version == SCHEMA_VERSION, f"当前 {version}，程序需要 {SCHEMA_VERSION}")
        add("索引记录", True, f"{item_count} 条资料记录")
        add("原始文件可见性", missing_count == 0, f"{missing_count} 个索引文件当前不可访问")
    except Exception as exc:
        add("数据库读取", False, str(exc))

    ok = all(check["ok"] for check in checks)
    report = {
        "ok": ok,
        "checked_at": iso_now(),
        "app_version": APP_VERSION,
        "schema_version": SCHEMA_VERSION,
        "checks": checks,
    }
    report_path = APP_DIR / "last_health_check.json"
    write_text_file(report_path, json.dumps(report, ensure_ascii=False, indent=2))
    report["report_path"] = str(report_path)
    return report


class AppHandler(BaseHTTPRequestHandler):
    server_version = "LiFileReviewer/2.0"

    def log_message(self, fmt: str, *args) -> None:
        log_error(fmt % args)

    def send_json(self, payload, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw) if raw else {}

    def serve_static(self, request_path: str) -> None:
        web_dir = resource_path("web")
        if request_path == "/":
            target = web_dir / "index.html"
        else:
            safe = request_path.lstrip("/")
            if safe.startswith("web/"):
                safe = safe[4:]
            target = (web_dir / safe).resolve()
            if os.path.commonpath([str(web_dir.resolve()), str(target)]) != str(web_dir.resolve()):
                self.send_error(403)
                return
        if not path_exists(target) or not path_is_file(target):
            self.send_error(404)
            return
        mime = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        with open(fs_path(target), "rb") as handle:
            data = handle.read()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)
        try:
            if path == "/api/health":
                self.send_json(health_check())
            elif path == "/api/overview":
                self.send_json(get_overview())
            elif path == "/api/items":
                self.send_json(query_items(params))
            elif path == "/api/libraries":
                self.send_json({"libraries": list_libraries()})
            elif path == "/api/decks":
                self.send_json(list_decks())
            elif path == "/api/learning-stats":
                self.send_json(learning_stats_summary())
            elif path == "/api/achievements":
                self.send_json(achievement_summary())
            elif path == "/api/link-targets":
                self.send_json(search_link_targets(params))
            elif path == "/api/links":
                self.send_json(list_content_links(params))
            elif path == "/api/tree":
                library_id = int((params.get("library_id") or ["0"])[0])
                rel = (params.get("rel") or [""])[0]
                self.send_json(tree_for_library(library_id, rel))
            elif path == "/api/settings":
                self.send_json({"config": load_config(), "paths": get_overview()["app"]})
            elif path == "/api/common-paths":
                self.send_json({
                    "paths": [
                        {"label": "Documents", "path": str(user_documents_dir())},
                        {"label": "Desktop", "path": str(Path.home() / "Desktop")},
                        {"label": "Downloads", "path": str(Path.home() / "Downloads")},
                        {"label": "Home", "path": str(Path.home())},
                        {"label": "Current data folder", "path": str(APP_DIR)},
                    ]
                })
            elif path == "/api/plugins":
                self.send_json(list_plugins())
            elif path == "/api/social/profile":
                self.send_json(get_social_profile())
            elif path == "/api/social/card":
                self.send_json(social_card())
            elif path == "/api/notes":
                item_id = (params.get("item_id") or [""])[0]
                self.send_json(list_notes(int(item_id) if item_id else None))
            elif path.startswith("/api/notes/"):
                note_id = int(path.rsplit("/", 1)[1])
                self.send_json(read_note(note_id))
            elif path.startswith("/api/note-file/"):
                note_id = int(path.rsplit("/", 1)[1])
                self.serve_note_file(note_id)
            elif path.startswith("/api/history/"):
                item_id = int(path.rsplit("/", 1)[1])
                with get_conn() as conn:
                    rows = conn.execute(
                        "SELECT * FROM review_history WHERE item_id=? ORDER BY ended_at DESC LIMIT 120",
                        (item_id,),
                    ).fetchall()
                self.send_json({"history": [dict(row) for row in rows]})
            elif path.startswith("/api/file/"):
                item_id = int(path.rsplit("/", 1)[1])
                self.serve_file(item_id)
            elif path == "/api/export":
                target = export_csv(params.get("target_dir", [None])[0], params.get("target_path", [None])[0])
                self.send_json({"export_path": str(target)})
            elif path == "/api/export-portable":
                target = export_portable_json(params.get("target_dir", [None])[0], params.get("target_path", [None])[0])
                self.send_json({"export_path": str(target)})
            elif path == "/api/export-profile":
                target = export_profile_package(params.get("target_dir", [None])[0], params.get("target_path", [None])[0])
                self.send_json({"export_path": str(target)})
            elif path == "/" or path.startswith("/web/") or path in ["/style.css", "/app.js"]:
                self.serve_static(path)
            else:
                self.send_error(404)
        except Exception as exc:
            log_error("GET 处理失败：\n" + traceback.format_exc())
            self.send_json({"error": str(exc)}, 500)

    def serve_file(self, item_id: int) -> None:
        with get_conn() as conn:
            row = conn.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
        if not row:
            self.send_error(404)
            return
        file_path = Path(row["file_path"])
        if not path_exists(file_path) or not path_is_file(file_path):
            self.send_error(404)
            return
        mime = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Disposition", f"inline; filename*=UTF-8''{urllib.parse.quote(file_path.name)}")
        self.send_header("Content-Length", str(path_stat(file_path).st_size))
        self.end_headers()
        with open(fs_path(file_path), "rb") as handle:
            shutil.copyfileobj(handle, self.wfile)

    def serve_note_file(self, note_id: int) -> None:
        with get_conn() as conn:
            row = conn.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
        if not row:
            self.send_error(404)
            return
        file_path = Path(row["file_path"])
        if not path_exists(file_path) or not path_is_file(file_path):
            self.send_error(404)
            return
        mime = mimetypes.guess_type(str(file_path))[0] or "text/plain"
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Disposition", f"inline; filename*=UTF-8''{urllib.parse.quote(file_path.name)}")
        self.send_header("Content-Length", str(path_stat(file_path).st_size))
        self.end_headers()
        with open(fs_path(file_path), "rb") as handle:
            shutil.copyfileobj(handle, self.wfile)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        try:
            payload = self.read_json()
            if path == "/api/libraries/select":
                selected = choose_folder_dialog()
                if not selected:
                    self.send_json({"cancelled": True})
                    return
                result = scan_library(selected, deck_id=payload.get("deck_id") or None, tags=payload.get("tags") or None)
                self.send_json({"cancelled": False, "scan": result})
            elif path == "/api/libraries/add":
                root_path = payload.get("path")
                if not root_path:
                    raise ValueError("缺少文件库路径")
                result = scan_library(root_path, deck_id=payload.get("deck_id") or None, tags=payload.get("tags") or None)
                self.send_json({"scan": result})
            elif path == "/api/libraries/delete":
                self.send_json(delete_library(payload))
            elif path == "/api/files/select":
                selected = choose_file_dialog(("All files (*.*)",), "选择要加入复习的文件")
                if not selected:
                    self.send_json({"cancelled": True})
                    return
                result = add_single_file(selected, deck_id=payload.get("deck_id") or None, tags=payload.get("tags") or None)
                self.send_json({"cancelled": False, "file": result})
            elif path == "/api/files/add":
                selected = payload.get("path")
                if not selected:
                    raise ValueError("File path is required")
                result = add_single_file(selected, deck_id=payload.get("deck_id") or None, tags=payload.get("tags") or None)
                self.send_json({"file": result})
            elif path == "/api/decks/create":
                self.send_json(create_deck(payload))
            elif path == "/api/decks/update":
                self.send_json(update_deck(payload))
            elif path == "/api/decks/reorder":
                self.send_json(reorder_decks(payload))
            elif path == "/api/decks/delete":
                self.send_json(delete_deck(payload))
            elif path == "/api/plugins/toggle":
                plugin_id = str(payload.get("id") or "").strip()
                if not plugin_id:
                    raise ValueError("缺少插件 ID")
                self.send_json(set_plugin_enabled(plugin_id, bool(payload.get("enabled"))))
            elif path == "/api/plugins/import/select-file":
                selected = choose_file_dialog(("Zip files (*.zip)", "All files (*.*)"), "选择插件 zip 包")
                if not selected:
                    self.send_json({"cancelled": True})
                    return
                result = import_plugin(selected, bool(payload.get("enable", True)))
                result["cancelled"] = False
                self.send_json(result)
            elif path == "/api/plugins/import/select-folder":
                selected = choose_folder_dialog()
                if not selected:
                    self.send_json({"cancelled": True})
                    return
                result = import_plugin(selected, bool(payload.get("enable", True)))
                result["cancelled"] = False
                self.send_json(result)
            elif path == "/api/plugins/import":
                source_path = payload.get("path")
                if not source_path:
                    raise ValueError("缺少插件路径")
                self.send_json(import_plugin(source_path, bool(payload.get("enable", True))))
            elif path == "/api/social/profile":
                self.send_json(save_social_profile(payload))
            elif path == "/api/profile/select":
                selected = choose_folder_dialog()
                if not selected:
                    self.send_json({"cancelled": True})
                    return
                self.send_json({"cancelled": False, "path": selected})
            elif path == "/api/export/select-dir":
                selected = choose_folder_dialog()
                if not selected:
                    self.send_json({"cancelled": True})
                    return
                self.send_json({"cancelled": False, "path": selected})
            elif path == "/api/export/save-as":
                default_name = safe_filename(payload.get("default_name") or "export", "export")
                extension = str(payload.get("extension") or Path(default_name).suffix or "").strip()
                if extension and not default_name.lower().endswith(extension.lower()):
                    default_name += extension if extension.startswith(".") else f".{extension}"
                file_types = tuple(payload.get("file_types") or ("All files (*.*)",))
                selected = choose_save_file_dialog(
                    default_name,
                    file_types=file_types,
                    title=payload.get("title") or "保存导出文件",
                    initial_dir=payload.get("initial_dir") or None,
                )
                if not selected:
                    self.send_json({"cancelled": True})
                    return
                self.send_json({"cancelled": False, "path": selected})
            elif path == "/api/profile/select-package":
                selected = choose_file_dialog(("Zip files (*.zip)", "All files (*.*)"), "选择迁移包")
                if not selected:
                    self.send_json({"cancelled": True})
                    return
                self.send_json({"cancelled": False, "path": selected})
            elif path == "/api/libraries/scan":
                root_path = payload.get("path")
                if root_path:
                    self.send_json({"scan": scan_library(root_path, deck_id=payload.get("deck_id") or None, tags=payload.get("tags") or None)})
                else:
                    self.send_json(scan_all_libraries())
            elif path == "/api/items/open":
                with get_conn() as conn:
                    row = conn.execute("SELECT file_path FROM items WHERE id=?", (int(payload["id"]),)).fetchone()
                if not row:
                    raise ValueError("文件不存在")
                open_path(row["file_path"])
                self.send_json({"ok": True})
            elif path == "/api/items/open-with":
                with get_conn() as conn:
                    row = conn.execute("SELECT file_path FROM items WHERE id=?", (int(payload["id"]),)).fetchone()
                if not row:
                    raise ValueError("文件不存在")
                open_with_dialog(row["file_path"])
                self.send_json({"ok": True})
            elif path == "/api/items/open-folder":
                with get_conn() as conn:
                    row = conn.execute("SELECT file_path FROM items WHERE id=?", (int(payload["id"]),)).fetchone()
                if not row:
                    raise ValueError("文件不存在")
                open_parent(row["file_path"])
                self.send_json({"ok": True})
            elif path == "/api/path/open":
                target = payload.get("path")
                if not target:
                    raise ValueError("缺少路径")
                resolved = Path(target).expanduser().resolve()
                if not path_exists(resolved):
                    raise ValueError(f"路径不存在：{resolved}")
                if resolved == PROFILE_POINTER_PATH.resolve():
                    raise ValueError("位置指针是内部启动定位文件，不能直接打开")
                open_path(str(resolved))
                self.send_json({"ok": True})
            elif path == "/api/items/update":
                self.send_json(update_items(payload))
            elif path == "/api/items/delete":
                self.send_json(delete_items(payload))
            elif path == "/api/links/create":
                self.send_json(create_content_link(payload))
            elif path == "/api/links/delete":
                self.send_json(delete_content_link(payload))
            elif path == "/api/share/export":
                self.send_json(export_share_package(payload))
            elif path == "/api/notes/create":
                self.send_json(create_note(payload))
            elif path == "/api/notes/save":
                self.send_json(save_note(payload))
            elif path == "/api/notes/open":
                self.send_json(open_note(int(payload["id"]), bool(payload.get("choose_app"))))
            elif path == "/api/notes/delete":
                self.send_json(delete_notes(payload))
            elif path == "/api/notes/export":
                self.send_json(export_notes(payload))
            elif path == "/api/review/start":
                self.send_json(start_review(payload.get("item_id")))
            elif path == "/api/review/finish":
                self.send_json(finish_review(payload))
            elif path == "/api/settings":
                incoming = payload.get("config", {})
                config = deep_merge(load_config(), incoming)
                save_config(config)
                self.send_json({"config": config})
            elif path == "/api/profile/move":
                target_dir = payload.get("path")
                if not target_dir:
                    raise ValueError("缺少新的配置目录")
                self.send_json(move_profile_dir(target_dir))
            elif path == "/api/profile/import":
                package_path = payload.get("path")
                if not package_path:
                    raise ValueError("缺少迁移包路径")
                self.send_json(import_profile_package(
                    package_path,
                    backup_target_dir=payload.get("backup_target_dir") or None,
                    backup_target_path=payload.get("backup_target_path") or None,
                ))
            elif path == "/api/backup":
                self.send_json(backup_database(payload.get("target_dir") or None, payload.get("target_path") or None))
            elif path == "/api/export":
                target = export_csv(payload.get("target_dir") or None, payload.get("target_path") or None)
                self.send_json({"export_path": str(target)})
            elif path == "/api/export-portable":
                target = export_portable_json(payload.get("target_dir") or None, payload.get("target_path") or None)
                self.send_json({"export_path": str(target)})
            elif path == "/api/export-profile":
                target = export_profile_package(payload.get("target_dir") or None, payload.get("target_path") or None)
                self.send_json({"export_path": str(target)})
            elif path == "/api/health":
                self.send_json(health_check())
            else:
                self.send_error(404)
        except Exception as exc:
            log_error("POST 处理失败：\n" + traceback.format_exc())
            self.send_json({"error": str(exc)}, 500)


def find_port(preferred: int) -> int:
    for port in [preferred] + list(range(preferred + 1, preferred + 50)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("没有找到可用端口")


def write_runtime_info(port: int) -> None:
    ensure_app_dirs()
    info = {"url": f"http://127.0.0.1:{port}", "port": port, "started_at": iso_now(), "pid": os.getpid()}
    write_text_file(APP_DIR / "runtime.json", json.dumps(info, ensure_ascii=False, indent=2))


def start_server(port: int) -> tuple[ThreadingHTTPServer, str]:
    chosen_port = find_port(port)
    write_runtime_info(chosen_port)
    server = ThreadingHTTPServer(("127.0.0.1", chosen_port), AppHandler)
    url = f"http://127.0.0.1:{chosen_port}"
    return server, url


def run_server_until_stopped(server: ThreadingHTTPServer) -> None:
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def launch_desktop_window(url: str, server: ThreadingHTTPServer) -> bool:
    global WEBVIEW_WINDOW
    try:
        import webview
    except Exception:
        log_error("pywebview 不可用，退回浏览器模式：\n" + traceback.format_exc())
        return False

    WEBVIEW_WINDOW = webview.create_window(
        APP_NAME,
        url,
        width=1240,
        height=820,
        min_size=(980, 640),
        confirm_close=True,
    )

    def on_closed() -> None:
        try:
            server.shutdown()
        except Exception:
            log_error("关闭内置服务失败：\n" + traceback.format_exc())

    try:
        WEBVIEW_WINDOW.events.closed += on_closed
    except Exception:
        pass

    webview.start(debug=False)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=APP_NAME)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--browser", action="store_true", help="使用系统浏览器打开，主要用于调试")
    parser.add_argument("--no-window", action="store_true", help="只启动本地服务，不打开桌面窗口")
    parser.add_argument("--health-check", action="store_true", help="运行数据库和资源体检后退出")
    parser.add_argument("--backup", action="store_true", help="备份数据库后退出")
    parser.add_argument("--export-portable", action="store_true", help="导出可移植 JSON 后退出")
    parser.add_argument("--export-profile", action="store_true", help="导出一键迁移配置包后退出")
    args = parser.parse_args()

    ensure_app_dirs()
    init_db()
    if args.health_check:
        print(json.dumps(health_check(), ensure_ascii=False, indent=2))
        return
    if args.backup:
        print(json.dumps(backup_database(), ensure_ascii=False, indent=2))
        return
    if args.export_portable:
        print(json.dumps({"export_path": str(export_portable_json())}, ensure_ascii=False, indent=2))
        return
    if args.export_profile:
        print(json.dumps({"export_path": str(export_profile_package())}, ensure_ascii=False, indent=2))
        return
    config = load_config()
    for root_path in config.get("library_roots", []):
        with get_conn() as conn:
            ensure_library(conn, normalize_path(root_path))
            conn.commit()

    server, url = start_server(args.port)
    print(f"{APP_NAME} 已启动：{url}")
    if args.no_window:
        run_server_until_stopped(server)
        return

    if args.browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
        run_server_until_stopped(server)
        return

    if args.no_browser:
        run_server_until_stopped(server)
        return

    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    launched = launch_desktop_window(url, server)
    if not launched:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
        run_server_until_stopped(server)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log_error("程序启动失败：\n" + traceback.format_exc())
        raise
