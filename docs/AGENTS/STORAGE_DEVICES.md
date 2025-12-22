# Media Source Management – Concepts attempting to complete

- Index projects/media idempotently and automatically.
- API is LAN accessible and controlled.
- Media is put in projects automatically and the server is a handler.
- Currently designed to source and ingest from one SMB location (on 192.168.0.25).
    - Needs to be able to:
        - Index media from other locations without copying media to 192.168.0.25 such as from NAS (which is Synology 192.168.0.19).
        - Source subsequent stored media from other devices.
        - Add additional sources persistently indexed across restarts. 

# Provided Conceptual Solution

Looking at your existing `media-server-api` project, here’s what you’re trying to achieve semantically:

## Core Problem Statement

Your media server currently operates as a **single-source indexer** (pulling from one SMB location at 192.168.0.25). You need to evolve it into a **multi-source media aggregator** that can dynamically discover and index media from various network locations without:

- Copying media between locations
- Redeploying containers when adding new sources
- Losing source mappings across restarts

## Architectural Evolution Needed

### Current State

- Monolithic source assumption (one SMB share)
- Static configuration in docker-compose
- Index tied to single location

### Target State

- **Source Registry Pattern**: A persistent catalog of media sources (SMB shares, NFS exports, local paths) that can be added/removed via API
- **Mount Orchestration Layer**: Logic that translates source registrations into filesystem mounts accessible to the container
- **Multi-Source Indexer**: Scanning engine that treats all registered sources as a unified namespace while maintaining source provenance in metadata

## Key Concepts to Implement

### 1. Source Abstraction

Each media source should be a **first-class entity** with:

- Identity (name, type, connection parameters)
- State (enabled/disabled, last scan time, health status)
- Metadata (capacity, access patterns, priority)

Sources aren’t filesystem paths--they’re **logical endpoints** that get materialized into accessible mounts.

### 2. Mount Lifecycle Management

The system needs to handle the **mount → index → unmount** lifecycle:

- **Registration**: API accepts source credentials, validates connectivity
- **Materialization**: Source becomes accessible filesystem path (mount operation happens at container/host level)
- **Persistence**: Mount survives container restarts via configuration storage
- **Health Monitoring**: Detect when sources become unavailable

### 3. Index Federation

Your indexer should maintain **source attribution** for every media item:

- Which source it came from
- Original path relative to that source
- Whether the source is currently accessible

This enables queries like "show me all media from Synology NAS" or "find orphaned media from disconnected sources".

### 4. Idempotent Discovery

Media items need **content-addressable identifiers** that remain stable across:

- Re-scans of the same source
- Media appearing in multiple sources (deduplication)
- Source remounting at different paths

## Implementation Approaches

### Option A: Host-Level Mount Management

Container runs with privileges to execute `mount` commands, creating bind mounts under a parent directory (e.g., `/mnt/sources/{source-name}`). Source registry stored in persistent volume triggers mount restoration on startup.

**Tradeoff**: Requires privileged container, but provides true filesystem integration.

### Option B: Symbolic Link Aggregation

Pre-mount a parent directory, dynamically create symlinks to represent sources. Python API manages the symlink tree without needing mount privileges.

**Tradeoff**: Simpler permissions model, but limited to paths already accessible to container’s mount namespace.

### Option C: Application-Level Virtual Filesystem

Source registry points to network paths, your Python code handles network file access directly (SMB via `smbprotocol`, NFS via `libnfs` bindings) without OS-level mounts.

**Tradeoff**: Most flexible, no privilege requirements, but higher implementation complexity and potential performance implications.

## Data Model Extensions

Your existing project likely has:

- `Media` entity (files being indexed)
- `Project` entity (organizational grouping)

You need to add:

- `Source` entity (where media originates)
- `SourceMount` entity (active filesystem representations)
- Relationship: `Media.source_id → Source.id`

## API Surface Expansion

Beyond your current endpoints, you’d expose:

- **Source Management**: CRUD operations for registering network locations
- **Mount Control**: Trigger mount/unmount operations, view mount health
- **Multi-Source Queries**: Filter/aggregate media by source
- **Source Discovery**: Auto-detect available shares on the network (optional but powerful)

## Persistence Strategy

The critical insight is that **configuration must outlive containers**:

- `sources.json` or database table tracks all registered sources
- On container startup, restore all previously configured mounts
- If a mount fails (network unreachable), mark source as unhealthy but keep configuration

## Migration Path

For your existing deployment:

1. Abstract current 192.168.0.25 SMB into the first "source" in your registry
1. Ensure existing indexed media gets attributed to this source
1. Add new sources (Synology NAS) incrementally
1. Indexer scans all active sources on a schedule or trigger

## The "No Redeploy" Constraint

This is achievable because you’re separating **configuration concerns** (what sources exist) from **deployment concerns** (how the container runs). The docker-compose mounts a parent directory once; everything inside that directory can change dynamically through your API without touching the compose file.

-----

Does this semantic framing align with the vision, to be able to easily index stored media from a multitude of local devices? Decide whether to implement this as privileged host mounts, symlink management, or application-level network access based on the security and performance requirements.​​​​​​​​​​​​​​​​