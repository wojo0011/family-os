let installed = false;
let starting = false;
let started = false;
let panelsHidden = false;
let actions: HTMLDivElement | null = null;
let launchButton: HTMLButtonElement | null = null;
let panelButton: HTMLButtonElement | null = null;
let syncQueued = false;

function findTodayHost() {
  const hero = document.querySelector<HTMLElement>('.content > .stack > .hero-grid');
  return hero?.parentElement?.parentElement instanceof HTMLElement ? hero.parentElement.parentElement : null;
}

function addStyles() {
  if (document.getElementById('family-os-midnight-launcher-styles')) return;
  const style = document.createElement('style');
  style.id = 'family-os-midnight-launcher-styles';
  style.textContent = `
    .family-os-midnight-actions {
      position: fixed;
      right: 24px;
      bottom: 74px;
      z-index: 61;
      display: none;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
      max-width: min(92vw, 560px);
    }
    .family-os-midnight-actions.is-visible { display: flex; }
    .family-os-midnight-launcher,
    .family-os-midnight-panel-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(115,160,220,.3);
      border-radius: 999px;
      padding: 10px 15px;
      background: rgba(5,13,24,.92);
      color: #f2f7ff;
      box-shadow: 0 14px 34px rgba(0,0,0,.34);
      backdrop-filter: blur(14px);
      font: 800 11px/1 system-ui, sans-serif;
      cursor: pointer;
      transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
    }
    .family-os-midnight-launcher:hover:not(:disabled),
    .family-os-midnight-panel-toggle:hover:not(:disabled) {
      transform: translateY(-1px);
      border-color: rgba(157,205,255,.62);
      background: rgba(11,25,43,.96);
    }
    .family-os-midnight-launcher:disabled { cursor: default; opacity: .82; }
    .family-os-midnight-launcher[data-state="active"] {
      border-color: rgba(255,205,130,.44);
      background: rgba(14,28,45,.95);
    }
    .family-os-midnight-panel-toggle { display: none; }
    .family-os-midnight-panel-toggle.is-visible { display: inline-flex; }
    .family-os-midnight-panel-toggle[aria-pressed="true"] {
      border-color: rgba(157,205,255,.58);
      background: rgba(16,36,58,.96);
    }
    @media (max-width:720px) {
      .family-os-midnight-actions { right: 14px; bottom: 126px; gap: 6px; }
      .family-os-midnight-launcher,
      .family-os-midnight-panel-toggle { padding: 9px 12px; font-size: 10px; }
    }
  `;
  document.head.appendChild(style);
}

function webGL2Available() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function setPanelsHidden(hidden: boolean) {
  panelsHidden = hidden;
  document.documentElement.dataset.midnightPanelsHidden = String(hidden);
  if (!panelButton) return;
  panelButton.setAttribute('aria-pressed', String(hidden));
  panelButton.textContent = hidden ? '▣ Show Today panels' : '◫ Hide Today panels';
  panelButton.title = hidden
    ? 'Restore the Today dashboard panels.'
    : 'Hide the Today dashboard to view the Midnight City skyline.';
}

function resetLauncher() {
  started = false;
  starting = false;
  panelsHidden = false;
  delete document.documentElement.dataset.midnightPanelsHidden;
  if (launchButton) {
    launchButton.disabled = false;
    launchButton.dataset.state = 'ready';
    launchButton.textContent = '🌃 Launch 3D Midnight City';
    launchButton.title = 'Load the Midnight city skyline. 3D is never started automatically.';
  }
  panelButton?.classList.remove('is-visible');
  if (panelButton) panelButton.setAttribute('aria-pressed', 'false');
}

function syncVisibility() {
  if (!actions) return;
  const isMidnight = document.documentElement.dataset.theme === 'midnight';
  const visible = isMidnight && Boolean(findTodayHost());
  actions.classList.toggle('is-visible', visible);
  if (!isMidnight && (started || starting || panelsHidden)) resetLauncher();
}

function queueSync() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    syncQueued = false;
    syncVisibility();
  });
}

async function launchMidnight() {
  if (starting || started || !launchButton) return;
  starting = true;
  launchButton.disabled = true;
  launchButton.dataset.state = 'starting';
  launchButton.textContent = '◌ Building skyline…';

  try {
    if (!webGL2Available()) throw new Error('WebGL 2 is not available in this browser.');
    if (document.documentElement.dataset.theme !== 'midnight') throw new Error('Switch to Midnight theme first.');
    if (!findTodayHost()) throw new Error('Open the Today dashboard first.');

    await import('./midnightCityExperience.css');
    const { launchMidnightCityExperience } = await import('./midnightCityExperience');
    if (document.documentElement.dataset.theme !== 'midnight' || !findTodayHost()) {
      resetLauncher();
      return;
    }
    await launchMidnightCityExperience();

    if (document.documentElement.dataset.theme !== 'midnight') {
      resetLauncher();
      return;
    }

    started = true;
    launchButton.dataset.state = 'active';
    launchButton.textContent = '✓ Midnight City active';
    launchButton.title = 'Midnight City is active. Switch themes or refresh to close it.';
    panelButton?.classList.add('is-visible');
    setPanelsHidden(false);
  } catch (error) {
    console.error('Family OS Midnight City launch failed.', error);
    starting = false;
    launchButton.disabled = false;
    launchButton.dataset.state = 'error';
    launchButton.textContent = '⚠ Midnight City unavailable · retry';
    launchButton.title = error instanceof Error ? error.message : 'Midnight City could not start.';
    return;
  }

  starting = false;
}

export function installMidnight3DLauncher() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  addStyles();

  actions = document.createElement('div');
  actions.className = 'family-os-midnight-actions';

  panelButton = document.createElement('button');
  panelButton.type = 'button';
  panelButton.className = 'family-os-midnight-panel-toggle';
  panelButton.setAttribute('aria-pressed', 'false');
  panelButton.textContent = '◫ Hide Today panels';
  panelButton.addEventListener('click', () => setPanelsHidden(!panelsHidden));

  launchButton = document.createElement('button');
  launchButton.type = 'button';
  launchButton.className = 'family-os-midnight-launcher';
  launchButton.dataset.state = 'ready';
  launchButton.textContent = '🌃 Launch 3D Midnight City';
  launchButton.title = 'Load the Midnight city skyline. 3D is never started automatically.';
  launchButton.addEventListener('click', () => void launchMidnight());

  actions.append(panelButton, launchButton);
  document.body.appendChild(actions);

  const themeObserver = new MutationObserver(queueSync);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('click', queueSync, true);
  document.addEventListener('change', queueSync, true);
  window.addEventListener('family-os:app-ready', queueSync);
  window.addEventListener('family-os:midnight-city-stopped', resetLauncher);
  queueSync();
}
