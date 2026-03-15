# Explorer (Next.js App Router)

Embedded Explorer UI for `media-sync-api`. This package mirrors `/public/explorer.html` behavior while making the UI reusable inside other Next.js apps.

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



## FX mode policy

- The static explorer (`/public/explorer.html`) owns TileFX/WebGL behavior and adaptive performance guardrails.
- This Next.js package intentionally **defers FX mode** for now; only `grid` and `list` views are supported.
- Any unsupported view token (including `fx`) must normalize to deterministic grid/list fallback (`normalizeExplorerView` in `src/state.ts`).

## Compose action parity

The Explorer Actions panel and selection bar now include a **Compose** flow that mirrors static explorer bulk-compose behavior using `POST /api/assets/bulk/compose`.

- Compose is enabled only when the current selection contains at least one **video** asset.
- Selection ordering is preserved when building the `assets` payload, so repeated runs are deterministic.
- The compose modal reuses existing in-app modal patterns to collect output project/source/name.
- On success, Explorer shows the created artifact summary in toast feedback and reloads media using existing scope-aware logic (`current project` or `all projects`).

## Testing

```bash
npm ci --silent
npm test --silent
```

Run tests from a clean dependency state (or after dependency changes) so the TypeScript-powered node test harness can resolve local dev dependencies deterministically.
