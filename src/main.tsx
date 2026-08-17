import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installWeatherIconCompatibility } from './weatherIconCompatibility';
import { installSpaceThemeDefault } from './spaceThemeDefault';
import { installThemeFavicon } from './themeFavicon';
import { installSpaceExperience } from './spaceExperience';
import './styles.css';
import './enhancements.css';
import './weather.css';
import './space-today.css';
import './space-experience.css';

installWeatherIconCompatibility();
installSpaceThemeDefault();
installThemeFavicon();
installSpaceExperience();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
