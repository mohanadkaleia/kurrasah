"""
Document repository for the editor.

Markdown-centric persistence layer. All SQL queries use parameterized
placeholders (``?``) to prevent injection. Returned rows are plain
``dict`` objects; no ORM objects leak out of this module.

Schema assumed (see ``db/migrations/002_rest_pivot.py``):

  - documents(id, title, content_md, created_at, updated_at)
  - versions(id, document_id, content_md, label, created_at)

IDs are UUID v4 strings. Timestamps are epoch floats (``time.time()``).
"""
import time
import uuid
from typing import Optional

from db.db import DatabaseManager


class DocumentRepository:
    """Persistence layer for markdown documents and manual version snapshots."""

    def __init__(self, db: DatabaseManager):
        self.db = db

    # ------------------------------------------------------------------
    # Documents
    # ------------------------------------------------------------------

    def create_document(
        self, title: str = "", content_md: str = ""
    ) -> dict:
        """
        Insert a new document and return it as a dict.

        Args:
            title: Document title. Defaults to empty string.
            content_md: Markdown body. Defaults to empty string.

        Returns:
            dict with keys: id, title, content_md, created_at, updated_at.
        """
        doc_id = str(uuid.uuid4())
        now = time.time()
        self.db.execute_write(
            "INSERT INTO documents (id, title, content_md, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (doc_id, title, content_md, now, now),
        )
        self.db.commit()
        return {
            "id": doc_id,
            "title": title,
            "content_md": content_md,
            "created_at": now,
            "updated_at": now,
        }

    def get_document(self, doc_id: str) -> Optional[dict]:
        """Fetch a single document by ID. Returns None if missing."""
        return self.db.fetch_one(
            "SELECT id, title, content_md, created_at, updated_at "
            "FROM documents WHERE id = ?",
            (doc_id,),
        )

    def list_documents(self) -> list[dict]:
        """
        List all documents as summaries (id, title, updated_at),
        most-recently-updated first.
        """
        rows = self.db.execute(
            "SELECT id, title, updated_at FROM documents "
            "ORDER BY updated_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]

    def update_document(
        self,
        doc_id: str,
        title: Optional[str] = None,
        content_md: Optional[str] = None,
    ) -> Optional[dict]:
        """
        Partially update a document. Only non-None fields are written.

        Always bumps ``updated_at`` when any field is supplied.

        Returns the updated document dict, or None if the document is
        missing. If both ``title`` and ``content_md`` are None, returns
        the current document without touching ``updated_at``.
        """
        current = self.get_document(doc_id)
        if current is None:
            return None
        if title is None and content_md is None:
            return current

        now = time.time()
        new_title = current["title"] if title is None else title
        new_content = current["content_md"] if content_md is None else content_md
        self.db.execute_write(
            "UPDATE documents SET title = ?, content_md = ?, updated_at = ? "
            "WHERE id = ?",
            (new_title, new_content, now, doc_id),
        )
        self.db.commit()
        return {
            "id": doc_id,
            "title": new_title,
            "content_md": new_content,
            "created_at": current["created_at"],
            "updated_at": now,
        }

    def delete_document(self, doc_id: str) -> bool:
        """
        Delete a document and cascade to its versions.

        Returns True if a row was deleted, False if the document did not
        exist. The foreign key ``ON DELETE CASCADE`` on ``versions``
        removes related snapshots automatically.
        """
        cursor = self.db.execute_write(
            "DELETE FROM documents WHERE id = ?",
            (doc_id,),
        )
        self.db.commit()
        return cursor.rowcount > 0

    # ------------------------------------------------------------------
    # Versions (manual snapshots)
    # ------------------------------------------------------------------

    def list_versions(self, doc_id: str) -> list[dict]:
        """
        List summary info for a document's version snapshots, newest first.

        Returns a list of dicts ``{id, label, created_at}``. The snapshot
        body (``content_md``) is NOT included -- callers must fetch a
        specific version through ``restore_version`` or via a dedicated
        read path if that is ever added.
        """
        rows = self.db.execute(
            "SELECT id, label, created_at FROM versions "
            "WHERE document_id = ? ORDER BY created_at DESC",
            (doc_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def create_version(
        self, doc_id: str, label: Optional[str] = None
    ) -> Optional[dict]:
        """
        Snapshot the current ``content_md`` of a document.

        Returns the created version summary (``{id, label, created_at}``),
        or None if the source document does not exist.
        """
        doc = self.get_document(doc_id)
        if doc is None:
            return None
        version_id = str(uuid.uuid4())
        now = time.time()
        self.db.execute_write(
            "INSERT INTO versions "
            "(id, document_id, content_md, label, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (version_id, doc_id, doc["content_md"], label, now),
        )
        self.db.commit()
        return {
            "id": version_id,
            "label": label,
            "created_at": now,
        }

    def restore_version(
        self, doc_id: str, version_id: str
    ) -> Optional[dict]:
        """
        Overwrite a document's ``content_md`` with the snapshot body of
        a version. Bumps ``updated_at``.

        Returns the updated document dict, or None if either the
        document or the version (belonging to that document) is missing.
        """
        doc = self.get_document(doc_id)
        if doc is None:
            return None
        version = self.db.fetch_one(
            "SELECT content_md FROM versions "
            "WHERE id = ? AND document_id = ?",
            (version_id, doc_id),
        )
        if version is None:
            return None

        now = time.time()
        self.db.execute_write(
            "UPDATE documents SET content_md = ?, updated_at = ? "
            "WHERE id = ?",
            (version["content_md"], now, doc_id),
        )
        self.db.commit()
        return {
            "id": doc_id,
            "title": doc["title"],
            "content_md": version["content_md"],
            "updated_at": now,
        }
