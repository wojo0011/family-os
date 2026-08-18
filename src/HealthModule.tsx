import { useMemo, useState } from 'react';
import {
  addCaptureRecord,
  captureRecordDateLabel,
  captureRecordSummary,
  removeCaptureRecord,
  type CaptureRecord,
} from './localCaptureStore';
import {
  HEALTH_PROVIDER_TYPES,
  addHealthProvider,
  removeHealthProvider,
  suggestedFollowUpMonths,
  updateHealthProvider,
  type HealthProvider,
  type HealthProviderInput,
  type HealthProviderType,
  type ProviderPerson,
} from './healthProviderStore';

const PEOPLE: ProviderPerson[] = ['Family', 'Dad', 'Mom', 'Teen', 'Child'];
const EMPTY_PROVIDER: HealthProviderInput = {
  name: '',
  type: 'Family doctor',
  organization: '',
  person: 'Family',
  phone: '',
  email: '',
  address: '',
  website: '',
  lastVisitDate: '',
  followUpMonths: null,
  notes: '',
};

type HealthAlert = {
  id: string;
  icon: string;
  title: string;
  detail: string;
  level: 'now' | 'soon' | 'follow-up';
  providerId?: string;
};

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthsAfter(dateText: string, months: number) {
  const date = new Date(`${dateText}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function daysFromNow(date: Date) {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

function recordDateTime(record: CaptureRecord) {
  const date = record.values.date || record.values.startDate;
  if (!date) return null;
  const time = record.values.time || '12:00';
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function healthAlerts(providers: HealthProvider[], records: CaptureRecord[]): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  const now = new Date();

  providers.forEach(provider => {
    if (!provider.lastVisitDate || !provider.followUpMonths) return;
    const due = monthsAfter(provider.lastVisitDate, provider.followUpMonths);
    if (!due || due > now) return;
    const overdueDays = Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86_400_000));
    alerts.push({
      id: `provider:${provider.id}`,
      icon: provider.type.includes('Dent') ? '🦷' : provider.type === 'Pharmacy' ? '💊' : '🩺',
      title: `${provider.type} follow-up`,
      detail: overdueDays > 30
        ? `It has been ${provider.followUpMonths}+ months since the recorded visit with ${provider.name}. Consider booking a follow-up.`
        : `Your ${provider.followUpMonths}-month follow-up window with ${provider.name} has arrived.`,
      level: 'follow-up',
      providerId: provider.id,
    });
  });

  records.forEach(record => {
    if (record.kind !== 'Event' && record.kind !== 'Reminder') return;
    const when = recordDateTime(record);
    if (!when || when.getTime() < Date.now() - 60_000) return;
    const days = daysFromNow(when);
    const category = (record.values.category || '').toLowerCase();
    const isHealthAppointment = record.kind === 'Event' && ['appointment', 'medical', 'dental'].includes(category);
    const isReminder = record.kind === 'Reminder';
    if (!isHealthAppointment && !isReminder) return;
    if (days > 7) return;

    alerts.push({
      id: `record:${record.id}`,
      icon: isReminder ? '✓' : category === 'dental' ? '🦷' : '📅',
      title: captureRecordSummary(record),
      detail: `${days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`} · ${captureRecordDateLabel(record)}${record.values.time ? ` · ${record.values.time}` : ''}`,
      level: days <= 1 ? 'now' : 'soon',
    });
  });

  return alerts.sort((a, b) => ({ now: 0, soon: 1, 'follow-up': 2 }[a.level] - ({ now: 0, soon: 1, 'follow-up': 2 }[b.level])));
}

function typeIcon(type: HealthProviderType) {
  if (type.includes('Dent')) return '🦷';
  if (type === 'Pharmacy') return '💊';
  if (type === 'Optometrist') return '👓';
  if (type === 'Therapist') return '🧠';
  if (type === 'Clinic') return '🏥';
  return '🩺';
}

function followUpText(provider: HealthProvider) {
  if (!provider.lastVisitDate) return 'No last visit recorded';
  if (!provider.followUpMonths) return `Last visit ${provider.lastVisitDate}`;
  const due = monthsAfter(provider.lastVisitDate, provider.followUpMonths);
  if (!due) return `Last visit ${provider.lastVisitDate}`;
  const days = daysFromNow(due);
  if (days < 0) return `Follow-up due · ${Math.abs(days)} days overdue`;
  if (days === 0) return 'Follow-up due today';
  return `Follow-up in ${days} days`;
}

function normalizeWebsite(value: string) {
  if (!value) return '';
  return value.includes('://') ? value : `https://${value}`;
}

export default function HealthModule({ providers, records }: { providers: HealthProvider[]; records: CaptureRecord[] }) {
  const [editing, setEditing] = useState<HealthProvider | null | 'new'>(null);
  const [providerDraft, setProviderDraft] = useState<HealthProviderInput>(EMPTY_PROVIDER);
  const [providerErrors, setProviderErrors] = useState<Record<string, string>>({});
  const [appointmentProvider, setAppointmentProvider] = useState<HealthProvider | null>(null);
  const [appointmentErrors, setAppointmentErrors] = useState<Record<string, string>>({});
  const [notificationState, setNotificationState] = useState(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );

  const alerts = useMemo(() => healthAlerts(providers, records), [providers, records]);
  const healthRecords = records.filter(record => ['Medication', 'Health entry'].includes(record.kind));

  const beginAdd = () => {
    setProviderDraft(EMPTY_PROVIDER);
    setProviderErrors({});
    setEditing('new');
  };

  const beginEdit = (provider: HealthProvider) => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, sync: _sync, ...values } = provider;
    setProviderDraft(values);
    setProviderErrors({});
    setEditing(provider);
  };

  const saveProvider = () => {
    const result = editing === 'new'
      ? addHealthProvider(providerDraft)
      : editing && editing !== 'new'
        ? updateHealthProvider(editing.id, providerDraft)
        : null;
    if (!result?.provider) {
      setProviderErrors(result?.validation?.errors ?? { name: 'Unable to save provider.' });
      return;
    }
    setEditing(null);
  };

  const setProviderType = (type: HealthProviderType) => {
    setProviderDraft(previous => ({
      ...previous,
      type,
      followUpMonths: previous.followUpMonths ?? suggestedFollowUpMonths(type),
    }));
  };

  const recordVisit = (provider: HealthProvider) => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, sync: _sync, ...values } = provider;
    updateHealthProvider(provider.id, { ...values, lastVisitDate: isoDate(new Date()) });
  };

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    setNotificationState(permission);
    if (permission === 'granted') {
      new Notification('Family OS health reminders enabled', { body: 'Upcoming appointments, reminders and provider follow-ups can now notify you while Family OS is open.' });
    }
  };

  const saveAppointment = (form: HTMLFormElement) => {
    const values = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const result = addCaptureRecord('Event', values);
    if (!result.record) {
      setAppointmentErrors(result.validation.errors);
      return;
    }
    setAppointmentErrors({});
    setAppointmentProvider(null);
  };

  return <div className="stack health-module">
    <header className="module-hero health-hero">
      <span className="eyebrow">Family OS · Health</span>
      <h1>Health, appointments and providers.</h1>
      <p>Keep reusable provider details, appointment context and follow-up reminders together. Provider data stays local until Google Contacts sync is connected.</p>
    </header>

    <section className="health-summary-grid">
      <article className="panel health-summary-card"><span>🩺</span><div><strong>{providers.length}</strong><small>Providers</small></div></article>
      <article className="panel health-summary-card"><span>🔔</span><div><strong>{alerts.length}</strong><small>Health reminders</small></div></article>
      <article className="panel health-summary-card"><span>💊</span><div><strong>{healthRecords.length}</strong><small>Health records</small></div></article>
    </section>

    <section className="panel health-alert-panel">
      <header><div><span className="eyebrow">Attention</span><h2>Appointments & follow-ups</h2></div><button className="health-notify-button" onClick={enableNotifications} disabled={notificationState === 'granted' || notificationState === 'unsupported'}>{notificationState === 'granted' ? '✓ Browser notifications enabled' : notificationState === 'unsupported' ? 'Notifications unavailable' : '🔔 Enable notifications'}</button></header>
      {alerts.length ? <div className="health-alert-list">{alerts.slice(0, 8).map(alert => <article key={alert.id} className={`health-alert health-alert-${alert.level}`}><span>{alert.icon}</span><div><strong>{alert.title}</strong><small>{alert.detail}</small></div>{alert.providerId ? <button onClick={() => { const provider = providers.find(item => item.id === alert.providerId); if (provider) setAppointmentProvider(provider); }}>Book appointment</button> : null}</article>)}</div> : <div className="health-empty"><span>✓</span><div><strong>No health follow-ups need attention right now.</strong><small>Upcoming appointments and your own provider follow-up intervals will appear here.</small></div></div>}
      <p className="health-notice">Follow-up intervals are personal reminder settings, not medical recommendations. Browser notifications currently work while Family OS is open; cloud push can be added with the future sync service.</p>
    </section>

    <section className="panel provider-panel">
      <header><div><span className="eyebrow">Reusable contacts</span><h2>Providers</h2><p>Doctors, dentists, pharmacies, clinics and specialists.</p></div><button className="primary" onClick={beginAdd}>+ Add provider</button></header>
      {providers.length ? <div className="provider-grid">{providers.map(provider => <article className="provider-card" key={provider.id}>
        <div className="provider-card-top"><span className="provider-icon">{typeIcon(provider.type)}</span><div><span className="eyebrow">{provider.type}</span><h3>{provider.name}</h3><small>{provider.organization || provider.person}</small></div><span className="provider-sync">{provider.sync.status === 'synced' ? '☁ Synced' : '○ Local'}</span></div>
        <div className="provider-contact-lines">
          {provider.phone ? <a href={`tel:${provider.phone}`}>☎ {provider.phone}</a> : null}
          {provider.email ? <a href={`mailto:${provider.email}`}>✉ {provider.email}</a> : null}
          {provider.address ? <span>⌖ {provider.address}</span> : null}
          {provider.website ? <a href={normalizeWebsite(provider.website)} target="_blank" rel="noreferrer">↗ Website</a> : null}
        </div>
        <div className="provider-follow-up"><strong>{followUpText(provider)}</strong><small>{provider.lastVisitDate ? `Last visit · ${provider.lastVisitDate}` : 'Add a last visit date to enable follow-up tracking'}{provider.followUpMonths ? ` · every ${provider.followUpMonths} months` : ''}</small></div>
        <div className="provider-actions"><button onClick={() => setAppointmentProvider(provider)}>📅 Appointment</button><button onClick={() => recordVisit(provider)}>✓ Record visit today</button><button onClick={() => beginEdit(provider)}>Edit</button></div>
      </article>)}</div> : <div className="provider-empty"><span>🩺</span><div><h3>Add your first provider</h3><p>Save contact details once, then reuse them for appointments and follow-up reminders.</p><button className="primary" onClick={beginAdd}>+ Add provider</button></div></div>}
      <footer className="provider-sync-note"><span>🔐 Stored locally now</span><span>Google Contacts adapter planned · resource name/etag fields are already reserved for sync</span></footer>
    </section>

    <section className="panel local-records-panel">
      <header><div><span className="eyebrow">Health history</span><h2>Saved health records</h2></div><small>{healthRecords.length} record{healthRecords.length === 1 ? '' : 's'}</small></header>
      {healthRecords.length ? <div className="local-records-list">{healthRecords.slice(0, 20).map(record => <article className="local-record-row" key={record.id}><div><strong>{record.kind === 'Medication' ? '💊' : '🌡'} {captureRecordSummary(record)}</strong><small>{record.kind} · {captureRecordDateLabel(record)}</small></div><button className="local-record-delete" onClick={() => { if (window.confirm('Remove this health record?')) removeCaptureRecord(record.id); }}>Remove</button></article>)}</div> : <p className="note">No health records saved yet.</p>}
    </section>

    {editing ? <div className="health-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(null); }}><section className="health-modal" role="dialog" aria-modal="true" aria-label={editing === 'new' ? 'Add provider' : 'Edit provider'}>
      <header><div><span className="eyebrow">{editing === 'new' ? 'New reusable contact' : 'Edit reusable contact'}</span><h2>{editing === 'new' ? 'Add provider' : providerDraft.name}</h2></div><button onClick={() => setEditing(null)} aria-label="Close">×</button></header>
      <div className="health-form-grid">
        <label><span>Provider name</span><input value={providerDraft.name} onChange={event => setProviderDraft({ ...providerDraft, name: event.target.value })} placeholder="Dr. Jane Smith" />{providerErrors.name ? <small className="health-field-error">{providerErrors.name}</small> : null}</label>
        <label><span>Provider type</span><select value={providerDraft.type} onChange={event => setProviderType(event.target.value as HealthProviderType)}>{HEALTH_PROVIDER_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
        <label><span>Organization / clinic</span><input value={providerDraft.organization} onChange={event => setProviderDraft({ ...providerDraft, organization: event.target.value })} placeholder="Hamilton Family Health" /></label>
        <label><span>For</span><select value={providerDraft.person} onChange={event => setProviderDraft({ ...providerDraft, person: event.target.value as ProviderPerson })}>{PEOPLE.map(person => <option key={person}>{person}</option>)}</select></label>
        <label><span>Phone</span><input value={providerDraft.phone} onChange={event => setProviderDraft({ ...providerDraft, phone: event.target.value })} placeholder="905-555-0123" /></label>
        <label><span>Email</span><input type="email" value={providerDraft.email} onChange={event => setProviderDraft({ ...providerDraft, email: event.target.value })} placeholder="office@example.ca" />{providerErrors.email ? <small className="health-field-error">{providerErrors.email}</small> : null}</label>
        <label className="wide"><span>Address</span><input value={providerDraft.address} onChange={event => setProviderDraft({ ...providerDraft, address: event.target.value })} placeholder="Street, city, province" /></label>
        <label><span>Website</span><input value={providerDraft.website} onChange={event => setProviderDraft({ ...providerDraft, website: event.target.value })} placeholder="clinic.ca" />{providerErrors.website ? <small className="health-field-error">{providerErrors.website}</small> : null}</label>
        <label><span>Last visit</span><input type="date" value={providerDraft.lastVisitDate} onChange={event => setProviderDraft({ ...providerDraft, lastVisitDate: event.target.value })} />{providerErrors.lastVisitDate ? <small className="health-field-error">{providerErrors.lastVisitDate}</small> : null}</label>
        <label><span>Follow-up reminder</span><select value={providerDraft.followUpMonths ?? ''} onChange={event => setProviderDraft({ ...providerDraft, followUpMonths: event.target.value ? Number(event.target.value) : null })}><option value="">No automatic follow-up</option><option value="1">1 month</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option><option value="18">18 months</option><option value="24">24 months</option></select><small>Your reminder cadence, not medical advice.</small>{providerErrors.followUpMonths ? <small className="health-field-error">{providerErrors.followUpMonths}</small> : null}</label>
        <label className="wide"><span>Notes</span><textarea rows={4} value={providerDraft.notes} onChange={event => setProviderDraft({ ...providerDraft, notes: event.target.value })} placeholder="Office hours, parking, preferred pharmacy instructions, accessibility notes…" /></label>
      </div>
      <footer><div>{editing !== 'new' ? <button className="health-danger" onClick={() => { if (editing !== 'new' && window.confirm(`Remove ${editing.name}?`)) { removeHealthProvider(editing.id); setEditing(null); } }}>Delete provider</button> : null}</div><div><button onClick={() => setEditing(null)}>Cancel</button><button className="primary" onClick={saveProvider}>Save provider</button></div></footer>
    </section></div> : null}

    {appointmentProvider ? <div className="health-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setAppointmentProvider(null); }}><section className="health-modal health-appointment-modal" role="dialog" aria-modal="true" aria-label="Add appointment">
      <header><div><span className="eyebrow">{appointmentProvider.type}</span><h2>Add appointment</h2><p>{appointmentProvider.name}{appointmentProvider.organization ? ` · ${appointmentProvider.organization}` : ''}</p></div><button onClick={() => setAppointmentProvider(null)} aria-label="Close">×</button></header>
      <form onSubmit={event => { event.preventDefault(); saveAppointment(event.currentTarget); }}>
        <div className="health-form-grid">
          <label className="wide"><span>Appointment title</span><input name="title" defaultValue={`${appointmentProvider.type} · ${appointmentProvider.name}`} />{appointmentErrors.title ? <small className="health-field-error">{appointmentErrors.title}</small> : null}</label>
          <label><span>Type</span><select name="category" defaultValue={appointmentProvider.type.includes('Dent') ? 'Dental' : 'Medical'}><option>Appointment</option><option>Medical</option><option>Dental</option></select></label>
          <label><span>Who</span><select name="person" defaultValue={appointmentProvider.person}>{PEOPLE.map(person => <option key={person}>{person}</option>)}</select></label>
          <label><span>Date</span><input name="date" type="date" defaultValue={isoDate(new Date())} />{appointmentErrors.date ? <small className="health-field-error">{appointmentErrors.date}</small> : null}</label>
          <label><span>Time</span><input name="time" type="time" defaultValue="09:00" />{appointmentErrors.time ? <small className="health-field-error">{appointmentErrors.time}</small> : null}</label>
          <label className="wide"><span>Location</span><input name="location" defaultValue={appointmentProvider.address || appointmentProvider.organization} /></label>
          <label className="wide"><span>Notes</span><textarea name="notes" rows={4} defaultValue={`Provider: ${appointmentProvider.name}${appointmentProvider.phone ? ` · ${appointmentProvider.phone}` : ''}`} /></label>
        </div>
        <footer><div /><div><button type="button" onClick={() => setAppointmentProvider(null)}>Cancel</button><button className="primary" type="submit">Save appointment</button></div></footer>
      </form>
    </section></div> : null}
  </div>;
}
