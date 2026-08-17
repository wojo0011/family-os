const THEME_VALUES = new Set(['midnight', 'space', 'nature', 'soft']);

let installed = false;
let userSelectedTheme = false;
let syncingDefault = false;

function isThemeSelect(value: EventTarget | null): value is HTMLSelectElement {
  if (!(value instanceof HTMLSelectElement)) return false;
  const values = Array.from(value.options).map(option => option.value);
  return values.includes('space') && values.includes('midnight');
}

function syncSettingsSelectToSpace() {
  if (userSelectedTheme || syncingDefault) return;

  const themeSelect = Array.from(document.querySelectorAll('select')).find(isThemeSelect);
  if (!themeSelect || themeSelect.value === 'space') return;

  syncingDefault = true;
  themeSelect.value = 'space';
  themeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  syncingDefault = false;
  userSelectedTheme = true;
}

/**
 * Family OS currently keeps theme selection in React component state.
 * Until settings persistence is moved into the private Drive appDataFolder,
 * this bootstrap makes Space the true first-run default without storing
 * preferences in localStorage.
 */
export function installSpaceThemeDefault() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  // Paint the first frame as Space before React finishes mounting.
  document.documentElement.dataset.theme = 'space';

  document.addEventListener('change', event => {
    if (!syncingDefault && isThemeSelect(event.target)) {
      userSelectedTheme = true;
    }
  }, true);

  const observer = new MutationObserver(() => {
    // App.tsx currently initializes its theme state to midnight. On first run,
    // keep the DOM on Space until the Settings select mounts and we can sync
    // React's state through its own change handler.
    if (!userSelectedTheme && document.documentElement.dataset.theme === 'midnight') {
      document.documentElement.dataset.theme = 'space';
    }
    syncSettingsSelectToSpace();
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
    childList: true,
    subtree: true,
  });

  queueMicrotask(syncSettingsSelectToSpace);
}
