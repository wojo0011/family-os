import { createRoot, type Root } from 'react-dom/client';
import HealthModule from './HealthModule';
import { loadCaptureRecords, subscribeCaptureRecords, type CaptureRecord } from './localCaptureStore';
import { loadHealthProviders, subscribeHealthProviders, type HealthProvider } from './healthProviderStore';

let installed = false;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let sourceStack: HTMLElement | null = null;
let providers: HealthProvider[] = [];
let records: CaptureRecord[] = [];
let unsubscribeProviders: (() => void) | null = null;
let unsubscribeRecords: (() => void) | null = null;
let queued = false;

function findHealthStack() {
  return Array.from(document.querySelectorAll<HTMLElement>('.content > .stack')).find(stack =>
    stack.querySelector('.module-hero h1')?.textContent?.trim() === 'Health',
  ) ?? null;
}

function renderHealth() {
  if (!root) return;
  root.render(<HealthModule providers={providers} records={records} />);
}

function teardown() {
  unsubscribeProviders?.();
  unsubscribeRecords?.();
  unsubscribeProviders = null;
  unsubscribeRecords = null;
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
  if (sourceStack) delete sourceStack.dataset.healthEnhanced;
  sourceStack = null;
}

function mount(stack: HTMLElement) {
  if (sourceStack === stack && host?.isConnected) return;
  teardown();

  sourceStack = stack;
  sourceStack.dataset.healthEnhanced = 'true';
  host = document.createElement('div');
  host.className = 'health-module-host';
  sourceStack.prepend(host);
  root = createRoot(host);

  providers = loadHealthProviders();
  records = loadCaptureRecords();
  renderHealth();

  unsubscribeProviders = subscribeHealthProviders(next => {
    providers = next;
    renderHealth();
  });
  unsubscribeRecords = subscribeCaptureRecords(next => {
    records = next;
    renderHealth();
  });
}

function sync() {
  queued = false;
  const stack = findHealthStack();
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

export function installHealthModuleEnhancement() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  const observer = new MutationObserver(queueSync);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', queueSync, true);
  window.addEventListener('family-os:app-ready', queueSync);
  queueSync();
}
