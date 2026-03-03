import os
import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_PLAYWRIGHT_E2E") != "1",
    reason="set RUN_PLAYWRIGHT_E2E=1 to run browser assertions",
)


def _rect_area(r):
    return max(0, r["width"]) * max(0, r["height"])


def _rect_intersection(a, b):
    x1 = max(a["x"], b["x"])
    y1 = max(a["y"], b["y"])
    x2 = min(a["x"] + a["width"], b["x"] + b["width"])
    y2 = min(a["y"] + a["height"], b["y"] + b["height"])
    w = max(0, x2 - x1)
    h = max(0, y2 - y1)
    return {"x": x1, "y": y1, "width": w, "height": h}


def _iou(a, b):
    inter = _rect_intersection(a, b)
    inter_area = _rect_area(inter)
    if inter_area <= 0:
        return 0.0
    union = _rect_area(a) + _rect_area(b) - inter_area
    return inter_area / union if union > 0 else 0.0


@pytest.fixture(scope="session")
def playwright():
    return pytest.importorskip("playwright.sync_api")


@pytest.fixture()
def page(playwright):
    with playwright.sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 980, "height": 740})
        try:
            yield page
        finally:
            browser.close()


def test_explorer_fx_layers_do_not_occlude_cards(page):
    page.goto("http://127.0.0.1:8787/public/explorer.html?fxdebug=1", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)

    overlay_count = page.evaluate("document.querySelectorAll('canvas[data-assetfx=\"overlay\"]').length")
    assert overlay_count <= 1

    hit = page.evaluate("""() => {
      const el = document.elementFromPoint(innerWidth/2, innerHeight/2);
      if (!el) return null;
      return {
        tag: el.tagName,
        cls: el.className || null,
        style: el.getAttribute('style') || null,
        isCanvas: el.tagName === 'CANVAS',
        asset: !!el.closest?.('.asset'),
      };
    }""")
    assert hit is not None
    assert hit["isCanvas"] is False, f"center hit landed on canvas: {hit}"
    assert hit["asset"] is True, f"center hit not inside asset: {hit}"


def test_explorer_fx_debug_rects_align_with_dom_cards(page):
    page.goto("http://127.0.0.1:8787/public/explorer.html?fxdebug=1", wait_until="domcontentloaded")
    page.wait_for_timeout(1400)

    has_dbg = page.evaluate("typeof window.__assetfx_dbg === 'object'")
    assert has_dbg is True

    cards = page.evaluate("""() => {
      const list = [...document.querySelectorAll('.asset')].slice(0, 10);
      return list.map((el, idx) => {
        const r = el.getBoundingClientRect();
        const key = el.dataset.assetId || el.dataset.selectKey || el.dataset.sha256 || String(idx);
        return { key, rect: { x:r.left, y:r.top, width:r.width, height:r.height } };
      });
    }""")
    assert cards and len(cards) >= 4

    debug_rects = page.evaluate("""() => {
      const r = window.__assetfx_dbg?.lastRects || [];
      return r.map(it => ({
        key: it.key || null,
        rect: { x: it.x1, y: it.y1, width: (it.x2 - it.x1), height: (it.y2 - it.y1) },
      }));
    }""")
    assert isinstance(debug_rects, list)
    assert len(debug_rects) > 0, "no debug rects recorded"

    failures = []
    for c in cards[:6]:
      best_iou = 0.0
      for dr in debug_rects:
        best_iou = max(best_iou, _iou(c["rect"], dr["rect"]))
      if best_iou < 0.55:
        failures.append((c["key"], best_iou, c["rect"]))
    assert not failures, f"debug rect misalignment: {failures[:3]}"


def test_explorer_fx_only_tracks_visible_cards(page):
    page.goto("http://127.0.0.1:8787/public/explorer.html?fxdebug=1", wait_until="domcontentloaded")
    page.wait_for_timeout(1400)

    page.evaluate("""() => {
      const root = document.getElementById('mediaGridRoot');
      root.scrollTop = root.scrollHeight;
      root.dispatchEvent(new Event('scroll'));
    }""")
    page.wait_for_timeout(600)

    stats = page.evaluate("""() => ({
      visible: window.__assetfx_instance?.visibleCards?.size ?? null,
      tracked: window.__assetfx_instance?.trackedCards?.size ?? null,
      pending: window.__assetfx_instance?.pendingDissolves?.length ?? null,
      active: window.__assetfx_instance?.activeDissolves?.size ?? null,
      dropped: window.__assetfx_instance?.droppedByCapCount ?? null,
    })""")
    assert stats["visible"] is not None
    assert stats["pending"] is not None
    assert stats["active"] is not None
    assert stats["pending"] <= 60
    assert stats["active"] <= 6
    assert stats["visible"] <= 60, f"visibleCards too large: {stats}"


def test_explorer_thumbnails_do_not_regress_after_scroll_roundtrip(page):
    page.goto("http://127.0.0.1:8787/public/explorer.html", wait_until="domcontentloaded")
    page.wait_for_timeout(1600)

    before = page.evaluate("""() => {
      const imgs = [...document.querySelectorAll('.asset img')].slice(0, 8);
      return imgs.map(img => ({
        key: img.dataset.thumbStateKey || img.closest('.asset')?.dataset?.assetId || img.closest('.asset')?.dataset?.selectKey || null,
        state: img.dataset.thumbState || img.closest('[data-thumb-state]')?.dataset?.thumbState || null,
        src: (img.currentSrc || img.src || ''),
      }));
    }""")
    assert len(before) >= 4

    page.evaluate("""() => {
      const root = document.getElementById('mediaGridRoot');
      root.scrollTop = root.scrollHeight;
      root.dispatchEvent(new Event('scroll'));
    }""")
    page.wait_for_timeout(900)
    page.evaluate("""() => {
      const root = document.getElementById('mediaGridRoot');
      root.scrollTop = 0;
      root.dispatchEvent(new Event('scroll'));
    }""")
    page.wait_for_timeout(1200)

    after = page.evaluate("""() => {
      const imgs = [...document.querySelectorAll('.asset img')].slice(0, 8);
      return imgs.map(img => ({
        key: img.dataset.thumbStateKey || img.closest('.asset')?.dataset?.assetId || img.closest('.asset')?.dataset?.selectKey || null,
        state: img.dataset.thumbState || img.closest('[data-thumb-state]')?.dataset?.thumbState || null,
        src: (img.currentSrc || img.src || ''),
      }));
    }""")

    regressions = []
    for b in before:
      if not b["key"]:
        continue
      a = next((x for x in after if x["key"] == b["key"]), None)
      if not a:
        continue
      if (b["state"] == "loaded") and (a["state"] in ("loading", None, "")):
        regressions.append((b["key"], b["state"], a["state"]))
      if b["state"] == "loaded" and (not a["src"] or a["src"].strip() == ""):
        regressions.append((b["key"], "src_nonempty", "src_empty"))
    assert not regressions, f"thumb regressions after scroll: {regressions[:5]}"
