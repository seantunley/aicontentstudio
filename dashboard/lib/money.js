// Generation APIs bill in USD, so the cost ledger stores USD. The operator is in South
// Africa, so the cockpit shows Rands. The rate fluctuates, so it's operator-configurable.
// Source of truth is now the /settings page (DB key `zar_per_usd`); the ZAR_PER_USD env var
// (compose/.env) is the bootstrap fallback when nothing has been set in the UI yet.
import { getSetting } from './db';

const ENV_RATE = Number(process.env.ZAR_PER_USD || 16.28);

// Resolve the live rate: the operator-set value wins, else the env default. Read per call so a
// change on the /settings page takes effect on the next request without a rebuild.
export function zarRate() {
  try {
    const s = getSetting('zar_per_usd');
    const n = s != null ? Number(s) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  } catch {}
  return ENV_RATE;
}

// Legacy export, kept for back-compat; prefer zarRate() so DB overrides are honoured.
export const ZAR_PER_USD = ENV_RATE;

// Format a USD amount as ZAR, e.g. zar(1.5) -> "R24.42".
export const zar = (usd, dp = 2) => `R${(Number(usd || 0) * zarRate()).toFixed(dp)}`;
