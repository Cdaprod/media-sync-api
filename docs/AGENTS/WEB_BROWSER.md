# Web Browser API – Concepts to complete

## Initial Concepts:

- Lands on a documentation page
- Lists projects
    - Needs to be able to:
        - Put media where it belongs if it lands directly in the projects folder.
        - From browser should list media in a project.
        - Media in project should be accessible, explorable, and able to be played directly from the browser.

# Suggested Contextual Development Via Semantic Conveyance

# Web Browser API - Semantic Feature Specification

## Current State Analysis

Your API already provides:

- **Project enumeration** via `/api/projects`
- **Documentation root** explaining the system’s purpose and workflow
- **Upload ingestion** that handles deduplication and indexing
- **Project structure convention** (ingest/originals as source of truth, index.json for metadata)

The instruction hints at `/public/index.html` for an "adapter UI" but the browser experience isn’t fully realized yet.

## Target State: Browser-Native Media Management

### Core User Journey

A user navigates to your API’s root domain and should experience a **self-service media portal** that allows:

1. **Project Discovery**: Visual gallery/list of all projects with metadata preview
1. **Media Organization**: Auto-filing of media that lands in incorrect locations
1. **Content Exploration**: Drill down into projects to see their media inventory
1. **In-Browser Playback**: Stream/view media directly without downloading

### Conceptual Components

#### 1. **Landing Page as Navigation Hub**

Transform your current text documentation into an **interactive dashboard**:

- Card-based project gallery (thumbnails, names, media counts, last updated)
- Quick actions: "Create Project", "Upload Media", "View All Sources"
- System health indicators (storage usage, indexing status, source connectivity)

**Semantic role**: Orientation and wayfinding--users should understand what projects exist and their state at a glance.

#### 2. **Project Detail View**

When clicking into a project, render a **media browser interface**:

- Grid or list view of all media items in that project
- Metadata display: filename, size, upload date, source attribution, hash
- Filter/sort capabilities: by date, by source, by media type
- Batch operations: move, delete, reindex subset

**Semantic role**: Project-scoped inventory management--users see what’s in the project and can take actions on it.

#### 3. **Media Playback Engine**

Individual media items should be **streamable assets**:

- Click a video → inline player (HTML5 `<video>`) streams from API endpoint
- Click an image → lightbox/modal viewer
- No download required--media is served via HTTP range requests for seeking
- Optional: Generate thumbnails/previews for faster loading

**Semantic role**: Content consumption--transform indexed files into viewable media.

#### 4. **Automatic Organization Logic**

Handle the "media lands in wrong place" scenario:

- **Detection**: API scans for files directly in `projects/` root (not in a project subfolder)
- **Classification**: Use heuristics (filename patterns, EXIF metadata, upload timestamp) to suggest target project
- **Auto-filing or Prompting**: Either automatically move to best-match project, or present user with suggestions in UI
- **Audit trail**: Log all moves in project index or manifest

**Semantic role**: Intelligent file wrangling--reduce manual reorganization burden.

### API Endpoint Expansion

To support browser interaction, you’ll need:

#### Project Browsing

- `GET /api/projects/{name}/media` - List all media in project with metadata
- `GET /api/projects/{name}/media/{id}` - Get specific media item details
- `GET /api/projects/{name}/stats` - Aggregated metrics (total size, file counts, etc.)

#### Media Serving

- `GET /media/{project}/{filename}` - Stream actual media file (supports HTTP range headers)
- `GET /media/{project}/{filename}/thumbnail` - Serve generated preview image
- `GET /media/{project}/{filename}/metadata` - Return EXIF, duration, resolution

#### Organization Actions

- `POST /api/projects/{name}/auto-organize` - Trigger scan and auto-file orphaned media
- `POST /api/media/{id}/move` - Move media between projects
- `GET /api/orphaned-media` - List files not properly filed

#### Frontend Assets

- `GET /` - Serve SPA (Single Page App) or server-rendered HTML for the UI
- `GET /public/*` - Static assets (JS, CSS, images for the web UI)

### Data Flow Patterns

#### Listing Media in Browser

1. User navigates to project page
1. Frontend fetches `GET /api/projects/{name}/media`
1. API queries index/database, returns JSON array of media objects
1. Frontend renders as cards/thumbnails with metadata overlays
1. Clicking a card loads media via streaming endpoint

#### Playing Media

1. User clicks video thumbnail
1. Frontend creates `<video src="/media/{project}/{file}">` element
1. Browser issues range request to API
1. API serves file chunks from disk (supports seeking)
1. Playback happens natively in browser without full download

#### Auto-Organization Workflow

1. API periodic task or manual trigger scans `projects/` root
1. Finds files not in recognized project structure
1. Analyzes filename/metadata to infer destination project
1. Either auto-moves (with logging) or flags for user review
1. UI displays "Unorganized Media" count with review interface

### Implementation Considerations

#### Frontend Architecture

You can choose:

- **Static SPA**: React/Vue/Svelte app served from `/public`, all interactions via API calls
- **Server-Rendered**: Python templates (Jinja2) that hydrate with htmx or Alpine.js for interactivity
- **Hybrid**: Documentation pages server-rendered, media browser as embedded SPA

**Tradeoff**: SPA is richer but requires build step; server-rendered is simpler but less dynamic.

#### Media Streaming Strategy

Python’s FastAPI/Flask can stream files directly:

- Use `FileResponse` with support for range requests
- For large files, consider chunked reads to avoid memory issues
- Optional: Add caching headers for browser optimization

**Security consideration**: Ensure paths can’t be traversed maliciously (validate project/filename inputs).

#### Auto-Organization Heuristics

Possible strategies:

- **Timestamp-based**: Files uploaded today go to most recent active project
- **Filename pattern matching**: Use regex to detect project identifiers
- **User preference**: Let user set "default project" for ambiguous files
- **Manual review queue**: Show unorganized files in UI for user decision

**Tradeoff**: Automation reduces friction but risks misfiling; manual review is safer but requires user action.

### Integration with Existing System

Your current workflow already handles:

- Upload deduplication ✓
- Index reconciliation via `/reindex` ✓
- Manifest tracking ✓

The browser UI layers **user-friendly visualization and interaction** on top of these mechanics:

- `/api/projects` becomes data source for dashboard
- `index.json` drives media listings
- Upload endpoint remains unchanged, but UI wraps it in forms/drag-drop
- Reindex can be triggered from UI instead of curl

### Progressive Enhancement Path

**Phase 1**: Static HTML gallery

- Generate simple HTML pages from index.json
- Click project → see list of files as links
- Links open media in new tab (browser’s native viewer)

**Phase 2**: Interactive media browser

- Add grid view with thumbnails
- Implement in-browser video player
- Filter/search functionality

**Phase 3**: Organization automation

- Scan for orphaned files
- Present review UI for unorganized media
- Implement auto-filing rules

**Phase 4**: Advanced features

- Bulk operations (multi-select, batch move)
- Metadata editing
- Share links/permissions

-----

This semantic breakdown capture the browser-native media management vision. Your implementation can decide whether to build a rich SPA or lean into server-rendered simplicity based on your stack preferences.​​​​​​​​​​​​​​​​ We want this underlying Digital Asset Management API service to work with minimal overhead, and so yhat it can be later adapted to my richer DAM explorer as its backend service; for now continue with using HTML as we started doing.








    # More Concepts To Implement

    - Needs to be able to download files shown in the index.html page projects
    - Need a create next new project folder
    - Needs to be able to easily create new davinci resolve timeline using Davinci Resolve API without the overhead of Davinci Resolve API configuring.
    - If files are found in wrong place, put them in the correct {project}/ingest/originals/ folder automatically.
    - Needs to be able to recursively scan and index media out of source folders, keeping only video, audio, and images in the index.
        - For example:
            - If i source my NAS at a folder, the subsequent nested folders should be recursively scanned and indexed without any duplicating or copying files across the network
            - Those said files, should be accessible (list/play/download) by sourcing them not by downloading them to local API server service.
            - Additonally metadata should be collected from sourced media, so that the listed indexes convey the details, also having a place for additonal notes to be kept for files.
                - For example:
                    - Files should have persistent metadata and i need a way to write it from the browser for the media in question.
            - We require a url+route that enables us to visit it and source all files for download per project.


    # Suggested Development

    # Advanced Media Management & Workflow Integration - Semantic Specification

    ## Context Foundation

    Your reindex response shows the system already tracks:

    - File paths, SHA256 hashes, sizes, timestamps
    - The `ingest/originals/` convention as canonical storage
    - Instructions field for user guidance

    You’ve built **passive indexing** (what exists) - now you need **active management** (actions on what exists) plus **external tool integration** (DaVinci Resolve timeline generation).

    -----

    ## Feature Set 1: Download Capability

    ### Current Gap

    Browser can **list and stream** media, but not **download** for offline use or external editing.

    ### Semantic Requirements

    #### Download Endpoint Design

    - `GET /media/{project}/{filename}/download` - Force browser download (Content-Disposition: attachment)
    - `POST /api/projects/{project}/batch-download` - Generate zip of selected files
    - `GET /api/downloads/{task_id}` - Check zip generation status, retrieve when ready

    #### User Experience Flow

    1. User browses media in project
    1. Selects one or more files
    1. Clicks "Download" button
    1. For single file: immediate download starts
    1. For multiple files: API queues zip creation task, shows progress, provides download link when complete

    #### Implementation Considerations

    - **Single file**: Serve directly with appropriate Content-Disposition header
    - **Batch download**: Async zip creation (avoid blocking API), temporary storage, cleanup after expiry
    - **Large files**: Stream zip generation to avoid memory issues
    - **Security**: Validate paths, rate limit to prevent abuse

    -----

    ## Feature Set 2: Project Creation from Browser

    ### Current Gap

    Projects created via curl/API only - no UI-driven workflow.

    ### Semantic Requirements

    #### Project Creation Interface

    - Modal/form in browser UI with fields:
      - **Name** (auto-slugified, no spaces)
      - **Notes/Description** (optional)
      - **Template selection** (default structure vs custom)
      - **Initial source assignment** (which mounted source to monitor)

    #### API Enhancement

    - `POST /api/projects` already exists, ensure it:
      - Creates full directory structure (`ingest/originals/`, `_manifest/`, etc.)
      - Initializes empty `index.json` with metadata
      - Returns complete project object including paths
      - Optionally triggers initial scan if source specified

    #### Workflow Integration

    After creation:

    - Redirect user to new project’s media browser
    - Show "empty state" UI with upload/organize prompts
    - Background task monitors project’s ingest folder for new files

    -----

    ## Feature Set 3: DaVinci Resolve Timeline Generation

    ### Context Understanding

    DaVinci Resolve has a Python API that requires:

    - Resolve application running (or Resolve Studio with network API)
    - Complex project/timeline/clip hierarchy creation
    - Media linking via absolute paths

    ### Semantic Requirements

    #### Simplified Timeline Creation Abstraction

    Hide Resolve API complexity behind simple endpoint:

    ```
    POST /api/projects/{project}/create-timeline
    Body: {
      "timeline_name": "Edit-2025-12-21",
      "clips": ["file1.mp4", "file2.mp4"],  // Ordered list
      "resolve_project": "MyProject"         // Target Resolve project name
    }
    ```

    #### Backend Logic Flow

    1. **Validation**: Check if Resolve API is accessible
    1. **Media Path Resolution**: Convert relative paths to absolute (Resolve needs full paths)
    1. **Resolve Project Discovery**: Find or create target project in Resolve
    1. **Timeline Construction**:

    - Create timeline with specified name
    - Add clips in order to video track
    - Set default transitions/settings

    1. **Return Confirmation**: Timeline created with clip count, duration

    #### Implementation Strategy

    - **Resolve Connection Manager**: Singleton that maintains connection to Resolve’s scripting API
    - **Template System**: Pre-defined timeline structures (simple sequence, multicam, etc.)
    - **Error Handling**: Graceful degradation if Resolve unavailable (queue for later, or notify user)

    #### User Experience

    From browser:

    1. Select multiple clips in project
    1. Click "Create Resolve Timeline"
    1. Specify timeline name and settings in modal
    1. API generates timeline, returns success
    1. User opens Resolve, timeline is ready with media pre-loaded

    #### Advanced Considerations

    - **Metadata preservation**: Transfer file notes/tags to Resolve clip markers
    - **Batch processing**: Create multiple timelines based on grouping logic (by date, by source)
    - **Export integration**: Trigger Resolve render queue from API

    -----

    ## Feature Set 4: Intelligent Auto-Organization

    ### Current Gap

    Files in wrong location need manual intervention - you have "Unsorted-Loose" catch-all but no smart routing.

    ### Semantic Requirements

    #### Detection & Classification

    **Scan Triggers**:

    - Periodic background task (every 5 minutes)
    - Manual trigger via UI button
    - Post-upload hook

    **Classification Logic**:

    1. **Filename pattern matching**:

    - `2025-12-21_12-26-31.mp4` → extract date, match to project with that date range
    - `ProjectName-*.mp4` → match to project by name prefix

    1. **Metadata inference**:

    - EXIF timestamp → route to project active during that time
    - File hash → if duplicate exists in project, move to same location

    1. **User learning**:

    - Track past manual moves, build pattern recognition
    - "Files from iPhone usually go to P1-Public-Accountability"

    #### Auto-Filing Actions

    - **High confidence** (>90%): Auto-move to `{project}/ingest/originals/`
    - **Medium confidence** (50-90%): Flag for user review with suggestion
    - **Low confidence** (<50%): Leave in Unsorted-Loose, show in review queue

    #### Audit Trail

    Every move logged with:

    - Source path, destination path
    - Classification reasoning ("matched date pattern")
    - Confidence score
    - Timestamp, optional user confirmation

    -----

    ## Feature Set 5: Recursive Source Indexing (Network-Native)

    ### Context & Problem

    Your multi-source system mounts network locations, but currently:

    - Indexing might copy files locally (unnecessary network transfer)
    - Nested folder structures unclear how deeply scanned
    - Media type filtering not enforced
    - Source files accessed by reference vs duplication

    ### Semantic Requirements

    #### Deep Scan Behavior

    When indexing a source like NAS at `/mnt/sources/synology/media`:

    ```
    /media/
      ├── 2024/
      │   ├── January/
      │   │   ├── clip1.mp4 ✓
      │   │   ├── notes.txt ✗ (skip)
      │   └── February/
      │       └── clip2.mov ✓
      ├── Projects/
      │   └── Vacation/
      │       ├── raw/
      │       │   └── footage.mp4 ✓
      │       └── exports/
      │           └── final.mp4 ✓ (but may be duplicate)
      └── random_file.docx ✗ (skip)
    ```

    **Scan Logic**:

    - Recursively traverse all subdirectories
    - Filter by extension: `.mp4, .mov, .avi, .mkv, .mp3, .wav, .jpg, .png` (configurable whitelist)
    - Generate hash for deduplication (only index once even if appears in multiple paths)
    - Store **source reference** not file content

    #### Index Schema Extension

    Each indexed media item needs:

    ```json
    {
      "id": "unique-id",
      "source_name": "synology",
      "source_path": "/mnt/sources/synology/media/2024/January/clip1.mp4",
      "relative_path": "2024/January/clip1.mp4",  // within source
      "sha256": "hash...",
      "size": 20893886,
      "media_type": "video",
      "duration": 45.2,          // extracted metadata
      "resolution": "1920x1080",
      "codec": "h264",
      "created_at": "2024-01-15T10:30:00Z",  // EXIF/file timestamp
      "indexed_at": "2025-12-21T19:28:50Z",
      "notes": "",               // user-editable
      "tags": []                 // user-editable
    }
    ```

    #### Access Pattern

    **Critical**: Media is **served by reference**, not copied:

    - Streaming endpoint: `GET /media/source/{source_name}/{relative_path}`
    - Resolves to: Read from `/mnt/sources/{source_name}/{relative_path}`
    - Download endpoint: Same pattern, different Content-Disposition
    - No duplication across network unless user explicitly requests

    #### Metadata Extraction

    On index, extract:

    - **Video**: Duration, resolution, codec, fps (via ffprobe/mediainfo)
    - **Audio**: Duration, bitrate, sample rate
    - **Images**: Dimensions, EXIF data (camera, GPS, timestamp)

    Store in index for fast querying without re-reading files.

    -----

    ## Feature Set 6: Browser-Based Metadata Editing

    ### Current Gap

    Metadata exists but is read-only in UI - no way to annotate or organize.

    ### Semantic Requirements

    #### Editable Fields

    Per media item, allow editing:

    - **Notes**: Free-text description/annotation
    - **Tags**: Comma-separated or multi-select (searchable later)
    - **Project assignment**: Move between projects via dropdown
    - **Custom fields**: Key-value pairs (e.g., "talent": "John Doe", "location": "Studio A")

    #### UI Interaction Pattern

    1. User clicks media item in browser
    1. Detail modal opens showing:

    - Inline player/viewer
    - Read-only metadata (filename, size, hash, duration)
    - Editable fields with save button

    1. User types notes or adds tags
    1. Clicks "Save" → API persists to index/database
    1. Changes reflected immediately in listings

    #### API Endpoints

    ```
    GET /api/media/{id}/metadata       // Retrieve all metadata
    PATCH /api/media/{id}/metadata     // Update editable fields
    POST /api/media/{id}/tags          // Add tag
    DELETE /api/media/{id}/tags/{tag}  // Remove tag
    ```

    #### Persistence Strategy

    - **Option A**: Extend `index.json` with user_metadata section
    - **Option B**: Separate `metadata.db` SQLite file per project
    - **Option C**: Centralized metadata store with media_id foreign keys

    **Recommendation**: Option B - project-scoped SQLite keeps metadata with media, easy to backup/transfer.

    #### Search Integration

    Once metadata is editable:

    - `GET /api/search?q=vacation&type=tags` - Find all media tagged "vacation"
    - `GET /api/search?notes=interview` - Full-text search in notes
    - Filter projects by tag/metadata in browser UI

    -----

    ## Architectural Integration Points

    ### How These Features Interconnect

    **Download** enables:

    - Offline editing workflows
    - Backup/archival
    - Sharing with collaborators

    **Project Creation** feeds:

    - Auto-organization (new projects available as targets)
    - Resolve timeline generation (timelines per project)

    **Resolve Integration** consumes:

    - Indexed media (knows what files exist)
    - Metadata (timeline naming, clip markers)
    - Project structure (organize timelines by project)

    **Auto-Organization** improves:

    - Index quality (files in correct locations)
    - User experience (less manual sorting)

    **Recursive Source Indexing** provides:

    - Comprehensive media catalog across all network locations
    - Deduplication across sources
    - Single namespace for browse/search

    **Metadata Editing** enriches:

    - Search/discovery capabilities
    - Timeline generation context
    - Organizational workflows

    ### Data Flow Example: End-to-End Workflow

    1. **User mounts new NAS source** via multi-source API
    1. **Recursive indexing** scans all nested folders, filters media only
    1. **Auto-organization** detects files matching project patterns, moves to correct project folders
    1. **Browser UI** shows new media with extracted metadata (duration, resolution)
    1. **User adds notes/tags** via metadata editor in browser
    1. **User selects clips**, clicks "Create Timeline"
    1. **Resolve integration** generates timeline with clips in order, clip markers from notes
    1. **User edits in Resolve**, exports final video
    1. **Final video auto-ingested** back to project via upload endpoint
    1. **User downloads** project archive for backup

    -----

    ## Implementation Priorities

    ### Phase 1: Core Functionality

    1. **Download endpoints** - immediate user value
    1. **Project creation UI** - removes friction
    1. **Recursive source indexing** - foundation for scale

    ### Phase 2: Intelligence Layer

    1. **Auto-organization** - reduces manual work
    1. **Metadata editing** - enables rich categorization

    ### Phase 3: External Integration

    1. **Resolve timeline generation** - workflow acceleration

    ### Technical Dependencies

    **For Resolve Integration**:

    - DaVinci Resolve Studio (or free version with API access)
    - `python-resolve` or direct Fusion scripting API
    - Resolve must be running on accessible machine

    **For Metadata Extraction**:

    - `ffprobe` (part of ffmpeg) for video/audio
    - `Pillow` or `exiftool` for images
    - Subprocess calls or library wrappers

    **For Recursive Indexing**:

    - Async file traversal (avoid blocking on large directories)
    - Hash computation (consider cached hashing for unchanged files)
    - Progress reporting for UI feedback

    -----

    ## Security & Performance Considerations

    ### Path Traversal Prevention

    All file operations must validate:

    - Paths stay within allowed source/project boundaries
    - No `../` escaping to parent directories
    - Whitelist allowed extensions

    ### Network Performance

    - **Streaming**: Don’t cache large files, stream directly
    - **Indexing**: Parallelize hash computation, throttle network reads
    - **Downloads**: Rate limit per-user, max concurrent zips

    ### Metadata Storage

    - Index files can grow large - consider pagination for API responses
    - Full-text search on notes may need dedicated search index (SQLite FTS5 or external)

    -----

    Does this contextualize how these features layer together into a cohesive media management and workflow automation system? Your AI agent can now decide implementation order and technical approaches based on this semantic blueprint.​​​​​​​​​​​​​​​​

