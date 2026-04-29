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
