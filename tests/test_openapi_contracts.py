from __future__ import annotations

from app.main import app


def test_recording_upload_schema_exists() -> None:
    openapi = app.openapi()
    paths = openapi['paths']
    assert '/api/live_sessions/{session_id}/recording/upload' in paths

    post_schema = paths['/api/live_sessions/{session_id}/recording/upload']['post']
    request_body = post_schema.get('requestBody', {})
    multipart = request_body.get('content', {}).get('multipart/form-data', {})
    assert multipart, 'expected multipart/form-data request body for recording upload'

    schema = multipart.get('schema', {})
    if '$ref' in schema:
        ref_name = schema['$ref'].split('/')[-1]
        schema = openapi['components']['schemas'][ref_name]

    required = set(schema.get('required', []))
    assert {'file', 'project'}.issubset(required)

    properties = schema['properties']
    assert properties['source']['default'] == 'primary'
    assert properties['target_dir']['default'] == 'ingest/live'


def test_route_family_ownership_paths_exist() -> None:
    openapi = app.openapi()
    paths = openapi['paths']

    assert '/api/live' in paths
    assert '/api/live_sessions' in paths
    assert '/api/recordings' in paths
    assert '/api/ingest/claims' in paths
    assert '/api/nodes' in paths
    assert any(path.startswith('/media/') for path in paths)
    assert any(path.startswith('/thumbnails/') for path in paths)


def test_no_accidental_route_rename() -> None:
    paths = app.openapi()['paths']
    assert '/api/live' in paths
    assert '/api/live_sessions' in paths
    assert '/api/recordings' in paths


def test_media_and_thumbnail_routes_remain_gettable() -> None:
    paths = app.openapi()['paths']

    media_routes = [path for path in paths if path.startswith('/media/')]
    thumbnail_routes = [path for path in paths if path.startswith('/thumbnails/')]

    assert media_routes, 'expected at least one /media route'
    assert thumbnail_routes, 'expected at least one /thumbnails route'

    assert all('get' in paths[path] for path in media_routes)
    assert all('get' in paths[path] for path in thumbnail_routes)
