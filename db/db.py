"""
Database manager for the Kurras editor.

Wraps SQLite with WAL journal mode, foreign key enforcement, and a simple
migration system. All queries must use parameterized placeholders (?).

Thread-safety: A threading.Lock serializes all write operations (execute
that modify data + commit). SQLite WAL mode supports concurrent readers,
so reads are safe without the lock. The lock ensures that concurrent Flask
requests do not corrupt data when performing writes.
"""
import importlib
import os
import sqlite3
import threading
import time
from typing import Optional


class DatabaseManager:
    """SQLite database manager with parameterized queries and thread-safe writes."""

    def __init__(self, db_path: str = "db/kurras.db"):
        self.db_path = db_path
        self._write_lock = threading.Lock()
        db_dir = os.path.dirname(db_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")

    def execute(self, query: str, params: tuple = ()) -> sqlite3.Cursor:
        """Execute a single SQL statement with parameterized placeholders."""
        return self.conn.execute(query, params)

    def executemany(self, query: str, params_list: list[tuple]) -> sqlite3.Cursor:
        """Execute a SQL statement for each set of parameters."""
        return self.conn.executemany(query, params_list)

    def fetch_one(self, query: str, params: tuple = ()) -> Optional[dict]:
        """Execute a query and return the first row as a dict, or None."""
        row = self.conn.execute(query, params).fetchone()
        if row is None:
            return None
        return dict(row)

    def commit(self):
        """Commit the current transaction."""
        self.conn.commit()

    def execute_write(self, query: str, params: tuple = ()) -> sqlite3.Cursor:
        """Execute a write statement under the write lock. Does NOT auto-commit."""
        with self._write_lock:
            return self.conn.execute(query, params)

    def execute_write_batch(
        self, statements: list[tuple[str, tuple]]
    ) -> None:
        """
        Execute multiple write statements atomically under a single lock
        acquisition, then commit. Rolls back on failure.

        Each element of *statements* is a (query, params) pair.
        """
        with self._write_lock:
            try:
                for query, params in statements:
                    self.conn.execute(query, params)
                self.conn.commit()
            except Exception:
                self.conn.rollback()
                raise

    def close(self):
        """Close the database connection."""
        self.conn.close()

    def run_migrations(self):
        """
        Run all pending migration files in sorted order.

        Creates a _migrations tracking table if it does not exist, scans
        db/migrations/ for .py files, and runs any that have not yet been
        applied by calling module.up(self). Records each applied migration
        with a timestamp.

        Migrations run at startup before the app serves requests, so they
        use the raw execute/commit path (no lock contention possible).
        """
        migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")
        if not os.path.exists(migrations_dir):
            return

        # Create migrations tracking table
        self.execute("""
            CREATE TABLE IF NOT EXISTS _migrations (
                name TEXT PRIMARY KEY,
                applied_at REAL NOT NULL
            )
        """)
        self.commit()

        # Get already-applied migrations
        applied = {
            row["name"]
            for row in self.execute("SELECT name FROM _migrations").fetchall()
        }

        # Run pending migrations in sorted order
        migration_files = sorted(
            f for f in os.listdir(migrations_dir)
            if f.endswith(".py") and f != "__init__.py"
        )
        for mf in migration_files:
            if mf in applied:
                continue
            module_name = f"db.migrations.{mf[:-3]}"
            module = importlib.import_module(module_name)
            module.up(self)
            self.execute(
                "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
                (mf, time.time()),
            )
            self.commit()
