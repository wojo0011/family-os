import { createRoot, type Root } from 'react-dom/client';
import HomeModule from './HomeModule';
import { loadCaptureRecords, subscribeCaptureRecords, type CaptureRecord } from './localCaptureStore';

let installed = false;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let sourceStack: HTMLElement | null = null;
let records: CaptureRecord[] = [];
let unsubscribeRecords: (() => void) | null = null;
let queued = false;

function findHomeStack() {
  return Array.from(document.querySelectorAll<HTMLElement>('.content > .stack')).find(stack =>
    stack.querySelector('.module-hero h1')?.textContent?.trim() === 'Home',
  ) ?? null;
}

function renderHome() {
  root?.render(<HomeModule records={records} />);
}

function teardown() {
  unsubscribeRecords?.();
  unsubscribeRecords = null;
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
  if (sourceStack) delete sourceStack.dataset.homeEnhanced;
  delete document.documentElement.dataset.homeModuleActive;
  sourceStack = null;
}

function mount(stack: HTMLElement) {
  if (sourceStack === stack && host?.isConnected) return;
  teardown();

  sourceStack = stack;
  sourceStack.dataset.homeEnhanced = 'true';
  document.documentElement.dataset.homeModuleActive = 'true';

  host = document.createElement('div');
  host.className = 'home-module-host';
  host.dataset.homeModuleHost = 'true';
  document.body.appendChild(host);
  root = createRoot(host);

  records = loadCaptureRecords();
  renderHome();
  unsubscribeRecords = subscribeCaptureRecords(next => {
    records = next;
    renderHome();
  });
}

function sync() {
  queued = false;
  const stack = findHomeStack();
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

export function installHomeModuleEnhancement() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  const observer = new MutationObserver(queueSync);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', queueSync, true);
  window.addEventListener('family-os:app-ready', queueSync);
  queueSync();
}
