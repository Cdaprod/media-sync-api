"""Compatibility wrapper for the upgraded source registry."""

from app.storage.sources_registry import (  # noqa: F401
    Source,
    SourceCapabilities,
    SourceRegistry,
    normalize_source_name,
    validate_source_name,
)
