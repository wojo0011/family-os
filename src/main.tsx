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

installWeatherIconCompatibility();
installSpaceThemeDefault();
installThemeFavicon();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
