"""Browser UI tests (Python Playwright).

They need the server running (uvicorn app.main:app --port 8000) and use a fake microphone.
Set BASE_URL to test another address. Tests are skipped if the server is not reachable.
Set CHROMIUM_PATH to use a specific Chromium binary.
"""

import os
import urllib.request

import pytest

playwright_sync = pytest.importorskip("playwright.sync_api")

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:8000")


def _server_up() -> bool:
    try:
        with urllib.request.urlopen(f"{BASE_URL}/api/health", timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _server_up(), reason=f"server not running at {BASE_URL}")


@pytest.fixture(scope="module")
def page():
    with playwright_sync.sync_playwright() as p:
        launch_args = {
            "args": [
                "--use-fake-ui-for-media-stream",
                "--use-fake-device-for-media-stream",
            ]
        }
        if os.environ.get("CHROMIUM_PATH"):
            launch_args["executable_path"] = os.environ["CHROMIUM_PATH"]
        browser = p.chromium.launch(**launch_args)
        context = browser.new_context(permissions=["microphone"])
        pg = context.new_page()
        pg.goto(BASE_URL)
        yield pg
        browser.close()


def test_page_loads_with_editor(page):
    assert page.title() == "Speech Notepad"
    assert page.locator("#editor").is_visible()


def test_record_button_toggles(page):
    record = page.locator("#recordBtn")
    record.click()
    # Microphone setup is async, so wait for the state change rather than checking at once.
    page.wait_for_function("document.querySelector('#recordBtn').getAttribute('aria-pressed') === 'true'")
    record.click()  # stops and sends the (short) clip to the server
    page.wait_for_function("document.querySelector('#recordBtn').getAttribute('aria-pressed') === 'false'")


def test_typed_text_updates_word_count(page):
    page.locator("#editor").fill("one two three")
    assert page.locator("#wordCount").inner_text() == "3 words"
