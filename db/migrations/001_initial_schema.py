"""
Initial database schema for the Kurras editor.

Creates three tables:
- documents: stores document AST snapshots as JSON
- operations: append-only operation log per document
- versions: snapshot-based version history per document
"""


def up(db):
    """Create the initial schema tables and indexes."""
    db.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            title TEXT,
            ast_snapshot TEXT NOT NULL,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            created_by TEXT DEFAULT 'user'
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS operations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id TEXT NOT NULL,
            op_data TEXT NOT NULL,
            applied_at REAL NOT NULL,
            actor TEXT DEFAULT 'user',
            FOREIGN KEY (document_id) REFERENCES documents(id)
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS versions (
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
        "CREATE INDEX IF NOT EXISTS idx_operations_document "
        "ON operations(document_id, applied_at)"
    )
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_versions_document "
        "ON versions(document_id, created_at)"
    )
    db.commit()


def down(db):
    """Drop all schema tables (reverse of up)."""
    db.execute("DROP TABLE IF EXISTS versions")
    db.execute("DROP TABLE IF EXISTS operations")
    db.execute("DROP TABLE IF EXISTS documents")
    db.commit()
