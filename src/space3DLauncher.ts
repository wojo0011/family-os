let installed = false;
let starting = false;
let started = false;
let panelsHidden = false;
let button: HTMLButtonElement | null = null;
let panelButton: HTMLButtonElement | null = null;

function addStyles() {
  if (document.getElementById('family-os-3d-launcher-styles')) return;
  const style = document.createElement('style');
  style.id = 'family-os-3d-launcher-styles';
  style.textContent = `
    .family-os-space-actions {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 60;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
      max-width: min(92vw, 520px);
    }
    .family-os-3d-launcher,
    .family-os-scene-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(164,148,255,.32);
      border-radius: 999px;
      padding: 10px 15px;
      background: rgba(11,14,38,.9);
      color: #f7f8ff;
      box-shadow: 0 14px 34px rgba(0,0,0,.34);
      backdrop-filter: blur(14px);
      font: 800 11px/1 system-ui, sans-serif;
      cursor: pointer;
      transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
    }
    .family-os-3d-launcher:hover:not(:disabled),
    .family-os-scene-toggle:hover:not(:disabled) {
      transform: translateY(-1px);
      border-color: rgba(113,220,255,.55);
    }
    .family-os-3d-launcher:disabled { cursor: default; opacity: .82; }
    .family-os-3d-launcher[data-state="active"] {
      border-color: rgba(113,220,255,.5);
      background: rgba(18,34,56,.92);
    }
    .family-os-scene-toggle {
      display: none;
      border-color: rgba(113,220,255,.28);
    }
    .family-os-scene-toggle.is-visible { display: inline-flex; }
    .family-os-scene-toggle[aria-pressed="true"] {
      background: rgba(30,48,70,.95);
      border-color: rgba(113,220,255,.55);
    }
    @media (max-width:720px) {
      .family-os-space-actions { right: 14px; bottom: 78px; gap: 6px; }
      .family-os-3d-launcher,
      .family-os-scene-toggle { padding: 9px 12px; font-size: 10px; }
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
  document.documentElement.dataset.spacePanelsHidden = String(hidden);
  if (!panelButton) return;
  panelButton.setAttribute('aria-pressed', String(hidden));
  panelButton.textContent = hidden ? '▣ Show Today panels' : '◫ Hide Today panels';
  panelButton.title = hidden
    ? 'Restore the Today dashboard panels.'
    : 'Hide the Today dashboard panels to view the moon-base background.';
}

function showPanelToggle() {
  if (!panelButton) return;
  panelButton.classList.add('is-visible');
  setPanelsHidden(false);
}

async function launch3D() {
  if (starting || started || !button) return;
  starting = true;
  button.disabled = true;
  button.dataset.state = 'starting';
  button.textContent = '◌ Launching 3D…';

  try {
    if (!webGL2Available()) throw new Error('WebGL 2 is not available in this browser.');

    // Switch the current visual session to Space without involving app startup.
    document.documentElement.dataset.theme = 'space';

    // Everything below is deliberately lazy. The stable dashboard never
    // downloads Three.js or the textured planet layers until the user opts in.
    await Promise.all([
      import('./space-today.css'),
      import('./space-experience.css'),
      import('./spacePlanetBackdrop.css'),
    ]);

    const [{ installSpaceExperience }, { installSpacePlanetBackdrop }] = await Promise.all([
      import('./spaceExperience'),
      import('./spacePlanetBackdrop'),
    ]);

    // One WebGL renderer only: moon terrain, rover and astronaut stay in the
    // existing scene. Earth/Mars are layered DOM textures mounted into that same
    // background layer, avoiding the second WebGL canvas that caused crashes.
    installSpaceExperience();
    installSpacePlanetBackdrop();

    started = true;
    button.dataset.state = 'active';
    button.textContent = '✓ 3D Moon-Base active';
    button.title = '3D is active. Refresh the page to return to the lightweight dashboard.';
    showPanelToggle();
  } catch (error) {
    console.error('Family OS 3D launch failed.', error);
    starting = false;
    button.disabled = false;
    button.dataset.state = 'error';
    button.textContent = '⚠ 3D unavailable · retry';
    button.title = error instanceof Error ? error.message : '3D renderer could not start.';
    return;
  }

  starting = false;
}

export function installSpace3DLauncher() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  addStyles();

  const actions = document.createElement('div');
  actions.className = 'family-os-space-actions';

  panelButton = document.createElement('button');
  panelButton.type = 'button';
  panelButton.className = 'family-os-scene-toggle';
  panelButton.setAttribute('aria-pressed', 'false');
  panelButton.textContent = '◫ Hide Today panels';
  panelButton.addEventListener('click', () => setPanelsHidden(!panelsHidden));

  button = document.createElement('button');
  button.type = 'button';
  button.className = 'family-os-3d-launcher';
  button.dataset.state = 'ready';
  button.textContent = '🌕 Launch 3D Space';
  button.title = 'Load the interactive moon-base scene. 3D is never started automatically.';
  button.addEventListener('click', () => void launch3D());

  actions.append(panelButton, button);
  document.body.appendChild(actions);
}
