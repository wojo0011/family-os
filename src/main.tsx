import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installWeatherIconCompatibility } from './weatherIconCompatibility';
import { installThemeFavicon } from './themeFavicon';
import './styles.css';
import './enhancements.css';
import './weather.css';

// Emergency recovery boot: render the application shell with no Three.js,
// no animated Space scene, no panel observer and no theme bootstrap observer.
// Decorative experiences can be reintroduced later behind explicit opt-in.
installWeatherIconCompatibility();
installThemeFavicon();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Family OS root element is missing.');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent('family-os:app-ready'));
  });
});
