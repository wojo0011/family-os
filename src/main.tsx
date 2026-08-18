import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installWeatherIconCompatibility } from './weatherIconCompatibility';
import { installSpaceThemeDefault } from './spaceThemeDefault';
import { installThemeFavicon } from './themeFavicon';
import './styles.css';
import './enhancements.css';
import './weather.css';
import './space-today.css';
import './space-experience.css';
import './space-planets.css';

// Recovery boot: keep startup deliberately lightweight. No Three.js/WebGL,
// texture loading, document-wide panel observers, or GPU animation loops are
// allowed to initialize here. The CSS/image Space scene remains available while
// the interactive 3D renderer is isolated for a later explicit opt-in path.
installWeatherIconCompatibility();
installSpaceThemeDefault();
installThemeFavicon();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Family OS root element is missing.');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Dismiss the fail-open loader as soon as the React shell has painted twice.
// Weather and all decorative scenes are non-critical enhancements.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent('family-os:app-ready'));
  });
});
