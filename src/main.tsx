import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installWeatherIconCompatibility } from './weatherIconCompatibility';
import { installSpaceThemeDefault } from './spaceThemeDefault';
import { installThemeFavicon } from './themeFavicon';
import { installSpaceExperience } from './spaceExperience';
import { installSpacePlanetExperience } from './spacePlanetExperience';
import './styles.css';
import './enhancements.css';
import './weather.css';
import './space-today.css';
import './space-experience.css';
import './space-planets.css';

// Lightweight boot helpers are safe before the first React paint.
installWeatherIconCompatibility();
installSpaceThemeDefault();
installThemeFavicon();

// The lens picker is React state, while the Three.js backdrop is deliberately
// decoupled from application data. Removing the small planet canvas after a lens
// click lets its observer rebuild with the Child/standard texture set.
document.addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof Element) || !target.closest('.lens-picker button')) return;
  requestAnimationFrame(() => document.querySelector('.space-planet-canvas')?.remove());
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Family OS root element is missing.');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

function installHeavySpaceEnhancements() {
  try {
    installSpaceExperience();
  } catch (error) {
    console.error('Family OS moon-base renderer could not start.', error);
  }

  // Let the base moon scene establish its canvas before loading the additional
  // textured Earth/Mars renderer. This prevents two WebGL contexts from
  // competing during the first meaningful paint.
  window.setTimeout(() => {
    try {
      installSpacePlanetExperience();
    } catch (error) {
      console.error('Family OS planet renderer could not start.', error);
    }
  }, 420);
}

function scheduleHeavySpaceEnhancements() {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };

  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(installHeavySpaceEnhancements, { timeout: 1400 });
  } else {
    window.setTimeout(installHeavySpaceEnhancements, 320);
  }
}

// Two animation frames guarantee that the React shell has painted before the
// loader is dismissed. Weather, textures and Three.js are enhancements and are
// intentionally not part of the loader's critical path.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent('family-os:app-ready'));
    scheduleHeavySpaceEnhancements();
  });
});
