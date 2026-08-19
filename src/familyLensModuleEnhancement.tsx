import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import FamilyLensModule from './familyLensModule';

let installed = false;
let host: HTMLDivElement | null = null;
let root: Root | null = null;

function isFamilyHubVisible() {
  return document.querySelector<HTMLElement>('.content .module-hero h1')?.textContent?.trim() === 'Family Hub';
}

function sync() {
  const content = document.querySelector<HTMLElement>('.content');
  const main = document.querySelector<HTMLElement>('main');
  if (!content || !main) return;
  const visible = isFamilyHubVisible();
  if (!host) {
    host = document.createElement('div');
    host.className = 'family-lens-module-host';
    host.hidden = true;
    main.appendChild(host);
    root = createRoot(host);
    root.render(<StrictMode><FamilyLensModule /></StrictMode>);
  }
  host.hidden = !visible;
  content.classList.toggle('family-lens-source-hidden', visible);
}

export function installFamilyLensModuleEnhancement() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  sync();
  const observer = new MutationObserver(() => queueMicrotask(sync));
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('beforeunload', () => { observer.disconnect(); root?.unmount(); }, { once: true });
}
