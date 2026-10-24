// ABOUTME: Handles authenticated pilot cities requests.
// ABOUTME: Delegates server validation and no-store responses to the pilot adapter.

import { pilotApi, pilotMethodResponse } from '@/lib/pilot/api';

export const dynamic = 'force-dynamic';
const allow = 'GET, HEAD, OPTIONS';

export async function GET(request: Request) {
  return pilotApi('cities', request);
}

export async function HEAD(request: Request) {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}

export function OPTIONS() {
  return pilotMethodResponse(allow, 204);
}

export function POST() {
  return pilotMethodResponse(allow, 405);
}
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
