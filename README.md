<div align="center">
  <h1>media-sync-api</h1>
  <h3>LAN-First Media Sync & Project Indexing API</h3>

  <p>
    <em>
      A lightweight, Dockerized Python API for syncing media into structured projects using
      native iOS Photos workflows and deterministic indexing.
    </em>
  </p>

  <p><strong>By David Cannan (@Cdaprod)</strong></p>

  <p>
    <a href="https://youtube.com/@Cdaprod"><img src="https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white" /></a>
    <a href="https://twitter.com/cdasmktcda"><img src="https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white" /></a>
    <a href="https://www.linkedin.com/in/cdasmkt"><img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" /></a>
    <a href="https://github.com/Cdaprod"><img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white" /></a>
    <a href="https://blog.min.io/author/david-cannan"><img src="https://img.shields.io/badge/Blog-FF5722?style=for-the-badge&logo=blogger&logoColor=white" /></a>
  </p>
</div>

---

## Overview

media-sync-api does exactly what it sounds like it does.

It is a small, LAN-only Python service designed to synchronize media into project folders using a Dockerized API. The service acts strictly as a middleman: it coordinates uploads, indexing, and reconciliation, while all real media lives on the host filesystem.

This project exists to make media ingest boring, predictable, and repeatable -- especially when the capture device is a phone and the destination is a production workstation.

---

## Position in the Ecosystem

This repository is the third asset in an evolving set of production tools:

- **DaVinci-Resolve-3D-Caption-Glider**  
  A Resolve-integrated system for word-accurate, animated captions

- **html-teleprompter**  
  A browser-based teleprompter and confidence monitor

- **media-sync-api** (this repository)  
  A deterministic ingest and project hydration layer

These tools are designed to work independently, but together they form the practical foundation of the larger platform:

**Cdaprod / ThatDAMToolbox**

media-sync-api focuses narrowly on ingest correctness and project hygiene. It deliberately avoids UI complexity, cloud coupling, or opinionated editing workflows.

---

## What This Service Does

- Creates and manages project namespaces
- Accepts media uploads from iOS, browsers, or scripts
- De-duplicates content by hash rather than filename
- Maintains a persistent project index
- Reconciles changes made outside the API
- Survives restarts without data loss

The container is intentionally stateless. The host filesystem is the source of truth.

---

## iOS-First Workflow

This service is designed around native Apple UX rather than custom mobile apps.

Typical usage involves iPhone Shortcuts that:
- List existing projects
- Create new projects on demand
- Prompt for simple input or labeling
- Allow users to select videos using the Photos app
- Upload media over the local network

The API guarantees idempotency, so repeating the same shortcut or re-uploading the same files is safe.

---

## Running the Service

media-sync-api is intended to run on the same machine that owns the project storage.

It is deployed via Docker and Docker Compose, configured to:
- Bind directly to the host network
- Restart automatically
- Mount host storage into the container
- Avoid persisting any media inside the container environment

Exact configuration details are documented in the repository and kept intentionally minimal.

---

## Design Philosophy

- Local first, cloud optional
- Stateless services over persistent hosts
- Deterministic behavior over clever automation
- Native tools where possible
- Simple systems that can grow without rewrites

This service is a building block, not a product surface.

---

## Status

media-sync-api is actively developed and used as part of a larger personal production stack. It is expected to evolve alongside ThatDAMToolbox as additional services are layered on top.

Changes prioritize stability, clarity, and forward compatibility over feature breadth.

---

## License

MIT License.

Build on it, remix it, or fold it into your own workflows.

---

<div align="center">
  <p>
    <img src="https://hits.seeyoufarm.com/api/count/incr/badge.svg?url=https%3A%2F%2Fgithub.com%2FCdaprod%2Fmedia-sync-api&count_bg=%230051FF&title_bg=%23000000&icon=github.svg&icon_color=%23FFFFFF&title=Visits&edge_flat=false" alt="Repository visits" />
  </p>
  <p>
    <strong>Built by <a href="https://github.com/Cdaprod">David Cannan</a></strong><br/>
    Designing calm, deterministic systems for real creative work.
  </p>
</div>