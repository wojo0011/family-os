import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installWeatherIconCompatibility } from './weatherIconCompatibility';
import './styles.css';
import './enhancements.css';
import './weather.css';

installWeatherIconCompatibility();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
