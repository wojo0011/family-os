import { useMemo, useState } from 'react';
import { addCaptureRecord, removeCaptureRecord, updateCaptureRecord, type CaptureRecord } from './localCaptureStore';
import {
  PET_PEOPLE, PET_SEXES, PET_SPECIES, PET_STATUSES,
  addPetProfile, removePetProfile, updatePetProfile,
  type PetProfile, type PetProfileInput,
} from './petProfileStore';

type PetEditor = { pet: PetProfile | null } | null;
type RecordEditor = { record: CaptureRecord | null; petId?: string } | null;
const RECORD_TYPES = ['Vet appointment', 'Vaccination', 'Medication', 'Grooming', 'Weight', 'Birthday', 'Adoption day', 'Note'] as const;
const EMPTY_PET: PetProfileInput = {
  name: '', species: 'Dog', breed: '', status: 'Active', sex: 'Unknown', person: 'Family', birthday: '', adoptionDate: '', color: '',
  weight: '', microchip: '', license: '', vetName: '', vetPhone: '', insuranceProvider: '', insurancePolicy: '', insuranceExpiry: '',
  allergies: '', conditions: '', notes: '',
};

const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function formatDate(value: string | undefined) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
function daysUntil(value: string | undefined) {
  if (!value) return null;
  const target = new Date(`${value}T12:00:00`);
  const today = new Date(); today.setHours(12, 0, 0, 0);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
function dateTone(value: string | undefined) {
  const days = daysUntil(value);
  if (days == null) return 'neutral';
  if (days < 0) return 'danger';
  if (days <= 30) return 'warn';
  return 'good';
}
function money(value: string | undefined) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number ? new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(number) : '';
}
function formValues(form: HTMLFormElement, existing: Record<string, string> = {}) {
  const values = { ...existing };
  for (const [key, value] of new FormData(form).entries()) values[key] = String(value);
  return values;
}

export default function PetModule({ pets, records }: { pets: PetProfile[]; records: CaptureRecord[] }) {
  const [petEditor, setPetEditor] = useState<PetEditor>(null);
  const [petDraft, setPetDraft] = useState<PetProfileInput>(EMPTY_PET);
  const [petErrors, setPetErrors] = useState<Record<string, string>>({});
  const [recordEditor, setRecordEditor] = useState<RecordEditor>(null);
  const [recordErrors, setRecordErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'all' | 'pets' | 'history'>('all');

  const history = records.filter(record => record.kind === 'Pet record');
  const normalizedQuery = query.trim().toLowerCase();
  const matchingPets = useMemo(() => pets.filter(pet => {
    if (!normalizedQuery) return true;
    return [pet.name, pet.species, pet.breed, pet.status, pet.person, pet.microchip, pet.license, pet.vetName, pet.vetPhone,
      pet.insuranceProvider, pet.insurancePolicy, pet.allergies, pet.conditions, pet.notes].join(' ').toLowerCase().includes(normalizedQuery);
  }), [pets, normalizedQuery]);
  const matchingHistory = useMemo(() => history.filter(record => {
    if (!normalizedQuery) return true;
    const pet = pets.find(item => item.id === record.values.petId);
    return [record.values.pet, pet?.name, record.values.recordType, record.values.provider, record.values.date, record.values.nextDue,
      record.values.value, record.values.cost, record.values.notes].join(' ').toLowerCase().includes(normalizedQuery);
  }), [history, pets, normalizedQuery]);

  const activePets = pets.filter(pet => pet.status === 'Active' || pet.status === 'Needs care').length;
  const needsCare = pets.filter(pet => pet.status === 'Needs care').length;
  const upcomingCare = history.filter(record => {
    const days = daysUntil(record.values.nextDue);
    return days != null && days <= 30;
  }).length;

  const latestWeightFor = (pet: PetProfile) => history
    .filter(record => record.values.petId === pet.id && record.values.recordType === 'Weight' && record.values.value)
    .slice().sort((a, b) => (b.values.date || '').localeCompare(a.values.date || ''))[0]?.values.value || pet.weight;

  const nextCareFor = (pet: PetProfile) => history
    .filter(record => record.values.petId === pet.id && record.values.nextDue)
    .slice().sort((a, b) => (a.values.nextDue || '').localeCompare(b.values.nextDue || ''))[0];

  const openPet = (pet: PetProfile | null = null) => {
    setPetErrors({});
    setPetEditor({ pet });
    if (pet) {
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...values } = pet;
      setPetDraft(values);
    } else setPetDraft(EMPTY_PET);
  };

  const savePet = () => {
    const result = petEditor?.pet ? updatePetProfile(petEditor.pet.id, petDraft) : addPetProfile(petDraft);
    if (!result.pet) { setPetErrors(result.validation.errors); return; }
    setPetErrors({}); setPetEditor(null);
  };

  const deletePet = (pet: PetProfile) => {
    if (!window.confirm(`Remove ${pet.name}? Pet history will remain as historical records.`)) return;
    removePetProfile(pet.id);
    setPetEditor(null);
  };

  const openRecord = (petId?: string, record: CaptureRecord | null = null) => {
    setRecordErrors({});
    setRecordEditor({ petId: petId || record?.values.petId, record });
  };

  const saveRecord = (form: HTMLFormElement) => {
    if (!recordEditor) return;
    const values = formValues(form, recordEditor.record?.values);
    const selectedPet = pets.find(pet => pet.id === values.petId);
    values.pet = selectedPet?.name || values.pet || 'Pet';
    const result = recordEditor.record ? updateCaptureRecord(recordEditor.record.id, values) : addCaptureRecord('Pet record', values);
    if (!result.record) { setRecordErrors(result.validation?.errors ?? { form: 'Unable to save pet record.' }); return; }
    if (selectedPet && values.recordType === 'Weight' && values.value) {
      const weight = Number(values.value);
      if (Number.isFinite(weight) && weight > 0) {
        const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...profile } = selectedPet;
        updatePetProfile(selectedPet.id, { ...profile, weight: values.value });
      }
    }
    setRecordErrors({}); setRecordEditor(null);
  };

  const deleteRecord = (record: CaptureRecord) => {
    if (!window.confirm('Remove this pet history record?')) return;
    removeCaptureRecord(record.id);
    setRecordEditor(null);
  };

  return <div className="stack pet-module">
    <header className="module-hero pet-hero"><span className="eyebrow">Family OS · Pets</span><h1>Pets, care, health and memories.</h1><p>Keep reusable pet profiles separate from vet visits, vaccinations, medication, grooming, weight and milestone history.</p></header>

    <section className="pet-summary-grid">
      <article className="panel pet-summary-card"><span>🐾</span><div><strong>{pets.length}</strong><small>Pet profiles</small></div></article>
      <article className="panel pet-summary-card"><span>●</span><div><strong>{activePets}</strong><small>Active pets</small></div></article>
      <article className="panel pet-summary-card"><span>♡</span><div><strong>{needsCare}</strong><small>Need attention</small></div></article>
      <article className="panel pet-summary-card"><span>📅</span><div><strong>{upcomingCare}</strong><small>Care due ≤30d</small></div></article>
    </section>

    <section className="panel pet-search-panel">
      <label><span>Search pets and history</span><input data-pet-search value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, breed, microchip, vet, vaccine, medication, notes…" /></label>
      <div className="pet-view-switch">{(['all', 'pets', 'history'] as const).map(option => <button key={option} className={view === option ? 'active' : ''} onClick={() => setView(option)}>{option === 'all' ? 'All' : option === 'pets' ? 'Pets' : 'History'}</button>)}</div>
      <div><button className="primary" data-pet-add onClick={() => openPet()}>+ Pet</button><button data-pet-add-record onClick={() => openRecord(pets[0]?.id)}>+ Care record</button></div>
    </section>

    {(view === 'all' || view === 'pets') && <section className="panel pet-record-panel">
      <header><div><span className="eyebrow">Family pets</span><h2>Pet profiles</h2><p>Identity, microchip, veterinarian, insurance, weight and important care context.</p></div><button className="primary" data-pet-add onClick={() => openPet()}>+ Add pet</button></header>
      {matchingPets.length ? <div className="pet-card-grid">{matchingPets.map(pet => {
        const nextCare = nextCareFor(pet);
        const weight = latestWeightFor(pet);
        return <article className={`pet-card pet-status-${pet.status.toLowerCase().replace(/\s+/g, '-')}`} key={pet.id} data-pet-card>
          <div className="pet-card-head"><span className="pet-card-icon">{pet.species === 'Cat' ? '🐈' : pet.species === 'Dog' ? '🐕' : '🐾'}</span><div><span className="eyebrow">{pet.status}</span><h3>{pet.name}</h3><small>{pet.species}{pet.breed ? ` · ${pet.breed}` : ''}</small></div><button onClick={() => openPet(pet)}>Edit</button></div>
          <div className="pet-kpis"><article><small>Weight</small><strong>{weight ? `${weight} kg` : '—'}</strong></article><article><small>Birthday</small><strong>{formatDate(pet.birthday)}</strong></article><article><small>Family</small><strong>{pet.person}</strong></article></div>
          <div className="pet-info-lines">{pet.microchip && <span>Microchip · <strong>{pet.microchip}</strong></span>}{pet.vetName && <span>Vet · <strong>{pet.vetName}</strong>{pet.vetPhone ? ` · ${pet.vetPhone}` : ''}</span>}{pet.insuranceProvider && <span className={`pet-date pet-date-${dateTone(pet.insuranceExpiry)}`}>Insurance · {pet.insuranceProvider} · {formatDate(pet.insuranceExpiry)}</span>}</div>
          {nextCare && <div className={`pet-next-care pet-date-${dateTone(nextCare.values.nextDue)}`}><strong>Next care</strong><span>{nextCare.values.recordType} · {formatDate(nextCare.values.nextDue)}</span></div>}
          {(pet.allergies || pet.conditions) && <div className="pet-health-note">{pet.allergies && <span><b>Allergies:</b> {pet.allergies}</span>}{pet.conditions && <span><b>Conditions:</b> {pet.conditions}</span>}</div>}
          <div className="pet-card-actions"><button data-pet-card-record onClick={() => openRecord(pet.id)}>+ Care record</button><button onClick={() => openPet(pet)}>Edit profile</button></div>
        </article>;
      })}</div> : <div className="pet-empty"><span>🐾</span><div><strong>No matching pets.</strong><small>Add your first pet or clear the search.</small></div></div>}
    </section>}

    {(view === 'all' || view === 'history') && <section className="panel pet-record-panel pet-history-panel">
      <header><div><span className="eyebrow">Care history</span><h2>Vet, health & milestones</h2><p>Vaccinations, appointments, medication, grooming, weight and durable memories.</p></div><button className="primary" data-pet-add-record onClick={() => openRecord(pets[0]?.id)}>+ Add record</button></header>
      {matchingHistory.length ? <div className="pet-history-list">{matchingHistory.map(record => {
        const linkedPet = pets.find(pet => pet.id === record.values.petId);
        return <article className="pet-history-row" key={record.id} data-pet-history-row>
          <span className="pet-history-icon">{record.values.recordType === 'Vaccination' ? '💉' : record.values.recordType === 'Vet appointment' ? '🩺' : record.values.recordType === 'Medication' ? '💊' : record.values.recordType === 'Weight' ? '⚖' : '🐾'}</span>
          <div><strong>{record.values.recordType || 'Pet record'} · {linkedPet?.name || record.values.pet || 'Pet'}</strong><small>{formatDate(record.values.date)}{record.values.provider ? ` · ${record.values.provider}` : ''}{record.values.value ? ` · ${record.values.value}${record.values.recordType === 'Weight' ? ' kg' : ''}` : ''}</small>{record.values.nextDue && <small className={`pet-date pet-date-${dateTone(record.values.nextDue)}`}>Next due · {formatDate(record.values.nextDue)}</small>}{record.values.notes && <p>{record.values.notes}</p>}</div>
          <div className="pet-history-side">{record.values.cost && <b>{money(record.values.cost)}</b>}<button onClick={() => openRecord(undefined, record)}>Edit</button></div>
        </article>;
      })}</div> : <p className="note">No matching pet history records.</p>}
    </section>}

    {petEditor && <div className="pet-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setPetEditor(null); }}><section className="pet-modal" role="dialog" aria-modal="true" data-pet-modal>
      <header><div><span className="eyebrow">{petEditor.pet ? 'Edit pet profile' : 'New pet profile'}</span><h2>{petEditor.pet?.name || 'Add pet'}</h2><p>Store durable identity, veterinarian and care information.</p></div><button onClick={() => setPetEditor(null)}>×</button></header>
      <div className="pet-form-grid">
        <label><span>Name</span><input name="name" value={petDraft.name} onChange={e => setPetDraft({ ...petDraft, name: e.target.value })} />{petErrors.name && <small className="pet-field-error">{petErrors.name}</small>}</label>
        <label><span>Species</span><select value={petDraft.species} onChange={e => setPetDraft({ ...petDraft, species: e.target.value as PetProfileInput['species'] })}>{PET_SPECIES.map(v => <option key={v}>{v}</option>)}</select></label>
        <label><span>Breed</span><input value={petDraft.breed} onChange={e => setPetDraft({ ...petDraft, breed: e.target.value })} /></label>
        <label><span>Status</span><select value={petDraft.status} onChange={e => setPetDraft({ ...petDraft, status: e.target.value as PetProfileInput['status'] })}>{PET_STATUSES.map(v => <option key={v}>{v}</option>)}</select></label>
        <label><span>Sex</span><select value={petDraft.sex} onChange={e => setPetDraft({ ...petDraft, sex: e.target.value as PetProfileInput['sex'] })}>{PET_SEXES.map(v => <option key={v}>{v}</option>)}</select></label>
        <label><span>Family member</span><select value={petDraft.person} onChange={e => setPetDraft({ ...petDraft, person: e.target.value as PetProfileInput['person'] })}>{PET_PEOPLE.map(v => <option key={v}>{v}</option>)}</select></label>
        <label><span>Birthday</span><input type="date" value={petDraft.birthday} onChange={e => setPetDraft({ ...petDraft, birthday: e.target.value })} /></label>
        <label><span>Adoption date</span><input type="date" value={petDraft.adoptionDate} onChange={e => setPetDraft({ ...petDraft, adoptionDate: e.target.value })} /></label>
        <label><span>Colour / markings</span><input value={petDraft.color} onChange={e => setPetDraft({ ...petDraft, color: e.target.value })} /></label>
        <label><span>Weight (kg)</span><input type="number" step="0.01" min="0" value={petDraft.weight} onChange={e => setPetDraft({ ...petDraft, weight: e.target.value })} />{petErrors.weight && <small className="pet-field-error">{petErrors.weight}</small>}</label>
        <label><span>Microchip</span><input value={petDraft.microchip} onChange={e => setPetDraft({ ...petDraft, microchip: e.target.value })} /></label>
        <label><span>Licence / tag</span><input value={petDraft.license} onChange={e => setPetDraft({ ...petDraft, license: e.target.value })} /></label>
        <label><span>Veterinarian</span><input value={petDraft.vetName} onChange={e => setPetDraft({ ...petDraft, vetName: e.target.value })} /></label>
        <label><span>Vet phone</span><input value={petDraft.vetPhone} onChange={e => setPetDraft({ ...petDraft, vetPhone: e.target.value })} /></label>
        <label><span>Insurance provider</span><input value={petDraft.insuranceProvider} onChange={e => setPetDraft({ ...petDraft, insuranceProvider: e.target.value })} /></label>
        <label><span>Policy</span><input value={petDraft.insurancePolicy} onChange={e => setPetDraft({ ...petDraft, insurancePolicy: e.target.value })} /></label>
        <label><span>Insurance expiry</span><input type="date" value={petDraft.insuranceExpiry} onChange={e => setPetDraft({ ...petDraft, insuranceExpiry: e.target.value })} /></label>
        <label className="wide"><span>Allergies</span><textarea rows={2} value={petDraft.allergies} onChange={e => setPetDraft({ ...petDraft, allergies: e.target.value })} /></label>
        <label className="wide"><span>Conditions</span><textarea rows={2} value={petDraft.conditions} onChange={e => setPetDraft({ ...petDraft, conditions: e.target.value })} /></label>
        <label className="wide"><span>Notes</span><textarea rows={4} value={petDraft.notes} onChange={e => setPetDraft({ ...petDraft, notes: e.target.value })} /></label>
      </div>
      <footer>{petEditor.pet && <button className="pet-danger" onClick={() => deletePet(petEditor.pet!)}>Remove pet</button>}<span /><button onClick={() => setPetEditor(null)}>Cancel</button><button className="primary" data-pet-save onClick={savePet}>{petEditor.pet ? 'Save changes' : 'Save pet'}</button></footer>
    </section></div>}

    {recordEditor && <div className="pet-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setRecordEditor(null); }}><section className="pet-modal" role="dialog" aria-modal="true" data-pet-record-modal>
      <header><div><span className="eyebrow">{recordEditor.record ? 'Edit pet record' : 'New pet record'}</span><h2>Care / history</h2><p>Add a durable event to this pet’s history.</p></div><button onClick={() => setRecordEditor(null)}>×</button></header>
      <form onSubmit={event => { event.preventDefault(); saveRecord(event.currentTarget); }}>
        {recordErrors.form && <div className="pet-error-summary">{recordErrors.form}</div>}
        <div className="pet-form-grid">
          <label><span>Pet</span><select name="petId" defaultValue={recordEditor.record?.values.petId || recordEditor.petId || pets[0]?.id || ''}>{pets.map(pet => <option key={pet.id} value={pet.id}>{pet.name}</option>)}</select></label>
          <label><span>Record type</span><select name="recordType" defaultValue={recordEditor.record?.values.recordType || 'Vet appointment'}>{RECORD_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
          <label><span>Date</span><input name="date" type="date" defaultValue={recordEditor.record?.values.date || isoDate(new Date())} />{recordErrors.date && <small className="pet-field-error">{recordErrors.date}</small>}</label>
          <label><span>Provider / place</span><input name="provider" defaultValue={recordEditor.record?.values.provider || ''} placeholder="Vet clinic, groomer…" /></label>
          <label><span>Value / weight / dose</span><input name="value" defaultValue={recordEditor.record?.values.value || ''} placeholder="Optional reading or value" /></label>
          <label><span>Cost</span><input name="cost" type="number" step="0.01" min="0" defaultValue={recordEditor.record?.values.cost || ''} /></label>
          <label><span>Next due</span><input name="nextDue" type="date" defaultValue={recordEditor.record?.values.nextDue || ''} /></label>
          <label className="wide"><span>Details</span><textarea name="notes" rows={4} defaultValue={recordEditor.record?.values.notes || ''} /></label>
        </div>
        <footer>{recordEditor.record && <button type="button" className="pet-danger" onClick={() => deleteRecord(recordEditor.record!)}>Remove record</button>}<span /><button type="button" onClick={() => setRecordEditor(null)}>Cancel</button><button className="primary" data-pet-record-save type="submit">{recordEditor.record ? 'Save changes' : 'Save record'}</button></footer>
      </form>
    </section></div>}
  </div>;
}
