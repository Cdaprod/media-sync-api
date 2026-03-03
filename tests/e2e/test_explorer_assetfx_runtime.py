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


def _pt_in_rect(px, py, rect, pad=0.0):
    return (
        (px >= (rect["x"] - pad))
        and (py >= (rect["y"] - pad))
        and (px <= (rect["x"] + rect["width"] + pad))
        and (py <= (rect["y"] + rect["height"] + pad))
    )


def _rect_from_lastrect_entry(entry):
    x1 = float(entry.get("x1", 0.0))
    y1 = float(entry.get("y1", 0.0))
    x2 = float(entry.get("x2", x1))
    y2 = float(entry.get("y2", y1))
    return {
        "x": x1,
        "y": y1,
        "width": max(0.0, x2 - x1),
        "height": max(0.0, y2 - y1),
    }


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


def test_explorer_fx_debug_rects_centerpoint_alignment_space_agnostic(page):
    page.goto("http://127.0.0.1:8787/public/explorer.html?fxdebug=1", wait_until="domcontentloaded")
    page.wait_for_timeout(1600)

    payload = page.evaluate(
        """() => {
      const dpr = window.devicePixelRatio || 1;
      const W = innerWidth;
      const H = innerHeight;
      const cards = [...document.querySelectorAll('.asset')].slice(0, 12).map((el, idx) => {
        const r = el.getBoundingClientRect();
        const key = el.dataset.assetId || el.dataset.selectKey || el.dataset.sha256 || String(idx);
        return { key, rect: { x:r.left, y:r.top, width:r.width, height:r.height } };
      });
      const rects = (window.__assetfx_dbg?.lastRects || []).map((it) => ({
        key: it.key || null, x1: it.x1, y1: it.y1, x2: it.x2, y2: it.y2
      }));
      return { dpr, W, H, cards, rects };
    }"""
    )

    assert payload and payload["cards"], "no cards found"
    assert payload["rects"] and len(payload["rects"]) > 0, "no debug rects found"

    dpr = float(payload["dpr"] or 1.0)
    viewport_width = float(payload["W"])
    viewport_height = float(payload["H"])

    max_x2 = max(float(r.get("x2") or 0.0) for r in payload["rects"])
    max_y2 = max(float(r.get("y2") or 0.0) for r in payload["rects"])
    debug_is_dpr_space = (max_x2 > (viewport_width * 1.25)) or (max_y2 > (viewport_height * 1.25))
    scale = (1.0 / dpr) if debug_is_dpr_space and dpr > 0 else 1.0

    debug_rects_css = []
    for item in payload["rects"]:
        rect = _rect_from_lastrect_entry(item)
        debug_rects_css.append(
            {
                "x": rect["x"] * scale,
                "y": rect["y"] * scale,
                "width": rect["width"] * scale,
                "height": rect["height"] * scale,
                "key": item.get("key"),
            }
        )

    failures = []
    tolerance = 8.0
    for card in payload["cards"][:8]:
        card_rect = card["rect"]
        center_x = float(card_rect["x"] + (card_rect["width"] / 2.0))
        center_y = float(card_rect["y"] + (card_rect["height"] / 2.0))
        if not any(_pt_in_rect(center_x, center_y, rect, pad=tolerance) for rect in debug_rects_css):
            failures.append(
                {
                    "key": card["key"],
                    "center": (center_x, center_y),
                    "card": card_rect,
                    "debug_space": "dpr_px" if debug_is_dpr_space else "css_px",
                    "dpr": dpr,
                }
            )

    assert not failures, f"center-point debug rect misalignment (first 2): {failures[:2]}"


def test_explorer_overlay_interceptors_are_inert(page):
    page.goto("http://127.0.0.1:8787/public/explorer.html?fxdebug=1", wait_until="domcontentloaded")
    page.wait_for_timeout(1600)

    offenders = page.evaluate(
        """() => {
      const nodes = [...document.querySelectorAll('html > div[style*="all: initial"]')];
      return nodes.map((n) => {
        const r = n.getBoundingClientRect();
        const cs = getComputedStyle(n);
        return {
          exists: true,
          w: r.width,
          h: r.height,
          left: r.left,
          top: r.top,
          pointerEvents: cs.pointerEvents,
          position: cs.position,
          zIndex: cs.zIndex,
          opacity: cs.opacity,
          style: n.getAttribute('style') || '',
          sanitized: n.dataset.overlaySanitized || null,
        };
      });
    }"""
    )

    if not offenders:
        return

    for offender in offenders:
        assert offender["pointerEvents"] == "none", f"overlay interceptor not inert: {offender}"
        if offender["w"] > 200 and offender["h"] > 200:
            assert offender["opacity"] in ("0", "0.0") or offender["sanitized"] == "1", (
                f"large interceptor present: {offender}"
            )


def test_explorer_fx_badge_state_distribution_is_healthy(page):
    page.goto("http://127.0.0.1:8787/public/explorer.html?fxdebug=1", wait_until="domcontentloaded")
    page.wait_for_timeout(2000)

    badges = page.evaluate(
        """() => {
      const list = [...document.querySelectorAll('.asset .fx-debug-badge')].slice(0, 18);
      return list.map((badge) => (badge.textContent || '').trim()).filter(Boolean);
    }"""
    )

    assert badges is not None, "badge query failed"
    assert len(badges) >= 6, f"not enough badges found (got {len(badges)}): {badges}"

    sampled = [badge for badge in badges if badge.endswith("S") or badge.endswith("K")]
    pending = [badge for badge in badges if badge.endswith("P")]
    visible = [badge for badge in badges if len(badge) >= 3 and badge[2] == "V"]

    assert len(visible) >= 3, f"too few visible badges: {badges}"
    assert len(sampled) >= 1, f"no sampled badges (S/K) after settle: {badges}"
    assert len(pending) <= 8, f"too many pending badges after settle: pending={len(pending)} badges={badges}"


def test_explorer_fx_center_hit_never_lands_on_canvas_or_sanitized_overlay(page):
    page.goto("http://127.0.0.1:8787/public/explorer.html?fxdebug=1", wait_until="domcontentloaded")
    page.wait_for_timeout(1600)

    hit = page.evaluate(
        """() => {
      const x = innerWidth / 2;
      const y = innerHeight / 2;
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const rootAllInitial = el.matches?.('html > div[style*="all: initial"]') || false;
      return {
        tag: el.tagName,
        cls: el.className || null,
        style: el.getAttribute('style') || null,
        pointerEvents: cs.pointerEvents,
        isCanvas: el.tagName === 'CANVAS',
        isAllInitialRoot: rootAllInitial,
        isSanitized: el.dataset?.overlaySanitized || null,
        asset: !!el.closest?.('.asset'),
      };
    }"""
    )

    assert hit is not None
    assert hit["isCanvas"] is False, f"center hit landed on canvas: {hit}"
    assert hit["isAllInitialRoot"] is False, f"center hit landed on all:initial wrapper: {hit}"
    assert hit["isSanitized"] != "1", f"center hit landed on sanitized overlay node: {hit}"
    assert hit["asset"] is True, f"center hit not inside asset: {hit}"




def test_explorer_fx_scroll_replay_has_no_runtime_reference_errors(page):
    errors = []

    def on_page_error(exc):
        errors.append(str(exc))

    page.on("pageerror", on_page_error)
    page.goto("http://127.0.0.1:8787/public/explorer.html?fxdebug=1", wait_until="domcontentloaded")
    page.wait_for_timeout(1500)

    page.evaluate("""() => {
      const root = document.getElementById('mediaGridRoot');
      if (!root) return;
      for (let i = 0; i < 8; i += 1) {
        root.scrollTop += Math.max(220, Math.round(root.clientHeight * 0.45));
        root.dispatchEvent(new Event('scroll'));
      }
      for (let i = 0; i < 8; i += 1) {
        root.scrollTop -= Math.max(220, Math.round(root.clientHeight * 0.45));
        root.dispatchEvent(new Event('scroll'));
      }
    }""")
    page.wait_for_timeout(900)

    ref_errors = [msg for msg in errors if 'ReferenceError' in msg or 'debugRects' in msg]
    assert not ref_errors, f"runtime errors during replay sweep: {ref_errors}"








def test_explorer_fx_debug_rects_change_after_scroll(page):
    page.goto("http://127.0.0.1:8787/public/explorer.html?fxdebug=1", wait_until="domcontentloaded")
    page.wait_for_timeout(1400)

    before = page.evaluate("""() => JSON.stringify(window.__assetfx_dbg?.lastRects || [])""")

    page.evaluate("""() => {
      const root = document.getElementById('mediaGridRoot');
      if (!root) return;
      const max = root.scrollHeight - root.clientHeight;
      root.scrollTop = Math.floor(max * 0.6);
      root.dispatchEvent(new Event('scroll'));
    }""")
    page.wait_for_timeout(500)

    after = page.evaluate("""() => JSON.stringify(window.__assetfx_dbg?.lastRects || [])""")
    assert before != after, "debug rects did not change after scroll; mapping/cache may be stuck"


def test_explorer_fx_overlay_canvas_matches_viewport_not_tiny(page):
    page.goto("http://127.0.0.1:8787/public/explorer.html?fxdebug=1&layoutdebug=1", wait_until="domcontentloaded")
    page.wait_for_timeout(1400)

    info = page.evaluate("""() => {
      const dpr = window.devicePixelRatio || 1;
      const vv = window.visualViewport;
      const vw = vv?.width ?? document.documentElement.clientWidth ?? window.innerWidth;
      const vh = vv?.height ?? document.documentElement.clientHeight ?? window.innerHeight;

      const fx = document.querySelector('canvas[data-assetfx="overlay"]');
      const fxh = fx ? fx.height : null;
      const fxw = fx ? fx.width : null;

      return {
        dpr,
        vw,
        vh,
        canvasW: fxw,
        canvasH: fxh,
        expectedW: Math.round(vw * dpr),
        expectedH: Math.round(vh * dpr),
      };
    }""")

    assert info["canvasH"] is not None, f"no overlay canvas: {info}"
    assert info["canvasH"] >= 600, f"overlay canvas height suspiciously tiny: {info}"

    delta_h = abs(info["canvasH"] - info["expectedH"])
    delta_w = abs(info["canvasW"] - info["expectedW"])
    assert delta_h <= max(220, int(info["expectedH"] * 0.15)), f"overlay canvas height far from viewport: {info}"
    assert delta_w <= max(220, int(info["expectedW"] * 0.15)), f"overlay canvas width far from viewport: {info}"


def test_explorer_fx_debug_rects_stay_aligned_after_scroll_churn(page):
    page.goto("http://127.0.0.1:8787/public/explorer.html?fxdebug=1", wait_until="domcontentloaded")
    page.wait_for_timeout(1500)

    page.evaluate("""() => {
      const root = document.getElementById('mediaGridRoot');
      if (!root) return;
      const max = root.scrollHeight - root.clientHeight;
      const steps = [0, max, Math.floor(max * 0.25), Math.floor(max * 0.75), 0, max, 0];
      for (const y of steps) {
        root.scrollTop = y;
        root.dispatchEvent(new Event('scroll'));
      }
    }""")
    page.wait_for_timeout(900)

    cards = page.evaluate("""() => {
      const list = [...document.querySelectorAll('.asset')].slice(0, 12);
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
    assert len(debug_rects) > 0, "no debug rects recorded after scroll churn"

    failures = []
    for card in cards[:8]:
        best_iou = 0.0
        for debug_rect in debug_rects:
            best_iou = max(best_iou, _iou(card["rect"], debug_rect["rect"]))
        if best_iou < 0.55:
            failures.append((card["key"], best_iou, card["rect"]))
    assert not failures, f"debug rect misalignment after scroll churn: {failures[:3]}"


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
