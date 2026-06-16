'use client';
import { useState, useEffect } from 'react';

const TZ = 'Africa/Johannesburg';

// Live clock in the studio timezone. Renders nothing on the server (avoids hydration mismatch),
// then ticks client-side.
export function Clock() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 30000); // 30s — fine for HH:MM
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const date = now.toLocaleDateString('en-ZA', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short' });
  const time = now.toLocaleTimeString('en-ZA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  return (
    <div className="topclock" title={`${date} · ${TZ}`}>
      <span className="topclock-time">{time}</span>
      <span className="topclock-date">{date}</span>
    </div>
  );
}

// WMO weather code → compact glyph + label.
function wx(code) {
  if (code === 0) return ['☀', 'Clear'];
  if (code <= 2) return ['🌤', 'Fair'];
  if (code === 3) return ['☁', 'Cloudy'];
  if (code <= 48) return ['🌫', 'Fog'];
  if (code <= 57) return ['🌦', 'Drizzle'];
  if (code <= 67) return ['🌧', 'Rain'];
  if (code <= 77) return ['❄', 'Snow'];
  if (code <= 82) return ['🌦', 'Showers'];
  if (code <= 86) return ['🌨', 'Snow'];
  if (code <= 99) return ['⛈', 'Storm'];
  return ['🌡', ''];
}

// Small weather widget for the studio's location (Johannesburg, metric). open-meteo: free, no key,
// CORS-enabled — safe to fetch straight from the browser even on an HTTP LAN page.
export function Weather() {
  const [w, setW] = useState(null);
  useEffect(() => {
    let live = true;
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=-26.2041&longitude=28.0473&current=temperature_2m,weather_code&timezone=Africa%2FJohannesburg';
    const pull = () => fetch(url)
      .then((r) => r.json())
      .then((d) => { if (live && d.current) setW({ t: Math.round(d.current.temperature_2m), code: d.current.weather_code }); })
      .catch(() => {});
    pull();
    const id = setInterval(pull, 900000); // refresh every 15 min
    return () => { live = false; clearInterval(id); };
  }, []);
  if (!w) return null;
  const [glyph, label] = wx(w.code);
  return (
    <div className="topweather" title={`Johannesburg · ${label}`}>
      <span className="tw-ico">{glyph}</span>
      <span className="tw-temp">{w.t}°C</span>
    </div>
  );
}
