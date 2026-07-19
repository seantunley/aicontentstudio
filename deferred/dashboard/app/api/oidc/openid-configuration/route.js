import { NextResponse } from 'next/server';
import { discovery } from '@/lib/oidc';

export const dynamic = 'force-dynamic';

// OIDC discovery document. Typebot (CUSTOM_OAUTH_WELL_KNOWN_URL) fetches this to learn the endpoints.
export async function GET() {
  return NextResponse.json(discovery());
}
