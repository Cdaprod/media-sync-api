from types import SimpleNamespace

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.auth.node_tokens import issue_node_token
from app.auth.runtime_device_auth import require_device_scope


class FakeNodeRegistry:
    def __init__(self):
        self.nodes = {}

    def get_node(self, node_id):
        return self.nodes.get(node_id)


def make_client(node):
    app = FastAPI()
    registry = FakeNodeRegistry()
    registry.nodes[node.node_id] = node
    app.state.runtime = SimpleNamespace(node_registry=registry)

    @app.get("/protected")
    def protected(ctx=Depends(require_device_scope("ingest:write"))):
        return {"node_id": ctx.node_id, "scopes": sorted(ctx.scopes)}

    return TestClient(app)


def test_registered_node_auth_accepts_valid_token():
    issued = issue_node_token()
    node = SimpleNamespace(
        node_id="node-1",
        enabled=True,
        token_hash=issued.token_hash,
        token_preview=issued.token_preview,
        auth_scopes=["ingest:write"],
    )
    client = make_client(node)

    res = client.get(
        "/protected",
        headers={
            "Authorization": f"Bearer {issued.token}",
            "X-Media-Sync-Node-Id": "node-1",
        },
    )

    assert res.status_code == 200
    assert res.json()["node_id"] == "node-1"


def test_registered_node_auth_rejects_wrong_node_id():
    issued = issue_node_token()
    node = SimpleNamespace(
        node_id="node-1",
        enabled=True,
        token_hash=issued.token_hash,
        token_preview=issued.token_preview,
        auth_scopes=["ingest:write"],
    )
    client = make_client(node)

    res = client.get(
        "/protected",
        headers={
            "Authorization": f"Bearer {issued.token}",
            "X-Media-Sync-Node-Id": "wrong-node",
        },
    )

    assert res.status_code == 401


def test_registered_node_auth_rejects_wrong_token():
    issued = issue_node_token()
    node = SimpleNamespace(
        node_id="node-1",
        enabled=True,
        token_hash=issued.token_hash,
        token_preview=issued.token_preview,
        auth_scopes=["ingest:write"],
    )
    client = make_client(node)

    res = client.get(
        "/protected",
        headers={
            "Authorization": "Bearer wrong-token",
            "X-Media-Sync-Node-Id": "node-1",
        },
    )

    assert res.status_code == 401


def test_registered_node_auth_rejects_missing_scope():
    issued = issue_node_token()
    node = SimpleNamespace(
        node_id="node-1",
        enabled=True,
        token_hash=issued.token_hash,
        token_preview=issued.token_preview,
        auth_scopes=["node:heartbeat"],
    )
    client = make_client(node)

    res = client.get(
        "/protected",
        headers={
            "Authorization": f"Bearer {issued.token}",
            "X-Media-Sync-Node-Id": "node-1",
        },
    )

    assert res.status_code == 403
