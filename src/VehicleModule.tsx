import { useMemo, useState } from 'react';
import {
  addCaptureRecord,
  removeCaptureRecord,
  updateCaptureRecord,
  type CaptureRecord,
} from './localCaptureStore';
import {
  VEHICLE_FUEL_TYPES,
  VEHICLE_OWNERSHIP,
  VEHICLE_PEOPLE,
  VEHICLE_STATUSES,
  VEHICLE_TRANSMISSIONS,
  addVehicleProfile,
  removeVehicleProfile,
  updateVehicleProfile,
  type VehicleProfile,
  type VehicleProfileInput,
} from './vehicleProfileStore';

type VehicleEditor = { vehicle: VehicleProfile | null } | null;
type UpdateEditor = { record: CaptureRecord | null; vehicleId?: string } | null;

const UPDATE_TYPES = ['Mileage', 'Service', 'Repair', 'Fuel', 'Insurance', 'Registration', 'Tire change', 'Inspection', 'Recall', 'Other'] as const;
const EMPTY_VEHICLE: VehicleProfileInput = {
  nickname: '', year: String(new Date().getFullYear()), make: '', model: '', trim: '', status: 'Active', person: 'Family',
  vin: '', plate: '', color: '', fuelType: 'Gasoline', transmission: 'Automatic', odometer: '', purchaseDate: '', purchasePrice: '',
  ownership: 'Owned', insuranceProvider: '', insurancePolicy: '', insuranceExpiry: '', registrationExpiry: '', tireSize: '', notes: '',
};

const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const money = (value: string | undefined) => {
  const number = Number(value || 0);
  return Number.isFinite(number) && number ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(number) : '—';
};
const km = (value: string | undefined) => {
  const number = Number(value || 0);
  return Number.isFinite(number) && value ? `${new Intl.NumberFormat('en-CA').format(number)} km` : '—';
};
function formatDate(value: string | undefined) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
function daysUntil(value: string | undefined) {
  if (!value) return null;
  const target = new Date(`${value}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
function expiryTone(value: string | undefined) {
  const days = daysUntil(value);
  if (days == null) return 'neutral';
  if (days < 0) return 'danger';
  if (days <= 30) return 'warn';
  return 'good';
}
function vehicleLabel(vehicle: VehicleProfile) {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`;
}
function formValues(form: HTMLFormElement, existing: Record<string, string> = {}) {
  const values: Record<string, string> = { ...existing };
  for (const [key, value] of new FormData(form).entries()) values[key] = String(value);
  return values;
}

export default function VehicleModule({ vehicles, records }: { vehicles: VehicleProfile[]; records: CaptureRecord[] }) {
  const [vehicleEditor, setVehicleEditor] = useState<VehicleEditor>(null);
  const [vehicleDraft, setVehicleDraft] = useState<VehicleProfileInput>(EMPTY_VEHICLE);
  const [vehicleErrors, setVehicleErrors] = useState<Record<string, string>>({});
  const [updateEditor, setUpdateEditor] = useState<UpdateEditor>(null);
  const [updateErrors, setUpdateErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'all' | 'vehicles' | 'history'>('all');

  const updates = records.filter(record => record.kind === 'Vehicle update');
  const normalizedQuery = query.trim().toLowerCase();

  const matchingVehicles = useMemo(() => vehicles.filter(vehicle => {
    if (!normalizedQuery) return true;
    return [vehicle.nickname, vehicle.year, vehicle.make, vehicle.model, vehicle.trim, vehicle.vin, vehicle.plate, vehicle.color,
      vehicle.fuelType, vehicle.transmission, vehicle.person, vehicle.insuranceProvider, vehicle.insurancePolicy, vehicle.tireSize, vehicle.notes]
      .join(' ').toLowerCase().includes(normalizedQuery);
  }), [vehicles, normalizedQuery]);

  const matchingUpdates = useMemo(() => updates.filter(record => {
    if (!normalizedQuery) return true;
    const vehicle = vehicles.find(item => item.id === record.values.vehicleId);
    return [record.values.vehicle, vehicle?.nickname, vehicle ? vehicleLabel(vehicle) : '', record.values.updateType, record.values.date,
      record.values.odometer, record.values.cost, record.values.provider, record.values.nextServiceDate, record.values.nextServiceOdometer, record.values.notes]
      .join(' ').toLowerCase().includes(normalizedQuery);
  }), [updates, vehicles, normalizedQuery]);

  const activeVehicles = vehicles.filter(vehicle => vehicle.status === 'Active' || vehicle.status === 'Needs service');
  const needsService = vehicles.filter(vehicle => vehicle.status === 'Needs service').length;
  const expiringSoon = vehicles.filter(vehicle => {
    const insurance = daysUntil(vehicle.insuranceExpiry);
    const registration = daysUntil(vehicle.registrationExpiry);
    return (insurance != null && insurance <= 30) || (registration != null && registration <= 30);
  }).length;

  const latestUpdateFor = (vehicleId: string) => updates
    .filter(record => record.values.vehicleId === vehicleId)
    .slice()
    .sort((a, b) => (b.values.date || '').localeCompare(a.values.date || ''))[0];

  const nextServiceFor = (vehicle: VehicleProfile) => updates
    .filter(record => record.values.vehicleId === vehicle.id && (record.values.nextServiceDate || record.values.nextServiceOdometer))
    .slice()
    .sort((a, b) => (b.values.date || '').localeCompare(a.values.date || ''))[0];

  const openVehicle = (vehicle: VehicleProfile | null = null) => {
    setVehicleErrors({});
    setVehicleEditor({ vehicle });
    if (vehicle) {
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...values } = vehicle;
      setVehicleDraft(values);
    } else setVehicleDraft(EMPTY_VEHICLE);
  };

  const saveVehicle = () => {
    const result = vehicleEditor?.vehicle
      ? updateVehicleProfile(vehicleEditor.vehicle.id, vehicleDraft)
      : addVehicleProfile(vehicleDraft);
    if (!result.vehicle) {
      setVehicleErrors(result.validation.errors);
      return;
    }
    setVehicleErrors({});
    setVehicleEditor(null);
  };

  const deleteVehicle = (vehicle: VehicleProfile) => {
    if (!window.confirm(`Remove ${vehicle.nickname}? Service/update history will remain as historical records.`)) return;
    removeVehicleProfile(vehicle.id);
    setVehicleEditor(null);
  };

  const openUpdate = (vehicleId?: string, record: CaptureRecord | null = null) => {
    setUpdateErrors({});
    setUpdateEditor({ vehicleId: vehicleId || record?.values.vehicleId, record });
  };

  const saveUpdate = (form: HTMLFormElement) => {
    if (!updateEditor) return;
    const values = formValues(form, updateEditor.record?.values);
    const selectedVehicle = vehicles.find(vehicle => vehicle.id === values.vehicleId);
    values.vehicle = selectedVehicle ? selectedVehicle.nickname : values.vehicle || 'Vehicle';
    const result = updateEditor.record
      ? updateCaptureRecord(updateEditor.record.id, values)
      : addCaptureRecord('Vehicle update', values);
    if (!result.record) {
      setUpdateErrors(result.validation?.errors ?? { form: 'Unable to save vehicle update.' });
      return;
    }

    if (selectedVehicle && values.odometer) {
      const current = Number(selectedVehicle.odometer || 0);
      const incoming = Number(values.odometer);
      if (Number.isFinite(incoming) && incoming >= current) {
        const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...profile } = selectedVehicle;
        updateVehicleProfile(selectedVehicle.id, { ...profile, odometer: values.odometer });
      }
    }
    setUpdateErrors({});
    setUpdateEditor(null);
  };

  const deleteUpdate = (record: CaptureRecord) => {
    if (!window.confirm('Remove this vehicle history record?')) return;
    removeCaptureRecord(record.id);
    setUpdateEditor(null);
  };

  return <div className="stack vehicle-module">
    <header className="module-hero vehicle-hero">
      <span className="eyebrow">Family OS · Vehicles</span>
      <h1>Vehicles, mileage, documents and service history.</h1>
      <p>Keep reusable vehicle profiles separate from historical mileage, repairs, fuel, insurance and maintenance records.</p>
    </header>

    <section className="vehicle-summary-grid">
      <article className="panel vehicle-summary-card"><span>🚗</span><div><strong>{vehicles.length}</strong><small>Vehicle profiles</small></div></article>
      <article className="panel vehicle-summary-card"><span>●</span><div><strong>{activeVehicles.length}</strong><small>Active vehicles</small></div></article>
      <article className="panel vehicle-summary-card"><span>🔧</span><div><strong>{needsService}</strong><small>Need service</small></div></article>
      <article className="panel vehicle-summary-card"><span>📄</span><div><strong>{expiringSoon}</strong><small>Documents due ≤30d</small></div></article>
    </section>

    <section className="panel vehicle-search-panel">
      <label><span>Search vehicles and history</span><input data-vehicle-search value={query} onChange={event => setQuery(event.target.value)} placeholder="VIN, plate, make, model, service, shop, notes…" /></label>
      <div className="vehicle-view-switch" role="group" aria-label="Vehicle view">
        {(['all', 'vehicles', 'history'] as const).map(option => <button key={option} className={view === option ? 'active' : ''} onClick={() => setView(option)}>{option === 'all' ? 'All' : option === 'vehicles' ? 'Vehicles' : 'History'}</button>)}
      </div>
      <div><button className="primary" data-vehicle-add onClick={() => openVehicle()}>+ Vehicle</button><button data-vehicle-add-update onClick={() => openUpdate(vehicles[0]?.id)}>+ Service / update</button></div>
    </section>

    {(view === 'all' || view === 'vehicles') && <section className="panel vehicle-record-panel">
      <header><div><span className="eyebrow">Garage</span><h2>Vehicle profiles</h2><p>Ownership, VIN, plate, mileage, insurance, registration and key reference information.</p></div><button className="primary" data-vehicle-add onClick={() => openVehicle()}>+ Add vehicle</button></header>
      {matchingVehicles.length ? <div className="vehicle-card-grid">{matchingVehicles.map(vehicle => {
        const latest = latestUpdateFor(vehicle.id);
        const nextService = nextServiceFor(vehicle);
        const displayOdometer = latest?.values.odometer && Number(latest.values.odometer) > Number(vehicle.odometer || 0) ? latest.values.odometer : vehicle.odometer;
        const insuranceTone = expiryTone(vehicle.insuranceExpiry);
        const registrationTone = expiryTone(vehicle.registrationExpiry);
        return <article className={`vehicle-card vehicle-status-${vehicle.status.toLowerCase().replace(/\s+/g, '-')}`} key={vehicle.id} data-vehicle-card>
          <div className="vehicle-card-head"><span className="vehicle-card-icon">🚗</span><div><span className="eyebrow">{vehicle.status}</span><h3>{vehicle.nickname}</h3><small>{vehicleLabel(vehicle)}</small></div><button onClick={() => openVehicle(vehicle)}>Edit</button></div>
          <div className="vehicle-identifiers">{vehicle.plate && <span>Plate · <strong>{vehicle.plate}</strong></span>}{vehicle.vin && <span>VIN · <strong>{vehicle.vin}</strong></span>}</div>
          <div className="vehicle-kpis"><article><small>Odometer</small><strong>{km(displayOdometer)}</strong></article><article><small>Fuel</small><strong>{vehicle.fuelType}</strong></article><article><small>Owner</small><strong>{vehicle.person}</strong></article></div>
          <div className="vehicle-doc-lines"><span className={`vehicle-date vehicle-date-${insuranceTone}`}>Insurance · {formatDate(vehicle.insuranceExpiry)}</span><span className={`vehicle-date vehicle-date-${registrationTone}`}>Registration · {formatDate(vehicle.registrationExpiry)}</span>{vehicle.insuranceProvider && <span>{vehicle.insuranceProvider}{vehicle.insurancePolicy ? ` · ${vehicle.insurancePolicy}` : ''}</span>}</div>
          {nextService && <div className="vehicle-next-service"><strong>Next service</strong><span>{nextService.values.nextServiceDate ? formatDate(nextService.values.nextServiceDate) : 'Date not set'}{nextService.values.nextServiceOdometer ? ` · ${km(nextService.values.nextServiceOdometer)}` : ''}</span></div>}
          <div className="vehicle-card-actions"><button data-vehicle-card-update onClick={() => openUpdate(vehicle.id)}>+ Service / update</button><button onClick={() => openVehicle(vehicle)}>Edit profile</button></div>
        </article>;
      })}</div> : <div className="vehicle-empty"><span>🚗</span><div><strong>No matching vehicles.</strong><small>Add your first vehicle or clear the search.</small></div></div>}
    </section>}

    {(view === 'all' || view === 'history') && <section className="panel vehicle-record-panel vehicle-history-panel">
      <header><div><span className="eyebrow">History</span><h2>Service & vehicle updates</h2><p>Mileage, maintenance, repair, fuel, tires, insurance, registration and inspection history.</p></div><button className="primary" data-vehicle-add-update onClick={() => openUpdate(vehicles[0]?.id)}>+ Add update</button></header>
      {matchingUpdates.length ? <div className="vehicle-history-list">{matchingUpdates.map(record => {
        const linkedVehicle = vehicles.find(vehicle => vehicle.id === record.values.vehicleId);
        return <article className="vehicle-history-row" key={record.id} data-vehicle-history-row>
          <span className="vehicle-history-icon">{record.values.updateType === 'Fuel' ? '⛽' : record.values.updateType === 'Repair' ? '🛠' : record.values.updateType === 'Mileage' ? '◉' : '🔧'}</span>
          <div><strong>{record.values.updateType || 'Update'} · {linkedVehicle?.nickname || record.values.vehicle || 'Vehicle'}</strong><small>{formatDate(record.values.date)}{record.values.odometer ? ` · ${km(record.values.odometer)}` : ''}{record.values.provider ? ` · ${record.values.provider}` : ''}</small>{record.values.notes && <p>{record.values.notes}</p>}</div>
          <div className="vehicle-history-side">{record.values.cost && <b>{money(record.values.cost)}</b>}<button onClick={() => openUpdate(undefined, record)}>Edit</button></div>
        </article>;
      })}</div> : <p className="note">No matching service or vehicle history records.</p>}
    </section>}

    {vehicleEditor && <div className="vehicle-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setVehicleEditor(null); }}><section className="vehicle-modal" role="dialog" aria-modal="true" data-vehicle-modal>
      <header><div><span className="eyebrow">{vehicleEditor.vehicle ? 'Edit vehicle profile' : 'New vehicle profile'}</span><h2>{vehicleEditor.vehicle?.nickname || 'Add vehicle'}</h2><p>Store durable identifying, ownership and document information.</p></div><button onClick={() => setVehicleEditor(null)} aria-label="Close">×</button></header>
      <div className="vehicle-form-grid">
        <label><span>Vehicle name</span><input name="nickname" value={vehicleDraft.nickname} onChange={event => setVehicleDraft({ ...vehicleDraft, nickname: event.target.value })} placeholder="Family Jetta" />{vehicleErrors.nickname && <small className="vehicle-field-error">{vehicleErrors.nickname}</small>}</label>
        <label><span>Status</span><select value={vehicleDraft.status} onChange={event => setVehicleDraft({ ...vehicleDraft, status: event.target.value as VehicleProfileInput['status'] })}>{VEHICLE_STATUSES.map(value => <option key={value}>{value}</option>)}</select></label>
        <label><span>Year</span><input value={vehicleDraft.year} onChange={event => setVehicleDraft({ ...vehicleDraft, year: event.target.value })} inputMode="numeric" />{vehicleErrors.year && <small className="vehicle-field-error">{vehicleErrors.year}</small>}</label>
        <label><span>Make</span><input value={vehicleDraft.make} onChange={event => setVehicleDraft({ ...vehicleDraft, make: event.target.value })} placeholder="Volkswagen" />{vehicleErrors.make && <small className="vehicle-field-error">{vehicleErrors.make}</small>}</label>
        <label><span>Model</span><input value={vehicleDraft.model} onChange={event => setVehicleDraft({ ...vehicleDraft, model: event.target.value })} placeholder="Jetta" />{vehicleErrors.model && <small className="vehicle-field-error">{vehicleErrors.model}</small>}</label>
        <label><span>Trim</span><input value={vehicleDraft.trim} onChange={event => setVehicleDraft({ ...vehicleDraft, trim: event.target.value })} placeholder="TDI Highline" /></label>
        <label><span>Primary driver / owner</span><select value={vehicleDraft.person} onChange={event => setVehicleDraft({ ...vehicleDraft, person: event.target.value as VehicleProfileInput['person'] })}>{VEHICLE_PEOPLE.map(value => <option key={value}>{value}</option>)}</select></label>
        <label><span>Ownership</span><select value={vehicleDraft.ownership} onChange={event => setVehicleDraft({ ...vehicleDraft, ownership: event.target.value as VehicleProfileInput['ownership'] })}>{VEHICLE_OWNERSHIP.map(value => <option key={value}>{value}</option>)}</select></label>
        <label><span>VIN</span><input data-vehicle-vin value={vehicleDraft.vin} onChange={event => setVehicleDraft({ ...vehicleDraft, vin: event.target.value })} placeholder="17-character VIN" />{vehicleErrors.vin && <small className="vehicle-field-error">{vehicleErrors.vin}</small>}</label>
        <label><span>Plate</span><input value={vehicleDraft.plate} onChange={event => setVehicleDraft({ ...vehicleDraft, plate: event.target.value })} placeholder="ABC123" /></label>
        <label><span>Colour</span><input value={vehicleDraft.color} onChange={event => setVehicleDraft({ ...vehicleDraft, color: event.target.value })} /></label>
        <label><span>Tire size</span><input value={vehicleDraft.tireSize} onChange={event => setVehicleDraft({ ...vehicleDraft, tireSize: event.target.value })} placeholder="205/55R16" /></label>
        <label><span>Fuel type</span><select value={vehicleDraft.fuelType} onChange={event => setVehicleDraft({ ...vehicleDraft, fuelType: event.target.value as VehicleProfileInput['fuelType'] })}>{VEHICLE_FUEL_TYPES.map(value => <option key={value}>{value}</option>)}</select></label>
        <label><span>Transmission</span><select value={vehicleDraft.transmission} onChange={event => setVehicleDraft({ ...vehicleDraft, transmission: event.target.value as VehicleProfileInput['transmission'] })}>{VEHICLE_TRANSMISSIONS.map(value => <option key={value}>{value}</option>)}</select></label>
        <label><span>Odometer (km)</span><input value={vehicleDraft.odometer} onChange={event => setVehicleDraft({ ...vehicleDraft, odometer: event.target.value })} type="number" min="0" />{vehicleErrors.odometer && <small className="vehicle-field-error">{vehicleErrors.odometer}</small>}</label>
        <label><span>Purchase date</span><input value={vehicleDraft.purchaseDate} onChange={event => setVehicleDraft({ ...vehicleDraft, purchaseDate: event.target.value })} type="date" />{vehicleErrors.purchaseDate && <small className="vehicle-field-error">{vehicleErrors.purchaseDate}</small>}</label>
        <label><span>Purchase price</span><input value={vehicleDraft.purchasePrice} onChange={event => setVehicleDraft({ ...vehicleDraft, purchasePrice: event.target.value })} type="number" min="0" step="0.01" />{vehicleErrors.purchasePrice && <small className="vehicle-field-error">{vehicleErrors.purchasePrice}</small>}</label>
        <label><span>Insurance provider</span><input value={vehicleDraft.insuranceProvider} onChange={event => setVehicleDraft({ ...vehicleDraft, insuranceProvider: event.target.value })} /></label>
        <label><span>Policy #</span><input value={vehicleDraft.insurancePolicy} onChange={event => setVehicleDraft({ ...vehicleDraft, insurancePolicy: event.target.value })} /></label>
        <label><span>Insurance expiry</span><input value={vehicleDraft.insuranceExpiry} onChange={event => setVehicleDraft({ ...vehicleDraft, insuranceExpiry: event.target.value })} type="date" />{vehicleErrors.insuranceExpiry && <small className="vehicle-field-error">{vehicleErrors.insuranceExpiry}</small>}</label>
        <label><span>Registration expiry</span><input value={vehicleDraft.registrationExpiry} onChange={event => setVehicleDraft({ ...vehicleDraft, registrationExpiry: event.target.value })} type="date" />{vehicleErrors.registrationExpiry && <small className="vehicle-field-error">{vehicleErrors.registrationExpiry}</small>}</label>
        <label className="wide"><span>Notes</span><textarea rows={4} value={vehicleDraft.notes} onChange={event => setVehicleDraft({ ...vehicleDraft, notes: event.target.value })} placeholder="Winter tire location, financing, roadside assistance, quirks, etc." /></label>
      </div>
      <footer><div>{vehicleEditor.vehicle && <button className="vehicle-danger" onClick={() => deleteVehicle(vehicleEditor.vehicle!)}>Delete vehicle</button>}</div><div><button onClick={() => setVehicleEditor(null)}>Cancel</button><button className="primary" data-vehicle-save onClick={saveVehicle}>Save vehicle</button></div></footer>
    </section></div>}

    {updateEditor && <div className="vehicle-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setUpdateEditor(null); }}><section className="vehicle-modal" role="dialog" aria-modal="true" data-vehicle-update-modal>
      <header><div><span className="eyebrow">{updateEditor.record ? 'Edit vehicle history' : 'New vehicle history'}</span><h2>Service / update</h2><p>Historical entries remain separate from the vehicle profile.</p></div><button onClick={() => setUpdateEditor(null)} aria-label="Close">×</button></header>
      <form onSubmit={event => { event.preventDefault(); saveUpdate(event.currentTarget); }}>
        {updateErrors.form && <div className="vehicle-error-summary">{updateErrors.form}</div>}
        <div className="vehicle-form-grid">
          <label><span>Vehicle</span><select name="vehicleId" defaultValue={updateEditor.record?.values.vehicleId || updateEditor.vehicleId || vehicles[0]?.id || ''}>{vehicles.length ? vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.nickname} · {vehicle.year} {vehicle.make} {vehicle.model}</option>) : <option value="">No vehicle profile</option>}</select>{updateErrors.vehicle && <small className="vehicle-field-error">{updateErrors.vehicle}</small>}</label>
          <label><span>Update type</span><select name="updateType" defaultValue={updateEditor.record?.values.updateType || 'Service'}>{UPDATE_TYPES.map(value => <option key={value}>{value}</option>)}</select></label>
          <label><span>Date</span><input name="date" type="date" defaultValue={updateEditor.record?.values.date || isoDate(new Date())} />{updateErrors.date && <small className="vehicle-field-error">{updateErrors.date}</small>}</label>
          <label><span>Odometer (km)</span><input name="odometer" type="number" min="0" defaultValue={updateEditor.record?.values.odometer || vehicles.find(vehicle => vehicle.id === (updateEditor.vehicleId || updateEditor.record?.values.vehicleId))?.odometer || ''} /></label>
          <label><span>Cost</span><input name="cost" type="number" min="0" step="0.01" defaultValue={updateEditor.record?.values.cost || ''} /></label>
          <label><span>Shop / provider</span><input name="provider" defaultValue={updateEditor.record?.values.provider || ''} placeholder="Dealer, mechanic, gas station…" /></label>
          <label><span>Next service date</span><input name="nextServiceDate" type="date" defaultValue={updateEditor.record?.values.nextServiceDate || ''} /></label>
          <label><span>Next service odometer</span><input name="nextServiceOdometer" type="number" min="0" defaultValue={updateEditor.record?.values.nextServiceOdometer || ''} /></label>
          <label className="wide"><span>Details</span><textarea name="notes" rows={5} defaultValue={updateEditor.record?.values.notes || ''} placeholder="Work completed, parts, fuel litres, inspection result, tire location, next interval…" /></label>
        </div>
        <footer><div>{updateEditor.record && <button type="button" className="vehicle-danger" onClick={() => deleteUpdate(updateEditor.record!)}>Delete update</button>}</div><div><button type="button" onClick={() => setUpdateEditor(null)}>Cancel</button><button className="primary" type="submit" data-vehicle-save-update>{updateEditor.record ? 'Save changes' : 'Save update'}</button></div></footer>
      </form>
    </section></div>}
  </div>;
}
