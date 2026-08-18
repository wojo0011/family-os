export const PET_SPECIES = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Reptile', 'Fish', 'Small animal', 'Other'] as const;
export const PET_STATUSES = ['Active', 'Needs care', 'Deceased', 'Rehomed'] as const;
export const PET_SEXES = ['Female', 'Male', 'Unknown'] as const;
export const PET_PEOPLE = ['Family', 'Dad', 'Mom', 'Teen', 'Child'] as const;

export type PetSpecies = typeof PET_SPECIES[number];
export type PetStatus = typeof PET_STATUSES[number];
export type PetSex = typeof PET_SEXES[number];
export type PetPerson = typeof PET_PEOPLE[number];

export type PetProfileInput = {
  name: string;
  species: PetSpecies;
  breed: string;
  status: PetStatus;
  sex: PetSex;
  person: PetPerson;
  birthday: string;
  adoptionDate: string;
  color: string;
  weight: string;
  microchip: string;
  license: string;
  vetName: string;
  vetPhone: string;
  insuranceProvider: string;
  insurancePolicy: string;
  insuranceExpiry: string;
  allergies: string;
  conditions: string;
  notes: string;
};

export type PetProfile = PetProfileInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

type PetValidation = { valid: boolean; errors: Record<string, string>; values: PetProfileInput };

const STORAGE_KEY = 'family-os:pet-profiles-v1';
const CHANGE_EVENT = 'family-os:pet-profiles-changed';
const MAX_PETS = 40;
const clean = (value: unknown, max = 4000) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());

function normalize(input: Partial<PetProfileInput>): PetProfileInput {
  return {
    name: clean(input.name, 120),
    species: PET_SPECIES.includes(input.species as PetSpecies) ? input.species as PetSpecies : 'Dog',
    breed: clean(input.breed, 160),
    status: PET_STATUSES.includes(input.status as PetStatus) ? input.status as PetStatus : 'Active',
    sex: PET_SEXES.includes(input.sex as PetSex) ? input.sex as PetSex : 'Unknown',
    person: PET_PEOPLE.includes(input.person as PetPerson) ? input.person as PetPerson : 'Family',
    birthday: clean(input.birthday, 10),
    adoptionDate: clean(input.adoptionDate, 10),
    color: clean(input.color, 100),
    weight: clean(input.weight, 30),
    microchip: clean(input.microchip, 120),
    license: clean(input.license, 120),
    vetName: clean(input.vetName, 180),
    vetPhone: clean(input.vetPhone, 80),
    insuranceProvider: clean(input.insuranceProvider, 180),
    insurancePolicy: clean(input.insurancePolicy, 180),
    insuranceExpiry: clean(input.insuranceExpiry, 10),
    allergies: clean(input.allergies, 1000),
    conditions: clean(input.conditions, 1000),
    notes: clean(input.notes, 4000),
  };
}

export function validatePetProfile(input: Partial<PetProfileInput>): PetValidation {
  const values = normalize(input);
  const errors: Record<string, string> = {};
  if (values.name.length < 1) errors.name = 'Pet name is required.';
  if (values.weight) {
    const weight = Number(values.weight);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 1000) errors.weight = 'Enter a valid weight in kilograms.';
  }
  for (const [field, label] of [['birthday', 'birthday'], ['adoptionDate', 'adoption date'], ['insuranceExpiry', 'insurance expiry']] as const) {
    const value = values[field];
    if (value && !validDate(value)) errors[field] = `Enter a valid ${label}.`;
  }
  return { valid: Object.keys(errors).length === 0, errors, values };
}

function sanitize(value: unknown): PetProfile | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PetProfile>;
  if (!candidate.id || typeof candidate.id !== 'string' || typeof candidate.createdAt !== 'string') return null;
  return {
    ...normalize(candidate),
    id: clean(candidate.id, 160),
    createdAt: candidate.createdAt,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : candidate.createdAt,
  };
}

export function loadPetProfiles(): PetProfile[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitize).filter((item): item is PetProfile => Boolean(item)).slice(0, MAX_PETS);
  } catch {
    return [];
  }
}

function write(profiles: PetProfile[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles.slice(0, MAX_PETS)));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function addPetProfile(input: Partial<PetProfileInput>) {
  const validation = validatePetProfile(input);
  if (!validation.valid) return { pet: null, validation };
  const now = new Date().toISOString();
  const pet: PetProfile = { ...validation.values, id: `pet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: now, updatedAt: now };
  write([pet, ...loadPetProfiles()]);
  return { pet, validation };
}

export function updatePetProfile(id: string, input: Partial<PetProfileInput>) {
  const validation = validatePetProfile(input);
  if (!validation.valid) return { pet: null, validation };
  const profiles = loadPetProfiles();
  const index = profiles.findIndex(item => item.id === id);
  if (index < 0) return { pet: null, validation };
  const pet: PetProfile = { ...profiles[index], ...validation.values, updatedAt: new Date().toISOString() };
  profiles[index] = pet;
  write(profiles);
  return { pet, validation };
}

export function removePetProfile(id: string) {
  const profiles = loadPetProfiles();
  const next = profiles.filter(item => item.id !== id);
  if (next.length === profiles.length) return false;
  write(next);
  return true;
}

export function subscribePetProfiles(listener: (profiles: PetProfile[]) => void) {
  if (typeof window === 'undefined') return () => undefined;
  const notify = () => listener(loadPetProfiles());
  window.addEventListener(CHANGE_EVENT, notify);
  window.addEventListener('storage', notify);
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener('storage', notify);
  };
}
