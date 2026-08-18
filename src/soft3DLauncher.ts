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
  if (document.getElementById('family-os-soft-launcher-styles')) return;
  const style = document.createElement('style');
  style.id = 'family-os-soft-launcher-styles';
  style.textContent = `
    .family-os-soft-actions {
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
    .family-os-soft-actions.is-visible { display: flex; }
    .family-os-soft-launcher,
    .family-os-soft-panel-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(255,159,200,.36);
      border-radius: 999px;
      padding: 10px 15px;
      background: rgba(47,31,51,.92);
      color: #fff7fb;
      box-shadow: 0 14px 34px rgba(0,0,0,.28);
      backdrop-filter: blur(14px);
      font: 800 11px/1 system-ui, sans-serif;
      cursor: pointer;
      transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
    }
    .family-os-soft-launcher:hover:not(:disabled),
    .family-os-soft-panel-toggle:hover:not(:disabled) {
      transform: translateY(-1px);
      border-color: rgba(205,179,255,.74);
      background: rgba(58,40,63,.97);
    }
    .family-os-soft-launcher:disabled { cursor: default; opacity: .82; }
    .family-os-soft-launcher[data-state="active"] {
      border-color: rgba(255,217,174,.56);
      background: rgba(62,42,66,.97);
    }
    .family-os-soft-panel-toggle { display: none; }
    .family-os-soft-panel-toggle.is-visible { display: inline-flex; }
    .family-os-soft-panel-toggle[aria-pressed="true"] {
      border-color: rgba(205,179,255,.7);
      background: rgba(66,45,72,.98);
    }
    @media (max-width:720px) {
      .family-os-soft-actions { right: 14px; bottom: 126px; gap: 6px; }
      .family-os-soft-launcher,
      .family-os-soft-panel-toggle { padding: 9px 12px; font-size: 10px; }
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
  document.documentElement.dataset.softPanelsHidden = String(hidden);
  if (!panelButton) return;
  panelButton.setAttribute('aria-pressed', String(hidden));
  panelButton.textContent = hidden ? '▣ Show Today panels' : '◫ Hide Today panels';
  panelButton.title = hidden
    ? 'Restore the Today dashboard panels.'
    : 'Hide the Today dashboard to view the Soft 3D dreamscape.';
}

function resetLauncher() {
  started = false;
  starting = false;
  panelsHidden = false;
  delete document.documentElement.dataset.softPanelsHidden;
  if (launchButton) {
    launchButton.disabled = false;
    launchButton.dataset.state = 'ready';
    launchButton.textContent = '🌸 Launch 3D Soft';
    launchButton.title = 'Load the animated Soft dreamscape. 3D is never started automatically.';
  }
  panelButton?.classList.remove('is-visible');
  if (panelButton) panelButton.setAttribute('aria-pressed', 'false');
}

function syncVisibility() {
  if (!actions) return;
  const isSoft = document.documentElement.dataset.theme === 'soft';
  const visible = isSoft && Boolean(findTodayHost());
  actions.classList.toggle('is-visible', visible);
  if (!isSoft && (started || starting || panelsHidden)) resetLauncher();
}

function queueSync() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    syncQueued = false;
    syncVisibility();
  });
}

async function launchSoft() {
  if (starting || started || !launchButton) return;
  starting = true;
  launchButton.disabled = true;
  launchButton.dataset.state = 'starting';
  launchButton.textContent = '◌ Creating dreamscape…';

  try {
    if (!webGL2Available()) throw new Error('WebGL 2 is not available in this browser.');
    if (document.documentElement.dataset.theme !== 'soft') throw new Error('Switch to Soft theme first.');
    if (!findTodayHost()) throw new Error('Open the Today dashboard first.');

    await import('./soft3DExperience.css');
    const { launchSoft3DExperience } = await import('./soft3DExperience');
    if (document.documentElement.dataset.theme !== 'soft' || !findTodayHost()) {
      resetLauncher();
      return;
    }
    await launchSoft3DExperience();

    if (document.documentElement.dataset.theme !== 'soft') {
      resetLauncher();
      return;
    }

    started = true;
    launchButton.dataset.state = 'active';
    launchButton.textContent = '✓ Soft 3D active';
    launchButton.title = 'Soft 3D is active. Switch themes or refresh to close it.';
    panelButton?.classList.add('is-visible');
    setPanelsHidden(false);
  } catch (error) {
    console.error('Family OS Soft 3D launch failed.', error);
    starting = false;
    launchButton.disabled = false;
    launchButton.dataset.state = 'error';
    launchButton.textContent = '⚠ Soft 3D unavailable · retry';
    launchButton.title = error instanceof Error ? error.message : 'Soft 3D could not start.';
    return;
  }

  starting = false;
}

export function installSoft3DLauncher() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  addStyles();

  actions = document.createElement('div');
  actions.className = 'family-os-soft-actions';

  panelButton = document.createElement('button');
  panelButton.type = 'button';
  panelButton.className = 'family-os-soft-panel-toggle';
  panelButton.setAttribute('aria-pressed', 'false');
  panelButton.textContent = '◫ Hide Today panels';
  panelButton.addEventListener('click', () => setPanelsHidden(!panelsHidden));

  launchButton = document.createElement('button');
  launchButton.type = 'button';
  launchButton.className = 'family-os-soft-launcher';
  launchButton.dataset.state = 'ready';
  launchButton.textContent = '🌸 Launch 3D Soft';
  launchButton.title = 'Load the animated Soft dreamscape. 3D is never started automatically.';
  launchButton.addEventListener('click', () => void launchSoft());

  actions.append(panelButton, launchButton);
  document.body.appendChild(actions);

  const themeObserver = new MutationObserver(queueSync);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('click', queueSync, true);
  document.addEventListener('change', queueSync, true);
  window.addEventListener('family-os:app-ready', queueSync);
  window.addEventListener('family-os:soft-3d-stopped', resetLauncher);
  queueSync();
}
