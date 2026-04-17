# Session: AST-First Collaborative Writing Engine

- **Session ID**: AST-EDITOR-001
- **Date**: 2026-04-12
- **Task**: Implement the core AI-Native Collaborative Writing Engine with AST-first architecture, including backend AST model, operations engine, Markdown parser/serializer, GraphQL API, database persistence, and a Vue 3 editor frontend with RTL support.
- **Participants**: tech-lead, python-engineer, ui-engineer, code-reviewer, security-reviewer
- **Scope**: Full-stack (backend + frontend + database) -- greenfield implementation
- **Definition of Done**:
  1. AST model supports all required node types (document, paragraph, heading, list, list_item, code_block, blockquote)
  2. Operations engine correctly executes InsertNode, DeleteNode, UpdateText, ReplaceNode, MoveNode with validation
  3. Operation log supports append, replay, and snapshot/restore
  4. Markdown-to-AST and AST-to-Markdown conversion works correctly for all node types
  5. GraphQL API exposes document CRUD, operations, and version history
  6. SQLite database persists documents, operations, and versions
  7. Vue 3 editor renders AST to DOM with node-aware cursor and text editing
  8. All UI works in RTL layout for Arabic text
  9. Backend unit tests pass with good coverage
  10. Playwright e2e tests validate editor interactions
- **Status**: Phase 6 -- Frontend Editor Implementation (In Progress)

---

## Implementation Plan

### Project Scaffolding

Before any feature work, the project directories and configuration files must be created. This is Phase 0 work.

**Root files to create:**
- `/Users/mohanad/Workspace/editor/package.json` -- monorepo root with scripts for `ui:check`, `ui:debug`, `ui:clean`
- `/Users/mohanad/Workspace/editor/requirements.txt` -- Python dependencies
- `/Users/mohanad/Workspace/editor/.gitignore`

**Backend scaffolding (`app/`):**
- `app/__init__.py`
- `app/main.py` -- Flask app factory with Strawberry GraphQL endpoint
- `app/gql/__init__.py`
- `app/gql/schema.py` -- Strawberry schema root (Query + Mutation)
- `app/gql/queries/__init__.py`
- `app/gql/mutations/__init__.py`
- `app/gql/types.py` -- GraphQL type definitions
- `app/models/__init__.py`
- `app/libs/__init__.py`
- `app/tests/__init__.py`
- `app/tests/conftest.py` -- pytest fixtures

**Database scaffolding (`db/`):**
- `db/__init__.py`
- `db/db.py` -- DatabaseManager class
- `db/migrations/` -- migration directory

**Frontend scaffolding (`web/`):**
- Standard Vite + Vue 3 + Tailwind CSS project via `npm create vite@latest`
- `web/src/components/editor/` -- editor component directory
- `web/src/composables/` -- composable directory
- `web/src/views/` -- view directory
- `web/src/router/` -- router directory

**E2E test scaffolding:**
- `e2e/` -- Playwright test directory

---

### BACKEND PLAN

#### B1. AST Schema Design (`app/models/ast.py`)

**File to create**: `app/models/ast.py`

The AST is the source of truth for all documents. Every node in the document tree is represented as a Python dataclass. We use dataclasses (not Pydantic) to keep dependencies minimal and match the lightweight SQLite approach. Validation is done via explicit class methods.

**Base node:**

```python
# app/models/ast.py
from __future__ import annotations
import uuid
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class NodeType(str, Enum):
    DOCUMENT = "document"
    PARAGRAPH = "paragraph"
    HEADING = "heading"
    LIST = "list"
    LIST_ITEM = "list_item"
    CODE_BLOCK = "code_block"
    BLOCKQUOTE = "blockquote"


class ListKind(str, Enum):
    ORDERED = "ordered"
    UNORDERED = "unordered"


@dataclass
class NodeMetadata:
    """Optional metadata attached to any node."""
    created_at: Optional[str] = None       # ISO 8601 timestamp
    updated_at: Optional[str] = None       # ISO 8601 timestamp
    created_by: Optional[str] = None       # user ID or "ai_agent"
    language: Optional[str] = None         # e.g. "ar", "en"
    custom: dict = field(default_factory=dict)


def generate_node_id() -> str:
    """Generate a unique node ID with 'node_' prefix."""
    return f"node_{uuid.uuid4().hex[:12]}"


def generate_doc_id() -> str:
    """Generate a unique document ID with 'doc_' prefix."""
    return f"doc_{uuid.uuid4().hex[:12]}"


@dataclass
class ASTNode:
    """Base class for all AST nodes."""
    id: str
    type: NodeType
    children: list[ASTNode] = field(default_factory=list)
    text: Optional[str] = None
    metadata: Optional[NodeMetadata] = None

    # Type-specific fields (only populated for certain node types)
    level: Optional[int] = None            # heading: 1-6
    list_kind: Optional[ListKind] = None   # list: ordered/unordered
    language_hint: Optional[str] = None    # code_block: language for syntax highlighting

    def find_node(self, node_id: str) -> Optional[ASTNode]:
        """Recursively find a node by ID in this subtree."""
        if self.id == node_id:
            return self
        for child in self.children:
            result = child.find_node(node_id)
            if result is not None:
                return result
        return None

    def find_parent(self, node_id: str) -> Optional[ASTNode]:
        """Find the parent of a node by ID. Returns None if node_id is this node or not found."""
        for child in self.children:
            if child.id == node_id:
                return self
            result = child.find_parent(node_id)
            if result is not None:
                return result
        return None

    def depth(self) -> int:
        """Return the depth of this subtree."""
        if not self.children:
            return 0
        return 1 + max(child.depth() for child in self.children)

    def node_count(self) -> int:
        """Return total number of nodes in this subtree (including self)."""
        return 1 + sum(child.node_count() for child in self.children)

    def to_dict(self) -> dict:
        """Serialize this node (and subtree) to a dictionary."""
        result = {
            "id": self.id,
            "type": self.type.value,
        }
        if self.text is not None:
            result["text"] = self.text
        if self.children:
            result["children"] = [child.to_dict() for child in self.children]
        if self.level is not None:
            result["level"] = self.level
        if self.list_kind is not None:
            result["list_kind"] = self.list_kind.value
        if self.language_hint is not None:
            result["language_hint"] = self.language_hint
        if self.metadata is not None:
            result["metadata"] = {
                "created_at": self.metadata.created_at,
                "updated_at": self.metadata.updated_at,
                "created_by": self.metadata.created_by,
                "language": self.metadata.language,
                "custom": self.metadata.custom,
            }
        return result

    @classmethod
    def from_dict(cls, data: dict) -> ASTNode:
        """Deserialize a dictionary into an ASTNode tree."""
        metadata = None
        if "metadata" in data and data["metadata"]:
            md = data["metadata"]
            metadata = NodeMetadata(
                created_at=md.get("created_at"),
                updated_at=md.get("updated_at"),
                created_by=md.get("created_by"),
                language=md.get("language"),
                custom=md.get("custom", {}),
            )
        children = [cls.from_dict(c) for c in data.get("children", [])]
        list_kind = None
        if "list_kind" in data and data["list_kind"]:
            list_kind = ListKind(data["list_kind"])
        return cls(
            id=data["id"],
            type=NodeType(data["type"]),
            children=children,
            text=data.get("text"),
            metadata=metadata,
            level=data.get("level"),
            list_kind=list_kind,
            language_hint=data.get("language_hint"),
        )
```

**Validation rules** (implement as `validate()` method on ASTNode):
- `document` nodes: must have `type=DOCUMENT`, must not have `text`, must not be nested inside other nodes
- `heading` nodes: `level` must be 1-6, must have `text`, must not have children
- `paragraph` nodes: must have `text`, must not have children
- `list` nodes: must have `list_kind`, children must all be `list_item` type
- `list_item` nodes: must have `text`, may have children (for nested lists)
- `code_block` nodes: must have `text`, must not have children
- `blockquote` nodes: must have children (paragraphs, etc.), may have `text`

**Factory functions** (at module level):

```python
def create_document(title: Optional[str] = None) -> ASTNode:
    """Create a new empty document with optional title heading."""
    doc = ASTNode(id=generate_doc_id(), type=NodeType.DOCUMENT)
    if title:
        heading = ASTNode(
            id=generate_node_id(),
            type=NodeType.HEADING,
            text=title,
            level=1,
        )
        doc.children.append(heading)
    return doc

def create_paragraph(text: str) -> ASTNode:
    return ASTNode(id=generate_node_id(), type=NodeType.PARAGRAPH, text=text)

def create_heading(text: str, level: int) -> ASTNode:
    assert 1 <= level <= 6
    return ASTNode(id=generate_node_id(), type=NodeType.HEADING, text=text, level=level)

def create_list(kind: ListKind, items: list[str]) -> ASTNode:
    list_node = ASTNode(id=generate_node_id(), type=NodeType.LIST, list_kind=kind)
    for item_text in items:
        list_node.children.append(
            ASTNode(id=generate_node_id(), type=NodeType.LIST_ITEM, text=item_text)
        )
    return list_node

def create_code_block(text: str, language: Optional[str] = None) -> ASTNode:
    return ASTNode(id=generate_node_id(), type=NodeType.CODE_BLOCK, text=text, language_hint=language)

def create_blockquote(children: list[ASTNode]) -> ASTNode:
    return ASTNode(id=generate_node_id(), type=NodeType.BLOCKQUOTE, children=children)
```

**Tests for AST model** (`app/tests/test_ast_model.py`):
- Test creating each node type with factory functions
- Test `to_dict()` / `from_dict()` round-trip for every node type
- Test `find_node()` at various depths
- Test `find_parent()` returns correct parent
- Test `validate()` catches invalid configurations (e.g., heading with level=0, list with non-list_item children)
- Test `node_count()` and `depth()` for various tree shapes

---

#### B2. Operations Engine (`app/models/operations.py`)

**File to create**: `app/models/operations.py`

All edits to a document are represented as immutable operation objects. The operations engine applies these to an AST and maintains an append-only operation log.

**Operation types:**

```python
# app/models/operations.py
from __future__ import annotations
import json
import time
from dataclasses import dataclass, field
from typing import Optional, Union
from enum import Enum

from app.models.ast import ASTNode, NodeType


class OpType(str, Enum):
    INSERT_NODE = "insert_node"
    DELETE_NODE = "delete_node"
    UPDATE_TEXT = "update_text"
    REPLACE_NODE = "replace_node"
    MOVE_NODE = "move_node"


@dataclass
class Operation:
    """Base operation class. All fields are present; only relevant ones are populated per op_type."""
    op_type: OpType
    timestamp: float = field(default_factory=time.time)
    actor: str = "user"                     # "user" or agent identifier

    # InsertNode fields
    parent_id: Optional[str] = None         # target parent node ID
    position: Optional[int] = None          # index within parent's children
    node: Optional[ASTNode] = None          # the node to insert (for InsertNode)

    # DeleteNode fields
    node_id: Optional[str] = None           # target node ID (DeleteNode, UpdateText, ReplaceNode, MoveNode)

    # UpdateText fields
    offset: Optional[int] = None            # character offset in text
    new_text: Optional[str] = None          # text to insert/replace at offset
    delete_count: Optional[int] = None      # number of chars to delete at offset before inserting new_text

    # ReplaceNode fields
    new_node: Optional[ASTNode] = None      # replacement node (for ReplaceNode)

    # MoveNode fields
    new_parent_id: Optional[str] = None     # target parent for MoveNode
    new_position: Optional[int] = None      # target position for MoveNode

    def to_dict(self) -> dict:
        """Serialize operation to dictionary for storage."""
        result = {
            "op_type": self.op_type.value,
            "timestamp": self.timestamp,
            "actor": self.actor,
        }
        if self.parent_id is not None:
            result["parent_id"] = self.parent_id
        if self.position is not None:
            result["position"] = self.position
        if self.node is not None:
            result["node"] = self.node.to_dict()
        if self.node_id is not None:
            result["node_id"] = self.node_id
        if self.offset is not None:
            result["offset"] = self.offset
        if self.new_text is not None:
            result["new_text"] = self.new_text
        if self.delete_count is not None:
            result["delete_count"] = self.delete_count
        if self.new_node is not None:
            result["new_node"] = self.new_node.to_dict()
        if self.new_parent_id is not None:
            result["new_parent_id"] = self.new_parent_id
        if self.new_position is not None:
            result["new_position"] = self.new_position
        return result

    @classmethod
    def from_dict(cls, data: dict) -> Operation:
        """Deserialize from dictionary."""
        node = ASTNode.from_dict(data["node"]) if "node" in data else None
        new_node = ASTNode.from_dict(data["new_node"]) if "new_node" in data else None
        return cls(
            op_type=OpType(data["op_type"]),
            timestamp=data.get("timestamp", time.time()),
            actor=data.get("actor", "user"),
            parent_id=data.get("parent_id"),
            position=data.get("position"),
            node=node,
            node_id=data.get("node_id"),
            offset=data.get("offset"),
            new_text=data.get("new_text"),
            delete_count=data.get("delete_count"),
            new_node=new_node,
            new_parent_id=data.get("new_parent_id"),
            new_position=data.get("new_position"),
        )
```

**Operation factory functions** (for clean API):

```python
def insert_node(parent_id: str, position: int, node: ASTNode, actor: str = "user") -> Operation:
    return Operation(op_type=OpType.INSERT_NODE, parent_id=parent_id, position=position, node=node, actor=actor)

def delete_node(node_id: str, actor: str = "user") -> Operation:
    return Operation(op_type=OpType.DELETE_NODE, node_id=node_id, actor=actor)

def update_text(node_id: str, offset: int, new_text: str, delete_count: int = 0, actor: str = "user") -> Operation:
    return Operation(op_type=OpType.UPDATE_TEXT, node_id=node_id, offset=offset, new_text=new_text, delete_count=delete_count, actor=actor)

def replace_node(node_id: str, new_node: ASTNode, actor: str = "user") -> Operation:
    return Operation(op_type=OpType.REPLACE_NODE, node_id=node_id, new_node=new_node, actor=actor)

def move_node(node_id: str, new_parent_id: str, new_position: int, actor: str = "user") -> Operation:
    return Operation(op_type=OpType.MOVE_NODE, node_id=node_id, new_parent_id=new_parent_id, new_position=new_position, actor=actor)
```

**OperationsEngine** class (`app/models/operations.py`):

```python
class OperationError(Exception):
    """Raised when an operation cannot be applied."""
    pass


class OperationsEngine:
    """
    Applies operations to an AST document. Maintains an append-only operation log.
    The engine validates each operation before applying it, and raises OperationError
    if the operation is invalid.
    """

    def __init__(self, document: ASTNode):
        if document.type != NodeType.DOCUMENT:
            raise OperationError("OperationsEngine requires a document node as root")
        self.document = document
        self.operations: list[Operation] = []

    def apply(self, op: Operation) -> ASTNode:
        """Apply a single operation to the document. Returns the modified document."""
        handler = {
            OpType.INSERT_NODE: self._apply_insert,
            OpType.DELETE_NODE: self._apply_delete,
            OpType.UPDATE_TEXT: self._apply_update_text,
            OpType.REPLACE_NODE: self._apply_replace,
            OpType.MOVE_NODE: self._apply_move,
        }.get(op.op_type)

        if handler is None:
            raise OperationError(f"Unknown operation type: {op.op_type}")

        handler(op)
        self.operations.append(op)
        return self.document

    def apply_batch(self, ops: list[Operation]) -> ASTNode:
        """Apply multiple operations in order."""
        for op in ops:
            self.apply(op)
        return self.document

    def _apply_insert(self, op: Operation) -> None:
        """InsertNode: Insert op.node as a child of op.parent_id at op.position."""
        if op.parent_id is None or op.node is None:
            raise OperationError("InsertNode requires parent_id and node")
        if op.position is None:
            raise OperationError("InsertNode requires position")
        parent = self.document.find_node(op.parent_id)
        if parent is None:
            raise OperationError(f"Parent node not found: {op.parent_id}")
        # Validate: parent must be a container type (document, list, list_item, blockquote)
        if parent.type not in (NodeType.DOCUMENT, NodeType.LIST, NodeType.LIST_ITEM, NodeType.BLOCKQUOTE):
            raise OperationError(f"Cannot insert child into node of type {parent.type.value}")
        # Validate position bounds (allow appending at end)
        if op.position < 0 or op.position > len(parent.children):
            raise OperationError(f"Position {op.position} out of bounds for parent with {len(parent.children)} children")
        # Validate: if parent is LIST, child must be LIST_ITEM
        if parent.type == NodeType.LIST and op.node.type != NodeType.LIST_ITEM:
            raise OperationError("Children of a list node must be list_item nodes")
        # Check that inserted node ID does not already exist
        if self.document.find_node(op.node.id) is not None:
            raise OperationError(f"Node ID already exists: {op.node.id}")
        parent.children.insert(op.position, op.node)

    def _apply_delete(self, op: Operation) -> None:
        """DeleteNode: Remove the node with op.node_id from the tree."""
        if op.node_id is None:
            raise OperationError("DeleteNode requires node_id")
        if op.node_id == self.document.id:
            raise OperationError("Cannot delete the document root node")
        parent = self.document.find_parent(op.node_id)
        if parent is None:
            raise OperationError(f"Node not found: {op.node_id}")
        parent.children = [c for c in parent.children if c.id != op.node_id]

    def _apply_update_text(self, op: Operation) -> None:
        """UpdateText: Modify the text of node op.node_id at op.offset."""
        if op.node_id is None or op.new_text is None:
            raise OperationError("UpdateText requires node_id and new_text")
        if op.offset is None:
            raise OperationError("UpdateText requires offset")
        node = self.document.find_node(op.node_id)
        if node is None:
            raise OperationError(f"Node not found: {op.node_id}")
        if node.text is None:
            raise OperationError(f"Node {op.node_id} has no text to update")
        # Validate offset
        if op.offset < 0 or op.offset > len(node.text):
            raise OperationError(f"Offset {op.offset} out of bounds for text of length {len(node.text)}")
        delete_count = op.delete_count or 0
        if delete_count < 0:
            raise OperationError("delete_count must be non-negative")
        if op.offset + delete_count > len(node.text):
            raise OperationError(f"delete_count {delete_count} exceeds text length from offset {op.offset}")
        # Apply: delete `delete_count` chars at offset, then insert new_text
        before = node.text[:op.offset]
        after = node.text[op.offset + delete_count:]
        node.text = before + op.new_text + after

    def _apply_replace(self, op: Operation) -> None:
        """ReplaceNode: Replace node op.node_id with op.new_node."""
        if op.node_id is None or op.new_node is None:
            raise OperationError("ReplaceNode requires node_id and new_node")
        if op.node_id == self.document.id:
            raise OperationError("Cannot replace the document root node")
        parent = self.document.find_parent(op.node_id)
        if parent is None:
            raise OperationError(f"Node not found: {op.node_id}")
        for i, child in enumerate(parent.children):
            if child.id == op.node_id:
                parent.children[i] = op.new_node
                return
        raise OperationError(f"Node not found in parent's children: {op.node_id}")

    def _apply_move(self, op: Operation) -> None:
        """MoveNode: Move node op.node_id to op.new_parent_id at op.new_position."""
        if op.node_id is None or op.new_parent_id is None:
            raise OperationError("MoveNode requires node_id and new_parent_id")
        if op.new_position is None:
            raise OperationError("MoveNode requires new_position")
        if op.node_id == self.document.id:
            raise OperationError("Cannot move the document root node")
        # Find and remove node from current parent
        current_parent = self.document.find_parent(op.node_id)
        if current_parent is None:
            raise OperationError(f"Node not found: {op.node_id}")
        node_to_move = None
        for i, child in enumerate(current_parent.children):
            if child.id == op.node_id:
                node_to_move = current_parent.children.pop(i)
                break
        if node_to_move is None:
            raise OperationError(f"Node not found in parent's children: {op.node_id}")
        # Prevent moving a node into its own subtree
        if node_to_move.find_node(op.new_parent_id) is not None:
            # Undo the removal before raising
            current_parent.children.insert(i, node_to_move)
            raise OperationError("Cannot move a node into its own subtree")
        # Find new parent and insert
        new_parent = self.document.find_node(op.new_parent_id)
        if new_parent is None:
            # Undo the removal before raising
            current_parent.children.insert(i, node_to_move)
            raise OperationError(f"New parent node not found: {op.new_parent_id}")
        # Validate position bounds
        if op.new_position < 0 or op.new_position > len(new_parent.children):
            current_parent.children.insert(i, node_to_move)
            raise OperationError(f"Position {op.new_position} out of bounds")
        new_parent.children.insert(op.new_position, node_to_move)

    def get_operation_log(self) -> list[dict]:
        """Return the operation log as a list of serialized operations."""
        return [op.to_dict() for op in self.operations]

    def replay(self, document: ASTNode, ops: list[Operation]) -> ASTNode:
        """Replay a list of operations on a fresh document."""
        engine = OperationsEngine(document)
        engine.apply_batch(ops)
        return engine.document
```

**Tests for operations** (`app/tests/test_operations.py`):
- `test_insert_node_at_beginning` -- insert at position 0
- `test_insert_node_at_end` -- insert at position len(children)
- `test_insert_node_at_middle` -- insert at arbitrary position
- `test_insert_node_invalid_parent` -- parent_id not found, expect OperationError
- `test_insert_node_duplicate_id` -- node ID already exists, expect OperationError
- `test_insert_node_into_non_container` -- insert into paragraph, expect OperationError
- `test_insert_list_item_into_list` -- valid
- `test_insert_non_list_item_into_list` -- expect OperationError
- `test_delete_node_basic` -- delete a child node
- `test_delete_node_root` -- attempt to delete document root, expect OperationError
- `test_delete_node_not_found` -- node_id not in tree, expect OperationError
- `test_update_text_insert` -- insert text at offset with delete_count=0
- `test_update_text_replace` -- replace text at offset with delete_count>0
- `test_update_text_invalid_offset` -- offset out of bounds
- `test_update_text_on_non_text_node` -- node has no text field
- `test_replace_node_basic` -- replace paragraph with heading
- `test_replace_node_root` -- attempt to replace root, expect error
- `test_move_node_basic` -- move node to different parent
- `test_move_node_into_own_subtree` -- expect OperationError
- `test_move_node_same_parent` -- reorder within same parent
- `test_operation_log` -- verify ops are recorded in order
- `test_replay` -- replay operation log on fresh document, verify same result
- `test_apply_batch` -- apply multiple operations in sequence

---

#### B3. Markdown Parser (`app/libs/markdown_parser.py`)

**File to create**: `app/libs/markdown_parser.py`

Converts Markdown text to an AST document. Uses Python's `markdown-it-py` library for parsing Markdown into tokens, then converts those tokens into our AST nodes. `markdown-it-py` is chosen because it is a well-maintained, CommonMark-compliant parser that produces a token stream (not HTML), making it ideal for AST construction.

**Dependency**: Add `markdown-it-py>=3.0.0` to `requirements.txt`

```python
# app/libs/markdown_parser.py
from markdown_it import MarkdownIt
from app.models.ast import (
    ASTNode, NodeType, ListKind,
    generate_doc_id, generate_node_id,
    create_document, create_paragraph, create_heading,
    create_code_block,
)


class MarkdownParser:
    """Converts Markdown text into an AST document."""

    def __init__(self):
        self.md = MarkdownIt("commonmark")

    def parse(self, markdown_text: str) -> ASTNode:
        """Parse Markdown text and return an AST document node."""
        tokens = self.md.parse(markdown_text)
        doc = ASTNode(id=generate_doc_id(), type=NodeType.DOCUMENT)
        self._process_tokens(tokens, doc)
        return doc

    def _process_tokens(self, tokens: list, parent: ASTNode) -> None:
        """
        Process markdown-it tokens into AST nodes.
        
        markdown-it produces token triples like:
          heading_open -> inline -> heading_close
          paragraph_open -> inline -> paragraph_close
          bullet_list_open -> list_item_open -> ... -> list_item_close -> bullet_list_close
          fence (code block - single token)
          blockquote_open -> ... -> blockquote_close
        """
        i = 0
        while i < len(tokens):
            token = tokens[i]

            if token.type == "heading_open":
                # Next token is inline with text, then heading_close
                level = int(token.tag[1])  # h1 -> 1, h2 -> 2, etc.
                inline_token = tokens[i + 1]
                text = inline_token.content if inline_token else ""
                heading = ASTNode(
                    id=generate_node_id(),
                    type=NodeType.HEADING,
                    text=text,
                    level=level,
                )
                parent.children.append(heading)
                i += 3  # skip heading_open, inline, heading_close

            elif token.type == "paragraph_open":
                inline_token = tokens[i + 1]
                text = inline_token.content if inline_token else ""
                para = ASTNode(
                    id=generate_node_id(),
                    type=NodeType.PARAGRAPH,
                    text=text,
                )
                parent.children.append(para)
                i += 3  # skip paragraph_open, inline, paragraph_close

            elif token.type == "fence":
                # Code block (fenced with ``` )
                lang = token.info.strip() if token.info else None
                code = ASTNode(
                    id=generate_node_id(),
                    type=NodeType.CODE_BLOCK,
                    text=token.content.rstrip("\n"),
                    language_hint=lang if lang else None,
                )
                parent.children.append(code)
                i += 1

            elif token.type == "code_block":
                # Indented code block
                code = ASTNode(
                    id=generate_node_id(),
                    type=NodeType.CODE_BLOCK,
                    text=token.content.rstrip("\n"),
                )
                parent.children.append(code)
                i += 1

            elif token.type in ("bullet_list_open", "ordered_list_open"):
                kind = ListKind.UNORDERED if token.type == "bullet_list_open" else ListKind.ORDERED
                list_node = ASTNode(
                    id=generate_node_id(),
                    type=NodeType.LIST,
                    list_kind=kind,
                )
                # Collect tokens until matching close
                close_type = token.type.replace("_open", "_close")
                i += 1
                depth = 1
                list_tokens = []
                while i < len(tokens) and depth > 0:
                    if tokens[i].type == token.type:
                        depth += 1
                    elif tokens[i].type == close_type:
                        depth -= 1
                        if depth == 0:
                            break
                    list_tokens.append(tokens[i])
                    i += 1
                # Process list items from collected tokens
                self._process_list_items(list_tokens, list_node)
                parent.children.append(list_node)
                i += 1  # skip the close token

            elif token.type == "blockquote_open":
                bq = ASTNode(
                    id=generate_node_id(),
                    type=NodeType.BLOCKQUOTE,
                )
                # Collect inner tokens until blockquote_close
                i += 1
                depth = 1
                bq_tokens = []
                while i < len(tokens) and depth > 0:
                    if tokens[i].type == "blockquote_open":
                        depth += 1
                    elif tokens[i].type == "blockquote_close":
                        depth -= 1
                        if depth == 0:
                            break
                    bq_tokens.append(tokens[i])
                    i += 1
                self._process_tokens(bq_tokens, bq)
                parent.children.append(bq)
                i += 1  # skip blockquote_close

            else:
                # Skip unrecognized tokens (hr, etc.)
                i += 1

    def _process_list_items(self, tokens: list, list_node: ASTNode) -> None:
        """Process tokens within a list to extract list_item nodes."""
        i = 0
        while i < len(tokens):
            token = tokens[i]
            if token.type == "list_item_open":
                # Collect tokens until list_item_close
                i += 1
                item_tokens = []
                depth = 1
                while i < len(tokens) and depth > 0:
                    if tokens[i].type == "list_item_open":
                        depth += 1
                    elif tokens[i].type == "list_item_close":
                        depth -= 1
                        if depth == 0:
                            break
                    item_tokens.append(tokens[i])
                    i += 1
                # Extract text from the first paragraph in the list item
                item_text = ""
                item_children = []
                j = 0
                while j < len(item_tokens):
                    if item_tokens[j].type == "paragraph_open":
                        inline = item_tokens[j + 1]
                        if not item_text:
                            item_text = inline.content
                        j += 3
                    elif item_tokens[j].type in ("bullet_list_open", "ordered_list_open"):
                        # Nested list inside list item
                        kind = ListKind.UNORDERED if item_tokens[j].type == "bullet_list_open" else ListKind.ORDERED
                        nested_list = ASTNode(
                            id=generate_node_id(),
                            type=NodeType.LIST,
                            list_kind=kind,
                        )
                        close_type = item_tokens[j].type.replace("_open", "_close")
                        j += 1
                        nested_depth = 1
                        nested_tokens = []
                        while j < len(item_tokens) and nested_depth > 0:
                            if item_tokens[j].type == item_tokens[j - len(nested_tokens) - 1].type if False else False:
                                pass
                            if item_tokens[j].type in ("bullet_list_open", "ordered_list_open"):
                                nested_depth += 1
                            elif item_tokens[j].type in ("bullet_list_close", "ordered_list_close"):
                                nested_depth -= 1
                                if nested_depth == 0:
                                    break
                            nested_tokens.append(item_tokens[j])
                            j += 1
                        self._process_list_items(nested_tokens, nested_list)
                        item_children.append(nested_list)
                        j += 1
                    else:
                        j += 1

                list_item = ASTNode(
                    id=generate_node_id(),
                    type=NodeType.LIST_ITEM,
                    text=item_text,
                    children=item_children,
                )
                list_node.children.append(list_item)
                i += 1  # skip list_item_close
            else:
                i += 1
```

**Tests** (`app/tests/test_markdown_parser.py`):
- `test_parse_headings` -- `# Title\n## Subtitle` produces 2 heading nodes with correct levels
- `test_parse_paragraphs` -- plain text paragraphs
- `test_parse_unordered_list` -- `- item1\n- item2` produces list with 2 list_items
- `test_parse_ordered_list` -- `1. item1\n2. item2`
- `test_parse_nested_list` -- list with nested sub-list
- `test_parse_code_block` -- fenced code block with language hint
- `test_parse_blockquote` -- `> quoted text` produces blockquote with paragraph child
- `test_parse_mixed_document` -- full document with all node types
- `test_parse_arabic_text` -- Arabic Markdown content preserves text correctly
- `test_parse_empty_document` -- empty string produces document with no children

---

#### B4. Markdown Serializer (`app/libs/markdown_serializer.py`)

**File to create**: `app/libs/markdown_serializer.py`

Converts an AST document back into Markdown text. This is a hand-written serializer (no library needed) since we control the AST structure.

```python
# app/libs/markdown_serializer.py
from app.models.ast import ASTNode, NodeType, ListKind


class MarkdownSerializer:
    """Converts an AST document into Markdown text."""

    def serialize(self, document: ASTNode) -> str:
        """Serialize an entire document to Markdown."""
        if document.type != NodeType.DOCUMENT:
            raise ValueError("Expected a document node")
        parts = []
        for child in document.children:
            parts.append(self._serialize_node(child, indent_level=0))
        return "\n\n".join(parts) + "\n" if parts else ""

    def _serialize_node(self, node: ASTNode, indent_level: int = 0) -> str:
        """Serialize a single node to Markdown."""
        if node.type == NodeType.HEADING:
            prefix = "#" * (node.level or 1)
            return f"{prefix} {node.text or ''}"

        elif node.type == NodeType.PARAGRAPH:
            return node.text or ""

        elif node.type == NodeType.CODE_BLOCK:
            lang = node.language_hint or ""
            return f"```{lang}\n{node.text or ''}\n```"

        elif node.type == NodeType.BLOCKQUOTE:
            inner_parts = []
            for child in node.children:
                serialized = self._serialize_node(child, indent_level)
                # Prefix each line with "> "
                lines = serialized.split("\n")
                inner_parts.append("\n".join(f"> {line}" for line in lines))
            return "\n>\n".join(inner_parts)

        elif node.type == NodeType.LIST:
            items = []
            for i, child in enumerate(node.children):
                items.append(self._serialize_list_item(child, node.list_kind, i, indent_level))
            return "\n".join(items)

        elif node.type == NodeType.LIST_ITEM:
            # Should not be serialized directly; handled by _serialize_list_item
            return node.text or ""

        return ""

    def _serialize_list_item(self, item: ASTNode, list_kind: ListKind, index: int, indent_level: int) -> str:
        """Serialize a list item with proper prefix and indentation."""
        indent = "    " * indent_level
        if list_kind == ListKind.ORDERED:
            prefix = f"{indent}{index + 1}. "
        else:
            prefix = f"{indent}- "

        result = f"{prefix}{item.text or ''}"

        # Handle nested lists (children of list_item)
        for child in item.children:
            if child.type == NodeType.LIST:
                nested_items = []
                for j, nested_item in enumerate(child.children):
                    nested_items.append(
                        self._serialize_list_item(nested_item, child.list_kind, j, indent_level + 1)
                    )
                result += "\n" + "\n".join(nested_items)

        return result
```

**Tests** (`app/tests/test_markdown_serializer.py`):
- `test_serialize_heading` -- heading nodes produce `# Title` format
- `test_serialize_paragraph` -- paragraph produces plain text
- `test_serialize_code_block` -- code block produces fenced block with language
- `test_serialize_unordered_list` -- list with `- ` prefix
- `test_serialize_ordered_list` -- list with `1. ` prefix
- `test_serialize_nested_list` -- nested lists with proper indentation
- `test_serialize_blockquote` -- blockquote produces `> ` prefixed lines
- `test_round_trip` -- parse Markdown, then serialize back; output should match (modulo whitespace normalization)
- `test_serialize_arabic_text` -- Arabic content serializes correctly
- `test_serialize_empty_document` -- empty doc produces empty string

---

#### B5. Diff System (`app/libs/diff.py`)

**File to create**: `app/libs/diff.py`

Two levels of diffing:
1. **Node-level diff**: Compare two AST trees and produce a list of operations that transform one into the other.
2. **Text-level diff**: Compare two strings and produce UpdateText operations.

```python
# app/libs/diff.py
from difflib import SequenceMatcher
from app.models.ast import ASTNode, NodeType
from app.models.operations import Operation, insert_node, delete_node, replace_node, update_text


def diff_text(node_id: str, old_text: str, new_text: str) -> list[Operation]:
    """
    Produce minimal UpdateText operations to transform old_text into new_text.
    Uses SequenceMatcher to find edit regions.
    Returns a list of UpdateText operations applied from right to left
    (so offsets remain valid).
    """
    if old_text == new_text:
        return []

    ops = []
    matcher = SequenceMatcher(None, old_text, new_text)
    # Process opcodes in reverse order so offsets remain valid
    opcodes = list(matcher.get_opcodes())
    for tag, i1, i2, j1, j2 in reversed(opcodes):
        if tag == "equal":
            continue
        elif tag == "replace":
            ops.append(update_text(
                node_id=node_id,
                offset=i1,
                new_text=new_text[j1:j2],
                delete_count=i2 - i1,
            ))
        elif tag == "insert":
            ops.append(update_text(
                node_id=node_id,
                offset=i1,
                new_text=new_text[j1:j2],
                delete_count=0,
            ))
        elif tag == "delete":
            ops.append(update_text(
                node_id=node_id,
                offset=i1,
                new_text="",
                delete_count=i2 - i1,
            ))
    return ops


def diff_trees(old_doc: ASTNode, new_doc: ASTNode) -> list[Operation]:
    """
    Produce a list of operations that transform old_doc into new_doc.
    
    Strategy:
    1. Build ID-to-node maps for both trees.
    2. Nodes present in old but not new => DeleteNode
    3. Nodes present in new but not old => InsertNode
    4. Nodes present in both => compare text and properties; if different => ReplaceNode or UpdateText
    5. Check if node order changed => MoveNode
    
    This is a simplified diff that works at the top level of the document's children.
    A full recursive diff is complex; for MVP we diff the immediate children of matching container nodes.
    """
    ops = []

    old_ids = {child.id for child in old_doc.children}
    new_ids = {child.id for child in new_doc.children}

    # Deleted nodes (in old, not in new)
    for child in old_doc.children:
        if child.id not in new_ids:
            ops.append(delete_node(child.id))

    # Inserted nodes (in new, not in old)
    for i, child in enumerate(new_doc.children):
        if child.id not in old_ids:
            ops.append(insert_node(new_doc.id, i, child))

    # Modified nodes (in both)
    old_map = {child.id: child for child in old_doc.children}
    for child in new_doc.children:
        if child.id in old_map:
            old_child = old_map[child.id]
            # Check if text changed
            if old_child.text != child.text and old_child.text is not None and child.text is not None:
                ops.extend(diff_text(child.id, old_child.text, child.text))
            elif old_child.to_dict() != child.to_dict():
                # Structural change - replace the whole node
                ops.append(replace_node(child.id, child))

    return ops
```

**Tests** (`app/tests/test_diff.py`):
- `test_diff_text_insert` -- inserting text at various positions
- `test_diff_text_delete` -- deleting text
- `test_diff_text_replace` -- replacing a substring
- `test_diff_text_no_change` -- identical strings produce no ops
- `test_diff_trees_added_node` -- new paragraph in new doc
- `test_diff_trees_deleted_node` -- paragraph missing in new doc
- `test_diff_trees_modified_text` -- paragraph text changed
- `test_diff_trees_no_change` -- identical trees produce no ops

---

#### B6. Versioning (`app/models/versioning.py`)

**File to create**: `app/models/versioning.py`

Snapshot-based versioning: each version stores the full AST state and the operations that led to it from the previous version.

```python
# app/models/versioning.py
from __future__ import annotations
import time
import copy
from dataclasses import dataclass, field
from typing import Optional
from app.models.ast import ASTNode
from app.models.operations import Operation


@dataclass
class Version:
    """A snapshot of a document at a point in time."""
    version_id: str                          # e.g., "v_1", "v_2"
    document_id: str
    snapshot: ASTNode                        # full AST at this version
    operations_since_previous: list[Operation] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    label: Optional[str] = None              # optional label (e.g., "Draft 1", "AI Review")
    actor: str = "user"

    def to_dict(self) -> dict:
        return {
            "version_id": self.version_id,
            "document_id": self.document_id,
            "snapshot": self.snapshot.to_dict(),
            "operations_since_previous": [op.to_dict() for op in self.operations_since_previous],
            "created_at": self.created_at,
            "label": self.label,
            "actor": self.actor,
        }

    @classmethod
    def from_dict(cls, data: dict) -> Version:
        return cls(
            version_id=data["version_id"],
            document_id=data["document_id"],
            snapshot=ASTNode.from_dict(data["snapshot"]),
            operations_since_previous=[Operation.from_dict(op) for op in data.get("operations_since_previous", [])],
            created_at=data.get("created_at", time.time()),
            label=data.get("label"),
            actor=data.get("actor", "user"),
        )


class VersionManager:
    """Manages versions for a document."""

    def __init__(self, document_id: str):
        self.document_id = document_id
        self.versions: list[Version] = []
        self._next_version_num = 1

    def create_version(self, document: ASTNode, operations: list[Operation],
                       label: Optional[str] = None, actor: str = "user") -> Version:
        """Create a new version snapshot."""
        version = Version(
            version_id=f"v_{self._next_version_num}",
            document_id=self.document_id,
            snapshot=copy.deepcopy(document),
            operations_since_previous=list(operations),
            label=label,
            actor=actor,
        )
        self.versions.append(version)
        self._next_version_num += 1
        return version

    def get_version(self, version_id: str) -> Optional[Version]:
        for v in self.versions:
            if v.version_id == version_id:
                return v
        return None

    def get_latest_version(self) -> Optional[Version]:
        return self.versions[-1] if self.versions else None

    def list_versions(self) -> list[dict]:
        """Return summary list of all versions."""
        return [
            {
                "version_id": v.version_id,
                "label": v.label,
                "created_at": v.created_at,
                "actor": v.actor,
                "node_count": v.snapshot.node_count(),
                "ops_count": len(v.operations_since_previous),
            }
            for v in self.versions
        ]

    def restore_version(self, version_id: str) -> Optional[ASTNode]:
        """Return a deep copy of the AST at a given version."""
        version = self.get_version(version_id)
        if version is None:
            return None
        return copy.deepcopy(version.snapshot)
```

**Tests** (`app/tests/test_versioning.py`):
- `test_create_version` -- creating a version snapshot
- `test_multiple_versions` -- creating sequential versions
- `test_get_version` -- retrieve by version_id
- `test_get_latest_version` -- returns most recent
- `test_restore_version` -- restored AST is independent copy
- `test_list_versions` -- returns correct summaries

---

#### B7. Database Schema and Persistence (`db/`)

**Files to create**:
- `db/db.py` -- DatabaseManager
- `db/migrations/001_initial_schema.py`

**Database tables (SQLite)**:

```sql
-- documents table
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,              -- doc_xxx
    title TEXT,
    ast_snapshot TEXT NOT NULL,        -- JSON serialized ASTNode
    created_at REAL NOT NULL,         -- Unix timestamp
    updated_at REAL NOT NULL,
    created_by TEXT DEFAULT 'user'
);

-- operations table (append-only log)
CREATE TABLE IF NOT EXISTS operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL,
    op_data TEXT NOT NULL,             -- JSON serialized Operation
    applied_at REAL NOT NULL,          -- Unix timestamp
    actor TEXT DEFAULT 'user',
    FOREIGN KEY (document_id) REFERENCES documents(id)
);

-- versions table (snapshots)
CREATE TABLE IF NOT EXISTS versions (
    id TEXT PRIMARY KEY,               -- v_xxx
    document_id TEXT NOT NULL,
    snapshot TEXT NOT NULL,             -- JSON serialized ASTNode
    ops_since_previous TEXT,           -- JSON array of operations since previous version
    created_at REAL NOT NULL,
    label TEXT,
    actor TEXT DEFAULT 'user',
    FOREIGN KEY (document_id) REFERENCES documents(id)
);

-- Index for fast operation log retrieval
CREATE INDEX IF NOT EXISTS idx_operations_document ON operations(document_id, applied_at);
CREATE INDEX IF NOT EXISTS idx_versions_document ON versions(document_id, created_at);
```

**DatabaseManager** (`db/db.py`):

```python
# db/db.py
import sqlite3
import json
import os
from typing import Optional


class DatabaseManager:
    """SQLite database manager with parameterized queries."""

    def __init__(self, db_path: str = "db/kurras.db"):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")

    def execute(self, query: str, params: tuple = ()) -> sqlite3.Cursor:
        return self.conn.execute(query, params)

    def executemany(self, query: str, params_list: list[tuple]) -> sqlite3.Cursor:
        return self.conn.executemany(query, params_list)

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()

    def run_migrations(self):
        """Run all migration files in order."""
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
        applied = {row["name"] for row in self.execute("SELECT name FROM _migrations").fetchall()}
        # Run pending migrations
        import importlib
        migration_files = sorted(f for f in os.listdir(migrations_dir) if f.endswith(".py") and f != "__init__.py")
        for mf in migration_files:
            if mf in applied:
                continue
            module_name = f"db.migrations.{mf[:-3]}"
            module = importlib.import_module(module_name)
            module.up(self)
            import time
            self.execute("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)", (mf, time.time()))
            self.commit()
```

**Migration 001** (`db/migrations/001_initial_schema.py`):

```python
# db/migrations/001_initial_schema.py

def up(db):
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
    db.execute("CREATE INDEX IF NOT EXISTS idx_operations_document ON operations(document_id, applied_at)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_versions_document ON versions(document_id, created_at)")
    db.commit()


def down(db):
    db.execute("DROP TABLE IF EXISTS versions")
    db.execute("DROP TABLE IF EXISTS operations")
    db.execute("DROP TABLE IF EXISTS documents")
    db.commit()
```

**Document Repository** (`app/models/document_repo.py`):

```python
# app/models/document_repo.py
import json
import time
from typing import Optional
from db.db import DatabaseManager
from app.models.ast import ASTNode
from app.models.operations import Operation
from app.models.versioning import Version


class DocumentRepository:
    """Persistence layer for documents, operations, and versions."""

    def __init__(self, db: DatabaseManager):
        self.db = db

    # --- Document CRUD ---

    def create_document(self, doc: ASTNode, title: Optional[str] = None) -> str:
        """Persist a new document. Returns the document ID."""
        now = time.time()
        self.db.execute(
            "INSERT INTO documents (id, title, ast_snapshot, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (doc.id, title, json.dumps(doc.to_dict()), now, now)
        )
        self.db.commit()
        return doc.id

    def get_document(self, doc_id: str) -> Optional[ASTNode]:
        """Load a document AST by ID."""
        row = self.db.execute("SELECT ast_snapshot FROM documents WHERE id = ?", (doc_id,)).fetchone()
        if row is None:
            return None
        return ASTNode.from_dict(json.loads(row["ast_snapshot"]))

    def update_document(self, doc: ASTNode, title: Optional[str] = None) -> None:
        """Update the stored AST snapshot for a document."""
        now = time.time()
        self.db.execute(
            "UPDATE documents SET ast_snapshot = ?, updated_at = ?, title = COALESCE(?, title) WHERE id = ?",
            (json.dumps(doc.to_dict()), now, title, doc.id)
        )
        self.db.commit()

    def delete_document(self, doc_id: str) -> bool:
        """Delete a document and all its operations and versions."""
        self.db.execute("DELETE FROM operations WHERE document_id = ?", (doc_id,))
        self.db.execute("DELETE FROM versions WHERE document_id = ?", (doc_id,))
        cursor = self.db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        self.db.commit()
        return cursor.rowcount > 0

    def list_documents(self) -> list[dict]:
        """List all documents with summary info."""
        rows = self.db.execute(
            "SELECT id, title, created_at, updated_at, created_by FROM documents ORDER BY updated_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]

    # --- Operations ---

    def append_operation(self, doc_id: str, op: Operation) -> None:
        """Append an operation to the document's operation log."""
        self.db.execute(
            "INSERT INTO operations (document_id, op_data, applied_at, actor) VALUES (?, ?, ?, ?)",
            (doc_id, json.dumps(op.to_dict()), op.timestamp, op.actor)
        )
        self.db.commit()

    def append_operations(self, doc_id: str, ops: list[Operation]) -> None:
        """Append multiple operations."""
        self.db.executemany(
            "INSERT INTO operations (document_id, op_data, applied_at, actor) VALUES (?, ?, ?, ?)",
            [(doc_id, json.dumps(op.to_dict()), op.timestamp, op.actor) for op in ops]
        )
        self.db.commit()

    def get_operations(self, doc_id: str, since: Optional[float] = None) -> list[Operation]:
        """Get operations for a document, optionally since a timestamp."""
        if since is not None:
            rows = self.db.execute(
                "SELECT op_data FROM operations WHERE document_id = ? AND applied_at > ? ORDER BY applied_at ASC",
                (doc_id, since)
            ).fetchall()
        else:
            rows = self.db.execute(
                "SELECT op_data FROM operations WHERE document_id = ? ORDER BY applied_at ASC",
                (doc_id,)
            ).fetchall()
        return [Operation.from_dict(json.loads(row["op_data"])) for row in rows]

    # --- Versions ---

    def save_version(self, version: Version) -> None:
        """Save a version snapshot."""
        self.db.execute(
            "INSERT INTO versions (id, document_id, snapshot, ops_since_previous, created_at, label, actor) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                version.version_id,
                version.document_id,
                json.dumps(version.snapshot.to_dict()),
                json.dumps([op.to_dict() for op in version.operations_since_previous]),
                version.created_at,
                version.label,
                version.actor,
            )
        )
        self.db.commit()

    def get_version(self, version_id: str) -> Optional[Version]:
        """Load a version by ID."""
        row = self.db.execute("SELECT * FROM versions WHERE id = ?", (version_id,)).fetchone()
        if row is None:
            return None
        return Version(
            version_id=row["id"],
            document_id=row["document_id"],
            snapshot=ASTNode.from_dict(json.loads(row["snapshot"])),
            operations_since_previous=[
                Operation.from_dict(op) for op in json.loads(row["ops_since_previous"] or "[]")
            ],
            created_at=row["created_at"],
            label=row["label"],
            actor=row["actor"],
        )

    def list_versions(self, doc_id: str) -> list[dict]:
        """List all versions for a document."""
        rows = self.db.execute(
            "SELECT id, document_id, created_at, label, actor FROM versions WHERE document_id = ? ORDER BY created_at ASC",
            (doc_id,)
        ).fetchall()
        return [dict(row) for row in rows]
```

---

#### B8. GraphQL API (`app/gql/`)

**Files to create**:
- `app/gql/types.py` -- Strawberry type definitions
- `app/gql/queries/document_queries.py` -- document query resolvers
- `app/gql/mutations/document_mutations.py` -- document mutation resolvers
- `app/gql/schema.py` -- root schema

**GraphQL Types** (`app/gql/types.py`):

```python
import strawberry
from typing import Optional
from enum import Enum


@strawberry.enum
class NodeTypeGQL(Enum):
    DOCUMENT = "document"
    PARAGRAPH = "paragraph"
    HEADING = "heading"
    LIST = "list"
    LIST_ITEM = "list_item"
    CODE_BLOCK = "code_block"
    BLOCKQUOTE = "blockquote"


@strawberry.enum
class ListKindGQL(Enum):
    ORDERED = "ordered"
    UNORDERED = "unordered"


@strawberry.enum
class OpTypeGQL(Enum):
    INSERT_NODE = "insert_node"
    DELETE_NODE = "delete_node"
    UPDATE_TEXT = "update_text"
    REPLACE_NODE = "replace_node"
    MOVE_NODE = "move_node"


@strawberry.type
class ASTNodeType:
    id: str
    type: NodeTypeGQL
    text: Optional[str] = None
    level: Optional[int] = None
    list_kind: Optional[ListKindGQL] = None
    language_hint: Optional[str] = None
    children: list["ASTNodeType"] = strawberry.field(default_factory=list)


@strawberry.type
class DocumentType:
    id: str
    title: Optional[str] = None
    ast: ASTNodeType = None
    created_at: float = 0
    updated_at: float = 0


@strawberry.type
class DocumentSummaryType:
    id: str
    title: Optional[str] = None
    created_at: float = 0
    updated_at: float = 0


@strawberry.type
class OperationType:
    op_type: OpTypeGQL
    timestamp: float
    actor: str
    node_id: Optional[str] = None
    parent_id: Optional[str] = None
    position: Optional[int] = None
    new_text: Optional[str] = None
    offset: Optional[int] = None
    delete_count: Optional[int] = None


@strawberry.type
class VersionType:
    version_id: str
    document_id: str
    created_at: float
    label: Optional[str] = None
    actor: str = "user"


@strawberry.type
class VersionDetailType:
    version_id: str
    document_id: str
    ast: ASTNodeType = None
    created_at: float = 0
    label: Optional[str] = None
    actor: str = "user"


# --- Input Types ---

@strawberry.input
class ASTNodeInput:
    id: str
    type: NodeTypeGQL
    text: Optional[str] = None
    level: Optional[int] = None
    list_kind: Optional[ListKindGQL] = None
    language_hint: Optional[str] = None
    children: list["ASTNodeInput"] = strawberry.field(default_factory=list)


@strawberry.input
class InsertNodeInput:
    parent_id: str
    position: int
    node: ASTNodeInput


@strawberry.input
class DeleteNodeInput:
    node_id: str


@strawberry.input
class UpdateTextInput:
    node_id: str
    offset: int
    new_text: str
    delete_count: int = 0


@strawberry.input
class ReplaceNodeInput:
    node_id: str
    new_node: ASTNodeInput


@strawberry.input
class MoveNodeInput:
    node_id: str
    new_parent_id: str
    new_position: int


@strawberry.input
class OperationInput:
    """Union-like input: populate exactly one of the operation fields."""
    insert_node: Optional[InsertNodeInput] = None
    delete_node: Optional[DeleteNodeInput] = None
    update_text: Optional[UpdateTextInput] = None
    replace_node: Optional[ReplaceNodeInput] = None
    move_node: Optional[MoveNodeInput] = None


@strawberry.input
class CreateDocumentInput:
    title: Optional[str] = None
    markdown: Optional[str] = None        # optionally import from Markdown


@strawberry.input
class CreateVersionInput:
    document_id: str
    label: Optional[str] = None


@strawberry.type
class OperationResult:
    success: bool
    document: Optional[DocumentType] = None
    error: Optional[str] = None


@strawberry.type
class ExportResult:
    markdown: str
```

**Query Resolvers** (`app/gql/queries/document_queries.py`):

```python
import strawberry
from app.gql.types import DocumentType, DocumentSummaryType, VersionType, VersionDetailType, OperationType, ExportResult

@strawberry.type
class DocumentQueries:
    @strawberry.field
    def document(self, id: str) -> DocumentType:
        """Get a single document by ID with full AST."""
        ...  # Load from DocumentRepository, convert to DocumentType

    @strawberry.field
    def documents(self) -> list[DocumentSummaryType]:
        """List all documents (summary only, no AST)."""
        ...

    @strawberry.field
    def document_versions(self, document_id: str) -> list[VersionType]:
        """List all versions of a document."""
        ...

    @strawberry.field
    def version(self, version_id: str) -> VersionDetailType:
        """Get a specific version with full AST."""
        ...

    @strawberry.field
    def document_operations(self, document_id: str, since: float | None = None) -> list[OperationType]:
        """Get the operation log for a document."""
        ...

    @strawberry.field
    def export_markdown(self, document_id: str) -> ExportResult:
        """Export a document as Markdown."""
        ...
```

**Mutation Resolvers** (`app/gql/mutations/document_mutations.py`):

```python
import strawberry
from app.gql.types import (
    DocumentType, OperationResult, VersionType,
    CreateDocumentInput, OperationInput, CreateVersionInput,
)

@strawberry.type
class DocumentMutations:
    @strawberry.mutation
    def create_document(self, input: CreateDocumentInput) -> DocumentType:
        """Create a new document. Optionally import from Markdown."""
        ...

    @strawberry.mutation
    def delete_document(self, id: str) -> bool:
        """Delete a document and all associated data."""
        ...

    @strawberry.mutation
    def apply_operation(self, document_id: str, operation: OperationInput) -> OperationResult:
        """Apply a single operation to a document."""
        ...  # Validate, apply via OperationsEngine, persist, return result

    @strawberry.mutation
    def apply_operations(self, document_id: str, operations: list[OperationInput]) -> OperationResult:
        """Apply multiple operations atomically."""
        ...

    @strawberry.mutation
    def create_version(self, input: CreateVersionInput) -> VersionType:
        """Create a version snapshot of the current document state."""
        ...

    @strawberry.mutation
    def restore_version(self, document_id: str, version_id: str) -> DocumentType:
        """Restore a document to a previous version."""
        ...

    @strawberry.mutation
    def import_markdown(self, document_id: str, markdown: str) -> DocumentType:
        """Replace document content by importing Markdown."""
        ...
```

**Flask App** (`app/main.py`):

```python
from flask import Flask
from strawberry.flask.views import GraphQLView
from app.gql.schema import schema
from db.db import DatabaseManager

def create_app(db_path: str = "db/kurras.db") -> Flask:
    app = Flask(__name__)

    db = DatabaseManager(db_path)
    db.run_migrations()

    # Store db on app for access in resolvers
    app.config["db"] = db

    app.add_url_rule(
        "/graphql",
        view_func=GraphQLView.as_view("graphql_view", schema=schema),
    )

    return app

if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, port=5000)
```

**Schema Root** (`app/gql/schema.py`):

```python
import strawberry
from app.gql.queries.document_queries import DocumentQueries
from app.gql.mutations.document_mutations import DocumentMutations

schema = strawberry.Schema(query=DocumentQueries, mutation=DocumentMutations)
```

---

#### B9. Backend Requirements (`requirements.txt`)

```
flask>=3.0.0
strawberry-graphql[flask]>=0.220.0
markdown-it-py>=3.0.0
pytest>=8.0.0
```

---

### FRONTEND PLAN

#### F1. Project Setup (`web/`)

Initialize a Vue 3 + Vite + Tailwind CSS project:

```bash
cd /Users/mohanad/Workspace/editor
npm create vite@latest web -- --template vue
cd web
npm install
npm install -D tailwindcss @tailwindcss/vite
npm install @apollo/client graphql
npm install vue-router@4
```

**Configure Tailwind** (`web/src/style.css` or `web/src/assets/main.css`):
```css
@import "tailwindcss";
```

**Configure Vite for Tailwind** (`web/vite.config.js`):
```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    proxy: {
      '/graphql': 'http://localhost:5000'
    }
  }
})
```

**Set RTL on HTML** (`web/index.html`):
```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Kurras</title>
  </head>
  <body class="bg-white text-black antialiased">
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

#### F2. Directory Structure

```
web/src/
  main.js                          # App entry, router setup
  App.vue                          # Root component with router-view
  router/
    index.js                       # Vue Router configuration
  composables/
    useGraphQL.js                  # GraphQL client composable
    useDocument.js                 # Document state management
    useEditor.js                   # Editor state (cursor, selection)
    useOperations.js               # Operation creation and submission
  components/
    editor/
      EditorView.vue              # Main editor container
      EditorToolbar.vue           # Toolbar with formatting controls
      EditorContent.vue           # Contenteditable area that renders AST
      nodes/
        ParagraphNode.vue         # Paragraph renderer
        HeadingNode.vue           # Heading renderer (h1-h6)
        ListNode.vue              # List renderer (ul/ol)
        ListItemNode.vue          # List item renderer
        CodeBlockNode.vue         # Code block renderer
        BlockquoteNode.vue        # Blockquote renderer
        NodeRenderer.vue          # Dynamic node type dispatcher
    ui/
      AppLayout.vue               # Base layout with header
      DocumentList.vue            # Document listing page component
      ImportExportDialog.vue      # Markdown import/export modal
  views/
    HomeView.vue                  # Landing page / document list
    EditorPage.vue                # Full editor page (loads document)
```

#### F3. Rendering Pipeline: AST -> View Model -> DOM

The rendering pipeline follows the PRD specification:

**Step 1: AST (from backend)** -- Raw AST JSON from GraphQL
**Step 2: View Model (reactive)** -- Vue reactive state using `ref`/`reactive`
**Step 3: DOM (Vue components)** -- Each node type maps to a Vue component

**`NodeRenderer.vue`** -- The central dispatch component:

```vue
<!-- web/src/components/editor/nodes/NodeRenderer.vue -->
<template>
  <component :is="nodeComponent" :node="node" :path="path" />
</template>

<script setup>
import { computed } from 'vue'
import ParagraphNode from './ParagraphNode.vue'
import HeadingNode from './HeadingNode.vue'
import ListNode from './ListNode.vue'
import ListItemNode from './ListItemNode.vue'
import CodeBlockNode from './CodeBlockNode.vue'
import BlockquoteNode from './BlockquoteNode.vue'

const props = defineProps({
  node: { type: Object, required: true },
  path: { type: Array, default: () => [] },  // path from root for cursor tracking
})

const componentMap = {
  paragraph: ParagraphNode,
  heading: HeadingNode,
  list: ListNode,
  list_item: ListItemNode,
  code_block: CodeBlockNode,
  blockquote: BlockquoteNode,
}

const nodeComponent = computed(() => componentMap[props.node.type] || ParagraphNode)
</script>
```

**`ParagraphNode.vue`** -- Example node component:

```vue
<!-- web/src/components/editor/nodes/ParagraphNode.vue -->
<template>
  <p
    :id="node.id"
    :data-node-id="node.id"
    class="mb-4 leading-relaxed text-lg"
    :contenteditable="true"
    @input="onInput"
    @keydown="onKeydown"
    @focus="onFocus"
  >{{ node.text }}</p>
</template>

<script setup>
import { inject } from 'vue'

const props = defineProps({
  node: { type: Object, required: true },
  path: { type: Array, default: () => [] },
})

const editorContext = inject('editorContext')

function onInput(event) {
  const newText = event.target.textContent
  editorContext.handleTextChange(props.node.id, props.node.text, newText)
}

function onKeydown(event) {
  editorContext.handleKeydown(event, props.node.id, props.path)
}

function onFocus() {
  editorContext.setActiveNode(props.node.id)
}
</script>
```

**`HeadingNode.vue`**:

```vue
<template>
  <component
    :is="headingTag"
    :id="node.id"
    :data-node-id="node.id"
    class="font-bold"
    :class="headingClasses"
    :contenteditable="true"
    @input="onInput"
    @keydown="onKeydown"
    @focus="onFocus"
  >{{ node.text }}</component>
</template>

<script setup>
import { computed, inject } from 'vue'

const props = defineProps({
  node: { type: Object, required: true },
  path: { type: Array, default: () => [] },
})

const editorContext = inject('editorContext')

const headingTag = computed(() => `h${props.node.level || 1}`)
const headingClasses = computed(() => ({
  'text-4xl mb-6': props.node.level === 1,
  'text-3xl mb-5': props.node.level === 2,
  'text-2xl mb-4': props.node.level === 3,
  'text-xl mb-3': props.node.level === 4,
  'text-lg mb-2': props.node.level === 5,
  'text-base mb-2': props.node.level === 6,
}))

function onInput(event) {
  editorContext.handleTextChange(props.node.id, props.node.text, event.target.textContent)
}

function onKeydown(event) {
  editorContext.handleKeydown(event, props.node.id, props.path)
}

function onFocus() {
  editorContext.setActiveNode(props.node.id)
}
</script>
```

**`ListNode.vue`**:

```vue
<template>
  <component
    :is="listTag"
    :id="node.id"
    :data-node-id="node.id"
    class="mb-4 ps-6"
  >
    <NodeRenderer
      v-for="(child, index) in node.children"
      :key="child.id"
      :node="child"
      :path="[...path, index]"
    />
  </component>
</template>

<script setup>
import { computed } from 'vue'
import NodeRenderer from './NodeRenderer.vue'

const props = defineProps({
  node: { type: Object, required: true },
  path: { type: Array, default: () => [] },
})

const listTag = computed(() => props.node.list_kind === 'ordered' ? 'ol' : 'ul')
</script>
```

**`ListItemNode.vue`**:

```vue
<template>
  <li
    :id="node.id"
    :data-node-id="node.id"
    class="mb-1"
    :contenteditable="true"
    @input="onInput"
    @keydown="onKeydown"
    @focus="onFocus"
  >
    {{ node.text }}
    <template v-if="node.children && node.children.length">
      <NodeRenderer
        v-for="(child, index) in node.children"
        :key="child.id"
        :node="child"
        :path="[...path, index]"
      />
    </template>
  </li>
</template>

<script setup>
import { inject } from 'vue'
import NodeRenderer from './NodeRenderer.vue'

const props = defineProps({
  node: { type: Object, required: true },
  path: { type: Array, default: () => [] },
})

const editorContext = inject('editorContext')

function onInput(event) {
  // Only capture direct text content, not nested list text
  const textNode = event.target.childNodes[0]
  const newText = textNode ? textNode.textContent : ''
  editorContext.handleTextChange(props.node.id, props.node.text, newText)
}

function onKeydown(event) {
  editorContext.handleKeydown(event, props.node.id, props.path)
}

function onFocus() {
  editorContext.setActiveNode(props.node.id)
}
</script>
```

**`CodeBlockNode.vue`**:

```vue
<template>
  <div :id="node.id" :data-node-id="node.id" class="mb-4">
    <div v-if="node.language_hint" class="text-xs text-gray-500 mb-1 font-mono">
      {{ node.language_hint }}
    </div>
    <pre class="bg-gray-100 p-4 rounded font-mono text-sm overflow-x-auto" dir="ltr"><code
      :contenteditable="true"
      @input="onInput"
      @keydown="onKeydown"
      @focus="onFocus"
    >{{ node.text }}</code></pre>
  </div>
</template>

<script setup>
import { inject } from 'vue'

const props = defineProps({
  node: { type: Object, required: true },
  path: { type: Array, default: () => [] },
})

const editorContext = inject('editorContext')

function onInput(event) {
  editorContext.handleTextChange(props.node.id, props.node.text, event.target.textContent)
}

function onKeydown(event) {
  editorContext.handleKeydown(event, props.node.id, props.path)
}

function onFocus() {
  editorContext.setActiveNode(props.node.id)
}
</script>
```

**`BlockquoteNode.vue`**:

```vue
<template>
  <blockquote
    :id="node.id"
    :data-node-id="node.id"
    class="border-e-4 border-gray-300 pe-4 ps-0 mb-4 text-gray-700 italic"
  >
    <NodeRenderer
      v-for="(child, index) in node.children"
      :key="child.id"
      :node="child"
      :path="[...path, index]"
    />
  </blockquote>
</template>

<script setup>
import NodeRenderer from './NodeRenderer.vue'

const props = defineProps({
  node: { type: Object, required: true },
  path: { type: Array, default: () => [] },
})
</script>
```

Note on RTL: We use logical CSS properties throughout:
- `ps-6` (padding-start) instead of `pl-6`
- `pe-4` (padding-end) instead of `pr-4`
- `border-e-4` (border-end) instead of `border-l-4`
- `ms-`, `me-` for margins
This ensures correct layout in both RTL and LTR modes.

#### F4. Cursor Model (`web/src/composables/useEditor.js`)

```javascript
// web/src/composables/useEditor.js
import { ref, computed, provide } from 'vue'

export function useEditor(document) {
  // Active node tracking
  const activeNodeId = ref(null)
  const cursorOffset = ref(0)

  // Selection state
  const selectionStart = ref({ nodeId: null, offset: 0 })
  const selectionEnd = ref({ nodeId: null, offset: 0 })

  function setActiveNode(nodeId) {
    activeNodeId.value = nodeId
    // Sync with browser selection
    const selection = window.getSelection()
    if (selection.rangeCount > 0) {
      cursorOffset.value = selection.getRangeAt(0).startOffset
    }
  }

  function setCursor(nodeId, offset) {
    activeNodeId.value = nodeId
    cursorOffset.value = offset
    // Set browser cursor position
    const element = document.getElementById(nodeId)
    if (element) {
      const textNode = element.firstChild
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const range = document.createRange()
        range.setStart(textNode, Math.min(offset, textNode.length))
        range.collapse(true)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }
  }

  function navigateToNode(direction, currentNodeId, flatNodes) {
    /**
     * Navigate to the next or previous node in the flat list.
     * direction: 'up' | 'down'
     * flatNodes: ordered list of all editable node IDs
     */
    const currentIndex = flatNodes.indexOf(currentNodeId)
    if (currentIndex === -1) return

    let targetIndex
    if (direction === 'up') {
      targetIndex = Math.max(0, currentIndex - 1)
    } else {
      targetIndex = Math.min(flatNodes.length - 1, currentIndex + 1)
    }

    const targetNodeId = flatNodes[targetIndex]
    setActiveNode(targetNodeId)
    // Focus the target element
    const element = document.getElementById(targetNodeId)
    if (element) {
      element.focus()
    }
  }

  return {
    activeNodeId,
    cursorOffset,
    selectionStart,
    selectionEnd,
    setActiveNode,
    setCursor,
    navigateToNode,
  }
}
```

#### F5. Operations Composable (`web/src/composables/useOperations.js`)

```javascript
// web/src/composables/useOperations.js
import { ref } from 'vue'
import { useGraphQL } from './useGraphQL.js'

export function useOperations(documentId) {
  const { mutation } = useGraphQL()
  const pendingOps = ref([])
  const isSyncing = ref(false)

  function createUpdateTextOp(nodeId, oldText, newText) {
    /**
     * Create an UpdateText operation from old/new text.
     * Simple approach: replace entire text (offset=0, delete_count=old length)
     * A more sophisticated approach would compute a minimal diff.
     */
    return {
      update_text: {
        node_id: nodeId,
        offset: 0,
        new_text: newText,
        delete_count: oldText ? oldText.length : 0,
      }
    }
  }

  function createInsertNodeOp(parentId, position, node) {
    return {
      insert_node: {
        parent_id: parentId,
        position: position,
        node: node,
      }
    }
  }

  function createDeleteNodeOp(nodeId) {
    return {
      delete_node: {
        node_id: nodeId,
      }
    }
  }

  async function submitOperation(operation) {
    pendingOps.value.push(operation)
    return flushOperations()
  }

  async function flushOperations() {
    if (isSyncing.value || pendingOps.value.length === 0) return
    isSyncing.value = true

    const ops = [...pendingOps.value]
    pendingOps.value = []

    try {
      const result = await mutation(`
        mutation ApplyOperations($docId: String!, $ops: [OperationInput!]!) {
          applyOperations(documentId: $docId, operations: $ops) {
            success
            error
            document {
              id
              ast {
                id
                type
                text
                level
                listKind
                languageHint
                children {
                  id
                  type
                  text
                  level
                  listKind
                  languageHint
                  children {
                    id
                    type
                    text
                    level
                    listKind
                    languageHint
                    children {
                      id
                      type
                      text
                    }
                  }
                }
              }
            }
          }
        }
      `, { docId: documentId.value, ops })

      if (!result.applyOperations.success) {
        console.error('Operation failed:', result.applyOperations.error)
      }
      return result.applyOperations
    } catch (error) {
      console.error('Failed to sync operations:', error)
      // Re-queue failed operations
      pendingOps.value = [...ops, ...pendingOps.value]
    } finally {
      isSyncing.value = false
    }
  }

  return {
    pendingOps,
    isSyncing,
    createUpdateTextOp,
    createInsertNodeOp,
    createDeleteNodeOp,
    submitOperation,
    flushOperations,
  }
}
```

#### F6. Document Composable (`web/src/composables/useDocument.js`)

```javascript
// web/src/composables/useDocument.js
import { ref, computed } from 'vue'
import { useGraphQL } from './useGraphQL.js'

export function useDocument() {
  const { query, mutation } = useGraphQL()
  const document = ref(null)
  const isLoading = ref(false)
  const error = ref(null)

  async function loadDocument(docId) {
    isLoading.value = true
    error.value = null
    try {
      const result = await query(`
        query GetDocument($id: String!) {
          document(id: $id) {
            id
            title
            createdAt
            updatedAt
            ast {
              id
              type
              text
              level
              listKind
              languageHint
              children {
                id
                type
                text
                level
                listKind
                languageHint
                children {
                  id
                  type
                  text
                  level
                  listKind
                  languageHint
                  children {
                    id
                    type
                    text
                  }
                }
              }
            }
          }
        }
      `, { id: docId })
      document.value = result.document
    } catch (e) {
      error.value = e.message
    } finally {
      isLoading.value = false
    }
  }

  async function createDocument(title = null, markdown = null) {
    const result = await mutation(`
      mutation CreateDocument($input: CreateDocumentInput!) {
        createDocument(input: $input) {
          id
          title
        }
      }
    `, { input: { title, markdown } })
    return result.createDocument
  }

  async function listDocuments() {
    const result = await query(`
      query ListDocuments {
        documents {
          id
          title
          createdAt
          updatedAt
        }
      }
    `)
    return result.documents
  }

  async function exportMarkdown(docId) {
    const result = await query(`
      query ExportMarkdown($id: String!) {
        exportMarkdown(documentId: $id) {
          markdown
        }
      }
    `, { id: docId })
    return result.exportMarkdown.markdown
  }

  function updateNodeLocally(nodeId, newText) {
    /**
     * Update a node's text in the local reactive state.
     * This provides instant feedback before the server confirms.
     */
    if (!document.value?.ast) return
    const node = findNodeById(document.value.ast, nodeId)
    if (node) {
      node.text = newText
    }
  }

  function findNodeById(node, id) {
    if (node.id === id) return node
    if (node.children) {
      for (const child of node.children) {
        const found = findNodeById(child, id)
        if (found) return found
      }
    }
    return null
  }

  // Flat list of all editable node IDs (for cursor navigation)
  const flatNodeIds = computed(() => {
    if (!document.value?.ast) return []
    const ids = []
    function collect(node) {
      if (node.type !== 'document') {
        ids.push(node.id)
      }
      if (node.children) {
        node.children.forEach(collect)
      }
    }
    collect(document.value.ast)
    return ids
  })

  return {
    document,
    isLoading,
    error,
    flatNodeIds,
    loadDocument,
    createDocument,
    listDocuments,
    exportMarkdown,
    updateNodeLocally,
    findNodeById,
  }
}
```

#### F7. GraphQL Client (`web/src/composables/useGraphQL.js`)

```javascript
// web/src/composables/useGraphQL.js

export function useGraphQL() {
  const endpoint = '/graphql'

  async function query(queryString, variables = {}) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryString, variables }),
    })
    const result = await response.json()
    if (result.errors) {
      throw new Error(result.errors.map(e => e.message).join(', '))
    }
    return result.data
  }

  async function mutation(mutationString, variables = {}) {
    return query(mutationString, variables)
  }

  return { query, mutation }
}
```

#### F8. Main Editor Components

**`EditorView.vue`** -- Main editor container:

```vue
<!-- web/src/components/editor/EditorView.vue -->
<template>
  <div class="max-w-3xl mx-auto py-8 px-4" dir="rtl">
    <EditorToolbar
      :active-node-id="editor.activeNodeId.value"
      :document="documentState.document.value"
      @insert-node="handleInsertNode"
      @export="handleExport"
    />
    <EditorContent
      v-if="documentState.document.value?.ast"
      :ast="documentState.document.value.ast"
    />
    <div v-else-if="documentState.isLoading.value" class="text-center py-12 text-gray-500">
      ...
    </div>
    <div v-else-if="documentState.error.value" class="text-center py-12 text-red-600">
      {{ documentState.error.value }}
    </div>
  </div>
</template>

<script setup>
import { provide, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDocument } from '../../composables/useDocument.js'
import { useEditor } from '../../composables/useEditor.js'
import { useOperations } from '../../composables/useOperations.js'
import EditorToolbar from './EditorToolbar.vue'
import EditorContent from './EditorContent.vue'

const route = useRoute()
const documentState = useDocument()
const editor = useEditor(document)
const operations = useOperations(computed(() => route.params.id))

// Provide editor context to all child node components
provide('editorContext', {
  handleTextChange(nodeId, oldText, newText) {
    // Update locally for instant feedback
    documentState.updateNodeLocally(nodeId, newText)
    // Create and submit operation
    const op = operations.createUpdateTextOp(nodeId, oldText, newText)
    operations.submitOperation(op)
  },

  handleKeydown(event, nodeId, path) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      // Create new paragraph after current node
      const parentId = documentState.document.value.ast.id
      const nodeIndex = documentState.document.value.ast.children
        .findIndex(c => c.id === nodeId)
      if (nodeIndex !== -1) {
        const newNode = {
          id: `node_${Date.now().toString(36)}`,
          type: 'paragraph',
          text: '',
          children: [],
        }
        const op = operations.createInsertNodeOp(parentId, nodeIndex + 1, newNode)
        operations.submitOperation(op)
      }
    }

    if (event.key === 'Backspace') {
      const selection = window.getSelection()
      if (selection.getRangeAt(0).startOffset === 0) {
        // At beginning of node - consider merging with previous or deleting
        const target = event.target
        if (target.textContent === '') {
          event.preventDefault()
          const op = operations.createDeleteNodeOp(nodeId)
          operations.submitOperation(op)
        }
      }
    }

    // Arrow key navigation between nodes
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const direction = event.key === 'ArrowUp' ? 'up' : 'down'
      editor.navigateToNode(direction, nodeId, documentState.flatNodeIds.value)
    }
  },

  setActiveNode(nodeId) {
    editor.setActiveNode(nodeId)
  },
})

onMounted(() => {
  if (route.params.id) {
    documentState.loadDocument(route.params.id)
  }
})
</script>
```

**`EditorContent.vue`**:

```vue
<template>
  <div class="editor-content min-h-[50vh] focus-within:outline-none">
    <NodeRenderer
      v-for="(child, index) in ast.children"
      :key="child.id"
      :node="child"
      :path="[index]"
    />
  </div>
</template>

<script setup>
import NodeRenderer from './nodes/NodeRenderer.vue'

defineProps({
  ast: { type: Object, required: true },
})
</script>
```

**`EditorToolbar.vue`**:

```vue
<template>
  <div class="flex items-center gap-2 mb-6 pb-4 border-b border-gray-200">
    <!-- Node type insertion buttons -->
    <button
      v-for="action in actions"
      :key="action.type"
      @click="$emit('insert-node', action.type)"
      class="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100 transition-colors"
      :title="action.label"
    >
      {{ action.label }}
    </button>

    <div class="flex-1" />

    <!-- Export button -->
    <button
      @click="$emit('export')"
      class="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100 transition-colors"
    >
      Markdown
    </button>
  </div>
</template>

<script setup>
defineProps({
  activeNodeId: { type: String, default: null },
  document: { type: Object, default: null },
})

defineEmits(['insert-node', 'export'])

const actions = [
  { type: 'heading', label: 'H' },
  { type: 'paragraph', label: 'P' },
  { type: 'list', label: 'List' },
  { type: 'code_block', label: 'Code' },
  { type: 'blockquote', label: 'Quote' },
]
</script>
```

#### F9. Routing (`web/src/router/index.js`)

```javascript
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
  },
  {
    path: '/editor/:id',
    name: 'editor',
    component: () => import('../views/EditorPage.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
```

#### F10. Views

**`HomeView.vue`**:

```vue
<template>
  <AppLayout>
    <div class="max-w-2xl mx-auto py-12">
      <div class="flex items-center justify-between mb-8">
        <h1 class="text-2xl font-bold">Documents</h1>
        <button
          @click="createNewDocument"
          class="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors"
        >
          New Document
        </button>
      </div>

      <div v-if="isLoading" class="text-center py-12 text-gray-500">Loading...</div>

      <div v-else class="space-y-3">
        <router-link
          v-for="doc in documents"
          :key="doc.id"
          :to="{ name: 'editor', params: { id: doc.id } }"
          class="block p-4 border border-gray-200 rounded hover:border-gray-400 transition-colors"
        >
          <h2 class="font-medium">{{ doc.title || 'Untitled' }}</h2>
          <p class="text-sm text-gray-500 mt-1">
            {{ new Date(doc.updatedAt * 1000).toLocaleDateString('ar') }}
          </p>
        </router-link>
      </div>
    </div>
  </AppLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDocument } from '../composables/useDocument.js'
import AppLayout from '../components/ui/AppLayout.vue'

const router = useRouter()
const { createDocument, listDocuments } = useDocument()

const documents = ref([])
const isLoading = ref(true)

onMounted(async () => {
  documents.value = await listDocuments()
  isLoading.value = false
})

async function createNewDocument() {
  const doc = await createDocument('New Document')
  router.push({ name: 'editor', params: { id: doc.id } })
}
</script>
```

**`EditorPage.vue`**:

```vue
<template>
  <AppLayout>
    <EditorView />
  </AppLayout>
</template>

<script setup>
import AppLayout from '../components/ui/AppLayout.vue'
import EditorView from '../components/editor/EditorView.vue'
</script>
```

#### F11. Text Editing Strategy

We use `contenteditable` on individual node elements rather than a single contenteditable container. This approach:
- Maps cleanly to our node-based AST (each contenteditable is one node)
- Makes it easy to track which node is being edited
- Avoids the complexity of parsing a full contenteditable DOM tree
- Works naturally with RTL text (the browser handles bidi within each element)

**Trade-offs**:
- Requires manual cursor navigation between nodes (handled in `useEditor.js`)
- Enter key must be intercepted to create new nodes (not new DOM elements)
- Selection across nodes requires custom handling (deferred to post-MVP)

**Input debouncing**: Text changes are submitted via operations after a 300ms debounce to avoid excessive API calls during typing. The local state updates immediately for responsiveness.

#### F12. RTL Support Checklist

Every component must follow these RTL rules:
- Use `dir="rtl"` on the editor container
- Use logical CSS properties: `ps-`, `pe-`, `ms-`, `me-`, `start`, `end` instead of `pl-`, `pr-`, `ml-`, `mr-`, `left`, `right`
- Use `border-s-` / `border-e-` for directional borders
- Code blocks get `dir="ltr"` override since code is always LTR
- Test with Arabic text in every component
- Dates formatted with `ar` locale

---

### DATA & INTEGRATION PLAN

#### D1. GraphQL Schema (Full)

**Queries**:
```graphql
type Query {
  document(id: String!): DocumentType
  documents: [DocumentSummaryType!]!
  documentVersions(documentId: String!): [VersionType!]!
  version(versionId: String!): VersionDetailType
  documentOperations(documentId: String!, since: Float): [OperationType!]!
  exportMarkdown(documentId: String!): ExportResult!
}
```

**Mutations**:
```graphql
type Mutation {
  createDocument(input: CreateDocumentInput!): DocumentType!
  deleteDocument(id: String!): Boolean!
  applyOperation(documentId: String!, operation: OperationInput!): OperationResult!
  applyOperations(documentId: String!, operations: [OperationInput!]!): OperationResult!
  createVersion(input: CreateVersionInput!): VersionType!
  restoreVersion(documentId: String!, versionId: String!): DocumentType!
  importMarkdown(documentId: String!, markdown: String!): DocumentType!
}
```

#### D2. Frontend-Backend Flow

1. **Create document**: Frontend calls `createDocument` mutation -> Backend creates empty AST, persists to DB, returns document with ID
2. **Load document**: Frontend calls `document` query -> Backend loads AST from DB, returns full tree
3. **Edit text**: User types in a node -> Frontend updates local state immediately -> Frontend creates UpdateText operation -> Frontend calls `applyOperations` mutation -> Backend validates, applies to AST, persists updated snapshot + operation log -> Returns updated document
4. **Insert node**: User presses Enter or toolbar button -> Frontend creates InsertNode operation -> Same flow as edit
5. **Delete node**: User presses Backspace on empty node -> Frontend creates DeleteNode operation -> Same flow
6. **Export Markdown**: Frontend calls `exportMarkdown` query -> Backend serializes AST to Markdown -> Returns string
7. **Import Markdown**: Frontend calls `importMarkdown` mutation -> Backend parses Markdown to AST, replaces document content -> Returns updated document
8. **Version management**: Frontend calls `createVersion` -> Backend snapshots current AST state, stores version -> Returns version info

#### D3. Operation Validation Flow

When the backend receives an operation via GraphQL:

1. Convert GraphQL `OperationInput` to internal `Operation` object
2. Load current document AST from database
3. Create `OperationsEngine` with the loaded AST
4. Call `engine.apply(operation)` -- this validates and applies
5. If `OperationError` is raised, return `OperationResult(success=False, error=str(e))`
6. If successful, persist:
   a. Updated AST snapshot to `documents` table
   b. Operation to `operations` table
7. Return `OperationResult(success=True, document=updated_doc)`

For batch operations (`applyOperations`):
- All operations are applied in a single transaction
- If any operation fails, the entire batch is rolled back
- This ensures atomicity

---

### TEST PLAN

#### Backend Unit Tests

**Test files to create**:

| Test File | What it Tests | Priority |
|-----------|--------------|----------|
| `app/tests/test_ast_model.py` | ASTNode creation, serialization, deserialization, find, validate | P0 |
| `app/tests/test_operations.py` | All 5 operation types, validation, error handling, operation log | P0 |
| `app/tests/test_markdown_parser.py` | Markdown -> AST for all node types | P0 |
| `app/tests/test_markdown_serializer.py` | AST -> Markdown for all node types, round-trip | P0 |
| `app/tests/test_diff.py` | Text diff, tree diff | P1 |
| `app/tests/test_versioning.py` | Version creation, listing, restoration | P1 |
| `app/tests/test_document_repo.py` | Database persistence, CRUD, operations log | P1 |
| `app/tests/test_graphql_api.py` | GraphQL queries and mutations end-to-end | P1 |

**Test fixtures** (`app/tests/conftest.py`):

```python
import pytest
import tempfile
import os
from app.models.ast import (
    ASTNode, NodeType, ListKind, NodeMetadata,
    generate_doc_id, generate_node_id,
    create_document, create_paragraph, create_heading,
    create_list, create_code_block, create_blockquote,
)
from app.models.operations import OperationsEngine
from db.db import DatabaseManager
from app.models.document_repo import DocumentRepository


@pytest.fixture
def sample_document():
    """A document with heading, paragraph, list, code block, and blockquote."""
    doc = create_document("Test Document")
    doc.children.append(create_paragraph("This is a paragraph."))
    doc.children.append(create_list(ListKind.UNORDERED, ["Item one", "Item two", "Item three"]))
    doc.children.append(create_code_block("print('hello')", language="python"))
    doc.children.append(create_blockquote([create_paragraph("A wise quote.")]))
    return doc


@pytest.fixture
def sample_arabic_document():
    """A document with Arabic content for RTL testing."""
    doc = create_document("مقال تجريبي")
    doc.children.append(create_paragraph("هذه فقرة تجريبية باللغة العربية."))
    doc.children.append(create_list(ListKind.UNORDERED, ["عنصر أول", "عنصر ثاني"]))
    return doc


@pytest.fixture
def engine(sample_document):
    """An OperationsEngine initialized with the sample document."""
    return OperationsEngine(sample_document)


@pytest.fixture
def db():
    """A temporary SQLite database for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test.db")
        db = DatabaseManager(db_path)
        db.run_migrations()
        yield db
        db.close()


@pytest.fixture
def repo(db):
    """A DocumentRepository backed by a temporary database."""
    return DocumentRepository(db)
```

**Edge cases to test**:
- Empty document (no children)
- Document with only one node
- Deeply nested lists (3+ levels)
- Very long text in a paragraph (10,000+ characters)
- Arabic text with mixed LTR/RTL content
- Operations on non-existent nodes
- Concurrent-like operation sequences (apply, then apply conflicting op)
- Round-trip: Markdown -> AST -> Markdown preserves content
- Unicode edge cases (emoji, combining characters)
- Operation replay produces same result as direct apply

#### Frontend E2E Tests (`e2e/`)

**Test files to create**:

| Test File | What it Tests |
|-----------|--------------|
| `e2e/editor.spec.js` | Basic editor rendering, text editing, node creation |
| `e2e/document-list.spec.js` | Document list, create new document, navigate to editor |
| `e2e/rtl.spec.js` | RTL layout verification, Arabic text editing |

**Key test scenarios**:
1. Create a new document and verify it opens in the editor
2. Type text in a paragraph and verify it persists
3. Press Enter to create a new paragraph
4. Press Backspace on empty paragraph to delete it
5. Navigate between nodes with arrow keys
6. Verify heading levels render correctly
7. Verify code blocks have `dir="ltr"`
8. Verify Arabic text displays correctly in RTL layout
9. Export document as Markdown and verify content
10. Import Markdown and verify AST renders correctly

---

### IMPLEMENTATION PHASES

#### Phase 1: Core AST Model and Operations Engine (Backend)
**Agent**: python-engineer
**Estimated effort**: Medium
**Files**:
- `requirements.txt`
- `app/__init__.py`, `app/models/__init__.py`, `app/libs/__init__.py`
- `app/models/ast.py` -- full AST schema with validation
- `app/models/operations.py` -- all 5 operations + engine
- `app/tests/__init__.py`, `app/tests/conftest.py`
- `app/tests/test_ast_model.py`
- `app/tests/test_operations.py`

**Definition of done**: All AST model tests and operations tests pass.
**Independently testable**: Yes. Run `python -m pytest app/tests/test_ast_model.py app/tests/test_operations.py -v`

#### Phase 2: Markdown Parser and Serializer (Backend)
**Agent**: python-engineer
**Estimated effort**: Medium
**Files**:
- `app/libs/markdown_parser.py`
- `app/libs/markdown_serializer.py`
- `app/tests/test_markdown_parser.py`
- `app/tests/test_markdown_serializer.py`

**Definition of done**: All parser and serializer tests pass. Round-trip conversion works.
**Independently testable**: Yes. `python -m pytest app/tests/test_markdown_parser.py app/tests/test_markdown_serializer.py -v`

#### Phase 3: Diff and Versioning (Backend)
**Agent**: python-engineer
**Estimated effort**: Small
**Files**:
- `app/libs/diff.py`
- `app/models/versioning.py`
- `app/tests/test_diff.py`
- `app/tests/test_versioning.py`

**Definition of done**: Diff and versioning tests pass.
**Independently testable**: Yes.

#### Phase 4: Database and Persistence (Backend)
**Agent**: python-engineer
**Estimated effort**: Medium
**Files**:
- `db/__init__.py`
- `db/db.py`
- `db/migrations/__init__.py`
- `db/migrations/001_initial_schema.py`
- `app/models/document_repo.py`
- `app/tests/test_document_repo.py`

**Definition of done**: Document CRUD, operation log persistence, version persistence all work via tests.
**Independently testable**: Yes. `python -m pytest app/tests/test_document_repo.py -v`

#### Phase 5: GraphQL API (Backend)
**Agent**: python-engineer
**Estimated effort**: Medium
**Files**:
- `app/main.py`
- `app/gql/__init__.py`
- `app/gql/schema.py`
- `app/gql/types.py`
- `app/gql/queries/__init__.py`
- `app/gql/queries/document_queries.py`
- `app/gql/mutations/__init__.py`
- `app/gql/mutations/document_mutations.py`
- `app/tests/test_graphql_api.py`

**Definition of done**: GraphQL API serves all queries and mutations. Integration tests pass.
**Independently testable**: Yes. `python -m pytest app/tests/test_graphql_api.py -v`

#### Phase 6: Frontend Scaffolding and Editor Components (Frontend)
**Agent**: ui-engineer
**Estimated effort**: Large
**Prerequisites**: Phase 5 (needs API to test against)
**Files**:
- All `web/` files listed in F1-F12 above
- `web/package.json`, `web/vite.config.js`, `web/index.html`
- All component files
- All composable files
- Router and views

**Definition of done**: Editor renders a document from the API, user can type text, create new paragraphs, delete empty paragraphs. Arabic text displays correctly in RTL.
**Independently testable**: Yes, via dev server + manual testing initially.

#### Phase 6 -- Detailed Sub-Tasks

Phase 6 is broken into 8 ordered sub-tasks. Each sub-task is self-contained and produces a testable deliverable. Sub-tasks MUST be executed in order because each builds on the previous one.

---

##### Sub-Task 6.1: Project Scaffolding and Toolchain

**Agent**: ui-engineer
**Estimated effort**: Small
**Prerequisites**: None (no dependency on other sub-tasks)

**Goal**: Create the Vue 3 + Vite + Tailwind CSS project skeleton with correct RTL configuration and dev server proxy to the Flask backend.

**Files to create**:
- `web/package.json` (via `npm create vite@latest`)
- `web/vite.config.js` -- Vite config with Tailwind plugin and `/graphql` proxy to `http://localhost:5000`
- `web/index.html` -- `<html lang="ar" dir="rtl">`, title "Kurras"
- `web/src/main.js` -- App entry with `createApp`, router, and global styles
- `web/src/App.vue` -- Root component with `<router-view />`
- `web/src/style.css` -- Tailwind import: `@import "tailwindcss";`
- `/Users/mohanad/Workspace/editor/package.json` -- Monorepo root with scripts: `ui:check`, `ui:debug`, `ui:clean`

**Steps**:
1. From `/Users/mohanad/Workspace/editor`, run `npm create vite@latest web -- --template vue`
2. `cd web && npm install`
3. Install Tailwind: `npm install -D tailwindcss @tailwindcss/vite`
4. Install Vue Router: `npm install vue-router@4`
5. Edit `web/vite.config.js` to add Tailwind plugin and proxy:
   ```javascript
   import { defineConfig } from 'vite'
   import vue from '@vitejs/plugin-vue'
   import tailwindcss from '@tailwindcss/vite'
   export default defineConfig({
     plugins: [vue(), tailwindcss()],
     server: {
       proxy: {
         '/graphql': 'http://localhost:5000'
       }
     }
   })
   ```
6. Edit `web/index.html`: set `<html lang="ar" dir="rtl">`, `<title>Kurras</title>`, body class `bg-white text-black antialiased`
7. Create `web/src/style.css` with `@import "tailwindcss";`
8. Create `web/src/main.js` importing style.css, creating app, using router
9. Create `web/src/App.vue` with `<router-view />`
10. Create root `package.json` with monorepo scripts:
    - `"ui:check": "cd e2e && npx playwright test"`
    - `"ui:debug": "cd e2e && npx playwright test --headed"`
    - `"ui:clean": "rm -rf artifacts/playwright/screenshots/*"`
11. Create placeholder `web/src/router/index.js` with empty routes array
12. Create empty directories: `web/src/composables/`, `web/src/components/editor/`, `web/src/components/editor/nodes/`, `web/src/components/ui/`, `web/src/views/`

**Verification**: `cd web && npm run dev` starts without errors. The browser at `http://localhost:5173` shows a blank white page with RTL direction.

**Definition of done**: Vite dev server starts, page renders in RTL, Tailwind classes work, `/graphql` proxy is configured.

---

##### Sub-Task 6.2: GraphQL Client Composable

**Agent**: ui-engineer
**Prerequisites**: Sub-Task 6.1

**Goal**: Create the `useGraphQL` composable -- a thin wrapper around `fetch` for sending GraphQL queries and mutations to `/graphql`.

**File to create**: `web/src/composables/useGraphQL.js`

**Implementation** (follow the plan in section F7 exactly):
```javascript
export function useGraphQL() {
  const endpoint = '/graphql'

  async function query(queryString, variables = {}) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryString, variables }),
    })
    const result = await response.json()
    if (result.errors) {
      throw new Error(result.errors.map(e => e.message).join(', '))
    }
    return result.data
  }

  async function mutation(mutationString, variables = {}) {
    return query(mutationString, variables)
  }

  return { query, mutation }
}
```

**Verification**: Import in browser console or test file; no syntax errors. Full integration test deferred to Sub-Task 6.5.

**Definition of done**: File exists, exports `useGraphQL` function that returns `{ query, mutation }`.

---

##### Sub-Task 6.3: Document Composable

**Agent**: ui-engineer
**Prerequisites**: Sub-Task 6.2

**Goal**: Create the `useDocument` composable for document state management -- loading, creating, listing documents, local state updates.

**File to create**: `web/src/composables/useDocument.js`

**Implementation** (follow plan section F6). Key functions:
- `loadDocument(docId)` -- query `document(id: $id)` with full AST (3 levels deep for children)
- `createDocument(title, markdown)` -- mutation `createDocument(input: $input)`
- `listDocuments()` -- query `documents` (summary: id, title, createdAt, updatedAt)
- `exportMarkdown(docId)` -- query `exportMarkdown(documentId: $id)`
- `updateNodeLocally(nodeId, newText)` -- update reactive state immediately
- `findNodeById(node, id)` -- recursive find in the AST tree
- `flatNodeIds` -- computed list of all editable node IDs in tree order

**GraphQL field names** (from backend `types.py`, Strawberry converts snake_case to camelCase):
- `ASTNodeType` fields: `id`, `type`, `text`, `level`, `listKind`, `languageHint`, `children`
- `DocumentType` fields: `id`, `title`, `ast`, `createdAt`, `updatedAt`
- `DocumentSummaryType` fields: `id`, `title`, `createdAt`, `updatedAt`
- `ExportResult` fields: `markdown`
- Query names: `document`, `documents`, `exportMarkdown`
- Mutation names: `createDocument`
- Input type: `CreateDocumentInput` with fields `title`, `markdown`

**Important**: The AST query must request children recursively. Since GraphQL doesn't support recursive fragments, hardcode 4 levels deep (document -> children -> children -> children -> children). This covers headings, paragraphs, lists with items, blockquotes with paragraphs, and nested lists.

**Verification**: No syntax errors. Import works. Full integration tested in Sub-Task 6.5.

**Definition of done**: File exists with all functions listed above. Uses `useGraphQL` for all API calls.

---

##### Sub-Task 6.4: Operations Composable

**Agent**: ui-engineer
**Prerequisites**: Sub-Task 6.2

**Goal**: Create the `useOperations` composable for creating and submitting AST operations to the backend.

**File to create**: `web/src/composables/useOperations.js`

**Implementation** (follow plan section F5). Key functions:
- `createUpdateTextOp(nodeId, oldText, newText)` -- returns `{ update_text: { node_id, offset: 0, new_text, delete_count } }`
- `createInsertNodeOp(parentId, position, node)` -- returns `{ insert_node: { parent_id, position, node } }`
- `createDeleteNodeOp(nodeId)` -- returns `{ delete_node: { node_id } }`
- `submitOperation(operation)` -- push to pending queue, flush
- `flushOperations()` -- batch-send pending ops via `applyOperations` mutation

**GraphQL mutation for `applyOperations`** (from backend `document_mutations.py`):
- Mutation name: `applyOperations`
- Variables: `documentId: String!`, `operations: [OperationInput!]!`
- `OperationInput` has fields: `insertNode`, `deleteNode`, `updateText`, `replaceNode`, `moveNode` (exactly one must be set)
- `InsertNodeInput`: `parentId: String!`, `position: Int!`, `node: ASTNodeInput!`
- `DeleteNodeInput`: `nodeId: String!`
- `UpdateTextInput`: `nodeId: String!`, `offset: Int!`, `newText: String!`, `deleteCount: Int!`
- `ASTNodeInput`: `id: String!`, `type: NodeTypeGQL!`, `text: String`, `level: Int`, `listKind: ListKindGQL`, `languageHint: String`, `children: [ASTNodeInput!]!`

**IMPORTANT NOTE on field name casing**: Strawberry GraphQL converts Python snake_case to camelCase in the schema. So:
- Python `insert_node` -> GraphQL `insertNode`
- Python `parent_id` -> GraphQL `parentId`
- Python `node_id` -> GraphQL `nodeId`
- Python `new_text` -> GraphQL `newText`
- Python `delete_count` -> GraphQL `deleteCount`
- Python `list_kind` -> GraphQL `listKind`
- Python `language_hint` -> GraphQL `languageHint`
- Python `document_id` -> GraphQL `documentId`

The operation input objects sent to GraphQL must use camelCase keys!

**Verification**: No syntax errors. Import works.

**Definition of done**: File exists with all functions. Operations are batched in `pendingOps` ref and flushed via mutation.

---

##### Sub-Task 6.5: Node Renderer Components

**Agent**: ui-engineer
**Prerequisites**: Sub-Task 6.1 (directories exist)

**Goal**: Create all 7 node renderer components that convert AST nodes to DOM elements.

**Files to create**:
- `web/src/components/editor/nodes/NodeRenderer.vue` -- Dynamic dispatch component
- `web/src/components/editor/nodes/ParagraphNode.vue` -- `<p contenteditable>`
- `web/src/components/editor/nodes/HeadingNode.vue` -- `<h1>` through `<h6> contenteditable>`
- `web/src/components/editor/nodes/ListNode.vue` -- `<ul>` or `<ol>` container
- `web/src/components/editor/nodes/ListItemNode.vue` -- `<li contenteditable>` with nested children support
- `web/src/components/editor/nodes/CodeBlockNode.vue` -- `<pre><code contenteditable>` with `dir="ltr"`
- `web/src/components/editor/nodes/BlockquoteNode.vue` -- `<blockquote>` with child NodeRenderers

**Implementation** (follow plan sections F3 exactly). Key patterns:
- All editable nodes (`ParagraphNode`, `HeadingNode`, `ListItemNode`, `CodeBlockNode`) use `contenteditable="true"` and handle `@input`, `@keydown`, `@focus` events
- All editable nodes `inject('editorContext')` to call `handleTextChange`, `handleKeydown`, `setActiveNode`
- Each node has `data-node-id` attribute and `id` attribute set to `node.id`
- `NodeRenderer` uses a `componentMap` object to dispatch by `node.type`

**RTL rules** (critical):
- Use `ps-6` not `pl-6` (padding-start for list indentation)
- Use `pe-4`, `ps-0` not `pr-4`, `pl-0` (blockquote padding)
- Use `border-e-4` not `border-l-4` (blockquote border -- border-end for RTL)
- CodeBlockNode gets explicit `dir="ltr"` on the `<pre>` element
- No `text-right` or `text-left` -- let `dir="rtl"` handle text alignment

**Verification**: Components compile without errors. Visual verification deferred to Sub-Task 6.7.

**Definition of done**: All 7 component files exist, follow the contenteditable pattern, use logical CSS properties.

---

##### Sub-Task 6.6: Editor Composable (Cursor Model)

**Agent**: ui-engineer
**Prerequisites**: Sub-Task 6.1

**Goal**: Create the `useEditor` composable for cursor tracking and node navigation.

**File to create**: `web/src/composables/useEditor.js`

**Implementation** (follow plan section F4). Key functions:
- `activeNodeId` ref -- currently focused node
- `cursorOffset` ref -- character offset within active node
- `setActiveNode(nodeId)` -- update active node, sync cursor offset from browser selection
- `setCursor(nodeId, offset)` -- programmatically set cursor position in the DOM
- `navigateToNode(direction, currentNodeId, flatNodes)` -- move focus to previous/next node

**IMPORTANT**: The `useEditor` function in the plan takes `document` as parameter (referring to the DOM `document` object). In a Vue composable, use the global `document` directly or accept it as a parameter. Be careful not to shadow the reactive document state from `useDocument`.

**Verification**: No syntax errors. Import works.

**Definition of done**: File exists with cursor management functions. Uses browser Selection API for cursor positioning.

---

##### Sub-Task 6.7: Main Editor and Layout Components

**Agent**: ui-engineer
**Prerequisites**: Sub-Tasks 6.3, 6.4, 6.5, 6.6 (all composables and node components)

**Goal**: Create the main editor container, toolbar, content area, layout, and page views. Wire everything together.

**Files to create**:
- `web/src/components/editor/EditorView.vue` -- Main editor container (follows plan F8)
- `web/src/components/editor/EditorContent.vue` -- Renders AST children via NodeRenderer
- `web/src/components/editor/EditorToolbar.vue` -- Formatting buttons (H, P, List, Code, Quote) + Export button
- `web/src/components/ui/AppLayout.vue` -- Base layout with header
- `web/src/views/HomeView.vue` -- Document list page
- `web/src/views/EditorPage.vue` -- Editor page wrapper

**File to modify**:
- `web/src/router/index.js` -- Add routes: `/` -> HomeView, `/editor/:id` -> EditorPage

**EditorView.vue is the integration point**. It:
1. Loads document via `useDocument().loadDocument(route.params.id)` on mount
2. Creates editor state via `useEditor()`
3. Creates operations via `useOperations(documentId)`
4. Provides `editorContext` to all child nodes via `provide('editorContext', {...})`
5. The provided context includes: `handleTextChange`, `handleKeydown`, `setActiveNode`

**editorContext.handleTextChange** flow:
1. Call `documentState.updateNodeLocally(nodeId, newText)` for instant feedback
2. Call `operations.createUpdateTextOp(nodeId, oldText, newText)` to build the op
3. Call `operations.submitOperation(op)` to send to backend

**editorContext.handleKeydown** flow:
- **Enter** (without Shift): Prevent default, find current node index in parent's children, create InsertNode op for a new paragraph at index+1
- **Backspace** at offset 0 with empty text: Prevent default, create DeleteNode op
- **ArrowUp/ArrowDown**: Call `editor.navigateToNode(direction, nodeId, flatNodeIds)`

**AppLayout.vue**: Simple layout with header containing "Kurras" title. Black/white aesthetic. Example:
```html
<div class="min-h-screen">
  <header class="border-b border-gray-200 px-6 py-4">
    <router-link to="/" class="text-xl font-bold">Kurras</router-link>
  </header>
  <main class="px-6">
    <slot />
  </main>
</div>
```

**HomeView.vue**: Lists documents, "New Document" button. On create, navigate to `/editor/:id`. Date formatting uses `ar` locale.

**Input debouncing**: Add a 300ms debounce to `handleTextChange` in EditorView so text update operations are not sent on every keystroke. Local state updates immediately; the operation submission is debounced. A simple approach:
```javascript
let debounceTimer = null
function debouncedSubmit(op) {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    operations.submitOperation(op)
  }, 300)
}
```

**Verification**: Start backend (`python -m app.main`), start frontend (`cd web && npm run dev`). Create a document from the home page, navigate to editor, see the document title rendered.

**Definition of done**: Full editor flow works: home page lists documents, creating a document navigates to editor, editor renders AST, typing updates text, Enter creates new paragraph, Backspace on empty paragraph deletes it.

---

##### Sub-Task 6.8: Import/Export and Version Features

**Agent**: ui-engineer
**Prerequisites**: Sub-Task 6.7 (editor is functional)

**Goal**: Add Markdown export, Markdown import, and version management UI.

**Files to create**:
- `web/src/components/ui/ImportExportDialog.vue` -- Modal dialog for Markdown import/export

**Files to modify**:
- `web/src/composables/useDocument.js` -- Add `importMarkdown(docId, markdown)` function
- `web/src/components/editor/EditorToolbar.vue` -- Add Import button, Version button
- `web/src/components/editor/EditorView.vue` -- Wire up export/import handlers, add import dialog

**Import function** (to add to useDocument.js):
```javascript
async function importMarkdown(docId, markdown) {
  const result = await mutation(`
    mutation ImportMarkdown($docId: String!, $markdown: String!) {
      importMarkdown(documentId: $docId, markdown: $markdown) {
        id
        title
        ast { /* same recursive fragment as loadDocument */ }
      }
    }
  `, { docId, markdown })
  document.value = result.importMarkdown
  return result.importMarkdown
}
```

**Export flow**: User clicks "Export" -> call `exportMarkdown(docId)` -> open a modal or textarea showing the Markdown text, with a "Copy" button.

**Import flow**: User clicks "Import" -> open a modal with a `<textarea>` -> user pastes Markdown -> click "Import" -> call `importMarkdown(docId, markdown)` -> editor re-renders with new AST.

**Version management** (stretch goal for this sub-task, can be deferred):
- Add `createVersion(docId, label)` and `listVersions(docId)` to useDocument
- Simple version list sidebar or dropdown
- Restore version button

**ImportExportDialog.vue**: A modal dialog component. Black/white aesthetic. Example structure:
```html
<div v-if="visible" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" @click.self="$emit('close')">
  <div class="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-auto">
    <h2 class="text-lg font-bold mb-4">{{ title }}</h2>
    <slot />
    <div class="flex justify-end gap-2 mt-4">
      <button @click="$emit('close')" class="px-4 py-2 border border-gray-300 rounded">Cancel</button>
      <slot name="actions" />
    </div>
  </div>
</div>
```

**Verification**: Export a document to Markdown and verify the content. Import Markdown and verify the editor re-renders correctly.

**Definition of done**: Export shows Markdown in a dialog with copy functionality. Import accepts Markdown text and replaces document content.

---

#### Phase 7: E2E Tests (Frontend)
**Agent**: ui-engineer
**Estimated effort**: Small
**Prerequisites**: Phase 6
**Files**:
- `e2e/editor.spec.js`
- `e2e/document-list.spec.js`
- `e2e/rtl.spec.js`

**Definition of done**: All Playwright tests pass.

#### Phase 8: Code Review and Security Review
**Agent**: code-reviewer, then security-reviewer
**Prerequisites**: All phases complete
**Focus areas**:
- code-reviewer: Correctness, design, style, tests, RTL compliance
- security-reviewer: Input validation on GraphQL mutations, SQL injection prevention, XSS via contenteditable

---

### Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| contenteditable is notoriously difficult across browsers | High | Keep per-node contenteditable simple; intercept all structural changes as operations; avoid relying on browser DOM mutations for structure |
| Cursor navigation between nodes may feel janky | Medium | Invest in smooth `useEditor.js` cursor management; test with Arabic text extensively |
| Operation conflict if browser state drifts from server state | Medium | Always treat server response as authoritative; re-render AST from server after operations |
| Markdown round-trip may not be perfect for all edge cases | Medium | Use CommonMark-compliant parser; accept some normalization (e.g., whitespace) |
| Performance with large documents (1000+ nodes) | Low (MVP) | Defer; current approach is fine for typical article sizes |
| Security: user-generated content rendered via contenteditable | High | Never use `v-html`; always use text content; sanitize on server side |

---

## Decisions

- **AST representation**: Single `ASTNode` dataclass with type-specific optional fields, rather than separate classes per node type. Rationale: simpler serialization, easier tree traversal, fewer classes to maintain.
- **Markdown parsing**: Use `markdown-it-py` library for parsing (produces token stream, not HTML). Hand-write the serializer since we control the AST structure.
- **Text editing**: Use per-node `contenteditable` rather than a single contenteditable container or a fully custom text input. Rationale: cleanest mapping to AST nodes, simplest implementation for MVP.
- **Database**: SQLite with JSON-serialized AST snapshots. Operation log is append-only in a separate table. Versions store full snapshots (not just diffs). Rationale: simple, fast, no external dependencies.
- **Frontend state**: Optimistic local updates with server reconciliation. Local state updates immediately on keystrokes; operations are batched and sent to server; server response is authoritative.
- **RTL approach**: Set `dir="rtl"` on the editor container; use logical CSS properties everywhere; code blocks override to `dir="ltr"`.

## Open Questions

1. [TECH LEAD] Should we use a debounce (e.g., 300ms) for sending text update operations to the server, or send on every keystroke? **Recommendation**: Debounce at 300ms to reduce API calls, with immediate local state update.
2. [TECH LEAD] For cross-node text selection (selecting across multiple paragraphs), should we support this in MVP or defer? **Recommendation**: Defer to post-MVP.
3. [TECH LEAD] Should the operation log be pruned after creating a version snapshot, or kept indefinitely? **Recommendation**: Keep indefinitely for MVP; add pruning later if storage becomes a concern.

## Log

### [TECH LEAD] 2026-04-12T20:00
- Explored repository: completely empty (no app/, web/, db/ directories). Only .claude/agents/ and CLAUDE.md exist.
- Read all agent definitions (python-engineer, ui-engineer, code-reviewer, security-reviewer).
- Created comprehensive implementation plan covering 8 phases.
- Plan covers: AST model, operations engine, Markdown parser/serializer, diff system, versioning, database persistence, GraphQL API, Vue 3 editor with RTL support, and testing.
- Documented all data structures, function signatures, component designs, and file paths.

### [PYTHON ENGINEER] 2026-04-12T20:30
- Read the plan and session context.
- Starting backend work on Phase 1: Core AST Model, Operations Engine, and tests.
- Will create: project scaffolding, `app/models/ast.py`, `app/models/operations.py`, `app/tests/conftest.py`, `app/tests/test_ast_model.py`, `app/tests/test_operations.py`.

### [PYTHON ENGINEER] 2026-04-12T20:45
- Phase 1 backend implementation complete. All files created and all tests passing.

**Files created:**
- `app/__init__.py` -- package init
- `app/models/__init__.py` -- package init
- `app/libs/__init__.py` -- package init
- `app/tests/__init__.py` -- package init
- `requirements.txt` -- Python dependencies (flask, strawberry-graphql, markdown-it-py, pytest)
- `app/models/ast.py` -- AST model with NodeType, ListKind, NodeMetadata, ASTNode (find_node, find_parent, depth, node_count, validate, to_dict, from_dict), and factory functions (create_document, create_paragraph, create_heading, create_list, create_code_block, create_blockquote)
- `app/models/operations.py` -- Operations engine with OpType, Operation (to_dict, from_dict), factory functions (insert_node, delete_node, update_text, replace_node, move_node), OperationError, and OperationsEngine (apply, apply_batch, _apply_insert, _apply_delete, _apply_update_text, _apply_replace, _apply_move, get_operation_log, replay)
- `app/tests/conftest.py` -- Test fixtures: sample_document, sample_arabic_document, engine
- `app/tests/test_ast_model.py` -- 63 tests covering ID generation, factory functions, serialization round-trips, tree traversal, node_count/depth, and validation
- `app/tests/test_operations.py` -- 50 tests covering insert (11), delete (5), update_text (11), replace (4), move (8), operation log/replay/batch (5), operation serialization (5), engine init (2)

**Test results:** 113 passed in 0.07s (python3 -m pytest app/tests/ -v)

**Key implementation notes:**
- `validate()` returns a list of error strings (empty = valid) and cascades to children recursively
- `_apply_move()` stores `original_index` before popping and restores the node on any validation failure (subtree check, missing parent, position bounds)
- `create_heading()` factory uses `ValueError` for invalid levels (matching plan's `assert` pattern but with a proper exception)
- All operation factories set sensible defaults (actor="user", delete_count=0)
- Arabic text round-trip tested in both AST model and operations tests

### [PYTHON ENGINEER] 2026-04-12T21:15
- Read the plan and session context.
- Starting backend work on Phase 2: Markdown Parser and Serializer.

### [PYTHON ENGINEER] 2026-04-12T21:30
- Phase 2 backend implementation complete. All files created and all tests passing.

**Files created:**
- `app/libs/markdown_parser.py` -- MarkdownParser class using markdown-it-py (CommonMark mode). Handles: headings (h1-h6), paragraphs, fenced code blocks with language hint, indented code blocks, unordered lists, ordered lists, nested lists (recursive), blockquotes (including nested). Produces valid AST trees that pass `validate()`.
- `app/libs/markdown_serializer.py` -- MarkdownSerializer class. Handles all node types: headings with `#` prefix, paragraphs as plain text, fenced code blocks with optional language, lists with `- ` or `1. ` prefix, nested lists with 4-space indentation per level, blockquotes with `> ` prefix per line. Raises ValueError for non-document input.
- `app/tests/test_markdown_parser.py` -- 32 tests covering: headings (4 tests), paragraphs (3), unordered lists (3), ordered lists (2), nested lists (3), fenced code blocks (5), indented code blocks (2), blockquotes (3), nested blockquotes (2), mixed document (2), Arabic text (3), empty document (3), document structure/IDs (3).
- `app/tests/test_markdown_serializer.py` -- 33 tests covering: headings (3 tests), paragraphs (2), code blocks (3), unordered lists (2), ordered lists (2), nested lists (2), blockquotes (3), round-trip fidelity (4), Arabic text (2), empty document (1), full document (2), error handling (1), plus additional nested ordered-inside-unordered and multi-paragraph blockquote tests.

**Test results:** 178 passed in 0.10s (python3 -m pytest app/tests/ -v)
- Phase 1 tests: 113 passed (unchanged)
- Phase 2 tests: 65 new tests passed

**Key implementation notes:**
- Removed the dead code line from the plan (`if item_tokens[j].type == item_tokens[j - len(nested_tokens) - 1].type if False else False: pass`) as instructed.
- Nested list handling uses proper depth tracking for both `bullet_list_open/close` and `ordered_list_open/close` to correctly handle mixed nesting (e.g., ordered inside unordered).
- The serializer's `serialize()` joins top-level nodes with `\n\n` and appends a trailing newline, except for empty documents which return `""`.
- Round-trip tests verify structural equivalence (re-parse serialized output and compare AST types, text, levels, list kinds) rather than exact whitespace match, since CommonMark normalization may adjust whitespace.
- All parsed documents pass `validate()` -- this is verified in dedicated test cases for every node type.

### [PYTHON ENGINEER] 2026-04-12T22:00
- Read the plan and session context.
- Starting backend work on Phase 3: Diff System and Versioning.

### [PYTHON ENGINEER] 2026-04-12T22:15
- Phase 3 backend implementation complete. All files created and all tests passing.

**Files created:**
- `app/libs/diff.py` -- Diff system with two functions: `diff_text(node_id, old_text, new_text)` produces minimal UpdateText operations using `difflib.SequenceMatcher` with reverse-order opcode processing so offsets remain valid; `diff_trees(old_doc, new_doc)` produces operations to transform one AST document into another by comparing immediate children (delete missing nodes, insert new nodes, diff text or replace for modified nodes).
- `app/models/versioning.py` -- Versioning system with `Version` dataclass (version_id, document_id, snapshot, operations_since_previous, created_at, label, actor, to_dict/from_dict) and `VersionManager` class (create_version with deep-copied snapshots, get_version, get_latest_version, list_versions with summary dicts, restore_version returning deep copies).
- `app/tests/test_diff.py` -- 35 tests covering: text insert (4), text delete (4), text replace (4), text no-change (2), text apply/roundtrip (8), Arabic text diff (4), tree added nodes (2), tree deleted nodes (2), tree modified text (3), tree no-change (2).
- `app/tests/test_versioning.py` -- 18 tests covering: version creation and fields (1), serialization round-trip (4), create version with deep copy (2), multiple versions (1), get version (3), get latest version (2), restore version with isolation (3), list versions with summaries (3).

**Test results:** 231 passed in 0.10s (python3 -m pytest app/tests/ -v)
- Phase 1 tests: 113 passed (unchanged)
- Phase 2 tests: 65 passed (unchanged)
- Phase 3 tests: 53 new tests passed (35 diff + 18 versioning)

**Key implementation notes:**
- `diff_text()` processes SequenceMatcher opcodes in reverse order so that character offsets remain valid when operations are applied sequentially (right-to-left editing preserves left-side offsets).
- All `diff_text` test cases include apply-and-verify tests: the generated operations are applied via `OperationsEngine.apply_batch()` and the result is compared to the expected new text. This validates the end-to-end correctness of the diff system.
- Arabic text diffing works correctly with SequenceMatcher since Python strings are Unicode-native. Four Arabic-specific test cases verify insert, replace, delete, and complex multi-region diffs.
- `diff_trees()` is a simplified top-level diff (immediate children of document) as specified in the plan. It handles three cases: deleted nodes, inserted nodes, and modified nodes (text-only changes use `diff_text`, structural changes use `replace_node`).
- `Version.snapshot` is stored as a `copy.deepcopy()` of the document, ensuring isolation from subsequent mutations. `restore_version()` also returns a deep copy.
- `VersionManager` auto-increments version IDs as `v_1`, `v_2`, etc. using an internal counter.
- `list_versions()` returns summary dicts with `node_count` (via `ASTNode.node_count()`) and `ops_count` for lightweight version browsing.

### [PYTHON ENGINEER] 2026-04-12T23:00
- Read the plan and session context.
- Starting backend work on Phase 4: Database and Persistence.

### [PYTHON ENGINEER] 2026-04-12T23:15
- Phase 4 backend implementation complete. All files created and all tests passing.

**Files created:**
- `db/__init__.py` -- package init
- `db/migrations/__init__.py` -- package init
- `db/db.py` -- DatabaseManager class wrapping SQLite with WAL journal mode, foreign key enforcement, parameterized queries (execute, executemany, commit, close), and migration runner (run_migrations) that tracks applied migrations in _migrations table and runs pending .py files from db/migrations/ in sorted order.
- `db/migrations/001_initial_schema.py` -- Initial schema migration with three tables (documents, operations, versions), two indexes (idx_operations_document, idx_versions_document), and both up(db) and down(db) functions.
- `app/models/document_repo.py` -- DocumentRepository persistence layer with: create_document, get_document, update_document (with COALESCE for title preservation), delete_document (cascading to operations and versions), list_documents (ordered by updated_at DESC); append_operation, append_operations (batch via executemany), get_operations (with optional since timestamp filter); save_version, get_version, list_versions (ordered by created_at ASC). All queries use parameterized ? placeholders.
- `app/tests/test_document_repo.py` -- 22 tests across 4 test classes: TestDocumentCRUD (9 tests: create+get, not found, update, title preservation, delete with cascade, delete not found, list order, list empty, complex AST round-trip), TestOperationsPersistence (5 tests: append+get, batch append, since filter, empty, serialization roundtrip), TestVersionsPersistence (5 tests: save+get, not found, list order, list empty, empty ops), TestFullWorkflow (3 tests: full create-apply-persist-version workflow, Arabic content workflow, multiple versions workflow).

**Files modified:**
- `app/tests/conftest.py` -- Added db and repo fixtures (temporary SQLite database with migrations, DocumentRepository backed by temp db).

**Test results:** 253 passed in 0.17s (python3 -m pytest app/tests/ -v)
- Phase 1 tests: 113 passed (unchanged)
- Phase 2 tests: 65 passed (unchanged)
- Phase 3 tests: 53 passed (unchanged)
- Phase 4 tests: 22 new tests passed

**Key implementation notes:**
- DatabaseManager creates the parent directory for db_path if it does not exist (handles both absolute and relative paths).
- Migration runner uses importlib.import_module to load migration files dynamically, matching the plan's module_name pattern `db.migrations.{name}`.
- `update_document()` uses `COALESCE(?, title)` so passing title=None preserves the existing title in the database -- this is tested explicitly.
- `delete_document()` deletes operations and versions first (respecting foreign key constraints), then deletes the document itself, and returns True/False based on rowcount.
- `get_operations(since=...)` uses strict greater-than comparison (`applied_at > ?`) so that the timestamp boundary operation is excluded.
- All version ops_since_previous data is stored as a JSON array and deserialized back to Operation objects on retrieval. Empty/null ops_since_previous is handled with `json.loads(row["ops_since_previous"] or "[]")`.
- Arabic content (Unicode) round-trips correctly through JSON serialization in SQLite TEXT columns.

### [PYTHON ENGINEER] 2026-04-12T23:45
- Read the plan and session context.
- Starting backend work on Phase 5: GraphQL API.

### [PYTHON ENGINEER] 2026-04-13T00:15
- Phase 5 backend implementation complete. All files created and all tests passing.

**Files created:**
- `app/gql/__init__.py` -- package init
- `app/gql/queries/__init__.py` -- package init
- `app/gql/mutations/__init__.py` -- package init
- `app/gql/types.py` -- Strawberry GraphQL type definitions with 3 enums (NodeTypeGQL, ListKindGQL, OpTypeGQL), 8 output types (ASTNodeType, DocumentType, DocumentSummaryType, OperationType, VersionType, VersionDetailType, OperationResult, ExportResult), 9 input types (ASTNodeInput, InsertNodeInput, DeleteNodeInput, UpdateTextInput, ReplaceNodeInput, MoveNodeInput, OperationInput, CreateDocumentInput, CreateVersionInput), and 6 converter helpers (ast_node_to_gql, gql_input_to_ast_node, operation_input_to_operation, operation_to_gql, document_row_to_summary, version_row_to_gql).
- `app/gql/queries/document_queries.py` -- DocumentQueries class with 6 query resolvers: document (by ID with full AST), documents (list summaries), document_versions (list versions), version (get version with AST), document_operations (operation log with optional since filter), export_markdown (serialize to Markdown). All resolvers access DocumentRepository via Strawberry info.context.
- `app/gql/mutations/document_mutations.py` -- DocumentMutations class with 7 mutation resolvers: create_document (with optional Markdown import and title extraction), delete_document, apply_operation (single op with OperationsEngine validation), apply_operations (batch atomic), create_version (snapshot with auto-incrementing version IDs), restore_version (restore from snapshot preserving doc ID), import_markdown (replace content preserving doc ID with title extraction).
- `app/gql/schema.py` -- Root Strawberry schema combining DocumentQueries and DocumentMutations.
- `app/main.py` -- Flask app factory with create_app(db_path) function. Initializes DatabaseManager, runs migrations, creates DocumentRepository, sets up /graphql endpoint with custom KurrasGraphQLView that injects repo into context. Includes __main__ entry point on port 5000.
- `app/tests/test_graphql_api.py` -- 26 integration tests using Flask test client with temporary SQLite database. Tests organized in 8 test classes: TestCreateDocument (3 tests: with title, from Markdown, no title), TestGetDocument (2 tests: found, not found), TestListDocuments (2 tests: with docs, empty), TestDeleteDocument (2 tests: success, not found), TestApplyOperation (5 tests: insert, update_text, delete, error, doc not found), TestApplyOperationsBatch (1 test: multiple ops), TestVersions (5 tests: create, list, detail, restore, not found), TestExportMarkdown (2 tests: export, not found), TestImportMarkdown (2 tests: import, not found), TestDocumentOperations (2 tests: operations log, empty log).

**Test results:** 279 passed in 0.32s (python3 -m pytest app/tests/ -v)
- Phase 1 tests: 113 passed (unchanged)
- Phase 2 tests: 65 passed (unchanged)
- Phase 3 tests: 53 passed (unchanged)
- Phase 4 tests: 22 passed (unchanged)
- Phase 5 tests: 26 new tests passed

**Key implementation notes:**
- Custom `KurrasGraphQLView` subclass overrides `get_context()` to inject the `DocumentRepository` into Strawberry's info.context, making it available to all resolvers without global state.
- `OperationInput` is a union-like input type: exactly one of its fields (insert_node, delete_node, update_text, replace_node, move_node) must be populated. The `operation_input_to_operation()` converter validates this and raises ValueError for zero or multiple fields.
- `apply_operations` (batch) converts all inputs first, then applies atomically -- if any operation fails, the document is not persisted since the engine works on an in-memory copy loaded from DB.
- `create_version` auto-increments version IDs based on existing version count for the document.
- `restore_version` and `import_markdown` both preserve the original document ID when replacing AST content.
- `create_document` with Markdown input extracts the title from the first h1 heading if no explicit title is provided.
- All queries that look up documents/versions return None/null for not-found cases rather than raising exceptions.
- Converter helpers handle bidirectional mapping between internal models (ASTNode, Operation, ListKind, etc.) and their GraphQL counterparts (ASTNodeType, OperationType, ListKindGQL, etc.) using enum value-based conversion.

### [TECH LEAD] 2026-04-12T24:00
- Backend Phases 1-5 complete: 279 tests passing, full GraphQL API operational.
- Starting Phase 6: Frontend Editor Implementation.
- Reviewed backend API code in detail: `app/gql/types.py` (enums, output types, input types, converters), `app/gql/queries/document_queries.py` (6 query resolvers), `app/gql/mutations/document_mutations.py` (7 mutation resolvers), `app/gql/schema.py`, `app/main.py` (Flask app factory with /graphql endpoint on port 5000).
- Confirmed `web/` directory does not exist yet -- greenfield frontend.
- Broke Phase 6 into 8 ordered sub-tasks (6.1 through 6.8) with clear dependencies:
  - 6.1: Project scaffolding (Vite + Vue 3 + Tailwind + RTL)
  - 6.2: useGraphQL composable (fetch-based GraphQL client)
  - 6.3: useDocument composable (document state, loading, CRUD)
  - 6.4: useOperations composable (operation creation and submission)
  - 6.5: Node renderer components (7 components for AST-to-DOM)
  - 6.6: useEditor composable (cursor model and navigation)
  - 6.7: Main editor + layout + views + routing (integration point)
  - 6.8: Import/export and version features
- Documented exact GraphQL field name casing (Strawberry snake_case -> camelCase) for frontend use.
- Documented RTL CSS rules (logical properties: ps-, pe-, ms-, me-, border-s-, border-e-).
- All sub-tasks assigned to ui-engineer agent.

### [VUE UI ENGINEER] 2026-04-12T24:15
- Read the plan and session context.
- Starting frontend work on Sub-Task 6.1: Project Scaffolding and Toolchain.
- Will create Vue 3 + Vite + Tailwind CSS project in web/ with RTL-first configuration.

### [VUE UI ENGINEER] 2026-04-12T24:30 -- Sub-Task 6.1 Complete
- Created Vue 3 + Vite project via `npm create vite@latest web -- --template vue`
- Installed dependencies: vue-router@4, tailwindcss@4, @tailwindcss/vite
- Configured vite.config.js: Tailwind Vite plugin + /graphql proxy to localhost:5000
- Set up RTL-first index.html: `<html lang="ar" dir="rtl">`, title "Kurras", body `bg-white text-black antialiased`
- Created style.css with `@import "tailwindcss";`
- Created main.js: imports router, mounts app
- Created App.vue: minimal `<router-view />` wrapper
- Created router/index.js: single route `/` -> HomeView
- Created views/HomeView.vue: centered "كُرّاس" heading with Tailwind classes
- Created empty directories: components/editor/nodes/, components/ui/, composables/
- Created root package.json with monorepo scripts (dev:web, dev:api, ui:check, ui:debug, ui:clean)
- Created root .gitignore (Python, Node, Vite, IDE, OS, test artifacts)
- Removed Vite boilerplate (HelloWorld.vue, assets/, public/, .vscode/)
- Verified: Vite dev server starts successfully on port 5173 with no errors
- All files reviewed for correctness

### [VUE UI ENGINEER] 2026-04-12T24:45 -- Sub-Task 6.2 Complete
- Read the plan and session context (Sub-Task 6.2, section F7, backend GraphQL types/queries/mutations).
- Created `web/src/composables/useGraphQL.js` -- thin fetch wrapper for `/graphql` endpoint.
- Exports `useGraphQL()` returning `{ query, mutate, loading, error }`.
- `query(queryString, variables)` sends POST to `/graphql`, returns `data` field, throws on GraphQL errors.
- `mutate(mutationString, variables)` is a semantic alias for `query()` for clarity at call sites.
- `loading` is a `ref(false)` set to `true` during in-flight requests.
- `error` is a `ref(null)` populated with the error message on failure, cleared on each new request.
- Added HTTP status error handling (`response.ok` check) in addition to GraphQL `errors` field handling.
- Included comprehensive JSDoc comment at top documenting Strawberry's snake_case -> camelCase auto-conversion with a full mapping table of all fields used in the API.
- Uses plain `fetch` -- no Apollo or other GraphQL client library.
- Uses Vue 3 Composition API (`ref` from 'vue').
- File reviewed: no syntax errors, consistent with the plan's F7 section plus the enhanced `loading`/`error` reactive state.

### [VUE UI ENGINEER] 2026-04-12T25:00 -- Sub-Task 6.6 Complete
- Read the plan and session context (Sub-Task 6.6, section F4, task requirements).
- Created `web/src/composables/useEditor.js` -- cursor/focus state management composable.
- Exports `useEditor()` returning:
  - `activeNodeId` -- `ref(null)` tracking the currently focused node ID
  - `nodeRefs` -- plain `Map` storing component refs keyed by node ID
  - `setActiveNode(nodeId)` -- sets activeNodeId
  - `registerNodeRef(nodeId, componentRef)` -- stores a component ref in nodeRefs Map
  - `unregisterNodeRef(nodeId)` -- removes a component ref from nodeRefs Map
  - `focusNode(nodeId)` -- awaits `nextTick()`, then calls `.focus()` on the component ref (components expose focus via `defineExpose`)
  - `focusNextNode(currentNodeId, flatNodeIds)` -- finds next node in flat list and focuses it
  - `focusPrevNode(currentNodeId, flatNodeIds)` -- finds previous node in flat list and focuses it
- Design decisions:
  - Simplified from session plan F4: no `cursorOffset`, no `selectionStart/End`, no `setCursor` with Selection API, no `document` parameter. Task requirements specify this is cursor state management only, not text editing logic.
  - Uses component refs via Map (not DOM `document.getElementById`) for focus -- aligns with Vue component model where nodes expose `focus()` via `defineExpose`.
  - `focusNode` sets `activeNodeId` after focus attempt (not before) so the state reflects what actually happened.
  - `focusNextNode`/`focusPrevNode` stay on boundary nodes (first/last) rather than wrapping or doing nothing.
  - `flatNodeIds` is passed in by the caller (computed from the AST in useDocument) rather than computed internally, keeping this composable decoupled from document state.
- Verified: No syntax errors (Node.js import check passes).

### [VUE UI ENGINEER] 2026-04-12T25:15 -- Sub-Task 6.5 Complete
- Read the plan and session context (Sub-Task 6.5, sections F3, AST model, GraphQL types).
- Created all 7 node renderer components in `web/src/components/editor/nodes/`.
- **NodeRenderer.vue**: Dynamic dispatch using `<component :is>` pattern. Maps `node.type` string to the correct component via `componentMap` object. Falls back to `ParagraphNode` for unknown types. Passes all callback props down to the resolved component.
- **ParagraphNode.vue**: `<p contenteditable>` with template ref. Handles `@input` (calls `onUpdate(id, text)`), `@keydown` Enter (calls `onEnter(id)`, prevents default), `@keydown` Backspace on empty (calls `onDelete(id)`, prevents default), `@focus` (calls `onFocus(id)`). Uses `syncContent()` with `onMounted` + `watch` to keep DOM text in sync with `node.text` prop without re-rendering. Exposes `focus()` via `defineExpose`.
- **HeadingNode.vue**: Dynamic `<h1>`-`<h6>` tag via computed `headingTag`. Per-level Tailwind classes for sizing (`text-4xl` through `text-base`). Same contenteditable pattern as ParagraphNode.
- **ListNode.vue**: Container component rendering `<ol>` or `<ul>` based on `node.listKind` (camelCase from GraphQL, with `list_kind` fallback). Adds `list-decimal`/`list-disc` classes. Uses `ps-6` for RTL-safe indentation. Iterates `node.children` rendering `ListItemNode` for each.
- **ListItemNode.vue**: `<li contenteditable>` with same editing pattern. Input handler extracts text from first `childNodes[0]` to avoid capturing nested content.
- **CodeBlockNode.vue**: `<pre dir="ltr"><code contenteditable>` structure. Code blocks are always LTR. Shows `languageHint` label above the code block when present. Enter key is NOT prevented (allows multi-line code); only Shift+Enter triggers `onEnter` for exiting the block. Monospace font, gray background.
- **BlockquoteNode.vue**: Recursive -- renders children via `NodeRenderer`. Uses `border-s-4` (inline-start border, right side in RTL), `ps-4` padding-start, gray border, italic text.
- RTL compliance: All components use logical CSS properties only (`ps-`, `pe-`, `ms-`, `me-`, `border-s-`). No `pl-`, `pr-`, `left`, `right`, `text-left`, `text-right`. CodeBlockNode has explicit `dir="ltr"` on `<pre>`.
- Design decisions:
  - Used callback props (`onUpdate`, `onEnter`, `onDelete`, `onFocus`) instead of `inject('editorContext')` as specified in task requirements. This makes components more testable and explicit about their dependencies.
  - Added `syncContent()` pattern (onMounted + watch) to all contenteditable components. This syncs DOM textContent from props without using Vue's template interpolation inside contenteditable (which causes cursor position issues).
  - Added `outline-none` class to all contenteditable elements for cleaner focus appearance.
  - CodeBlockNode uses Shift+Enter to exit (plain Enter inserts newline in code).
- Verified: `npx vite build` succeeds with all 29 modules compiled, zero errors.

### [VUE UI ENGINEER] 2026-04-12T25:30 -- Sub-Task 6.4 Complete
- Read the plan and session context (Sub-Task 6.4, section F5, backend types/mutations).
- Created `web/src/composables/useOperations.js` -- operation builders and submission composable.
- Exports `useOperations()` returning:
  - **Operation builders** (return plain objects, do not call API):
    - `updateText(nodeId, content, oldContent)` -- full-text replacement via offset=0, deleteCount=oldContent.length
    - `insertNode(parentId, index, nodeType, content, metadata)` -- creates node with auto-generated ID, supports level/listKind/language/children in metadata
    - `deleteNode(nodeId)` -- simple wrapper
    - `moveNode(nodeId, newParentId, newIndex)` -- maps newIndex to newPosition field
  - **API submission**:
    - `applyOperation(documentId, operation)` -- single op via `applyOperation` mutation
    - `applyBatch(documentId, operations)` -- atomic batch via `applyOperations` mutation
  - **Queue-based batch submission** (matches session plan F5 pattern):
    - `pendingOps` -- `ref([])` for queued operations
    - `queueOperation(operation)` -- push to pending queue
    - `flushOperations(documentId)` -- send all pending as batch, re-queue on failure
  - **Debounced text updates**:
    - `debouncedUpdateText(documentId, nodeId, content, oldContent)` -- 300ms debounce per node via Map of timers
    - `cancelAllDebounced()` -- clear all pending debounce timers (for cleanup on unmount)
  - **Reactive state**: `loading`, `error` (from useGraphQL)
  - **Utility**: `generateNodeId()` -- generates `node_{12 hex chars}` matching backend format
- All operation input objects use camelCase keys matching Strawberry's auto-conversion (nodeId, parentId, newText, deleteCount, listKind, languageHint, newParentId, newPosition).
- GraphQL mutations use proper variable types: `$documentId: String!`, `$operation: OperationInput!`, `$operations: [OperationInput!]!`.
- Document AST fragment in responses goes 3 levels deep with all fields (id, type, text, level, listKind, languageHint, children).
- Verified: `node --check` passes (valid JS syntax), `npx vite build` succeeds (29 modules compiled, zero errors).

### [VUE UI ENGINEER] 2026-04-12T25:45 -- Sub-Task 6.3 Complete
- Read the plan and session context (Sub-Task 6.3, section F6, backend queries/mutations/types).
- Created `web/src/composables/useDocument.js` -- document CRUD and AST state management composable.
- Exports `useDocument()` returning:
  - **Reactive state**:
    - `documents` -- `ref([])` list of all document summaries (for home/list view)
    - `currentDocument` -- `ref(null)` metadata of the currently loaded document (id, title, createdAt, updatedAt)
    - `ast` -- `ref(null)` the current document's full AST tree
    - `flatNodeIds` -- `computed` ordered array of leaf-node IDs (paragraph, heading, list_item, code_block) for useEditor keyboard navigation
    - `loading` / `error` -- from useGraphQL
  - **API actions**:
    - `listDocuments()` -- fetches all documents via `documents` query, populates `documents` ref
    - `getDocument(id)` -- fetches single document with full AST via `document(id)` query, populates both `currentDocument` and `ast` refs
    - `createDocument(title)` -- creates new document via `createDocument` mutation, returns new document ID
    - `updateDocumentTitle(id, title)` -- local-only placeholder (backend mutation does not exist yet), updates both `currentDocument` and `documents` list locally, logs console warning
    - `deleteDocument(id)` -- deletes document via `deleteDocument` mutation, cleans up `documents` list and clears `currentDocument`/`ast` if the deleted doc was loaded
  - **Local state manipulation**:
    - `updateLocalAst(nodeId, newContent)` -- finds node by ID in AST tree and updates its `text` field locally for instant UI feedback; returns boolean success
    - `findNodeById(node, id)` -- depth-first search utility, also exposed for use by other composables
- AST GraphQL fragment goes 6 levels deep (vs 3 in useOperations) to handle deeply nested structures: document > blockquote/list > list_item > nested list > list_item > text.
- `flatNodeIds` uses a `LEAF_NODE_TYPES` Set containing both uppercase (Strawberry enum names: `PARAGRAPH`, `HEADING`, `LIST_ITEM`, `CODE_BLOCK`) and lowercase (internal model values) for robustness against casing differences.
- Verified: `npx vite build` succeeds with zero errors.
- Open question logged: Backend needs an `updateDocumentTitle` mutation for full title editing support.

### [VUE UI ENGINEER] 2026-04-12T26:00 -- Sub-Task 6.7 Complete
- Read the plan and session context (Sub-Task 6.7, sections F8-F12, all existing composables and node components).
- Starting frontend work on main editor integration: layout, views, routing, and EditorView wiring.

**Files created:**
- `web/src/components/ui/AppLayout.vue` -- Simple layout wrapper with black navigation bar containing "كُرّاس" logo/title (clickable, navigates home) and "محرر النصوص" subtitle. White content area below with `<slot />`. Uses logical CSS properties only (no pl/pr/ml/mr/left/right).
- `web/src/components/ui/DocumentList.vue` -- Document list component with props: documents (array), loading (boolean). Emits: select, delete, create. Shows document title (or "بدون عنوان"), formatted date in Arabic locale, hover-visible delete button. Empty state message. "مستند جديد" (New Document) button at top.
- `web/src/components/editor/EditorToolbar.vue` -- Editor toolbar with contenteditable title, back button (RTL arrow), and action buttons for inserting paragraph/heading/list/code block/blockquote. All labels in Arabic. Emits: update:title, insert-paragraph, insert-heading, insert-list, insert-code-block, insert-blockquote.
- `web/src/components/editor/EditorView.vue` -- Main integration component. Uses useDocument, useOperations, useEditor composables. Takes documentId prop. On mount: loads document via getDocument(). Renders EditorToolbar + NodeRenderer for each AST child. Wires all callbacks:
  - `handleUpdate(nodeId, content)`: captures oldContent before mutation, updates local AST immediately, debounces server update (300ms)
  - `handleEnter(nodeId)`: inserts LIST_ITEM (if current node is list_item) or PARAGRAPH after current node, applies operation to backend, focuses new node
  - `handleDelete(nodeId)`: prevents deletion of last node, finds previous node, applies delete operation, focuses previous node
  - `handleFocus(nodeId)`: calls setActiveNode
  - Toolbar actions: insert new nodes at active position or end of document. LIST inserts with child LIST_ITEM. BLOCKQUOTE inserts with child PARAGRAPH. Both focus the editable child after insertion.
  - Provides `editorNodeRefs` via provide/inject so nested nodes can register themselves for focus management.
  - Loading, error, retry, and empty-document states.
- `web/src/views/EditorPage.vue` -- Route-level view for /editor/:id. Wraps EditorView with AppLayout. Gets documentId from route.params.id via computed.

**Files modified:**
- `web/src/views/HomeView.vue` -- Replaced placeholder with full document list. Uses useDocument composable for listDocuments, createDocument, deleteDocument. Uses AppLayout wrapper and DocumentList component. "New Document" creates document and navigates to editor. Delete with window.confirm confirmation.
- `web/src/router/index.js` -- Added route: `/editor/:id` -> EditorPage (lazy-loaded via dynamic import). Kept `/` -> HomeView (eagerly loaded).
- `web/src/components/editor/nodes/ParagraphNode.vue` -- Added inject('editorNodeRefs') + self-registration on mount/unmount via getCurrentInstance().proxy for focus management of nested nodes.
- `web/src/components/editor/nodes/HeadingNode.vue` -- Same inject/register pattern as ParagraphNode.
- `web/src/components/editor/nodes/ListItemNode.vue` -- Same inject/register pattern as ParagraphNode.
- `web/src/components/editor/nodes/CodeBlockNode.vue` -- Same inject/register pattern as ParagraphNode.

**Build result:** `npx vite build` succeeds -- 46 modules compiled, zero errors. Code-split output: EditorPage lazy-loaded (15.99 kB), AppLayout shared chunk (83.72 kB includes vue-router), main chunk (11.01 kB).

**Key design decisions:**
- Used provide/inject (`editorNodeRefs`) for node ref registration instead of only registering top-level nodes. This ensures list items and blockquote children can be focused after Enter/Delete operations.
- handleEnter detects the current node type: if it's a list_item, inserts a new LIST_ITEM in the same list parent; otherwise inserts a PARAGRAPH. This makes lists behave naturally.
- handleUpdate captures oldContent before mutating the local AST, ensuring the debounced server update gets the correct oldContent for the deleteCount calculation.
- handleDelete prevents deleting the last editable node in the document to avoid an empty, unrecoverable state.
- Toolbar insert actions for container types (LIST, BLOCKQUOTE) create the container with an editable child (LIST_ITEM, PARAGRAPH) and focus the child -- not the container itself.
- EditorPage uses computed() for documentId so it reacts to route changes.
- All Arabic text labels: "المستندات" (Documents), "بدون عنوان" (Untitled), "مستند جديد" (New Document), "جاري التحميل" (Loading), "فقرة" (Paragraph), "عنوان" (Heading), "قائمة" (List), "كود" (Code), "اقتباس" (Quote), "حذف" (Delete).
- RTL compliance verified: zero instances of pl-/pr-/ml-/mr-/left/right in any new or modified file.

### [VUE UI ENGINEER] 2026-04-12T26:15
- Read the plan and session context.
- Starting frontend work on Sub-Task 6.8: Import/Export and Version Features.
- Backend API confirmed: exportMarkdown query, importMarkdown mutation, createVersion/restoreVersion mutations, documentVersions/version queries all exist.
- Will create: ImportExportDialog.vue modal component, add export/import/version functions to useDocument.js, wire into EditorToolbar and EditorView.

### [VUE UI ENGINEER] 2026-04-12T26:30 -- Sub-Task 6.8 Complete
- Implemented all three features: Export, Import, and Version History.

**Files created:**
- `web/src/components/ui/ImportExportDialog.vue` -- Reusable modal dialog component. Teleported to body. Black/white aesthetic with backdrop click-to-close, close button, content slot, and named #actions slot. Minimal and clean.

**Files modified:**
- `web/src/composables/useDocument.js` -- Added 5 new functions:
  - `exportMarkdown(documentId)` -- calls `exportMarkdown` GraphQL query, returns Markdown string
  - `importMarkdown(documentId, markdown)` -- calls `importMarkdown` GraphQL mutation, updates currentDocument and ast refs
  - `listVersions(documentId)` -- calls `documentVersions` GraphQL query, returns version list
  - `getVersion(versionId)` -- calls `version` GraphQL query with full AST, returns version detail
  - `createVersion(documentId, label)` -- calls `createVersion` GraphQL mutation
  - `restoreVersion(documentId, versionId)` -- calls `restoreVersion` GraphQL mutation, updates currentDocument and ast refs
- `web/src/components/editor/EditorToolbar.vue` -- Added three new buttons after a visual separator:
  - "تصدير" (Export) -- emits 'export' event
  - "استيراد" (Import) -- emits 'import' event
  - "المحفوظات" (History/Versions) -- emits 'versions' event
  - Renamed `actions` array to `insertActions` for clarity
- `web/src/components/editor/EditorView.vue` -- Full integration of all three features:
  - **Export**: Click "تصدير" -> fetches Markdown from backend -> shows in read-only textarea modal with "نسخ" (Copy to clipboard) and "تحميل" (Download as .md file) buttons. Copy shows "تم النسخ" feedback for 2 seconds.
  - **Import**: Click "استيراد" -> opens modal with textarea and warning that content will be replaced -> validates non-empty -> calls importMarkdown mutation -> closes modal and editor re-renders new AST. Shows error message on failure.
  - **Versions**: Click "المحفوظات" -> opens modal with two views:
    - List view: input field for version label + "حفظ نسخة" button to create snapshots. Lists all versions with timestamp, "عرض" (View) and "استعادة" (Restore) buttons.
    - Detail view: shows version label/ID and timestamp, renders the version's AST in a read-only preview (pointer-events-none), with "استعادة هذه النسخة" button and back-to-list link.
    - Restore uses window.confirm for safety.

**Build result:** `npx vite build` succeeds -- 47 modules compiled, zero errors.
- RTL compliance verified: zero instances of pl-/pr-/ml-/mr-/left/right in any new or modified file.
- All Arabic labels used: تصدير, استيراد, المحفوظات, نسخ, تم النسخ, تحميل, حفظ نسخة, عرض, استعادة, استعادة هذه النسخة, العودة للقائمة, جاري التصدير, جاري الاستيراد, جاري التحميل, جاري الحفظ, لا توجد نسخ محفوظة بعد, وصف النسخة (اختياري), إغلاق.
- All backend API endpoints confirmed available and wired: exportMarkdown query, importMarkdown mutation, documentVersions query, version query, createVersion mutation, restoreVersion mutation.

### [VUE UI ENGINEER] 2026-04-12T23:12 -- Phase 7: E2E Tests Complete
- Read the plan and session context.
- Starting frontend work on Phase 7: E2E Tests.

**Setup:**
- Installed `@playwright/test` and Chromium browser at project root.
- Created `playwright.config.js` with Chromium-only, webServer array for backend+frontend.
- Created `e2e/start_backend.py` to patch `socket.getfqdn` (35s DNS lookup on macOS/Python 3.14) and start Flask without debug mode.
- Added `"type": "module"` to root `package.json` for ESM imports.
- Created `artifacts/playwright/screenshots/` directory.

**Bug fix discovered during testing:**
- `web/src/components/editor/nodes/NodeRenderer.vue` -- The component map used lowercase keys (`paragraph`, `heading`, etc.) but the GraphQL API returns uppercase enum names (`PARAGRAPH`, `HEADING`, etc.). Added `.toLowerCase()` normalization to the type lookup. This fix is necessary for heading, list, code_block, and blockquote nodes to render with the correct components.
- `db/db.py` -- Added `check_same_thread=False` to `sqlite3.connect()` to allow Flask's threaded request handling to access the database. Without this, every GraphQL request from a worker thread would fail with `ProgrammingError`.

**data-testid attributes added to components:**
- `web/src/components/ui/AppLayout.vue` -- navbar, app-title, app-subtitle
- `web/src/components/ui/DocumentList.vue` -- documents-title, new-document-btn, document-item, delete-document-btn
- `web/src/components/editor/EditorToolbar.vue` -- document-title, toolbar-{event} for insert buttons, toolbar-export, toolbar-import, toolbar-versions
- `web/src/components/editor/EditorView.vue` -- editor-content
- `web/src/components/editor/nodes/ParagraphNode.vue` -- paragraph-node
- `web/src/components/editor/nodes/HeadingNode.vue` -- heading-node
- `web/src/components/editor/nodes/CodeBlockNode.vue` -- code-block-pre, code-block-node
- `web/src/components/editor/nodes/BlockquoteNode.vue` -- blockquote-node
- `web/src/components/editor/nodes/ListNode.vue` -- list-node
- `web/src/components/editor/nodes/ListItemNode.vue` -- list-item-node
- `web/src/components/ui/ImportExportDialog.vue` -- dialog-content

**Test files created:**
- `e2e/document-list.spec.js` -- 6 tests: page load, app title, new document button, create+navigate, navigate back, delete document
- `e2e/editor.spec.js` -- 10 tests: default state, type text, Enter creates paragraph, Backspace deletes paragraph, heading insert, list insert, code block insert, title editing, export dialog, import dialog
- `e2e/rtl.spec.js` -- 6 tests: dir/lang attributes, nav RTL alignment, editor RTL direction, code block dir=ltr, blockquote border-inline-start, visual screenshots

**Test results: 22/22 passing in 7.7s.**

**Screenshots saved to:**
- `artifacts/playwright/screenshots/rtl-home-page.png`
- `artifacts/playwright/screenshots/rtl-editor-page.png`

**Known limitations:**
- Arabic text input via `pressSequentially` reverses characters in headless Chromium + RTL contenteditable. Tests use `evaluate()` to set text content directly for Arabic strings.
- Empty `<code>` elements inside code blocks have zero height and are not "visible" to Playwright. Tests check the `<pre>` container visibility instead.
- The shared database across tests means document counts are cumulative. Tests use relative counts (countBefore + 1) instead of absolute assertions.

### [SECURITY REVIEWER] 2026-04-12T23:30
- Completed comprehensive security review for this session.
- Reviewed all backend files (main.py, mutations, queries, types, document_repo, operations, ast, markdown_parser, markdown_serializer, diff), database layer (db.py, migrations), and all frontend files (composables, editor components, views, router, vite config).
- See Review Notes section for detailed findings.
- Found 3 HIGH, 6 MEDIUM, 7 LOW severity issues.
- Positive findings: No XSS vectors (textContent used correctly), no SQL injection (parameterized queries throughout), no unsafe HTML rendering (no v-html), safe Markdown parsing (token-based, not HTML).
- Critical gaps: No authentication/authorization, no CORS, no CSRF protection, no input size limits, debug mode in production entrypoint.

## Review Notes

### Security Review (2026-04-12)

**Reviewer**: security-reviewer

#### HIGH Severity

**H1. No Authentication or Authorization -- Any User Can Access/Modify/Delete Any Document**
- Files: `app/main.py`, `app/gql/mutations/document_mutations.py`, `app/gql/queries/document_queries.py`
- There is no `app/libs/auth.py`, no authentication middleware, no session management, and no authorization checks on any GraphQL resolver. Every mutation (create, delete, apply operations, restore versions, import markdown) and every query (list all documents, get any document by ID, get any version, export any document) is fully unauthenticated.
- Attack scenario: Anyone on the network can enumerate all documents via the `documents` query, read any document's full AST and version history, modify or delete any document, and import arbitrary content into any document.
- Remediation: Implement authentication (session-based or token-based) and add authorization checks to all resolvers. At minimum, documents should be scoped to their owner and mutations should verify the caller owns the target document.

**H2. No CORS Configuration -- Cross-Origin Requests Unrestricted**
- File: `app/main.py`
- The Flask app has no CORS configuration at all. When deployed, the browser's same-origin policy will block cross-origin requests by default (which is actually safe), but if `flask-cors` is added later with permissive defaults (`CORS(app)` with `origins="*"`), the API becomes exploitable from any website. More importantly, the absence of explicit CORS configuration means there is no defense-in-depth; if the app is deployed behind a reverse proxy that adds permissive CORS headers, all documents are exposed.
- Attack scenario: A malicious website could make GraphQL requests to the Kurras API if CORS is misconfigured during deployment, reading and modifying documents.
- Remediation: Add `flask-cors` with an explicit allowlist of permitted origins. For development, allow `http://localhost:5173`; for production, restrict to the actual domain.

**H3. No CSRF Protection on GraphQL Mutations**
- Files: `app/main.py`, `web/src/composables/useGraphQL.js`
- The GraphQL endpoint accepts POST requests with `Content-Type: application/json`. While JSON content types provide some CSRF protection via the browser's preflight requirement, this relies on CORS being properly configured (see H2). With no CORS headers set, there is no explicit CSRF defense.
- Attack scenario: If CORS is misconfigured to allow credentials from foreign origins, a malicious page could issue state-changing mutations (delete documents, overwrite content) on behalf of an authenticated user.
- Remediation: After implementing authentication (H1), add CSRF tokens to state-changing mutations, or ensure CORS is locked down to only the frontend origin with `supports_credentials=True` on a strict allowlist.

#### MEDIUM Severity

**M1. GraphQL Introspection Enabled in Production**
- File: `app/gql/schema.py`
- Strawberry enables introspection by default. This allows any client to discover the full schema, all types, all mutations, and all query fields.
- Attack scenario: An attacker can query `__schema` to map the entire API surface, identify all available mutations and their input types, and craft targeted attacks.
- Remediation: Disable introspection in production by setting an environment-based flag. In Strawberry, pass an `extensions` parameter or configure the schema to disable introspection when not in debug mode.

**M2. No Input Size Limits -- Denial of Service via Large Documents or Markdown Import**
- Files: `app/gql/mutations/document_mutations.py` (lines 76-94, 234-258), `app/gql/types.py` (lines 130-138, 184-188), `app/libs/markdown_parser.py`
- There are no size limits on: Markdown text for import (`import_markdown` mutation accepts unlimited string), document title length, text content in `UpdateText` operations, number of children in `ASTNodeInput`, or number of operations in `apply_operations` batch.
- Attack scenario: An attacker sends a 100MB Markdown string via `importMarkdown`, causing the server to consume excessive memory parsing it. Or sends a batch of millions of operations via `applyOperations`. Or creates deeply nested AST structures via `InsertNode` with deeply nested `ASTNodeInput.children`.
- Remediation: Add server-side validation for maximum text length (e.g., 1MB for Markdown imports), maximum operations per batch (e.g., 1000), maximum AST depth (e.g., 20 levels), and maximum node count per document (e.g., 10,000).

**M3. No Query Depth or Complexity Limits on GraphQL**
- File: `app/gql/schema.py`
- The Strawberry schema has no query depth limits or complexity analysis. The recursive `ASTNodeType` (which has `children: list[ASTNodeType]`) means an attacker can craft a query requesting very deep nesting.
- Attack scenario: While the frontend limits to 6 levels of nesting in its queries, there is nothing stopping an attacker from sending a direct GraphQL query requesting 100 levels of AST nesting, or combining multiple expensive queries in a single request.
- Remediation: Add a Strawberry extension for query depth limiting (max depth ~10) and query complexity analysis. Consider adding rate limiting on the GraphQL endpoint.

**M4. SQLite Thread Safety -- Shared Connection Without Locking**
- File: `db/db.py` (line 22)
- The `DatabaseManager` uses `check_same_thread=False` to share a single SQLite connection across Flask's threaded request handling. SQLite connections are not thread-safe for concurrent writes. Two simultaneous write requests can cause database corruption or `OperationalError: database is locked`.
- Attack scenario: Under concurrent load (multiple users editing simultaneously), write operations can corrupt the database or produce inconsistent state. This is both a reliability and data integrity issue.
- Remediation: Use a connection pool or create per-request connections. For SQLite specifically, consider using a write lock (threading.Lock) around write operations, or switch to connection-per-request pattern with `g` in Flask.

**M5. Debug Mode Enabled by Default in Production Entry Point**
- File: `app/main.py` (line 51)
- The `__main__` block runs with `app.run(debug=True)`. While this is the development entry point, if someone deploys using `python -m app.main` or `python app/main.py`, it runs in debug mode with the Werkzeug debugger enabled. The Werkzeug debugger allows arbitrary code execution.
- Attack scenario: If the app is accidentally deployed with `debug=True`, anyone who triggers an error can use the Werkzeug interactive debugger to execute arbitrary Python code on the server.
- Remediation: Set `debug=False` by default and use an environment variable (`FLASK_DEBUG` or `KURRAS_DEBUG`) to enable it. Better yet, use a production WSGI server (Gunicorn) and never expose the Flask development server.

**M6. Version ID Collision Vulnerability**
- File: `app/gql/mutations/document_mutations.py` (lines 177-212)
- Version IDs are generated as sequential `v_1`, `v_2`, etc., based on `len(existing_versions) + 1`. If versions are deleted or if there's a race condition between two `createVersion` calls, IDs can collide, causing a PRIMARY KEY violation error.
- Attack scenario: Two concurrent `createVersion` requests for the same document will both compute the same `next_num`, and one will fail with a database error that may leak internal details.
- Remediation: Use UUIDs for version IDs (like node IDs do), or use a database sequence/autoincrement.

#### LOW Severity

**L1. Error Messages May Leak Internal Details**
- Files: `app/gql/mutations/document_mutations.py` (lines 112, 118, 124)
- Operation errors include the raw exception message from `OperationError`, which includes internal node IDs and structural information (e.g., "Parent node not found: node_abc123def456"). While these are not directly exploitable, they reveal internal document structure.
- Remediation: Return generic error messages to the client and log detailed errors server-side.

**L2. No Rate Limiting on Any Endpoint**
- File: `app/main.py`
- There is no rate limiting on the GraphQL endpoint. Combined with the lack of authentication, this makes the application vulnerable to abuse (e.g., creating thousands of documents, flooding the operation log).
- Remediation: Add rate limiting using `flask-limiter` or equivalent, particularly on mutation endpoints.

**L3. Predictable Document and Node ID Patterns**
- File: `app/models/ast.py` (lines 41-48)
- Document and node IDs use `uuid.uuid4().hex[:12]` (12 hex characters = 48 bits of entropy). While this provides reasonable uniqueness, truncating UUIDs to 48 bits increases collision probability and is somewhat predictable.
- Remediation: Use the full UUID hex (32 characters) or ensure the truncation provides sufficient entropy for the expected document count.

**L4. No Content-Security-Policy or Security Headers**
- File: `app/main.py`
- The Flask app does not set security headers such as `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, or `Strict-Transport-Security`.
- Remediation: Add security headers using `flask-tighten` or manually in a `@app.after_request` handler. At minimum, set `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and a restrictive CSP.

**L5. Frontend Uses `textContent` Safely (POSITIVE)**
- Files: All node components (`ParagraphNode.vue`, `HeadingNode.vue`, `CodeBlockNode.vue`, `ListItemNode.vue`)
- The editor correctly uses `textContent` (not `innerHTML`) for setting content in contenteditable elements, and reads content via `event.target.textContent`. This prevents XSS through the editor content path. No `v-html` directives are used anywhere in the codebase. This is a well-done security decision.

**L6. SQL Injection Protection (POSITIVE)**
- File: `app/models/document_repo.py`
- All database queries consistently use parameterized placeholders (`?`). No string interpolation is used in SQL queries. This is correct and prevents SQL injection.

**L7. Markdown Parser Does Not Produce HTML (POSITIVE)**
- File: `app/libs/markdown_parser.py`
- The Markdown parser uses `markdown-it-py` to produce a token stream that is converted to AST nodes (not HTML). This avoids the common vulnerability of rendering user-supplied Markdown as HTML. The parser only extracts text content from tokens, so embedded HTML in Markdown is stripped.

#### INFORMATIONAL

**I1. HeadingNode Dynamic Component -- Low Risk**
- File: `web/src/components/editor/nodes/HeadingNode.vue` (line 96-108)
- The `HeadingNode` uses Vue's `<component :is="headingTag">` with a computed value derived from `node.level`. The computed value is safely bounded to `h1`-`h6` with a fallback to `h1`. The level value comes from the GraphQL API which restricts it via the `NodeType` enum. While dynamic components can be dangerous, the validation here is sufficient.

**I2. No Dependency Lock Files**
- Files: `requirements.txt`, `web/package.json`
- Python dependencies use minimum version constraints (`>=`) without upper bounds, and there is no `requirements.lock` or `Pipfile.lock`. The frontend `package.json` uses caret ranges (`^`). This means builds are not reproducible and a compromised dependency update could be automatically pulled.
- Recommendation: Add `package-lock.json` (run `npm install`) and pin Python dependencies with exact versions or use `pip-compile`.

**I3. Database File Path Configurable**
- File: `app/main.py` (line 16), `db/db.py` (line 17-20)
- The database path defaults to `db/kurras.db` and includes `os.makedirs` to create the directory. The path is a constructor parameter, not user-controllable input. No path traversal risk here.

**I4. Suggested Security Tooling**
- Run `bandit -r app/` to scan the Python backend for common security issues.
- Run `cd web && npm audit` to check for known vulnerabilities in frontend dependencies.
- Consider adding `safety check` for Python dependency vulnerability scanning.

## Final Summary

(To be filled when session is completed)
