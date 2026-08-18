import { createRoot, type Root } from 'react-dom/client';
import PetModule from './PetModule';
import { loadCaptureRecords, subscribeCaptureRecords, type CaptureRecord } from './localCaptureStore';
import { loadPetProfiles, subscribePetProfiles, type PetProfile } from './petProfileStore';

let installed = false;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let sourceStack: HTMLElement | null = null;
let pets: PetProfile[] = [];
let records: CaptureRecord[] = [];
let unsubscribePets: (() => void) | null = null;
let unsubscribeRecords: (() => void) | null = null;
let queued = false;

function findPetStack() {
  return Array.from(document.querySelectorAll<HTMLElement>('.content > .stack')).find(stack =>
    stack.querySelector('.module-hero h1')?.textContent?.trim() === 'Pets',
  ) ?? null;
}
function renderPets() { root?.render(<PetModule pets={pets} records={records} />); }
function teardown() {
  unsubscribePets?.(); unsubscribeRecords?.(); unsubscribePets = null; unsubscribeRecords = null;
  root?.unmount(); root = null; host?.remove(); host = null;
  if (sourceStack) delete sourceStack.dataset.petEnhanced;
  delete document.documentElement.dataset.petModuleActive;
  sourceStack = null;
}
function mount(stack: HTMLElement) {
  if (sourceStack === stack && host?.isConnected) return;
  teardown();
  sourceStack = stack; sourceStack.dataset.petEnhanced = 'true'; document.documentElement.dataset.petModuleActive = 'true';
  host = document.createElement('div'); host.className = 'pet-module-host'; host.dataset.petModuleHost = 'true'; document.body.appendChild(host);
  root = createRoot(host); pets = loadPetProfiles(); records = loadCaptureRecords(); renderPets();
  unsubscribePets = subscribePetProfiles(next => { pets = next; renderPets(); });
  unsubscribeRecords = subscribeCaptureRecords(next => { records = next; renderPets(); });
}
function sync() { queued = false; const stack = findPetStack(); if (!stack) { if (sourceStack) teardown(); return; } mount(stack); }
function queueSync() { if (queued) return; queued = true; requestAnimationFrame(sync); }
export function installPetModuleEnhancement() {
  if (installed || typeof document === 'undefined') return; installed = true;
  const observer = new MutationObserver(queueSync); observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', queueSync, true); window.addEventListener('family-os:app-ready', queueSync); queueSync();
}
