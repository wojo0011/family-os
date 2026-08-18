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
  if (document.getElementById('family-os-nature-launcher-styles')) return;
  const style = document.createElement('style');
  style.id = 'family-os-nature-launcher-styles';
  style.textContent = `
    .family-os-nature-actions {
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
    .family-os-nature-actions.is-visible { display: flex; }
    .family-os-nature-launcher,
    .family-os-nature-panel-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(101,217,154,.34);
      border-radius: 999px;
      padding: 10px 15px;
      background: rgba(8,31,20,.92);
      color: #f3fff7;
      box-shadow: 0 14px 34px rgba(0,0,0,.3);
      backdrop-filter: blur(14px);
      font: 800 11px/1 system-ui, sans-serif;
      cursor: pointer;
      transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
    }
    .family-os-nature-launcher:hover:not(:disabled),
    .family-os-nature-panel-toggle:hover:not(:disabled) {
      transform: translateY(-1px);
      border-color: rgba(142,231,197,.7);
      background: rgba(14,48,31,.96);
    }
    .family-os-nature-launcher:disabled { cursor: default; opacity: .82; }
    .family-os-nature-launcher[data-state="active"] {
      border-color: rgba(222,198,110,.48);
      background: rgba(18,52,35,.96);
    }
    .family-os-nature-panel-toggle { display: none; }
    .family-os-nature-panel-toggle.is-visible { display: inline-flex; }
    .family-os-nature-panel-toggle[aria-pressed="true"] {
      border-color: rgba(142,231,197,.62);
      background: rgba(20,58,39,.98);
    }
    @media (max-width:720px) {
      .family-os-nature-actions { right: 14px; bottom: 126px; gap: 6px; }
      .family-os-nature-launcher,
      .family-os-nature-panel-toggle { padding: 9px 12px; font-size: 10px; }
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
  document.documentElement.dataset.naturePanelsHidden = String(hidden);
  if (!panelButton) return;
  panelButton.setAttribute('aria-pressed', String(hidden));
  panelButton.textContent = hidden ? '▣ Show Today panels' : '◫ Hide Today panels';
  panelButton.title = hidden
    ? 'Restore the Today dashboard panels.'
    : 'Hide the Today dashboard to view the Nature 3D scene.';
}

function resetLauncher() {
  started = false;
  starting = false;
  panelsHidden = false;
  delete document.documentElement.dataset.naturePanelsHidden;
  if (launchButton) {
    launchButton.disabled = false;
    launchButton.dataset.state = 'ready';
    launchButton.textContent = '🌲 Launch 3D Nature';
    launchButton.title = 'Load the animated Nature scene. 3D is never started automatically.';
  }
  panelButton?.classList.remove('is-visible');
  if (panelButton) panelButton.setAttribute('aria-pressed', 'false');
}

function syncVisibility() {
  if (!actions) return;
  const isNature = document.documentElement.dataset.theme === 'nature';
  const visible = isNature && Boolean(findTodayHost());
  actions.classList.toggle('is-visible', visible);
  if (!isNature && (started || starting || panelsHidden)) resetLauncher();
}

function queueSync() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    syncQueued = false;
    syncVisibility();
  });
}

async function launchNature() {
  if (starting || started || !launchButton) return;
  starting = true;
  launchButton.disabled = true;
  launchButton.dataset.state = 'starting';
  launchButton.textContent = '◌ Growing forest…';

  try {
    if (!webGL2Available()) throw new Error('WebGL 2 is not available in this browser.');
    if (document.documentElement.dataset.theme !== 'nature') throw new Error('Switch to Nature theme first.');
    if (!findTodayHost()) throw new Error('Open the Today dashboard first.');

    await import('./nature3DExperience.css');
    const { launchNature3DExperience } = await import('./nature3DExperience');
    if (document.documentElement.dataset.theme !== 'nature' || !findTodayHost()) {
      resetLauncher();
      return;
    }
    await launchNature3DExperience();

    if (document.documentElement.dataset.theme !== 'nature') {
      resetLauncher();
      return;
    }

    started = true;
    launchButton.dataset.state = 'active';
    launchButton.textContent = '✓ Nature 3D active';
    launchButton.title = 'Nature 3D is active. Switch themes or refresh to close it.';
    panelButton?.classList.add('is-visible');
    setPanelsHidden(false);
  } catch (error) {
    console.error('Family OS Nature 3D launch failed.', error);
    starting = false;
    launchButton.disabled = false;
    launchButton.dataset.state = 'error';
    launchButton.textContent = '⚠ Nature 3D unavailable · retry';
    launchButton.title = error instanceof Error ? error.message : 'Nature 3D could not start.';
    return;
  }

  starting = false;
}

export function installNature3DLauncher() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  addStyles();

  actions = document.createElement('div');
  actions.className = 'family-os-nature-actions';

  panelButton = document.createElement('button');
  panelButton.type = 'button';
  panelButton.className = 'family-os-nature-panel-toggle';
  panelButton.setAttribute('aria-pressed', 'false');
  panelButton.textContent = '◫ Hide Today panels';
  panelButton.addEventListener('click', () => setPanelsHidden(!panelsHidden));

  launchButton = document.createElement('button');
  launchButton.type = 'button';
  launchButton.className = 'family-os-nature-launcher';
  launchButton.dataset.state = 'ready';
  launchButton.textContent = '🌲 Launch 3D Nature';
  launchButton.title = 'Load the animated Nature scene. 3D is never started automatically.';
  launchButton.addEventListener('click', () => void launchNature());

  actions.append(panelButton, launchButton);
  document.body.appendChild(actions);

  const themeObserver = new MutationObserver(queueSync);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('click', queueSync, true);
  document.addEventListener('change', queueSync, true);
  window.addEventListener('family-os:app-ready', queueSync);
  window.addEventListener('family-os:nature-3d-stopped', resetLauncher);
  queueSync();
}
