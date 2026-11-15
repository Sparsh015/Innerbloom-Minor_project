"""End-to-end API tests with FastAPI TestClient (SQLite in-memory/file)."""
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:///./test_innerbloom.db"
for var in ("JWT_SECRET_KEY",):
    os.environ.setdefault(var, "test-secret-key")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient

from app.db.database import Base, engine
from app.main import app, on_startup

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    on_startup()  # TestClient skips lifespan; run startup seed explicitly
    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    if os.path.exists("./test_innerbloom.db"):
        try:
            os.remove("./test_innerbloom.db")
        except OSError:
            pass


def register(email="a@test.com", password="Pass1234", name="User A"):
    r = client.post("/api/auth/register", json={
        "name": name, "email": email, "password": password,
        "age": 22, "concerns": "Stress", "interests": "Music, Reading", "description": "Hi",
    })
    assert r.status_code == 201, r.text
    return r.json()


def login(email="a@test.com", password="Pass1234"):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_register_login_and_me():
    reg = register()
    token = reg["access_token"]
    assert reg["user"]["email"] == "a@test.com"
    me = client.get("/api/users/me", headers=auth(token))
    assert me.status_code == 200
    assert me.json()["profile"]["interests"] == "Music, Reading"


def test_duplicate_register_409():
    register()
    r = client.post("/api/auth/register", json={
        "name": "Dup", "email": "a@test.com", "password": "Pass1234"})
    assert r.status_code == 409


def test_register_password_strength():
    for password, email in [("short1", "a@test.com"), ("onlyletters", "b@test.com"),
                            ("12345678", "c@test.com")]:
        r = client.post("/api/auth/register", json={
            "name": "Weak", "email": email, "password": password})
        assert r.status_code == 422, r.text
    r = client.post("/api/auth/register", json={
        "name": "Strong", "email": "d@test.com", "password": "Good1234"})
    assert r.status_code == 201, r.text


def test_invalid_login_401():
    register()
    r = client.post("/api/auth/login", json={"email": "a@test.com", "password": "Wrong1234"})
    assert r.status_code == 401


def test_protected_route_no_token_401():
    assert client.get("/api/users/me").status_code in (401, 403)


def test_update_profile():
    token = register()["access_token"]
    r = client.put("/api/users/me", headers=auth(token),
                   json={"location": "Pune", "interests": "Yoga, Music"})
    assert r.status_code == 200
    assert r.json()["profile"]["location"] == "Pune"


def test_mood_crud_and_privacy():
    a = register("a@test.com")
    b = register("b@test.com", name="User B")
    r = client.post("/api/mood", headers=auth(a["access_token"]),
                    json={"mood": "Happy", "energy_level": 8, "note": "good day"})
    assert r.status_code == 201
    hist_b = client.get("/api/mood/history", headers=auth(b["access_token"]))
    assert hist_b.status_code == 200 and hist_b.json() == []
    # invalid energy rejected
    bad = client.post("/api/mood", headers=auth(a["access_token"]),
                      json={"mood": "Sad", "energy_level": 99})
    assert bad.status_code == 422


def test_activities_and_journal_privacy():
    a = register("a@test.com")
    b = register("b@test.com", name="User B")
    r = client.post("/api/activities", headers=auth(a["access_token"]),
                    json={"title": "Meditation", "activity_type": "meditation",
                          "activity_date": "2026-09-10", "duration_minutes": 15})
    assert r.status_code == 201
    j = client.post("/api/journal", headers=auth(a["access_token"]),
                    json={"title": "Day 1", "content": "private thoughts"})
    assert j.status_code == 201
    assert client.get("/api/journal", headers=auth(b["access_token"])).json() == []
    # B cannot fetch A's entry by id
    r2 = client.get(f"/api/journal/{j.json()['id']}", headers=auth(b["access_token"]))
    assert r2.status_code == 404


def test_facial_checkin_mapping_privacy_and_validation():
    a = register("a@test.com")
    b = register("b@test.com", name="User B")
    r = client.post("/api/facial-check-ins", headers=auth(a["access_token"]),
                    json={"expression": "fear", "confidence": 0.91})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["expression_label"] == "Fearful"
    assert body["mood"] == "Anxious"
    assert body["stress_level"] == 5
    assert body["source"] == "auto"
    assert client.get("/api/facial-check-ins",
                      headers=auth(a["access_token"])).json()[0]["id"] == body["id"]
    assert client.get("/api/facial-check-ins",
                      headers=auth(b["access_token"])).json() == []
    assert client.post("/api/facial-check-ins", headers=auth(a["access_token"]),
                       json={"expression": "excited", "confidence": 0.9}).status_code == 422
    assert client.post("/api/facial-check-ins", headers=auth(a["access_token"]),
                       json={"expression": "neutral", "confidence": 1.5}).status_code == 422


def test_facial_checkins_in_admin_stats_and_member_profile():
    a = register("a@test.com")
    client.post("/api/facial-check-ins", headers=auth(a["access_token"]),
                json={"expression": "happiness", "confidence": 0.88})
    admin_login = client.post("/api/auth/login", json={
        "email": "admin@innerbloom.app", "password": "Admin123!"})
    assert admin_login.status_code == 200
    adm_token = admin_login.json()["access_token"]
    stats = client.get("/api/admin/stats", headers=auth(adm_token))
    assert stats.status_code == 200
    assert stats.json()["total_facial_check_ins"] == 1
    assert stats.json()["active_users"] == 1
    profile = client.get(f"/api/admin/members/{a['user']['id']}", headers=auth(adm_token))
    assert profile.status_code == 200
    body = profile.json()
    assert body["total_facial_check_ins"] == 1
    assert body["recent_facial_check_ins"][0]["mood"] == "Happy"


def test_facial_auto_check_setting_manual_source_and_clear():
    a = register("a@test.com")
    # Defaults to disabled and is per-user.
    r = client.get("/api/facial-check-ins/settings", headers=auth(a["access_token"]))
    assert r.status_code == 200 and r.json()["enabled"] is False
    r = client.put("/api/facial-check-ins/settings", headers=auth(a["access_token"]),
                   json={"enabled": True})
    assert r.status_code == 200 and r.json()["enabled"] is True
    assert client.get("/api/facial-check-ins/settings",
                      headers=auth(a["access_token"])).json()["enabled"] is True

    # Manual captures are stored with source="manual".
    r = client.post("/api/facial-check-ins", headers=auth(a["access_token"]),
                    json={"expression": "sadness", "confidence": 0.72, "source": "manual"})
    assert r.status_code == 201 and r.json()["source"] == "manual"

    # Admin sees the opt-in flag on the member profile.
    admin_login = client.post("/api/auth/login", json={
        "email": "admin@innerbloom.app", "password": "Admin123!"})
    adm_token = admin_login.json()["access_token"]
    profile = client.get(f"/api/admin/members/{a['user']['id']}", headers=auth(adm_token))
    assert profile.json()["auto_check_enabled"] is True

    # Members can wipe their own facial data.
    assert client.delete("/api/facial-check-ins",
                         headers=auth(a["access_token"])).status_code == 204
    assert client.get("/api/facial-check-ins",
                      headers=auth(a["access_token"])).json() == []


def test_dashboard():
    a = register("a@test.com")
    client.post("/api/mood", headers=auth(a["access_token"]),
                json={"mood": "Calm", "energy_level": 6})
    d = client.get("/api/dashboard", headers=auth(a["access_token"]))
    assert d.status_code == 200
    assert d.json()["total_moods"] == 1


def test_matching_excludes_self():
    a = register("a@test.com")
    b = register("b@test.com", name="User B")
    r = client.post("/api/matching/find", headers=auth(a["access_token"]))
    assert r.status_code == 200
    ids = [m["user_id"] for m in r.json()]
    assert a["user"]["id"] not in ids and b["user"]["id"] in ids
    assert all(0 <= m["compatibility_score"] <= 100 for m in r.json())


def test_communities_join_post_rules():
    a = register("a@test.com")
    b = register("b@test.com", name="User B")
    comms = client.get("/api/communities", headers=auth(a["access_token"])).json()
    assert len(comms) >= 5
    cid = comms[0]["id"]
    # cannot post before joining
    r = client.post(f"/api/communities/{cid}/posts", headers=auth(a["access_token"]),
                    json={"content": "hello"})
    assert r.status_code == 403
    assert client.post(f"/api/communities/{cid}/join",
                       headers=auth(a["access_token"])).status_code == 200
    p = client.post(f"/api/communities/{cid}/posts", headers=auth(a["access_token"]),
                    json={"content": "hello"})
    assert p.status_code == 201
    assert client.get(f"/api/communities/{cid}/posts",
                      headers=auth(b["access_token"])).status_code == 200


def test_messaging_and_notifications():
    a = register("a@test.com")
    b = register("b@test.com", name="User B")
    m = client.post("/api/messages", headers=auth(a["access_token"]),
                    json={"recipient_id": b["user"]["id"], "content": "Hi there"})
    assert m.status_code == 201
    conv = client.get(f"/api/messages/{a['user']['id']}",
                      headers=auth(b["access_token"]))
    assert conv.status_code == 200 and len(conv.json()) == 1
    notes = client.get("/api/notifications", headers=auth(b["access_token"])).json()
    assert any(n["kind"] == "message" for n in notes)
    nid = notes[0]["id"]
    assert client.put(f"/api/notifications/{nid}/read",
                      headers=auth(b["access_token"])).status_code == 200
    # A cannot mark B's notification
    assert client.put(f"/api/notifications/{nid}/read",
                      headers=auth(a["access_token"])).status_code == 404


def test_reports_and_admin_guard():
    a = register("a@test.com")
    r = client.post("/api/reports/severity", headers=auth(a["access_token"]),
                    json={"concern_level": "high", "description": "Need support"})
    assert r.status_code == 201
    # normal user blocked from admin
    assert client.get("/api/admin/reports", headers=auth(a["access_token"])).status_code == 403
    # bootstrap admin login (created by startup seed)
    admin_login = client.post("/api/auth/login", json={
        "email": "admin@innerbloom.app", "password": "Admin123!"})
    assert admin_login.status_code == 200
    adm_token = admin_login.json()["access_token"]
    reps = client.get("/api/admin/reports", headers=auth(adm_token))
    assert reps.status_code == 200 and len(reps.json()) == 1


def test_admin_reports_flow():
    from app.core import security
    from app.db import models
    from app.db.database import SessionLocal
    register("a@test.com")
    db = SessionLocal()
    adm = models.User(name="Adm", email="adm@test.com",
                      password_hash=security.hash_password("Admin1234"), role="admin")
    db.add(adm)
    db.flush()
    db.add(models.UserProfile(user_id=adm.id))
    db.commit()
    db.close()
    t = client.post("/api/auth/login",
                    json={"email": "adm@test.com", "password": "Admin1234"}).json()["access_token"]
    a = login()
    client.post("/api/reports/severity", headers=auth(a["access_token"]),
                json={"concern_level": "medium", "description": "check"})
    reps = client.get("/api/admin/reports", headers=auth(t))
    assert reps.status_code == 200 and len(reps.json()) == 1


def test_activity_and_technical_requests_flow():
    a = register("a@test.com")
    h = auth(a["access_token"])

    activity = client.post("/api/reports/severity", headers=h, json={
        "request_type": "activity", "title": "Yoga session",
        "category": "Wellness", "description": "Evening yoga please",
        "preferred_date": "2026-12-01", "preferred_time": "18:00",
        "duration_minutes": 60, "location_pref": "Online",
    })
    assert activity.status_code == 201, activity.text
    body = activity.json()
    assert body["request_type"] == "activity" and body["title"] == "Yoga session"

    technical = client.post("/api/reports/severity", headers=h, json={
        "request_type": "technical", "title": "Chat not loading",
        "category": "Chat", "description": "Messages spin forever",
    })
    assert technical.status_code == 201, technical.text

    # activity requests require a preferred date
    assert client.post("/api/reports/severity", headers=h, json={
        "request_type": "activity", "title": "No date", "description": "x",
    }).status_code == 422

    mine = client.get("/api/reports/mine", headers=h)
    assert mine.status_code == 200 and len(mine.json()) == 2

    adm = client.post("/api/auth/login", json={
        "email": "admin@innerbloom.app", "password": "Admin123!"}).json()["access_token"]
    allr = client.get("/api/admin/reports", headers=auth(adm))
    assert allr.status_code == 200 and len(allr.json()) == 2
    assert allr.json()[0]["reporter_name"] == "User A"

    stats = client.get("/api/admin/stats", headers=auth(adm)).json()
    assert stats["pending_activity_requests"] == 1
    assert stats["pending_technical_reports"] == 1
    assert stats["pending_support_requests"] == 0

    # Role separation: admins use the admin dashboard, not member-only features.
    assert client.get("/api/mood/history", headers=auth(adm)).status_code == 403
    assert client.get("/api/ai/wellness/history", headers=auth(adm)).status_code == 403
    # Both roles still need their own account/profile endpoint.
    assert client.get("/api/users/me", headers=auth(adm)).status_code == 200

    rid = technical.json()["id"]
    updated = client.put(f"/api/admin/reports/{rid}?new_status=resolved&response=Fixed%20now",
                         headers=auth(adm))
    assert updated.status_code == 200 and updated.json()["admin_response"] == "Fixed now"

    mine = client.get("/api/reports/mine", headers=h).json()
    resolved = [r for r in mine if r["id"] == rid][0]
    assert resolved["status"] == "resolved" and resolved["admin_response"] == "Fixed now"


def test_websocket_auth_and_messaging():
    a = register("a@test.com")
    b = register("b@test.com", name="User B")
    # invalid token -> closed
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/chat?token=bad"):
            pass
    with client.websocket_connect(f"/ws/chat?token={a['access_token']}") as wa:
        with client.websocket_connect(f"/ws/chat?token={b['access_token']}") as wb:
            wa.send_json({"recipient_id": b["user"]["id"], "content": "live hi"})
            ack = wa.receive_json()
            assert ack["type"] == "sent"
            incoming = wb.receive_json()
            assert incoming["content"] == "live hi"


def test_conversations_list():
    a = register("a@test.com")
    b = register("b@test.com", name="User B")
    assert client.get("/api/conversations", headers=auth(a["access_token"])).json() == []
    client.post("/api/messages", headers=auth(a["access_token"]),
                json={"recipient_id": b["user"]["id"], "content": "Hello B"})
    convs = client.get("/api/conversations", headers=auth(b["access_token"])).json()
    assert len(convs) == 1
    assert convs[0]["name"] == "User A" and convs[0]["unread_count"] == 1
    # reading the thread marks messages read
    client.get(f"/api/messages/{a['user']['id']}", headers=auth(b["access_token"]))
    convs2 = client.get("/api/conversations", headers=auth(b["access_token"])).json()
    assert convs2[0]["unread_count"] == 0


def test_connected_peers_appear_in_conversations_without_messages():
    a = register("a@test.com")
    b = register("b@test.com", name="User B")
    connect = client.post(f"/api/matching/connect/{b['user']['id']}",
                          headers=auth(a["access_token"]))
    assert connect.status_code == 201

    for me, other in ((a, b), (b, a)):
        convs = client.get("/api/conversations", headers=auth(me["access_token"])).json()
        assert len(convs) == 1
        assert convs[0]["user_id"] == other["user"]["id"]
        assert convs[0]["last_message"] == "" and convs[0]["unread_count"] == 0

    client.post("/api/messages", headers=auth(a["access_token"]),
                json={"recipient_id": b["user"]["id"], "content": "Hello B"})
    convs = client.get("/api/conversations", headers=auth(b["access_token"])).json()
    assert len(convs) == 1 and convs[0]["last_message"] == "Hello B"


def test_ai_wellness_requires_auth_and_validates():
    assert client.post("/api/ai/wellness", json={"message": "hello"}).status_code == 401
    a = register("a@test.com")
    assert client.post("/api/ai/wellness", headers=auth(a["access_token"]),
                       json={"message": ""}).status_code == 422
    assert client.post("/api/ai/wellness", headers=auth(a["access_token"]),
                       json={"message": "   "}).status_code == 422


def test_ai_wellness_crisis_guardrail():
    a = register("a@test.com")
    r = client.post("/api/ai/wellness", headers=auth(a["access_token"]),
                    json={"message": "I want to kill myself"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["crisis"] is True
    assert any("14416" in item for item in body["resources"])
    hist = client.get("/api/ai/wellness/history",
                      headers=auth(a["access_token"])).json()
    assert [m["role"] for m in hist] == ["user", "assistant"]
    assert hist[1]["crisis"] is True


def test_ai_wellness_success_persists_and_clears(monkeypatch):
    a = register("a@test.com")
    b = register("b@test.com", name="User B")

    async def fake_call(history, message):
        assert history == []
        assert message == "I feel stressed"
        return "Take a slow breath with me."

    monkeypatch.setattr("app.services.ai_service._call_groq", fake_call)
    r = client.post("/api/ai/wellness", headers=auth(a["access_token"]),
                    json={"message": "I feel stressed"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["message"]["content"] == "Take a slow breath with me."
    assert body["crisis"] is False
    hist = client.get("/api/ai/wellness/history",
                      headers=auth(a["access_token"])).json()
    assert [m["role"] for m in hist] == ["user", "assistant"]
    assert client.get("/api/ai/wellness/history",
                      headers=auth(b["access_token"])).json() == []
    assert client.delete("/api/ai/wellness/history",
                         headers=auth(a["access_token"])).status_code == 204
    assert client.get("/api/ai/wellness/history",
                      headers=auth(a["access_token"])).json() == []


def test_ai_wellness_missing_key(monkeypatch):
    a = register("a@test.com")
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "GROQ_API_KEY", "")
    r = client.post("/api/ai/wellness", headers=auth(a["access_token"]),
                    json={"message": "hello"})
    assert r.status_code == 503
    assert "GROQ_API_KEY" in r.json()["detail"]
