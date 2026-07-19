// Times are stored as UTC ISO but the operator is in South Africa (SAST, GMT+2, no DST).
// Always display in SAST. `za()` → e.g. "12 Jun 2026, 09:00".
const TZ = 'Africa/Johannesburg';

export function za(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-ZA', {
    timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function zaTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-ZA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
}

export const ZA_TZ = TZ;
