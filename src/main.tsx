import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installWeatherIconCompatibility } from './weatherIconCompatibility';
import { installSpaceThemeDefault } from './spaceThemeDefault';
import { installThemeFavicon } from './themeFavicon';
import { installSpaceExperience } from './spaceExperience';
import { installSpacePanelToggle } from './spacePanelToggle';
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
installSpacePanelToggle();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Family OS root element is missing.');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

function installHeavySpaceEnhancements() {
  try {
    // One WebGL renderer only. Earth/Mars will be merged into this scene rather
    // than starting a second renderer/canvas, which was exhausting GPU resources
    // and making some browsers unresponsive.
    installSpaceExperience();
  } catch (error) {
    console.error('Family OS moon-base renderer could not start.', error);
  }
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
// loader is dismissed. Weather and Three.js are enhancements and are not part
// of the loader's critical path.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent('family-os:app-ready'));
    scheduleHeavySpaceEnhancements();
  });
});
