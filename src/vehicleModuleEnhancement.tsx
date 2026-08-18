import { createRoot, type Root } from 'react-dom/client';
import VehicleModule from './VehicleModule';
import { loadCaptureRecords, subscribeCaptureRecords, type CaptureRecord } from './localCaptureStore';
import { loadVehicleProfiles, subscribeVehicleProfiles, type VehicleProfile } from './vehicleProfileStore';

let installed = false;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let sourceStack: HTMLElement | null = null;
let vehicles: VehicleProfile[] = [];
let records: CaptureRecord[] = [];
let unsubscribeVehicles: (() => void) | null = null;
let unsubscribeRecords: (() => void) | null = null;
let queued = false;

function findVehicleStack() {
  return Array.from(document.querySelectorAll<HTMLElement>('.content > .stack')).find(stack =>
    stack.querySelector('.module-hero h1')?.textContent?.trim() === 'Vehicles',
  ) ?? null;
}

function renderVehicles() {
  root?.render(<VehicleModule vehicles={vehicles} records={records} />);
}

function teardown() {
  unsubscribeVehicles?.();
  unsubscribeRecords?.();
  unsubscribeVehicles = null;
  unsubscribeRecords = null;
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
  if (sourceStack) delete sourceStack.dataset.vehicleEnhanced;
  delete document.documentElement.dataset.vehicleModuleActive;
  sourceStack = null;
}

function mount(stack: HTMLElement) {
  if (sourceStack === stack && host?.isConnected) return;
  teardown();
  sourceStack = stack;
  sourceStack.dataset.vehicleEnhanced = 'true';
  document.documentElement.dataset.vehicleModuleActive = 'true';

  host = document.createElement('div');
  host.className = 'vehicle-module-host';
  host.dataset.vehicleModuleHost = 'true';
  document.body.appendChild(host);
  root = createRoot(host);

  vehicles = loadVehicleProfiles();
  records = loadCaptureRecords();
  renderVehicles();

  unsubscribeVehicles = subscribeVehicleProfiles(next => {
    vehicles = next;
    renderVehicles();
  });
  unsubscribeRecords = subscribeCaptureRecords(next => {
    records = next;
    renderVehicles();
  });
}

function sync() {
  queued = false;
  const stack = findVehicleStack();
  if (!stack) {
    if (sourceStack) teardown();
    return;
  }
  mount(stack);
}

function queueSync() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(sync);
}

export function installVehicleModuleEnhancement() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const observer = new MutationObserver(queueSync);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', queueSync, true);
  window.addEventListener('family-os:app-ready', queueSync);
  queueSync();
}
