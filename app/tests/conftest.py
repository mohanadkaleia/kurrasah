"""
Shared fixtures for the backend tests.

Every test that needs the database gets a freshly migrated SQLite file
in a temp directory, so tests are fully isolated. The ``client``
fixture exposes a Flask test client rooted at the same temp DB, so
API tests exercise the real blueprint wiring.
"""
import os
import tempfile

import pytest

from app.main import create_app
from app.models.document_repo import DocumentRepository
from db.db import DatabaseManager


@pytest.fixture
def db():
    """A temporary SQLite database with migrations applied."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test.db")
        database = DatabaseManager(db_path)
        database.run_migrations()
        yield database
        database.close()


@pytest.fixture
def repo(db):
    """A DocumentRepository backed by the temporary database fixture."""
    return DocumentRepository(db)


@pytest.fixture
def seeded_doc(repo):
    """A plain pre-existing markdown document."""
    return repo.create_document(
        title="Seeded",
        content_md="# Hello\n\nparagraph.",
    )


@pytest.fixture
def arabic_doc(repo):
    """A pre-existing document with Arabic content for RTL tests."""
    return repo.create_document(
        title="\u0645\u0642\u0627\u0644 \u062a\u062c\u0631\u064a\u0628\u064a",
        content_md=(
            "# \u0645\u0631\u062d\u0628\u0627\n\n"
            "\u0647\u0630\u0647 \u0641\u0642\u0631\u0629 "
            "\u062a\u062c\u0631\u064a\u0628\u064a\u0629."
        ),
    )


@pytest.fixture
def client():
    """
    A Flask test client backed by a fresh migrated DB in a temp dir.

    Yields the test client; tears down the app/db on exit.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test.db")
        app = create_app(db_path=db_path)
        app.testing = True
        with app.test_client() as test_client:
            yield test_client
        app.config["db"].close()
