import { ExplorerApp } from '../src/ExplorerApp';

export default function Page() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_MEDIA_SYNC_API_BASE || '';
  return <ExplorerApp apiBaseUrl={apiBaseUrl} />;
}
