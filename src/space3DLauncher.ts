let installed = false;
let starting = false;
let started = false;
let button: HTMLButtonElement | null = null;

function addStyles() {
  if (document.getElementById('family-os-3d-launcher-styles')) return;
  const style = document.createElement('style');
  style.id = 'family-os-3d-launcher-styles';
  style.textContent = `
    .family-os-3d-launcher {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 60;
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
    }
    .family-os-3d-launcher:hover:not(:disabled) {
      transform: translateY(-1px);
      border-color: rgba(113,220,255,.55);
    }
    .family-os-3d-launcher:disabled { cursor: default; opacity: .82; }
    .family-os-3d-launcher[data-state="active"] {
      border-color: rgba(113,220,255,.5);
      background: rgba(18,34,56,.92);
    }
    @media (max-width:720px) {
      .family-os-3d-launcher { right: 14px; bottom: 78px; padding: 9px 12px; font-size: 10px; }
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

    // These assets are deliberately lazy. The safe dashboard never downloads
    // Three.js or the moon-base scene unless the user explicitly opts in.
    await Promise.all([
      import('./space-today.css'),
      import('./space-experience.css'),
    ]);
    const { installSpaceExperience } = await import('./spaceExperience');
    installSpaceExperience();

    started = true;
    button.dataset.state = 'active';
    button.textContent = '✓ 3D Moon-Base active';
    button.title = 'Refresh the page to return to the lightweight dashboard.';
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

  button = document.createElement('button');
  button.type = 'button';
  button.className = 'family-os-3d-launcher';
  button.dataset.state = 'ready';
  button.textContent = '🌕 Launch 3D Space';
  button.title = 'Load the interactive moon-base scene. 3D is never started automatically.';
  button.addEventListener('click', () => void launch3D());
  document.body.appendChild(button);
}
