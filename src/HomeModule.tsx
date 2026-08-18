import { useMemo, useState } from 'react';
import {
  APPLIANCE_STATUSES,
  APPLIANCE_TYPES,
  HOME_AREAS,
  HOME_MAINTENANCE_REPEATS,
  HOME_MAINTENANCE_STATUSES,
  HOME_SAFETY_STATUSES,
  HOME_SAFETY_TYPES,
  addCaptureRecord,
  removeCaptureRecord,
  updateCaptureRecord,
  type CaptureRecord,
} from './localCaptureStore';

type HomeKind = 'Home maintenance' | 'Safety record' | 'Appliance';
type HomeEditor = { kind: HomeKind; record: CaptureRecord | null } | null;
type HomeScope = 'All' | 'Maintenance' | 'Safety' | 'Appliances';

const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function formatDate(value: string | undefined) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function safeAmount(value: string | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function money(value: string | undefined) {
  if (!value) return '';
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(safeAmount(value));
}

function daysUntil(value: string | undefined) {
  if (!value) return null;
  const target = new Date(`${value}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function dueLabel(value: string | undefined) {
  const days = daysUntil(value);
  if (days == null) return { label: 'No due date', tone: 'neutral' } as const;
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, tone: 'danger' } as const;
  if (days === 0) return { label: 'Due today', tone: 'warning' } as const;
  if (days <= 30) return { label: `Due in ${days}d`, tone: 'warning' } as const;
  return { label: `Due ${formatDate(value)}`, tone: 'ok' } as const;
}

function warrantyLabel(value: string | undefined) {
  const days = daysUntil(value);
  if (days == null) return { label: 'Warranty not recorded', tone: 'neutral' } as const;
  if (days < 0) return { label: 'Warranty expired', tone: 'neutral' } as const;
  if (days <= 90) return { label: `Warranty ends in ${days}d`, tone: 'warning' } as const;
  return { label: `Warranty to ${formatDate(value)}`, tone: 'ok' } as const;
}

function valuesFromForm(form: HTMLFormElement, existing?: Record<string, string>) {
  const values: Record<string, string> = { ...(existing ?? {}) };
  for (const [key, value] of new FormData(form).entries()) {
    if (value instanceof File) {
      if (value.name) values[key] = value.name;
    } else {
      values[key] = String(value);
    }
  }
  return values;
}

function searchable(record: CaptureRecord) {
  return `${record.kind} ${Object.values(record.values).join(' ')}`.toLowerCase();
}

function maintenanceStatus(record: CaptureRecord) {
  if (record.values.status === 'Completed') return { label: 'Completed', tone: 'complete' } as const;
  const due = dueLabel(record.values.date);
  if (due.tone === 'danger') return { label: due.label, tone: 'danger' } as const;
  if (due.tone === 'warning') return { label: due.label, tone: 'warning' } as const;
  return { label: record.values.status || 'Scheduled', tone: 'ok' } as const;
}

function safetyStatus(record: CaptureRecord) {
  if (record.values.status === 'Needs attention') return { label: 'Needs attention', tone: 'danger' } as const;
  const due = dueLabel(record.values.nextDue);
  if (due.tone === 'danger') return { label: `Check ${due.label}`, tone: 'danger' } as const;
  if (record.values.status === 'Due soon' || due.tone === 'warning') return { label: due.tone === 'warning' ? due.label : 'Due soon', tone: 'warning' } as const;
  if (record.values.status === 'Replaced') return { label: 'Replaced', tone: 'neutral' } as const;
  return { label: 'OK', tone: 'ok' } as const;
}

export default function HomeModule({ records }: { records: CaptureRecord[] }) {
  const [editor, setEditor] = useState<HomeEditor>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<HomeScope>('All');

  const maintenance = records.filter(record => record.kind === 'Home maintenance');
  const safety = records.filter(record => record.kind === 'Safety record');
  const appliances = records.filter(record => record.kind === 'Appliance');

  const normalizedQuery = query.trim().toLowerCase();
  const matches = (record: CaptureRecord) => !normalizedQuery || searchable(record).includes(normalizedQuery);

  const filteredMaintenance = useMemo(() => maintenance.filter(matches).sort((a, b) => {
    const completed = Number(a.values.status === 'Completed') - Number(b.values.status === 'Completed');
    return completed || (a.values.date || '').localeCompare(b.values.date || '');
  }), [maintenance, normalizedQuery]);
  const filteredSafety = useMemo(() => safety.filter(matches).sort((a, b) => (a.values.nextDue || '9999').localeCompare(b.values.nextDue || '9999')), [safety, normalizedQuery]);
  const filteredAppliances = useMemo(() => appliances.filter(matches).sort((a, b) => (a.values.appliance || '').localeCompare(b.values.appliance || '')), [appliances, normalizedQuery]);

  const maintenanceDue = maintenance.filter(record => record.values.status !== 'Completed' && (daysUntil(record.values.date) ?? 9999) <= 30).length;
  const safetyAttention = safety.filter(record => safetyStatus(record).tone === 'danger' || safetyStatus(record).tone === 'warning').length;
  const warrantySoon = appliances.filter(record => {
    const days = daysUntil(record.values.warrantyEnd);
    return days != null && days >= 0 && days <= 90;
  }).length;

  const openEditor = (kind: HomeKind, record: CaptureRecord | null = null) => {
    setErrors({});
    setEditor({ kind, record });
  };

  const saveEditor = (form: HTMLFormElement) => {
    if (!editor) return;
    const values = valuesFromForm(form, editor.record?.values);
    const result = editor.record
      ? updateCaptureRecord(editor.record.id, values)
      : addCaptureRecord(editor.kind, values);
    if (!result.record) {
      setErrors(result.validation?.errors ?? { form: 'Unable to save this home record.' });
      return;
    }
    setErrors({});
    setEditor(null);
  };

  const deleteRecord = (record: CaptureRecord) => {
    const label = record.kind === 'Home maintenance' ? record.values.task : record.kind === 'Safety record' ? record.values.item : record.values.appliance;
    if (!window.confirm(`Remove ${label || 'this home record'}?`)) return;
    removeCaptureRecord(record.id);
    if (editor?.record?.id === record.id) setEditor(null);
  };

  const completeMaintenance = (record: CaptureRecord) => {
    updateCaptureRecord(record.id, { ...record.values, status: 'Completed', completedDate: isoDate(new Date()) });
  };

  const checkSafetyToday = (record: CaptureRecord) => {
    updateCaptureRecord(record.id, { ...record.values, status: 'OK', lastChecked: isoDate(new Date()) });
  };

  const showMaintenance = scope === 'All' || scope === 'Maintenance';
  const showSafety = scope === 'All' || scope === 'Safety';
  const showAppliances = scope === 'All' || scope === 'Appliances';

  return <div className="stack home-module">
    <header className="module-hero home-hero">
      <span className="eyebrow">Family OS · Home</span>
      <h1>Maintenance, safety and appliances.</h1>
      <p>Keep the practical details of the home searchable: what needs work, what protects the household, and the model, warranty and service information for major appliances.</p>
    </header>

    <section className="home-summary-grid">
      <article className="panel home-summary-card"><span>🔧</span><div><strong>{maintenance.length}</strong><small>Maintenance records</small></div><em>{maintenanceDue} due soon</em></article>
      <article className="panel home-summary-card"><span>🧯</span><div><strong>{safety.length}</strong><small>Safety records</small></div><em>{safetyAttention} need attention</em></article>
      <article className="panel home-summary-card"><span>🔌</span><div><strong>{appliances.length}</strong><small>Appliances</small></div><em>{warrantySoon} warranties ≤90d</em></article>
    </section>

    <section className="panel home-search-panel">
      <label><span>Search Home</span><input data-home-search value={query} onChange={event => setQuery(event.target.value)} placeholder="Search task, room, serial, model, contractor, safety item…" /></label>
      <label><span>Show</span><select data-home-scope value={scope} onChange={event => setScope(event.target.value as HomeScope)}><option>All</option><option>Maintenance</option><option>Safety</option><option>Appliances</option></select></label>
      <div><button onClick={() => openEditor('Home maintenance')}>+ Maintenance</button><button onClick={() => openEditor('Safety record')}>+ Safety</button><button onClick={() => openEditor('Appliance')}>+ Appliance</button></div>
    </section>

    {showMaintenance ? <section className="panel home-record-panel" data-home-maintenance-section>
      <header><div><span className="eyebrow">Household upkeep</span><h2>Maintenance</h2><p>Recurring work, one-time repairs, contractors, cost and completion history.</p></div><button className="primary" data-home-add-maintenance onClick={() => openEditor('Home maintenance')}>+ Add maintenance</button></header>
      {filteredMaintenance.length ? <div className="home-record-list">{filteredMaintenance.map(record => {
        const status = maintenanceStatus(record);
        return <article className="home-record-row" key={record.id} data-home-maintenance-row>
          <span className="home-record-icon">🔧</span>
          <div className="home-record-main"><div><span className={`home-status home-status-${status.tone}`}>{status.label}</span><h3>{record.values.task}</h3></div><small>{record.values.area || 'Whole home'} · {record.values.repeat || 'No repeat'}{record.values.provider ? ` · ${record.values.provider}` : ''}</small><span>{record.values.status === 'Completed' ? `Completed ${formatDate(record.values.completedDate || record.values.date)}` : `Due ${formatDate(record.values.date)}`}{record.values.cost ? ` · ${money(record.values.cost)}` : ''}</span>{record.values.notes ? <p>{record.values.notes}</p> : null}</div>
          <div className="home-row-actions">{record.values.status !== 'Completed' ? <button className="home-positive" onClick={() => completeMaintenance(record)}>✓ Complete</button> : null}<button onClick={() => openEditor('Home maintenance', record)}>Edit</button><button className="home-remove" onClick={() => deleteRecord(record)}>Remove</button></div>
        </article>;
      })}</div> : <div className="home-empty"><span>🔧</span><div><strong>No maintenance records found.</strong><small>Add a task or change your search.</small></div></div>}
    </section> : null}

    {showSafety ? <section className="panel home-record-panel" data-home-safety-section>
      <header><div><span className="eyebrow">Household protection</span><h2>Safety</h2><p>Smoke alarms, CO alarms, extinguishers, emergency kits and other checks.</p></div><button className="primary" data-home-add-safety onClick={() => openEditor('Safety record')}>+ Add safety item</button></header>
      {filteredSafety.length ? <div className="home-safety-grid">{filteredSafety.map(record => {
        const status = safetyStatus(record);
        return <article className="home-safety-card" key={record.id} data-home-safety-row>
          <div className="home-safety-head"><span>🧯</span><div><span className={`home-status home-status-${status.tone}`}>{status.label}</span><h3>{record.values.item}</h3><small>{record.values.safetyType} · {record.values.location}</small></div></div>
          <div className="home-safety-dates"><span><small>Last checked</small><strong>{formatDate(record.values.lastChecked)}</strong></span><span><small>Next due</small><strong>{formatDate(record.values.nextDue)}</strong></span></div>
          {record.values.model ? <p>Identifier · {record.values.model}</p> : null}{record.values.notes ? <p>{record.values.notes}</p> : null}
          <div className="home-row-actions"><button className="home-positive" onClick={() => checkSafetyToday(record)}>✓ Checked today</button><button onClick={() => openEditor('Safety record', record)}>Edit</button><button className="home-remove" onClick={() => deleteRecord(record)}>Remove</button></div>
        </article>;
      })}</div> : <div className="home-empty"><span>🧯</span><div><strong>No safety records found.</strong><small>Add a safety item or change your search.</small></div></div>}
    </section> : null}

    {showAppliances ? <section className="panel home-record-panel" data-home-appliance-section>
      <header><div><span className="eyebrow">Equipment inventory</span><h2>Appliances</h2><p>Brand, model, serial number, purchase details, warranty, receipts, manuals and service contacts.</p></div><button className="primary" data-home-add-appliance onClick={() => openEditor('Appliance')}>+ Add appliance</button></header>
      {filteredAppliances.length ? <div className="appliance-grid">{filteredAppliances.map(record => {
        const warranty = warrantyLabel(record.values.warrantyEnd);
        return <article className="appliance-card" key={record.id} data-home-appliance-row>
          <div className="appliance-head"><span>🔌</span><div><span className={`home-status home-status-${record.values.status === 'Needs service' ? 'danger' : record.values.status === 'Retired' ? 'neutral' : 'ok'}`}>{record.values.status || 'Active'}</span><h3>{record.values.appliance}</h3><small>{record.values.applianceType || 'Appliance'} · {record.values.location}</small></div></div>
          <div className="appliance-identity"><span><small>Brand</small><strong>{record.values.brand || '—'}</strong></span><span><small>Model</small><strong>{record.values.model || '—'}</strong></span><span><small>Serial</small><strong>{record.values.serial || '—'}</strong></span></div>
          <div className={`appliance-warranty home-status-${warranty.tone}`}><strong>{warranty.label}</strong><small>Purchased {formatDate(record.values.purchaseDate)}{record.values.retailer ? ` · ${record.values.retailer}` : ''}{record.values.cost ? ` · ${money(record.values.cost)}` : ''}</small></div>
          <div className="appliance-links">{record.values.receipt ? <span>🧾 {record.values.receipt}</span> : null}{record.values.manual ? <span>📘 {record.values.manual}</span> : null}{record.values.serviceProvider ? <span>🔧 {record.values.serviceProvider}{record.values.servicePhone ? ` · ${record.values.servicePhone}` : ''}</span> : null}</div>
          {record.values.notes ? <p>{record.values.notes}</p> : null}
          <div className="home-row-actions"><button onClick={() => openEditor('Appliance', record)}>Edit</button><button className="home-remove" onClick={() => deleteRecord(record)}>Remove</button></div>
        </article>;
      })}</div> : <div className="home-empty"><span>🔌</span><div><strong>No appliances found.</strong><small>Add an appliance or change your search.</small></div></div>}
    </section> : null}

    {editor ? <div className="home-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setEditor(null); }}><section className="home-modal" role="dialog" aria-modal="true" data-home-modal>
      <header><div><span className="eyebrow">{editor.record ? 'Edit local home record' : 'New local home record'}</span><h2>{editor.kind === 'Home maintenance' ? 'Maintenance' : editor.kind === 'Safety record' ? 'Safety' : 'Appliance'}</h2><p>{editor.kind === 'Home maintenance' ? 'Track the task, due date, recurrence and service details.' : editor.kind === 'Safety record' ? 'Keep the last check, next due date and current safety status together.' : 'Save the identifying, warranty and service information you will need later.'}</p></div><button onClick={() => setEditor(null)} aria-label="Close">×</button></header>
      <form onSubmit={event => { event.preventDefault(); saveEditor(event.currentTarget); }}>
        {errors.form ? <div className="home-error-summary">{errors.form}</div> : null}
        {editor.kind === 'Home maintenance' ? <div className="home-form-grid">
          <label><span>Task</span><input name="task" defaultValue={editor.record?.values.task || ''} placeholder="Change furnace filter" />{errors.task ? <small className="home-field-error">{errors.task}</small> : null}</label>
          <label><span>Area</span><select name="area" defaultValue={editor.record?.values.area || 'Whole home'}>{HOME_AREAS.map(area => <option key={area}>{area}</option>)}</select></label>
          <label><span>Due / service date</span><input name="date" type="date" defaultValue={editor.record?.values.date || isoDate(new Date())} />{errors.date ? <small className="home-field-error">{errors.date}</small> : null}</label>
          <label><span>Repeat</span><select name="repeat" defaultValue={editor.record?.values.repeat || 'No repeat'}>{HOME_MAINTENANCE_REPEATS.map(value => <option key={value}>{value}</option>)}</select></label>
          <label><span>Status</span><select name="status" defaultValue={editor.record?.values.status || 'Scheduled'}>{HOME_MAINTENANCE_STATUSES.map(value => <option key={value}>{value}</option>)}</select></label>
          <label><span>Completed date</span><input name="completedDate" type="date" defaultValue={editor.record?.values.completedDate || ''} /></label>
          <label><span>Provider / contractor</span><input name="provider" defaultValue={editor.record?.values.provider || ''} placeholder="Optional" /></label>
          <label><span>Cost</span><input name="cost" type="number" step="0.01" min="0" defaultValue={editor.record?.values.cost || ''} placeholder="0.00" /></label>
          <label className="wide"><span>Details</span><textarea name="notes" rows={4} defaultValue={editor.record?.values.notes || ''} placeholder="Filter size, parts, work completed, contractor notes…" /></label>
        </div> : editor.kind === 'Safety record' ? <div className="home-form-grid">
          <label><span>Safety item</span><input name="item" defaultValue={editor.record?.values.item || ''} placeholder="Upstairs smoke alarm" />{errors.item ? <small className="home-field-error">{errors.item}</small> : null}</label>
          <label><span>Type</span><select name="safetyType" defaultValue={editor.record?.values.safetyType || 'Smoke alarm'}>{HOME_SAFETY_TYPES.map(value => <option key={value}>{value}</option>)}</select></label>
          <label><span>Location</span><input name="location" defaultValue={editor.record?.values.location || ''} placeholder="Second-floor hallway" />{errors.location ? <small className="home-field-error">{errors.location}</small> : null}</label>
          <label><span>Status</span><select name="status" defaultValue={editor.record?.values.status || 'OK'}>{HOME_SAFETY_STATUSES.map(value => <option key={value}>{value}</option>)}</select></label>
          <label><span>Last checked</span><input name="lastChecked" type="date" defaultValue={editor.record?.values.lastChecked || isoDate(new Date())} /></label>
          <label><span>Next due</span><input name="nextDue" type="date" defaultValue={editor.record?.values.nextDue || ''} /></label>
          <label className="wide"><span>Model / identifier / expiry</span><input name="model" defaultValue={editor.record?.values.model || ''} placeholder="Optional model, serial, extinguisher expiry…" /></label>
          <label className="wide"><span>Notes</span><textarea name="notes" rows={4} defaultValue={editor.record?.values.notes || ''} placeholder="Battery changed, alarm test result, replacement instructions…" /></label>
        </div> : <div className="home-form-grid">
          <label><span>Appliance name</span><input name="appliance" defaultValue={editor.record?.values.appliance || ''} placeholder="Kitchen refrigerator" />{errors.appliance ? <small className="home-field-error">{errors.appliance}</small> : null}</label>
          <label><span>Type</span><select name="applianceType" defaultValue={editor.record?.values.applianceType || 'Refrigerator'}>{APPLIANCE_TYPES.map(value => <option key={value}>{value}</option>)}</select></label>
          <label><span>Location</span><input name="location" defaultValue={editor.record?.values.location || ''} placeholder="Kitchen" />{errors.location ? <small className="home-field-error">{errors.location}</small> : null}</label>
          <label><span>Status</span><select name="status" defaultValue={editor.record?.values.status || 'Active'}>{APPLIANCE_STATUSES.map(value => <option key={value}>{value}</option>)}</select></label>
          <label><span>Brand</span><input name="brand" defaultValue={editor.record?.values.brand || ''} placeholder="Samsung" /></label>
          <label><span>Model</span><input name="model" defaultValue={editor.record?.values.model || ''} placeholder="Model number" /></label>
          <label><span>Serial number</span><input name="serial" defaultValue={editor.record?.values.serial || ''} placeholder="Serial number" /></label>
          <label><span>Purchase date</span><input name="purchaseDate" type="date" defaultValue={editor.record?.values.purchaseDate || ''} /></label>
          <label><span>Warranty ends</span><input name="warrantyEnd" type="date" defaultValue={editor.record?.values.warrantyEnd || ''} /></label>
          <label><span>Retailer</span><input name="retailer" defaultValue={editor.record?.values.retailer || ''} placeholder="Store / supplier" /></label>
          <label><span>Purchase cost</span><input name="cost" type="number" step="0.01" min="0" defaultValue={editor.record?.values.cost || ''} placeholder="0.00" /></label>
          <label><span>Service provider</span><input name="serviceProvider" defaultValue={editor.record?.values.serviceProvider || ''} placeholder="Repair company" /></label>
          <label><span>Service phone</span><input name="servicePhone" defaultValue={editor.record?.values.servicePhone || ''} placeholder="Phone" /></label>
          <label className="wide"><span>Receipt image / PDF</span><input name="receipt" type="file" accept="image/*,application/pdf" /><small>{editor.record?.values.receipt ? `Current file name: ${editor.record.values.receipt}` : 'For now only the local file name is retained.'}</small></label>
          <label className="wide"><span>Manual / document reference</span><input name="manual" defaultValue={editor.record?.values.manual || ''} placeholder="Manual URL, document name or future vault reference" /></label>
          <label className="wide"><span>Notes</span><textarea name="notes" rows={4} defaultValue={editor.record?.values.notes || ''} placeholder="Filter size, installation details, parts, settings, service history…" /></label>
        </div>}
        <footer><div>{editor.record ? <button type="button" className="home-danger" onClick={() => deleteRecord(editor.record!)}>Delete record</button> : null}</div><div><button type="button" onClick={() => setEditor(null)}>Cancel</button><button className="primary" type="submit">{editor.record ? 'Save changes' : 'Save record'}</button></div></footer>
      </form>
    </section></div> : null}
  </div>;
}
