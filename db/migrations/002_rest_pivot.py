"""
One-way migration for the ProseMirror / REST pivot.

Drops the legacy AST/operations/versions schema and creates a fresh
markdown-centric schema:

  - documents(id, title, content_md, created_at, updated_at)
  - versions(id, document_id, content_md, label, created_at)
  - idx_versions_document on versions(document_id, created_at)

This migration is one-way. ``down`` raises ``NotImplementedError`` because
the legacy AST/operation data cannot be reconstructed from markdown.

Idempotent: ``DROP TABLE IF EXISTS`` and ``CREATE TABLE IF NOT EXISTS``
allow safe re-execution on a database that has already been migrated.
"""


def up(db):
    """Drop legacy tables and create the markdown-centric schema."""
    # --- Drop legacy shape -------------------------------------------------
    db.execute("DROP INDEX IF EXISTS idx_operations_document")
    db.execute("DROP INDEX IF EXISTS idx_versions_document")
    db.execute("DROP TABLE IF EXISTS operations")
    db.execute("DROP TABLE IF EXISTS versions")
    db.execute("DROP TABLE IF EXISTS documents")

    # --- Create new shape --------------------------------------------------
    db.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT '',
            content_md TEXT NOT NULL DEFAULT '',
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS versions (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            content_md TEXT NOT NULL,
            label TEXT,
            created_at REAL NOT NULL
        )
    """)
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_versions_document "
        "ON versions(document_id, created_at)"
    )
    db.commit()


def down(db):
    """One-way migration -- rolling back is not supported."""
    raise NotImplementedError(
        "002_rest_pivot is one-way -- no rollback"
    )
