'use client';
import { useState, useEffect } from 'react';
import { findCity } from '@/lib/cities';

const TZ = 'Africa/Johannesburg';

// Live clock in the studio timezone. Renders nothing on the server (avoids hydration mismatch).
export function Clock() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const date = now.toLocaleDateString('en-ZA', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const time = now.toLocaleTimeString('en-ZA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  return (
    <div className="topclock" title={`${date} · ${TZ}`}>
      <span className="topclock-time">{time}</span>
      <span className="topclock-date">{date}</span>
    </div>
  );
}

// WMO weather code → [emoji, label].
function wx(code) {
  if (code === 0) return ['☀️', 'Clear'];
  if (code <= 2) return ['🌤️', 'Fair'];
  if (code === 3) return ['☁️', 'Cloudy'];
  if (code <= 48) return ['🌫️', 'Fog'];
  if (code <= 57) return ['🌦️', 'Drizzle'];
  if (code <= 67) return ['🌧️', 'Rain'];
  if (code <= 77) return ['❄️', 'Snow'];
  if (code <= 82) return ['🌦️', 'Showers'];
  if (code <= 86) return ['🌨️', 'Snow'];
  if (code <= 99) return ['⛈️', 'Storm'];
  return ['🌡️', ''];
}

// Colour-code the temperature — the splash of colour that lifts the grey.
function tempColor(t) {
  if (t <= 5) return '#5cc8ff';   // cold blue
  if (t <= 14) return '#5cbfa9';  // cool teal
  if (t <= 22) return '#93c96a';  // mild green
  if (t <= 29) return '#e3a73f';  // warm brass
  return '#ef6450';               // hot red
}

// Weather for the operator-set location (Settings → General → Weather location). Geocodes the city
// then pulls current + a 7-day forecast (open-meteo: free, no key, CORS-ok). Click for the week.
export function Weather({ location = 'Johannesburg' }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        // Curated cities carry their own coordinates → no geocoding (no spelling-error failures).
        // A custom value still works via the geocoding fallback.
        let lat, lon, place, country = '';
        const c = findCity(location);
        if (c) { lat = c.lat; lon = c.lon; place = c.name; }
        else {
          const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en`).then((r) => r.json());
          const loc = g.results && g.results[0];
          if (!loc) return;
          lat = loc.latitude; lon = loc.longitude; place = loc.name; country = loc.country_code || '';
        }
        const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7`).then((r) => r.json());
        if (!live || !w.current) return;
        const days = (w.daily?.time || []).map((d, i) => ({ date: d, code: w.daily.weather_code[i], hi: Math.round(w.daily.temperature_2m_max[i]), lo: Math.round(w.daily.temperature_2m_min[i]) }));
        setData({ place, country, t: Math.round(w.current.temperature_2m), code: w.current.weather_code, days });
      } catch { /* best effort */ }
    }
    load();
    const id = setInterval(load, 900000);
    return () => { live = false; clearInterval(id); };
  }, [location]);

  if (!data) return null;
  const [glyph, label] = wx(data.code);
  return (
    <div className="topweather-wrap">
      <button className="topweather" onClick={() => setOpen((o) => !o)} title={`${data.place} · ${label} — tap for the week`}>
        <span className="tw-ico">{glyph}</span>
        <span className="tw-temp" style={{ color: tempColor(data.t) }}>{data.t}°</span>
      </button>
      {open && <div className="tw-back" onClick={() => setOpen(false)} />}
      {open && (
        <div className="tw-pop">
          <div className="tw-pop-head">
            <span className="tw-ico">{glyph}</span> {data.place}{data.country ? `, ${data.country}` : ''}
            <span className="tw-now" style={{ color: tempColor(data.t) }}>{data.t}°C now · {label}</span>
          </div>
          <div className="tw-days">
            {data.days.map((d, i) => {
              const [g] = wx(d.code);
              return (
                <div className="tw-day" key={d.date}>
                  <span className="tw-dow">{i === 0 ? 'Today' : new Date(d.date).toLocaleDateString('en-ZA', { weekday: 'short' })}</span>
                  <span className="tw-dico">{g}</span>
                  <span className="tw-hi" style={{ color: tempColor(d.hi) }}>{d.hi}°</span>
                  <span className="tw-lo">{d.lo}°</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
