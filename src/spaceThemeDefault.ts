let installed = false;
let userSelectedTheme = false;

/**
 * Lightweight first-run Space paint. React still owns subsequent theme changes.
 * This deliberately avoids MutationObserver/subtree scanning during startup.
 */
export function installSpaceThemeDefault() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  document.documentElement.dataset.theme = 'space';

  document.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const values = Array.from(target.options).map(option => option.value);
    if (values.includes('space') && values.includes('midnight')) {
      userSelectedTheme = true;
    }
  }, true);

  // React currently initializes its theme state separately. Re-assert Space once
  // after the initial effect cycle, then stop touching the theme unless the user
  // changes it through Settings.
  window.setTimeout(() => {
    if (!userSelectedTheme) document.documentElement.dataset.theme = 'space';
  }, 0);
}
