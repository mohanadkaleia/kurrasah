"""
REST API blueprint for the editor backend.

Exposes a minimal JSON API under ``/api`` for document CRUD and manual
version snapshots. The blueprint is registered by ``app.main.create_app``.
"""
from flask import Blueprint

api_bp = Blueprint("api", __name__, url_prefix="/api")

# Import route modules for their side-effect of registering handlers
# with ``api_bp``. These imports must happen after ``api_bp`` is defined.
from . import documents  # noqa: E402,F401 -- register routes
