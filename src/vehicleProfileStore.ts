export const VEHICLE_STATUSES = ['Active', 'Needs service', 'Stored', 'Sold'] as const;
export const VEHICLE_FUEL_TYPES = ['Gasoline', 'Diesel', 'Hybrid', 'Plug-in hybrid', 'Electric', 'Other'] as const;
export const VEHICLE_TRANSMISSIONS = ['Automatic', 'Manual', 'CVT', 'Other'] as const;
export const VEHICLE_OWNERSHIP = ['Owned', 'Financed', 'Leased', 'Company / other'] as const;
export const VEHICLE_PEOPLE = ['Family', 'Dad', 'Mom', 'Teen'] as const;

export type VehicleStatus = typeof VEHICLE_STATUSES[number];
export type VehicleFuelType = typeof VEHICLE_FUEL_TYPES[number];
export type VehicleTransmission = typeof VEHICLE_TRANSMISSIONS[number];
export type VehicleOwnership = typeof VEHICLE_OWNERSHIP[number];
export type VehiclePerson = typeof VEHICLE_PEOPLE[number];

export type VehicleProfileInput = {
  nickname: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  status: VehicleStatus;
  person: VehiclePerson;
  vin: string;
  plate: string;
  color: string;
  fuelType: VehicleFuelType;
  transmission: VehicleTransmission;
  odometer: string;
  purchaseDate: string;
  purchasePrice: string;
  ownership: VehicleOwnership;
  insuranceProvider: string;
  insurancePolicy: string;
  insuranceExpiry: string;
  registrationExpiry: string;
  tireSize: string;
  notes: string;
};

export type VehicleProfile = VehicleProfileInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

type VehicleValidation = { valid: boolean; errors: Record<string, string>; values: VehicleProfileInput };

const STORAGE_KEY = 'family-os:vehicle-profiles-v1';
const CHANGE_EVENT = 'family-os:vehicle-profiles-changed';
const MAX_VEHICLES = 30;

const clean = (value: unknown, max = 4000) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());

function normalize(input: Partial<VehicleProfileInput>): VehicleProfileInput {
  return {
    nickname: clean(input.nickname, 120),
    year: clean(input.year, 4),
    make: clean(input.make, 100),
    model: clean(input.model, 120),
    trim: clean(input.trim, 120),
    status: VEHICLE_STATUSES.includes(input.status as VehicleStatus) ? input.status as VehicleStatus : 'Active',
    person: VEHICLE_PEOPLE.includes(input.person as VehiclePerson) ? input.person as VehiclePerson : 'Family',
    vin: clean(input.vin, 40).toUpperCase(),
    plate: clean(input.plate, 40).toUpperCase(),
    color: clean(input.color, 80),
    fuelType: VEHICLE_FUEL_TYPES.includes(input.fuelType as VehicleFuelType) ? input.fuelType as VehicleFuelType : 'Gasoline',
    transmission: VEHICLE_TRANSMISSIONS.includes(input.transmission as VehicleTransmission) ? input.transmission as VehicleTransmission : 'Automatic',
    odometer: clean(input.odometer, 20),
    purchaseDate: clean(input.purchaseDate, 10),
    purchasePrice: clean(input.purchasePrice, 30),
    ownership: VEHICLE_OWNERSHIP.includes(input.ownership as VehicleOwnership) ? input.ownership as VehicleOwnership : 'Owned',
    insuranceProvider: clean(input.insuranceProvider, 180),
    insurancePolicy: clean(input.insurancePolicy, 180),
    insuranceExpiry: clean(input.insuranceExpiry, 10),
    registrationExpiry: clean(input.registrationExpiry, 10),
    tireSize: clean(input.tireSize, 80),
    notes: clean(input.notes, 4000),
  };
}

export function validateVehicleProfile(input: Partial<VehicleProfileInput>): VehicleValidation {
  const values = normalize(input);
  const errors: Record<string, string> = {};
  if (values.nickname.length < 2) errors.nickname = 'Vehicle name is required.';
  if (!/^\d{4}$/.test(values.year) || Number(values.year) < 1886 || Number(values.year) > new Date().getFullYear() + 2) errors.year = 'Enter a valid model year.';
  if (values.make.length < 2) errors.make = 'Make is required.';
  if (values.model.length < 1) errors.model = 'Model is required.';
  if (values.vin && !/^[A-HJ-NPR-Z0-9]{11,17}$/.test(values.vin)) errors.vin = 'VIN should contain 11–17 letters/numbers and no I, O or Q.';
  if (values.odometer) {
    const odometer = Number(values.odometer);
    if (!Number.isFinite(odometer) || odometer < 0 || odometer > 5_000_000) errors.odometer = 'Enter a valid non-negative odometer.';
  }
  if (values.purchasePrice) {
    const price = Number(values.purchasePrice);
    if (!Number.isFinite(price) || price < 0 || price > 10_000_000) errors.purchasePrice = 'Enter a valid purchase price.';
  }
  for (const [field, label] of [['purchaseDate', 'purchase date'], ['insuranceExpiry', 'insurance expiry'], ['registrationExpiry', 'registration expiry']] as const) {
    const value = values[field];
    if (value && !validDate(value)) errors[field] = `Enter a valid ${label}.`;
  }
  return { valid: Object.keys(errors).length === 0, errors, values };
}

function sanitize(value: unknown): VehicleProfile | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<VehicleProfile>;
  if (!candidate.id || typeof candidate.id !== 'string' || typeof candidate.createdAt !== 'string') return null;
  const normalized = normalize(candidate);
  return {
    ...normalized,
    id: clean(candidate.id, 160),
    createdAt: candidate.createdAt,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : candidate.createdAt,
  };
}

export function loadVehicleProfiles(): VehicleProfile[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitize).filter((item): item is VehicleProfile => Boolean(item)).slice(0, MAX_VEHICLES);
  } catch {
    return [];
  }
}

function write(profiles: VehicleProfile[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles.slice(0, MAX_VEHICLES)));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function addVehicleProfile(input: Partial<VehicleProfileInput>) {
  const validation = validateVehicleProfile(input);
  if (!validation.valid) return { vehicle: null, validation };
  const now = new Date().toISOString();
  const vehicle: VehicleProfile = {
    ...validation.values,
    id: `vehicle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  write([vehicle, ...loadVehicleProfiles()]);
  return { vehicle, validation };
}

export function updateVehicleProfile(id: string, input: Partial<VehicleProfileInput>) {
  const validation = validateVehicleProfile(input);
  if (!validation.valid) return { vehicle: null, validation };
  const profiles = loadVehicleProfiles();
  const index = profiles.findIndex(item => item.id === id);
  if (index < 0) return { vehicle: null, validation };
  const vehicle: VehicleProfile = {
    ...profiles[index],
    ...validation.values,
    updatedAt: new Date().toISOString(),
  };
  profiles[index] = vehicle;
  write(profiles);
  return { vehicle, validation };
}

export function removeVehicleProfile(id: string) {
  const profiles = loadVehicleProfiles();
  const next = profiles.filter(item => item.id !== id);
  if (next.length === profiles.length) return false;
  write(next);
  return true;
}

export function subscribeVehicleProfiles(listener: (profiles: VehicleProfile[]) => void) {
  if (typeof window === 'undefined') return () => undefined;
  const notify = () => listener(loadVehicleProfiles());
  window.addEventListener(CHANGE_EVENT, notify);
  window.addEventListener('storage', notify);
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener('storage', notify);
  };
}
