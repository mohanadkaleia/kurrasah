"""
REST endpoints for document CRUD and manual version snapshots.

All write endpoints require ``Content-Type: application/json`` and return
``415 Unsupported Media Type`` otherwise. All bodies are JSON; error
responses have shape ``{"error": "...", "code": "..."}``.

Size limits enforced here:

  - title:      <= 500 chars
  - content_md: <= 1,048,576 bytes (1 MiB) UTF-8
  - label:      <= 200 chars

Status code contract:

  - 400 INVALID_INPUT         -- malformed JSON, wrong type, per-field cap
  - 404 NOT_FOUND             -- missing document or version
  - 413 PAYLOAD_TOO_LARGE     -- raw body or content_md exceeds cap
  - 415 UNSUPPORTED_MEDIA_TYPE-- non-JSON content-type on write endpoints
"""
from flask import current_app, jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge, UnsupportedMediaType

from . import api_bp


# --- Size caps ---------------------------------------------------------------

MAX_TITLE_CHARS = 500
MAX_LABEL_CHARS = 200
MAX_CONTENT_BYTES = 1_048_576  # 1 MiB


# --- Helpers -----------------------------------------------------------------


def _error(message: str, code: str, status: int):
    """Return a JSON error response ``{error, code}`` with the given status."""
    response = jsonify({"error": message, "code": code})
    response.status_code = status
    return response


def _parse_json_body():
    """
    Parse the request body as JSON, enforcing content-type and top-level type.

    Returns either a dict on success, or a Flask response (already built via
    ``_error``) on failure. Callers should check ``isinstance(result, dict)``.
    """
    try:
        body = request.get_json(silent=False, force=False)
    except UnsupportedMediaType:
        return _error(
            "Content-Type must be application/json",
            "UNSUPPORTED_MEDIA_TYPE",
            415,
        )
    except RequestEntityTooLarge:
        return _error(
            "Request body too large", "PAYLOAD_TOO_LARGE", 413
        )
    except Exception:
        # Werkzeug raises BadRequest (400) for invalid JSON bodies.
        return _error("Malformed JSON body", "INVALID_INPUT", 400)

    if body is None:
        # Empty body on a JSON endpoint: treat as no-op object rather than
        # rejecting. Only happens for POST with empty body + correct CT.
        return {}
    if not isinstance(body, dict):
        return _error(
            "Request body must be a JSON object", "INVALID_INPUT", 400
        )
    return body


def _validate_title(value):
    """Return (ok, err_response) for an optional title field."""
    if value is None:
        return True, None
    if not isinstance(value, str):
        return False, _error(
            "'title' must be a string", "INVALID_INPUT", 400
        )
    if len(value) > MAX_TITLE_CHARS:
        return False, _error(
            f"'title' must be <= {MAX_TITLE_CHARS} characters",
            "INVALID_INPUT",
            400,
        )
    return True, None


def _validate_content_md(value):
    """Return (ok, err_response) for an optional content_md field."""
    if value is None:
        return True, None
    if not isinstance(value, str):
        return False, _error(
            "'content_md' must be a string", "INVALID_INPUT", 400
        )
    if len(value.encode("utf-8")) > MAX_CONTENT_BYTES:
        return False, _error(
            f"'content_md' exceeds {MAX_CONTENT_BYTES}-byte limit",
            "PAYLOAD_TOO_LARGE",
            413,
        )
    return True, None


def _validate_label(value):
    """Return (ok, err_response) for an optional label field."""
    if value is None:
        return True, None
    if not isinstance(value, str):
        return False, _error(
            "'label' must be a string", "INVALID_INPUT", 400
        )
    if len(value) > MAX_LABEL_CHARS:
        return False, _error(
            f"'label' must be <= {MAX_LABEL_CHARS} characters",
            "INVALID_INPUT",
            400,
        )
    return True, None


def _repo():
    """Fetch the DocumentRepository from the app config."""
    return current_app.config["repo"]


# --- Document endpoints ------------------------------------------------------


@api_bp.route("/documents", methods=["GET"])
def list_documents():
    """GET /api/documents -> [{id, title, updated_at}]."""
    return jsonify(_repo().list_documents())


@api_bp.route("/documents", methods=["POST"])
def create_document():
    """POST /api/documents -> created document."""
    body = _parse_json_body()
    if not isinstance(body, dict):
        return body

    title = body.get("title", "")
    content_md = body.get("content_md", "")

    ok, err = _validate_title(title)
    if not ok:
        return err
    ok, err = _validate_content_md(content_md)
    if not ok:
        return err

    # Normalize missing values to empty strings so the repo signature is
    # always exercised consistently.
    doc = _repo().create_document(
        title=title or "", content_md=content_md or ""
    )
    response = jsonify({
        "id": doc["id"],
        "title": doc["title"],
        "content_md": doc["content_md"],
        "updated_at": doc["updated_at"],
    })
    response.status_code = 201
    return response


@api_bp.route("/documents/<doc_id>", methods=["GET"])
def get_document(doc_id):
    """GET /api/documents/<id> -> full document or 404."""
    doc = _repo().get_document(doc_id)
    if doc is None:
        return _error("Document not found", "NOT_FOUND", 404)
    return jsonify(doc)


@api_bp.route("/documents/<doc_id>", methods=["PATCH"])
def patch_document(doc_id):
    """PATCH /api/documents/<id> -> partially updated document or 404."""
    body = _parse_json_body()
    if not isinstance(body, dict):
        return body

    title = body.get("title")
    content_md = body.get("content_md")

    ok, err = _validate_title(title)
    if not ok:
        return err
    ok, err = _validate_content_md(content_md)
    if not ok:
        return err

    updated = _repo().update_document(
        doc_id, title=title, content_md=content_md
    )
    if updated is None:
        return _error("Document not found", "NOT_FOUND", 404)
    return jsonify({
        "id": updated["id"],
        "title": updated["title"],
        "content_md": updated["content_md"],
        "updated_at": updated["updated_at"],
    })


@api_bp.route("/documents/<doc_id>", methods=["DELETE"])
def delete_document(doc_id):
    """DELETE /api/documents/<id> -> 204 (or 404 if missing)."""
    existed = _repo().delete_document(doc_id)
    if not existed:
        return _error("Document not found", "NOT_FOUND", 404)
    return ("", 204)


# --- Version endpoints -------------------------------------------------------


@api_bp.route("/documents/<doc_id>/versions", methods=["GET"])
def list_versions(doc_id):
    """GET /api/documents/<id>/versions -> [{id, label, created_at}]."""
    if _repo().get_document(doc_id) is None:
        return _error("Document not found", "NOT_FOUND", 404)
    return jsonify(_repo().list_versions(doc_id))


@api_bp.route("/documents/<doc_id>/versions", methods=["POST"])
def create_version(doc_id):
    """POST /api/documents/<id>/versions -> created version summary."""
    body = _parse_json_body()
    if not isinstance(body, dict):
        return body

    label = body.get("label")
    ok, err = _validate_label(label)
    if not ok:
        return err

    version = _repo().create_version(doc_id, label=label)
    if version is None:
        return _error("Document not found", "NOT_FOUND", 404)
    response = jsonify(version)
    response.status_code = 201
    return response


@api_bp.route(
    "/documents/<doc_id>/versions/<version_id>/restore",
    methods=["POST"],
)
def restore_version(doc_id, version_id):
    """POST /api/documents/<id>/versions/<version_id>/restore -> document."""
    # This endpoint does not read a body, but we still enforce JSON
    # content-type when a body is present. An empty body (no
    # Content-Type header, zero-length) is accepted.
    if request.content_length and request.content_length > 0:
        body = _parse_json_body()
        if not isinstance(body, dict):
            return body

    doc = _repo().get_document(doc_id)
    if doc is None:
        return _error("Document not found", "NOT_FOUND", 404)
    restored = _repo().restore_version(doc_id, version_id)
    if restored is None:
        return _error("Version not found", "NOT_FOUND", 404)
    return jsonify({
        "id": restored["id"],
        "title": restored["title"],
        "content_md": restored["content_md"],
        "updated_at": restored["updated_at"],
    })


# --- Error handlers ----------------------------------------------------------


@api_bp.errorhandler(413)
def _too_large(_err):
    """Flask-level 413 (raw body exceeded ``MAX_CONTENT_LENGTH``)."""
    return _error(
        "Request body too large", "PAYLOAD_TOO_LARGE", 413
    )


@api_bp.errorhandler(415)
def _unsupported(_err):
    """Flask-level 415 fallback."""
    return _error(
        "Content-Type must be application/json",
        "UNSUPPORTED_MEDIA_TYPE",
        415,
    )
