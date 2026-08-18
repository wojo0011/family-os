import { createRoot, type Root } from 'react-dom/client';
import MoneyModule from './MoneyModule';
import { loadCaptureRecords, subscribeCaptureRecords, type CaptureRecord } from './localCaptureStore';

let installed = false;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let sourceStack: HTMLElement | null = null;
let records: CaptureRecord[] = [];
let unsubscribeRecords: (() => void) | null = null;
let queued = false;

function findMoneyStack() {
  return Array.from(document.querySelectorAll<HTMLElement>('.content > .stack')).find(stack =>
    stack.querySelector('.module-hero h1')?.textContent?.trim() === 'Money',
  ) ?? null;
}

function renderMoney() {
  root?.render(<MoneyModule records={records} />);
}

function teardown() {
  unsubscribeRecords?.();
  unsubscribeRecords = null;
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
  if (sourceStack) delete sourceStack.dataset.moneyEnhanced;
  delete document.documentElement.dataset.moneyModuleActive;
  sourceStack = null;
}

function mount(stack: HTMLElement) {
  if (sourceStack === stack && host?.isConnected) return;
  teardown();

  sourceStack = stack;
  sourceStack.dataset.moneyEnhanced = 'true';
  document.documentElement.dataset.moneyModuleActive = 'true';

  host = document.createElement('div');
  host.className = 'money-module-host';
  host.dataset.moneyModuleHost = 'true';
  document.body.appendChild(host);
  root = createRoot(host);

  records = loadCaptureRecords();
  renderMoney();

  unsubscribeRecords = subscribeCaptureRecords(next => {
    records = next;
    renderMoney();
  });
}

function sync() {
  queued = false;
  const stack = findMoneyStack();
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

export function installMoneyModuleEnhancement() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  const observer = new MutationObserver(queueSync);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', queueSync, true);
  window.addEventListener('family-os:app-ready', queueSync);
  queueSync();
}
