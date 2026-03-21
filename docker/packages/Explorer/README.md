# Explorer (Next.js App Router)

Embedded Explorer UI for `media-sync-api`. This package mirrors `/public/explorer.html` behavior while making the UI reusable inside other Next.js apps.

Recent parity updates include bulk asset actions backed by `/api/assets/*` endpoints (delete/move/tag/compose) so multi-select workflows stay aligned with the static explorer.

## Requirements

- Node.js 18+
- Access to a running `media-sync-api` instance

## Development (standalone)

```bash
cd docker/packages/Explorer
npm install
npm run dev
```

Set the API base URL via env:

```bash
NEXT_PUBLIC_MEDIA_SYNC_API_BASE="http://192.168.0.25:8787" npm run dev
```

If `NEXT_PUBLIC_MEDIA_SYNC_API_BASE` is empty, the Explorer keeps same-origin on `:8787` but auto-falls back to `http://<current-host>:8787` when the UI is served from a non-`8787` port (for example the standalone Explorer container on `:8790`).

## Build

```bash
npm run build
npm run start
```

## Embed in another Next.js app

1. Add this package as a workspace/dependency (local path or workspace tooling).
2. Ensure the host app transpiles the package.
3. Import the UI and CSS in the route.

Example (App Router):

```tsx
// next.config.js
const nextConfig = {
  transpilePackages: ['@media-sync/explorer'],
};
export default nextConfig;
```

```tsx
// app/explorer/layout.tsx
import '@media-sync/explorer/styles.css';

export default function ExplorerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

```tsx
// app/explorer/page.tsx
import { ExplorerApp } from '@media-sync/explorer';

export default function ExplorerPage() {
  return <ExplorerApp apiBaseUrl={process.env.NEXT_PUBLIC_MEDIA_SYNC_API_BASE || ''} />;
}
```

## Testing

```bash
npm run test
```

## Routing / default 404 ownership

This package uses the Next.js App Router from `docker/packages/Explorer/app/`. The root-level `app/not-found.tsx` is the package-wide default 404 UI for unmatched routes and for any route segment that calls `notFound()` without a more deeply nested override.

The shader-based not-found page keeps its WebGL tunnel client-side, while fonts are loaded once at the app layout level through shared `<head>` font links so the 404 UI avoids page-local `@import` font injection and no longer depends on `next/font` build-time fetching.
