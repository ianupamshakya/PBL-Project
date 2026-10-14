import mongomock
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.seed import seed_database


def make_client():
    database = mongomock.MongoClient().outside_test
    application = create_app(database, secret="test-secret-longer-than-thirty-two-characters", production=False)
    return TestClient(application), database


def register(client, email, tags):
    response = client.post("/api/auth/register", json={"email": email, "password": "securepass123", "tags": tags})
    assert response.status_code == 201, response.text
    return response.json()["user"], client.cookies.get("outside_session")


def test_privacy_request_acceptance_chat_and_block():
    client, database = make_client()
    alice, alice_cookie = register(client, "alice@example.test", ["books", "music", "coffee"])
    bob, bob_cookie = register(client, "bob@example.test", ["books", "nature", "coffee"])
    charlie, charlie_cookie = register(client, "charlie@example.test", ["music", "gaming", "art"])
    client.cookies.set("outside_session", alice_cookie)
    discovery = client.get("/api/discover").json()["suggestions"]
    bob_card = next(item for item in discovery if item["id"] == bob["id"])
    assert bob_card["sharedTags"] == ["books", "coffee"]
    assert "alias" not in bob_card and "email" not in bob_card

    sent = client.post(f"/api/interests/{bob['id']}")
    assert sent.status_code == 201
    connection_id = sent.json()["id"]
    assert client.post(f"/api/interests/{bob['id']}").status_code == 409
    assert client.get(f"/api/connections/{connection_id}/messages").status_code == 404

    client.cookies.set("outside_session", charlie_cookie)
    assert client.get(f"/api/connections/{connection_id}/messages").status_code == 404
    client.cookies.set("outside_session", bob_cookie)
    pending = client.get("/api/connections").json()["connections"][0]
    assert pending["direction"] == "incoming"
    assert "alias" not in pending["person"] and "email" not in pending["person"]
    assert client.patch(f"/api/connections/{connection_id}", json={"action": "accept"}).status_code == 200

    client.cookies.set("outside_session", alice_cookie)
    connected = client.get("/api/connections").json()["connections"][0]
    assert connected["person"]["alias"] == bob["alias"]
    assert "email" not in connected["person"]
    assert client.post(f"/api/connections/{connection_id}/messages", json={"text": "A small hello"}).status_code == 201
    client.cookies.set("outside_session", bob_cookie)
    messages = client.get(f"/api/connections/{connection_id}/messages").json()["messages"]
    assert messages[0]["text"] == "A small hello"
    assert messages[0]["mine"] is False
    assert client.post(f"/api/block/{alice['id']}").status_code == 200
    client.cookies.set("outside_session", alice_cookie)
    assert client.get(f"/api/connections/{connection_id}/messages").status_code == 403

    seed_database(database)
    seed_database(database)
    assert database.users.count_documents({"email": {"$regex": r"^demo[1-5]@example\.test$"}}) == 5


def test_profile_validation_and_request_origin():
    client, _database = make_client()
    user, cookie = register(client, "member@example.test", ["books", "nature", "music"])
    client.cookies.set("outside_session", cookie)
    assert client.patch("/api/profile", json={"tags": ["books"]}).status_code == 400
    updated = client.patch("/api/profile", json={"tags": ["poetry", "coffee", "books"]})
    assert updated.status_code == 200
    assert updated.json()["user"]["tags"] == ["poetry", "coffee", "books"]
    denied = client.patch("/api/profile", json={"tags": ["books", "nature", "music"]}, headers={"Origin": "https://unknown.example"})
    assert denied.status_code == 403
    assert client.get("/api/auth/me").json()["user"]["id"] == user["id"]


def test_production_app_serves_built_frontend(tmp_path, monkeypatch):
    dist = tmp_path / "client" / "dist"
    dist.mkdir(parents=True)
    (dist / "index.html").write_text("<title>outside</title>", encoding="utf-8")
    monkeypatch.setattr("backend.app.ROOT", tmp_path)
    database = mongomock.MongoClient().outside_production_test
    application = create_app(database, secret="test-secret-longer-than-thirty-two-characters", origin="https://outside.example", production=True)
    client = TestClient(application)
    response = client.get("/")
    assert response.status_code == 200
    assert "outside" in response.text
    assert client.get("/api/health").json()["database"] == "connected"
