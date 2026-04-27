"""Browser device capture surface for runtime nodes.

Example:
    curl "http://localhost:8787/connect/device?node_id=runner-1"
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse

from app.runtime import get_runtime
from app.runtime.types import AppRuntime

router = APIRouter(tags=["connect-device"])


@router.get("/connect/device", response_class=HTMLResponse)
async def connect_device(node_id: str, runtime: AppRuntime = Depends(get_runtime)) -> HTMLResponse:
    """Render browser camera shell for a registered node.

    Example:
        /connect/device?node_id=runner-browser-1
    """

    registry = runtime.services.node_registry
    if registry is None:
        raise HTTPException(status_code=503, detail="node_registry_unavailable")

    node = registry.get_node(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail="node_not_found")

    safe_label = (node.label or node.node_id).replace("<", "&lt;").replace(">", "&gt;")
    safe_node_id = node.node_id.replace("<", "&lt;").replace(">", "&gt;")
    html = f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>Device Capture · {safe_label}</title>
  <style>
    body {{ margin: 0; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #050814; color: #e7ebf2; }}
    main {{ max-width: 960px; margin: 0 auto; padding: 20px; }}
    video {{ width: 100%; border-radius: 14px; background: #10192f; border: 1px solid rgba(145,170,255,0.28); }}
    .meta {{ margin-bottom: 12px; color: #aebbd8; }}
    .status {{ margin-top: 12px; white-space: pre-wrap; font-size: 14px; }}
  </style>
</head>
<body>
  <main>
    <h2>{safe_label}</h2>
    <div class=\"meta\">node_id: <code>{safe_node_id}</code></div>
    <video id=\"local\" autoplay playsinline muted></video>
    <div id=\"status\" class=\"status\">Initializing camera…</div>
  </main>
  <script>
    const nodeId = {safe_node_id!r};
    const video = document.getElementById('local');
    const statusEl = document.getElementById('status');

    function setStatus(text) {{
      statusEl.textContent = text;
    }}

    function pollDelayMs(attempt) {{
      if (attempt > 30) return 5000;
      if (attempt > 10) return 2000;
      return 1000;
    }}

    async function waitForVisibleDocument() {{
      if (document.visibilityState !== 'hidden') return;
      await new Promise((resolve) => {{
        const onVisibility = () => {{
          if (document.visibilityState === 'visible') {{
            document.removeEventListener('visibilitychange', onVisibility);
            resolve();
          }}
        }};
        document.addEventListener('visibilitychange', onVisibility);
      }});
    }}

    async function pollForAnswer(pc, sessionId) {{
      let attempts = 0;
      while (true) {{
        await waitForVisibleDocument();
        let response;
        try {{
          response = await fetch(`/api/live/${{encodeURIComponent(sessionId)}}/answer`, {{ cache: 'no-store' }});
        }} catch (error) {{
          setStatus(`Polling answer failed: ${{error?.message || error}}`);
          await new Promise((resolve) => window.setTimeout(resolve, pollDelayMs(attempts)));
          continue;
        }}

        if (response.ok) {{
          const payload = await response.json();
          await pc.setRemoteDescription(payload.answer);
          setStatus('Explorer answered. Live connection established.');
          return;
        }}

        if (response.status !== 404) {{
          setStatus(`Waiting for answer (status ${{response.status}})…`);
        }}

        attempts += 1;
        await new Promise((resolve) => window.setTimeout(resolve, pollDelayMs(attempts)));
      }}
    }}

    async function start() {{
      try {{
        const stream = await navigator.mediaDevices.getUserMedia({{ video: true, audio: true }});
        video.srcObject = stream;

        const sessionId = (globalThis.crypto?.randomUUID?.() || `${{Date.now()}}-${{Math.random().toString(16).slice(2)}}`);
        const pc = new RTCPeerConnection();
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await fetch(`/api/live/${{encodeURIComponent(sessionId)}}/offer`, {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{ node_id: nodeId, offer: pc.localDescription }}),
        }});

        setStatus(`Published offer for session ${{sessionId}}. Waiting for Explorer answer…`);
        await pollForAnswer(pc, sessionId);

        // TODO(recording): fork recording from MediaStreamTrack / MediaStream via MediaRecorder.
        // Do not record from a reused <video> element; preview + recording must fork from tracks.
      }} catch (error) {{
        setStatus(`Camera startup failed: ${{error?.message || error}}`);
      }}
    }}

    void start();
  </script>
</body>
</html>"""
    return HTMLResponse(content=html)
