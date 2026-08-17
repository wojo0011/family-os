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

installWeatherIconCompatibility();
installSpaceThemeDefault();
installThemeFavicon();
installSpaceExperience();
installSpacePlanetExperience();

// The lens picker is React state, while the Three.js backdrop is deliberately
// decoupled from application data. Removing the tiny planet canvas after a lens
// click lets its mutation observer rebuild with the newly active Child/standard
// texture set without coupling the renderer to App.tsx.
document.addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof Element) || !target.closest('.lens-picker button')) return;
  requestAnimationFrame(() => document.querySelector('.space-planet-canvas')?.remove());
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
