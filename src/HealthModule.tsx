import { useEffect, useMemo, useState } from 'react';
import {
  addCaptureRecord,
  captureRecordDateLabel,
  captureRecordSummary,
  removeCaptureRecord,
  updateCaptureRecord,
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
import {
  clearMedicationDose,
  doseLogFor,
  loadMedicationAdherence,
  normalizeDoseTimes,
  recordMedicationDose,
  removeMedicationAdherence,
  saveMedicationSchedule,
  scheduleForMedication,
  subscribeMedicationAdherence,
  type MedicationAdherenceState,
  type MedicationDoseStatus,
} from './medicationDoseStore';

const PEOPLE: ProviderPerson[] = ['Family', 'Dad', 'Mom', 'Teen', 'Child'];
const HEALTH_ENTRY_TYPES = ['Temperature', 'Symptom', 'Blood pressure', 'Heart rate', 'Weight', 'Doctor note', 'Other'] as const;
const MEDICATION_STATUSES = ['Active', 'Paused', 'Completed'] as const;
const DOSE_PRESETS = [
  { label: 'Morning', time: '08:00' },
  { label: 'Noon', time: '12:00' },
  { label: 'Evening', time: '20:00' },
  { label: 'Bedtime', time: '22:00' },
] as const;

const EMPTY_PROVIDER: HealthProviderInput = {
  name: '', type: 'Family doctor', organization: '', person: 'Family', phone: '', email: '',
  address: '', website: '', lastVisitDate: '', followUpMonths: null, notes: '',
};

type HealthAlert = { id: string; icon: string; title: string; detail: string; level: 'now' | 'soon' | 'follow-up'; providerId?: string };
type HealthRecordKind = 'Medication' | 'Health entry';
type HealthRecordEditor = { kind: HealthRecordKind; record: CaptureRecord | null } | null;
type ScheduleType = 'Scheduled' | 'As needed';

type TodayDose = {
  medication: CaptureRecord;
  time: string;
  state: 'upcoming' | 'due' | MedicationDoseStatus;
  recordedAt?: string;
};

const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function monthsAfter(dateText: string, months: number) {
  const date = new Date(`${dateText}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

const daysFromNow = (date: Date) => Math.ceil((date.getTime() - Date.now()) / 86_400_000);

function recordDateTime(record: CaptureRecord) {
  const date = record.values.date || record.values.startDate;
  if (!date) return null;
  const parsed = new Date(`${date}T${record.values.time || '12:00'}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildAlerts(providers: HealthProvider[], records: CaptureRecord[]): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  const now = new Date();

  for (const provider of providers) {
    if (!provider.lastVisitDate || !provider.followUpMonths) continue;
    const due = monthsAfter(provider.lastVisitDate, provider.followUpMonths);
    if (!due || due > now) continue;
    alerts.push({
      id: `provider:${provider.id}`,
      icon: provider.type.includes('Dent') ? '🦷' : provider.type === 'Pharmacy' ? '💊' : '🩺',
      title: `${provider.type} follow-up`,
      detail: `It has been at least ${provider.followUpMonths} months since the recorded visit with ${provider.name}. Consider booking a follow-up.`,
      level: 'follow-up',
      providerId: provider.id,
    });
  }

  for (const record of records) {
    if (record.kind !== 'Event' && record.kind !== 'Reminder') continue;
    const when = recordDateTime(record);
    if (!when || when.getTime() < Date.now() - 60_000) continue;
    const days = daysFromNow(when);
    if (days > 7) continue;
    const category = (record.values.category || '').toLowerCase();
    const appointment = record.kind === 'Event' && ['appointment', 'medical', 'dental'].includes(category);
    if (!appointment && record.kind !== 'Reminder') continue;
    alerts.push({
      id: `record:${record.id}`,
      icon: record.kind === 'Reminder' ? '✓' : category === 'dental' ? '🦷' : '📅',
      title: captureRecordSummary(record),
      detail: `${days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`} · ${captureRecordDateLabel(record)}${record.values.time ? ` · ${record.values.time}` : ''}`,
      level: days <= 1 ? 'now' : 'soon',
    });
  }

  const rank = { now: 0, soon: 1, 'follow-up': 2 } as const;
  return alerts.sort((a, b) => rank[a.level] - rank[b.level]);
}

function typeIcon(type: HealthProviderType) {
  if (type.includes('Dent')) return '🦷';
  if (type === 'Pharmacy') return '💊';
  if (type === 'Optometrist') return '👓';
  if (type === 'Therapist') return '🧠';
  if (type === 'Clinic') return '🏥';
  return '🩺';
}

function healthEntryIcon(type: string) {
  if (type === 'Temperature') return '🌡';
  if (type === 'Blood pressure') return '🫀';
  if (type === 'Heart rate') return '♥';
  if (type === 'Weight') return '⚖';
  if (type === 'Doctor note') return '📝';
  if (type === 'Symptom') return '✚';
  return '●';
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

function medicationStatus(record: CaptureRecord) {
  const explicit = record.values.status;
  if (explicit === 'Paused' || explicit === 'Completed') return explicit;
  const today = isoDate(new Date());
  if (record.values.startDate && record.values.startDate > today) return 'Scheduled';
  if (record.values.endDate && record.values.endDate < today) return 'Completed';
  return 'Active';
}

function medicationDoseTimes(record: CaptureRecord) {
  const configured = (record.values.doseTimes || '').split(',').map(value => value.trim()).filter(Boolean);
  return normalizeDoseTimes(configured.length ? configured : record.values.time ? [record.values.time] : []);
}

function medicationAppliesOnDate(record: CaptureRecord, date: string) {
  if (medicationStatus(record) !== 'Active') return false;
  if (record.values.scheduleType === 'As needed') return false;
  if (record.values.startDate && date < record.values.startDate) return false;
  if (record.values.endDate && date > record.values.endDate) return false;
  return true;
}

function recordValues(form: HTMLFormElement) {
  const values: Record<string, string> = {};
  new FormData(form).forEach((value, key) => { values[key] = String(value); });
  return values;
}

function prettyTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);
  return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' }).format(date);
}

function doseStateLabel(state: TodayDose['state']) {
  if (state === 'taken') return 'Taken';
  if (state === 'skipped') return 'Skipped';
  if (state === 'due') return 'Due';
  return 'Upcoming';
}

const normalizeWebsite = (value: string) => !value ? '' : value.includes('://') ? value : `https://${value}`;

export default function HealthModule({ providers, records }: { providers: HealthProvider[]; records: CaptureRecord[] }) {
  const [mode, setMode] = useState<'new' | 'edit' | null>(null);
  const [editingProvider, setEditingProvider] = useState<HealthProvider | null>(null);
  const [draft, setDraft] = useState<HealthProviderInput>(EMPTY_PROVIDER);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [appointmentProvider, setAppointmentProvider] = useState<HealthProvider | null>(null);
  const [appointmentErrors, setAppointmentErrors] = useState<Record<string, string>>({});
  const [recordEditor, setRecordEditor] = useState<HealthRecordEditor>(null);
  const [recordErrors, setRecordErrors] = useState<Record<string, string>>({});
  const [doseTimesDraft, setDoseTimesDraft] = useState<string[]>(['09:00']);
  const [scheduleTypeDraft, setScheduleTypeDraft] = useState<ScheduleType>('Scheduled');
  const [medicationRemindersDraft, setMedicationRemindersDraft] = useState(true);
  const [adherence, setAdherence] = useState<MedicationAdherenceState>(() => loadMedicationAdherence());
  const [clock, setClock] = useState(() => Date.now());
  const [notificationState, setNotificationState] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

  useEffect(() => subscribeMedicationAdherence(setAdherence), []);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const alerts = useMemo(() => buildAlerts(providers, records), [providers, records]);
  const medications = records.filter(record => record.kind === 'Medication');
  const healthEntries = records.filter(record => record.kind === 'Health entry');
  const activeMedications = medications.filter(record => medicationStatus(record) === 'Active').length;
  const today = isoDate(new Date(clock));

  const todaysDoses = useMemo<TodayDose[]>(() => {
    const now = new Date(clock);
    return medications
      .filter(record => medicationAppliesOnDate(record, today))
      .flatMap(record => {
        const fallbackTimes = medicationDoseTimes(record);
        const fallbackReminders = record.values.remindersEnabled !== 'false';
        const schedule = scheduleForMedication(record.id, fallbackTimes, fallbackReminders, adherence);
        return schedule.doseTimes.map(time => {
          const log = doseLogFor(record.id, today, time, adherence);
          const dueAt = new Date(`${today}T${time}:00`);
          const state: TodayDose['state'] = log?.status ?? (dueAt.getTime() <= now.getTime() ? 'due' : 'upcoming');
          return { medication: record, time, state, recordedAt: log?.recordedAt };
        });
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [medications, adherence, today, clock]);

  const recentDoseLogs = useMemo(() => adherence.logs
    .filter(log => medications.some(record => record.id === log.medicationId))
    .slice()
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .slice(0, 20), [adherence.logs, medications]);

  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  const sevenDayLogs = adherence.logs.filter(log => new Date(log.recordedAt).getTime() >= sevenDaysAgo);
  const sevenDayTaken = sevenDayLogs.filter(log => log.status === 'taken').length;
  const sevenDayAdherence = sevenDayLogs.length ? Math.round((sevenDayTaken / sevenDayLogs.length) * 100) : null;
  const todayTaken = todaysDoses.filter(dose => dose.state === 'taken').length;
  const todaySkipped = todaysDoses.filter(dose => dose.state === 'skipped').length;
  const todayOpen = todaysDoses.filter(dose => dose.state === 'due' || dose.state === 'upcoming').length;

  const openNew = () => { setMode('new'); setEditingProvider(null); setDraft(EMPTY_PROVIDER); setErrors({}); };
  const openEdit = (provider: HealthProvider) => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, sync: _sync, ...values } = provider;
    setMode('edit'); setEditingProvider(provider); setDraft(values); setErrors({});
  };
  const closeProvider = () => { setMode(null); setEditingProvider(null); setErrors({}); };

  const openHealthRecord = (kind: HealthRecordKind, record: CaptureRecord | null) => {
    setRecordErrors({});
    setRecordEditor({ kind, record });
    if (kind === 'Medication') {
      const scheduleType = record?.values.scheduleType === 'As needed' ? 'As needed' : 'Scheduled';
      setScheduleTypeDraft(scheduleType);
      const fallbackTimes = record ? medicationDoseTimes(record) : ['09:00'];
      const schedule = record
        ? scheduleForMedication(record.id, fallbackTimes, record.values.remindersEnabled !== 'false', adherence)
        : null;
      setDoseTimesDraft(scheduleType === 'Scheduled' ? (schedule?.doseTimes.length ? schedule.doseTimes : fallbackTimes.length ? fallbackTimes : ['09:00']) : []);
      setMedicationRemindersDraft(scheduleType === 'Scheduled' ? (schedule?.remindersEnabled ?? true) : false);
    }
  };

  const saveProvider = () => {
    const result = mode === 'new' ? addHealthProvider(draft) : editingProvider ? updateHealthProvider(editingProvider.id, draft) : null;
    if (!result?.provider) { setErrors(result?.validation?.errors ?? { name: 'Unable to save provider.' }); return; }
    closeProvider();
  };

  const recordVisit = (provider: HealthProvider) => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, sync: _sync, ...values } = provider;
    updateHealthProvider(provider.id, { ...values, lastVisitDate: isoDate(new Date()) });
  };

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    setNotificationState(permission);
    if (permission === 'granted') new Notification('Family OS health reminders enabled', { body: 'Appointments, medication doses and provider follow-ups can notify you while Family OS is open.' });
  };

  const saveAppointment = (form: HTMLFormElement) => {
    const result = addCaptureRecord('Event', recordValues(form));
    if (!result.record) { setAppointmentErrors(result.validation.errors); return; }
    setAppointmentErrors({}); setAppointmentProvider(null);
  };

  const saveHealthRecord = (form: HTMLFormElement) => {
    if (!recordEditor) return;
    const values = recordValues(form);

    if (recordEditor.kind === 'Medication') {
      const normalizedTimes = scheduleTypeDraft === 'Scheduled' ? normalizeDoseTimes(doseTimesDraft) : [];
      if (scheduleTypeDraft === 'Scheduled' && normalizedTimes.length === 0) {
        setRecordErrors({ doseTimes: 'Add at least one daily dose time, or choose As needed.' });
        return;
      }
      values.scheduleType = scheduleTypeDraft;
      values.doseTimes = normalizedTimes.join(',');
      values.time = normalizedTimes[0] ?? '';
      values.remindersEnabled = scheduleTypeDraft === 'Scheduled' && medicationRemindersDraft ? 'true' : 'false';
    }

    const result = recordEditor.record
      ? updateCaptureRecord(recordEditor.record.id, values)
      : addCaptureRecord(recordEditor.kind, values);
    if (!result.record) {
      setRecordErrors(result.validation?.errors ?? { form: 'Unable to save this record.' });
      return;
    }

    if (recordEditor.kind === 'Medication') {
      saveMedicationSchedule(
        result.record.id,
        scheduleTypeDraft === 'Scheduled' ? doseTimesDraft : [],
        scheduleTypeDraft === 'Scheduled' && medicationRemindersDraft,
      );
    }

    setRecordErrors({});
    setRecordEditor(null);
  };

  const removeHealthRecord = (record: CaptureRecord) => {
    if (!window.confirm(`Remove ${record.kind === 'Medication' ? record.values.medication || 'this medication' : record.values.entryType || 'this health record'}?`)) return;
    removeCaptureRecord(record.id);
    if (record.kind === 'Medication') removeMedicationAdherence(record.id);
    if (recordEditor?.record?.id === record.id) setRecordEditor(null);
  };

  const markDose = (dose: TodayDose, status: MedicationDoseStatus) => {
    recordMedicationDose(dose.medication.id, today, dose.time, status);
  };

  const undoDose = (dose: TodayDose) => {
    clearMedicationDose(dose.medication.id, today, dose.time);
  };

  const addDoseTime = (time = '12:00') => {
    setDoseTimesDraft(previous => normalizeDoseTimes([...previous, time]));
  };

  const updateDoseTime = (index: number, time: string) => {
    setDoseTimesDraft(previous => previous.map((value, current) => current === index ? time : value));
  };

  const removeDoseTime = (index: number) => {
    setDoseTimesDraft(previous => previous.filter((_, current) => current !== index));
  };

  const pharmacies = providers.filter(provider => provider.type === 'Pharmacy');
  const clinicians = providers.filter(provider => provider.type !== 'Pharmacy');

  return <div className="stack health-module">
    <header className="module-hero health-hero"><span className="eyebrow">Family OS · Health</span><h1>Health, medications, appointments and providers.</h1><p>Keep reusable provider details, medication schedules, dose history, health readings and follow-up reminders together. Everything stays local until cloud sync is connected.</p></header>

    <section className="health-summary-grid health-summary-grid-four">
      <article className="panel health-summary-card"><span>🩺</span><div><strong>{providers.length}</strong><small>Providers</small></div></article>
      <article className="panel health-summary-card"><span>💊</span><div><strong>{activeMedications}</strong><small>Active medications</small></div></article>
      <article className="panel health-summary-card"><span>✓</span><div><strong>{todayTaken}/{todaysDoses.length || 0}</strong><small>Doses taken today</small></div></article>
      <article className="panel health-summary-card"><span>🔔</span><div><strong>{alerts.length}</strong><small>Health reminders</small></div></article>
    </section>

    <section className="panel medication-today-panel" data-medication-today>
      <header>
        <div><span className="eyebrow">Medication adherence</span><h2>Today’s doses</h2><p>Mark each scheduled dose as taken or skipped. History stays separate from medication settings.</p></div>
        <div className="dose-summary-pills"><span className="dose-summary-taken">✓ {todayTaken} taken</span><span>{todayOpen} open</span>{todaySkipped ? <span className="dose-summary-skipped">{todaySkipped} skipped</span> : null}{sevenDayAdherence != null ? <span>{sevenDayAdherence}% 7-day logged</span> : null}</div>
      </header>
      {todaysDoses.length ? <div className="today-dose-list">{todaysDoses.map(dose => <article className={`today-dose-row dose-state-${dose.state}`} key={`${dose.medication.id}:${dose.time}`} data-medication-dose={`${dose.medication.id}:${dose.time}`}>
        <time>{prettyTime(dose.time)}</time>
        <span className="dose-pill-icon">💊</span>
        <div className="today-dose-main"><strong>{dose.medication.values.medication}</strong><small>{dose.medication.values.person || 'Family'} · {dose.medication.values.directions}</small></div>
        <span className="dose-state-label">{doseStateLabel(dose.state)}</span>
        <div className="dose-actions">{dose.state === 'taken' || dose.state === 'skipped' ? <button onClick={() => undoDose(dose)}>Undo</button> : <><button className="dose-taken" data-dose-taken onClick={() => markDose(dose, 'taken')}>✓ Taken</button><button className="dose-skipped" data-dose-skipped onClick={() => markDose(dose, 'skipped')}>Skip</button></>}</div>
      </article>)}</div> : <div className="health-empty"><span>💊</span><div><strong>No scheduled doses today.</strong><small>Add an active medication with one or more daily dose times. As-needed medications do not create scheduled reminders.</small></div></div>}
      {recentDoseLogs.length ? <details className="dose-history"><summary>Recent dose history · {recentDoseLogs.length} entries</summary><div className="dose-history-list">{recentDoseLogs.map(log => {
        const medication = medications.find(record => record.id === log.medicationId);
        if (!medication) return null;
        return <article key={log.id}><span className={log.status === 'taken' ? 'dose-history-taken' : 'dose-history-skipped'}>{log.status === 'taken' ? '✓' : '–'}</span><div><strong>{medication.values.medication}</strong><small>{log.date} · {prettyTime(log.time)} · {log.status === 'taken' ? 'Taken' : 'Skipped'}</small></div></article>;
      })}</div></details> : null}
    </section>

    <section className="panel health-alert-panel">
      <header><div><span className="eyebrow">Attention</span><h2>Appointments & follow-ups</h2></div><button className="health-notify-button" onClick={enableNotifications} disabled={notificationState === 'granted' || notificationState === 'unsupported'}>{notificationState === 'granted' ? '✓ Browser notifications enabled' : notificationState === 'unsupported' ? 'Notifications unavailable' : '🔔 Enable notifications'}</button></header>
      {alerts.length ? <div className="health-alert-list">{alerts.slice(0, 8).map(alert => <article key={alert.id} className={`health-alert health-alert-${alert.level}`}><span>{alert.icon}</span><div><strong>{alert.title}</strong><small>{alert.detail}</small></div>{alert.providerId ? <button onClick={() => { const provider = providers.find(item => item.id === alert.providerId); if (provider) setAppointmentProvider(provider); }}>Book appointment</button> : null}</article>)}</div> : <div className="health-empty"><span>✓</span><div><strong>No health follow-ups need attention right now.</strong><small>Upcoming appointments and your saved provider follow-up intervals will appear here.</small></div></div>}
      <p className="health-notice">Follow-up intervals are personal reminder settings, not medical recommendations. Browser notifications currently work while Family OS is open; background push can be added with the future cloud service.</p>
    </section>

    <section className="panel health-record-panel medication-panel">
      <header><div><span className="eyebrow">Medication list</span><h2>Medications</h2><p>Track current medicines, directions, daily schedule, reminders and provider context.</p></div><button className="primary" data-health-add-medication onClick={() => openHealthRecord('Medication', null)}>+ Add medication</button></header>
      {medications.length ? <div className="medication-grid">{medications.map(record => {
        const status = medicationStatus(record);
        const schedule = scheduleForMedication(record.id, medicationDoseTimes(record), record.values.remindersEnabled !== 'false', adherence);
        const asNeeded = record.values.scheduleType === 'As needed';
        return <article className="medication-card" key={record.id} data-health-medication-card>
          <div className="medication-card-head"><span className="medication-icon">💊</span><div><span className={`health-status health-status-${status.toLowerCase()}`}>{status}</span><h3>{record.values.medication}</h3><small>{record.values.person || 'Family'} · {asNeeded ? 'As needed' : schedule.doseTimes.length ? schedule.doseTimes.map(prettyTime).join(' · ') : 'No dose times'}</small></div><button onClick={() => openHealthRecord('Medication', record)}>Edit</button></div>
          <p className="medication-directions">{record.values.directions}</p>
          {!asNeeded && schedule.doseTimes.length ? <div className="medication-dose-chips">{schedule.doseTimes.map(time => <span key={time}>{prettyTime(time)}</span>)}<span className={schedule.remindersEnabled ? 'reminders-on' : ''}>{schedule.remindersEnabled ? '🔔 Reminders on' : 'Reminders off'}</span></div> : <div className="medication-dose-chips"><span>PRN · no scheduled reminder</span></div>}
          <div className="medication-meta"><span>Start · {record.values.startDate || '—'}</span><span>End · {record.values.endDate || 'Open-ended'}</span>{record.values.prescribedBy ? <span>Prescriber · {record.values.prescribedBy}</span> : null}{record.values.pharmacy ? <span>Pharmacy · {record.values.pharmacy}</span> : null}</div>
          {record.values.notes ? <small className="medication-notes">{record.values.notes}</small> : null}
        </article>;
      })}</div> : <div className="health-empty"><span>💊</span><div><strong>No medications saved yet.</strong><small>Add a medication to keep its directions, schedule and dates with the rest of the family health record.</small></div></div>}
    </section>

    <section className="panel health-record-panel">
      <header><div><span className="eyebrow">Health history</span><h2>Health records</h2><p>Save readings, symptoms and clinical notes as a searchable local history.</p></div><button className="primary" data-health-add-record onClick={() => openHealthRecord('Health entry', null)}>+ Add health record</button></header>
      {healthEntries.length ? <div className="health-entry-list">{healthEntries.map(record => <article className="health-entry-row" key={record.id} data-health-entry-row>
        <span className="health-entry-icon">{healthEntryIcon(record.values.entryType)}</span>
        <div><strong>{record.values.entryType || 'Health entry'} · {record.values.value}{record.values.unit ? ` ${record.values.unit}` : ''}</strong><small>{record.values.person || 'Family'} · {captureRecordDateLabel(record)}{record.values.time ? ` · ${record.values.time}` : ''}{record.values.provider ? ` · ${record.values.provider}` : ''}</small>{record.values.notes ? <p>{record.values.notes}</p> : null}</div>
        <button onClick={() => openHealthRecord('Health entry', record)}>Edit</button>
      </article>)}</div> : <div className="health-empty"><span>🌡</span><div><strong>No health records saved yet.</strong><small>Add a temperature, symptom, blood pressure reading, weight, doctor note or another health entry.</small></div></div>}
    </section>

    <section className="panel provider-panel">
      <header><div><span className="eyebrow">Reusable contacts</span><h2>Providers</h2><p>Doctors, dentists, pharmacies, clinics and specialists.</p></div><button className="primary" data-health-add-provider onClick={openNew}>+ Add provider</button></header>
      {providers.length ? <div className="provider-grid">{providers.map(provider => <article className="provider-card" key={provider.id}>
        <div className="provider-card-top"><span className="provider-icon">{typeIcon(provider.type)}</span><div><span className="eyebrow">{provider.type}</span><h3>{provider.name}</h3><small>{provider.organization || provider.person}</small></div><span className="provider-sync">{provider.sync.status === 'synced' ? '☁ Synced' : '○ Local'}</span></div>
        <div className="provider-contact-lines">{provider.phone ? <a href={`tel:${provider.phone}`}>☎ {provider.phone}</a> : null}{provider.email ? <a href={`mailto:${provider.email}`}>✉ {provider.email}</a> : null}{provider.address ? <span>⌖ {provider.address}</span> : null}{provider.website ? <a href={normalizeWebsite(provider.website)} target="_blank" rel="noreferrer">↗ Website</a> : null}</div>
        <div className="provider-follow-up"><strong>{followUpText(provider)}</strong><small>{provider.lastVisitDate ? `Last visit · ${provider.lastVisitDate}` : 'Add a last visit date to enable follow-up tracking'}{provider.followUpMonths ? ` · every ${provider.followUpMonths} months` : ''}</small></div>
        <div className="provider-actions"><button onClick={() => setAppointmentProvider(provider)}>📅 Appointment</button><button onClick={() => recordVisit(provider)}>✓ Record visit today</button><button onClick={() => openEdit(provider)}>Edit</button></div>
      </article>)}</div> : <div className="provider-empty"><span>🩺</span><div><h3>Add your first provider</h3><p>Save contact details once, then reuse them for appointments and follow-up reminders.</p><button className="primary" data-health-add-provider onClick={openNew}>+ Add provider</button></div></div>}
      <footer className="provider-sync-note"><span>🔐 Stored locally now</span><span>Google Contacts ready · resource name and etag fields are reserved for future sync</span></footer>
    </section>

    {recordEditor ? <div className="health-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setRecordEditor(null); }}><section className="health-modal health-record-modal" role="dialog" aria-modal="true" data-health-record-modal aria-label={recordEditor.record ? `Edit ${recordEditor.kind}` : `Add ${recordEditor.kind}`}>
      <header><div><span className="eyebrow">{recordEditor.record ? 'Edit health record' : 'New health record'}</span><h2>{recordEditor.kind === 'Medication' ? 'Medication' : 'Health entry'}</h2><p>{recordEditor.kind === 'Medication' ? 'Set one or more dose times, reminders and prescription context.' : 'Save a dated reading, symptom or clinical note.'}</p></div><button onClick={() => setRecordEditor(null)} aria-label="Close">×</button></header>
      <form onSubmit={event => { event.preventDefault(); saveHealthRecord(event.currentTarget); }}>
        {recordErrors.form ? <div className="health-record-error-summary">{recordErrors.form}</div> : null}
        {recordEditor.kind === 'Medication' ? <div className="health-form-grid">
          <label><span>Medication</span><input name="medication" defaultValue={recordEditor.record?.values.medication || ''} placeholder="Medication name" />{recordErrors.medication ? <small className="health-field-error">{recordErrors.medication}</small> : null}</label>
          <label><span>Status</span><select name="status" defaultValue={recordEditor.record?.values.status || 'Active'}>{MEDICATION_STATUSES.map(status => <option key={status}>{status}</option>)}</select></label>
          <label className="wide"><span>Directions</span><input name="directions" defaultValue={recordEditor.record?.values.directions || ''} placeholder="1 tablet with food" />{recordErrors.directions ? <small className="health-field-error">{recordErrors.directions}</small> : null}</label>
          <label><span>For</span><select name="person" defaultValue={recordEditor.record?.values.person || 'Family'}>{PEOPLE.map(person => <option key={person}>{person}</option>)}</select></label>
          <label><span>Schedule type</span><select name="scheduleType" value={scheduleTypeDraft} onChange={event => { const value = event.target.value as ScheduleType; setScheduleTypeDraft(value); if (value === 'As needed') { setDoseTimesDraft([]); setMedicationRemindersDraft(false); } else if (!doseTimesDraft.length) { setDoseTimesDraft(['09:00']); } }}><option>Scheduled</option><option>As needed</option></select></label>
          {scheduleTypeDraft === 'Scheduled' ? <div className="wide medication-schedule-editor">
            <div className="medication-schedule-head"><div><span>Dose times</span><small>Up to 8 times per day. These drive Today and browser reminders.</small></div><button type="button" onClick={() => addDoseTime()}>+ Add time</button></div>
            <div className="dose-time-grid">{doseTimesDraft.map((time, index) => <div className="dose-time-control" key={`${index}:${time}`}><input type="time" value={time} onChange={event => updateDoseTime(index, event.target.value)} /><button type="button" aria-label={`Remove ${time}`} onClick={() => removeDoseTime(index)}>×</button></div>)}</div>
            <div className="dose-preset-row">{DOSE_PRESETS.map(preset => <button type="button" key={preset.time} onClick={() => addDoseTime(preset.time)}>{preset.label} · {prettyTime(preset.time)}</button>)}</div>
            {recordErrors.doseTimes ? <small className="health-field-error">{recordErrors.doseTimes}</small> : null}
            <label className="medication-reminder-toggle"><input type="checkbox" checked={medicationRemindersDraft} onChange={event => setMedicationRemindersDraft(event.target.checked)} /><span>🔔 Remind me when scheduled doses are coming up</span></label>
          </div> : <div className="wide medication-prn-note"><strong>As-needed medication</strong><small>No automatic daily dose or browser reminder will be generated. You can still keep the medication in the list.</small></div>}
          <label><span>Start date</span><input name="startDate" type="date" defaultValue={recordEditor.record?.values.startDate || isoDate(new Date())} />{recordErrors.startDate ? <small className="health-field-error">{recordErrors.startDate}</small> : null}</label>
          <label><span>End date</span><input name="endDate" type="date" defaultValue={recordEditor.record?.values.endDate || ''} />{recordErrors.endDate ? <small className="health-field-error">{recordErrors.endDate}</small> : null}</label>
          <label><span>Prescribed by</span><select name="prescribedBy" defaultValue={recordEditor.record?.values.prescribedBy || ''}><option value="">Not linked</option>{clinicians.map(provider => <option key={provider.id} value={provider.name}>{provider.name}</option>)}</select></label>
          <label><span>Pharmacy</span><select name="pharmacy" defaultValue={recordEditor.record?.values.pharmacy || ''}><option value="">Not linked</option>{pharmacies.map(provider => <option key={provider.id} value={provider.name}>{provider.name}</option>)}</select></label>
          <label className="wide"><span>Notes</span><textarea name="notes" rows={4} defaultValue={recordEditor.record?.values.notes || ''} placeholder="Prescription details, refill information or other context…" /></label>
        </div> : <div className="health-form-grid">
          <label><span>Entry type</span><select name="entryType" defaultValue={recordEditor.record?.values.entryType || 'Temperature'}>{HEALTH_ENTRY_TYPES.map(type => <option key={type}>{type}</option>)}</select>{recordErrors.entryType ? <small className="health-field-error">{recordErrors.entryType}</small> : null}</label>
          <label><span>Reading / value</span><input name="value" defaultValue={recordEditor.record?.values.value || ''} placeholder="e.g. 38.1 °C or 120/80" />{recordErrors.value ? <small className="health-field-error">{recordErrors.value}</small> : null}</label>
          <label><span>Unit</span><input name="unit" defaultValue={recordEditor.record?.values.unit || ''} placeholder="Optional unit" /></label>
          <label><span>For</span><select name="person" defaultValue={recordEditor.record?.values.person || 'Dad'}>{PEOPLE.filter(person => person !== 'Family').map(person => <option key={person}>{person}</option>)}</select>{recordErrors.person ? <small className="health-field-error">{recordErrors.person}</small> : null}</label>
          <label><span>Date</span><input name="date" type="date" defaultValue={recordEditor.record?.values.date || isoDate(new Date())} />{recordErrors.date ? <small className="health-field-error">{recordErrors.date}</small> : null}</label>
          <label><span>Time</span><input name="time" type="time" defaultValue={recordEditor.record?.values.time || '09:00'} />{recordErrors.time ? <small className="health-field-error">{recordErrors.time}</small> : null}</label>
          <label className="wide"><span>Provider</span><select name="provider" defaultValue={recordEditor.record?.values.provider || ''}><option value="">Not linked</option>{providers.map(provider => <option key={provider.id} value={provider.name}>{provider.name} · {provider.type}</option>)}</select></label>
          <label className="wide"><span>Notes</span><textarea name="notes" rows={4} defaultValue={recordEditor.record?.values.notes || ''} placeholder="Symptoms, context, treatment, questions for the doctor, etc." /></label>
        </div>}
        <footer><div>{recordEditor.record ? <button type="button" className="health-danger" onClick={() => removeHealthRecord(recordEditor.record!)}>Delete</button> : null}</div><div><button type="button" onClick={() => setRecordEditor(null)}>Cancel</button><button className="primary" type="submit">{recordEditor.record ? 'Save changes' : recordEditor.kind === 'Medication' ? 'Save medication' : 'Save health record'}</button></div></footer>
      </form>
    </section></div> : null}

    {mode ? <div className="health-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeProvider(); }}><section className="health-modal" role="dialog" aria-modal="true" aria-label={mode === 'new' ? 'Add provider' : 'Edit provider'}>
      <header><div><span className="eyebrow">{mode === 'new' ? 'New reusable contact' : 'Edit reusable contact'}</span><h2>{mode === 'new' ? 'Add provider' : draft.name}</h2></div><button onClick={closeProvider} aria-label="Close">×</button></header>
      <div className="health-form-grid">
        <label><span>Provider name</span><input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Dr. Jane Smith" />{errors.name ? <small className="health-field-error">{errors.name}</small> : null}</label>
        <label><span>Provider type</span><select value={draft.type} onChange={event => { const type = event.target.value as HealthProviderType; setDraft(previous => ({ ...previous, type, followUpMonths: previous.followUpMonths ?? suggestedFollowUpMonths(type) })); }}>{HEALTH_PROVIDER_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
        <label><span>Organization / clinic</span><input value={draft.organization} onChange={event => setDraft({ ...draft, organization: event.target.value })} placeholder="Hamilton Family Health" /></label>
        <label><span>For</span><select value={draft.person} onChange={event => setDraft({ ...draft, person: event.target.value as ProviderPerson })}>{PEOPLE.map(person => <option key={person}>{person}</option>)}</select></label>
        <label><span>Phone</span><input value={draft.phone} onChange={event => setDraft({ ...draft, phone: event.target.value })} placeholder="905-555-0123" /></label>
        <label><span>Email</span><input type="email" value={draft.email} onChange={event => setDraft({ ...draft, email: event.target.value })} placeholder="office@example.ca" />{errors.email ? <small className="health-field-error">{errors.email}</small> : null}</label>
        <label className="wide"><span>Address</span><input value={draft.address} onChange={event => setDraft({ ...draft, address: event.target.value })} placeholder="Street, city, province" /></label>
        <label><span>Website</span><input value={draft.website} onChange={event => setDraft({ ...draft, website: event.target.value })} placeholder="clinic.ca" />{errors.website ? <small className="health-field-error">{errors.website}</small> : null}</label>
        <label><span>Last visit</span><input type="date" value={draft.lastVisitDate} onChange={event => setDraft({ ...draft, lastVisitDate: event.target.value })} />{errors.lastVisitDate ? <small className="health-field-error">{errors.lastVisitDate}</small> : null}</label>
        <label><span>Follow-up reminder</span><select value={draft.followUpMonths ?? ''} onChange={event => setDraft({ ...draft, followUpMonths: event.target.value ? Number(event.target.value) : null })}><option value="">No automatic follow-up</option><option value="1">1 month</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option><option value="18">18 months</option><option value="24">24 months</option></select><small>Your reminder cadence, not medical advice.</small></label>
        <label className="wide"><span>Notes</span><textarea rows={4} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder="Office hours, parking, accessibility notes…" /></label>
      </div>
      <footer><div>{mode === 'edit' && editingProvider ? <button className="health-danger" onClick={() => { if (window.confirm(`Remove ${editingProvider.name}?`)) { removeHealthProvider(editingProvider.id); closeProvider(); } }}>Delete provider</button> : null}</div><div><button onClick={closeProvider}>Cancel</button><button className="primary" onClick={saveProvider}>Save provider</button></div></footer>
    </section></div> : null}

    {appointmentProvider ? <div className="health-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setAppointmentProvider(null); }}><section className="health-modal health-appointment-modal" role="dialog" aria-modal="true" aria-label="Add appointment">
      <header><div><span className="eyebrow">{appointmentProvider.type}</span><h2>Add appointment</h2><p>{appointmentProvider.name}{appointmentProvider.organization ? ` · ${appointmentProvider.organization}` : ''}</p></div><button onClick={() => setAppointmentProvider(null)} aria-label="Close">×</button></header>
      <form onSubmit={event => { event.preventDefault(); saveAppointment(event.currentTarget); }}><div className="health-form-grid">
        <label className="wide"><span>Appointment title</span><input name="title" defaultValue={`${appointmentProvider.type} · ${appointmentProvider.name}`} />{appointmentErrors.title ? <small className="health-field-error">{appointmentErrors.title}</small> : null}</label>
        <label><span>Type</span><select name="category" defaultValue={appointmentProvider.type.includes('Dent') ? 'Dental' : 'Medical'}><option>Appointment</option><option>Medical</option><option>Dental</option></select></label>
        <label><span>Who</span><select name="person" defaultValue={appointmentProvider.person}>{PEOPLE.map(person => <option key={person}>{person}</option>)}</select></label>
        <label><span>Date</span><input name="date" type="date" defaultValue={isoDate(new Date())} />{appointmentErrors.date ? <small className="health-field-error">{appointmentErrors.date}</small> : null}</label>
        <label><span>Time</span><input name="time" type="time" defaultValue="09:00" />{appointmentErrors.time ? <small className="health-field-error">{appointmentErrors.time}</small> : null}</label>
        <label className="wide"><span>Location</span><input name="location" defaultValue={appointmentProvider.address || appointmentProvider.organization} /></label>
        <label className="wide"><span>Notes</span><textarea name="notes" rows={4} defaultValue={`Provider: ${appointmentProvider.name}${appointmentProvider.phone ? ` · ${appointmentProvider.phone}` : ''}`} /></label>
      </div><footer><div /><div><button type="button" onClick={() => setAppointmentProvider(null)}>Cancel</button><button className="primary" type="submit">Save appointment</button></div></footer></form>
    </section></div> : null}
  </div>;
}
