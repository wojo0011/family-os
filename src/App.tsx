import { useEffect, useMemo, useState } from 'react';
import * as Astronomy from 'astronomy-engine';

type PersonId = 'dad' | 'mom' | 'teen' | 'child' | 'family';
type PageId = 'today' | 'calendar' | 'hub' | 'health' | 'money' | 'home' | 'vehicles' | 'pets' | 'memories' | 'settings';

type FamilyEvent = {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  person: PersonId;
  category: string;
  location?: string;
  outdoor?: boolean;
  source: 'demo' | 'google';
};

type WeatherDay = { date: string; high: number; low: number; rain: number; icon: string; summary: string };
type Weather = { current: number | null; location: string; provider: string; days: WeatherDay[] };

type Person = { id: PersonId; name: string; emoji: string; color: string };

const people: Person[] = [
  { id: 'dad', name: 'Dad', emoji: '👨', color: '#65b8ff' },
  { id: 'mom', name: 'Mom', emoji: '👩', color: '#ff8fbd' },
  { id: 'teen', name: 'Teen', emoji: '🧑', color: '#a78bfa' },
  { id: 'child', name: 'Child', emoji: '🧒', color: '#53d7a6' },
  { id: 'family', name: 'Family', emoji: '🏡', color: '#f4c95d' },
];

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

function themeForDate(d: Date) {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (m === 1 && day === 1) return ['🎆', "New Year's Day", 'celebrate'];
  if (m === 2 && day === 14) return ['❤️', "Valentine's Day", 'warm'];
  if (m === 7 && day === 1) return ['🇨🇦', 'Canada Day', 'canada'];
  if (m === 10 && day === 31) return ['🎃', 'Halloween', 'spooky'];
  if (m === 12 && day === 24) return ['🎄', 'Christmas Eve', 'winter'];
  if (m === 12 && day === 25) return ['🎄', 'Christmas Day', 'winter'];
  if (m === 12 && day === 26) return ['🎁', 'Boxing Day', 'winter'];
  return null;
}

function weatherText(code: number) {
  if (code === 0) return ['☀️', 'Clear'];
  if ([1, 2].includes(code)) return ['🌤️', 'Partly cloudy'];
  if (code === 3) return ['☁️', 'Overcast'];
  if ([45, 48].includes(code)) return ['🌫️', 'Fog'];
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return ['🌧️', 'Rain'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['❄️', 'Snow'];
  if ([95, 96, 99].includes(code)) return ['⛈️', 'Thunderstorm'];
  return ['🌤️', 'Weather'];
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
    latitude: String(loc.lat), longitude: String(loc.lon),
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto', forecast_days: '7',
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error('Weather unavailable');
  const p = await response.json();
  return {
    current: p.current?.temperature_2m == null ? null : Math.round(p.current.temperature_2m),
    location: loc.label,
    provider: 'Open-Meteo',
    days: (p.daily?.time ?? []).map((date: string, i: number) => {
      const code = Number(p.daily.weather_code?.[i] ?? 0);
      const [icon, summary] = weatherText(code);
      return { date, high: Math.round(p.daily.temperature_2m_max?.[i] ?? 0), low: Math.round(p.daily.temperature_2m_min?.[i] ?? 0), rain: Math.round(p.daily.precipitation_probability_max?.[i] ?? 0), icon, summary };
    }),
  };
}

let googleToken: string | null = null;

async function connectGoogle(): Promise<{ name: string; events: FamilyEvent[] }> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  if (!clientId) throw new Error('Set VITE_GOOGLE_CLIENT_ID in the repository variables first.');
  if (!(window as any).google?.accounts?.oauth2) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Google Identity Services failed to load'));
      document.head.appendChild(s);
    });
  }
  googleToken = await new Promise<string>((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      callback: (r: any) => r.error ? reject(new Error(r.error)) : resolve(r.access_token),
    });
    client.requestAccessToken({ prompt: 'consent' });
  });
  const headers = { Authorization: `Bearer ${googleToken}` };
  const profile = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers }).then(r => r.json());
  const calendars = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', { headers }).then(r => r.json());
  const min = new Date(); min.setMonth(min.getMonth() - 1);
  const max = new Date(); max.setMonth(max.getMonth() + 2);
  const selected = (calendars.items ?? []).slice(0, 8);
  const all = await Promise.all(selected.map(async (cal: any) => {
    const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', timeMin: min.toISOString(), timeMax: max.toISOString(), maxResults: '250' });
    const data = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${q}`, { headers }).then(r => r.json());
    const lower = String(cal.summary ?? '').toLowerCase();
    const person: PersonId = lower.includes('mom') ? 'mom' : lower.includes('teen') ? 'teen' : lower.includes('child') || lower.includes('kid') ? 'child' : lower.includes('family') ? 'family' : 'dad';
    return (data.items ?? []).map((e: any): FamilyEvent => ({
      id: `${cal.id}:${e.id}`,
      title: e.summary || '(No title)',
      start: new Date(e.start?.dateTime || `${e.start?.date}T00:00:00`),
      end: e.end ? new Date(e.end.dateTime || `${e.end.date}T00:00:00`) : undefined,
      person,
      category: e.extendedProperties?.private?.familyOsCategory || 'family',
      location: e.location,
      outdoor: e.extendedProperties?.private?.familyOsOutdoor === 'true',
      source: 'google',
    }));
  }));
  return { name: profile.name || profile.email || 'Google user', events: all.flat() };
}

const moduleCards: Record<string, Array<[string, string, string]>> = {
  hub: [['👨‍👩‍👧‍👦','Family lenses','Adults, teens and children see only what their permissions allow.'],['✓','Routines','Chores and repeating responsibilities surface only when they matter.'],['🎙','Universal capture','One future entry point for events, expenses, health, mileage and voice.']],
  health: [['🩺','Providers','Doctors, dentists, pharmacy and office details become reusable records.'],['💊','Medication courses','Record label directions, schedule, remaining doses and expected run-out.'],['🌡','Sick mode','Time-stamped temperature, symptoms, fluids and factual notes for a doctor summary.']],
  money: [['💡','Bills','Hydro due Aug 24 · expected $180 · actual $187.42.'],['🧾','Receipts','OCR belongs in-browser with human confirmation before saving.'],['📊','Reports','Weekly and monthly household spending trends without banking credentials.']],
  home: [['🏠','Furnace filter','Changed Aug 3 · next target Nov 1 · every 90 days.'],['🔥','Smoke alarms','Track test and battery replacement cadence.'],['🧰','Appliances','Model, serial, receipt, warranty, manual and service provider.']],
  vehicles: [['🚗','2015 Volkswagen Jetta TDI','Mileage-based and date-based maintenance can coexist.'],['🔧','Mechanic directory','Trusted shop details and service history beside the vehicle.'],['📄','Documents','Insurance and service receipts belong in private Drive storage.']],
  pets: [['🐕','Max','Vet, grooming, vaccination, medication, birthday and adoption day.'],['🩺','Veterinarian','Reusable office info and vaccination history.'],['✨','Pet milestones','Adoption days, birthdays and memorable trips.']],
  memories: [['🎓','Graduations','Milestones are durable memories, not noisy one-off events.'],['🚲','Firsts','First school day, first bicycle ride, first job and first car.'],['🏡','Family anniversaries','Home anniversaries, road trips and stories worth keeping.']],
};

function Sidebar({ page, setPage }: { page: PageId; setPage: (p: PageId) => void }) {
  const items: Array<[PageId,string,string]> = [['today','☀','Today'],['calendar','▦','Calendar'],['hub','◉','Family Hub'],['health','♡','Health'],['money','$','Money'],['home','⌂','Home'],['vehicles','🚗','Vehicles'],['pets','🐾','Pets'],['memories','★','Memories'],['settings','⚙','Settings']];
  return <aside className="sidebar"><button className="brand" onClick={() => setPage('today')}><b>F</b><span><strong>Family OS</strong><small>Life, together.</small></span></button><nav>{items.map(([id,icon,label]) => <button key={id} className={page===id?'active':''} onClick={() => setPage(id)}><span>{icon}</span>{label}</button>)}</nav><div className="privacy">🔐 <span><strong>Private by design</strong><small>Permissions, not CSS hiding.</small></span></div></aside>;
}

function Today({ events, weather, onAdd }: { events: FamilyEvent[]; weather: Weather | null; onAdd: () => void }) {
  const today = new Date();
  const todays = events.filter(e => dateKey(e.start) === dateKey(today)).sort((a,b) => a.start.getTime()-b.start.getTime());
  const w = weather?.days.find(d => d.date === dateKey(today)) ?? weather?.days[0];
  const angle = Astronomy.MoonPhase(today);
  const phaseNames = ['New Moon','Waxing Crescent','First Quarter','Waxing Gibbous','Full Moon','Waning Gibbous','Last Quarter','Waning Crescent'];
  const icons = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'];
  const idx = Math.floor(((angle + 22.5) % 360) / 45);
  const quarter = Astronomy.SearchMoonQuarter(today);
  return <div className="stack"><section className="hero-grid"><div className="hero"><span className="eyebrow">Good {today.getHours()<12?'morning':today.getHours()<18?'afternoon':'evening'}</span><h1>Your family, in one calm view.</h1><p>{new Intl.DateTimeFormat('en-CA',{weekday:'long',month:'long',day:'numeric'}).format(today)}</p><div className="actions"><button className="primary" onClick={onAdd}>+ Add something</button><button>🎙 Speak</button></div></div><div className="weather"><div><span className="eyebrow">{weather?.location ?? 'Weather'}</span><strong>{weather?.current ?? '—'}°</strong><span>{w?.summary ?? 'Loading…'}</span></div><b>{w?.icon ?? '🌤️'}</b>{w && <footer><span>H {w.high}°</span><span>L {w.low}°</span><span>💧 {w.rain}%</span></footer>}</div></section><section className="two-col"><div className="panel"><header><div><span className="eyebrow">Timeline</span><h2>Today</h2></div><small>{todays.length} events</small></header><div className="timeline">{todays.map(e => { const p=people.find(x=>x.id===e.person)!; return <article key={e.id}><time>{formatTime(e.start)}</time><i style={{background:p.color}}/><div><strong>{e.title}</strong><small>{p.emoji} {p.name}{e.location?` · ${e.location}`:''}</small></div>{e.outdoor&&w?<em>{w.icon} {w.high}° · {w.rain}% rain</em>:null}</article>})}</div></div><div className="panel"><header><div><span className="eyebrow">Attention</span><h2>What matters next</h2></div><span>🔔</span></header><div className="alerts"><article><b>💊</b><div><strong>Medication</strong><small>Next recorded schedule · 4:00 PM</small></div><em>NOW</em></article><article><b>🦷</b><div><strong>Dentist</strong><small>3:30 PM · Hamilton Dental</small></div><em>TODAY</em></article><article><b>💡</b><div><strong>Hydro</strong><small>Due in 4 days · $187.42</small></div><em>SOON</em></article><article><b>🚗</b><div><strong>Oil service</strong><small>~420 km remaining</small></div><em>SOON</em></article></div></div></section><section className="sky panel"><div className="moon">{icons[idx]}</div><div><span className="eyebrow">Night sky</span><h2>{phaseNames[idx]}</h2><p>Calculated locally in your browser. Next quarter: <strong>{quarter ? ['New Moon','First Quarter','Full Moon','Last Quarter'][quarter.quarter] : '—'}</strong>.</p></div><aside><small>Viewing context</small><strong>{w && w.rain < 25 ? '✨ Promising sky' : '☁ Check cloud cover'}</strong><span>Weather + astronomy</span></aside></section></div>;
}

function Calendar({ events, weather }: { events: FamilyEvent[]; weather: Weather | null }) {
  const [anchor,setAnchor]=useState(new Date());
  const [visible,setVisible]=useState(new Set<PersonId>(people.map(p=>p.id)));
  const days=useMemo(()=>monthGrid(anchor),[anchor]);
  const weatherMap=new Map(weather?.days.map(d=>[d.date,d])??[]);
  const label=new Intl.DateTimeFormat('en-CA',{month:'long',year:'numeric'}).format(anchor);
  const move=(n:number)=>setAnchor(new Date(anchor.getFullYear(),anchor.getMonth()+n,1));
  return <div className="stack"><section className="toolbar panel"><div><span className="eyebrow">Family calendar</span><div className="month-title"><button onClick={()=>move(-1)}>‹</button><h1>{label}</h1><button onClick={()=>move(1)}>›</button></div></div><div className="people">{people.map(p=><button key={p.id} className={visible.has(p.id)?'on':''} style={{borderBottomColor:p.color}} onClick={()=>setVisible(v=>{const n=new Set(v);n.has(p.id)?n.delete(p.id):n.add(p.id);return n})}>{p.emoji} {p.name}</button>)}</div></section><section className="calendar panel"><div className="weekdays">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><b key={d}>{d}</b>)}</div><div className="month-grid">{days.map(d=>{const key=dateKey(d);const w=weatherMap.get(key);const theme=themeForDate(d);const ev=events.filter(e=>dateKey(e.start)===key&&visible.has(e.person));return <article key={key} className={`${d.getMonth()===anchor.getMonth()?'':'muted'} ${key===dateKey(new Date())?'today':''} ${theme?`theme-${theme[2]}`:''}`}><header><b>{d.getDate()}</b>{theme&&<span title={theme[1]}>{theme[0]}</span>}</header>{w&&<div className="tile-weather"><span>{w.icon}</span><strong>{w.high}°</strong><small>{w.low}° · 💧{w.rain}%</small></div>}<div className="event-list">{ev.slice(0,3).map(e=>{const p=people.find(x=>x.id===e.person)!;return <div key={e.id} style={{borderLeftColor:p.color}}><small>{formatTime(e.start)}</small><strong>{e.title}</strong></div>})}{ev.length>3&&<small>+{ev.length-3} more</small>}</div></article>})}</div></section><p className="note">Weather: {weather?.provider ?? 'loading'} · demo events remain in-browser only until Google Calendar is connected.</p></div>;
}

function Module({ page }: { page: PageId }) {
  const cards=moduleCards[page]??[];
  const title=page==='hub'?'Family Hub':page[0].toUpperCase()+page.slice(1);
  return <div className="stack"><header className="module-hero"><span className="eyebrow">Family OS module</span><h1>{title}</h1><p>Structured records surface on the timeline only when time matters.</p></header><section className="cards">{cards.map(([icon,name,text])=><article key={name}><span>{icon}</span><h3>{name}</h3><p>{text}</p><button>Explore →</button></article>)}</section></div>;
}

function Settings({ theme,setTheme }: { theme:string; setTheme:(t:string)=>void }) {
  return <div className="stack"><header className="module-hero"><span className="eyebrow">Preferences & privacy</span><h1>Settings</h1><p>Personal appearance can change without changing the shared family data.</p></header><section className="settings panel"><label>Personal theme<select value={theme} onChange={e=>setTheme(e.target.value)}><option value="midnight">Midnight</option><option value="space">Space</option><option value="nature">Nature</option><option value="soft">Soft</option></select></label><article><b>🔐 Google Calendar</b><span>Private schedules remain protected by Google permissions.</span></article><article><b>🗄 Family Vault</b><span>Health, finance, pet, home and vehicle records are designed for permissioned Google Drive storage.</span></article></section></div>;
}

export default function App() {
  const [page,setPage]=useState<PageId>('today');
  const [events,setEvents]=useState<FamilyEvent[]>(demoEvents);
  const [weather,setWeather]=useState<Weather|null>(null);
  const [googleStatus,setGoogleStatus]=useState('Demo mode');
  const [theme,setTheme]=useState('midnight');
  const [capture,setCapture]=useState(false);
  useEffect(()=>{document.documentElement.dataset.theme=theme},[theme]);
  useEffect(()=>{loadWeather().then(setWeather).catch(()=>setWeather(null))},[]);
  const connect=async()=>{try{setGoogleStatus('Connecting…');const result=await connectGoogle();setGoogleStatus(`Connected · ${result.name}`);if(result.events.length)setEvents(result.events)}catch(e){setGoogleStatus(e instanceof Error?e.message:'Google connection failed')}};
  return <div className="app"><Sidebar page={page} setPage={setPage}/><main><header className="topbar"><div><strong>Family OS</strong><small>{googleStatus}</small></div><div><span className="weather-chip">{weather?.days[0]?.icon} {weather?.current??'—'}°</span><button className="connect" onClick={connect}>{import.meta.env.VITE_GOOGLE_CLIENT_ID?'Connect Google':'Google setup needed'}</button><button className="primary" onClick={()=>setCapture(true)}>+ Add</button></div></header><div className="content">{page==='today'?<Today events={events} weather={weather} onAdd={()=>setCapture(true)}/>:page==='calendar'?<Calendar events={events} weather={weather}/>:page==='settings'?<Settings theme={theme} setTheme={setTheme}/>:<Module page={page}/>}</div></main><nav className="mobile-nav"><button onClick={()=>setPage('today')}>☀<small>Today</small></button><button onClick={()=>setPage('calendar')}>▦<small>Calendar</small></button><button className="fab" onClick={()=>setCapture(true)}>+</button><button onClick={()=>setPage('hub')}>◉<small>Hub</small></button><button onClick={()=>setPage('settings')}>👤<small>Me</small></button></nav>{capture&&<div className="overlay" onClick={()=>setCapture(false)}><section className="capture" onClick={e=>e.stopPropagation()}><header><div><span className="eyebrow">Universal capture</span><h2>What would you like to add?</h2></div><button onClick={()=>setCapture(false)}>×</button></header><div>{[['📅','Event'],['✓','Reminder'],['💵','Expense'],['🧾','Scan receipt'],['💊','Medication'],['🌡','Health entry'],['🎂','Milestone'],['🐕','Pet record'],['🚗','Vehicle update'],['⌂','Home maintenance'],['🎙','Speak']].map(([i,l])=><button key={l}><span>{i}</span><strong>{l}</strong></button>)}</div><p className="note">The capture menu is the common entry point. Persistence is intentionally activated module-by-module rather than faked.</p></section></div>}</div>;
}
