// ABOUTME: Handles authenticated pilot exposures requests.
// ABOUTME: Delegates server validation and no-store responses to the pilot adapter.

import { pilotApi, pilotMethodResponse } from '@/lib/pilot/api';

export const dynamic = 'force-dynamic';
const allow = 'POST, OPTIONS';

export async function POST(request: Request) {
  return pilotApi('exposures', request);
}

export function OPTIONS() {
  return pilotMethodResponse(allow, 204);
}

export function GET() {
  return pilotMethodResponse(allow, 405);
}
export const HEAD = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
