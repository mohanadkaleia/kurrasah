"""
Unit tests for ``app.models.document_repo.DocumentRepository``.

Each test uses the ``repo`` fixture from conftest, which wires a
fresh migrated SQLite DB in a temp directory.
"""
import time


# ----------------------------------------------------------------------
# create_document
# ----------------------------------------------------------------------


def test_create_document_returns_full_dict(repo):
    doc = repo.create_document(title="hello", content_md="# Hi")
    assert set(doc.keys()) == {
        "id", "title", "content_md", "created_at", "updated_at",
    }
    assert doc["title"] == "hello"
    assert doc["content_md"] == "# Hi"
    assert doc["created_at"] == doc["updated_at"]
    # UUID strings are 36 chars
    assert isinstance(doc["id"], str) and len(doc["id"]) == 36


def test_create_document_defaults_empty(repo):
    doc = repo.create_document()
    assert doc["title"] == ""
    assert doc["content_md"] == ""


def test_create_document_arabic_roundtrip(repo):
    title = "\u0645\u0642\u0627\u0644"
    content = "# \u0645\u0631\u062d\u0628\u0627"
    doc = repo.create_document(title=title, content_md=content)
    loaded = repo.get_document(doc["id"])
    assert loaded["title"] == title
    assert loaded["content_md"] == content


# ----------------------------------------------------------------------
# get_document
# ----------------------------------------------------------------------


def test_get_document_missing_returns_none(repo):
    assert repo.get_document("nope") is None


def test_get_document_returns_full_row(repo):
    created = repo.create_document(title="t", content_md="body")
    loaded = repo.get_document(created["id"])
    assert loaded["id"] == created["id"]
    assert loaded["title"] == "t"
    assert loaded["content_md"] == "body"
    assert loaded["created_at"] == created["created_at"]
    assert loaded["updated_at"] == created["updated_at"]


# ----------------------------------------------------------------------
# list_documents
# ----------------------------------------------------------------------


def test_list_documents_empty(repo):
    assert repo.list_documents() == []


def test_list_documents_summary_fields_only(repo):
    repo.create_document(title="a", content_md="alpha")
    rows = repo.list_documents()
    assert len(rows) == 1
    assert set(rows[0].keys()) == {"id", "title", "updated_at"}


def test_list_documents_ordered_by_updated_at_desc(repo):
    first = repo.create_document(title="first")
    time.sleep(0.01)
    second = repo.create_document(title="second")
    time.sleep(0.01)
    # Bump first's updated_at after second
    repo.update_document(first["id"], content_md="bump")

    ids = [r["id"] for r in repo.list_documents()]
    assert ids == [first["id"], second["id"]]


# ----------------------------------------------------------------------
# update_document
# ----------------------------------------------------------------------


def test_update_document_missing_returns_none(repo):
    assert repo.update_document("nope", title="x") is None


def test_update_document_title_only(repo, seeded_doc):
    old_created = seeded_doc["created_at"]
    old_content = seeded_doc["content_md"]
    time.sleep(0.01)
    updated = repo.update_document(seeded_doc["id"], title="new")
    assert updated["title"] == "new"
    assert updated["content_md"] == old_content
    assert updated["created_at"] == old_created
    assert updated["updated_at"] > seeded_doc["updated_at"]


def test_update_document_content_only(repo, seeded_doc):
    updated = repo.update_document(
        seeded_doc["id"], content_md="new body"
    )
    assert updated["title"] == seeded_doc["title"]
    assert updated["content_md"] == "new body"


def test_update_document_both_fields(repo, seeded_doc):
    updated = repo.update_document(
        seeded_doc["id"], title="t2", content_md="c2"
    )
    assert updated["title"] == "t2"
    assert updated["content_md"] == "c2"


def test_update_document_no_fields_is_noop(repo, seeded_doc):
    time.sleep(0.01)
    updated = repo.update_document(seeded_doc["id"])
    assert updated == seeded_doc  # unchanged, including updated_at


def test_update_document_can_clear_title(repo, seeded_doc):
    updated = repo.update_document(seeded_doc["id"], title="")
    assert updated["title"] == ""


# ----------------------------------------------------------------------
# delete_document
# ----------------------------------------------------------------------


def test_delete_document_missing_returns_false(repo):
    assert repo.delete_document("nope") is False


def test_delete_document_returns_true_and_removes(repo, seeded_doc):
    assert repo.delete_document(seeded_doc["id"]) is True
    assert repo.get_document(seeded_doc["id"]) is None


def test_delete_document_cascades_versions(repo, seeded_doc):
    repo.create_version(seeded_doc["id"], label="v1")
    repo.create_version(seeded_doc["id"], label="v2")
    assert len(repo.list_versions(seeded_doc["id"])) == 2
    repo.delete_document(seeded_doc["id"])
    # After cascade the versions table has no rows for that doc
    assert repo.list_versions(seeded_doc["id"]) == []


# ----------------------------------------------------------------------
# list_versions
# ----------------------------------------------------------------------


def test_list_versions_empty(repo, seeded_doc):
    assert repo.list_versions(seeded_doc["id"]) == []


def test_list_versions_summary_fields_only(repo, seeded_doc):
    repo.create_version(seeded_doc["id"], label="v1")
    rows = repo.list_versions(seeded_doc["id"])
    assert len(rows) == 1
    assert set(rows[0].keys()) == {"id", "label", "created_at"}


def test_list_versions_orders_newest_first(repo, seeded_doc):
    v1 = repo.create_version(seeded_doc["id"], label="old")
    time.sleep(0.01)
    v2 = repo.create_version(seeded_doc["id"], label="mid")
    time.sleep(0.01)
    v3 = repo.create_version(seeded_doc["id"], label="new")

    labels = [r["label"] for r in repo.list_versions(seeded_doc["id"])]
    assert labels == ["new", "mid", "old"]
    ids = [r["id"] for r in repo.list_versions(seeded_doc["id"])]
    assert ids == [v3["id"], v2["id"], v1["id"]]


# ----------------------------------------------------------------------
# create_version
# ----------------------------------------------------------------------


def test_create_version_missing_doc_returns_none(repo):
    assert repo.create_version("nope", label="x") is None


def test_create_version_returns_summary(repo, seeded_doc):
    v = repo.create_version(seeded_doc["id"], label="v1")
    assert set(v.keys()) == {"id", "label", "created_at"}
    assert v["label"] == "v1"


def test_create_version_accepts_none_label(repo, seeded_doc):
    v = repo.create_version(seeded_doc["id"])
    assert v["label"] is None


def test_create_version_snapshots_current_content(repo, seeded_doc):
    repo.update_document(seeded_doc["id"], content_md="snapshot body")
    v = repo.create_version(seeded_doc["id"], label="snap")
    # Change doc after snapshot
    repo.update_document(seeded_doc["id"], content_md="mutated body")
    # Restore brings back the snapshot content
    restored = repo.restore_version(seeded_doc["id"], v["id"])
    assert restored["content_md"] == "snapshot body"


# ----------------------------------------------------------------------
# restore_version
# ----------------------------------------------------------------------


def test_restore_version_missing_doc_returns_none(repo):
    assert repo.restore_version("nope", "also-nope") is None


def test_restore_version_missing_version_returns_none(repo, seeded_doc):
    assert repo.restore_version(seeded_doc["id"], "missing") is None


def test_restore_version_from_other_doc_returns_none(repo):
    doc_a = repo.create_document(content_md="a-body")
    doc_b = repo.create_document(content_md="b-body")
    version_b = repo.create_version(doc_b["id"], label="b")
    # Attempting to restore doc_b's version through doc_a must fail
    assert repo.restore_version(doc_a["id"], version_b["id"]) is None


def test_restore_version_overwrites_and_bumps_updated_at(repo, seeded_doc):
    repo.update_document(seeded_doc["id"], content_md="first")
    v = repo.create_version(seeded_doc["id"], label="snap")
    time.sleep(0.01)
    repo.update_document(seeded_doc["id"], content_md="second")

    restored = repo.restore_version(seeded_doc["id"], v["id"])
    assert restored["content_md"] == "first"
    assert restored["updated_at"] > v["created_at"]

    fresh = repo.get_document(seeded_doc["id"])
    assert fresh["content_md"] == "first"
