"""
Tests for the one-way pivot migration ``db/migrations/002_rest_pivot.py``.

Boots a temp SQLite database with the legacy three-table shape (to
simulate a pre-pivot installation), runs the 002 migration, and
verifies:

  - legacy tables are removed
  - new ``documents`` / ``versions`` tables exist with the expected columns
  - the ``idx_versions_document`` index exists
  - the migration is idempotent (running twice does not error)
  - ``down()`` raises NotImplementedError
"""
import importlib
import os
import tempfile

import pytest

from db.db import DatabaseManager

# Python module names cannot start with a digit, so we import the
# migration via importlib rather than with a normal ``from ... import``.
_002 = importlib.import_module("db.migrations.002_rest_pivot")


def _columns(db, table):
    """Return the set of column names for ``table``."""
    rows = db.execute(f"PRAGMA table_info({table})").fetchall()
    return {row["name"] for row in rows}


def _table_exists(db, table):
    row = db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def _index_exists(db, index):
    row = db.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name = ?",
        (index,),
    ).fetchone()
    return row is not None


def _seed_legacy_schema(db):
    """Create the legacy three-table shape with a row in each table."""
    db.execute("""
        CREATE TABLE documents (
            id TEXT PRIMARY KEY,
            title TEXT,
            ast_snapshot TEXT NOT NULL,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            created_by TEXT DEFAULT 'user'
        )
    """)
    db.execute("""
        CREATE TABLE operations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id TEXT NOT NULL,
            op_data TEXT NOT NULL,
            applied_at REAL NOT NULL,
            actor TEXT DEFAULT 'user',
            FOREIGN KEY (document_id) REFERENCES documents(id)
        )
    """)
    db.execute("""
        CREATE TABLE versions (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            snapshot TEXT NOT NULL,
            ops_since_previous TEXT,
            created_at REAL NOT NULL,
            label TEXT,
            actor TEXT DEFAULT 'user',
            FOREIGN KEY (document_id) REFERENCES documents(id)
        )
    """)
    db.execute(
        "CREATE INDEX idx_operations_document "
        "ON operations(document_id, applied_at)"
    )
    db.execute(
        "CREATE INDEX idx_versions_document "
        "ON versions(document_id, created_at)"
    )
    db.execute(
        "INSERT INTO documents "
        "(id, title, ast_snapshot, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?)",
        ("legacy-doc", "legacy title", '{"type":"document"}', 100.0, 100.0),
    )
    db.execute(
        "INSERT INTO operations "
        "(document_id, op_data, applied_at) VALUES (?, ?, ?)",
        ("legacy-doc", '{"kind":"insert"}', 101.0),
    )
    db.commit()


def test_migration_drops_legacy_and_creates_new_shape():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "legacy.db")
        db = DatabaseManager(db_path)
        try:
            _seed_legacy_schema(db)

            # Legacy shape pre-migration sanity check
            assert _table_exists(db, "documents")
            assert _table_exists(db, "operations")
            assert _table_exists(db, "versions")
            assert "ast_snapshot" in _columns(db, "documents")

            _002.up(db)

            # Legacy operations table is gone
            assert not _table_exists(db, "operations")

            # documents has the new shape
            assert _table_exists(db, "documents")
            cols = _columns(db, "documents")
            assert cols == {
                "id",
                "title",
                "content_md",
                "created_at",
                "updated_at",
            }

            # versions has the new shape
            assert _table_exists(db, "versions")
            vcols = _columns(db, "versions")
            assert vcols == {
                "id",
                "document_id",
                "content_md",
                "label",
                "created_at",
            }

            # Index is recreated on the new table
            assert _index_exists(db, "idx_versions_document")

            # Ensure insert works on new schema
            db.execute(
                "INSERT INTO documents "
                "(id, title, content_md, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?)",
                ("new-1", "t", "c", 200.0, 200.0),
            )
            db.commit()
            row = db.fetch_one(
                "SELECT title, content_md FROM documents WHERE id = ?",
                ("new-1",),
            )
            assert row == {"title": "t", "content_md": "c"}
        finally:
            db.close()


def test_migration_is_idempotent():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "idempotent.db")
        db = DatabaseManager(db_path)
        try:
            _seed_legacy_schema(db)
            _002.up(db)
            # Running up again must not raise.
            _002.up(db)

            # Schema is still the new shape after a second run.
            assert _table_exists(db, "documents")
            assert _columns(db, "documents") == {
                "id",
                "title",
                "content_md",
                "created_at",
                "updated_at",
            }
        finally:
            db.close()


def test_migration_on_fresh_db_is_safe():
    """``up`` must succeed even when no legacy tables exist."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "fresh.db")
        db = DatabaseManager(db_path)
        try:
            _002.up(db)
            assert _table_exists(db, "documents")
            assert _table_exists(db, "versions")
        finally:
            db.close()


def test_migration_down_raises_not_implemented():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "down.db")
        db = DatabaseManager(db_path)
        try:
            with pytest.raises(NotImplementedError):
                _002.down(db)
        finally:
            db.close()
