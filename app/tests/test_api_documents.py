"""
REST API tests for ``app/api/documents.py``.

Each test hits the Flask blueprint via the ``client`` fixture (see
conftest). Tests cover one happy path plus at least one error path
per endpoint, plus an Arabic roundtrip and the end-to-end flow.
"""
import json


# ----------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------


def _post_json(client, path, payload):
    return client.post(
        path,
        data=json.dumps(payload),
        content_type="application/json",
    )


def _patch_json(client, path, payload):
    return client.patch(
        path,
        data=json.dumps(payload),
        content_type="application/json",
    )


def _create_doc(client, **body):
    resp = _post_json(client, "/api/documents", body)
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()


# ----------------------------------------------------------------------
# GET /api/documents
# ----------------------------------------------------------------------


def test_list_documents_empty(client):
    resp = client.get("/api/documents")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_list_documents_summary_fields(client):
    _create_doc(client, title="a", content_md="body")
    resp = client.get("/api/documents")
    assert resp.status_code == 200
    rows = resp.get_json()
    assert len(rows) == 1
    assert set(rows[0].keys()) == {"id", "title", "updated_at"}


# ----------------------------------------------------------------------
# POST /api/documents
# ----------------------------------------------------------------------


def test_create_document_happy(client):
    resp = _post_json(
        client,
        "/api/documents",
        {"title": "hi", "content_md": "# Hi"},
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["title"] == "hi"
    assert body["content_md"] == "# Hi"
    assert "id" in body and "updated_at" in body


def test_create_document_no_content_type_is_415(client):
    resp = client.post(
        "/api/documents",
        data='{"title":"x"}',
    )
    assert resp.status_code == 415
    assert resp.get_json()["code"] == "UNSUPPORTED_MEDIA_TYPE"


def test_create_document_text_plain_is_415(client):
    resp = client.post(
        "/api/documents",
        data='{"title":"x"}',
        content_type="text/plain",
    )
    assert resp.status_code == 415


def test_create_document_malformed_json_is_400(client):
    resp = client.post(
        "/api/documents",
        data="{bad json",
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert resp.get_json()["code"] == "INVALID_INPUT"


def test_create_document_non_object_body_is_400(client):
    resp = client.post(
        "/api/documents",
        data="[1,2,3]",
        content_type="application/json",
    )
    assert resp.status_code == 400
    assert resp.get_json()["code"] == "INVALID_INPUT"


def test_create_document_title_too_long_is_400(client):
    resp = _post_json(
        client,
        "/api/documents",
        {"title": "x" * 501, "content_md": ""},
    )
    assert resp.status_code == 400
    assert resp.get_json()["code"] == "INVALID_INPUT"


def test_create_document_content_too_large_is_413(client):
    big = "a" * (1_048_576 + 1)
    resp = _post_json(
        client,
        "/api/documents",
        {"title": "x", "content_md": big},
    )
    assert resp.status_code == 413
    assert resp.get_json()["code"] == "PAYLOAD_TOO_LARGE"


def test_create_document_raw_body_too_large_is_413(client):
    # Exceed Flask's MAX_CONTENT_LENGTH cap directly (not via a field).
    raw = "a" * (1_048_576 + 32 * 1024)
    resp = client.post(
        "/api/documents",
        data=raw,
        content_type="application/json",
    )
    assert resp.status_code == 413
    assert resp.get_json()["code"] == "PAYLOAD_TOO_LARGE"


def test_create_document_non_string_title_is_400(client):
    resp = _post_json(
        client,
        "/api/documents",
        {"title": 123, "content_md": ""},
    )
    assert resp.status_code == 400


def test_create_document_arabic_roundtrip(client):
    title = "\u0645\u0642\u0627\u0644"
    content = "# \u0645\u0631\u062d\u0628\u0627"
    resp = _post_json(
        client,
        "/api/documents",
        {"title": title, "content_md": content},
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["title"] == title
    assert body["content_md"] == content

    got = client.get(f"/api/documents/{body['id']}").get_json()
    assert got["title"] == title
    assert got["content_md"] == content


# ----------------------------------------------------------------------
# GET /api/documents/<id>
# ----------------------------------------------------------------------


def test_get_document_happy(client):
    doc = _create_doc(client, title="t", content_md="c")
    resp = client.get(f"/api/documents/{doc['id']}")
    assert resp.status_code == 200
    body = resp.get_json()
    assert set(body.keys()) == {
        "id", "title", "content_md", "created_at", "updated_at",
    }
    assert body["title"] == "t"
    assert body["content_md"] == "c"


def test_get_document_missing_is_404(client):
    resp = client.get("/api/documents/does-not-exist")
    assert resp.status_code == 404
    assert resp.get_json()["code"] == "NOT_FOUND"


# ----------------------------------------------------------------------
# PATCH /api/documents/<id>
# ----------------------------------------------------------------------


def test_patch_document_happy(client):
    doc = _create_doc(client, title="t", content_md="c")
    resp = _patch_json(
        client, f"/api/documents/{doc['id']}", {"title": "t2"}
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["title"] == "t2"
    assert body["content_md"] == "c"
    assert body["updated_at"] >= doc["updated_at"]


def test_patch_document_missing_is_404(client):
    resp = _patch_json(client, "/api/documents/missing", {"title": "x"})
    assert resp.status_code == 404
    assert resp.get_json()["code"] == "NOT_FOUND"


def test_patch_document_wrong_content_type_is_415(client):
    doc = _create_doc(client, title="t", content_md="c")
    resp = client.patch(
        f"/api/documents/{doc['id']}",
        data='{"title":"x"}',
        content_type="text/plain",
    )
    assert resp.status_code == 415


def test_patch_document_title_too_long_is_400(client):
    doc = _create_doc(client, title="t", content_md="c")
    resp = _patch_json(
        client, f"/api/documents/{doc['id']}", {"title": "x" * 501}
    )
    assert resp.status_code == 400


def test_patch_document_content_too_large_is_413(client):
    doc = _create_doc(client, title="t", content_md="c")
    big = "a" * (1_048_576 + 1)
    resp = _patch_json(
        client, f"/api/documents/{doc['id']}", {"content_md": big}
    )
    assert resp.status_code == 413


# ----------------------------------------------------------------------
# DELETE /api/documents/<id>
# ----------------------------------------------------------------------


def test_delete_document_happy_is_204(client):
    doc = _create_doc(client, title="t", content_md="c")
    resp = client.delete(f"/api/documents/{doc['id']}")
    assert resp.status_code == 204
    # Body should be empty; also document should be gone
    assert client.get(f"/api/documents/{doc['id']}").status_code == 404


def test_delete_document_missing_is_404(client):
    resp = client.delete("/api/documents/missing")
    assert resp.status_code == 404


# ----------------------------------------------------------------------
# GET /api/documents/<id>/versions
# ----------------------------------------------------------------------


def test_list_versions_empty_for_existing_doc(client):
    doc = _create_doc(client, title="t", content_md="c")
    resp = client.get(f"/api/documents/{doc['id']}/versions")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_list_versions_missing_doc_is_404(client):
    resp = client.get("/api/documents/missing/versions")
    assert resp.status_code == 404


# ----------------------------------------------------------------------
# POST /api/documents/<id>/versions
# ----------------------------------------------------------------------


def test_create_version_happy(client):
    doc = _create_doc(client, title="t", content_md="c")
    resp = _post_json(
        client,
        f"/api/documents/{doc['id']}/versions",
        {"label": "v1"},
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert set(body.keys()) == {"id", "label", "created_at"}
    assert body["label"] == "v1"


def test_create_version_missing_doc_is_404(client):
    resp = _post_json(
        client, "/api/documents/missing/versions", {"label": "v1"}
    )
    assert resp.status_code == 404


def test_create_version_label_too_long_is_400(client):
    doc = _create_doc(client, title="t", content_md="c")
    resp = _post_json(
        client,
        f"/api/documents/{doc['id']}/versions",
        {"label": "x" * 201},
    )
    assert resp.status_code == 400


def test_create_version_wrong_content_type_is_415(client):
    doc = _create_doc(client, title="t", content_md="c")
    resp = client.post(
        f"/api/documents/{doc['id']}/versions",
        data='{"label":"v"}',
        content_type="text/plain",
    )
    assert resp.status_code == 415


# ----------------------------------------------------------------------
# POST /api/documents/<id>/versions/<vid>/restore
# ----------------------------------------------------------------------


def test_restore_version_happy(client):
    doc = _create_doc(client, title="t", content_md="original")
    v = _post_json(
        client,
        f"/api/documents/{doc['id']}/versions",
        {"label": "snap"},
    ).get_json()

    # Mutate the doc
    _patch_json(
        client, f"/api/documents/{doc['id']}", {"content_md": "mutated"}
    )
    # Restore
    resp = client.post(
        f"/api/documents/{doc['id']}/versions/{v['id']}/restore"
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["content_md"] == "original"
    assert set(body.keys()) == {"id", "title", "content_md", "updated_at"}

    got = client.get(f"/api/documents/{doc['id']}").get_json()
    assert got["content_md"] == "original"


def test_restore_version_missing_doc_is_404(client):
    resp = client.post(
        "/api/documents/missing/versions/also-missing/restore"
    )
    assert resp.status_code == 404


def test_restore_version_missing_version_is_404(client):
    doc = _create_doc(client, title="t", content_md="c")
    resp = client.post(
        f"/api/documents/{doc['id']}/versions/ghost/restore"
    )
    assert resp.status_code == 404


# ----------------------------------------------------------------------
# End-to-end happy path
# ----------------------------------------------------------------------


def test_full_happy_path(client):
    # create
    doc = _create_doc(client, title="t", content_md="first")
    doc_id = doc["id"]

    # get
    got = client.get(f"/api/documents/{doc_id}").get_json()
    assert got["content_md"] == "first"

    # patch
    patched = _patch_json(
        client, f"/api/documents/{doc_id}", {"content_md": "second"}
    ).get_json()
    assert patched["content_md"] == "second"

    # list versions (empty)
    listed = client.get(f"/api/documents/{doc_id}/versions").get_json()
    assert listed == []

    # create version of "second"
    v = _post_json(
        client,
        f"/api/documents/{doc_id}/versions",
        {"label": "after-second"},
    ).get_json()

    # patch to "third"
    _patch_json(
        client, f"/api/documents/{doc_id}", {"content_md": "third"}
    )
    assert (
        client.get(f"/api/documents/{doc_id}").get_json()["content_md"]
        == "third"
    )

    # restore -> content becomes "second" again
    restored = client.post(
        f"/api/documents/{doc_id}/versions/{v['id']}/restore"
    ).get_json()
    assert restored["content_md"] == "second"

    # delete
    resp = client.delete(f"/api/documents/{doc_id}")
    assert resp.status_code == 204
    assert client.get(f"/api/documents/{doc_id}").status_code == 404
