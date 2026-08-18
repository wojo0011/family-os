import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import * as Astronomy from 'astronomy-engine';
import {
  captureRecordDateLabel,
  captureRecordSummary,
  captureRecordToCalendarEntry,
  loadCaptureRecords,
  removeCaptureRecord,
  subscribeCaptureRecords,
  type CaptureKind,
  type CaptureRecord,
} from './localCaptureStore';

type PersonId = 'dad' | 'mom' | 'teen' | 'child' | 'family';
type PageId = 'today' | 'calendar' | 'hub' | 'health' | 'money' | 'home' | 'vehicles' | 'pets' | 'memories' | 'settings';
type SpecialDaySet = 'all' | 'canada' | 'celebrations' | 'seasonal' | 'off';
type SpecialDayEffect = 'rich' | 'subtle';
type WeatherIconName = 'clear-day' | 'partly-cloudy-day' | 'overcast-day' | 'fog-day' | 'rain' | 'snow' | 'thunderstorms-day';

type FamilyEvent = {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  person: PersonId;
  category: string;
  location?: string;
  outdoor?: boolean;
  source: 'demo' | 'google' | 'local';
  localRecordId?: string;
};

type WeatherDay = { date: string; high: number; low: number; rain: number; icon: WeatherIconName; summary: string };
type Weather = { current: number | null; location: string; provider: string; days: WeatherDay[] };
type Person = { id: PersonId; name: string; emoji: string; color: string };
type SpecialDayTheme = { icon: string; label: string; style: string; group: Exclude<SpecialDaySet, 'all' | 'off'> };

const METEOCONS_VERSION = '0.1.0';
const METEOCONS_BASE = `https://cdn.meteocons.com/${METEOCONS_VERSION}`;

const people: Person[] = [
  { id: 'family', name: 'Family', emoji: '🏡', color: '#f4c95d' },
  { id: 'dad', name: 'Dad', emoji: '👨', color: '#65b8ff' },
  { id: 'mom', name: 'Mom', emoji: '👩', color: '#ff8fbd' },
  { id: 'teen', name: 'Teen', emoji: '🧑', color: '#a78bfa' },
  { id: 'child', name: 'Child', emoji: '🧒', color: '#53d7a6' },
];

const recordIcons: Record<CaptureKind, string> = {
  Event: '📅', Reminder: '✓', Bill: '💡', Expense: '💵', 'Scan receipt': '🧾', Medication: '💊',
  'Health entry': '🌡', Milestone: '🎂', 'Pet record': '🐕', 'Vehicle update': '🚗',
  'Home maintenance': '⌂', Speak: '🎙',
};

const pageCaptureKinds: Partial<Record<PageId, CaptureKind[]>> = {
  hub: ['Event', 'Reminder', 'Speak'],
  health: ['Medication', 'Health entry'],
  money: ['Bill', 'Expense', 'Scan receipt'],
  home: ['Home maintenance'],
  vehicles: ['Vehicle update'],
  pets: ['Pet record'],
  memories: ['Milestone'],
};

const at = (offset: number, hour: number, minute = 0) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

const demoEvents: FamilyEvent[] = [
  { id: '1', title: 'Family breakfast', start: at(0, 9), person: 'family', category: 'family', source: 'demo' },
  { id: '2', title: 'Swimming lesson', start: at(0, 11, 30), person: 'child', category: 'sport', source: 'demo' },
  { id: '3', title: 'Dentist', start: at(0, 15, 30), person: 'teen', category: 'health', location: 'Hamilton Dental', source: 'demo' },
  { id: '4', title: 'Family dinner', start: at(0, 18), person: 'family', category: 'family', source: 'demo' },
  { id: '5', title: 'School orientation', start: at(1, 10), person: 'child', category: 'school', source: 'demo' },
  { id: '6', title: 'Soccer practice', start: at(2, 18), person: 'teen', category: 'sport', outdoor: true, source: 'demo' },
  { id: '7', title: 'Hydro due', start: at(4, 9), person: 'family', category: 'money', source: 'demo' },
  { id: '8', title: 'Max — vet appointment', start: at(6, 14), person: 'family', category: 'pet', source: 'demo' },
  { id: '9', title: 'Change furnace filter', start: at(8, 10), person: 'family', category: 'home', source: 'demo' },
  { id: '10', title: 'Oil service', start: at(11, 8), person: 'dad', category: 'vehicle', source: 'demo' },
  { id: '11', title: 'Birthday party', start: at(14, 14), person: 'child', category: 'milestone', outdoor: true, source: 'demo' },
];

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const formatTime = (d: Date) => new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' }).format(d);
const activePerson = (id: PersonId) => people.find(person => person.id === id) ?? people[0];
const eventVisibleToLens = (event: FamilyEvent, lens: PersonId) => lens === 'family' || event.person === lens || event.person === 'family';

function monthGrid(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function themeForDate(d: Date): SpecialDayTheme | null {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (m === 1 && day === 1) return { icon: '🎆', label: "New Year's Day", style: 'celebrate', group: 'celebrations' };
  if (m === 2 && day === 14) return { icon: '❤️', label: "Valentine's Day", style: 'warm', group: 'celebrations' };
  if (m === 7 && day === 1) return { icon: '🇨🇦', label: 'Canada Day', style: 'canada', group: 'canada' };
  if (m === 10 && day === 31) return { icon: '🎃', label: 'Halloween', style: 'spooky', group: 'seasonal' };
  if (m === 12 && day === 24) return { icon: '🎄', label: 'Christmas Eve', style: 'winter', group: 'seasonal' };
  if (m === 12 && day === 25) return { icon: '🎄', label: 'Christmas Day', style: 'winter', group: 'seasonal' };
  if (m === 12 && day === 26) return { icon: '🎁', label: 'Boxing Day', style: 'winter', group: 'seasonal' };
  return null;
}

function themeIsEnabled(theme: SpecialDayTheme | null, setting: SpecialDaySet) {
  return Boolean(theme && setting !== 'off' && (setting === 'all' || setting === theme.group));
}

function weatherText(code: number): [WeatherIconName, string] {
  if (code === 0) return ['clear-day', 'Clear'];
  if ([1, 2].includes(code)) return ['partly-cloudy-day', 'Partly cloudy'];
  if (code === 3) return ['overcast-day', 'Overcast'];
  if ([45, 48].includes(code)) return ['fog-day', 'Fog'];
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return ['rain', 'Rain'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['snow', 'Snow'];
  if ([95, 96, 99].includes(code)) return ['thunderstorms-day', 'Thunderstorm'];
  return ['partly-cloudy-day', 'Weather'];
}

function WeatherIcon({ name, alt, size = 'md' }: { name: WeatherIconName; alt: string; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (failed) return <span className={`weather-fallback weather-${size}`} role="img" aria-label={alt}>🌤️</span>;
  const kind = reduceMotion ? 'svg-static' : 'svg';
  return <img className={`weather-art weather-${size}`} src={`${METEOCONS_BASE}/${kind}/fill/${name}.svg`} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

async function loadWeather(): Promise<Weather> {
  const fallback = { lat: 43.2557, lon: -79.8711, label: 'Hamilton, Ontario' };
  let loc = fallback;
  if (navigator.geolocation) {
    try {
      const p = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000, maximumAge: 900000 }));
      loc = { lat: p.coords.latitude, lon: p.coords.longitude, label: 'Current location' };
    } catch { /* use Hamilton */ }
  }
  const params = new URLSearchParams({
    latitude: String(loc.lat), longitude: String(loc.lon), current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max', timezone: 'auto', forecast_days: '7',
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error('Weather unavailable');
  const payload = await response.json();
  return {
    current: payload.current?.temperature_2m == null ? null : Math.round(payload.current.temperature_2m),
    location: loc.label,
    provider: 'Open-Meteo',
    days: (payload.daily?.time ?? []).map((date: string, i: number) => {
      const code = Number(payload.daily.weather_code?.[i] ?? 0);
      const [icon, summary] = weatherText(code);
      return { date, high: Math.round(payload.daily.temperature_2m_max?.[i] ?? 0), low: Math.round(payload.daily.temperature_2m_min?.[i] ?? 0), rain: Math.round(payload.daily.precipitation_probability_max?.[i] ?? 0), icon, summary };
    }),
  };
}

let googleToken: string | null = null;

async function connectGoogle(): Promise<{ name: string; events: FamilyEvent[] }> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  if (!clientId) throw new Error('Set VITE_GOOGLE_CLIENT_ID in the repository variables first.');
  if (!(window as any).google?.accounts?.oauth2) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Google Identity Services failed to load'));
      document.head.appendChild(script);
    });
  }
  googleToken = await new Promise<string>((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      callback: (result: any) => result.error ? reject(new Error(result.error)) : resolve(result.access_token),
    });
    client.requestAccessToken({ prompt: 'consent' });
  });
  const headers = { Authorization: `Bearer ${googleToken}` };
  const profile = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers }).then(r => r.json());
  const calendars = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', { headers }).then(r => r.json());
  const min = new Date(); min.setMonth(min.getMonth() - 1);
  const max = new Date(); max.setMonth(max.getMonth() + 2);
  const selected = (calendars.items ?? []).slice(0, 8);
  const all = await Promise.all(selected.map(async (calendar: any) => {
    const query = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', timeMin: min.toISOString(), timeMax: max.toISOString(), maxResults: '250' });
    const data = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?${query}`, { headers }).then(r => r.json());
    const lower = String(calendar.summary ?? '').toLowerCase();
    const person: PersonId = lower.includes('mom') ? 'mom' : lower.includes('teen') ? 'teen' : lower.includes('child') || lower.includes('kid') ? 'child' : lower.includes('family') ? 'family' : 'dad';
    return (data.items ?? []).map((event: any): FamilyEvent => ({
      id: `${calendar.id}:${event.id}`,
      title: event.summary || '(No title)',
      start: new Date(event.start?.dateTime || `${event.start?.date}T00:00:00`),
      end: event.end ? new Date(event.end.dateTime || `${event.end.date}T00:00:00`) : undefined,
      person,
      category: event.extendedProperties?.private?.familyOsCategory || 'family',
      location: event.location,
      outdoor: event.extendedProperties?.private?.familyOsOutdoor === 'true',
      source: 'google',
    }));
  }));
  return { name: profile.name || profile.email || 'Google user', events: all.flat() };
}

const moduleCards: Record<string, Array<[string, string, string]>> = {
  hub: [['👨‍👩‍👧‍👦', 'Family lenses', 'Adults, teens and children see only what their permissions allow.'], ['✓', 'Routines', 'Chores and repeating responsibilities surface only when they matter.'], ['🎙', 'Universal capture', 'One entry point for events, expenses, health, mileage and voice.']],
  health: [['🩺', 'Providers', 'Doctors, dentists, pharmacy and office details become reusable records.'], ['💊', 'Medication courses', 'Record label directions, schedule, remaining doses and expected run-out.'], ['🌡', 'Sick mode', 'Time-stamped temperature, symptoms, fluids and factual notes for a doctor summary.']],
  money: [['💡', 'Bills', 'Track expected and actual household costs.'], ['🧾', 'Receipts', 'Store confirmed receipt details locally before future OCR/cloud sync.'], ['📊', 'Reports', 'Weekly and monthly household spending trends without banking credentials.']],
  home: [['🏠', 'Maintenance', 'Track household tasks and recurrence.'], ['🔥', 'Safety', 'Smoke alarm and safety maintenance cadence.'], ['🧰', 'Appliances', 'Model, serial, receipt, warranty, manual and service provider.']],
  vehicles: [['🚗', 'Vehicles', 'Mileage-based and date-based maintenance can coexist.'], ['🔧', 'Service history', 'Repairs, maintenance, cost and odometer history.'], ['📄', 'Documents', 'Insurance and service receipts belong in private storage.']],
  pets: [['🐕', 'Pet records', 'Vet, grooming, vaccination, medication, birthday and adoption day.'], ['🩺', 'Veterinarian', 'Reusable office info and vaccination history.'], ['✨', 'Pet milestones', 'Adoption days, birthdays and memorable trips.']],
  memories: [['🎓', 'Graduations', 'Milestones are durable memories, not noisy one-off events.'], ['🚲', 'Firsts', 'First school day, first bicycle ride, first job and first car.'], ['🏡', 'Family anniversaries', 'Home anniversaries, road trips and stories worth keeping.']],
};

function FamilyLensPicker({ value, onChange, compact = false }: { value: PersonId; onChange: (id: PersonId) => void; compact?: boolean }) {
  return <div className={`lens-picker ${compact ? 'compact' : ''}`} role="group" aria-label="Switch family view">{people.map(person => <button key={person.id} className={value === person.id ? 'active' : ''} onClick={() => onChange(person.id)} title={`View ${person.name}`} style={{ '--person-color': person.color } as CSSProperties}><span>{person.emoji}</span><b>{person.name}</b></button>)}</div>;
}

function Sidebar({ page, setPage }: { page: PageId; setPage: (p: PageId) => void }) {
  const items: Array<[PageId, string, string]> = [['today', '☀', 'Today'], ['calendar', '▦', 'Calendar'], ['hub', '◉', 'Family Hub'], ['health', '♡', 'Health'], ['money', '$', 'Money'], ['home', '⌂', 'Home'], ['vehicles', '🚗', 'Vehicles'], ['pets', '🐾', 'Pets'], ['memories', '★', 'Memories'], ['settings', '⚙', 'Settings']];
  return <aside className="sidebar"><button className="brand" onClick={() => setPage('today')}><b>F</b><span><strong>Family OS</strong><small>Life, together.</small></span></button><nav>{items.map(([id, icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><span>{icon}</span>{label}</button>)}</nav><div className="privacy">🔐 <span><strong>Private by design</strong><small>Permissions, not CSS hiding.</small></span></div></aside>;
}

function Today({ events, weather, onAdd, lens, onDeleteLocal }: { events: FamilyEvent[]; weather: Weather | null; onAdd: () => void; lens: PersonId; onDeleteLocal: (id: string) => void }) {
  const today = new Date();
  const person = activePerson(lens);
  const todays = events.filter(event => dateKey(event.start) === dateKey(today) && eventVisibleToLens(event, lens)).sort((a, b) => a.start.getTime() - b.start.getTime());
  const weatherToday = weather?.days.find(day => day.date === dateKey(today)) ?? weather?.days[0];
  const angle = Astronomy.MoonPhase(today);
  const phaseNames = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  const moonIcons = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  const idx = Math.floor(((angle + 22.5) % 360) / 45);
  const quarter = Astronomy.SearchMoonQuarter(today);
  return <div className="stack">
    <section className="hero-grid">
      <div className="hero"><span className="eyebrow">Good {today.getHours() < 12 ? 'morning' : today.getHours() < 18 ? 'afternoon' : 'evening'} · {person.emoji} {person.name} lens</span><h1>{lens === 'family' ? 'Your family, in one calm view.' : `${person.name}'s day, with family context.`}</h1><p>{new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }).format(today)}</p><div className="actions"><button className="primary" onClick={onAdd}>+ Add something</button><button onClick={onAdd}>🎙 Speak</button></div></div>
      <div className="weather"><div><span className="eyebrow">{weather?.location ?? 'Weather'}</span><strong>{weather?.current ?? '—'}°</strong><span>{weatherToday?.summary ?? 'Loading…'}</span></div>{weatherToday ? <WeatherIcon name={weatherToday.icon} alt={weatherToday.summary} size="lg" /> : <span className="weather-loader">…</span>}{weatherToday && <footer><span>H {weatherToday.high}°</span><span>L {weatherToday.low}°</span><span>💧 {weatherToday.rain}%</span></footer>}</div>
    </section>
    <section className="two-col">
      <div className="panel"><header><div><span className="eyebrow">Timeline · {person.name}</span><h2>Today</h2></div><small>{todays.length} events</small></header><div className="timeline">{todays.map(event => { const owner = activePerson(event.person); return <article key={event.id}><time>{formatTime(event.start)}</time><i style={{ background: owner.color }} /><div><strong>{event.title}</strong><small>{owner.emoji} {owner.name}{event.location ? ` · ${event.location}` : ''}{event.source === 'local' ? ' · local' : ''}</small></div><div className="timeline-local-actions">{event.outdoor && weatherToday ? <em><WeatherIcon name={weatherToday.icon} alt={weatherToday.summary} size="sm" /> {weatherToday.high}° · {weatherToday.rain}% rain</em> : null}{event.source === 'local' && event.localRecordId ? <button className="timeline-local-delete" onClick={() => onDeleteLocal(event.localRecordId!)}>Remove</button> : null}</div></article>; })}</div></div>
      <div className="panel"><header><div><span className="eyebrow">Attention</span><h2>What matters next</h2></div><span>🔔</span></header><div className="alerts"><article><b>💊</b><div><strong>Medication</strong><small>Next recorded schedule · 4:00 PM</small></div><em>NOW</em></article><article><b>🦷</b><div><strong>Dentist</strong><small>3:30 PM · Hamilton Dental</small></div><em>TODAY</em></article><article><b>💡</b><div><strong>Hydro</strong><small>Due in 4 days · $187.42</small></div><em>SOON</em></article><article><b>🚗</b><div><strong>Oil service</strong><small>~420 km remaining</small></div><em>SOON</em></article></div></div>
    </section>
    <section className="sky panel"><div className="moon">{moonIcons[idx]}</div><div><span className="eyebrow">Night sky</span><h2>{phaseNames[idx]}</h2><p>Calculated locally in your browser. Next quarter: <strong>{quarter ? ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'][quarter.quarter] : '—'}</strong>.</p></div><aside><small>Viewing context</small><strong>{weatherToday && weatherToday.rain < 25 ? '✨ Promising sky' : '☁ Check cloud cover'}</strong><span>Weather + astronomy</span></aside></section>
  </div>;
}

function Calendar({ events, weather, lens, specialDaySet, specialDayEffect }: { events: FamilyEvent[]; weather: Weather | null; lens: PersonId; specialDaySet: SpecialDaySet; specialDayEffect: SpecialDayEffect }) {
  const [anchor, setAnchor] = useState(new Date());
  const days = useMemo(() => monthGrid(anchor), [anchor]);
  const weatherMap = new Map(weather?.days.map(day => [day.date, day]) ?? []);
  const label = new Intl.DateTimeFormat('en-CA', { month: 'long', year: 'numeric' }).format(anchor);
  const move = (n: number) => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + n, 1));
  const person = activePerson(lens);
  return <div className="stack">
    <section className="toolbar panel"><div><span className="eyebrow">Family calendar · viewing {person.name}</span><div className="month-title"><button onClick={() => move(-1)}>‹</button><h1>{label}</h1><button onClick={() => move(1)}>›</button></div></div><div className="lens-summary"><span style={{ background: person.color }}>{person.emoji}</span><div><strong>{person.name} lens</strong><small>{lens === 'family' ? 'All permitted family events' : `${person.name} + shared family events`}</small></div></div></section>
    <section className="calendar panel"><div className="weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <b key={day}>{day}</b>)}</div><div className="month-grid">{days.map(day => {
      const key = dateKey(day);
      const w = weatherMap.get(key);
      const special = themeForDate(day);
      const eventList = events.filter(event => dateKey(event.start) === key && eventVisibleToLens(event, lens));
      const birthday = eventList.some(event => event.category === 'milestone' && event.title.toLowerCase().includes('birthday'));
      const showSpecial = themeIsEnabled(special, specialDaySet);
      const showBirthday = birthday && (specialDaySet === 'all' || specialDaySet === 'celebrations');
      const themeClass = showSpecial && special ? `theme-${special.style} special-${specialDayEffect}` : showBirthday ? `theme-birthday special-${specialDayEffect}` : '';
      return <article key={key} className={`${day.getMonth() === anchor.getMonth() ? '' : 'muted'} ${key === dateKey(new Date()) ? 'today' : ''} ${themeClass}`}><header><b>{day.getDate()}</b>{showBirthday ? <span title="Birthday">🎂</span> : showSpecial && special ? <span title={special.label}>{special.icon}</span> : null}</header>{w && <div className="tile-weather"><WeatherIcon name={w.icon} alt={w.summary} size="md" /><strong>{w.high}°</strong><small>{w.low}° · 💧{w.rain}%</small></div>}<div className="event-list">{eventList.slice(0, 3).map(event => { const owner = activePerson(event.person); return <div key={event.id} style={{ borderLeftColor: owner.color }} title={event.source === 'local' ? 'Saved locally' : undefined}><small>{formatTime(event.start)}</small><strong>{event.title}</strong></div>; })}{eventList.length > 3 && <small>+{eventList.length - 3} more</small>}</div></article>;
    })}</div></section>
    <p className="note">Weather: {weather?.provider ?? 'loading'} · animated icons: Meteocons · {person.name} lens · special days: {specialDaySet} / {specialDayEffect}.</p>
  </div>;
}

function Module({ page, records, onDelete }: { page: PageId; records: CaptureRecord[]; onDelete: (id: string) => void }) {
  const cards = moduleCards[page] ?? [];
  const title = page === 'hub' ? 'Family Hub' : page[0].toUpperCase() + page.slice(1);
  const kinds = pageCaptureKinds[page] ?? [];
  const relevant = records.filter(record => kinds.includes(record.kind));
  return <div className="stack"><header className="module-hero"><span className="eyebrow">Family OS module</span><h1>{title}</h1><p>Structured records surface on the timeline only when time matters.</p></header><section className="cards">{cards.map(([icon, name, text]) => <article key={name}><span>{icon}</span><h3>{name}</h3><p>{text}</p><button>Explore →</button></article>)}</section>{kinds.length ? <section className="panel local-records-panel"><header><div><span className="eyebrow">Local records</span><h2>Saved in this browser</h2></div><small>{relevant.length} record{relevant.length === 1 ? '' : 's'}</small></header>{relevant.length ? <div className="local-records-list">{relevant.slice(0, 25).map(record => <article className="local-record-row" key={record.id}><div><strong>{recordIcons[record.kind]} {captureRecordSummary(record)}</strong><small>{record.kind} · {captureRecordDateLabel(record)}</small></div><button className="local-record-delete" onClick={() => onDelete(record.id)}>Remove</button></article>)}</div> : <p className="note">No local records here yet. Use + Add to create one.</p>}</section> : null}</div>;
}

function Settings({ theme, setTheme, lens, setLens, specialDaySet, setSpecialDaySet, specialDayEffect, setSpecialDayEffect }: { theme: string; setTheme: (theme: string) => void; lens: PersonId; setLens: (id: PersonId) => void; specialDaySet: SpecialDaySet; setSpecialDaySet: (value: SpecialDaySet) => void; specialDayEffect: SpecialDayEffect; setSpecialDayEffect: (value: SpecialDayEffect) => void }) {
  const specialSets: Array<[SpecialDaySet, string, string]> = [['all', '✨ All', 'Canada + celebrations + seasonal'], ['canada', '🇨🇦 Canada', 'Canadian special-day treatments'], ['celebrations', '🎂 Celebrations', 'Birthdays, Valentine’s, New Year'], ['seasonal', '🎄 Seasonal', 'Christmas, Halloween and seasons'], ['off', '○ Off', 'Keep the calendar visually neutral']];
  return <div className="stack"><header className="module-hero"><span className="eyebrow">Preferences & privacy</span><h1>Settings</h1><p>Personal appearance and viewing lens can change without changing shared family data.</p></header><section className="settings panel"><label>Personal theme<select value={theme} onChange={event => setTheme(event.target.value)}><option value="midnight">Midnight</option><option value="space">Space</option><option value="nature">Nature</option><option value="soft">Soft</option></select></label><div className="setting-block"><div><b>👨‍👩‍👧‍👦 Family lens</b><span>Switch the app between the household view and an individual view.</span></div><FamilyLensPicker value={lens} onChange={setLens} /></div><div className="setting-block"><div><b>🎉 Special-day themes</b><span>Choose which dates are allowed to temporarily decorate calendar tiles.</span></div><div className="theme-set-grid">{specialSets.map(([id, label, description]) => <button key={id} className={specialDaySet === id ? 'selected' : ''} onClick={() => setSpecialDaySet(id)}><strong>{label}</strong><small>{description}</small></button>)}</div></div><label>Special-day effect<select value={specialDayEffect} onChange={event => setSpecialDayEffect(event.target.value as SpecialDayEffect)} disabled={specialDaySet === 'off'}><option value="rich">Rich · background + icon</option><option value="subtle">Subtle · accent + icon</option></select></label><div className="special-preview"><article className={`theme-canada special-${specialDayEffect}`}><b>🇨🇦 Canada Day</b><span>July 1</span></article><article className={`theme-winter special-${specialDayEffect}`}><b>🎄 Christmas</b><span>December 25</span></article><article className={`theme-birthday special-${specialDayEffect}`}><b>🎂 Birthday</b><span>Family milestone</span></article></div><article><b>🔐 Google Calendar</b><span>Private schedules remain protected by Google permissions. A Family Lens never grants access the signed-in account does not already have.</span></article><article><b>🗄 Family Vault</b><span>For now, capture records are stored locally. The data layer is structured so a future cloud adapter can replace local persistence.</span></article></section></div>;
}

export default function App() {
  const [page, setPage] = useState<PageId>('today');
  const [events, setEvents] = useState<FamilyEvent[]>(demoEvents);
  const [localRecords, setLocalRecords] = useState<CaptureRecord[]>(() => loadCaptureRecords());
  const [weather, setWeather] = useState<Weather | null>(null);
  const [googleStatus, setGoogleStatus] = useState('Demo mode');
  const [theme, setTheme] = useState('midnight');
  const [lens, setLens] = useState<PersonId>('family');
  const [specialDaySet, setSpecialDaySet] = useState<SpecialDaySet>('all');
  const [specialDayEffect, setSpecialDayEffect] = useState<SpecialDayEffect>('rich');
  const [capture, setCapture] = useState(false);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { loadWeather().then(setWeather).catch(() => setWeather(null)); }, []);
  useEffect(() => subscribeCaptureRecords(setLocalRecords), []);

  const localEvents = useMemo<FamilyEvent[]>(() => localRecords.flatMap(record => {
    const entry = captureRecordToCalendarEntry(record);
    return entry ? [{ ...entry, source: 'local' as const, localRecordId: record.id }] : [];
  }), [localRecords]);
  const visibleEvents = useMemo(() => [...events, ...localEvents], [events, localEvents]);

  const deleteLocal = (id: string) => {
    if (!window.confirm('Remove this local Family OS record?')) return;
    removeCaptureRecord(id);
  };

  const connect = async () => {
    try {
      setGoogleStatus('Connecting…');
      const result = await connectGoogle();
      setGoogleStatus(`Connected · ${result.name}`);
      if (result.events.length) setEvents(result.events);
    } catch (error) {
      setGoogleStatus(error instanceof Error ? error.message : 'Google connection failed');
    }
  };

  const currentWeather = weather?.days[0];
  return <div className="app">
    <Sidebar page={page} setPage={setPage} />
    <main>
      <header className="topbar"><div><strong>Family OS</strong><small>{googleStatus}</small></div><div className="top-actions"><FamilyLensPicker value={lens} onChange={setLens} compact />{currentWeather && <span className="weather-chip"><WeatherIcon name={currentWeather.icon} alt={currentWeather.summary} size="sm" /> {weather?.current ?? '—'}°</span>}<button className="connect" onClick={connect}>{import.meta.env.VITE_GOOGLE_CLIENT_ID ? 'Connect Google' : 'Google setup needed'}</button><button className="primary" onClick={() => setCapture(true)}>+ Add</button></div></header>
      <div className="content">{page === 'today' ? <Today events={visibleEvents} weather={weather} onAdd={() => setCapture(true)} lens={lens} onDeleteLocal={deleteLocal} /> : page === 'calendar' ? <Calendar events={visibleEvents} weather={weather} lens={lens} specialDaySet={specialDaySet} specialDayEffect={specialDayEffect} /> : page === 'settings' ? <Settings theme={theme} setTheme={setTheme} lens={lens} setLens={setLens} specialDaySet={specialDaySet} setSpecialDaySet={setSpecialDaySet} specialDayEffect={specialDayEffect} setSpecialDayEffect={setSpecialDayEffect} /> : <Module page={page} records={localRecords} onDelete={deleteLocal} />}</div>
    </main>
    <nav className="mobile-nav"><button onClick={() => setPage('today')}>☀<small>Today</small></button><button onClick={() => setPage('calendar')}>▦<small>Calendar</small></button><button className="fab" onClick={() => setCapture(true)}>+</button><button onClick={() => setPage('hub')}>◉<small>Hub</small></button><button onClick={() => setPage('settings')}>👤<small>Me</small></button></nav>
    {capture && <div className="overlay" onClick={() => setCapture(false)}><section className="capture" onClick={event => event.stopPropagation()}><header><div><span className="eyebrow">Universal capture</span><h2>What would you like to add?</h2></div><button onClick={() => setCapture(false)}>×</button></header><div>{[['📅', 'Event'], ['✓', 'Reminder'], ['💡', 'Bill'], ['💵', 'Expense'], ['🧾', 'Scan receipt'], ['💊', 'Medication'], ['🌡', 'Health entry'], ['🎂', 'Milestone'], ['🐕', 'Pet record'], ['🚗', 'Vehicle update'], ['⌂', 'Home maintenance'], ['🎙', 'Speak']].map(([icon, label]) => <button key={label}><span>{icon}</span><strong>{label}</strong></button>)}</div><p className="note">Local persistence is active. Cloud and Google Calendar sync can be connected later through the same data layer.</p></section></div>}
  </div>;
}
