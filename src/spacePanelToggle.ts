let installed = false;
let toggle: HTMLButtonElement | null = null;
let hidden = false;
let syncQueued = false;

function findTodayHost() {
  const hero = document.querySelector<HTMLElement>('.content > .stack > .hero-grid');
  return hero?.parentElement?.parentElement instanceof HTMLElement ? hero.parentElement.parentElement : null;
}

function removeToggle() {
  toggle?.remove();
  toggle = null;
  hidden = false;
  delete document.documentElement.dataset.spacePanelsHidden;
}

function syncToggle() {
  const isSpace = document.documentElement.dataset.theme === 'space';
  const host = isSpace ? findTodayHost() : null;
  if (!host) {
    removeToggle();
    return;
  }

  if (!toggle?.isConnected) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'space-panel-toggle';
    toggle.addEventListener('click', () => {
      hidden = !hidden;
      document.documentElement.dataset.spacePanelsHidden = String(hidden);
      if (toggle) {
        toggle.textContent = hidden ? '▣ Show panels' : '◫ Hide panels';
        toggle.setAttribute('aria-pressed', String(hidden));
      }
    });
    document.body.appendChild(toggle);
  }

  document.documentElement.dataset.spacePanelsHidden = String(hidden);
  toggle.textContent = hidden ? '▣ Show panels' : '◫ Hide panels';
  toggle.setAttribute('aria-pressed', String(hidden));
}

function queueSync() {
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    syncToggle();
  });
}

export function installSpacePanelToggle() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  const observer = new MutationObserver(queueSync);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
    childList: true,
    subtree: true,
  });

  queueSync();
}
