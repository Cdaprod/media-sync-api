/**
 * Proxy media streaming requests to the media-sync-api service.
 *
 * Example:
 *   GET /media/demo/ingest/originals/clip.mov -> MEDIA_SYNC_API_BASE/media/demo/ingest/originals/clip.mov
 */
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_API_BASE = 'http://localhost:8787';

function resolveApiBase(): string {
  const raw = (process.env.MEDIA_SYNC_API_BASE || process.env.NEXT_PUBLIC_MEDIA_SYNC_API_BASE || '').trim();
  return (raw || DEFAULT_API_BASE).replace(/\/$/, '');
}

function buildUpstreamUrl(request: NextRequest, segments: string[] | undefined): string {
  const base = resolveApiBase();
  const encodedPath = segments?.map((part) => encodeURIComponent(part)).join('/') || '';
  const sourceUrl = new URL(request.url);
  const upstream = `${base}/media${encodedPath ? `/${encodedPath}` : ''}`;
  return `${upstream}${sourceUrl.search}`;
}

async function proxyRequest(request: NextRequest, segments: string[] | undefined): Promise<Response> {
  const target = buildUpstreamUrl(request, segments);
  const headers = new Headers(request.headers);
  headers.delete('host');
  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }
  const upstream = await fetch(target, init);
  const responseHeaders = new Headers(upstream.headers);
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export async function GET(request: NextRequest, context: { params: { path?: string[] } }): Promise<Response> {
  return proxyRequest(request, context.params.path);
}

export async function HEAD(request: NextRequest, context: { params: { path?: string[] } }): Promise<Response> {
  return proxyRequest(request, context.params.path);
}

export async function POST(request: NextRequest, context: { params: { path?: string[] } }): Promise<Response> {
  return proxyRequest(request, context.params.path);
}

export async function PUT(request: NextRequest, context: { params: { path?: string[] } }): Promise<Response> {
  return proxyRequest(request, context.params.path);
}

export async function PATCH(request: NextRequest, context: { params: { path?: string[] } }): Promise<Response> {
  return proxyRequest(request, context.params.path);
}

export async function DELETE(request: NextRequest, context: { params: { path?: string[] } }): Promise<Response> {
  return proxyRequest(request, context.params.path);
}

export async function OPTIONS(request: NextRequest, context: { params: { path?: string[] } }): Promise<Response> {
  return proxyRequest(request, context.params.path);
}
