"""API tests. The Whisper model is mocked, so these run without downloading anything."""

import pytest
from fastapi.testclient import TestClient

from app import main, transcriber


@pytest.fixture()
def client(monkeypatch):
    calls = []

    def fake_transcribe(audio, model_name, language):
        calls.append({"size": len(audio), "model": model_name, "language": language})
        return "hello world"

    monkeypatch.setattr(main.transcriber, "transcribe_bytes", fake_transcribe)
    monkeypatch.setattr(main.transcriber, "load_model", lambda name: object())
    test_client = TestClient(main.app)
    test_client.calls = calls
    return test_client


def test_index_serves_page(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "Speech Notepad" in response.text
    assert "/static/app.js" in response.text


def test_static_assets_are_served(client):
    assert client.get("/static/app.js").status_code == 200
    assert client.get("/static/style.css").status_code == 200


def test_health_lists_models_and_languages(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert set(body["models"]) == {"tiny", "base", "small"}
    assert set(body["languages"]) == {"english", "hindi", "auto"}


def test_transcribe_returns_text(client):
    response = client.post(
        "/api/transcribe",
        files={"audio": ("recording.webm", b"\x1a\x45\xdf\xa3fake", "audio/webm")},
        data={"model": "base", "language": "hindi"},
    )
    assert response.status_code == 200
    assert response.json() == {"text": "hello world", "model": "base", "language": "hindi"}
    assert client.calls == [{"size": 8, "model": "base", "language": "hindi"}]


def test_transcribe_defaults_to_base_english(client):
    client.post("/api/transcribe", files={"audio": ("a.webm", b"data", "audio/webm")})
    assert client.calls[-1]["model"] == "base"
    assert client.calls[-1]["language"] == "english"


def test_transcribe_rejects_empty_upload(client):
    response = client.post("/api/transcribe", files={"audio": ("a.webm", b"", "audio/webm")})
    assert response.status_code == 400


def test_transcribe_rejects_unknown_model(client):
    response = client.post(
        "/api/transcribe",
        files={"audio": ("a.webm", b"data", "audio/webm")},
        data={"model": "gigantic"},
    )
    assert response.status_code == 400


def test_transcribe_rejects_unknown_language(client):
    response = client.post(
        "/api/transcribe",
        files={"audio": ("a.webm", b"data", "audio/webm")},
        data={"language": "klingon"},
    )
    assert response.status_code == 400


def test_transcribe_rejects_oversized_upload(client, monkeypatch):
    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 10)
    response = client.post(
        "/api/transcribe", files={"audio": ("a.webm", b"x" * 50, "audio/webm")}
    )
    assert response.status_code == 413


def test_decode_failure_returns_422(client, monkeypatch):
    def broken(audio, model_name, language):
        raise RuntimeError("bad container")

    monkeypatch.setattr(main.transcriber, "transcribe_bytes", broken)
    response = client.post("/api/transcribe", files={"audio": ("a.webm", b"junk", "audio/webm")})
    assert response.status_code == 422
    assert "bad container" in response.json()["detail"]


def test_load_endpoint_validates_model(client):
    assert client.post("/api/load", data={"model": "nope"}).status_code == 400
    response = client.post("/api/load", data={"model": "tiny"})
    assert response.status_code == 200
    assert response.json() == {"model": "tiny", "ready": True}


def test_language_codes_map_to_whisper_codes():
    assert transcriber.LANGUAGE_CODES == {"english": "en", "hindi": "hi", "auto": None}
