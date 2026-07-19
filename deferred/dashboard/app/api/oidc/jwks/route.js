import { NextResponse } from 'next/server';
import { publicJwk } from '@/lib/oidc';

export const dynamic = 'force-dynamic';

// JSON Web Key Set — the public key clients use to verify our id_token signatures.
export async function GET() {
  return NextResponse.json({ keys: [await publicJwk()] });
}
