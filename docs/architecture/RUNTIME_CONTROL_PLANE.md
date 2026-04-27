# Runtime Control Plane

## CAS metadata model

- **Asset**: finalized media object stored at a durable project-relative path.
- **sha256**: deterministic content fingerprint for the durable file bytes.
- **content_address**: canonical CAS address in `sha256:<hex>` form.
- **size_bytes**: durable content size in bytes after final write completion.
- **content_mtime**: filesystem content mtime for the finalized file.
- **indexed_at**: timestamp when the durable file was indexed.

## Integrity policy

Index records should reference only durable final files. Temporary write artifacts (for example
`.tmp` and `.partial` files) must stay outside index/media listing surfaces.
