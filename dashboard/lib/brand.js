// Active-brand context (§1b: one brand at a time, always explicit). Stored in a cookie; server
// pages read it to scope what's shown, and it stamps new jobs + the publish confirmation.
import { cookies } from 'next/headers';

export const ACTIVE_BRAND_COOKIE = 'studio_brand';

// The active brand slug, or null = "all brands".
export async function getActiveBrand() {
  try {
    const v = (await cookies()).get(ACTIVE_BRAND_COOKIE)?.value;
    return v && v !== 'all' ? v : null;
  } catch {
    return null;
  }
}
