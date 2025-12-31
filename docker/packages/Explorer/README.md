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

## Testing

```bash
npm run test
```
