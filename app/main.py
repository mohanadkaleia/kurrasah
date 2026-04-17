"""
Flask application factory for the editor backend.

Exposes a minimal JSON REST API under ``/api`` (see ``app.api``).
The DocumentRepository is attached to ``app.config`` so the blueprint
route handlers can access it via ``current_app.config['repo']``.

CSRF note: The REST API only accepts ``application/json`` content-type
on write endpoints (see ``app/api/documents.py``). Combined with the
CORS allow-list below, the browser preflight check provides implicit
CSRF protection -- browsers block cross-origin writes from origins not
in the list, and HTML forms cannot produce ``application/json`` bodies.
"""
import os

from flask import Flask
from flask_cors import CORS

from app.api import api_bp
from app.api.documents import MAX_CONTENT_BYTES
from app.models.document_repo import DocumentRepository
from db.db import DatabaseManager


# Allow a little headroom above ``MAX_CONTENT_BYTES`` to let the
# per-field 413 handler in ``app/api/documents.py`` report with the
# structured error shape. Flask's ``MAX_CONTENT_LENGTH`` is a hard cap
# applied BEFORE the body is parsed; we set it slightly higher so our
# JSON error response (rather than an HTML 413) is returned for
# reasonable oversizing cases.
_MAX_REQUEST_BYTES = MAX_CONTENT_BYTES + 16 * 1024


def _is_debug() -> bool:
    """Return True when FLASK_DEBUG is explicitly set to 'true'."""
    return os.environ.get("FLASK_DEBUG", "false").lower() == "true"


def create_app(db_path: str = "db/kurras.db") -> Flask:
    """
    Create and configure the Flask application.

    Args:
        db_path: Path to the SQLite database file. Migrations run at
            startup.

    Returns:
        Configured Flask application with the REST blueprint registered
        at ``/api``.
    """
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = _MAX_REQUEST_BYTES

    # --- CORS ----------------------------------------------------------
    # Allow the Vite dev-server by default. Override with a comma-separated
    # CORS_ORIGINS environment variable for production deployments.
    allowed_origins = os.environ.get(
        "CORS_ORIGINS", "http://localhost:5173"
    ).split(",")
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

    db = DatabaseManager(db_path)
    db.run_migrations()

    repo = DocumentRepository(db)

    # Store on app for teardown and test access
    app.config["db"] = db
    app.config["repo"] = repo

    app.register_blueprint(api_bp)

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=_is_debug(), port=5000)
