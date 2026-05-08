from __future__ import annotations


def test_record_start_creates_runtime_asset_and_stop_without_materialization_fails_asset(client):
    session_id = 'sess-runtime-assets-1'
    client.post(
        f'/api/live/{session_id}/offer',
        json={'node_id': 'node-runtime-assets', 'offer': {'type': 'offer', 'sdp': 'v=0\r\no=offer'}},
    )

    started = client.post(f'/api/live/{session_id}/record/start', json={'project': 'RuntimeAssets', 'source': 'primary'})
    assert started.status_code == 200
    rec = started.json()['recording']

    listed = client.get('/api/runtime/assets')
    assert listed.status_code == 200
    match = next((a for a in listed.json()['assets'] if a['recording_id'] == rec['recording_id']), None)
    assert match is not None
    assert match['state'] == 'recording'

    stopped = client.post(f'/api/live/{session_id}/record/stop', json={})
    assert stopped.status_code == 200

    listed_after = client.get('/api/runtime/assets')
    match_after = next((a for a in listed_after.json()['assets'] if a['recording_id'] == rec['recording_id']), None)
    assert match_after is not None
    assert match_after['state'] == 'failed'
    assert match_after['error'] == 'recording_not_materialized'

def test_live_offer_creates_previewable_runtime_asset(client):
    session_id = 'sess-runtime-live-1'
    posted = client.post(
        f'/api/live/{session_id}/offer',
        json={'node_id': 'node-runtime-live', 'offer': {'type': 'offer', 'sdp': 'v=0\r\no=offer'}},
    )
    assert posted.status_code == 200

    listed = client.get('/api/runtime/assets')
    assert listed.status_code == 200
    match = next((a for a in listed.json()['assets'] if a['id'] == f'runtime-live-{session_id}'), None)
    assert match is not None
    assert match['kind'] == 'live'
    assert match['state'] == 'previewable'


def test_live_session_and_runtime_asset_alignment_contract(client):
    session_id = 'sess-runtime-live-align'
    node_id = 'node-runtime-live-align'
    client.post(
        f'/api/live/{session_id}/offer',
        json={'node_id': node_id, 'offer': {'type': 'offer', 'sdp': 'v=0\r\no=offer'}},
    )
    listed_sessions = client.get('/api/live')
    assert listed_sessions.status_code == 200
    session = next((s for s in listed_sessions.json()['sessions'] if s['session_id'] == session_id), None)
    assert session is not None
    assert session['node_id'] == node_id
    assert session['has_offer'] is True

    listed_assets = client.get('/api/runtime/assets')
    assert listed_assets.status_code == 200
    asset = next((a for a in listed_assets.json()['assets'] if a['id'] == f'runtime-live-{session_id}'), None)
    assert asset is not None
    assert asset['kind'] == 'live'
    assert asset['state'] == 'previewable'
    # Cohesive contract alignment between live session + runtime surface.
    assert asset['session_id'] == session_id
    assert asset['node_id'] == node_id


def test_runtime_assets_stream_route_is_not_shadowed_by_asset_id_route(client):
    response = client.get('/api/runtime/assets/stream')
    assert response.status_code == 200
    assert response.headers['content-type'].startswith('text/event-stream')
    # The static /stream route must beat /{asset_id}; otherwise this would
    # return runtime_asset_not_found with asset_id="stream".
    assert b'runtime_asset_not_found' not in response.content
    assert b'event: heartbeat' in response.content
