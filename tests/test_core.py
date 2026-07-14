import importlib.util
import json
import shutil
import sqlite3
import tempfile
import unittest
import zipfile
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[1]
APP_PATH = PROJECT_DIR / "app.py"


def load_app_module():
    spec = importlib.util.spec_from_file_location("file_reviewer_app", APP_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


class CoreTests(unittest.TestCase):
    def setUp(self):
        self.app = load_app_module()
        self.tempdir = tempfile.TemporaryDirectory()
        self.tmp = Path(self.tempdir.name)
        self.app.DEFAULT_APP_DIR = self.tmp / "default"
        self.app.PROFILE_POINTER_PATH = self.app.DEFAULT_APP_DIR / "profile_location.json"
        self.app.set_app_dir(self.tmp / "data")
        self.app.ensure_app_dirs()
        self.app.save_config(self.app.DEFAULT_CONFIG)
        self.app.init_db()

    def tearDown(self):
        try:
            self.tempdir.cleanup()
        except OSError:
            shutil.rmtree(self.app.fs_path(self.tmp), ignore_errors=True)

    def test_config_roundtrip(self):
        config = self.app.load_config()
        config["scheduler"]["algorithm"] = "SM-2"
        self.app.save_config(config)
        loaded = self.app.load_config()
        self.assertEqual(loaded["scheduler"]["algorithm"], "SM-2")
        self.assertTrue(self.app.CONFIG_PATH.exists())

    def test_legacy_config_disables_external_auto_open(self):
        legacy = self.app.load_config()
        legacy["version"] = "2.3.0"
        legacy["review"]["auto_open_file"] = True
        self.app.CONFIG_PATH.write_text(json.dumps(legacy, ensure_ascii=False), encoding="utf-8")
        loaded = self.app.load_config()
        self.assertFalse(loaded["review"]["auto_open_file"])
        self.assertEqual(loaded["version"], self.app.APP_VERSION)

    def test_scan_library_adds_supported_files(self):
        library = self.tmp / "library"
        library.mkdir()
        (library / "note.md").write_text("# note", encoding="utf-8")
        (library / "ignore.tmp").write_text("tmp", encoding="utf-8")
        result = self.app.scan_library(str(library), self.app.load_config())
        self.assertEqual(result["added"], 1)
        overview = self.app.get_overview()
        self.assertEqual(overview["stats"]["total"], 1)
        self.assertEqual(overview["due_items"][0]["file_name"], "note.md")

    def test_delete_missing_library_removes_index_and_config_root(self):
        library = self.tmp / "library-to-remove"
        library.mkdir()
        (library / "note.md").write_text("# note", encoding="utf-8")
        self.app.scan_library(str(library), self.app.load_config())
        overview = self.app.get_overview()
        library_row = overview["libraries"][0]
        self.assertTrue(library_row["exists"])
        shutil.rmtree(library)
        overview = self.app.get_overview()
        library_row = overview["libraries"][0]
        self.assertFalse(library_row["exists"])
        result = self.app.delete_library({"id": library_row["id"]})
        self.assertEqual(result["deleted"], 1)
        self.assertEqual(result["removed_items"], 1)
        self.assertEqual(self.app.get_overview()["libraries"], [])
        self.assertEqual(self.app.get_overview()["stats"]["total"], 0)
        self.assertNotIn(str(library.resolve()), self.app.load_config().get("library_roots", []))

    def test_scan_all_libraries_skips_missing_roots(self):
        good = self.tmp / "good-library"
        missing = self.tmp / "missing-library"
        good.mkdir()
        missing.mkdir()
        (good / "good.md").write_text("# good", encoding="utf-8")
        (missing / "gone.md").write_text("# gone", encoding="utf-8")
        self.app.scan_library(str(good), self.app.load_config())
        self.app.scan_library(str(missing), self.app.load_config())
        shutil.rmtree(missing)
        result = self.app.scan_all_libraries()
        self.assertEqual(len(result["scans"]), 1)
        self.assertEqual(len(result["missing"]), 1)
        self.assertEqual(result["missing"][0]["root_path"], str(missing.resolve()))

    def test_review_flow_updates_schedule_and_history(self):
        library = self.tmp / "library"
        library.mkdir()
        (library / "note.md").write_text("# note", encoding="utf-8")
        self.app.scan_library(str(library), self.app.load_config())
        opened = []
        self.app.open_path = lambda path: opened.append(path)
        started = self.app.start_review()
        self.assertIsNotNone(started["item"])
        self.assertEqual(opened, [])
        result = self.app.finish_review(
            {
                "item_id": started["item"]["id"],
                "session_id": started["session_id"],
                "rating": 2,
                "duration_seconds": 9,
            }
        )
        self.assertGreater(result["item"]["review_count"], 0)
        with self.app.get_conn() as conn:
            history_count = conn.execute("SELECT COUNT(*) AS c FROM review_history").fetchone()["c"]
        self.assertEqual(history_count, 1)

    def test_backup_database(self):
        self.app.backup_database()
        backups = list(self.app.BACKUP_DIR.glob("*.sqlite"))
        self.assertEqual(len(backups), 1)

    def test_backup_database_to_custom_export_dir(self):
        export_dir = self.tmp / "custom-exports"
        result = self.app.backup_database(export_dir)
        self.assertTrue(Path(result["backup_path"]).exists())
        self.assertEqual(Path(result["backup_path"]).parent, export_dir.resolve())

    def test_schema_version_and_migration_record(self):
        with self.app.get_conn() as conn:
            self.assertEqual(self.app.db_user_version(conn), self.app.SCHEMA_VERSION)
            count = conn.execute("SELECT COUNT(*) AS c FROM schema_migrations").fetchone()["c"]
        self.assertGreaterEqual(count, 1)

    def test_legacy_schema_without_deck_id_migrates_before_index_creation(self):
        legacy_dir = self.tmp / "legacy-data"
        self.app.set_app_dir(legacy_dir)
        self.app.ensure_app_dirs()
        self.app.save_config(self.app.DEFAULT_CONFIG)
        now = self.app.iso_now()
        conn = sqlite3.connect(self.app.fs_path(self.app.DB_PATH))
        try:
            conn.execute("PRAGMA user_version = 3")
            conn.execute(
                """
                CREATE TABLE items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guid TEXT NOT NULL UNIQUE,
                    library_id INTEGER,
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
                    pinned INTEGER DEFAULT 0
                )
                """
            )
            conn.execute(
                """
                INSERT INTO items(
                    guid, file_path, file_name, ext, added_at, updated_at, due_at
                ) VALUES('legacy-guid', ?, 'legacy.md', '.md', ?, ?, ?)
                """,
                (str(self.tmp / "legacy.md"), now, now, now),
            )
            conn.commit()
        finally:
            conn.close()
        self.app.init_db()
        with self.app.get_conn() as conn:
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(items)").fetchall()}
            tables = {row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
            indexes = {row["name"] for row in conn.execute("PRAGMA index_list(items)").fetchall()}
            row = conn.execute("SELECT deck_id FROM items WHERE guid='legacy-guid'").fetchone()
        self.assertIn("deck_id", columns)
        self.assertIn("social_profile", tables)
        self.assertIn("idx_items_deck", indexes)
        self.assertIsNotNone(row["deck_id"])
        self.assertEqual(self.app.get_overview()["app"]["version"], self.app.APP_VERSION)

    def test_legacy_unique_deck_name_schema_migrates_to_nested_names(self):
        legacy_dir = self.tmp / "legacy-deck-data"
        self.app.set_app_dir(legacy_dir)
        self.app.ensure_app_dirs()
        self.app.save_config(self.app.DEFAULT_CONFIG)
        now = self.app.iso_now()
        conn = sqlite3.connect(self.app.fs_path(self.app.DB_PATH))
        try:
            conn.execute("PRAGMA user_version = 6")
            conn.execute(
                """
                CREATE TABLE decks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT DEFAULT '',
                    color TEXT DEFAULT '#2563eb',
                    is_default INTEGER DEFAULT 0,
                    sort_order INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "INSERT INTO decks(name, description, color, is_default, sort_order, created_at, updated_at) VALUES(?, '', '#2563eb', 1, 0, ?, ?)",
                ("Default", now, now),
            )
            conn.commit()
        finally:
            conn.close()

        self.app.init_db()
        default_deck = [deck for deck in self.app.list_decks()["decks"] if deck["is_default"]][0]
        first = self.app.create_deck({"name": "Child", "parent_id": default_deck["id"]})["deck"]
        second = self.app.create_deck({"name": "Child", "parent_id": None})["deck"]
        self.assertEqual(first["name"], second["name"])
        self.assertEqual(second["parent_id"], None)
        renamed = self.app.update_deck({"id": default_deck["id"], "name": "Inbox"})["deck"]
        self.assertEqual(renamed["name"], "Inbox")

    def test_health_check_and_portable_export(self):
        library = self.tmp / "library"
        library.mkdir()
        (library / "note.md").write_text("# note", encoding="utf-8")
        self.app.scan_library(str(library), self.app.load_config())
        health = self.app.health_check()
        self.assertTrue(health["ok"])
        self.assertTrue((self.app.APP_DIR / "last_health_check.json").exists())
        exported = self.app.export_portable_json()
        self.assertTrue(exported.exists())
        payload = json.loads(exported.read_text(encoding="utf-8"))
        self.assertEqual(payload["format"], "LiFileReviewerPortable")
        self.assertEqual(len(payload["items"]), 1)

    def test_exports_use_custom_target_dir(self):
        export_dir = self.tmp / "exports"
        csv_path = self.app.export_csv(export_dir)
        json_path = self.app.export_portable_json(export_dir)
        profile_path = self.app.export_profile_package(export_dir)
        self.assertTrue(csv_path.exists())
        self.assertTrue(json_path.exists())
        self.assertTrue(profile_path.exists())
        self.assertEqual(csv_path.parent, export_dir.resolve())
        self.assertEqual(json_path.parent, export_dir.resolve())
        self.assertEqual(profile_path.parent, export_dir.resolve())

    def test_exports_and_backup_use_exact_target_file_paths(self):
        target_dir = self.tmp / "exact-exports"
        csv_path = target_dir / "custom.csv"
        json_path = target_dir / "custom.json"
        profile_path = target_dir / "custom.zip"
        backup_path = target_dir / "custom.sqlite"
        share_source = self.tmp / "share-exact.md"
        share_source.write_text("# share", encoding="utf-8")
        item = self.app.add_single_file(str(share_source))["item"]
        share_path = target_dir / "share.zip"

        self.assertEqual(self.app.export_csv(target_path=csv_path), csv_path.resolve())
        self.assertEqual(self.app.export_portable_json(target_path=json_path), json_path.resolve())
        self.assertEqual(self.app.export_profile_package(target_path=profile_path), profile_path.resolve())
        backup = self.app.backup_database(target_path=backup_path)
        share = self.app.export_share_package({"ids": [item["id"]], "target_path": str(share_path)})

        for path in [csv_path, json_path, profile_path, backup_path, share_path]:
            self.assertTrue(path.exists(), path)
        self.assertEqual(Path(backup["backup_path"]), backup_path.resolve())
        self.assertEqual(Path(share["export_path"]), share_path.resolve())

    def test_choose_folder_dialog_uses_webview_folder_dialog(self):
        class FakeWindow:
            def __init__(self):
                self.dialog_type = None

            def create_file_dialog(self, dialog_type=None, directory="", allow_multiple=False, **kwargs):
                self.dialog_type = dialog_type
                self.directory = directory
                self.allow_multiple = allow_multiple
                return [str(self.tmp_path)]

        fake = FakeWindow()
        fake.tmp_path = self.tmp / "library"
        fake.tmp_path.mkdir()
        self.app.WEBVIEW_WINDOW = fake
        selected = self.app.choose_folder_dialog()
        import webview

        self.assertEqual(Path(selected), fake.tmp_path)
        self.assertEqual(fake.dialog_type, webview.FileDialog.FOLDER)
        self.assertFalse(fake.allow_multiple)

    def test_profile_package_and_move_profile(self):
        library = self.tmp / "library"
        library.mkdir()
        (library / "note.md").write_text("# note", encoding="utf-8")
        self.app.scan_library(str(library), self.app.load_config())
        package = self.app.export_profile_package()
        self.assertTrue(package.exists())
        moved_dir = self.tmp / "moved-profile"
        result = self.app.move_profile_dir(str(moved_dir))
        self.assertTrue(result["moved"])
        self.assertEqual(Path(result["app"]["app_dir"]), moved_dir.resolve())
        self.assertTrue((moved_dir / "config.json").exists())
        self.assertTrue((moved_dir / "review_data.sqlite").exists())
        self.assertTrue(self.app.PROFILE_POINTER_PATH.exists())
        import_package = moved_dir / "exports" / package.name
        imported = self.app.import_profile_package(str(import_package))
        self.assertTrue(Path(imported["backup_before_import"]).exists())

    def test_import_profile_package_uses_exact_backup_path(self):
        created = self.app.create_note({"title": "import backup", "content": "# portable"})
        package = self.app.export_profile_package(target_path=self.tmp / "source_profile.zip")
        backup_before_import = self.tmp / "before-import.zip"
        destination = self.tmp / "fresh-profile-with-custom-backup"
        self.app.set_app_dir(destination)
        self.app.ensure_app_dirs()
        self.app.init_db()
        imported = self.app.import_profile_package(str(package), backup_target_path=backup_before_import)
        self.assertEqual(Path(imported["backup_before_import"]), backup_before_import.resolve())
        self.assertTrue(backup_before_import.exists())
        self.assertEqual(len(self.app.list_notes()["notes"]), 1)
        self.assertTrue(created["note"]["file_path"])

    def test_move_profile_to_non_empty_parent_creates_dedicated_subdir(self):
        target_parent = self.tmp / "chosen-folder"
        target_parent.mkdir()
        (target_parent / "keep.txt").write_text("user file", encoding="utf-8")
        result = self.app.move_profile_dir(str(target_parent))
        expected = target_parent / "LiFileReviewer2"
        self.assertTrue(result["moved"])
        self.assertEqual(Path(result["app"]["app_dir"]), expected.resolve())
        self.assertTrue((expected / "config.json").exists())
        self.assertTrue((expected / "review_data.sqlite").exists())
        self.assertTrue((target_parent / "keep.txt").exists())

    def test_plugins_directory_listing(self):
        plugin = self.app.PLUGINS_DIR / "sample"
        plugin.mkdir(parents=True)
        (plugin / "plugin.json").write_text(
            json.dumps({"id": "sample", "name": "Sample Plugin", "version": "0.1.0"}),
            encoding="utf-8",
        )
        result = self.app.list_plugins()
        names = {plugin["name"] for plugin in result["plugins"]}
        self.assertIn("成就系统", names)
        self.assertIn("社交资料", names)
        self.assertIn("Sample Plugin", names)

    def test_import_plugin_folder_and_toggle(self):
        source = self.tmp / "plugin-source"
        source.mkdir()
        (source / "plugin.json").write_text(
            json.dumps({"id": "folder_pack", "name": "Folder Pack", "version": "1.0.0", "enabled": False}),
            encoding="utf-8",
        )
        (source / "README.md").write_text("hello", encoding="utf-8")
        result = self.app.import_plugin(source)
        imported = result["plugin"]
        self.assertEqual(imported["id"], "folder_pack")
        imported_path = Path(imported["path"])
        self.assertTrue((imported_path / "plugin.json").exists())
        self.assertTrue((imported_path / "README.md").exists())
        listed = {plugin["id"]: plugin for plugin in self.app.list_plugins()["plugins"]}
        self.assertTrue(listed["folder_pack"]["enabled"])
        self.app.set_plugin_enabled("folder_pack", False)
        listed = {plugin["id"]: plugin for plugin in self.app.list_plugins()["plugins"]}
        self.assertFalse(listed["folder_pack"]["enabled"])

    def test_import_plugin_zip_package(self):
        source = self.tmp / "zip-plugin"
        source.mkdir()
        (source / "plugin.json").write_text(
            json.dumps({"id": "zip_pack", "name": "Zip Pack", "version": "0.2.0"}),
            encoding="utf-8",
        )
        package = self.tmp / "zip-plugin.zip"
        with zipfile.ZipFile(package, "w") as archive:
            archive.write(source / "plugin.json", "zip-plugin/plugin.json")
        result = self.app.import_plugin(package, enable=False)
        self.assertEqual(result["plugin"]["id"], "zip_pack")
        listed = {plugin["id"]: plugin for plugin in self.app.list_plugins()["plugins"]}
        self.assertIn("zip_pack", listed)
        self.assertFalse(listed["zip_pack"]["enabled"])

    def test_import_plugin_accepts_utf8_bom_manifest(self):
        source = self.tmp / "bom-plugin"
        source.mkdir()
        payload = json.dumps({"id": "bom_pack", "name": "BOM Pack"})
        (source / "plugin.json").write_text("\ufeff" + payload, encoding="utf-8")
        result = self.app.import_plugin(source)
        self.assertEqual(result["plugin"]["id"], "bom_pack")
        listed = {plugin["id"]: plugin for plugin in self.app.list_plugins()["plugins"]}
        self.assertIn("bom_pack", listed)

    def test_import_plugin_rejects_unsafe_zip_paths(self):
        package = self.tmp / "unsafe-plugin.zip"
        with zipfile.ZipFile(package, "w") as archive:
            archive.writestr("../plugin.json", json.dumps({"id": "unsafe"}))
        with self.assertRaises(ValueError):
            self.app.import_plugin(package)

    def test_core_plugin_toggle_controls_achievements(self):
        self.assertTrue(self.app.achievement_summary()["enabled"])
        toggled = self.app.set_plugin_enabled("achievement_core", False)
        self.assertFalse([p for p in toggled["plugins"] if p["id"] == "achievement_core"][0]["enabled"])
        summary = self.app.achievement_summary()
        self.assertFalse(summary["enabled"])
        self.assertEqual(summary["total"], 0)
        overview = self.app.get_overview()
        self.assertFalse(overview["achievements"]["enabled"])
        self.app.set_plugin_enabled("achievement_core", True)
        self.assertTrue(self.app.achievement_summary()["enabled"])

    def test_social_profile_plugin_save_card_and_disable(self):
        saved = self.app.save_social_profile({
            "profile": {
                "display_name": "LJL",
                "handle": "@ljl",
                "bio": "Learning in public",
                "website": "https://example.com",
                "share_stats": True,
                "share_achievements": True,
                "allow_friend_discovery": True,
            }
        })
        self.assertTrue(saved["enabled"])
        self.assertEqual(saved["profile"]["handle"], "@ljl")
        card = self.app.social_card()
        self.assertEqual(card["profile"]["display_name"], "LJL")
        self.assertIn("stats", card)
        self.app.set_plugin_enabled("social_profile", False)
        self.assertFalse(self.app.get_social_profile()["enabled"])
        overview = self.app.get_overview()
        self.assertFalse(overview["social"]["enabled"])
        with self.assertRaises(ValueError):
            self.app.save_social_profile({"display_name": "blocked"})

    def test_frontend_plugin_hosts_remove_disabled_module_placeholders(self):
        web_dir = self.app.resource_path("web")
        index_html = (web_dir / "index.html").read_text(encoding="utf-8")
        app_js = (web_dir / "app.js").read_text(encoding="utf-8")
        self.assertIn('id="dashboardPluginHost"', index_html)
        self.assertIn('id="settingsPluginHost"', index_html)
        self.assertNotIn('id="achievementSummary"', index_html)
        self.assertNotIn('id="socialDisplayNameInput"', index_html)
        self.assertGreaterEqual(app_js.count('host.innerHTML = ""'), 2)
        self.assertIn('layout.classList.add("no-achievements")', app_js)
        self.assertNotIn('t("plugins.achievementDisabled")', app_js)
        self.assertNotIn('t("social.disabledHint")', app_js)
        self.assertIn('data-delete-library', app_js)
        self.assertIn('/api/libraries/delete', app_js)

    def test_markdown_notes_are_real_files_and_saved(self):
        library = self.tmp / "library"
        library.mkdir()
        (library / "source.md").write_text("# source", encoding="utf-8")
        self.app.scan_library(str(library), self.app.load_config())
        started = self.app.start_review()
        created = self.app.create_note({"item_id": started["item"]["id"], "title": "复习笔记"})
        note_path = Path(created["note"]["file_path"])
        self.assertTrue(note_path.exists())
        self.assertEqual(note_path.suffix, ".md")
        saved = self.app.save_note({"id": created["note"]["id"], "title": "更新笔记", "content": "# updated"})
        self.assertEqual(note_path.read_text(encoding="utf-8"), "# updated")
        self.assertEqual(saved["note"]["title"], "更新笔记")
        notes = self.app.list_notes(started["item"]["id"])
        self.assertEqual(len(notes["notes"]), 1)

    def test_linked_note_works_with_deep_profile_and_long_file_name(self):
        deep_profile = self.tmp / ("deep_" + "x" * 40) / ("profile_" + "y" * 40)
        self.app.set_app_dir(deep_profile)
        self.app.ensure_app_dirs()
        self.app.save_config(self.app.DEFAULT_CONFIG)
        self.app.init_db()
        library = self.tmp / ("library_" + "z" * 40)
        library.mkdir(parents=True)
        long_name = "20250915_REF5_How I Study Consistently While Working a 9-5 Full-Time Job " + ("very long " * 8) + ".pdf"
        source = library / long_name
        source.write_text("pdf placeholder", encoding="utf-8")
        self.app.scan_library(str(library), self.app.load_config())
        started = self.app.start_review()
        created = self.app.create_note({"item_id": started["item"]["id"], "title": f"{started['item']['file_name']} 复习笔记"})
        note_path = Path(created["note"]["file_path"])
        self.assertTrue(self.app.path_exists(note_path))
        self.assertIn("复习笔记", self.app.read_note(created["note"]["id"])["note"]["content"])
        self.assertIn("复习笔记", created["note"]["title"])

    def test_notes_can_be_exported_and_deleted_in_batches(self):
        first = self.app.create_note({"title": "第一篇", "content": "# one"})["note"]
        second = self.app.create_note({"title": "第二篇", "content": "# two"})["note"]
        export_dir = self.tmp / "note-exports"
        exported = self.app.export_notes({"ids": [first["id"], second["id"]], "target_dir": str(export_dir)})
        self.assertEqual(exported["exported"], 2)
        self.assertTrue((export_dir / "第一篇.md").exists())
        self.assertTrue((export_dir / "第二篇.md").exists())
        deleted = self.app.delete_notes({"ids": [first["id"], second["id"]], "delete_files": True})
        self.assertEqual(deleted["deleted"], 2)
        self.assertFalse(Path(first["file_path"]).exists())
        self.assertFalse(Path(second["file_path"]).exists())
        self.assertEqual(len(self.app.list_notes()["notes"]), 0)

    def test_profile_package_contains_notes_folder(self):
        created = self.app.create_note({"title": "迁移笔记", "content": "# portable"})
        package = self.app.export_profile_package()
        with zipfile.ZipFile(package, "r") as archive:
            names = archive.namelist()
        self.assertIn("notes/迁移笔记.md", names)

    def test_import_profile_package_repairs_note_paths(self):
        created = self.app.create_note({"title": "导入笔记", "content": "# portable"})["note"]
        package = self.app.export_profile_package()
        destination = self.tmp / "fresh-profile"
        self.app.set_app_dir(destination)
        self.app.ensure_app_dirs()
        self.app.init_db()
        imported = self.app.import_profile_package(str(package))
        self.assertTrue(Path(imported["backup_before_import"]).exists())
        notes = self.app.list_notes()["notes"]
        self.assertEqual(len(notes), 1)
        self.assertEqual(Path(notes[0]["file_path"]).parent, self.app.DEFAULT_NOTES_DIR)
        self.assertTrue(Path(notes[0]["file_path"]).exists())
        self.assertNotEqual(Path(notes[0]["file_path"]), Path(created["file_path"]))

    def test_single_file_can_be_added_without_library(self):
        source = self.tmp / "single.md"
        source.write_text("# single", encoding="utf-8")
        result = self.app.add_single_file(str(source), tags="solo")
        self.assertEqual(result["result"], "added")
        self.assertIsNone(result["item"]["library_id"])
        self.assertEqual(result["item"]["file_name"], "single.md")
        started = self.app.start_review(result["item"]["id"])
        self.assertEqual(started["item"]["id"], result["item"]["id"])

    def test_single_file_accepts_unconfigured_extension(self):
        source = self.tmp / "raw.customext"
        source.write_text("raw", encoding="utf-8")
        result = self.app.add_single_file(str(source))
        self.assertEqual(result["result"], "added")
        self.assertEqual(result["item"]["ext"], ".customext")

    def test_decks_create_assign_and_delete(self):
        source = self.tmp / "decked.md"
        source.write_text("# decked", encoding="utf-8")
        created_deck = self.app.create_deck({"name": "Research", "description": "papers"})["deck"]
        item = self.app.add_single_file(str(source), deck_id=created_deck["id"])["item"]
        queried = self.app.query_items({"deck_id": [str(created_deck["id"])], "status": ["all"]})
        self.assertEqual(queried["total"], 1)
        self.assertEqual(queried["items"][0]["deck_id"], created_deck["id"])
        default_deck = [deck for deck in self.app.list_decks()["decks"] if deck["is_default"]][0]
        deleted = self.app.delete_deck({"id": created_deck["id"]})
        self.assertEqual(deleted["deleted"], 1)
        updated = self.app.query_items({"status": ["all"]})["items"][0]
        self.assertEqual(updated["deck_id"], default_deck["id"])
        self.assertEqual(item["file_name"], "decked.md")

    def test_decks_can_rename_default_and_reorder_hierarchy(self):
        default_deck = [deck for deck in self.app.list_decks()["decks"] if deck["is_default"]][0]
        renamed = self.app.update_deck({"id": default_deck["id"], "name": "Inbox"})["deck"]
        child = self.app.create_deck({"name": "Reading", "parent_id": renamed["id"]})["deck"]
        grandchild = self.app.create_deck({"name": "Papers", "parent_id": child["id"]})["deck"]

        decks = self.app.list_decks()["decks"]
        by_id = {deck["id"]: deck for deck in decks}
        self.assertEqual(by_id[renamed["id"]]["name"], "Inbox")
        self.assertEqual(by_id[child["id"]]["parent_id"], renamed["id"])
        self.assertEqual(by_id[grandchild["id"]]["depth"], 2)

        reordered = self.app.reorder_decks({
            "decks": [
                {"id": renamed["id"], "parent_id": None, "sort_order": 1},
                {"id": grandchild["id"], "parent_id": renamed["id"], "sort_order": 1},
                {"id": child["id"], "parent_id": None, "sort_order": 2},
            ]
        })["decks"]
        by_id = {deck["id"]: deck for deck in reordered}
        self.assertEqual(by_id[grandchild["id"]]["parent_id"], renamed["id"])
        self.assertEqual(by_id[child["id"]]["parent_id"], None)

    def test_content_links_and_learning_stats_plugin(self):
        source = self.tmp / "source.md"
        target = self.tmp / "target.md"
        source.write_text("# source\nimportant concept", encoding="utf-8")
        target.write_text("# target", encoding="utf-8")
        source_item = self.app.add_single_file(str(source))["item"]
        target_item = self.app.add_single_file(str(target))["item"]
        note = self.app.create_note({"title": "Link Note", "content": "# note"})["note"]

        link = self.app.create_content_link({
            "source_type": "item",
            "source_id": source_item["id"],
            "selected_text": "important concept",
            "target_type": "note",
            "target_id": note["id"],
            "note": "related",
        })["link"]
        self.assertEqual(link["target"]["label"], "Link Note")
        self.assertEqual(link["target"]["preview_url"], f"/api/note-file/{note['id']}")
        listed = self.app.list_content_links({"source_type": ["item"], "source_id": [str(source_item["id"])]})["links"]
        self.assertEqual(len(listed), 1)

        started = self.app.start_review(target_item["id"])
        self.app.finish_review({"item_id": target_item["id"], "session_id": started["session_id"], "rating": 3, "duration_seconds": 90})
        stats = self.app.learning_stats_summary()
        self.assertTrue(stats["enabled"])
        self.assertGreaterEqual(stats["totals"]["links"], 1)
        self.assertGreaterEqual(stats["totals"]["reviews"], 1)

        self.app.set_plugin_enabled("learning_stats", False)
        self.assertFalse(self.app.learning_stats_summary()["enabled"])

    def test_rescan_preserves_existing_deck_when_no_deck_selected(self):
        library = self.tmp / "deck-library"
        library.mkdir()
        source = library / "paper.md"
        source.write_text("# paper", encoding="utf-8")
        deck = self.app.create_deck({"name": "Papers"})["deck"]
        self.app.scan_library(str(library), self.app.load_config(), deck_id=deck["id"])
        self.app.scan_library(str(library), self.app.load_config())
        item = self.app.query_items({"status": ["all"]})["items"][0]
        self.assertEqual(item["deck_id"], deck["id"])

    def test_achievements_unlock_for_file_deck_tag_note_and_review(self):
        source = self.tmp / "achieve.md"
        source.write_text("# achieve", encoding="utf-8")
        deck = self.app.create_deck({"name": "Milestones"})["deck"]
        item = self.app.add_single_file(str(source), deck_id=deck["id"], tags="tagged")["item"]
        started = self.app.start_review(item["id"])
        self.app.finish_review({"item_id": item["id"], "session_id": started["session_id"], "rating": 2})
        self.app.create_note({"item_id": item["id"], "title": "linked", "content": "# linked"})
        summary = self.app.achievement_summary()
        unlocked = {row["id"] for row in summary["achievements"] if row["unlocked"]}
        self.assertIn("first_item", unlocked)
        self.assertIn("first_single_file", unlocked)
        self.assertIn("first_deck", unlocked)
        self.assertIn("first_tag", unlocked)
        self.assertIn("first_review", unlocked)
        self.assertIn("first_note", unlocked)

    def test_achievement_plugin_adds_unlimited_json_rewards(self):
        plugin = self.app.PLUGINS_DIR / "review_marathon"
        plugin.mkdir(parents=True)
        (plugin / "plugin.json").write_text(
            json.dumps(
                {
                    "id": "review_marathon",
                    "name": "Review Marathon",
                    "version": "1.0.0",
                    "enabled": True,
                    "achievements": [
                        {
                            "id": "two_reviews",
                            "title": "Two Reviews",
                            "description": "Finish two reviews",
                            "metric": "reviews",
                            "target": 2,
                            "points": 120,
                            "tier": "gold",
                        },
                        {
                            "id": "one_backup",
                            "title": "Backup Keeper",
                            "description": "Make a backup",
                            "metric": "event:backup_database",
                            "target": 1,
                            "points": 30,
                            "tier": "silver",
                        },
                    ],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        source = self.tmp / "plugin-achieve.md"
        source.write_text("# achieve", encoding="utf-8")
        item = self.app.add_single_file(str(source))["item"]
        for _ in range(2):
            started = self.app.start_review(item["id"])
            self.app.finish_review({"item_id": item["id"], "session_id": started["session_id"], "rating": 2})
        self.app.backup_database(target_path=self.tmp / "plugin-backup.sqlite")

        summary = self.app.achievement_summary()
        by_id = {row["id"]: row for row in summary["achievements"]}
        self.assertTrue(by_id["plugin:review_marathon:two_reviews"]["unlocked"])
        self.assertTrue(by_id["plugin:review_marathon:one_backup"]["unlocked"])
        self.assertGreaterEqual(summary["points"], 150)
        self.assertGreaterEqual(summary["reward"]["level"], 2)

    def test_share_package_exports_manifest_notes_and_optional_files(self):
        source = self.tmp / "share.md"
        source.write_text("# share", encoding="utf-8")
        item = self.app.add_single_file(str(source), tags="share")["item"]
        self.app.create_note({"item_id": item["id"], "title": "share-note", "content": "# note"})
        package = self.app.export_share_package({
            "ids": [item["id"]],
            "include_files": True,
            "target_dir": str(self.tmp / "share-out"),
        })
        archive_path = Path(package["export_path"])
        self.assertTrue(archive_path.exists())
        with zipfile.ZipFile(archive_path, "r") as archive:
            names = set(archive.namelist())
            manifest = json.loads(archive.read("share_manifest.json").decode("utf-8"))
        self.assertEqual(manifest["format"], "LiFileReviewerShare")
        self.assertIn("items.json", names)
        self.assertIn("notes.json", names)
        self.assertTrue(any(name.startswith("files/") for name in names))


if __name__ == "__main__":
    unittest.main()
